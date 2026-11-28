import type { CliOutputSegment } from '@ptah-extension/shared';
import {
  MAX_PENDING_TOOL_CALLS,
  MAX_TOOL_CALL_SUMMARY_TOOLS,
  cloneToolCallSummary,
  createToolCallSummary,
  pendingToolCallCount,
  recordToolCall,
  recordToolResult,
  releaseToolCallSummary,
} from './tool-call-summary';

describe('tool-call-summary', () => {
  it('counts every category, pairs results by toolCallId, and tracks errors and unknowns', () => {
    const summary = createToolCallSummary();

    const segments: CliOutputSegment[] = [
      {
        type: 'tool-call',
        content: '',
        toolCallId: 'c1',
        toolName: 'exec_command',
        toolInput: { cmd: 'rg needle src' },
      },
      { type: 'tool-result', content: 'ok', toolCallId: 'c1' },
      {
        type: 'tool-call',
        content: '',
        toolCallId: 'c2',
        toolName: 'Read',
        toolInput: { path: '/src/a.ts' },
      },
      { type: 'tool-result-error', content: 'enoent', toolCallId: 'c2' },
      {
        type: 'tool-call',
        content: '',
        toolCallId: 'c3',
        toolName: 'ptah_grep',
      },
      { type: 'tool-result-error', content: 'failed', toolCallId: 'c3' },
      {
        type: 'tool-call',
        content: '',
        toolCallId: 'c4',
        toolName: 'mcp__ptah__ptah_read_symbol',
      },
      { type: 'tool-result', content: 'symbol', toolCallId: 'c4' },
      {
        type: 'tool-call',
        content: '',
        toolCallId: 'c5',
        toolName: 'ToolSearch',
      },
      { type: 'tool-result', content: 'found', toolCallId: 'c5' },
      {
        type: 'tool-call',
        content: '',
        toolCallId: 'c6',
        toolName: 'mcp__github__list_issues',
      },
      { type: 'tool-result', content: '[]', toolCallId: 'c6' },
      {
        type: 'tool-call',
        content: '',
        toolCallId: 'c7',
        toolName: 'Glob',
      },
      {
        type: 'tool-call',
        content: '',
        toolCallId: 'c8',
        toolName: 'exec_command',
        toolInput: { cmd: 'git status --short' },
      },
      { type: 'tool-result', content: 'clean', toolCallId: 'c8' },
      // Unpaired result must be ignored cleanly.
      { type: 'tool-result', content: 'stray', toolCallId: 'missing' },
    ];

    for (const seg of segments) {
      if (seg.type === 'tool-call') recordToolCall(summary, seg);
      else recordToolResult(summary, seg);
    }

    expect(summary).toEqual({
      totalCalls: 8,
      ptahCalls: 2,
      nativeCalls: 5,
      otherMcpCalls: 1,
      discoveryCalls: 1,
      ptahErrors: 1,
      nativeErrors: 1,
      unknownOutcomes: 1,
      callsBeforeFirstPtahSuccess: 3,
      substitutableNative: {
        textSearch: 1,
        fileRead: 1,
        pathListing: 1,
        gitRead: 1,
      },
      byTool: {
        exec_command: { calls: 2, errors: 0 },
        Read: { calls: 1, errors: 1 },
        ptah_grep: { calls: 1, errors: 1 },
        mcp__ptah__ptah_read_symbol: { calls: 1, errors: 0 },
        ToolSearch: { calls: 1, errors: 0 },
        mcp__github__list_issues: { calls: 1, errors: 0 },
        Glob: { calls: 1, errors: 0 },
      },
      byToolOverflow: 0,
    });
  });

  it('keeps callsBeforeFirstPtahSuccess as null when no Ptah call succeeds', () => {
    const summary = createToolCallSummary();
    recordToolCall(summary, {
      type: 'tool-call',
      content: '',
      toolCallId: 'p1',
      toolName: 'ptah_grep',
    });
    recordToolResult(summary, {
      type: 'tool-result-error',
      content: 'err',
      toolCallId: 'p1',
    });
    recordToolCall(summary, {
      type: 'tool-call',
      content: '',
      toolCallId: 'n1',
      toolName: 'Read',
    });
    recordToolResult(summary, {
      type: 'tool-result',
      content: 'ok',
      toolCallId: 'n1',
    });

    expect(summary.callsBeforeFirstPtahSuccess).toBeNull();
    expect(summary.unknownOutcomes).toBe(0);
  });

  it('caps byTool at 100 distinct tool names and routes extra names to byToolOverflow', () => {
    const summary = createToolCallSummary();

    for (let i = 0; i < MAX_TOOL_CALL_SUMMARY_TOOLS + 5; i++) {
      const id = `call-${i}`;
      recordToolCall(summary, {
        type: 'tool-call',
        content: '',
        toolCallId: id,
        toolName: `custom_tool_${i}`,
      });
      recordToolResult(summary, {
        type: 'tool-result',
        content: 'ok',
        toolCallId: id,
      });
    }
    // Repeating one of the first 100 increments its own counter, not overflow.
    recordToolCall(summary, {
      type: 'tool-call',
      content: '',
      toolCallId: 'repeat-0',
      toolName: 'custom_tool_0',
    });

    expect(Object.keys(summary.byTool)).toHaveLength(
      MAX_TOOL_CALL_SUMMARY_TOOLS,
    );
    expect(summary.byTool['custom_tool_0']).toEqual({ calls: 2, errors: 0 });
    expect(summary.byToolOverflow).toBe(5);
    expect(summary.totalCalls).toBe(MAX_TOOL_CALL_SUMMARY_TOOLS + 6);
  });

  it('never leaks tool arguments, results, paths, or shell commands into serialized summary', () => {
    const secret = 'SYNTHETIC-PRIVACY-MARKER-9981';
    const summary = createToolCallSummary();

    recordToolCall(summary, {
      type: 'tool-call',
      content: secret,
      toolCallId: 's1',
      toolName: 'exec_command',
      toolArgs: `cat /tmp/${secret}/file.txt`,
      toolInput: { command: `grep ${secret} /secret/path/${secret}` },
    });
    recordToolResult(summary, {
      type: 'tool-result-error',
      content: `result containing ${secret}`,
      toolCallId: 's1',
    });

    const serialized = JSON.stringify(cloneToolCallSummary(summary));
    expect(serialized).not.toContain(secret);
    expect(summary.substitutableNative.textSearch).toBe(1);
    expect(summary.nativeErrors).toBe(1);
  });

  it('normalizes sensitive vendor tool names into fixed buckets rather than storing verbatim or truncated text', () => {
    const summary = createToolCallSummary();
    const longName = `ptah_${'z'.repeat(495)}`;
    const unsafe = [
      'Run: cat C:/secret/file.txt',
      'bash -c "curl https://evil.example/a"',
      longName,
      'Read\n/secret/path',
      'rëad_读取',
    ];
    for (const [index, toolName] of unsafe.entries()) {
      recordToolCall(summary, {
        type: 'tool-call',
        content: '',
        toolCallId: `u-${index}`,
        toolName,
      });
    }
    recordToolCall(summary, {
      type: 'tool-call',
      content: '',
      toolCallId: 'mcp-valid',
      toolName: 'mcp__github__list_issues',
    });
    recordToolCall(summary, {
      type: 'tool-call',
      content: '',
      toolCallId: 'mcp-unsafe',
      toolName: 'MCP(github/secret) run',
    });

    const json = JSON.stringify(cloneToolCallSummary(summary));
    expect(json).not.toContain('secret');
    expect(json).not.toContain('curl');
    expect(json).not.toContain('zzzz');
    expect(json).not.toContain('读取');
    expect(Object.keys(summary.byTool).sort()).toEqual([
      'mcp:other',
      'mcp__github__list_issues',
      'native:other',
      'ptah:other',
    ]);
  });

  it('bounds pending toolCallIds at 256, evicts oldest as unknownOutcomes, and releases state cleanly', () => {
    const summary = createToolCallSummary();
    for (let i = 0; i < MAX_PENDING_TOOL_CALLS + 10; i++) {
      recordToolCall(summary, {
        type: 'tool-call',
        content: '',
        toolCallId: `call-${i}`,
        toolName: 'Read',
      });
    }
    expect(pendingToolCallCount(summary)).toBe(MAX_PENDING_TOOL_CALLS);
    expect(summary.unknownOutcomes).toBe(MAX_PENDING_TOOL_CALLS + 10);

    // Evicted call-0 result is ignored; recent call settles.
    recordToolResult(summary, {
      type: 'tool-result',
      content: 'ok',
      toolCallId: 'call-0',
    });
    expect(summary.unknownOutcomes).toBe(MAX_PENDING_TOOL_CALLS + 10);

    releaseToolCallSummary(summary);
    expect(pendingToolCallCount(summary)).toBe(0);
  });

  it('keeps the first pending call on duplicate call ids, ignores settled results, and pairs missing ids only adjacently', () => {
    const summary = createToolCallSummary();

    recordToolCall(summary, {
      type: 'tool-call',
      content: '',
      toolCallId: 'x',
      toolName: 'ptah_grep',
    });
    recordToolCall(summary, {
      type: 'tool-call',
      content: '',
      toolCallId: 'x',
      toolName: 'Read',
    });
    recordToolResult(summary, {
      type: 'tool-result',
      content: 'ok',
      toolCallId: 'x',
    });
    // Second result for already-settled id 'x' counts as nothing.
    recordToolResult(summary, {
      type: 'tool-result-error',
      content: 'err',
      toolCallId: 'x',
    });

    // Unkeyed calls: first stays unknown because second call intervenes; second pairs with adjacent result.
    recordToolCall(summary, {
      type: 'tool-call',
      content: '',
      toolCallId: '',
      toolName: 'Read',
    });
    recordToolCall(summary, {
      type: 'tool-call',
      content: '',
      toolName: 'Glob',
    });
    recordToolResult(summary, {
      type: 'tool-result-error',
      content: 'err',
    });

    expect(summary.totalCalls).toBe(3);
    expect(summary.ptahCalls).toBe(1);
    expect(summary.ptahErrors).toBe(0);
    expect(summary.nativeCalls).toBe(2);
    expect(summary.nativeErrors).toBe(1);
    expect(summary.unknownOutcomes).toBe(1);
    expect(summary.callsBeforeFirstPtahSuccess).toBe(0);
    expect(summary.byTool).toEqual({
      ptah_grep: { calls: 1, errors: 0 },
      Read: { calls: 1, errors: 0 },
      Glob: { calls: 1, errors: 1 },
    });
  });

  it('computes callsBeforeFirstPtahSuccess in call order when results arrive out of order or a Ptah call never returns', () => {
    const outOfOrder = createToolCallSummary();
    recordToolCall(outOfOrder, {
      type: 'tool-call',
      content: '',
      toolCallId: 'r0',
      toolName: 'Read',
    });
    recordToolCall(outOfOrder, {
      type: 'tool-call',
      content: '',
      toolCallId: 'pA',
      toolName: 'ptah_grep',
    });
    recordToolCall(outOfOrder, {
      type: 'tool-call',
      content: '',
      toolCallId: 'r2',
      toolName: 'Glob',
    });
    recordToolCall(outOfOrder, {
      type: 'tool-call',
      content: '',
      toolCallId: 'pB',
      toolName: 'ptah_read_symbol',
    });
    recordToolResult(outOfOrder, {
      type: 'tool-result',
      content: 'ok',
      toolCallId: 'pB',
    });
    recordToolResult(outOfOrder, {
      type: 'tool-result',
      content: 'ok',
      toolCallId: 'pA',
    });
    expect(outOfOrder.callsBeforeFirstPtahSuccess).toBe(1);

    const unresolvedPtah = createToolCallSummary();
    recordToolCall(unresolvedPtah, {
      type: 'tool-call',
      content: '',
      toolCallId: 'r0',
      toolName: 'Read',
    });
    recordToolCall(unresolvedPtah, {
      type: 'tool-call',
      content: '',
      toolCallId: 'pA',
      toolName: 'ptah_grep',
    });
    recordToolCall(unresolvedPtah, {
      type: 'tool-call',
      content: '',
      toolCallId: 'r2',
      toolName: 'Glob',
    });
    recordToolCall(unresolvedPtah, {
      type: 'tool-call',
      content: '',
      toolCallId: 'pB',
      toolName: 'ptah_read_symbol',
    });
    recordToolResult(unresolvedPtah, {
      type: 'tool-result',
      content: 'ok',
      toolCallId: 'pB',
    });
    expect(unresolvedPtah.callsBeforeFirstPtahSuccess).toBe(3);
  });
});

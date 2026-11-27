import {
  MAX_PENDING_TOOL_CALLS,
  MAX_TOOL_CALL_SUMMARY_TOOLS,
  cloneToolCallSummary,
  createToolCallSummary,
  normalizeToolSummaryKey,
  pendingToolCallCount,
  recordToolCall,
  recordToolResult,
  releaseToolCallSummary,
  summarizeToolCallSegments,
} from './tool-call-summary';

describe('tool-call-summary (shared core)', () => {
  it('normalizes sensitive or malformed vendor tool names into fixed per-server buckets without truncation', () => {
    const summary = createToolCallSummary();
    const longName = `ptah_${'x'.repeat(495)}`;
    const adversarialNames = [
      'Run: cat C:/secret/file.txt',
      'bash -c "curl https://secret.example/token"',
      longName,
      'Read\n/Users/alice/secret.txt',
      'rëad_fïle_读取',
      '__proto__',
      '',
    ];

    for (const [index, toolName] of adversarialNames.entries()) {
      recordToolCall(summary, {
        type: 'tool-call',
        toolCallId: `adv-${index}`,
        toolName,
      });
    }
    // Valid mcp__server__tool and ptah_* identifiers stay intact.
    recordToolCall(summary, {
      type: 'tool-call',
      toolCallId: 'ok-1',
      toolName: 'mcp__github__list_issues',
    });
    recordToolCall(summary, {
      type: 'tool-call',
      toolCallId: 'ok-2',
      toolName: 'ptah_grep',
    });
    recordToolCall(summary, {
      type: 'tool-call',
      toolCallId: 'bad-mcp',
      toolName: 'MCP(github/secret) query',
    });

    const serialized = JSON.stringify(cloneToolCallSummary(summary));
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('curl');
    expect(serialized).not.toContain('alice');
    expect(serialized).not.toContain('读取');
    expect(serialized).not.toContain('rëad');
    expect(serialized).not.toContain('xxxx');
    expect(Object.keys(summary.byTool).sort()).toEqual([
      'mcp:other',
      'mcp__github__list_issues',
      'native:other',
      'ptah:other',
      'ptah_grep',
    ]);
    expect(summary.byTool['native:other']).toEqual({ calls: 6, errors: 0 });
    expect(summary.byTool['ptah:other']).toEqual({ calls: 1, errors: 0 });
    expect(summary.byTool['mcp:other']).toEqual({ calls: 1, errors: 0 });
    expect(normalizeToolSummaryKey('ptah_read_symbol', 'ptah')).toBe(
      'ptah_read_symbol',
    );
  });

  it('bounds the pending call-id map at MAX_PENDING_TOOL_CALLS and leaves evicted calls in unknownOutcomes', () => {
    const summary = createToolCallSummary();
    const total = MAX_PENDING_TOOL_CALLS + 20;

    for (let i = 0; i < total; i++) {
      recordToolCall(summary, {
        type: 'tool-call',
        toolCallId: `pending-${i}`,
        toolName: 'Read',
      });
    }

    expect(pendingToolCallCount(summary)).toBe(MAX_PENDING_TOOL_CALLS);
    expect(summary.unknownOutcomes).toBe(total);

    // Late result for an evicted oldest entry counts as nothing.
    recordToolResult(summary, {
      type: 'tool-result',
      toolCallId: 'pending-0',
    });
    expect(summary.unknownOutcomes).toBe(total);

    // Result for a retained recent entry settles normally.
    recordToolResult(summary, {
      type: 'tool-result-error',
      toolCallId: `pending-${total - 1}`,
    });
    expect(summary.unknownOutcomes).toBe(total - 1);
    expect(summary.nativeErrors).toBe(1);
    expect(pendingToolCallCount(summary)).toBe(MAX_PENDING_TOOL_CALLS - 1);

    releaseToolCallSummary(summary);
    expect(pendingToolCallCount(summary)).toBe(0);
  });

  it('ignores repeated pending call-id updates, already-settled results, and handles missing/empty ids adjacently', () => {
    const summary = createToolCallSummary();

    // First call wins while pending: ptah_grep(id=x), then Read(id=x), then result(id=x).
    recordToolCall(summary, {
      type: 'tool-call',
      toolCallId: 'x',
      toolName: 'ptah_grep',
    });
    recordToolCall(summary, {
      type: 'tool-call',
      toolCallId: 'x',
      toolName: 'Read',
    });
    recordToolResult(summary, {
      type: 'tool-result',
      toolCallId: 'x',
    });
    // Second result for already-settled id 'x' counts as nothing.
    recordToolResult(summary, {
      type: 'tool-result-error',
      toolCallId: 'x',
    });

    // Missing/empty ids: first has no adjacent result (stays unknown), second has adjacent error result.
    recordToolCall(summary, {
      type: 'tool-call',
      toolCallId: '',
      toolName: 'Read',
    });
    recordToolCall(summary, {
      type: 'tool-call',
      toolName: 'Glob',
    });
    recordToolResult(summary, {
      type: 'tool-result-error',
    });
    // Extra unkeyed result after pairing is ignored.
    recordToolResult(summary, {
      type: 'tool-result-error',
    });

    expect(summary).toEqual({
      totalCalls: 3,
      ptahCalls: 1,
      nativeCalls: 2,
      otherMcpCalls: 0,
      discoveryCalls: 0,
      ptahErrors: 0,
      nativeErrors: 1,
      unknownOutcomes: 1,
      callsBeforeFirstPtahSuccess: 0,
      substitutableNative: {
        textSearch: 0,
        fileRead: 1,
        pathListing: 1,
        gitRead: 0,
      },
      byTool: {
        ptah_grep: { calls: 1, errors: 0 },
        Read: { calls: 1, errors: 0 },
        Glob: { calls: 1, errors: 1 },
      },
      byToolOverflow: 0,
    });
  });

  it('computes callsBeforeFirstPtahSuccess in call order across out-of-order results and missing Ptah results', () => {
    const bothSucceed = summarizeToolCallSegments([
      { type: 'tool-call', toolCallId: 'n0', toolName: 'Read' },
      { type: 'tool-call', toolCallId: 'pA', toolName: 'ptah_grep' },
      { type: 'tool-call', toolCallId: 'n2', toolName: 'Glob' },
      { type: 'tool-call', toolCallId: 'pB', toolName: 'ptah_read_symbol' },
      // B returns first, then A returns later: A started earlier so count is 1.
      { type: 'tool-result', toolCallId: 'pB' },
      { type: 'tool-result', toolCallId: 'pA' },
    ]);
    expect(bothSucceed.callsBeforeFirstPtahSuccess).toBe(1);

    const earlierNeverReturns = summarizeToolCallSegments([
      { type: 'tool-call', toolCallId: 'n0', toolName: 'Read' },
      { type: 'tool-call', toolCallId: 'pA', toolName: 'ptah_grep' },
      { type: 'tool-call', toolCallId: 'n2', toolName: 'Glob' },
      { type: 'tool-call', toolCallId: 'pB', toolName: 'ptah_read_symbol' },
      // A never gets a result, B succeeds -> 3 calls started before B.
      { type: 'tool-result', toolCallId: 'pB' },
    ]);
    expect(earlierNeverReturns.callsBeforeFirstPtahSuccess).toBe(3);
    expect(earlierNeverReturns.unknownOutcomes).toBe(3);
  });

  it('caps distinct byTool entries at MAX_TOOL_CALL_SUMMARY_TOOLS', () => {
    const segments = Array.from(
      { length: MAX_TOOL_CALL_SUMMARY_TOOLS + 3 },
      (_, index) => ({
        type: 'tool-call' as const,
        toolCallId: `t-${index}`,
        toolName: `custom_${index}`,
      }),
    );
    const summary = summarizeToolCallSegments(segments);
    expect(Object.keys(summary.byTool)).toHaveLength(MAX_TOOL_CALL_SUMMARY_TOOLS);
    expect(summary.byToolOverflow).toBe(3);
  });

  it('maintains totalCalls === ptahCalls + nativeCalls + otherMcpCalls across mixed discovery and mutating calls', () => {
    const summary = summarizeToolCallSegments([
      { type: 'tool-call', toolCallId: 'c1', toolName: 'ptah_grep' },
      { type: 'tool-result', toolCallId: 'c1' },
      { type: 'tool-call', toolCallId: 'c2', toolName: 'ToolSearch' },
      { type: 'tool-result', toolCallId: 'c2' },
      { type: 'tool-call', toolCallId: 'c3', toolName: 'mcp__docs__list_tools' },
      { type: 'tool-result', toolCallId: 'c3' },
      { type: 'tool-call', toolCallId: 'c4', toolName: 'mcp__my_server__do_thing' },
      { type: 'tool-result', toolCallId: 'c4' },
      { type: 'tool-call', toolCallId: 'c5', toolName: 'Bash', toolInput: { command: "sed -i 's/a/b/' f.txt" } },
      { type: 'tool-result', toolCallId: 'c5' },
      { type: 'tool-call', toolCallId: 'c6', toolName: 'Bash', toolInput: { command: 'git show HEAD' } },
      { type: 'tool-result', toolCallId: 'c6' },
    ]);

    expect(summary.totalCalls).toBe(6);
    expect(summary.ptahCalls).toBe(1);
    expect(summary.nativeCalls).toBe(3);
    expect(summary.otherMcpCalls).toBe(2);
    expect(summary.discoveryCalls).toBe(2);
    expect(summary.substitutableNative.gitRead).toBe(1);
    expect(summary.substitutableNative.fileRead).toBe(0);
    expect(summary.ptahCalls + summary.nativeCalls + summary.otherMcpCalls).toBe(
      summary.totalCalls,
    );
  });
});

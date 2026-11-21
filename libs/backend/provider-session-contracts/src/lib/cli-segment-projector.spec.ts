import type { ProviderSessionEventBody } from './provider-session-events';
import { projectToCliSegments } from './cli-segment-projector';

describe('projectToCliSegments', () => {
  it('projects text and reasoning to text and thinking rows', () => {
    expect(
      projectToCliSegments({ type: 'textDelta', itemId: 'm1', delta: 'Hi' }),
    ).toEqual([{ type: 'text', content: 'Hi' }]);
    expect(
      projectToCliSegments({
        type: 'reasoning',
        itemId: 't1',
        text: 'Thinking',
        phase: 'delta',
      }),
    ).toEqual([{ type: 'thinking', content: 'Thinking' }]);
  });

  it('projects a started tool with its input as JSON arguments', () => {
    expect(
      projectToCliSegments({
        type: 'toolStarted',
        toolId: 'read-1',
        toolName: 'Read file',
        kind: 'read',
        input: { path: 'a.ts' },
      }),
    ).toEqual([
      {
        type: 'tool-call',
        content: '',
        toolCallId: 'read-1',
        toolName: 'Read file',
        toolArgs: '{"path":"a.ts"}',
        toolInput: { path: 'a.ts' },
      },
    ]);
  });

  it('projects a completed execute tool to a command row with its exit code', () => {
    expect(
      projectToCliSegments({
        type: 'toolCompleted',
        toolId: 'run-1',
        status: 'completed',
        kind: 'execute',
        output: 'ok',
        exitCode: 0,
      }),
    ).toEqual([
      {
        type: 'command',
        content: 'ok',
        toolCallId: 'run-1',
        toolName: 'command',
        exitCode: 0,
      },
    ]);
  });

  it.each([
    ['completed', 'tool-result'],
    ['failed', 'tool-result-error'],
    ['cancelled', 'tool-result-error'],
  ] as const)('projects a %s tool to a %s row', (status, type) => {
    expect(
      projectToCliSegments({
        type: 'toolCompleted',
        toolId: 'search-1',
        status,
        toolName: 'Search',
        kind: 'search',
        output: 'out',
        exitCode: 3,
      }),
    ).toEqual([
      {
        type,
        content: 'out',
        toolCallId: 'search-1',
        toolName: 'Search',
        exitCode: undefined,
      },
    ]);
  });

  it('projects file changes, plans, infos and errors', () => {
    expect(
      projectToCliSegments({
        type: 'fileChange',
        path: 'a.ts',
        changeKind: 'added',
      }),
    ).toEqual([{ type: 'file-change', content: 'a.ts', changeKind: 'added' }]);
    expect(
      projectToCliSegments({
        type: 'plan',
        entries: [
          { content: 'One', status: 'done' },
          { content: 'Two', status: 'pending' },
        ],
      }),
    ).toEqual([{ type: 'info', content: '[done] One\n[pending] Two' }]);
    expect(projectToCliSegments({ type: 'info', message: 'note' })).toEqual([
      { type: 'info', content: 'note' },
    ]);
    expect(
      projectToCliSegments({
        type: 'error',
        error: { code: 'turn-failed', message: 'broke' },
      }),
    ).toEqual([{ type: 'error', content: 'broke' }]);
  });

  it('projects reported usage to a usage row with turn telemetry', () => {
    const [row] = projectToCliSegments({
      type: 'usage',
      provider: 'Grok',
      turnId: 'sess:run:1',
      usage: { inputTokens: 10, outputTokens: 4, model: 'grok-4.7' },
    });
    expect(row).toMatchObject({
      type: 'info',
      content: 'Grok turn usage.',
      usage: { inputTokens: 10, outputTokens: 4, model: 'grok-4.7' },
      turnTelemetry: {
        status: 'reported',
        usage: { turnId: 'sess:run:1', modelId: 'grok-4.7', inputTokens: 10 },
      },
    });
  });

  it('labels missing usage as unavailable telemetry with the provider fallback model', () => {
    const [row] = projectToCliSegments({
      type: 'usage',
      provider: 'Grok',
      turnId: 'sess:run:2',
    });
    expect(row).toEqual({
      type: 'info',
      content: 'Grok turn telemetry unavailable.',
      turnTelemetry: {
        status: 'unavailable',
        turnId: 'sess:run:2',
        modelId: 'Grok/unknown',
        source: 'sdk',
        reason: 'no-usage-event',
      },
    });
  });

  it('gives no lane row to replay, approval, mode, stderr and terminal events', () => {
    const silent: ProviderSessionEventBody[] = [
      { type: 'userText', itemId: 'u1', text: 'hello' },
      { type: 'toolUpdated', toolId: 't1' },
      {
        type: 'approvalRequested',
        request: { requestId: 'r1', title: 'Run' },
      },
      { type: 'approvalSettled', requestId: 'r1', decision: 'accept' },
      { type: 'modeChanged', mode: 'plan' },
      { type: 'configChanged' },
      { type: 'diagnostic', stream: 'stderr', line: 'warn' },
      { type: 'terminal', status: 'completed', disposition: 'reusable' },
    ];
    for (const event of silent) {
      expect(projectToCliSegments(event)).toEqual([]);
    }
  });

  it('maps an unknown event type to no rows instead of throwing', () => {
    const unknown = { type: 'somethingNew' } as unknown as ProviderSessionEventBody;
    expect(projectToCliSegments(unknown)).toEqual([]);
  });
});

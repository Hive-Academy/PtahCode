import type { SessionAgent } from '../../../services/session-agents/session-agent-roster';
import {
  agentListRow,
  inOutText,
  normalizeAgentKey,
  orderAgentList,
  type AgentUsageFigures,
} from './inspector-agent-list';

const NO_USAGE: AgentUsageFigures = {
  tokens: null,
  tokensPartial: false,
  cost: null,
  costPartial: false,
  costEstimated: true,
  input: null,
  output: null,
};

function row(
  key: string,
  status: SessionAgent['status'],
  kind: SessionAgent['kind'] = 'cli',
  usage: AgentUsageFigures = NO_USAGE,
) {
  return agentListRow({
    agent: {
      key,
      kind,
      name: key,
      cliId: null,
      agentType: null,
      status,
      startedAt: null,
      endedAt: null,
      activity: null,
      openRequestIds: [],
    },
    secondary: '',
    secondaryTitle: null,
    usage,
    durationMs: null,
    requests: [],
    tray: null,
    hasActions: false,
  });
}

describe('inspector agent list', () => {
  it('shows "Not priced" for a model without a published rate', () => {
    const unpriced = row('orchestrator', 'done', 'orchestrator', {
      ...NO_USAGE,
      tokens: 100,
      costEstimated: false,
      costNotPriced: true,
    });
    expect(unpriced.cost).toBe('Not priced');
    expect(unpriced.usageLabel).toContain('Cost not priced');
  });

  it('keeps a priced cost over the not-priced flag', () => {
    const priced = row('orchestrator', 'done', 'orchestrator', {
      ...NO_USAGE,
      cost: 0.25,
      costEstimated: false,
      costNotPriced: true,
    });
    expect(priced.cost).toBe('$0.25');
  });
  it('uses the role in the visible name and accessible label', () => {
    const result = agentListRow({
      agent: row('a', 'running').agent,
      name: 'Codex · reviewer',
      secondary: '',
      secondaryTitle: null,
      usage: NO_USAGE,
      durationMs: null,
      requests: [],
      tray: null,
      hasActions: false,
    });
    expect(result.name).toBe('Codex · reviewer');
    expect(result.ariaLabel).toContain('Codex · reviewer');
    expect(result.usageLabel).toContain('Codex · reviewer');
  });
  it('shows elapsed time without converting an unknown duration to zero', () => {
    expect(row('a', 'running').time).toBe('--:--');
    const timed = agentListRow({
      agent: row('b', 'done').agent,
      secondary: '',
      secondaryTitle: null,
      usage: NO_USAGE,
      durationMs: 65_000,
      requests: [],
      tray: null,
      hasActions: false,
    });
    expect(timed.time).toBe('1m 5s');
  });
  it('formats in / out compactly and keeps one unknown side as a dash', () => {
    expect(inOutText(1_050_000, 48_000)).toBe('In 1.1M · Out 48.0k');
    expect(inOutText(null, 300)).toBe('In — · Out 300');
    expect(inOutText(null, null)).toBeNull();
  });

  it('orders the Orchestrator, needs you, live, then remaining lanes in store order', () => {
    const ordered = orderAgentList(
      row('orchestrator', 'done', 'orchestrator'),
      [
        row('a', 'done'),
        row('b', 'running'),
        row('c', 'queued'),
        row('d', 'failed'),
        row('e', 'waiting'),
        {
          ...row('f', 'done'),
          requests: [{
            agentId: 'f',
            requestId: 'permission',
            kind: 'permission',
            source: 'lane',
            ownerKey: 'f',
            ownerName: 'f',
            toolName: null,
            command: 'Run',
            questionPreview: null,
            timestamp: 0,
          }],
        },
        row('g', 'starting'),
      ],
    );
    expect(ordered.map((r) => r.key)).toEqual([
      'orchestrator',
      'e',
      'f',
      'b',
      'c',
      'g',
      'a',
      'd',
    ]);
  });

  it('normalizes a moved sub-agent and falls back to the Orchestrator', () => {
    expect(normalizeAgentKey('sub:x', ['orchestrator', 'bg:x'])).toBe('bg:x');
    expect(normalizeAgentKey('bg:x', ['orchestrator', 'sub:x'])).toBe('sub:x');
    expect(normalizeAgentKey('cli:gone', ['orchestrator'])).toBe(
      'orchestrator',
    );
  });

  it('reports unknown tokens and their in / out tooltip as not reported', () => {
    expect(row('a', 'done').tokens).toBe('—');
    expect(row('a', 'done').tokensTitle).toBe('not reported');
  });
});

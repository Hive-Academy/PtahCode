import type { MonitoredAgent } from '@ptah-extension/chat-streaming';
import { buildSessionAgentRoster } from './session-agent-roster';
import type { SubagentRecord } from '@ptah-extension/chat-streaming';

function lane(segments: MonitoredAgent['segments']): MonitoredAgent {
  return {
    agentId: 'lane-1', cli: 'codex', task: 'Review', status: 'running',
    startedAt: 1000, parentSessionId: 'session-1', stdout: '', stderr: '',
    expanded: true, segments, streamEvents: [], streamRevision: 0,
    permissionQueue: [],
  };
}

describe('CLI roster activity', () => {
  it('carries subagent start and completion times into its row', () => {
    const subagent: SubagentRecord = {
      parentToolUseId: 'tool-one', parentSessionId: 'session-1', status: 'completed',
      startedAt: 1_000, completedAt: 4_000,
    };
    const rows = buildSessionAgentRoster({
      sessionId: 'session-1', tabStatus: 'streaming', subagents: [subagent],
      cliAgents: [], backgroundAgents: [], permissions: [], questions: [],
    });
    expect(rows[1].startedAt).toBe(1_000);
    expect(rows[1].endedAt).toBe(4_000);
  });
  it('uses the last non-usage line even when newer segments only report usage', () => {
    const rows = buildSessionAgentRoster({
      sessionId: 'session-1', tabStatus: 'streaming', subagents: [],
      cliAgents: [lane([
        { type: 'info', content: 'Reading files' },
        { type: 'info', content: 'Usage: 11869 input', usage: { inputTokens: 11869, outputTokens: 30 } },
      ])],
      backgroundAgents: [], permissions: [], questions: [],
    });
    expect(rows[1].activity).toBe('Reading files');
  });
  it('never shows the user echo as lane activity', () => {
    const rows = buildSessionAgentRoster({
      sessionId: 'session-1', tabStatus: 'streaming', subagents: [],
      cliAgents: [lane([
        { type: 'info', content: 'Reading files' },
        { type: 'user', content: 'please also check the tests', sentAt: 5 },
      ])],
      backgroundAgents: [], permissions: [], questions: [],
    });
    expect(rows[1].activity).toBe('Reading files');
  });
});

describe('CLI lane status and timer (live test D9, D10)', () => {
  const roster = (agent: MonitoredAgent) => buildSessionAgentRoster({
    sessionId: 'session-1', tabStatus: 'streaming', subagents: [],
    cliAgents: [agent], backgroundAgents: [], permissions: [], questions: [],
  })[1];

  it('times the current turn, not the record start, so idle gaps between turns do not count', () => {
    const row = roster({ ...lane([]), startedAt: 1_000, turnStartedAt: 60_000 });
    expect(row.startedAt).toBe(60_000);
    expect(roster({ ...lane([]), startedAt: 1_000 }).startedAt).toBe(1_000);
  });

  it('reads stopping while a user stop waits for the process exit, then stopped', () => {
    expect(roster({ ...lane([]), status: 'stopped', stopRequestedAt: 5, stopAcknowledged: true }).status).toBe('stopping');
    expect(roster({ ...lane([]), status: 'running', stopRequestedAt: 5 }).status).toBe('stopping');
    expect(roster({ ...lane([]), status: 'stopped', stoppedByUser: true }).status).toBe('stopped');
  });

  it('reads a user stop that an older host reports as failed as stopped', () => {
    expect(roster({ ...lane([]), status: 'failed', stoppedByUser: true }).status).toBe('stopped');
    expect(roster({ ...lane([]), status: 'failed' }).status).toBe('failed');
  });
});

describe('roster order', () => {
  function laneWith(agentId: string, status: MonitoredAgent['status']): MonitoredAgent {
    return { ...lane([]), agentId, status };
  }

  it('keeps the Orchestrator first and moves failed agents to the end in stable order', () => {
    const rows = buildSessionAgentRoster({
      sessionId: 'session-1', tabStatus: 'streaming', subagents: [],
      cliAgents: [
        laneWith('lane-a', 'failed'),
        laneWith('lane-b', 'completed'),
        laneWith('lane-c', 'failed'),
        laneWith('lane-d', 'running'),
      ],
      backgroundAgents: [], permissions: [], questions: [],
    });
    expect(rows.map((row) => row.key)).toEqual([
      'orchestrator',
      expect.stringContaining('lane-b'),
      expect.stringContaining('lane-d'),
      expect.stringContaining('lane-a'),
      expect.stringContaining('lane-c'),
    ]);
    expect(rows.slice(-2).map((row) => row.status)).toEqual(['failed', 'failed']);
  });
});

describe('background shell is not a roster agent', () => {
  it('(d) CLI lane row remains beside a real subagent and no "Sub-agent" row appears', () => {
    // A background shell completion no longer creates a SubagentRecord, so
    // the store hands the roster only the real subagent and the CLI lane.
    const subagent: SubagentRecord = {
      parentToolUseId: 'toolu_agent', parentSessionId: 'session-1',
      status: 'completed', agentType: 'Explore', startedAt: 1_000,
      completedAt: 2_000, totalTokens: 500,
    };
    const rows = buildSessionAgentRoster({
      sessionId: 'session-1', tabStatus: 'streaming', subagents: [subagent],
      cliAgents: [lane([])], backgroundAgents: [], permissions: [], questions: [],
    });
    expect(rows.filter((row) => row.kind === 'cli')).toEqual([
      expect.objectContaining({ name: 'codex', cliId: 'codex' }),
    ]);
    expect(rows.find((row) => row.kind === 'subagent')).toMatchObject({
      name: 'Explore', agentType: 'Explore',
    });
    expect(rows.map((row) => row.name)).not.toContain('Sub-agent');
  });
});

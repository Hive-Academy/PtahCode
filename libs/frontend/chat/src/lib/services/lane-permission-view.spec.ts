import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  AgentMonitorStore,
  PermissionHandlerService,
  type MonitoredAgent,
} from '@ptah-extension/chat-streaming';
import type {
  AgentPermissionRequest,
  AskUserQuestionRequest,
} from '@ptah-extension/shared';
import { TabManagerService } from '@ptah-extension/chat-state';
import { AgentPermissionResponder } from './agent-permission-responder';
import { ChatStore } from './chat.store';
import {
  COPILOT_ALWAYS_ALLOW_ONCE_TEXT,
  LANE_ANSWER_REFUSED_TEXT,
  LanePermissionView,
  toLanePermissionRequest,
} from './lane-permission-view';

function permission(overrides: Partial<AgentPermissionRequest> = {}): AgentPermissionRequest {
  return {
    requestId: 'perm-1',
    agentId: 'lane-a',
    parentSessionId: 'session-1',
    laneGeneration: '2026-01-01T00:00:00.000Z',
    kind: 'shell',
    toolName: 'Bash',
    toolArgs: JSON.stringify({ command: 'npm run verify' }),
    description: 'Run verify',
    timestamp: 1,
    timeoutAt: 0,
    ...overrides,
  };
}

function question(id: string, agentId?: string): AskUserQuestionRequest {
  return {
    id,
    toolName: 'AskUserQuestion',
    questions: [{ question: 'Which target?', header: 'Target', options: [], multiSelect: false }],
    timestamp: 1,
    timeoutAt: 0,
    ...(agentId ? { agentId } : {}),
  };
}

function lane(queue: AgentPermissionRequest[], agentId = 'lane-a'): MonitoredAgent {
  return {
    agentId,
    cli: 'claude',
    displayName: 'Claude SDK lane',
    task: 'task',
    status: 'running',
    startedAt: Date.parse('2026-01-01T00:00:00.000Z'),
    stdout: '',
    stderr: '',
    expanded: true,
    segments: [],
    streamEvents: [],
    streamRevision: 0,
    permissionQueue: queue,
    parentSessionId: 'session-1',
  } as MonitoredAgent;
}

describe('toLanePermissionRequest', () => {
  it('maps a lane request to the main chat card request', () => {
    expect(toLanePermissionRequest(permission())).toEqual({
      id: 'perm-1',
      toolName: 'Bash',
      toolInput: { command: 'npm run verify' },
      timestamp: 1,
      description: 'Run verify',
      timeoutAt: 0,
      sessionId: 'session-1',
    });
  });

  it.each(['not json', '[1,2]', 'null', '"text"'])('keeps unparsable or non-object toolArgs raw: %s', (toolArgs) => {
    expect(toLanePermissionRequest(permission({ toolArgs })).toolInput).toEqual({ raw: toolArgs });
  });

  it('omits the session id when the lane did not send one', () => {
    expect(toLanePermissionRequest(permission({ parentSessionId: undefined })).sessionId).toBeUndefined();
  });
});

describe('LanePermissionView', () => {
  const agent = signal<MonitoredAgent | undefined>(undefined);
  const questions = signal<AskUserQuestionRequest[]>([]);
  const respondLane = jest.fn<boolean, unknown[]>(() => true);
  const handleQuestionResponse = jest.fn();
  const findTabByIdAcrossWorkspaces = jest.fn((): { tab: { id: string } } | null => null);
  const findTabBySessionIdAcrossWorkspaces = jest.fn((): { tab: { id: string } } | null => null);
  let view: LanePermissionView;

  beforeEach(() => {
    jest.clearAllMocks();
    respondLane.mockReturnValue(true);
    findTabByIdAcrossWorkspaces.mockReturnValue(null);
    findTabBySessionIdAcrossWorkspaces.mockReturnValue(null);
    agent.set(lane([permission()]));
    questions.set([]);
    TestBed.configureTestingModule({
      providers: [
        LanePermissionView,
        { provide: AgentPermissionResponder, useValue: { respondLane } },
        { provide: AgentMonitorStore, useValue: { permissionBelongsToAgent: () => true } },
        { provide: PermissionHandlerService, useValue: { questionRequests: questions } },
        { provide: ChatStore, useValue: { handleQuestionResponse } },
        { provide: TabManagerService, useValue: { findTabByIdAcrossWorkspaces, findTabBySessionIdAcrossWorkspaces } },
      ],
    });
    view = TestBed.inject(LanePermissionView);
    view.connect({ agent });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('lists the lane permission with its label and keeps the converted object stable', () => {
    const first = view.permissions();
    expect(first.map((request) => request.id)).toEqual(['perm-1']);
    expect(view.laneLabel()).toBe('Claude SDK lane');
    expect(view.waiting()).toBe(true);
    agent.set({ ...agent()!, stdout: 'more' } as MonitoredAgent);
    expect(view.permissions()[0]).toBe(first[0]);
  });

  it('shows only this lane\'s questions', () => {
    questions.set([question('q-a', 'lane-a'), question('q-b', 'lane-b'), question('q-main')]);
    expect(view.questions().map((request) => request.id)).toEqual(['q-a']);
  });

  it('sends every card decision with the edited input through respondLane', () => {
    expect(view.respond({ id: 'perm-1', decision: 'always_allow', modifiedInput: { command: 'ls' } })).toBe(true);
    expect(respondLane).toHaveBeenCalledWith(
      'lane-a', 'perm-1', 'always_allow', undefined, { command: 'ls' }, expect.any(Function),
    );
    expect(view.notice()).toBeNull();
  });

  it('shows a host refusal next to the card and keeps the prompt answerable', () => {
    view.respond({ id: 'perm-1', decision: 'allow', modifiedInput: { command: 'ls' } });
    const onRefused = respondLane.mock.calls[0][5] as (message: string) => void;
    onRefused('Copilot lanes cannot run a tool with edited input.');
    expect(view.notice()).toBe('Copilot lanes cannot run a tool with edited input.');
    expect(view.permissions().map((request) => request.id)).toEqual(['perm-1']);
    // The refused answer is forgotten: a later expiry is not reported as allowed by you.
    view.resolvedStatus();
    agent.set(lane([]));
    expect(view.resolvedStatus()).toBe(
      'Permission · Bash · npm run verify - Answered, denied or expired in another view. No longer answerable here.',
    );
  });

  it('tells a Copilot lane user that Always allow applies to this call only', () => {
    agent.set({ ...lane([permission()]), cli: 'copilot' } as MonitoredAgent);
    view.respond({ id: 'perm-1', decision: 'always_allow' });
    expect(view.notice()).toBe(COPILOT_ALWAYS_ALLOW_ONCE_TEXT);
  });

  it('shows the refusal once when a second answer is not sent', () => {
    respondLane.mockReturnValue(false);
    expect(view.respond({ id: 'perm-1', decision: 'deny' })).toBe(false);
    expect(view.respond({ id: 'perm-1', decision: 'allow' })).toBe(false);
    expect(view.notice()).toBe(LANE_ANSWER_REFUSED_TEXT);
  });

  it('does not show a refusal for the card\'s own countdown deny', () => {
    respondLane.mockReturnValue(false);
    view.respond({ id: 'perm-1', decision: 'deny', reason: 'Request timeout' });
    expect(view.notice()).toBeNull();
  });

  it('swaps an answered card for a one-line status', () => {
    expect(view.resolvedStatus()).toBeNull();
    view.respond({ id: 'perm-1', decision: 'allow' });
    agent.set(lane([]));
    expect(view.permissions()).toEqual([]);
    expect(view.resolvedStatus()).toBe(
      'Permission · Bash · npm run verify - Allowed by you. No longer answerable here.',
    );
  });

  it('says a prompt answered in another surface is no longer answerable here', () => {
    view.resolvedStatus();
    agent.set(lane([]));
    expect(view.resolvedStatus()).toBe(
      'Permission · Bash · npm run verify - Answered, denied or expired in another view. No longer answerable here.',
    );
  });

  it('answers a question once and refuses the second answer (A12)', () => {
    questions.set([question('q-a', 'lane-a')]);
    expect(view.answer({ id: 'q-a', answers: { 'Which target?': 'lint' } })).toBe(true);
    questions.set([]);
    expect(view.answer({ id: 'q-a', answers: { 'Which target?': 'test' } })).toBe(false);
    expect(handleQuestionResponse).toHaveBeenCalledTimes(1);
    expect(view.notice()).toBe(LANE_ANSWER_REFUSED_TEXT);
  });

  it('refuses a second connect', () => {
    expect(() => view.connect({ agent })).toThrow('already connected');
  });

  describe('status line and notice lifetime (M4)', () => {
    it('clears the status line when the next prompt arrives', () => {
      view.resolvedStatus();
      view.respond({ id: 'perm-1', decision: 'allow' });
      agent.set(lane([]));
      expect(view.resolvedStatus()).toContain('Allowed by you');
      agent.set({ ...lane([]), stdout: 'more' } as MonitoredAgent);
      expect(view.resolvedStatus()).toContain('Allowed by you');

      agent.set(lane([permission({ requestId: 'perm-2' })]));
      expect(view.resolvedStatus()).toBeNull();
    });

    it('clears the refusal notice when the next prompt arrives, not when the refused one leaves', () => {
      respondLane.mockReturnValue(false);
      view.respond({ id: 'perm-1', decision: 'allow' });
      agent.set(lane([]));
      expect(view.notice()).toBe(LANE_ANSWER_REFUSED_TEXT);

      agent.set(lane([permission({ requestId: 'perm-2' })]));
      expect(view.notice()).toBeNull();
    });

    it('keeps the outcome for a status read late, after another prompt was answered', () => {
      agent.set(lane([permission(), permission({ requestId: 'perm-2', toolArgs: '{"command":"ls"}' })]));
      view.resolvedStatus();
      view.respond({ id: 'perm-1', decision: 'deny' });
      view.respond({ id: 'perm-2', decision: 'allow' });
      agent.set(lane([permission({ requestId: 'perm-2', toolArgs: '{"command":"ls"}' })]));
      expect(view.resolvedStatus()).toContain('Denied by you');
      agent.set(lane([]));
      expect(view.resolvedStatus()).toBe('Permission · Bash · ls - Allowed by you. No longer answerable here.');
    });

    it('does not record an outcome for an answer that was not sent', () => {
      view.resolvedStatus();
      respondLane.mockReturnValue(false);
      view.respond({ id: 'perm-1', decision: 'allow' });
      agent.set(lane([]));
      expect(view.resolvedStatus()).toContain('in another view');
    });
  });

  describe('question deciding tab (M6)', () => {
    const response = { id: 'q-a', answers: { 'Which target?': 'lint' } };

    it('passes the tab the question was routed to', () => {
      questions.set([{ ...question('q-a', 'lane-a'), tabId: 'tab-routed' }]);
      view.answer(response);
      expect(handleQuestionResponse).toHaveBeenCalledWith(response, 'tab-routed');
    });

    it('passes the tab of the session that spawned the lane, not the active tab', () => {
      findTabBySessionIdAcrossWorkspaces.mockReturnValue({ tab: { id: 'tab-owner' } });
      questions.set([question('q-a', 'lane-a')]);
      view.answer(response);
      expect(findTabBySessionIdAcrossWorkspaces).toHaveBeenCalledWith('session-1');
      expect(handleQuestionResponse).toHaveBeenCalledWith(response, 'tab-owner');
    });

    it('passes null when no open tab owns the lane', () => {
      questions.set([question('q-a', 'lane-a')]);
      view.answer(response);
      expect(handleQuestionResponse).toHaveBeenCalledWith(response, null);
    });
  });
});

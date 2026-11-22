/**
 * `AgentReportRouter` — child → parent delivery with limits (TASK_2026_402).
 *
 * The property every test here defends: the router NEVER reports a delivery it
 * did not make. A refusal carries a named reason, writes no tile segment, and
 * consumes no burst budget.
 */
import 'reflect-metadata';

import { AgentProcessInfo, CliOutputSegment } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { AgentProcessManager } from './agent-process-manager.service';
import { AgentReportCoalescer } from './agent-report-coalescer';
import {
  AGENT_REPORT_BURST_LIMIT,
  AGENT_REPORT_BURST_WINDOW_MS,
  AGENT_REPORT_HISTORY_SIZE,
  AgentReportRouter,
  MAX_AGENT_REPORT_LENGTH,
  type AgentReportInput,
} from './agent-report-router.service';
import {
  SESSION_CHILD_HELD_REPORT_LIMIT,
  SessionChildRegistry,
  type SessionChildRecord,
} from '../session-children/session-child.registry';
import { SessionHandoffAckStore } from '../session-children/session-handoff-ack.store';
import { ParentEnvelopeStoreService } from './parent-delivery/parent-envelope-store.service';
import { ParentDeliveryDrainerService } from './parent-delivery/parent-delivery-drainer.service';
import { FakeStateStorage } from './parent-delivery/__fixtures__/fake-state-storage';

const PARENT = '11111111-2222-4333-8444-555555555555';
const AGENT_ID = 'agent-abc';

function createLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<Logger>;
}

function createInfo(overrides: Partial<AgentProcessInfo> = {}) {
  return {
    agentId: AGENT_ID,
    cli: 'codex',
    task: 'do a thing',
    workingDirectory: '/ws',
    status: 'running',
    startedAt: new Date().toISOString(),
    parentSessionId: PARENT,
    displayName: 'Codex CLI',
    ...overrides,
  } as unknown as AgentProcessInfo;
}

interface Harness {
  router: AgentReportRouter;
  logger: jest.Mocked<Logger>;
  findAgentInfo: jest.Mock;
  recordAgentNote: jest.Mock<void, [string, CliOutputSegment]>;
  markReportDelivered: jest.Mock<void, [string]>;
  markReportAttempt: jest.Mock<void, [string, boolean]>;
  isSessionActive: jest.Mock;
  sendMessageToSession: jest.Mock;
}

function createHarness(
  options: {
    info?: AgentProcessInfo | undefined;
    sessionActive?: boolean;
    withAdapter?: boolean;
    sendImpl?: () => Promise<void>;
  } = {},
): Harness {
  const logger = createLogger();
  const findAgentInfo = jest.fn(() => options.info ?? createInfo());
  const recordAgentNote = jest.fn();
  const markReportDelivered = jest.fn();
  const markReportAttempt = jest.fn();
  const manager = {
    findAgentInfo,
    recordAgentNote,
    markReportDelivered,
    markReportAttempt,
  } as unknown as AgentProcessManager;

  const isSessionActive = jest.fn(() => options.sessionActive !== false);
  const sendMessageToSession = jest.fn(
    options.sendImpl ?? (() => Promise.resolve()),
  );
  const adapter =
    options.withAdapter === false
      ? null
      : ({ isSessionActive, sendMessageToSession } as never);

  return {
    router: new AgentReportRouter(logger, manager, adapter),
    logger,
    findAgentInfo,
    recordAgentNote,
    markReportDelivered,
    markReportAttempt,
    isSessionActive,
    sendMessageToSession,
  };
}

describe('AgentReportRouter.deliver', () => {
  it('records a failed lane report without retaining its message', async () => {
    const h = createHarness({
      sendImpl: async () => {
        throw new Error('send failed');
      },
    });
    const result = await h.router.deliver({
      agentId: AGENT_ID,
      message: 'private report',
    });
    expect(result.delivered).toBe(false);
    expect(h.markReportAttempt).toHaveBeenCalledWith(AGENT_ID, true);
  });
  it('holds only final reports and keeps the tile truthful until delivery', async () => {
    const h = createHarness();
    const store = new ParentEnvelopeStoreService(
      h.logger,
      new FakeStateStorage(),
    );
    const adapter = {
      isSessionActive: h.isSessionActive,
      sendMessageToSession: h.sendMessageToSession,
    } as never;
    const drainer = new ParentDeliveryDrainerService(
      h.logger,
      store,
      adapter,
      null,
      null,
    );
    const manager = {
      findAgentInfo: h.findAgentInfo,
      recordAgentNote: h.recordAgentNote,
      markReportDelivered: h.markReportDelivered,
    } as never;
    const coalescer = new AgentReportCoalescer();
    const router = new AgentReportRouter(
      h.logger,
      manager,
      adapter,
      null,
      drainer,
      coalescer,
    );
    const held = await router.deliver({
      agentId: AGENT_ID,
      message: 'finished',
      final: true,
    });
    expect(held).toMatchObject({
      delivered: false,
      pending: true,
      reason: 'held-for-completion',
    });
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
    expect(h.markReportDelivered).not.toHaveBeenCalled();
    const urgent = await router.deliver({
      agentId: AGENT_ID,
      message: 'Need a decision',
    });
    expect(urgent.delivered).toBe(true);
    expect(h.sendMessageToSession).toHaveBeenCalledTimes(1);
    coalescer.dispose();
    drainer.dispose();
  });

  it('refuses an identical final report without flushing the held one', async () => {
    const h = createHarness();
    const store = new ParentEnvelopeStoreService(
      h.logger,
      new FakeStateStorage(),
    );
    const adapter = {
      isSessionActive: h.isSessionActive,
      sendMessageToSession: h.sendMessageToSession,
    } as never;
    const drainer = new ParentDeliveryDrainerService(
      h.logger,
      store,
      adapter,
      null,
      null,
    );
    const manager = {
      findAgentInfo: h.findAgentInfo,
      recordAgentNote: h.recordAgentNote,
      markReportDelivered: h.markReportDelivered,
    } as never;
    const coalescer = new AgentReportCoalescer();
    const router = new AgentReportRouter(
      h.logger,
      manager,
      adapter,
      null,
      drainer,
      coalescer,
    );
    try {
      await router.deliver({
        agentId: AGENT_ID,
        message: 'closing',
        final: true,
      });
      const repeat = await router.deliver({
        agentId: AGENT_ID,
        message: 'closing',
        final: true,
      });
      expect(repeat).toMatchObject({
        delivered: false,
        reason: 'duplicate-report',
      });
      expect(h.sendMessageToSession).not.toHaveBeenCalled();
      expect(coalescer.peek(AGENT_ID)?.message).toBe('closing');
    } finally {
      coalescer.take(AGENT_ID);
      drainer.dispose();
    }
  });

  it('delivers a held report standalone when its window expires', async () => {
    jest.useFakeTimers();
    const h = createHarness();
    const store = new ParentEnvelopeStoreService(
      h.logger,
      new FakeStateStorage(),
    );
    const adapter = {
      isSessionActive: h.isSessionActive,
      sendMessageToSession: h.sendMessageToSession,
    } as never;
    const drainer = new ParentDeliveryDrainerService(
      h.logger,
      store,
      adapter,
      null,
      null,
    );
    const manager = {
      findAgentInfo: h.findAgentInfo,
      recordAgentNote: h.recordAgentNote,
      markReportDelivered: h.markReportDelivered,
    } as never;
    const coalescer = new AgentReportCoalescer();
    const router = new AgentReportRouter(
      h.logger,
      manager,
      adapter,
      null,
      drainer,
      coalescer,
    );
    try {
      await router.deliver({
        agentId: AGENT_ID,
        message: 'closing',
        final: true,
      });
      await jest.advanceTimersByTimeAsync(120_000);
      expect(h.sendMessageToSession).toHaveBeenCalledTimes(1);
      expect(h.markReportDelivered).toHaveBeenCalledTimes(1);
    } finally {
      drainer.dispose();
      jest.useRealTimers();
    }
  });

  it('does not infer completion from report prose', async () => {
    const h = createHarness();
    await h.router.deliver({
      agentId: AGENT_ID,
      message: 'Progress: wrote a draft',
    });
    await h.router.deliver({
      agentId: AGENT_ID,
      message: 'Completed step 2 of 5',
    });
    expect(h.markReportDelivered).toHaveBeenNthCalledWith(1, AGENT_ID);
    expect(h.markReportDelivered).toHaveBeenNthCalledWith(2, AGENT_ID);
  });
  it('queues a tab-id report and delivers it after session resolution', async () => {
    const h = createHarness({ info: createInfo({ parentSessionId: 'tab-1' }) });
    const store = new ParentEnvelopeStoreService(
      h.logger,
      new FakeStateStorage(),
    );
    const adapter = {
      isSessionActive: h.isSessionActive,
      sendMessageToSession: h.sendMessageToSession,
    } as never;
    const drainer = new ParentDeliveryDrainerService(
      h.logger,
      store,
      adapter,
      null,
      null,
    );
    const manager = {
      findAgentInfo: h.findAgentInfo,
      recordAgentNote: h.recordAgentNote,
      markReportDelivered: h.markReportDelivered,
    } as never;
    const router = new AgentReportRouter(
      h.logger,
      manager,
      adapter,
      null,
      drainer,
    );
    const pending = await router.deliver({
      agentId: AGENT_ID,
      message: 'progress',
    });
    expect(pending).toMatchObject({
      delivered: false,
      recorded: true,
      pending: true,
    });
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
    await drainer.resolveParentSessionId('tab-1', PARENT);
    expect(h.sendMessageToSession).toHaveBeenCalledTimes(1);
  });

  it('limits attempted reports while the parent remains inactive', async () => {
    const h = createHarness({ sessionActive: false });
    const store = new ParentEnvelopeStoreService(
      h.logger,
      new FakeStateStorage(),
    );
    const adapter = {
      isSessionActive: h.isSessionActive,
      sendMessageToSession: h.sendMessageToSession,
    } as never;
    const drainer = new ParentDeliveryDrainerService(
      h.logger,
      store,
      adapter,
      null,
      null,
    );
    const manager = {
      findAgentInfo: h.findAgentInfo,
      recordAgentNote: h.recordAgentNote,
      markReportDelivered: h.markReportDelivered,
    } as never;
    const router = new AgentReportRouter(
      h.logger,
      manager,
      adapter,
      null,
      drainer,
    );
    for (let i = 0; i < AGENT_REPORT_BURST_LIMIT; i++)
      expect(
        (await router.deliver({ agentId: AGENT_ID, message: `report ${i}` }))
          .pending,
      ).toBe(true);
    expect(
      await router.deliver({ agentId: AGENT_ID, message: 'overflow' }),
    ).toMatchObject({ delivered: false, reason: 'rate-limited' });
  });

  describe('durable parent inbox refusals', () => {
    async function durableRouter(h: Harness, storage: FakeStateStorage) {
      const store = new ParentEnvelopeStoreService(h.logger, storage);
      await store.ready;
      const adapter = {
        isSessionActive: h.isSessionActive,
        sendMessageToSession: h.sendMessageToSession,
      } as never;
      const drainer = new ParentDeliveryDrainerService(
        h.logger,
        store,
        adapter,
        null,
        null,
      );
      const manager = {
        findAgentInfo: h.findAgentInfo,
        recordAgentNote: h.recordAgentNote,
        markReportDelivered: h.markReportDelivered,
      } as never;
      return {
        store,
        drainer,
        router: new AgentReportRouter(
          h.logger,
          manager,
          adapter,
          null,
          drainer,
        ),
      };
    }

    it('maps a failed persist to storage-unavailable and lets the lane report again', async () => {
      const h = createHarness();
      const storage = new FakeStateStorage();
      const { router, drainer } = await durableRouter(h, storage);
      storage.failWrites = () => true;
      expect(
        await router.deliver({ agentId: AGENT_ID, message: 'progress' }),
      ).toEqual({ delivered: false, reason: 'storage-unavailable' });
      storage.failWrites = () => false;
      expect(
        await router.deliver({ agentId: AGENT_ID, message: 'progress' }),
      ).toMatchObject({ delivered: true, recorded: true });
      drainer.dispose();
    });

    it('maps a frozen parent to parent-session-deleted', async () => {
      const h = createHarness();
      const { router, store, drainer } = await durableRouter(
        h,
        new FakeStateStorage(),
      );
      await store.markIntent(PARENT);
      expect(
        await router.deliver({ agentId: AGENT_ID, message: 'progress' }),
      ).toEqual({ delivered: false, reason: 'parent-session-deleted' });
      expect(h.sendMessageToSession).not.toHaveBeenCalled();
      drainer.dispose();
    });

    it('maps a full parent inbox to parent-inbox-full', async () => {
      const h = createHarness({ sessionActive: false });
      const { router, store, drainer } = await durableRouter(
        h,
        new FakeStateStorage(),
      );
      for (let n = 0; n < 64; n++)
        await store.enqueue({
          id: `lane-delivery:report:other:${n}:h`,
          dedupeKey: `report:other:${n}:h`,
          agentId: 'other',
          parentSessionId: PARENT,
          kind: 'report',
          body: 'b',
          createdAt: n,
        });
      expect(
        await router.deliver({ agentId: AGENT_ID, message: 'progress' }),
      ).toEqual({ delivered: false, reason: 'parent-inbox-full' });
      drainer.dispose();
    });
  });
  describe('the happy path', () => {
    it('sends exactly one turn with the peer origin and writes exactly one tile segment', async () => {
      const h = createHarness();

      const result = await h.router.deliver({
        agentId: AGENT_ID,
        message: 'blocked on a missing credential',
        summary: 'blocked',
      });

      expect(result).toEqual({ delivered: true, parentSessionId: PARENT });
      expect(h.sendMessageToSession).toHaveBeenCalledTimes(1);
      const [sessionId, content, opts] = h.sendMessageToSession.mock.calls[0];
      expect(sessionId).toBe(PARENT);
      expect(content).toContain(`<agent-report agent-id="${AGENT_ID}"`);
      expect(content).toContain('cli="codex"');
      expect(content).toContain('blocked on a missing credential');
      expect(content.endsWith('</agent-report>')).toBe(true);
      expect(opts.origin).toEqual({
        kind: 'peer',
        from: `ptah-agent:${AGENT_ID}`,
        name: 'codex · Codex CLI',
      });

      expect(h.recordAgentNote).toHaveBeenCalledTimes(1);
      // Counted for the completion signal's `reportsDelivered`, and only on a
      // delivery (TASK_2026_515).
      expect(h.markReportDelivered).toHaveBeenCalledTimes(1);
      expect(h.markReportDelivered).toHaveBeenCalledWith(AGENT_ID);
      const [notedAgentId, segment] = h.recordAgentNote.mock.calls[0];
      expect(notedAgentId).toBe(AGENT_ID);
      expect(segment.type).toBe('info');
      expect(segment.content).toContain('blocked');
    });

    it('escapes quotes in the envelope attributes so the shape cannot be rewritten', async () => {
      const h = createHarness({
        info: createInfo({ ptahCliName: 'a "quoted" & <angled> name' }),
      });

      await h.router.deliver({ agentId: AGENT_ID, message: 'hi' });

      const content = h.sendMessageToSession.mock.calls[0][1] as string;
      expect(content).toContain(
        'agent="a &quot;quoted&quot; &amp; &lt;angled&gt; name"',
      );
    });

    it('renders the body once when the summary equals the message (TASK_2026_466 defect 3)', async () => {
      const h = createHarness();

      await h.router.deliver({
        agentId: AGENT_ID,
        message: 'STEP2: done',
        summary: 'STEP2: done',
      });

      const content = h.sendMessageToSession.mock.calls[0][1] as string;
      expect(content).toBe(
        `<agent-report agent-id="${AGENT_ID}" agent="Codex CLI" cli="codex">\n` +
          'STEP2: done\n' +
          '</agent-report>',
      );
    });

    it('renders the body once when the summary differs from the message only by whitespace', async () => {
      const h = createHarness();

      await h.router.deliver({
        agentId: AGENT_ID,
        message: 'STEP2: done',
        summary: '  STEP2: done  ',
      });

      const content = h.sendMessageToSession.mock.calls[0][1] as string;
      expect(content).toBe(
        `<agent-report agent-id="${AGENT_ID}" agent="Codex CLI" cli="codex">\n` +
          'STEP2: done\n' +
          '</agent-report>',
      );
    });

    it('renders both the summary and the message when they differ (TASK_2026_466 defect 3)', async () => {
      const h = createHarness();

      await h.router.deliver({
        agentId: AGENT_ID,
        message: 'codex received the queued message',
        summary: 'Queued message delivered',
      });

      const content = h.sendMessageToSession.mock.calls[0][1] as string;
      expect(content).toBe(
        `<agent-report agent-id="${AGENT_ID}" agent="Codex CLI" cli="codex">\n` +
          'Queued message delivered\n\n' +
          'codex received the queued message\n' +
          '</agent-report>',
      );
    });
  });

  describe('refusals', () => {
    it('refuses an empty agent id as unattributed-caller', async () => {
      const h = createHarness();

      const result = await h.router.deliver({ agentId: '', message: 'hi' });

      expect(result).toEqual({
        delivered: false,
        reason: 'unattributed-caller',
      });
      expect(h.sendMessageToSession).not.toHaveBeenCalled();
      expect(h.recordAgentNote).not.toHaveBeenCalled();
      expect(h.logger.warn).toHaveBeenCalled();
    });

    it('refuses an unknown agent id as unattributed-caller', async () => {
      const h = createHarness();
      h.findAgentInfo.mockReturnValue(undefined);

      const result = await h.router.deliver({
        agentId: 'ghost',
        message: 'hi',
      });

      expect(result.reason).toBe('unattributed-caller');
      expect(h.sendMessageToSession).not.toHaveBeenCalled();
    });

    it('refuses when no parent was recorded at spawn', async () => {
      const h = createHarness({
        info: createInfo({ parentSessionId: undefined }),
      });

      const result = await h.router.deliver({
        agentId: AGENT_ID,
        message: 'x',
      });

      expect(result).toEqual({
        delivered: false,
        reason: 'no-parent-recorded',
      });
      expect(h.sendMessageToSession).not.toHaveBeenCalled();
    });

    it('refuses when the recorded parent never resolved to a real session id', async () => {
      // A tab id, not a session uuid: `resolveParentSessionId` never backfilled
      // it, so there is nothing to deliver into.
      const h = createHarness({
        info: createInfo({ parentSessionId: 'tab-7' }),
      });

      const result = await h.router.deliver({
        agentId: AGENT_ID,
        message: 'x',
      });

      expect(result.reason).toBe('no-parent-recorded');
    });

    it('refuses when the parent session is no longer active', async () => {
      const h = createHarness({ sessionActive: false });

      const result = await h.router.deliver({
        agentId: AGENT_ID,
        message: 'x',
      });

      expect(result).toEqual({
        delivered: false,
        reason: 'parent-session-not-active',
      });
      expect(h.sendMessageToSession).not.toHaveBeenCalled();
      expect(h.recordAgentNote).not.toHaveBeenCalled();
    });

    it('refuses a body over the size cap without consulting session state', async () => {
      const h = createHarness();

      const result = await h.router.deliver({
        agentId: AGENT_ID,
        message: 'x'.repeat(MAX_AGENT_REPORT_LENGTH + 1),
      });

      expect(result).toEqual({ delivered: false, reason: 'report-too-large' });
      expect(h.isSessionActive).not.toHaveBeenCalled();
      expect(h.sendMessageToSession).not.toHaveBeenCalled();
    });

    it('accepts a body exactly at the cap', async () => {
      const h = createHarness();

      const result = await h.router.deliver({
        agentId: AGENT_ID,
        message: 'x'.repeat(MAX_AGENT_REPORT_LENGTH),
      });

      expect(result.delivered).toBe(true);
    });

    it('refuses once the burst limit is reached, and lets the window clear it', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-12T00:00:00Z'));
      try {
        const h = createHarness();

        for (let i = 0; i < AGENT_REPORT_BURST_LIMIT; i++) {
          const ok = await h.router.deliver({
            agentId: AGENT_ID,
            // Distinct bodies so the repeat suppressor is not what refuses.
            message: `report ${i}`,
          });
          expect(ok.delivered).toBe(true);
        }

        const refused = await h.router.deliver({
          agentId: AGENT_ID,
          message: 'one too many',
        });
        expect(refused).toEqual({ delivered: false, reason: 'rate-limited' });
        expect(h.sendMessageToSession).toHaveBeenCalledTimes(
          AGENT_REPORT_BURST_LIMIT,
        );

        jest.setSystemTime(Date.now() + AGENT_REPORT_BURST_WINDOW_MS + 1);
        const after = await h.router.deliver({
          agentId: AGENT_ID,
          message: 'one too many',
        });
        expect(after.delivered).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('counts deliveries beyond the body ring, so the limit is not silently capped', async () => {
      // Regression: the burst counter and the identical-repeat ring were ONE
      // list bounded by AGENT_REPORT_HISTORY_SIZE, so any burst limit above
      // that size could never fire. With the measured limit of 30 against an
      // 8-entry ring, that bug is the difference between a rate limit and no
      // rate limit at all.
      expect(AGENT_REPORT_BURST_LIMIT).toBeGreaterThan(
        AGENT_REPORT_HISTORY_SIZE,
      );
      const h = createHarness();

      for (let i = 0; i < AGENT_REPORT_HISTORY_SIZE + 2; i++) {
        const ok = await h.router.deliver({
          agentId: AGENT_ID,
          message: `report ${i}`,
        });
        expect(ok.delivered).toBe(true);
      }
      // Every one of them still counts against the burst budget.
      expect(h.sendMessageToSession).toHaveBeenCalledTimes(
        AGENT_REPORT_HISTORY_SIZE + 2,
      );
    });

    it('suppresses a byte-identical repeat', async () => {
      const h = createHarness();

      expect(
        (await h.router.deliver({ agentId: AGENT_ID, message: 'same' }))
          .delivered,
      ).toBe(true);
      const second = await h.router.deliver({
        agentId: AGENT_ID,
        message: 'same',
      });

      expect(second).toEqual({ delivered: false, reason: 'duplicate-report' });
      expect(h.sendMessageToSession).toHaveBeenCalledTimes(1);
      expect(h.recordAgentNote).toHaveBeenCalledTimes(1);
    });

    it('keys the limits per agent, so one child cannot starve another', async () => {
      const h = createHarness();
      h.findAgentInfo.mockImplementation((id: string) =>
        createInfo({ agentId: id as AgentProcessInfo['agentId'] }),
      );

      expect(
        (await h.router.deliver({ agentId: 'agent-a', message: 'same' }))
          .delivered,
      ).toBe(true);
      expect(
        (await h.router.deliver({ agentId: 'agent-b', message: 'same' }))
          .delivered,
      ).toBe(true);
    });

    it('refuses with chat-runtime-unavailable when no agent adapter is registered', async () => {
      const h = createHarness({ withAdapter: false });

      const result = await h.router.deliver({
        agentId: AGENT_ID,
        message: 'x',
      });

      expect(result).toEqual({
        delivered: false,
        reason: 'chat-runtime-unavailable',
      });
      expect(h.recordAgentNote).not.toHaveBeenCalled();
    });

    it('reports delivery-failed and writes no tile note when the injection throws', async () => {
      const h = createHarness({
        sendImpl: () => Promise.reject(new Error('session closed mid-send')),
      });

      const result = await h.router.deliver({
        agentId: AGENT_ID,
        message: 'x',
      });

      expect(result).toEqual({ delivered: false, reason: 'delivery-failed' });
      expect(h.recordAgentNote).not.toHaveBeenCalled();
      expect(h.logger.warn).toHaveBeenCalledWith(
        '[AgentReportRouter] Report refused',
        expect.objectContaining({
          reason: 'delivery-failed',
          detail: 'parent-send-failed',
        }),
      );
    });

    it('does not spend burst budget on a refused call', async () => {
      const h = createHarness({ sessionActive: false });

      for (let i = 0; i < AGENT_REPORT_BURST_LIMIT + 3; i++) {
        const r = await h.router.deliver({
          agentId: AGENT_ID,
          message: `n ${i}`,
        });
        expect(r.reason).toBe('parent-session-not-active');
      }

      h.isSessionActive.mockReturnValue(true);
      const ok = await h.router.deliver({ agentId: AGENT_ID, message: 'now' });
      expect(ok.delivered).toBe(true);
    });
  });
});

/*
 * Child chat sessions started with `ptah_session_start` (TASK_2026_584).
 */
describe('AgentReportRouter.deliver — session child', () => {
  const CHILD = 'aaaaaaaa-2222-4333-8444-555555555555';
  const CHILD_SDK = 'bbbbbbbb-2222-4333-8444-555555555555';
  const PARENT_SDK = 'cccccccc-2222-4333-8444-555555555555';

  function childRecord(
    childSessionId: string,
    overrides: Partial<SessionChildRecord> = {},
  ): SessionChildRecord {
    return {
      childSessionId,
      parentSessionId: PARENT,
      parentSdkSessionId: PARENT_SDK,
      label: 'auth-fix',
      task: 'fix auth',
      branch: 'feat/auth-fix',
      baseRef: 'abc',
      workspaceRoot: '/ws',
      worktreePath: `/ws-wt/${childSessionId}`,
      deliverables: [],
      subagentPtahTools: 'available',
      startedAt: '2026-10-01T10:00:00.000Z',
      turnsSettled: 0,
      reportsDelivered: 0,
      reportsRefused: 0,
      ...overrides,
    };
  }

  /** Let the activity callback's async flush settle. */
  const settle = (): Promise<void> =>
    new Promise((resolve) => setImmediate(resolve));

  function createSessionHarness(
    options: {
      activeIds?: readonly string[];
      sendImpl?: () => Promise<void>;
      withRegistry?: boolean;
      handoffBinding?: { successorTabId: string; successorSdkId: string };
      findBySuccessor?: jest.Mock;
      /** Committed handoff edges returned by the ack store's `records()`. */
      ackRecords?: readonly unknown[];
    } = {},
  ) {
    const logger = createLogger();
    const manager = {
      findAgentInfo: jest.fn(),
      recordAgentNote: jest.fn(),
      markReportDelivered: jest.fn(),
    } as unknown as AgentProcessManager;
    const active = new Set(options.activeIds ?? [PARENT]);
    const isSessionActive: jest.Mock = jest.fn((id: string) => active.has(id));
    const sendMessageToSession: jest.Mock = jest.fn(
      options.sendImpl ?? (() => Promise.resolve()),
    );
    const registry = new SessionChildRegistry();
    const reservation = registry.reserveSlot(3);
    if (!reservation) throw new Error('expected a slot');
    registry.add(
      childRecord(CHILD, {
        sdkSessionId: CHILD_SDK,
        worktreePath: '/ws-wt/auth-fix',
      }),
      reservation,
    );
    // Session lifecycle records: tab id and SDK id resolve to one record.
    const sessions = new Map<string, { tabId: string; realSessionId?: string }>();
    const addSession = (tabId: string, realSessionId?: string): void => {
      const entry = { tabId, realSessionId };
      sessions.set(tabId, entry);
      if (realSessionId) sessions.set(realSessionId, entry);
    };
    addSession(PARENT, PARENT_SDK);
    const lifecycle = { find: jest.fn((id: string) => sessions.get(id)) };
    const activityCallbacks: ((payload: { sessionId: string }) => void)[] = [];
    const activity = {
      register: jest.fn((callback: (payload: { sessionId: string }) => void) => {
        activityCallbacks.push(callback);
        return () => undefined;
      }),
    };
    const fireActivity = async (sessionId: string): Promise<void> => {
      for (const callback of activityCallbacks) callback({ sessionId });
      await settle();
    };
    const router = new AgentReportRouter(
      logger,
      manager,
      { isSessionActive, sendMessageToSession } as never,
      options.withRegistry === false ? null : registry,
      null,
      null,
      options.findBySuccessor
        ? ({ findBySuccessor: options.findBySuccessor, records: jest.fn().mockResolvedValue([]) } as never)
        : options.handoffBinding
          ? ({
              findBySuccessor: jest
                .fn()
                .mockResolvedValue({ ...options.handoffBinding, state: 'recorded' }),
              records: jest.fn().mockResolvedValue([]),
            } as never)
          : options.ackRecords
            ? ({
                findBySuccessor: jest.fn().mockResolvedValue(undefined),
                records: jest.fn().mockResolvedValue(options.ackRecords),
              } as never)
            : null,
      lifecycle as never,
      activity as never,
    );
    return {
      router,
      logger,
      registry,
      manager,
      active,
      isSessionActive,
      sendMessageToSession,
      lifecycle,
      addSession,
      fireActivity,
    };
  }

  it('delivers into the recorded parent tab with the ptah-session envelope and origin', async () => {
    const h = createSessionHarness();

    const result = await h.router.deliver({
      childSessionId: CHILD,
      message: 'tests pass, opening the PR draft',
      summary: 'tests pass',
    });

    expect(result).toEqual({ delivered: true, parentSessionId: PARENT });
    expect(h.sendMessageToSession).toHaveBeenCalledTimes(1);
    const [sessionId, content, opts] = h.sendMessageToSession.mock.calls[0];
    expect(sessionId).toBe(PARENT);
    expect(content).toBe(
      `<agent-report agent-id="${CHILD}" agent="auth-fix" cli="ptah-session">\n` +
        'tests pass\n\ntests pass, opening the PR draft\n</agent-report>',
    );
    expect(opts.origin).toEqual({
      kind: 'peer',
      from: `ptah-session:${CHILD}`,
      name: 'session · auth-fix',
    });
    expect(h.registry.get(CHILD)?.reportsDelivered).toBe(1);
    // A session child has no agent tile; the process manager is not touched.
    expect(h.manager.recordAgentNote).not.toHaveBeenCalled();
    expect(h.manager.markReportDelivered).not.toHaveBeenCalled();
  });

  it('delivers a report addressed to a predecessor to its kept successor', async () => {
    const h = createSessionHarness({ activeIds: [PARENT_SDK] });
    const storage = new FakeStateStorage();
    const handoffs = new SessionHandoffAckStore(storage);
    await handoffs.record({ predecessorTabId: PARENT, predecessorSdkId: null,
      successorTabId: PARENT_SDK, successorSdkId: null, workspaceRoot: '/ws',
      handoffPath: '/ws/HANDOFF.md', state: 'recorded' });
    const router = new AgentReportRouter(h.logger, h.manager,
      { isSessionActive: h.isSessionActive, sendMessageToSession: h.sendMessageToSession } as never,
      h.registry, null, null, new SessionHandoffAckStore(storage));
    expect(await router.deliver({ childSessionId: CHILD, message: 'done' }))
      .toMatchObject({ delivered: true, parentSessionId: PARENT_SDK });
    expect(h.sendMessageToSession).toHaveBeenCalledWith(PARENT_SDK, expect.any(String), expect.any(Object));
  });
  it('delivers an adopted child report to the active successor tab', async () => {
    const successor = 'dddddddd-2222-4333-8444-555555555555';
    const successorSdk = 'eeeeeeee-2222-4333-8444-555555555555';
    const h = createSessionHarness({ activeIds: [successor, successorSdk] });
    h.registry.reparent(CHILD, successor, successorSdk);
    const result = await h.router.deliver({
      childSessionId: CHILD_SDK,
      message: 'adopted report',
    });
    expect(result).toEqual({ delivered: true, parentSessionId: successor });
    expect(h.sendMessageToSession).toHaveBeenCalledWith(
      successor,
      expect.any(String),
      expect.any(Object),
    );
  });

  it('delivers to the active SDK id only when the handoff binds it to the owner tab', async () => {
    const successor = 'dddddddd-2222-4333-8444-555555555555';
    const successorSdk = 'eeeeeeee-2222-4333-8444-555555555555';
    const h = createSessionHarness({
      activeIds: [successorSdk],
      handoffBinding: {
        successorTabId: successor,
        successorSdkId: successorSdk,
      },
    });
    h.registry.reparent(CHILD, successor, successorSdk);
    expect(
      await h.router.deliver({
        childSessionId: CHILD_SDK,
        message: 'adopted report',
      }),
    ).toEqual({ delivered: true, parentSessionId: successorSdk });
    expect(h.sendMessageToSession).toHaveBeenCalledWith(
      successorSdk,
      expect.any(String),
      expect.any(Object),
    );
    const mismatch = createSessionHarness({
      activeIds: [successorSdk],
      handoffBinding: { successorTabId: PARENT, successorSdkId: successorSdk },
    });
    mismatch.registry.reparent(CHILD, successor, successorSdk);
    expect(
      await mismatch.router.deliver({
        childSessionId: CHILD_SDK,
        message: 'report',
      }),
    ).toMatchObject({ delivered: false, reason: 'parent-session-not-active' });
  });

  it('does not reroute to the SDK id when the child is reparented during the binding lookup', async () => {
    const successor = 'dddddddd-2222-4333-8444-555555555555';
    const successorSdk = 'eeeeeeee-2222-4333-8444-555555555555';
    const next = 'ffffffff-2222-4333-8444-555555555555';
    const nextSdk = 'abababab-2222-4333-8444-555555555555';
    const findBySuccessor = jest.fn();
    const h = createSessionHarness({
      activeIds: [successorSdk],
      findBySuccessor,
    });
    h.registry.reparent(CHILD, successor, successorSdk);
    findBySuccessor.mockImplementation(async () => {
      h.registry.reparent(CHILD, next, nextSdk);
      // The former owner tab comes back to life during the lookup.
      h.active.add(successor);
      return { successorTabId: successor, successorSdkId: successorSdk, state: 'recorded' };
    });
    expect(
      await h.router.deliver({
        childSessionId: CHILD_SDK,
        message: 'raced report',
      }),
    ).toMatchObject({ delivered: false, reason: 'parent-session-not-active' });
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('resolves a report sent under the child SDK id to the same child', async () => {
    const h = createSessionHarness();

    const result = await h.router.deliver({
      childSessionId: CHILD_SDK,
      message: 'hello',
    });

    expect(result.delivered).toBe(true);
    expect(h.sendMessageToSession.mock.calls[0][1]).toContain(
      `agent-id="${CHILD}"`,
    );
  });

  it('keeps an agent input with childSessionId: undefined on the agent path', async () => {
    const h = createSessionHarness();
    const info = createInfo();
    (h.manager.findAgentInfo as jest.Mock).mockReturnValue(info);

    const result = await h.router.deliver({
      agentId: AGENT_ID,
      childSessionId: undefined,
      message: 'from a lane',
    } as unknown as AgentReportInput);

    expect(result).toEqual({ delivered: true, parentSessionId: PARENT });
    expect(h.manager.findAgentInfo).toHaveBeenCalledWith(AGENT_ID);
    expect(h.sendMessageToSession.mock.calls[0][1]).toContain('cli="codex"');
    expect(h.registry.get(CHILD)?.reportsDelivered).toBe(0);
  });

  it('refuses an unknown child as unattributed-caller', async () => {
    const h = createSessionHarness();

    const result = await h.router.deliver({
      childSessionId: '12345678-2222-4333-8444-555555555555',
      message: 'hi',
    });

    expect(result).toEqual({
      delivered: false,
      reason: 'unattributed-caller',
      detail: expect.stringContaining('was not started with ptah_session_start'),
    });
    expect(result.detail).toContain('host restart');
    expect(result.detail).toContain('pruned');
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('refuses every child report when no registry is present', async () => {
    const h = createSessionHarness({ withRegistry: false });

    const result = await h.router.deliver({
      childSessionId: CHILD,
      message: 'hi',
    });

    expect(result.reason).toBe('unattributed-caller');
  });

  it('refuses an over-size body before consulting the parent', async () => {
    const h = createSessionHarness();

    const result = await h.router.deliver({
      childSessionId: CHILD,
      message: 'x'.repeat(MAX_AGENT_REPORT_LENGTH + 1),
    });

    expect(result.reason).toBe('report-too-large');
    expect(h.isSessionActive).not.toHaveBeenCalled();
  });

  it('holds a report while the parent is not live and counts no refusal', async () => {
    const h = createSessionHarness({ activeIds: [] });

    const result = await h.router.deliver({
      childSessionId: CHILD,
      message: 'long body\nsecond line',
    });

    expect(result).toEqual({
      delivered: false,
      pending: true,
      reason: 'parent-session-not-active',
      detail: 'the parent session is not running; the report is held and is delivered when the parent session is next active',
    });
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
    const child = h.registry.get(CHILD);
    expect(child?.reportsRefused).toBe(0);
    expect(child?.lastRefusedReport).toBeUndefined();
    expect(child?.reportsDelivered).toBe(0);
    expect(child?.heldReports?.map((r) => r.message)).toEqual([
      'long body\nsecond line',
    ]);

    // Liveness alone sends nothing: only a parent activity event flushes.
    h.active.add(PARENT);
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('does not reroute a session-child report to a live SDK id when its recorded parent is dead', async () => {
    const h = createSessionHarness({ activeIds: [PARENT_SDK] });

    const result = await h.router.deliver({
      childSessionId: CHILD,
      message: 'finished',
    });

    expect(result).toMatchObject({
      delivered: false,
      pending: true,
      reason: 'parent-session-not-active',
    });
    expect(h.isSessionActive).toHaveBeenCalledWith(PARENT);
    expect(h.isSessionActive).not.toHaveBeenCalledWith(PARENT_SDK);
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
    expect(h.registry.get(CHILD)?.heldReports?.[0]?.message).toBe('finished');
  });

  it('records the given summary as the last refused report', async () => {
    const h = createSessionHarness();

    await h.router.deliver({
      childSessionId: CHILD,
      message: 'x'.repeat(MAX_AGENT_REPORT_LENGTH + 1),
      summary: '  blocked on creds ',
    });

    expect(h.registry.get(CHILD)?.lastRefusedReport).toBe('blocked on creds');
    expect(h.registry.get(CHILD)?.reportsRefused).toBe(1);
  });

  it('holds, and never sends to the SDK id, when the recorded parent tab is gone despite a live SDK id', async () => {
    const h = createSessionHarness({ activeIds: [PARENT_SDK] });

    const result = await h.router.deliver({
      childSessionId: CHILD,
      message: 'hi',
    });

    expect(result).toMatchObject({
      delivered: false,
      pending: true,
      reason: 'parent-session-not-active',
    });
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
    // An activity event of the live SDK id does not make it the owner.
    await h.fireActivity(PARENT_SDK);
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
    expect(h.registry.get(CHILD)?.heldReports).toHaveLength(1);
  });

  it('applies the shared burst limit under its own session key', async () => {
    const h = createSessionHarness();

    for (let i = 0; i < AGENT_REPORT_BURST_LIMIT; i++) {
      const r = await h.router.deliver({
        childSessionId: CHILD,
        message: `n ${i}`,
      });
      expect(r.delivered).toBe(true);
    }
    const over = await h.router.deliver({
      childSessionId: CHILD,
      message: 'one too many',
    });

    expect(over).toEqual({ delivered: false, reason: 'rate-limited' });
    expect(h.registry.get(CHILD)?.reportsDelivered).toBe(
      AGENT_REPORT_BURST_LIMIT,
    );
  });

  it('refuses an identical repeat as duplicate-report', async () => {
    const h = createSessionHarness();

    await h.router.deliver({ childSessionId: CHILD, message: 'same' });
    const again = await h.router.deliver({
      childSessionId: CHILD,
      message: 'same',
    });

    expect(again.reason).toBe('duplicate-report');
    expect(h.sendMessageToSession).toHaveBeenCalledTimes(1);
  });

  it('reports delivery-failed and counts one refusal when the runtime rejects the turn', async () => {
    const h = createSessionHarness({
      sendImpl: () => Promise.reject(new Error('session busy')),
    });

    const result = await h.router.deliver({
      childSessionId: CHILD,
      message: 'x',
    });

    expect(result.reason).toBe('delivery-failed');
    expect(result.detail).toBe(
      'the parent session did not accept the report; send it again later',
    );
    expect(h.logger.warn).toHaveBeenCalledWith(
      '[AgentReportRouter] Session child report refused',
      expect.objectContaining({ reason: 'delivery-failed', error: 'session busy' }),
    );
    expect(h.registry.get(CHILD)?.reportsDelivered).toBe(0);
    expect(h.registry.get(CHILD)?.reportsRefused).toBe(1);
  });

  describe('after a handoff or an idle parent (TASK_2026_2298)', () => {
    const T2 = '12121212-2222-4333-8444-555555555555';
    const C1 = 'c1c1c1c1-2222-4333-8444-555555555555';
    const C2 = 'c2c2c2c2-2222-4333-8444-555555555555';
    const C2_SDK = 'd2d2d2d2-2222-4333-8444-555555555555';
    const P1 = 'a1a1a1a1-2222-4333-8444-555555555555';
    const P1_SDK = 'b1b1b1b1-2222-4333-8444-555555555555';
    const P2 = 'a2a2a2a2-2222-4333-8444-555555555555';
    const P2_SDK = 'b2b2b2b2-2222-4333-8444-555555555555';

    const sentTo = (h: { sendMessageToSession: jest.Mock }): string[] =>
      h.sendMessageToSession.mock.calls.map((call) => String(call[0]));

    it('attributes an ended child resumed in a new tab through its SDK id', async () => {
      const h = createSessionHarness();
      h.registry.markEnded(CHILD, 'ended', 'provider-error');
      h.addSession(T2, CHILD_SDK);

      const result = await h.router.deliver({
        childSessionId: T2,
        message: 'resumed and done',
      });

      expect(result).toEqual({ delivered: true, parentSessionId: PARENT });
      expect(h.sendMessageToSession.mock.calls[0][1]).toContain(
        `agent-id="${CHILD}"`,
      );
      expect(h.registry.get(CHILD)?.reportsDelivered).toBe(1);
    });

    it('treats a lifecycle read failure as an unattributed caller', async () => {
      const h = createSessionHarness();
      h.lifecycle.find.mockImplementation(() => {
        throw new Error('registry gone');
      });
      const result = await h.router.deliver({ childSessionId: T2, message: 'x' });
      expect(result.reason).toBe('unattributed-caller');
      expect(h.logger.error).toHaveBeenCalled();
    });

    it('holds a report for an idle parent and delivers it once at the next parent activity', async () => {
      const h = createSessionHarness({ activeIds: [] });

      const result = await h.router.deliver({
        childSessionId: CHILD,
        message: 'batch 1 done',
        summary: 'batch 1',
      });
      expect(result).toMatchObject({ delivered: false, pending: true });
      expect(h.sendMessageToSession).not.toHaveBeenCalled();
      expect(h.registry.get(CHILD)?.reportsRefused).toBe(0);

      h.active.add(PARENT);
      await h.fireActivity(PARENT_SDK);

      expect(h.sendMessageToSession).toHaveBeenCalledTimes(1);
      const [target, content, opts] = h.sendMessageToSession.mock.calls[0];
      expect(target).toBe(PARENT);
      expect(content).toMatch(
        new RegExp(
          `^<agent-report agent-id="${CHILD}" agent="auth-fix" cli="ptah-session" ` +
            'reported-at="[^"]+" held="true">\n',
        ),
      );
      expect(content).toContain('batch 1\n\nbatch 1 done');
      expect(opts.origin).toEqual({
        kind: 'peer',
        from: `ptah-session:${CHILD}`,
        name: 'session · auth-fix',
      });
      const child = h.registry.get(CHILD);
      expect(child?.reportsDelivered).toBe(1);
      expect(child?.reportsRefused).toBe(0);
      expect(child?.heldReports).toBeUndefined();

      await h.fireActivity(PARENT_SDK);
      expect(h.sendMessageToSession).toHaveBeenCalledTimes(1);
    });

    it('flushes held reports before a new report once the parent is live', async () => {
      const h = createSessionHarness({ activeIds: [] });
      await h.router.deliver({ childSessionId: CHILD, message: 'old' });
      h.active.add(PARENT);
      await h.router.deliver({ childSessionId: CHILD, message: 'new' });
      const bodies = h.sendMessageToSession.mock.calls.map((c) => String(c[1]));
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toContain('held="true"');
      expect(bodies[0]).toContain('\nold\n');
      expect(bodies[1]).not.toContain('held="true"');
      expect(h.registry.get(CHILD)?.reportsDelivered).toBe(2);
    });

    it('reaches the parent from every record of a two-hop child handoff chain', async () => {
      const h = createSessionHarness();
      h.registry.succeed(CHILD, childRecord(C1), 'continued');
      h.registry.succeed(C1, childRecord(C2), 'continued');
      h.registry.bindSdkSessionId(C2, C2_SDK);

      for (const [id, message] of [
        [C2, 'from tab'],
        [C2_SDK, 'from sdk'],
        [CHILD, 'from the ended C0'],
      ] as const) {
        expect(await h.router.deliver({ childSessionId: id, message })).toEqual({
          delivered: true,
          parentSessionId: PARENT,
        });
      }
      const bodies = h.sendMessageToSession.mock.calls.map((c) => String(c[1]));
      expect(bodies[0]).toContain(`agent-id="${C2}"`);
      expect(bodies[1]).toContain(`agent-id="${C2}"`);
      expect(bodies[2]).toContain(`agent-id="${CHILD}"`);
      expect(sentTo(h)).toEqual([PARENT, PARENT, PARENT]);
    });

    it('delivers to the latest parent after two reparent hops only', async () => {
      const h = createSessionHarness({ activeIds: [PARENT, P1, P2] });
      h.registry.reparent(CHILD, P1, P1_SDK);
      h.registry.reparent(CHILD, P2, P2_SDK);
      expect(
        await h.router.deliver({ childSessionId: CHILD, message: 'hop' }),
      ).toEqual({ delivered: true, parentSessionId: P2 });
      expect(sentTo(h)).toEqual([P2]);
    });

    it('follows two committed handoff edges from the recorded parent', async () => {
      const edge = (from: string, to: string) => ({
        predecessorTabId: from,
        predecessorSdkId: null,
        successorTabId: to,
        successorSdkId: null,
        workspaceRoot: '/ws',
        handoffPath: '/ws/HANDOFF.md',
        state: 'recorded',
      });
      const h = createSessionHarness({
        activeIds: [P2],
        ackRecords: [edge(PARENT, P1), edge(P1, P2)],
      });
      expect(
        await h.router.deliver({ childSessionId: CHILD, message: 'edge' }),
      ).toEqual({ delivered: true, parentSessionId: P2 });
      expect(sentTo(h)).toEqual([P2]);
    });

    it('reaches P2 from the latest child when both chains have two hops', async () => {
      const h = createSessionHarness({ activeIds: [P2] });
      h.registry.succeed(CHILD, childRecord(C1), 'continued');
      h.registry.succeed(C1, childRecord(C2), 'continued');
      h.registry.bindSdkSessionId(C2, C2_SDK);
      h.registry.reparent(C2, P1, P1_SDK);
      h.registry.reparent(C2, P2, P2_SDK);
      expect(
        await h.router.deliver({ childSessionId: C2_SDK, message: 'both' }),
      ).toEqual({ delivered: true, parentSessionId: P2 });
      expect(sentTo(h)).toEqual([P2]);
    });

    it('delivers a held report to the adopting parent, never to the old one', async () => {
      const h = createSessionHarness({ activeIds: [] });
      await h.router.deliver({ childSessionId: CHILD, message: 'held early' });

      h.registry.reparent(CHILD, P1, P1_SDK);
      h.addSession(P1, P1_SDK);
      h.active.add(PARENT);
      // The old parent's activity no longer owns the child.
      await h.fireActivity(PARENT_SDK);
      expect(h.sendMessageToSession).not.toHaveBeenCalled();

      h.active.add(P1);
      await h.fireActivity(P1_SDK);
      expect(sentTo(h)).toEqual([P1]);
      expect(h.registry.get(CHILD)?.heldReports).toBeUndefined();
    });

    it('refuses, and does not hold, when the owner changes during the lookup', async () => {
      const findBySuccessor = jest.fn();
      const h = createSessionHarness({ activeIds: [], findBySuccessor });
      findBySuccessor.mockImplementation(async () => {
        h.registry.reparent(CHILD, P1, P1_SDK);
        return undefined;
      });
      const result = await h.router.deliver({ childSessionId: CHILD, message: 'raced' });
      expect(result).toMatchObject({
        delivered: false,
        reason: 'parent-session-not-active',
        detail: 'the recorded parent changed while the report was routed; send the report again',
      });
      expect(result.pending).toBeUndefined();
      expect(h.registry.get(CHILD)?.heldReports).toBeUndefined();
      expect(h.registry.get(CHILD)?.reportsRefused).toBe(1);
      expect(h.sendMessageToSession).not.toHaveBeenCalled();
    });

    it('drops the oldest held report beyond the limit and counts it refused', async () => {
      const h = createSessionHarness({ activeIds: [] });
      for (let i = 0; i <= SESSION_CHILD_HELD_REPORT_LIMIT; i++) {
        const r = await h.router.deliver({ childSessionId: CHILD, message: `m ${i}` });
        expect(r.pending).toBe(true);
      }
      const child = h.registry.get(CHILD);
      expect(child?.heldReports?.map((r) => r.message)).toEqual(
        Array.from({ length: SESSION_CHILD_HELD_REPORT_LIMIT }, (_, i) => `m ${i + 1}`),
      );
      expect(child?.reportsRefused).toBe(1);
      expect(child?.lastRefusedReport).toBe('m 0');
      expect(h.logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ reason: 'held-report-dropped', childSessionId: CHILD }),
      );
    });

    it('refuses a repeat of a held report as duplicate-report', async () => {
      const h = createSessionHarness({ activeIds: [] });
      await h.router.deliver({ childSessionId: CHILD, message: 'same' });
      const again = await h.router.deliver({ childSessionId: CHILD, message: 'same' });
      expect(again.reason).toBe('duplicate-report');
      expect(again.pending).toBeUndefined();
      expect(h.registry.get(CHILD)?.heldReports).toHaveLength(1);
    });

    it('applies the burst limit before holding', async () => {
      const h = createSessionHarness();
      for (let i = 0; i < AGENT_REPORT_BURST_LIMIT; i++) {
        await h.router.deliver({ childSessionId: CHILD, message: `n ${i}` });
      }
      h.active.delete(PARENT);
      const over = await h.router.deliver({ childSessionId: CHILD, message: 'more' });
      expect(over.reason).toBe('rate-limited');
      expect(h.registry.get(CHILD)?.heldReports).toBeUndefined();
    });

    it('restores held reports when the flush send fails, then sends them in order', async () => {
      const h = createSessionHarness({ activeIds: [] });
      await h.router.deliver({ childSessionId: CHILD, message: 'first' });
      await h.router.deliver({ childSessionId: CHILD, message: 'second' });
      h.active.add(PARENT);
      h.sendMessageToSession.mockRejectedValueOnce(new Error('busy'));

      await h.fireActivity(PARENT_SDK);
      expect(h.registry.get(CHILD)?.heldReports?.map((r) => r.message)).toEqual([
        'first',
        'second',
      ]);
      expect(h.registry.get(CHILD)?.reportsDelivered).toBe(0);
      expect(h.logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ childSessionId: CHILD, parentSessionId: PARENT }),
      );

      await h.fireActivity(PARENT_SDK);
      const bodies = h.sendMessageToSession.mock.calls.slice(1).map((c) => String(c[1]));
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toContain('\nfirst\n');
      expect(bodies[1]).toContain('\nsecond\n');
      expect(h.registry.get(CHILD)?.reportsDelivered).toBe(2);
      expect(h.registry.get(CHILD)?.heldReports).toBeUndefined();
    });

    it('counts every refusal that has a record and logs the reason and both parent ids', async () => {
      const h = createSessionHarness();
      await h.router.deliver({ childSessionId: CHILD, message: 'same' });
      await h.router.deliver({ childSessionId: CHILD, message: 'same' });
      await h.router.deliver({
        childSessionId: CHILD,
        message: 'x'.repeat(MAX_AGENT_REPORT_LENGTH + 1),
      });
      expect(h.registry.get(CHILD)?.reportsRefused).toBe(2);
      for (const reason of ['duplicate-report', 'report-too-large']) {
        expect(h.logger.warn).toHaveBeenCalledWith(
          '[AgentReportRouter] Session child report refused',
          expect.objectContaining({
            reason,
            childSessionId: CHILD,
            parentSessionId: PARENT,
            parentSdkSessionId: PARENT_SDK,
          }),
        );
      }
    });

    describe('review round: ordering, owner checks and trust (TASK_2026_2298)', () => {
      const lineageEdge = (from: string, to: string) => ({
        predecessorTabId: from,
        predecessorSdkId: null,
        successorTabId: to,
        successorSdkId: null,
        workspaceRoot: '/ws',
        handoffPath: '/ws/HANDOFF.md',
        state: 'recorded',
      });
      const deferred = () => {
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        const promise = new Promise<void>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { promise, resolve, reject };
      };

      it('keeps the rest of a drain for the new owner when the child is re-parented mid-drain', async () => {
        const h = createSessionHarness({ activeIds: [] });
        await h.router.deliver({ childSessionId: CHILD, message: 'A' });
        await h.router.deliver({ childSessionId: CHILD, message: 'B' });
        h.active.add(PARENT);
        const first = deferred();
        h.sendMessageToSession.mockImplementationOnce(() => first.promise);

        const drain = h.router.flushHeldSessionChildReports();
        await settle();
        expect(sentTo(h)).toEqual([PARENT]);
        h.registry.reparent(CHILD, P1, P1_SDK);
        first.resolve();
        await drain;

        expect(sentTo(h)).toEqual([PARENT]);
        expect(h.registry.get(CHILD)?.heldReports?.map((r) => r.message)).toEqual(['B']);

        h.addSession(P1, P1_SDK);
        h.active.add(P1);
        await h.fireActivity(P1_SDK);
        expect(sentTo(h)).toEqual([PARENT, P1]);
        expect(h.registry.get(CHILD)?.heldReports).toBeUndefined();
      });

      it('flushes for an owner reached only through two lineage edges', async () => {
        const h = createSessionHarness({
          activeIds: [],
          ackRecords: [lineageEdge(PARENT, P1), lineageEdge(P1, P2)],
        });
        expect(
          (await h.router.deliver({ childSessionId: CHILD, message: 'wait' })).pending,
        ).toBe(true);
        h.active.add(P2);
        // The event carries P2's id, which no child record names.
        await h.fireActivity(P2);
        expect(sentTo(h)).toEqual([P2]);
        expect(h.registry.get(CHILD)?.heldReports).toBeUndefined();
      });

      it('sends a fresh report after older held ones, and holds it behind them after a middle failure', async () => {
        const h = createSessionHarness({ activeIds: [] });
        for (const m of ['one', 'two', 'three']) {
          await h.router.deliver({ childSessionId: CHILD, message: m });
        }
        h.active.add(PARENT);
        h.sendMessageToSession
          .mockImplementationOnce(() => Promise.resolve())
          .mockImplementationOnce(() => Promise.reject(new Error('busy')));

        const fresh = await h.router.deliver({ childSessionId: CHILD, message: 'four' });
        expect(fresh).toMatchObject({ delivered: false, pending: true });
        expect(h.registry.get(CHILD)?.heldReports?.map((r) => r.message)).toEqual([
          'two',
          'three',
          'four',
        ]);
        expect(h.registry.get(CHILD)?.reportsDelivered).toBe(1);

        await h.fireActivity(PARENT_SDK);
        const bodies = h.sendMessageToSession.mock.calls.map((c) => String(c[1]));
        expect(bodies.map((b) => b.match(/\n(\w+)\n/)?.[1])).toEqual([
          'one',
          'two',
          'two',
          'three',
          'four',
        ]);
        expect(h.registry.get(CHILD)?.heldReports).toBeUndefined();
      });

      it('runs two concurrent reports one after the other, so a duplicate is refused', async () => {
        const h = createSessionHarness();
        const gate = deferred();
        h.sendMessageToSession.mockImplementationOnce(() => gate.promise);
        const a = h.router.deliver({ childSessionId: CHILD, message: 'twin' });
        const b = h.router.deliver({ childSessionId: CHILD, message: 'twin' });
        await settle();
        gate.resolve();
        const results = await Promise.all([a, b]);
        expect(results.map((r) => r.delivered)).toEqual([true, false]);
        expect(results[1].reason).toBe('duplicate-report');
        expect(h.sendMessageToSession).toHaveBeenCalledTimes(1);
      });

      it('does not attribute a report through an SDK id inferred from the worktree path', async () => {
        const h = createSessionHarness();
        const reservation = h.registry.reserveSlot(3);
        if (!reservation) throw new Error('expected a slot');
        h.registry.add(childRecord(C1), reservation);
        h.registry.bindSdkSessionId(C1, C2_SDK, { inferred: true });
        // Another chat in the same worktree, with its own tab and that SDK id.
        h.addSession(T2, C2_SDK);

        const viaTab = await h.router.deliver({ childSessionId: T2, message: 'x' });
        const viaSdk = await h.router.deliver({ childSessionId: C2_SDK, message: 'y' });
        expect(viaTab.reason).toBe('unattributed-caller');
        expect(viaSdk.reason).toBe('unattributed-caller');
        expect(h.sendMessageToSession).not.toHaveBeenCalled();

        // The child's own session-id event confirms the binding.
        h.registry.bindSdkSessionId(C1, C2_SDK);
        expect((await h.router.deliver({ childSessionId: T2, message: 'z' })).delivered).toBe(
          true,
        );
      });

      it('refuses a fresh report when the owner changes during a failed drain', async () => {
        const h = createSessionHarness({ activeIds: [] });
        await h.router.deliver({ childSessionId: CHILD, message: 'A' });
        h.active.add(PARENT);
        const first = deferred();
        h.sendMessageToSession.mockImplementationOnce(() => first.promise);
        const fresh = h.router.deliver({ childSessionId: CHILD, message: 'B' });
        await settle();
        h.registry.reparent(CHILD, P1, P1_SDK);
        first.reject(new Error('busy'));
        const result = await fresh;
        expect(result).toMatchObject({
          delivered: false,
          reason: 'parent-session-not-active',
          detail: 'the recorded parent changed while the report was routed; send the report again',
        });
        expect(result.pending).toBeUndefined();
        expect(h.registry.get(CHILD)?.heldReports?.map((r) => r.message)).toEqual(['A']);
      });

      it('drains each waiting child on its own, so a busy parent blocks no other child', async () => {
        const h = createSessionHarness({ activeIds: [] });
        const reservation = h.registry.reserveSlot(3);
        if (!reservation) throw new Error('expected a slot');
        h.registry.add(
          childRecord(C1, { parentSessionId: P1, parentSdkSessionId: P1_SDK }),
          reservation,
        );
        await h.router.deliver({ childSessionId: CHILD, message: 'to parent' });
        await h.router.deliver({ childSessionId: C1, message: 'to p1' });
        h.active.add(PARENT);
        h.active.add(P1);
        const busy = deferred();
        h.sendMessageToSession.mockImplementationOnce(() => busy.promise);
        await h.fireActivity(P1_SDK);
        expect(sentTo(h)).toEqual([PARENT, P1]);
        expect(h.registry.get(C1)?.heldReports).toBeUndefined();
        busy.resolve();
        await settle();
        expect(h.registry.get(CHILD)?.heldReports).toBeUndefined();
      });

      it('sends no held report after dispose', async () => {
        const h = createSessionHarness({ activeIds: [] });
        await h.router.deliver({ childSessionId: CHILD, message: 'late' });
        h.active.add(PARENT);
        h.router.dispose();
        await h.router.flushHeldSessionChildReports();
        expect(h.sendMessageToSession).not.toHaveBeenCalled();
        expect(h.registry.get(CHILD)?.heldReports).toHaveLength(1);
      });

      it('returns fixed failure text and keeps the runtime error in the log only', async () => {
        const h = createSessionHarness({
          sendImpl: () => Promise.reject(new Error('session 1234 not found')),
        });
        const result = await h.router.deliver({ childSessionId: CHILD, message: 'x' });
        expect(result.detail).not.toContain('1234');
      });
    });
  });
});

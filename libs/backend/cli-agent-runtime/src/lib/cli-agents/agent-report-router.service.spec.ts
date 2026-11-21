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
import { SessionChildRegistry } from '../session-children/session-child.registry';
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

  function createSessionHarness(
    options: {
      activeIds?: readonly string[];
      sendImpl?: () => Promise<void>;
      withRegistry?: boolean;
      handoffBinding?: { successorTabId: string; successorSdkId: string };
      findBySuccessor?: jest.Mock;
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
      {
        childSessionId: CHILD,
        sdkSessionId: CHILD_SDK,
        parentSessionId: PARENT,
        parentSdkSessionId: PARENT_SDK,
        label: 'auth-fix',
        task: 'fix auth',
        branch: 'feat/auth-fix',
        baseRef: 'abc',
        workspaceRoot: '/ws',
        worktreePath: '/ws-wt/auth-fix',
        deliverables: [],
        subagentPtahTools: 'available',
        startedAt: '2026-10-01T10:00:00.000Z',
        turnsSettled: 0,
        reportsDelivered: 0,
        reportsRefused: 0,
      },
      reservation,
    );
    const router = new AgentReportRouter(
      logger,
      manager,
      { isSessionActive, sendMessageToSession } as never,
      options.withRegistry === false ? null : registry,
      null,
      null,
      options.findBySuccessor
        ? ({
            findBySuccessor: options.findBySuccessor,
            records: jest.fn().mockResolvedValue([]),
          } as never)
        : options.handoffBinding
          ? ({
              findBySuccessor: jest
                .fn()
                .mockResolvedValue({
                  ...options.handoffBinding,
                  state: 'recorded',
                }),
              records: jest.fn().mockResolvedValue([]),
            } as never)
          : null,
    );
    return {
      router,
      logger,
      registry,
      manager,
      active,
      isSessionActive,
      sendMessageToSession,
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
    await handoffs.record({
      predecessorTabId: PARENT,
      predecessorSdkId: null,
      successorTabId: PARENT_SDK,
      successorSdkId: null,
      workspaceRoot: '/ws',
      handoffPath: '/ws/HANDOFF.md',
      state: 'recorded',
    });
    const router = new AgentReportRouter(
      h.logger,
      h.manager,
      {
        isSessionActive: h.isSessionActive,
        sendMessageToSession: h.sendMessageToSession,
      } as never,
      h.registry,
      null,
      null,
      new SessionHandoffAckStore(storage),
    );
    expect(
      await router.deliver({ childSessionId: CHILD, message: 'done' }),
    ).toMatchObject({ delivered: true, parentSessionId: PARENT_SDK });
    expect(h.sendMessageToSession).toHaveBeenCalledWith(
      PARENT_SDK,
      expect.any(String),
      expect.any(Object),
    );
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
      return {
        successorTabId: successor,
        successorSdkId: successorSdk,
        state: 'recorded',
      };
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

    expect(result).toEqual({ delivered: false, reason: 'unattributed-caller' });
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

  it('counts and does not queue a report while the parent is not live and no durable inbox exists', async () => {
    const h = createSessionHarness({ activeIds: [] });

    const result = await h.router.deliver({
      childSessionId: CHILD,
      message: 'long body\nsecond line',
    });

    expect(result).toEqual({
      delivered: false,
      reason: 'parent-session-not-active',
    });
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
    const child = h.registry.get(CHILD);
    expect(child?.reportsRefused).toBe(1);
    expect(child?.lastRefusedReport).toBe('long body');
    expect(child?.reportsDelivered).toBe(0);

    // Nothing was queued: the parent coming back does not replay it.
    h.active.add(PARENT);
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
  });

  it('does not reroute a session-child report to a live SDK id when its recorded parent is dead', async () => {
    const h = createSessionHarness({ activeIds: [PARENT_SDK] });

    const result = await h.router.deliver({
      childSessionId: CHILD,
      message: 'finished',
    });

    expect(result).toEqual({
      delivered: false,
      reason: 'parent-session-not-active',
    });
    expect(h.isSessionActive).toHaveBeenCalledWith(PARENT);
    expect(h.isSessionActive).not.toHaveBeenCalledWith(PARENT_SDK);
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
    expect(h.registry.get(CHILD)?.lastRefusedReport).toBe('finished');
  });

  it('records the given summary as the last refused report', async () => {
    const h = createSessionHarness({ activeIds: [] });

    await h.router.deliver({
      childSessionId: CHILD,
      message: 'body',
      summary: '  blocked on creds ',
    });

    expect(h.registry.get(CHILD)?.lastRefusedReport).toBe('blocked on creds');
  });

  it('refuses when the recorded parent tab is gone despite a live SDK id', async () => {
    const h = createSessionHarness({ activeIds: [PARENT_SDK] });

    const result = await h.router.deliver({
      childSessionId: CHILD,
      message: 'hi',
    });

    expect(result).toEqual({
      delivered: false,
      reason: 'parent-session-not-active',
    });
    expect(h.sendMessageToSession).not.toHaveBeenCalled();
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

  it('reports delivery-failed and counts nothing when the runtime rejects the turn', async () => {
    const h = createSessionHarness({
      sendImpl: () => Promise.reject(new Error('session busy')),
    });

    const result = await h.router.deliver({
      childSessionId: CHILD,
      message: 'x',
    });

    expect(result.reason).toBe('delivery-failed');
    expect(h.registry.get(CHILD)?.reportsDelivered).toBe(0);
    expect(h.registry.get(CHILD)?.reportsRefused).toBe(0);
  });

  describe('durable parent inbox', () => {
    const SUCCESSOR = 'dddddddd-2222-4333-8444-555555555555';

    async function durableSession(
      options: {
        activeIds?: readonly string[];
        storage?: FakeStateStorage;
      } = {},
    ) {
      const h = createSessionHarness({ activeIds: options.activeIds ?? [] });
      const storage = options.storage ?? new FakeStateStorage();
      const store = new ParentEnvelopeStoreService(h.logger, storage);
      await store.ready;
      const handoffs = new SessionHandoffAckStore(storage);
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
        h.registry,
        handoffs,
      );
      const router = new AgentReportRouter(
        h.logger,
        h.manager,
        adapter,
        h.registry,
        drainer,
        null,
        handoffs,
      );
      return { ...h, storage, store, handoffs, drainer, router };
    }

    afterEach(() => jest.restoreAllMocks());

    it('queues a report for an inactive parent and delivers it once when the parent is active', async () => {
      const d = await durableSession();
      const result = await d.router.deliver({
        childSessionId: CHILD,
        message: 'queued body',
      });
      expect(result).toEqual({
        delivered: false,
        queued: true,
        receiptId: expect.any(String),
        receiptState: 'pending',
      });
      const [entry] = d.store.list(PARENT_SDK);
      expect(entry).toMatchObject({
        id: result.receiptId,
        originKind: 'session',
        agentId: CHILD,
        state: 'pending',
      });
      expect(d.sendMessageToSession).not.toHaveBeenCalled();
      expect(d.registry.get(CHILD)?.reportsDelivered).toBe(0);

      d.active.add(PARENT_SDK);
      await d.drainer.drain(PARENT_SDK);
      await d.drainer.drain(PARENT_SDK);
      expect(d.sendMessageToSession).toHaveBeenCalledTimes(1);
      expect(d.sendMessageToSession).toHaveBeenCalledWith(
        PARENT_SDK,
        expect.stringContaining('queued body'),
        expect.objectContaining({
          origin: expect.objectContaining({
            kind: 'peer',
            from: `ptah-session:${CHILD}`,
            name: 'session · auth-fix',
          }),
        }),
      );
      expect(d.registry.get(CHILD)?.reportsDelivered).toBe(1);
      expect(d.registry.get(CHILD)?.reportsRefused).toBe(0);
      d.drainer.dispose();
    });

    it('replays a report queued for a predecessor to its successor exactly once', async () => {
      const d = await durableSession();
      await d.handoffs.record({
        predecessorTabId: PARENT,
        predecessorSdkId: null,
        successorTabId: SUCCESSOR,
        successorSdkId: null,
        workspaceRoot: '/ws',
        handoffPath: '/ws/HANDOFF.md',
        state: 'recorded',
      });
      const result = await d.router.deliver({
        childSessionId: CHILD,
        message: 'for successor',
      });
      expect(result).toMatchObject({ delivered: false, queued: true });
      expect(d.store.list(SUCCESSOR)).toHaveLength(1);

      d.active.add(SUCCESSOR);
      await d.drainer.drain(SUCCESSOR);
      await d.drainer.drain(SUCCESSOR);
      expect(d.sendMessageToSession).toHaveBeenCalledTimes(1);
      expect(d.sendMessageToSession).toHaveBeenCalledWith(
        SUCCESSOR,
        expect.any(String),
        expect.any(Object),
      );
      expect(d.registry.get(CHILD)?.reportsDelivered).toBe(1);
      d.drainer.dispose();
    });

    it('refuses an unknown caller without queueing', async () => {
      const d = await durableSession();
      expect(
        await d.router.deliver({ childSessionId: 'nobody', message: 'x' }),
      ).toEqual({ delivered: false, reason: 'unattributed-caller' });
      expect(d.store.list()).toHaveLength(0);
      d.drainer.dispose();
    });

    it('keeps a queued report unsent when its owner changed before the parent came back', async () => {
      const d = await durableSession();
      const result = await d.router.deliver({
        childSessionId: CHILD,
        message: 'stale',
      });
      expect(result).toMatchObject({ queued: true });
      d.registry.reparent(
        CHILD,
        SUCCESSOR,
        'eeeeeeee-2222-4333-8444-555555555555',
      );

      d.active.add(PARENT_SDK);
      await d.drainer.drain(PARENT_SDK);
      expect(d.sendMessageToSession).not.toHaveBeenCalled();
      // No handoff edge proves the change, and a partial lineage read can hide
      // one, so the report waits (never sent) instead of being cancelled.
      expect(d.store.list(PARENT_SDK)).toEqual([
        expect.objectContaining({
          id: result.receiptId,
          state: 'blocked-retryable',
          lastError: 'owner-lineage-unverified',
        }),
      ]);
      expect(d.registry.get(CHILD)?.reportsDelivered).toBe(0);
      d.drainer.dispose();
    });

    it('refuses an owner change seen before queueing', async () => {
      const d = await durableSession();
      const findBySuccessor = jest.fn(async () => {
        d.registry.reparent(
          CHILD,
          SUCCESSOR,
          'eeeeeeee-2222-4333-8444-555555555555',
        );
        return undefined;
      });
      jest
        .spyOn(d.handoffs, 'findBySuccessor')
        .mockImplementation(findBySuccessor as never);
      expect(
        await d.router.deliver({ childSessionId: CHILD, message: 'raced' }),
      ).toMatchObject({
        delivered: false,
        reason: 'parent-session-not-active',
      });
      expect(d.store.list()).toHaveLength(0);
      expect(d.registry.get(CHILD)?.reportsRefused).toBe(1);
      d.drainer.dispose();
    });

    it('applies the burst limit and duplicate check to queued reports', async () => {
      const d = await durableSession();
      for (let n = 0; n < AGENT_REPORT_BURST_LIMIT; n++) {
        expect(
          await d.router.deliver({ childSessionId: CHILD, message: `q-${n}` }),
        ).toMatchObject({ delivered: false, queued: true });
      }
      expect(
        await d.router.deliver({ childSessionId: CHILD, message: 'one more' }),
      ).toMatchObject({ delivered: false, reason: 'rate-limited' });
      expect(d.store.list(PARENT_SDK)).toHaveLength(AGENT_REPORT_BURST_LIMIT);
      d.drainer.dispose();

      const e = await durableSession();
      expect(
        await e.router.deliver({ childSessionId: CHILD, message: 'same' }),
      ).toMatchObject({ queued: true });
      expect(
        await e.router.deliver({ childSessionId: CHILD, message: 'same' }),
      ).toEqual({ delivered: false, reason: 'duplicate-report' });
      expect(e.store.list(PARENT_SDK)).toHaveLength(1);
      e.drainer.dispose();
    });

    it('returns the same receipt for a repeat outside the duplicate window', async () => {
      const d = await durableSession();
      const first = await d.router.deliver({
        childSessionId: CHILD,
        message: 'again',
      });
      const now = Date.now();
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(now + AGENT_REPORT_BURST_WINDOW_MS + 1);
      const second = await d.router.deliver({
        childSessionId: CHILD,
        message: 'again',
      });
      expect(second).toEqual({
        delivered: false,
        queued: true,
        receiptId: first.receiptId,
        receiptState: 'pending',
      });
      expect(d.store.list(PARENT_SDK)).toHaveLength(1);
      d.drainer.dispose();
    });

    it('does not report a repeat of a cancelled report as queued', async () => {
      const d = await durableSession();
      const first = await d.router.deliver({
        childSessionId: CHILD,
        message: 'dropped',
      });
      await d.drainer.cancel(first.receiptId as string);
      const now = Date.now();
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(now + AGENT_REPORT_BURST_WINDOW_MS + 1);
      expect(
        await d.router.deliver({ childSessionId: CHILD, message: 'dropped' }),
      ).toEqual({
        delivered: false,
        reason: 'delivery-failed',
        receiptId: first.receiptId,
        receiptState: 'cancelled',
      });
      expect(d.registry.get(CHILD)?.reportsRefused).toBe(1);
      d.drainer.dispose();
    });

    it('maps a failed persist to storage-unavailable and counts it as refused', async () => {
      const storage = new FakeStateStorage();
      const d = await durableSession({ storage });
      storage.failWrites = () => true;
      expect(
        await d.router.deliver({ childSessionId: CHILD, message: 'x' }),
      ).toEqual({ delivered: false, reason: 'storage-unavailable' });
      expect(d.registry.get(CHILD)?.reportsRefused).toBe(1);
      storage.failWrites = () => false;
      expect(
        await d.router.deliver({ childSessionId: CHILD, message: 'x' }),
      ).toMatchObject({ queued: true });
      d.drainer.dispose();
    });

    it('maps a frozen parent to parent-session-deleted and counts it as refused', async () => {
      const d = await durableSession();
      await d.store.markIntent(PARENT_SDK);
      expect(
        await d.router.deliver({ childSessionId: CHILD, message: 'x' }),
      ).toEqual({ delivered: false, reason: 'parent-session-deleted' });
      expect(d.registry.get(CHILD)?.reportsRefused).toBe(1);
      d.drainer.dispose();
    });

    it('maps a full parent inbox to parent-inbox-full and counts it as refused', async () => {
      const d = await durableSession();
      for (let n = 0; n < 64; n++)
        await d.store.enqueue({
          id: `lane-delivery:report:other:${n}:h`,
          dedupeKey: `report:other:${n}:h`,
          agentId: 'other',
          parentSessionId: PARENT_SDK,
          kind: 'report',
          body: 'b',
          createdAt: n,
        });
      expect(
        await d.router.deliver({ childSessionId: CHILD, message: 'x' }),
      ).toEqual({ delivered: false, reason: 'parent-inbox-full' });
      expect(d.registry.get(CHILD)?.reportsRefused).toBe(1);
      d.drainer.dispose();
    });

    describe('review fixes (TASK_2026_2297 P3)', () => {
      const NEW_SDK = 'ffffffff-2222-4333-8444-555555555555';
      const afterWindow = () => {
        const now = Date.now();
        jest
          .spyOn(Date, 'now')
          .mockReturnValue(now + AGENT_REPORT_BURST_WINDOW_MS + 1);
      };

      it('refuses a report whose owner changes while the store write is held', async () => {
        const d = await durableSession();
        const original = d.store.enqueueAdmitted.bind(d.store);
        jest
          .spyOn(d.store, 'enqueueAdmitted')
          .mockImplementation(async (input, admit) => {
            d.registry.reparent(CHILD, SUCCESSOR, NEW_SDK);
            return original(input, admit);
          });
        expect(
          await d.router.deliver({ childSessionId: CHILD, message: 'held' }),
        ).toEqual({ delivered: false, reason: 'parent-session-not-active' });
        expect(d.store.list()).toHaveLength(0);
        expect(d.registry.get(CHILD)?.reportsRefused).toBe(1);
        d.drainer.dispose();
      });

      it('admits a waiting report against the owner it has after an earlier report moved the child', async () => {
        const d = await durableSession();
        const original = d.store.enqueueAdmitted.bind(d.store);
        jest
          .spyOn(d.store, 'enqueueAdmitted')
          .mockImplementationOnce(async (input, admit) => {
            d.registry.reparent(CHILD, SUCCESSOR, NEW_SDK);
            return original(input, admit);
          });
        const [first, second] = await Promise.all([
          d.router.deliver({ childSessionId: CHILD, message: 'first' }),
          d.router.deliver({ childSessionId: CHILD, message: 'second' }),
        ]);
        expect(first).toEqual({
          delivered: false,
          reason: 'parent-session-not-active',
        });
        expect(second).toMatchObject({ queued: true, receiptState: 'pending' });
        expect(d.store.list(NEW_SDK)).toEqual([
          expect.objectContaining({ id: second.receiptId }),
        ]);
        d.drainer.dispose();
      });

      it('refuses a live-parent report when the saved receipts could not be restored', async () => {
        const d = await durableSession();
        d.active.add(PARENT_SDK);
        jest
          .spyOn(d.drainer, 'restored')
          .mockRejectedValueOnce(new Error('state unreadable'));
        const result = await d.router.deliver({
          childSessionId: CHILD,
          message: 'needs restore',
        });
        expect(result).toMatchObject({
          delivered: false,
          reason: 'delivery-failed',
        });
        expect(d.sendMessageToSession).not.toHaveBeenCalled();
        d.drainer.dispose();
      });

      it('creates a new receipt for the new owner when the same text follows a reparent', async () => {
        const d = await durableSession();
        const first = await d.router.deliver({
          childSessionId: CHILD,
          message: 'same text',
        });
        d.registry.reparent(CHILD, SUCCESSOR, NEW_SDK);
        afterWindow();
        const second = await d.router.deliver({
          childSessionId: CHILD,
          message: 'same text',
        });
        expect(second).toMatchObject({ queued: true, receiptState: 'pending' });
        expect(second.receiptId).not.toBe(first.receiptId);
        expect(d.store.list(PARENT_SDK)).toEqual([
          expect.objectContaining({ id: first.receiptId }),
        ]);
        expect(d.store.list(NEW_SDK)).toEqual([
          expect.objectContaining({ id: second.receiptId, state: 'pending' }),
        ]);
        d.drainer.dispose();
      });

      it('keeps reports apart whose text and summary only differ at a NUL boundary', async () => {
        const d = await durableSession();
        const one = await d.router.deliver({
          childSessionId: CHILD,
          message: 'a\0b',
          summary: 'c',
        });
        const two = await d.router.deliver({
          childSessionId: CHILD,
          message: 'a',
          summary: 'b\0c',
        });
        expect(one.receiptId).toBeDefined();
        expect(two.receiptId).toBeDefined();
        expect(two.receiptId).not.toBe(one.receiptId);
        expect(d.store.list(PARENT_SDK)).toHaveLength(2);

        const key = (
          AgentReportRouter as unknown as {
            sessionReportKey(
              id: string,
              binding: { tab?: string; sdk?: string },
              message: string,
            ): string;
          }
        ).sessionReportKey;
        expect(key(CHILD, { tab: PARENT, sdk: 'a\0b' }, 'c')).not.toBe(
          key(CHILD, { tab: PARENT, sdk: 'a' }, 'b\0c'),
        );
        expect(key(CHILD, { tab: PARENT, sdk: PARENT_SDK }, 'm')).toMatch(
          /^session-report:v2:/,
        );
        d.drainer.dispose();
      });

      it('refuses a message at the tool limit whose rendered envelope exceeds the stored body cap', async () => {
        const d = await durableSession();
        const result = await d.router.deliver({
          childSessionId: CHILD,
          message: 'x'.repeat(MAX_AGENT_REPORT_LENGTH),
        });
        expect(result).toEqual({
          delivered: false,
          reason: 'report-too-large',
        });
        expect(d.store.list()).toHaveLength(0);
        expect(d.sendMessageToSession).not.toHaveBeenCalled();
        d.drainer.dispose();

        const live = createSessionHarness();
        expect(
          await live.router.deliver({
            childSessionId: CHILD,
            message: 'x'.repeat(MAX_AGENT_REPORT_LENGTH),
          }),
        ).toEqual({ delivered: false, reason: 'report-too-large' });
        expect(live.sendMessageToSession).not.toHaveBeenCalled();
      });

      it('keys an offline report to the parent SDK id so a reopen on a new tab delivers it', async () => {
        const d = await durableSession();
        const result = await d.router.deliver({
          childSessionId: CHILD,
          message: 'for the reopened parent',
        });
        expect(result).toMatchObject({ queued: true });
        expect(d.store.list(PARENT)).toHaveLength(0);
        expect(d.store.list(PARENT_SDK)).toEqual([
          expect.objectContaining({ id: result.receiptId }),
        ]);

        // The parent reopens on a new tab without a handoff; its SDK session
        // is the same, so its activity drains the SDK-keyed inbox.
        d.active.add(PARENT_SDK);
        await d.drainer.drain(PARENT_SDK);
        expect(d.sendMessageToSession).toHaveBeenCalledTimes(1);
        expect(d.sendMessageToSession).toHaveBeenCalledWith(
          PARENT_SDK,
          expect.stringContaining('for the reopened parent'),
          expect.any(Object),
        );
        expect(d.registry.get(CHILD)?.reportsDelivered).toBe(1);
        d.drainer.dispose();
      });

      it('accepts exactly the burst limit from parallel reports of one child', async () => {
        const d = await durableSession();
        const results = await Promise.all(
          Array.from({ length: AGENT_REPORT_BURST_LIMIT + 1 }, (_, n) =>
            d.router.deliver({ childSessionId: CHILD, message: `p-${n}` }),
          ),
        );
        expect(results.filter((r) => r.queued === true)).toHaveLength(
          AGENT_REPORT_BURST_LIMIT,
        );
        expect(results.filter((r) => r.reason === 'rate-limited')).toHaveLength(
          1,
        );
        expect(d.store.list(PARENT_SDK)).toHaveLength(AGENT_REPORT_BURST_LIMIT);
        d.drainer.dispose();
      });

      it('returns one receipt for the same message with a different summary and spends no budget on it', async () => {
        const d = await durableSession();
        const remember = jest.spyOn(
          d.router as unknown as { remember: (...args: unknown[]) => void },
          'remember',
        );
        const first = await d.router.deliver({
          childSessionId: CHILD,
          message: 'one row',
          summary: 'first summary',
        });
        afterWindow();
        const second = await d.router.deliver({
          childSessionId: CHILD,
          message: 'one row',
          summary: 'second summary',
        });
        expect(second).toEqual({
          delivered: false,
          queued: true,
          receiptId: first.receiptId,
          receiptState: 'pending',
        });
        expect(d.store.list(PARENT_SDK)).toHaveLength(1);
        expect(remember).toHaveBeenCalledTimes(1);
        d.drainer.dispose();
      });

      it('maps each stored receipt state of a repeat explicitly', async () => {
        const d = await durableSession();
        const first = await d.router.deliver({
          childSessionId: CHILD,
          message: 'stateful',
        });
        const id = first.receiptId as string;
        afterWindow();
        const repeat = () =>
          d.router.deliver({ childSessionId: CHILD, message: 'stateful' });

        await d.store.markDeferred(id, 'waiting-for-binding', 60_000);
        expect(await repeat()).toEqual({
          delivered: false,
          queued: true,
          receiptId: id,
          receiptState: 'blocked-retryable',
        });

        await d.store.markSending(id);
        expect(await repeat()).toEqual({
          delivered: false,
          reason: 'delivery-in-progress',
          receiptId: id,
          receiptState: 'sending',
        });

        await d.store.markOutcomeUnknown(id, 'send-timeout');
        expect(await repeat()).toEqual({
          delivered: false,
          reason: 'delivery-outcome-unknown',
          receiptId: id,
          receiptState: 'outcome-unknown',
        });
        expect(d.registry.get(CHILD)?.reportsRefused).toBe(0);
        d.drainer.dispose();
      });

      it.each([
        ['outcome-unknown', 'delivery-outcome-unknown'],
        ['sending', 'delivery-in-progress'],
      ] as const)(
        'does not send a repeat directly to an active parent while its saved receipt is %s',
        async (state, reason) => {
          const d = await durableSession();
          const remember = jest.spyOn(
            d.router as unknown as { remember: (...args: unknown[]) => void },
            'remember',
          );
          const first = await d.router.deliver({
            childSessionId: CHILD,
            message: 'maybe sent',
          });
          const id = first.receiptId as string;
          await d.store.markSending(id);
          if (state === 'outcome-unknown')
            await d.store.markOutcomeUnknown(id, 'send-timeout');
          d.isSessionActive.mockImplementation(() => true);
          afterWindow();
          expect(
            await d.router.deliver({
              childSessionId: CHILD,
              message: 'maybe sent',
            }),
          ).toEqual({
            delivered: false,
            reason,
            receiptId: id,
            receiptState: state,
          });
          expect(d.sendMessageToSession).not.toHaveBeenCalled();
          expect(remember).toHaveBeenCalledTimes(1);
          expect(d.store.list(PARENT_SDK)).toHaveLength(1);
          d.drainer.dispose();
        },
      );

      it('reports a delivered repeat as delivered to the stored parent', async () => {
        const d = await durableSession();
        const first = await d.router.deliver({
          childSessionId: CHILD,
          message: 'done once',
        });
        await d.store.markSending(first.receiptId as string);
        const entry = d.store.list(PARENT_SDK)[0];
        await d.store.markDelivered(entry.dedupeKey);
        afterWindow();
        expect(
          await d.router.deliver({ childSessionId: CHILD, message: 'done once' }),
        ).toEqual({ delivered: true, parentSessionId: PARENT_SDK });
        d.drainer.dispose();
      });
    });
  });
});

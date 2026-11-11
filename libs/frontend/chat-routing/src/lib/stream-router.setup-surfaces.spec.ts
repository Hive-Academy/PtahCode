/** Prompt routing across interactive and background Setup Hub surfaces. */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  SurfaceId,
  TabId,
  TabManagerService,
  TabSessionBinding,
  type ClaudeSessionId,
  type ClosedTabEvent,
} from '@ptah-extension/chat-state';
import {
  AgentMonitorStore,
  BackgroundAgentStore,
  BatchedUpdateService,
  ExecutionTreeBuilderService,
  PermissionHandlerService,
  StreamingHandlerService,
} from '@ptah-extension/chat-streaming';
import {
  createEmptyStreamingState,
  type StreamingState,
} from '@ptah-extension/chat-types';
import type { PermissionRequest } from '@ptah-extension/shared';
import { StreamRouter } from './stream-router.service';
import { StreamingSurfaceRegistry } from './streaming-surface-registry.service';
import { WorkflowSessionClaimService } from './workflow-session-claim.service';

const REAL_SESSION = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' as ClaudeSessionId;
const OTHER_SESSION = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' as ClaudeSessionId;

function makeQuestion(overrides: {
  id: string;
  sessionId?: string;
  tabId?: string;
}) {
  return {
    question: 'pick one',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
    ...overrides,
  };
}

function makePermission(
  overrides: Partial<PermissionRequest> = {},
): PermissionRequest {
  return {
    id: 'perm-1',
    toolName: 'Bash',
    toolInput: {},
    toolUseId: 'tool-1',
    timestamp: 1,
    description: 'Run a command',
    timeoutAt: 0,
    ...overrides,
  } as PermissionRequest;
}

function makeTabManagerMock() {
  const tabs = signal<{ id: string; claudeSessionId: string | null }[]>([]);
  const closedTab = signal<ClosedTabEvent | null>(null);
  const closedTabListeners = new Set<(event: ClosedTabEvent) => void>();
  const activeTabId = signal<string | null>(null);
  return {
    tabs: tabs.asReadonly(),
    closedTab: closedTab.asReadonly(),
    onTabClosed: (listener: (event: ClosedTabEvent) => void) => {
      closedTabListeners.add(listener);
      return () => closedTabListeners.delete(listener);
    },
    activeTabId: activeTabId.asReadonly(),
    _setActiveTabId: (id: string | null) => activeTabId.set(id),
  };
}

function makePermissionHandlerMock() {
  const questionTargets = new Map<string, readonly string[]>();
  const promptTargets = new Map<string, readonly string[]>();
  const questionResponses: { id: string }[] = [];
  const promptResponses: { id: string; decision: string }[] = [];
  return {
    attachPromptTargets: jest.fn((id: string, ids: readonly string[]) => {
      if (ids.length > 0) promptTargets.set(id, [...ids]);
    }),
    targetTabsFor: jest.fn((id: string) => promptTargets.get(id) ?? []),
    cancelPrompt: jest.fn(),
    handlePermissionResponse: jest.fn(
      (r: { id: string; decision: string }) => void promptResponses.push(r),
    ),
    attachQuestionTargets: jest.fn((id: string, ids: readonly string[]) => {
      if (ids.length > 0) questionTargets.set(id, [...ids]);
    }),
    questionTargetTabsFor: jest.fn(
      (id: string) => questionTargets.get(id) ?? [],
    ),
    clearQuestionTargets: jest.fn(
      (id: string) => void questionTargets.delete(id),
    ),
    cancelQuestion: jest.fn(),
    handleQuestionResponse: jest.fn(
      (r: { id: string }) => void questionResponses.push(r),
    ),
    questionRequests: signal<unknown[]>([]).asReadonly(),
    decisionPulse: signal(null).asReadonly(),
    _questionTargets: questionTargets,
    _promptTargets: promptTargets,
    _questionResponses: questionResponses,
    _promptResponses: promptResponses,
  };
}

describe('StreamRouter — prompt routing across every Setup Hub workflow', () => {
  let router: StreamRouter;
  let binding: TabSessionBinding;
  let surfaceRegistry: StreamingSurfaceRegistry;
  let claims: WorkflowSessionClaimService;
  let permissionHandler: ReturnType<typeof makePermissionHandlerMock>;
  let tabManager: ReturnType<typeof makeTabManagerMock>;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    tabManager = makeTabManagerMock();
    permissionHandler = makePermissionHandlerMock();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: TabManagerService, useValue: tabManager },
        {
          provide: StreamingHandlerService,
          useValue: { cleanupSessionDeduplication: jest.fn() },
        },
        {
          provide: AgentMonitorStore,
          useValue: {
            clearSessionAgents: jest.fn(),
            forceClearSessionAgents: jest.fn(),
          },
        },
        {
          provide: BackgroundAgentStore,
          useValue: { clearSession: jest.fn() },
        },
        {
          provide: BatchedUpdateService,
          useValue: { clearPendingUpdates: jest.fn() },
        },
        {
          provide: ExecutionTreeBuilderService,
          useValue: {
            clearForTab: jest.fn(),
            clearForClosedTab: jest.fn(),
            clearForSession: jest.fn(),
            clearCache: jest.fn(),
          },
        },
        { provide: PermissionHandlerService, useValue: permissionHandler },
      ],
    });

    router = TestBed.inject(StreamRouter);
    binding = TestBed.inject(TabSessionBinding);
    surfaceRegistry = TestBed.inject(StreamingSurfaceRegistry);
    claims = TestBed.inject(WorkflowSessionClaimService);
    TestBed.tick();
  });

  afterEach(() => warnSpy.mockRestore());

  /** Register a surface adapter the way a host would. */
  function registerSurface(interactive: boolean): SurfaceId {
    const surfaceId = SurfaceId.create();
    let state: StreamingState = createEmptyStreamingState();
    surfaceRegistry.register(
      surfaceId,
      () => state,
      (next) => {
        state = next;
      },
      { interactive },
    );
    return surfaceId;
  }

  /**
   * What `HarnessChatLauncherService` does for New Project and AI Team Builder:
   * mint a standard chat tab (`TabId`) and bind it in `StreamRouter` with NO
   * `StreamingSurfaceRegistry` adapter or `WorkflowSessionClaimService` claim.
   */
  function startHarnessChatTab(): { tabId: TabId } {
    const tabId = TabId.create();
    router.onTabCreated(tabId);
    return { tabId };
  }

  // ── the two interactive harness chat workflows ───────────────────────────

  describe.each([
    ['New Project', 'harness-new-project'],
    ['AI Team Builder', 'harness-configure'],
  ] as const)(
    '%s (%s standard chat tab)',
    (card) => {
      it('routes a question raised BEFORE the SDK session id exists directly to the chat tab', () => {
        const { tabId } = startHarnessChatTab();

        // Pre-`init`: the backend stamps the originating tabId on both fields.
        const resolved = router.routeQuestionPrompt(
          makeQuestion({
            id: `q-${card}-pre`,
            tabId: tabId as string,
            sessionId: tabId as string,
          }),
        );

        expect(resolved).toEqual([tabId]);
        expect(permissionHandler._questionTargets.get(`q-${card}-pre`)).toEqual(
          [tabId],
        );
        expect(router.interactiveSurfaceOwning({ tabId: tabId as string })).toBeNull();
        expect(permissionHandler.handleQuestionResponse).not.toHaveBeenCalled();
      });

      it('routes a question raised AFTER session:id-resolved to the chat tab', () => {
        const { tabId } = startHarnessChatTab();
        // `ChatMessageHandler.handleSessionIdResolved` appends the real session id.
        router.onTabCreated(tabId, REAL_SESSION);

        const resolved = router.routeQuestionPrompt(
          makeQuestion({
            id: `q-${card}-post`,
            tabId: tabId as string,
            sessionId: REAL_SESSION as unknown as string,
          }),
        );

        expect(resolved).toEqual([tabId]);
        expect(
          permissionHandler._questionTargets.get(`q-${card}-post`),
        ).toEqual([tabId]);
      });

      it('routes a permission prompt directly to the chat tab', () => {
        const { tabId } = startHarnessChatTab();

        const resolved = router.routePermissionPrompt(
          makePermission({
            id: `p-${card}`,
            tabId: tabId as string,
            sessionId: tabId as string,
          }),
        );

        expect(resolved).toEqual([tabId]);
        expect(permissionHandler._promptTargets.get(`p-${card}`)).toEqual([
          tabId,
        ]);
        expect(
          permissionHandler.handlePermissionResponse,
        ).not.toHaveBeenCalled();
      });

      it('survives tab rehydration — reopened tab bound to persisted session receives question carrying stale tabId', () => {
        const staleTabId = TabId.create() as string;
        const rehydratedTab = TabId.create();
        router.onTabCreated(rehydratedTab, REAL_SESSION);

        const resolved = router.routeQuestionPrompt(
          makeQuestion({
            id: `q-${card}-reload`,
            tabId: staleTabId,
            sessionId: REAL_SESSION as unknown as string,
          }),
        );

        expect(resolved).toEqual([rehydratedTab]);
        expect(
          permissionHandler._questionTargets.get(`q-${card}-reload`),
        ).toEqual([rehydratedTab]);
      });

      it('does not leak onto another chat tab bound to a different session', () => {
        const { tabId } = startHarnessChatTab();
        const strangerTab = TabId.create();
        router.onTabCreated(strangerTab, OTHER_SESSION);

        router.routeQuestionPrompt(
          makeQuestion({
            id: `q-${card}-isolation`,
            tabId: tabId as string,
            sessionId: tabId as string,
          }),
        );

        expect(
          permissionHandler._questionTargets.get(`q-${card}-isolation`),
        ).toEqual([tabId]);
        expect(
          permissionHandler._questionTargets.get(`q-${card}-isolation`),
        ).not.toContain(strangerTab as string);
      });
    },
  );

  // ── Workspace Analysis (setup wizard) ────────────────────────────────────

  describe('Workspace Analysis (setup wizard phase surface)', () => {
    /** `SetupWizardStateService.registerPhaseSurface` — no claim, background. */
    function registerPhaseSurface(): SurfaceId {
      const surfaceId = registerSurface(false);
      router.onSurfaceCreated(surfaceId, REAL_SESSION);
      return surfaceId;
    }

    it('keeps auto-answering questions — the phase runs full-auto with no card', () => {
      registerPhaseSurface();

      router.routeQuestionPrompt(
        makeQuestion({
          id: 'q-wizard',
          sessionId: REAL_SESSION as unknown as string,
        }),
      );

      expect(permissionHandler.attachQuestionTargets).not.toHaveBeenCalled();
      expect(permissionHandler.handleQuestionResponse).toHaveBeenCalledWith({
        id: 'q-wizard',
        answers: {},
      });
    });

    it('keeps auto-denying permissions', () => {
      registerPhaseSurface();

      router.routePermissionPrompt(
        makePermission({
          id: 'p-wizard',
          sessionId: REAL_SESSION as unknown as string,
        }),
      );

      expect(permissionHandler.attachPromptTargets).not.toHaveBeenCalled();
      expect(permissionHandler.handlePermissionResponse).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p-wizard', decision: 'deny' }),
      );
    });

    it('a stray claim on a background surface does not make it a prompt target', () => {
      const surfaceId = registerPhaseSurface();
      const correlationId = TabId.create() as string;
      claims.claim(correlationId, surfaceId);

      router.routeQuestionPrompt(
        makeQuestion({
          id: 'q-wizard-claimed',
          tabId: correlationId,
          sessionId: REAL_SESSION as unknown as string,
        }),
      );

      expect(permissionHandler.attachQuestionTargets).not.toHaveBeenCalled();
      expect(permissionHandler.handleQuestionResponse).toHaveBeenCalledWith({
        id: 'q-wizard-claimed',
        answers: {},
      });
    });
  });

  describe('two workflows live at once', () => {
    it('a harness chat tab question, another chat tab question, and a background analysis surface stay isolated', () => {
      const { tabId: harnessTab } = startHarnessChatTab();
      const chatTab = TabId.create();
      router.onTabCreated(chatTab, OTHER_SESSION);
      const analysisSurface = registerSurface(false);
      router.onSurfaceCreated(analysisSurface, REAL_SESSION);

      router.routeQuestionPrompt(
        makeQuestion({
          id: 'q-harness',
          tabId: harnessTab as string,
          sessionId: harnessTab as string,
        }),
      );
      router.routeQuestionPrompt(
        makeQuestion({
          id: 'q-chat-tab',
          tabId: chatTab as string,
          sessionId: OTHER_SESSION as unknown as string,
        }),
      );
      router.routeQuestionPrompt(
        makeQuestion({
          id: 'q-analysis',
          sessionId: REAL_SESSION as unknown as string,
        }),
      );

      expect(permissionHandler._questionTargets.get('q-harness')).toEqual([
        harnessTab,
      ]);
      expect(permissionHandler._questionTargets.get('q-chat-tab')).toEqual([
        chatTab,
      ]);
      expect(permissionHandler._questionTargets.has('q-analysis')).toBe(false);
      expect(permissionHandler.handleQuestionResponse).toHaveBeenCalledWith({
        id: 'q-analysis',
        answers: {},
      });
    });

    it('closing a harness chat tab unbinds its conversation and stops routing pre-session prompts to it', () => {
      const { tabId } = startHarnessChatTab();
      router.onTabClosed(tabId);

      router.routeQuestionPrompt(
        makeQuestion({
          id: 'q-after-close',
          tabId: tabId as string,
          sessionId: tabId as string,
        }),
      );

      expect(permissionHandler.attachQuestionTargets).not.toHaveBeenCalled();
      expect(binding.conversationFor(tabId)).toBeNull();
    });
  });
});

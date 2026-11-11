/**
 * R4 gate for TASK_2026_187 Unit 5 (Batch 4).
 *
 * Batch 4 does two things that could silently break push-message delivery:
 *   1. It flips `TASKS_VIEW_COMPONENT`, `HARNESS_BUILDER_COMPONENT` and
 *      `SETUP_HUB_COMPONENT` to deferred `LazyViewLoader` arrows, so neither
 *      `tasks-ui`'s board nor the former harness-builder views are in the initial
 *      bundle any more.
 *   2. It repoints two composition-root imports from the libs' WIDE barrels to
 *      new services-only barrels (`@ptah-extension/tasks-ui/services`,
 *      `@ptah-extension/harness-builder/services`).
 *
 * Either change could drop a `MESSAGE_HANDLERS` registration. The failure mode
 * is silent: the app still boots, chat still works, the bundle still shrinks,
 * and `tasks:changed` / `harness:*` / `setup-wizard:*` push events simply stop
 * landing.
 *
 * "The service is still in the providers array" is NOT the assertion that
 * catches this — the provider list is exactly what the barrel swap could have
 * broken. So this spec, like its precedents `editor-message-routing.spec.ts`
 * (Batch 1) and `thoth-message-routing.spec.ts` (Batch 3), wires the REAL
 * `MessageRouterService` to the REAL services through the SAME `useExisting`
 * `MESSAGE_HANDLERS` registrations `app.config.ts` uses, imports each service
 * through the SAME specifier production now takes, dispatches genuine `window`
 * `MessageEvent`s carrying the literal wire strings, and asserts an observable
 * effect on each service.
 *
 * Crucially, it does all of that WITHOUT ever instantiating
 * `TasksViewComponent`, the removed setup views — i.e. it reproduces the exact condition R4 is about:
 * the app sitting on chat with those views never opened.
 *
 * `SetupWizardStateService` is included even though the wizard was NOT deferred
 * (it is a launch surface — see R15 in the Batch 4 report): its registration
 * sits in the same provider block and is worth pinning.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ClaudeRpcService,
  FILE_LINK_OPENER,
  MESSAGE_HANDLERS,
  MessageRouterService,
  SurfaceRouterService,
  SURFACE_ACTIVE,
  surfaceActiveFor,
  VSCodeService,
} from '@ptah-extension/core';
import { MESSAGE_TYPES } from '@ptah-extension/shared';
import {
  StreamRouter,
  StreamingSurfaceRegistry,
} from '@ptah-extension/chat-routing';
// `HarnessWorkflowMessageHandler` reaches `TabManagerService` (via
// `HarnessWorkflowService` → `PermissionHandlerService`), which injects the
// inverted-dependency `MODEL_REFRESH_CONTROL` token. `app.config.ts:181` binds
// it with this exact helper, so the spec uses the same one rather than a
// hand-rolled stub — same precedent as `thoth-message-routing.spec.ts`.
import {
  HarnessChatProposalStore,
  provideHarnessChatProposalStore,
  provideModelRefreshControl,
} from '@ptah-extension/chat';
import { HarnessHealthStore } from '@ptah-extension/marketplace/services';

// The three services under test, each imported through the SAME specifier
// `app.config.ts` uses. If an entry point ever stops exporting one of them,
// this file fails to compile — the cheapest possible R4 check.
// TASK_2026_871: `TasksStore` is no longer a bootstrap handler (it lives in
// the lazy board chunk); `tasks:changed` lands on the eager feed, which relays
// it to the store once the board has opened.
// TASK_2026_933: `HarnessWorkflowMessageHandler` was replaced at bootstrap by
// `provideHarnessChatProposalStore()` so `harness:config-proposed` broadcasts
// land in `HarnessChatProposalStore` even before a chat session mounts.
import { TasksChangedFeed } from '@ptah-extension/tasks-ui/presentation';
import { SetupWizardStateService } from '@ptah-extension/setup-wizard';

/**
 * The literal strings the backend broadcasts. Hard-coded on purpose: if a
 * shared constant is ever edited, this spec fails rather than silently
 * agreeing with the new value.
 */
const WIRE = {
  tasksChanged: 'tasks:changed',
  harnessConfigProposed: 'harness:config-proposed',
  wizardScanProgress: 'setup-wizard:scan-progress',
} as const;

function makeVscodeStub() {
  const config = signal({
    isVSCode: false,
    theme: 'dark',
    workspaceRoot: '/ws/a',
    workspaceName: 'a',
    extensionUri: '',
    baseUri: '',
    iconUri: '',
    userIconUri: '',
    panelId: '',
    isElectron: true,
  });
  return {
    config: config.asReadonly(),
    isConnected: signal(false).asReadonly(),
    getState: jest.fn().mockReturnValue(null),
    setState: jest.fn(),
    postMessage: jest.fn(),
    messages$: { pipe: jest.fn() },
    handleMessage: jest.fn(),
    handledMessageTypes: [],
  };
}

function dispatch(type: string, payload?: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', { data: { type, payload } }),
  );
}

async function flushProposalStore(
  store: HarnessChatProposalStore,
): Promise<void> {
  // Allow the router's scheduled drain, then await the store's pending queue.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await store.handleMessage({ type: '__test_flush__' });
}

describe('initial setup bundle boundary', () => {
  it('does not route or import any harness-builder symbols in app.routes.ts or app.config.ts', () => {
    const routes = readFileSync(join(__dirname, 'app.routes.ts'), 'utf8');
    const config = readFileSync(join(__dirname, 'app.config.ts'), 'utf8');
    for (const name of [
      'HarnessBuilderViewComponent',
      'HarnessBuilderSidebarComponent',
      'SetupHubComponent',
      'HarnessWorkflowMessageHandler',
    ]) {
      expect(routes).not.toContain(name);
      expect(config).not.toContain(name);
    }
    expect(routes).not.toContain('@ptah-extension/harness-builder');
    expect(config).not.toContain('@ptah-extension/harness-builder');
  });
});

describe('Unit 5 push-message delivery with tasks and onboarding never opened (R4)', () => {
  let router: MessageRouterService;
  let tasks: TasksChangedFeed;
  let proposals: HarnessChatProposalStore;
  let wizard: SetupWizardStateService;
  let rpcCall: jest.Mock;

  beforeEach(() => {
    // Root services built here (model list, effort) issue RPCs at construction;
    // the stub keeps them off the wire.
    rpcCall = jest.fn().mockResolvedValue({
      isSuccess: () => false,
      data: null,
      error: new Error('stubbed'),
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: VSCodeService, useValue: makeVscodeStub() },
        {
          provide: SurfaceRouterService,
          useValue: { currentSurface: signal('chat') },
        },
        { provide: SURFACE_ACTIVE, useFactory: surfaceActiveFor('chat') },
        {
          provide: HarnessHealthStore,
          useValue: { refresh: jest.fn().mockResolvedValue(undefined) },
        },
        // Required port with no default provider (`app.config.ts` binds it to
        // `FileLinkRouterService`); stubbed rather than dragged in, which would
        // defeat this spec's "no deferred component" premise.
        { provide: FILE_LINK_OPENER, useValue: { open: jest.fn() } },
        {
          provide: ClaudeRpcService,
          useValue: { call: rpcCall },
        },
        // SetupWizardStateService registers a streaming surface on construction.
        {
          provide: StreamRouter,
          useValue: {
            onSurfaceCreated: jest.fn(),
            onSurfaceClosed: jest.fn(),
            routeStreamEventForSurface: jest.fn().mockReturnValue(null),
          },
        },
        {
          provide: StreamingSurfaceRegistry,
          useValue: {
            register: jest.fn(),
            unregister: jest.fn(),
            getAdapter: jest.fn().mockReturnValue(null),
          },
        },
        ...provideModelRefreshControl(),
        MessageRouterService,
        // Mirrors app.config.ts exactly — same token, same useExisting shape.
        {
          provide: MESSAGE_HANDLERS,
          useExisting: TasksChangedFeed,
          multi: true,
        },
        ...provideHarnessChatProposalStore(),
        {
          provide: MESSAGE_HANDLERS,
          useExisting: SetupWizardStateService,
          multi: true,
        },
      ],
    });

    tasks = TestBed.inject(TasksChangedFeed);
    proposals = TestBed.inject(HarnessChatProposalStore);
    wizard = TestBed.inject(SetupWizardStateService);
    // Constructing the router builds the handler map, which reads
    // handledMessageTypes off all three services. A dropped registration or a
    // barrel that no longer resolves the class explodes here.
    router = TestBed.inject(MessageRouterService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.clearAllMocks();
  });

  it('registers all three services with the router without instantiating any deferred component', () => {
    expect(router).toBeTruthy();
    const registered = TestBed.inject(MESSAGE_HANDLERS);
    expect(registered).toEqual(
      expect.arrayContaining([tasks, proposals, wizard]),
    );
  });

  it('the shared constants hold the exact strings the backend broadcasts', () => {
    expect(MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED).toBe(
      WIRE.harnessConfigProposed,
    );
  });

  it('routes tasks:changed to the eager TasksChangedFeed, which relays it raw', () => {
    const relayed: unknown[] = [];
    tasks.listenRaw((payload) => relayed.push(payload));

    // No `workspaceRoot`: the feed's validated stream drops it, but the raw
    // relay (what the lazily constructed `TasksStore` listens on) still gets
    // it — the store's "refresh the active workspace" branch depends on that.
    dispatch(WIRE.tasksChanged, {});
    dispatch(WIRE.tasksChanged, { workspaceRoot: '/ws/a', reason: 'watcher' });

    expect(relayed).toEqual([
      {},
      { workspaceRoot: '/ws/a', reason: 'watcher' },
    ]);
    expect(tasks.changes()?.change).toEqual({
      workspaceRoot: '/ws/a',
      reason: 'watcher',
    });
  });

  it('routes harness:config-proposed to HarnessChatProposalStore', async () => {
    dispatch(WIRE.harnessConfigProposed, {
      sessionId: 'session-a',
      configUpdates: {
        name: 'Delivered Team',
      },
      isConfigComplete: true,
    });
    await flushProposalStore(proposals);
    expect(proposals.proposalFor('session-a')?.configUpdates.name).toBe(
      'Delivered Team',
    );
    expect(proposals.proposalFor('session-a')?.isConfigComplete).toBe(true);
  });

  it('drops a malformed harness:config-proposed payload without throwing', async () => {
    dispatch(WIRE.harnessConfigProposed, { sessionId: '' });
    await flushProposalStore(proposals);
    expect(proposals.proposals().size).toBe(0);
  });

  it('routes setup-wizard:scan-progress to SetupWizardStateService', () => {
    expect(wizard.scanProgress()).toBeNull();

    dispatch(WIRE.wizardScanProgress, {
      filesScanned: 7,
      totalFiles: 42,
      detections: ['angular'],
    });

    const progress = wizard.scanProgress();
    expect(progress).not.toBeNull();
    expect(progress?.filesScanned).toBe(7);
    expect(progress?.totalFiles).toBe(42);
    expect(progress?.detections).toEqual(['angular']);
  });

  it('keeps every registration live across a second dispatch of each type', async () => {
    const relayed: unknown[] = [];
    tasks.listenRaw((payload) => relayed.push(payload));

    dispatch(WIRE.tasksChanged, {});
    dispatch(WIRE.harnessConfigProposed, {
      sessionId: 'session-b',
      configUpdates: { name: 'Second Team' },
      isConfigComplete: false,
    });
    dispatch(WIRE.wizardScanProgress, {
      filesScanned: 1,
      totalFiles: 2,
      detections: [],
    });

    await flushProposalStore(proposals);

    expect(relayed).toEqual([{}]);
    expect(proposals.proposalFor('session-b')?.configUpdates.name).toBe(
      'Second Team',
    );
    expect(wizard.scanProgress()?.totalFiles).toBe(2);
  });
});

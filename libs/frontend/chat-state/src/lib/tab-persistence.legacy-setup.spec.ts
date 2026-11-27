/**
 * Legacy Setup tabs are dropped on restore and handed off once (D6,
 * TASK_2026_2330).
 *
 * Setup runs moved out of chat tabs into Setup records. A stored tab with the
 * `setup-agent-generation` or `setup-project-prompt` workflow is removed from
 * the restored set; with a known workspace it is queued for
 * `consumeLegacySetupTabs`, which `SetupRunStore` drains on init. Other
 * workflow tabs restore unchanged, and the two Setup workflows are never
 * written to storage again.
 */

import { TestBed } from '@angular/core/testing';
import type { TabState } from '@ptah-extension/chat-types';
import { ConfirmationDialogService } from './confirmation-dialog.service';
import { ConversationRegistry } from './conversation-registry.service';
import {
  MODEL_REFRESH_CONTROL,
  type ModelRefreshControl,
} from './model-refresh-control';
import { TabManagerService } from './tab-manager.service';
import { TabSessionBinding } from './tab-session-binding.service';
import { TabWorkspacePartitionService } from './tab-workspace-partition.service';
import {
  PERSISTED_TAB_STATE_VERSION,
  buildPersistedTabState,
  consumeLegacySetupTabs,
  sanitizeRestoredTabs,
} from './tab-persistence';

const WORKSPACE_PATH = '/ws/legacy-setup';

function storedTab(id: string, workflow?: string): TabState {
  return {
    id,
    name: id,
    title: id,
    order: 0,
    status: 'loaded',
    isDirty: false,
    lastActivityAt: 0,
    claudeSessionId: `sess-${id}`,
    messages: [],
    streamingState: null,
    ...(workflow === undefined ? {} : { workflow }),
  } as unknown as TabState;
}

const STORED_SET: readonly TabState[] = [
  storedTab('chat'),
  storedTab('agents', 'setup-agent-generation'),
  storedTab('harness', 'harness-configure'),
  storedTab('guidance', 'setup-project-prompt'),
  storedTab('phase', 'setup-wizard-phase'),
];

beforeEach(() => {
  // Module-level queue: start every case empty.
  consumeLegacySetupTabs();
});

describe('sanitizeRestoredTabs — legacy Setup tabs', () => {
  it('drops both Setup workflows and keeps every other tab in order', () => {
    const restored = sanitizeRestoredTabs(STORED_SET, WORKSPACE_PATH);
    expect(restored.map((tab) => tab.id)).toEqual(['chat', 'harness', 'phase']);
    expect(restored.find((tab) => tab.id === 'harness')?.workflow).toBe(
      'harness-configure',
    );
  });

  it('queues the dropped tabs with their workspace for one hand-off', () => {
    sanitizeRestoredTabs(STORED_SET, WORKSPACE_PATH);
    expect(consumeLegacySetupTabs()).toEqual([
      {
        tabId: 'agents',
        workflow: 'setup-agent-generation',
        workspacePath: WORKSPACE_PATH,
      },
      {
        tabId: 'guidance',
        workflow: 'setup-project-prompt',
        workspacePath: WORKSPACE_PATH,
      },
    ]);
    expect(consumeLegacySetupTabs()).toEqual([]);
  });

  it('does not queue the same tab twice when a workspace is read again', () => {
    sanitizeRestoredTabs(STORED_SET, WORKSPACE_PATH);
    sanitizeRestoredTabs(STORED_SET, WORKSPACE_PATH);
    expect(consumeLegacySetupTabs()).toHaveLength(2);
  });

  it('drops without a hand-off entry when the workspace is unknown', () => {
    const restored = sanitizeRestoredTabs(STORED_SET);
    expect(restored.map((tab) => tab.id)).toEqual(['chat', 'harness', 'phase']);
    sanitizeRestoredTabs(STORED_SET, '   ');
    expect(consumeLegacySetupTabs()).toEqual([]);
  });
});

describe('buildPersistedTabState — legacy Setup tabs', () => {
  it('never writes a Setup workflow tab', () => {
    const envelope = buildPersistedTabState(STORED_SET, 'chat');
    expect(envelope.tabs.map((tab) => tab.id)).toEqual([
      'chat',
      'harness',
      'phase',
    ]);
    expect(envelope.activeTabId).toBe('chat');
  });

  it('writes a null active id when it pointed at a dropped Setup tab', () => {
    expect(buildPersistedTabState(STORED_SET, 'guidance').activeTabId).toBe(
      null,
    );
  });
});

describe('workspace reader — legacy Setup tabs', () => {
  let tabManager: TabManagerService;
  let partition: TabWorkspacePartitionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        TabManagerService,
        TabWorkspacePartitionService,
        ConversationRegistry,
        TabSessionBinding,
        ConfirmationDialogService,
        {
          provide: MODEL_REFRESH_CONTROL,
          useValue: {
            refreshModels: jest.fn().mockResolvedValue(undefined),
          } as unknown as ModelRefreshControl,
        },
      ],
    });
    tabManager = TestBed.inject(TabManagerService);
    partition = TestBed.inject(TabWorkspacePartitionService);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('restores without the Setup tabs and hands them off under the workspace', () => {
    localStorage.setItem(
      partition.getStorageKeyForWorkspace(WORKSPACE_PATH),
      JSON.stringify({
        version: PERSISTED_TAB_STATE_VERSION,
        activeTabId: 'agents',
        tabs: STORED_SET,
      }),
    );
    tabManager.switchWorkspace(WORKSPACE_PATH);

    expect(tabManager.tabs().map((tab) => tab.id)).toEqual([
      'chat',
      'harness',
      'phase',
    ]);
    expect(tabManager.tabs().some((tab) => tab.id === 'agents')).toBe(false);
    expect(consumeLegacySetupTabs().map((entry) => entry.tabId)).toEqual([
      'agents',
      'guidance',
    ]);
  });
});

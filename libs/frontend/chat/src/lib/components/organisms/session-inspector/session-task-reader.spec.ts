import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AppStateManager,
  ClaudeRpcService,
  FILE_LINK_OPENER,
  LoggingService,
  RpcResult,
  VSCodeService,
  rpcCall,
} from '@ptah-extension/core';
import { TasksChangedFeed } from '@ptah-extension/tasks-ui/presentation';
import type {
  ChatSessionSummary,
  SessionGetOrganizationResult,
  SessionOrganizationSummary,
  SessionTaskLinkSummary,
  TaskDigest,
  TaskDigestDocument,
  TasksListFolderEntriesResult,
} from '@ptah-extension/shared';
import { ChatStore } from '../../../services/chat.store';
import { SessionOrganizationCache } from '../../../services/session-organization/session-organization-cache.store';
import { documentExcerpt, SessionTaskReader } from './session-task-reader';

describe('task document helpers', () => {
  it('strips immediately closed front matter and preserves its body', () => {
    expect(documentExcerpt('---\n---\nFirst line\nSecond line')).toBe('First line\nSecond line');
    expect(documentExcerpt('---\nnot closed\n\nBody\n---\nTail')).toContain('Body');
    expect(documentExcerpt('---\nBody text\n---\nTail')).toContain('Body text');
  });

  it('limits excerpts to 12 lines and 1500 characters', () => {
    const lines = Array.from({ length: 13 }, (_, index) => `Line ${index + 1}`);
    expect(documentExcerpt(lines.join('\n'))).toBe(`${lines.slice(0, 12).join('\n')}…`);
    expect(documentExcerpt('x'.repeat(1501))).toBe(`${'x'.repeat(1500)}…`);
  });

});

jest.mock('@ptah-extension/core', () => {
  const actual = jest.requireActual('@ptah-extension/core');
  return { ...actual, rpcCall: jest.fn() };
});

function digestDocument(name: string, openable = true): TaskDigestDocument {
  return {
    name, openable, kind: 'other', group: name, revision: 0, latest: true,
    readable: null, extraction: 'none', size: 100, mtime: 100,
  };
}

function digestFor(taskId: string, overrides: Partial<TaskDigest> = {}): TaskDigest {
  return {
    task: {
      id: taskId, folderName: taskId, title: taskId, status: 'backlog', type: null,
      dependsOn: [], labels: [], duplicates: [], relatesTo: [], created: null, updated: null,
      frontmatterValid: true, validationIssues: [],
    },
    truncated: false,
    truncatedReasons: [],
    entryCount: 3,
    lastModified: null,
    documents: [digestDocument('task.md'), digestDocument('context.md'), digestDocument('implementation-plan.md')],
    counts: {
      carrier: 1, handoff: 0, requirements: 1, design: 0, plan: 1,
      batches: 0, decisions: 0, reviews: 0, reports: 0, other: 0,
    },
    ...overrides,
  };
}

type Response = Awaited<ReturnType<typeof rpcCall>>;

function ok(data: object): Response {
  return { success: true, data };
}

function markdown(taskId: string, file: string, state = 'ready', content = 'Document'): Response {
  return ok({ taskId, file, state, content });
}

function organization(
  overrides: Partial<SessionOrganizationSummary> = {},
): SessionOrganizationSummary {
  return {
    priority: 'normal',
    status: 'active',
    pinned: false,
    worktreePath: null,
    branch: null,
    parentSessionId: null,
    forkOfSessionId: null,
    startedBy: 'user',
    tasks: [],
    prLinks: [],
    childCount: 0,
    updatedAt: null,
    todos: null,
    ...overrides,
  };
}

type OrganizationRead = RpcResult<SessionGetOrganizationResult>;

function okRead(summary: SessionOrganizationSummary): OrganizationRead {
  return new RpcResult<SessionGetOrganizationResult>(true, {
    ok: true,
    organization: summary,
  });
}

function notFoundRead(): OrganizationRead {
  return new RpcResult<SessionGetOrganizationResult>(true, {
    ok: false,
    reason: 'session-not-found',
    message: 'not found',
  });
}

/** Let the queued cache read, its awaited RPC result and the code after run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

describe('SessionTaskReader workspace identity', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('drops an old root response and opens only the new root task folder', async () => {
    const workspace = signal('C:/first');
    const link = {
      taskId: 'TASK_1',
      role: 'primary',
      source: 'user',
      createdAt: 1,
      missing: false,
    };
    const sessions = signal([
      { id: 'session-1', organization: { tasks: [link] } },
    ]);
    const open = jest.fn().mockResolvedValue(undefined);
    const reads: Array<(result: Awaited<ReturnType<typeof rpcCall>>) => void> = [];
    const rpc = jest.mocked(rpcCall);
    rpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          reads.push(resolve);
        }),
    );
    TestBed.configureTestingModule({
      providers: [
        SessionTaskReader,
        { provide: ChatStore, useValue: { organizationAvailable: () => true, sessions } },
        { provide: ClaudeRpcService, useValue: { call: jest.fn() } },
        { provide: LoggingService, useValue: { warn: jest.fn(), error: jest.fn() } },
        {
          provide: TabManagerService,
          useValue: {
            findTabByIdAcrossWorkspaces: () => ({
              tab: { claudeSessionId: 'session-1' },
              workspacePath: workspace(),
            }),
          },
        },
        { provide: AppStateManager, useValue: { workspaceInfo: () => null } },
        { provide: VSCodeService, useValue: {} },
        { provide: TasksChangedFeed, useValue: { changes: () => null } },
        { provide: FILE_LINK_OPENER, useValue: { open } },
      ],
    });
    const reader = TestBed.inject(SessionTaskReader);
    reader.bind(signal('tab-1'));
    TestBed.tick();
    expect(reads).toHaveLength(1);

    reads[0]({
      success: true,
      data: { digest: digestFor('TASK_1', { entryCount: 41 }) },
    });
    await Promise.resolve();
    expect(reader.state()?.data?.digest?.entryCount).toBe(41);
    reader.retry();
    expect(reads).toHaveLength(2);

    workspace.set('C:/second');
    expect(reader.state()?.status).toBe('loading');
    await reader.openDocument('task.md');
    expect(open).not.toHaveBeenCalled();
    TestBed.tick();
    reads[1]({
      success: true,
      data: { digest: digestFor('TASK_1', { entryCount: 41 }) },
    });
    await Promise.resolve();
    TestBed.tick();
    expect(reader.state()?.data?.task).toBeNull();
    expect(reads).toHaveLength(3);

    reads[2]({
      success: true,
      data: { digest: digestFor('TASK_1', { entryCount: 42 }) },
    });
    await Promise.resolve();
    expect(reader.state()?.data?.digest?.entryCount).toBe(42);
    const opening = reader.openDocument('task.md');
    expect(rpc).toHaveBeenLastCalledWith(expect.anything(), 'tasks:readFolderMarkdown', {
      workspaceRoot: 'C:/second', taskId: 'TASK_1', file: 'task.md',
    });
    reads[3](markdown('TASK_1', 'task.md'));
    await opening;
    expect(open).toHaveBeenCalledWith({
      path: 'C:/second/.ptah/specs/TASK_1/task.md',
      origin: undefined,
    });
  });
});

describe('SessionTaskReader organization cache', () => {
  const TASK_A: SessionTaskLinkSummary = {
    taskId: 'TASK_A',
    role: 'primary',
    source: 'user',
    createdAt: 1,
    missing: false,
  };
  const TASK_B: SessionTaskLinkSummary = {
    taskId: 'TASK_B',
    role: 'primary',
    source: 'user',
    createdAt: 2,
    missing: false,
  };

  let sessions: WritableSignal<readonly ChatSessionSummary[]>;
  let cacheReads: jest.Mock;
  let cache: SessionOrganizationCache;
  let reader: SessionTaskReader;

  beforeEach(() => {
    sessions = signal<readonly ChatSessionSummary[]>([]);
    cacheReads = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        SessionTaskReader,
        {
          provide: ChatStore,
          useValue: { sessions, organizationAvailable: signal(true) },
        },
        { provide: ClaudeRpcService, useValue: { call: cacheReads } },
        { provide: LoggingService, useValue: { warn: jest.fn(), error: jest.fn() } },
        {
          provide: TabManagerService,
          useValue: {
            findTabByIdAcrossWorkspaces: () => ({
              tab: { claudeSessionId: 'session-1' },
              workspacePath: 'C:/ws',
            }),
          },
        },
        { provide: AppStateManager, useValue: { workspaceInfo: () => null } },
        { provide: VSCodeService, useValue: {} },
        { provide: TasksChangedFeed, useValue: { changes: () => null } },
        { provide: FILE_LINK_OPENER, useValue: { open: jest.fn() } },
      ],
    });
    jest
      .mocked(rpcCall)
      .mockImplementation(() => new Promise(() => undefined));
    cache = TestBed.inject(SessionOrganizationCache);
    reader = TestBed.inject(SessionTaskReader);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('shows the section for a tab whose session row is not in the loaded list', async () => {
    cacheReads.mockResolvedValue(okRead(organization({ tasks: [TASK_A] })));
    reader.bind(signal('tab-1'));
    TestBed.tick();
    await settle();

    expect(cacheReads).toHaveBeenCalledWith('session:getOrganization', {
      sessionId: 'session-1',
    });
    expect(reader.link()?.lead.taskId).toBe('TASK_A');
    expect(reader.state()).not.toBeNull();
    expect(reader.state()?.data?.lead.taskId).toBe('TASK_A');
  });

  it('updates the link when a session:organizationChanged push re-reads the cache', async () => {
    cacheReads.mockResolvedValueOnce(okRead(organization({ tasks: [TASK_A] })));
    reader.bind(signal('tab-1'));
    TestBed.tick();
    await settle();
    expect(reader.link()?.lead.taskId).toBe('TASK_A');

    cacheReads.mockResolvedValueOnce(okRead(organization({ tasks: [TASK_B] })));
    cache.onOrganizationChanged(['session-1']);
    await settle();

    expect(cacheReads).toHaveBeenCalledTimes(2);
    expect(reader.link()?.lead.taskId).toBe('TASK_B');
    expect(reader.state()?.data?.lead.taskId).toBe('TASK_B');
  });

  it('keeps the section hidden when the session has no linked tasks', async () => {
    cacheReads.mockResolvedValueOnce(okRead(organization({ tasks: [] })));
    reader.bind(signal('tab-1'));
    TestBed.tick();
    await settle();

    expect(reader.link()).toBeNull();
    expect(reader.state()).toBeNull();
  });

  it('keeps the section hidden when the session organization is unknown', async () => {
    cacheReads.mockResolvedValueOnce(notFoundRead());
    reader.bind(signal('tab-1'));
    TestBed.tick();
    await settle();

    expect(reader.link()).toBeNull();
    expect(reader.state()).toBeNull();
  });
});

describe('SessionTaskReader digest and documents', () => {
  const link = (taskId: string): SessionTaskLinkSummary => ({
    taskId, role: 'primary', source: 'user', createdAt: 1, missing: false,
  });

  type Pending = {
    method: string;
    params: unknown;
    resolve: (value: Response) => void;
    reject: (reason: Error) => void;
  };
  type Change = { workspaceRoot: string; folderNames?: string[] };
  let pending: Pending[];
  let reader: SessionTaskReader;
  let tabId: WritableSignal<string>;
  let changes: WritableSignal<{ seq: number; change: Change } | null>;
  let open: jest.Mock;

  function take(method: string): Pending {
    const index = pending.findIndex(call => call.method === method);
    expect(index).toBeGreaterThanOrEqual(0);
    return pending.splice(index, 1)[0];
  }

  async function finishDigest(digest: TaskDigest | null = digestFor('TASK_A')): Promise<void> {
    take('tasks:getDigest').resolve(ok({ digest }));
    await settle();
  }

  function folderEntries(entries: TasksListFolderEntriesResult['entries']): Response {
    return ok({ taskId: 'TASK_A', directory: '', state: 'ready', entries } satisfies TasksListFolderEntriesResult);
  }

  function notify(change: Change): void {
    changes.set({ seq: 1, change });
    TestBed.tick();
    jest.advanceTimersByTime(300);
  }

  beforeEach(() => {
    jest.useFakeTimers();
    pending = [];
    tabId = signal('tab-a');
    changes = signal<{ seq: number; change: Change } | null>(null);
    open = jest.fn().mockResolvedValue(undefined);
    const sessions = signal([
      { id: 'session-a', organization: { tasks: [link('TASK_A')] } },
      { id: 'session-b', organization: { tasks: [link('TASK_B')] } },
    ]);
    jest.mocked(rpcCall).mockClear().mockImplementation((_vscode, method, params) => new Promise((resolve, reject) => {
      pending.push({ method, params, resolve, reject });
    }));
    TestBed.configureTestingModule({ providers: [
      SessionTaskReader,
      { provide: ChatStore, useValue: { organizationAvailable: () => true, sessions } },
      { provide: LoggingService, useValue: { error: jest.fn() } },
      { provide: TabManagerService, useValue: { findTabByIdAcrossWorkspaces: (id: string) => ({
        tab: { claudeSessionId: id === 'tab-a' ? 'session-a' : 'session-b' }, workspacePath: 'C:/ws',
      }) } },
      { provide: AppStateManager, useValue: { workspaceInfo: () => null } },
      { provide: VSCodeService, useValue: {} },
      { provide: TasksChangedFeed, useValue: { changes } },
      { provide: FILE_LINK_OPENER, useValue: { open } },
    ] });
    reader = TestBed.inject(SessionTaskReader);
    reader.bind(tabId);
    TestBed.tick();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.useRealTimers();
  });

  it('loads the TaskSectionData and progress from exactly one digest RPC', async () => {
    const digest = digestFor('TASK_A', { progress: { done: 4, total: 9, source: 'batches.md' } });
    expect(reader.state()?.status).toBe('loading');
    await finishDigest(digest);
    expect(rpcCall).toHaveBeenCalledTimes(1);
    expect(rpcCall).toHaveBeenCalledWith(expect.anything(), 'tasks:getDigest', {
      workspaceRoot: 'C:/ws', taskId: 'TASK_A',
    });
    expect(reader.state()).toEqual({
      status: 'ready',
      data: {
        lead: { taskId: 'TASK_A', missing: false },
        digest, task: digest.task, stage: null,
        documents: ['task.md', 'context.md', 'implementation-plan.md'], related: [],
      },
    });
    expect(reader.state()?.data?.digest).toBe(digest);
    expect(reader.progress()).toBe(digest.progress);
  });

  it('reports no task for a successful null digest', async () => {
    await finishDigest(null);
    expect(reader.state()).toMatchObject({
      status: 'unknown',
      data: { lead: { missing: true }, digest: null, task: null, documents: [] },
    });
    expect(reader.progress()).toBeNull();
  });

  it('keeps unknown digest values absent', async () => {
    await finishDigest();
    expect(reader.progress()).toBeNull();
    expect(reader.state()?.data?.digest?.lastModified).toBeNull();
    expect(reader.state()?.data?.digest?.openQuestions).toBeUndefined();
  });

  it('drops a late digest after a lead switch and runs only one digest request at a time', async () => {
    const old = take('tasks:getDigest');
    tabId.set('tab-b');
    TestBed.tick();
    expect(reader.state()).toMatchObject({ status: 'loading', data: { lead: { taskId: 'TASK_B' }, digest: null } });
    expect(pending).toHaveLength(0);
    old.resolve(ok({ digest: digestFor('TASK_A') }));
    await settle();
    expect(reader.state()?.data?.digest).toBeNull();
    await finishDigest(digestFor('TASK_B'));
    expect(reader.state()?.data?.task?.id).toBe('TASK_B');
  });

  it('drops a digest from an earlier request after switching away and back to the same link', async () => {
    const old = take('tasks:getDigest');
    tabId.set('tab-b');
    TestBed.tick();
    tabId.set('tab-a');
    TestBed.tick();
    old.resolve(ok({ digest: digestFor('TASK_A', { entryCount: 91 }) }));
    await settle();
    expect(reader.state()).toMatchObject({ status: 'loading', data: { digest: null } });
    await finishDigest();
    expect(reader.state()?.data?.digest?.entryCount).toBe(3);
  });

  it('keeps listed files usable after an observable digest failure and replaces data on retry', async () => {
    const first = digestFor('TASK_A');
    await finishDigest(first);
    reader.retry();
    expect(reader.state()?.status).toBe('loading');
    take('tasks:getDigest').resolve({ success: false, error: 'Cannot read C:/private/workspace' });
    await settle();
    expect(pending).toHaveLength(0);
    expect(reader.state()).toMatchObject({
      status: 'error', error: 'Could not load task details',
      data: { digest: first, documents: ['task.md', 'context.md', 'implementation-plan.md'] },
    });
    const preview = reader.previewDocument('context.md');
    take('tasks:getArtifact').resolve(ok({ file: 'context.md', content: 'Still usable' }));
    await preview;
    expect(reader.preview()?.content).toBe('Still usable');

    reader.retry();
    const refreshed = digestFor('TASK_A', { progress: { done: 1, total: 1, source: 'tasks.md' } });
    await finishDigest(refreshed);
    expect(reader.state()?.status).toBe('ready');
    expect(reader.progress()).toBe(refreshed.progress);
  });

  it('previews and opens eligible top-level Markdown after a coded first digest failure', async () => {
    take('tasks:getDigest').resolve(new RpcResult(false, undefined, 'Invalid task.md at C:/private/workspace', 'INVALID_PARAMS'));
    await settle();
    const listing = take('tasks:listFolderEntries');
    expect(listing.params).toEqual({ workspaceRoot: 'C:/ws', taskId: 'TASK_A', directory: '' });
    listing.resolve(folderEntries([
      { name: 'task.md', kind: 'file' },
      { name: 'extra.md', kind: 'file' },
      { name: 'archive.md', kind: 'directory' },
      { name: 'link.md', kind: 'symlink' },
      { name: 'notes.txt', kind: 'file' },
      { name: 'nested/notes.md', kind: 'file' },
    ]));
    await settle();
    expect(reader.state()).toMatchObject({
      status: 'error',
      error: 'Could not load task details',
      data: { task: null, digest: null, documents: ['task.md', 'extra.md'] },
    });
    expect(reader.progress()).toBeNull();

    const preview = reader.previewDocument('extra.md');
    take('tasks:readFolderMarkdown').resolve(markdown('TASK_A', 'extra.md'));
    await preview;
    expect(reader.preview()).toMatchObject({ status: 'ready', content: 'Document' });

    const opening = reader.openDocument('extra.md');
    const check = take('tasks:readFolderMarkdown');
    expect(check.params).toEqual({ workspaceRoot: 'C:/ws', taskId: 'TASK_A', file: 'extra.md' });
    expect(open).not.toHaveBeenCalled();
    check.resolve(markdown('TASK_A', 'extra.md'));
    await opening;
    expect(open).toHaveBeenCalledWith({ path: 'C:/ws/.ptah/specs/TASK_A/extra.md', origin: undefined });

    reader.retry();
    await finishDigest();
    expect(reader.state()).toMatchObject({
      status: 'ready',
      data: { documents: ['task.md', 'context.md', 'implementation-plan.md'] },
    });
  });

  it('lists the fallback documents again on each failed retry and keeps the held list when the listing fails', async () => {
    const documents = () => reader.state()?.data.documents;
    take('tasks:getDigest').resolve({ success: false });
    await settle();
    take('tasks:listFolderEntries').resolve(folderEntries([{ name: 'notes.md', kind: 'file' }]));
    await settle();
    expect(documents()).toEqual(['notes.md']);

    reader.retry();
    await settle();
    take('tasks:getDigest').resolve({ success: false });
    await settle();
    take('tasks:listFolderEntries').resolve(folderEntries([{ name: 'updated-notes.md', kind: 'file' }]));
    await settle();
    expect(documents()).toEqual(['updated-notes.md']);

    reader.retry();
    await settle();
    take('tasks:getDigest').resolve({ success: false });
    await settle();
    take('tasks:listFolderEntries').reject(new Error('listing failed'));
    await settle();
    expect(reader.state()?.status).toBe('error');
    expect(documents()).toEqual(['updated-notes.md']);
  });

  it('keeps an empty file list and allows a retry when both the first digest and folder listing reject', async () => {
    take('tasks:getDigest').reject(new Error('C:/private/workspace'));
    await settle();
    take('tasks:listFolderEntries').reject(new Error('C:/private/workspace/.ptah/specs'));
    await settle();
    expect(reader.state()).toMatchObject({
      status: 'error', error: 'Could not load task details', data: { digest: null, documents: [] },
    });
    reader.retry();
    await finishDigest();
    expect(reader.state()?.status).toBe('ready');
  });

  it('drops a fallback listing after switching away and back to the same link', async () => {
    take('tasks:getDigest').resolve({ success: false });
    await settle();
    const old = take('tasks:listFolderEntries');
    tabId.set('tab-b');
    TestBed.tick();
    tabId.set('tab-a');
    TestBed.tick();
    expect(pending).toHaveLength(0);
    old.resolve(folderEntries([{ name: 'old.md', kind: 'file' }]));
    await settle();
    expect(reader.state()).toMatchObject({ status: 'loading', data: { digest: null, documents: [] } });
    await finishDigest();
    expect(reader.state()?.status).toBe('ready');
  });

  it.each([
    ['absent folder names', { workspaceRoot: 'C:/ws' }, true],
    ['the listed task folder', { workspaceRoot: 'C:/ws', folderNames: ['TASK_A'] }, true],
    ['an unlisted task folder', { workspaceRoot: 'C:/ws', folderNames: ['TASK_B'] }, false],
    ['a different workspace', { workspaceRoot: 'C:/other', folderNames: ['TASK_A'] }, false],
  ])('filters refreshes for %s', async (_case, change, refresh) => {
    await finishDigest();
    notify(change);
    expect(pending.map(call => call.method)).toEqual(refresh ? ['tasks:getDigest'] : []);
  });

  it('refreshes an unknown folder when a folder list is present', async () => {
    await finishDigest(null);
    notify({ workspaceRoot: 'C:/ws', folderNames: ['TASK_B'] });
    expect(pending.map(call => call.method)).toEqual(['tasks:getDigest']);
  });

  it('invalidates cached previews when the held task changes', async () => {
    await finishDigest();
    const preview = reader.previewDocument('context.md');
    take('tasks:getArtifact').resolve(ok({ file: 'context.md', content: 'Before change' }));
    await preview;
    notify({ workspaceRoot: 'C:/ws', folderNames: ['TASK_A'] });
    take('tasks:getArtifact').resolve(ok({ file: 'context.md', content: 'After change' }));
    await finishDigest();
    expect(reader.preview()?.content).toBe('After change');
  });

  it('shows an error for a non-openable preview without making a document RPC', async () => {
    await finishDigest(digestFor('TASK_A', { documents: [digestDocument('context.md', false)] }));
    await reader.previewDocument('context.md');
    expect(reader.preview()).toEqual({
      file: 'context.md', status: 'error', content: '', reason: 'not-openable',
    });
    expect(pending).toHaveLength(0);
  });

  it('surfaces the backend state for a non-ready Markdown preview', async () => {
    await finishDigest(digestFor('TASK_A', { documents: [digestDocument('extra.md')] }));
    const preview = reader.previewDocument('extra.md');
    take('tasks:readFolderMarkdown').resolve(markdown('TASK_A', 'extra.md', 'missing'));
    await preview;
    expect(reader.preview()).toMatchObject({ status: 'error', reason: 'missing' });
  });

  it('drops a late preview rejection after a lead switch', async () => {
    await finishDigest();
    const oldPreview = reader.previewDocument('context.md');
    const oldRead = take('tasks:getArtifact');
    tabId.set('tab-b');
    TestBed.tick();
    oldRead.reject(new Error('old task failed'));
    await oldPreview;
    expect(reader.preview()).toBeNull();
    await finishDigest(digestFor('TASK_B'));
    const nextPreview = reader.previewDocument('context.md');
    take('tasks:getArtifact').resolve(ok({ file: 'context.md', content: 'New task' }));
    await nextPreview;
    expect(reader.preview()?.content).toBe('New task');
  });

  it('checks a recognized document through readFolderMarkdown before every editor path open', async () => {
    await finishDigest();
    const file = 'implementation-plan.md';
    const origin = document.createElement('button');
    for (const priorOpenCount of [0, 1]) {
      const opening = reader.openDocument(file, origin);
      expect(open).toHaveBeenCalledTimes(priorOpenCount);
      const check = take('tasks:readFolderMarkdown');
      expect(check.params).toEqual({ workspaceRoot: 'C:/ws', taskId: 'TASK_A', file });
      check.resolve(markdown('TASK_A', file));
      await opening;
      expect(open).toHaveBeenCalledTimes(priorOpenCount + 1);
    }
    expect(open).toHaveBeenLastCalledWith({
      path: 'C:/ws/.ptah/specs/TASK_A/implementation-plan.md', origin,
    });
    expect(jest.mocked(rpcCall).mock.calls.map(([, method]) => method)).toEqual([
      'tasks:getDigest', 'tasks:readFolderMarkdown', 'tasks:readFolderMarkdown',
    ]);
  });

  it.each([
    ['rejected', markdown('TASK_A', 'context.md', 'rejected'), 'rejected'],
    ['missing', markdown('TASK_A', 'context.md', 'missing'), 'missing'],
    ['a different file', markdown('TASK_A', 'task.md'), 'unavailable'],
    ['a different task', markdown('TASK_B', 'context.md'), 'unavailable'],
    ['an RPC failure', { success: false, error: 'C:/private/workspace' }, 'unavailable'],
  ])('blocks the editor open when its fresh check returns %s', async (_case, response, reason) => {
    await finishDigest();
    const opening = reader.openDocument('context.md');
    take('tasks:readFolderMarkdown').resolve(response);
    await opening;
    expect(reader.openError()).toEqual({ file: 'context.md', reason });
    expect(open).not.toHaveBeenCalled();
  });

  it('blocks the editor open if the task switches while the check is pending', async () => {
    await finishDigest();
    const opening = reader.openDocument('context.md');
    const check = take('tasks:readFolderMarkdown');
    tabId.set('tab-b');
    TestBed.tick();
    await finishDigest(digestFor('TASK_B'));
    check.resolve(markdown('TASK_A', 'context.md'));
    await opening;
    expect(reader.openError()).toEqual({ file: 'context.md', reason: 'stale' });
    expect(open).not.toHaveBeenCalled();
  });

  it('blocks the editor open if the current digest revokes eligibility during the check', async () => {
    await finishDigest();
    const opening = reader.openDocument('context.md');
    const check = take('tasks:readFolderMarkdown');
    reader.retry();
    await finishDigest(digestFor('TASK_A', { documents: [digestDocument('context.md', false)] }));
    check.resolve(markdown('TASK_A', 'context.md'));
    await opening;
    expect(reader.openError()).toEqual({ file: 'context.md', reason: 'not-openable' });
    expect(open).not.toHaveBeenCalled();
  });

  it('blocks the editor open if the held task disappears during the check', async () => {
    await finishDigest();
    const opening = reader.openDocument('context.md');
    const check = take('tasks:readFolderMarkdown');
    reader.retry();
    await finishDigest(null);
    check.resolve(markdown('TASK_A', 'context.md'));
    await opening;
    expect(reader.openError()).toEqual({ file: 'context.md', reason: 'stale' });
    expect(open).not.toHaveBeenCalled();
  });

  it('drops a ready editor check after the reader is destroyed', async () => {
    await finishDigest();
    const opening = reader.openDocument('context.md');
    const check = take('tasks:readFolderMarkdown');
    TestBed.resetTestingModule();
    check.resolve(markdown('TASK_A', 'context.md'));
    await opening;
    expect(open).not.toHaveBeenCalled();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import {
  ClaudeRpcService,
  ElectronLayoutService,
  RpcResult,
  WORKSPACE_COORDINATOR,
} from '@ptah-extension/core';
import type {
  BotRecord,
  BotSummary,
  BotsListResult,
} from '@ptah-extension/shared';
import { PtahListDetailComponent } from '@ptah-extension/ui';
import { BotsPageComponent } from './bots-page.component';
import { BotEditorComponent } from './bot-editor.component';
import { BotListRowComponent } from './bot-list-row.component';
import { BotsStore } from './bots.store';
import { BotsClient } from './bots-client';

const record: BotRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  schemaVersion: 2,
  revision: 1,
  name: 'User helper',
  description: 'Writes notes',
  instructions: 'Help me',
  enabled: false,
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
  origin: { kind: 'manual' },
  scope: { kind: 'user' },
  skills: [],
  runtime: { kind: 'default' },
  memoryScope: { kind: 'private' },
  toolRequirements: { allow: [], deny: [] },
  triggers: [],
  approvalRules: { mode: 'ask' },
};
const result = (summaries: BotSummary[] = [record]): BotsListResult => ({
  summaries,
  unreadable: [],
  unidentifiedRowCount: 0,
  archivedCount: 2,
  executionAvailable: false,
});

describe('Bots page', () => {
  let fixture: ComponentFixture<BotsPageComponent>;
  let store: BotsStore;
  let root: HTMLElement;
  const list = jest.fn();
  const get = jest.fn();
  const getAvatar = jest.fn();
  const remove = jest.fn();
  const confirm = jest.fn();
  const call = jest.fn();
  const folders = signal([{ path: '/work', name: 'Work' }]);
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
  });
  beforeEach(() => {
    jest.resetAllMocks();
    folders.set([{ path: '/work', name: 'Work' }]);
    list.mockResolvedValue(new RpcResult(true, result()));
    get.mockImplementation(
      async ({ id }: { id: string }) =>
        new RpcResult(true, {
          record: { ...record, id },
          diagnostics: [],
          executionAvailable: false,
        }),
    );
    getAvatar.mockResolvedValue(
      new RpcResult(true, { mediaType: 'image/png', dataBase64: 'AA==' }),
    );
    remove.mockResolvedValue(new RpcResult(true, { deleted: true }));
    confirm.mockResolvedValue(false);
    call.mockImplementation(async (method: string) => {
      if (method === 'skillsSh:listInstalled')
        return new RpcResult(true, { skills: [] });
      if (method === 'agent:getClaudeBuiltins')
        return new RpcResult(true, { tools: [{ id: 'Bash' }] });
      if (method === 'agent:detectClis')
        return new RpcResult(true, { clis: [] });
      if (method === 'agent:listCliModels') return new RpcResult(true, {});
      if (method === 'ptahCli:list') return new RpcResult(true, { agents: [] });
      return new RpcResult(true, { models: [], totalCount: 0 });
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: ClaudeRpcService, useValue: { call } },
        {
          provide: BotsClient,
          useValue: { list, get, getAvatar, delete: remove },
        },
        {
          provide: ElectronLayoutService,
          useValue: {
            workspaceFolders: folders,
            activeWorkspace: () => folders()[0],
          },
        },
        { provide: WORKSPACE_COORDINATOR, useValue: { confirm } },
      ],
    });
  });
  afterEach(() => jest.restoreAllMocks());
  async function setup() {
    fixture = TestBed.createComponent(BotsPageComponent);
    store = fixture.debugElement.injector.get(BotsStore);
    root = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  function button(label: string) {
    const node = Array.from(root.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === label,
    );
    if (!node) throw new Error('Missing button: ' + label);
    return node;
  }
  async function click(label: string) {
    button(label).click();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  it('shows user bots, edit text, archive count and an inert preview', async () => {
    await setup();
    expect(root.textContent).toContain('User helper');
    expect(root.textContent).toContain('User');
    expect(root.textContent).toContain('Show archived (0)');
    expect(root.textContent).toContain('Edited');
    const preview = root.querySelector('.import-preview');
    expect(preview?.textContent).toContain('Preview later');
    expect(preview?.querySelector('button,a,input')).toBeNull();
    expect(root.textContent).not.toMatch(/Run bot|Start bot|Talk to bot/);
  });
  it('sets workspace roots before loading and includes user scope', async () => {
    const order: string[] = [];
    const original = BotsStore.prototype.setWorkspaceRoots;
    jest
      .spyOn(BotsStore.prototype, 'setWorkspaceRoots')
      .mockImplementation(function (this: BotsStore, roots) {
        order.push('roots');
        original.call(this, roots);
      });
    list.mockImplementation(async () => {
      order.push('load');
      return new RpcResult(true, result());
    });
    await setup();
    expect(order.slice(0, 2)).toEqual(['roots', 'load']);
    expect(list).toHaveBeenCalledWith({
      workspaceRoot: '/work',
      scopeFilter: 'all',
      includeArchived: true,
    });
  });
  it('renders loading with a disabled search', async () => {
    list.mockReturnValue(new Promise(() => undefined));
    await setup();
    expect(root.querySelector('ptah-skeleton')).not.toBeNull();
    expect(
      root.querySelector<HTMLInputElement>('input[type=search]')?.disabled,
    ).toBe(true);
    expect(root.querySelector('[aria-busy=true]')).not.toBeNull();
  });
  it('renders the list failure and retries while New bot remains available', async () => {
    list.mockResolvedValueOnce(
      new RpcResult(false, undefined, 'offline', 'PERSISTENCE_UNAVAILABLE'),
    );
    await setup();
    expect(root.textContent).toContain('Could not load bots');
    expect(root.textContent).toContain(store.listError()?.message);
    expect(button('New bot')).toBeTruthy();
    await click('Retry');
    expect(list).toHaveBeenCalledTimes(2);
    expect(root.textContent).toContain('User helper');
  });
  it('renders empty without a list pane and offers one New bot action', async () => {
    list.mockResolvedValue(new RpcResult(true, result([])));
    await setup();
    expect(root.textContent).toContain('No bots yet');
    expect(root.querySelector('ptah-list-detail')).toBeNull();
    expect(
      Array.from(root.querySelectorAll('button')).filter(
        (item) => item.textContent?.trim() === 'New bot',
      ),
    ).toHaveLength(1);
    await click('New bot');
    expect(store.draft()).not.toBeNull();
  });
  it('shows archived rows only after checking the archive filter', async () => {
    list.mockResolvedValue(
      new RpcResult(
        true,
        result([
          record,
          { ...record, id: 'archived', name: 'Old helper', archivedAt: 2 },
        ]),
      ),
    );
    await setup();
    expect(root.textContent).not.toContain('Old helper');
    const checkbox = root.querySelector<HTMLInputElement>(
      'input[type=checkbox]',
    );
    if (!checkbox) throw new Error('Missing archive filter');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.textContent).toContain('Old helper');
  });
  it('keeps selection until discard is confirmed, then discards before selecting', async () => {
    await setup();
    await store.select(record.id);
    store.patchDraft({ name: 'Unsaved' });
    fixture.detectChanges();
    let resolve: (value: boolean) => void = () => undefined;
    confirm.mockReturnValue(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    const discard = jest.spyOn(store, 'discard');
    const select = jest.spyOn(store, 'select');
    fixture.debugElement
      .query(By.directive(BotListRowComponent))
      .componentInstance.selectedBot.emit('second');
    await Promise.resolve();
    expect(store.selected()?.id).toBe(record.id);
    expect(discard).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    resolve(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(discard).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith('second');
    expect(discard.mock.invocationCallOrder[0]).toBeLessThan(
      select.mock.invocationCallOrder[0],
    );
  });
  it('keeps dirty edits when navigation is declined', async () => {
    await setup();
    await store.select(record.id);
    store.patchDraft({ name: 'Unsaved' });
    fixture.debugElement
      .query(By.directive(BotListRowComponent))
      .componentInstance.selectedBot.emit('second');
    await fixture.whenStable();
    expect(store.selected()?.id).toBe(record.id);
    expect(store.draft()?.definition.name).toBe('Unsaved');
  });
  it('uses the 960px narrow back flow and confirms dirty return', async () => {
    await setup();
    root.querySelector<HTMLButtonElement>('.bot-row')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const split = fixture.debugElement.query(
      By.directive(PtahListDetailComponent),
    ).componentInstance as PtahListDetailComponent;
    expect(split.splitAt()).toBe(960);
    expect(split.selectedId()).toBe(record.id);
    store.patchDraft({ name: 'Unsaved' });
    await click('Back to bots');
    expect(split.selectedId()).toBe(record.id);
    confirm.mockResolvedValue(true);
    await click('Back to bots');
    expect(split.selectedId()).toBeNull();
  });
  it('shows selection errors when there is no editor draft', async () => {
    get.mockResolvedValue(
      new RpcResult(false, undefined, 'missing', 'SESSION_NOT_FOUND'),
    );
    await setup();
    root.querySelector<HTMLButtonElement>('.bot-row')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.draft()).toBeNull();
    expect(root.textContent).toContain(store.error()?.message);
  });
  it('shows unreadable diagnostics without actions and one unidentified notice', async () => {
    list.mockResolvedValue(
      new RpcResult(true, {
        ...result([]),
        unidentifiedRowCount: 3,
        unreadable: [
          {
            id: record.id,
            diagnostics: [{ code: 'BAD_FORMAT', message: 'Bad data' }],
          },
        ],
      }),
    );
    await setup();
    const diagnostic = root.querySelector('[aria-label^="Unreadable bot"]');
    expect(diagnostic).not.toBeNull();
    expect(diagnostic?.querySelector('button')).toBeNull();
    expect(
      root.textContent?.match(/3 bot rows could not be identified/g),
    ).toHaveLength(1);
  });
  it('passes tool catalog state into the editor, including failure', async () => {
    call.mockImplementation(
      async () => new RpcResult(false, undefined, 'offline'),
    );
    await setup();
    await click('New bot');
    const editor = fixture.debugElement.query(By.directive(BotEditorComponent))
      .componentInstance as BotEditorComponent;
    expect(editor.catalogLoaded()).toBe(false);
    expect(editor.catalogFailed()).toBe(true);
    expect(editor.catalogLoading()).toBe(false);
  });
  it('requires an explicit create scope in multi-root workspaces', async () => {
    folders.set([
      { path: '/one', name: 'One' },
      { path: '/two', name: 'Two' },
    ]);
    await setup();
    await click('New bot');
    expect(store.draft()).toBeNull();
    expect(root.textContent).toContain('Choose an explicit scope');
    const scope = root.querySelector<HTMLSelectElement>('.create-scope select');
    if (!scope) throw new Error('Missing scope');
    scope.value = 'user';
    scope.dispatchEvent(new Event('change'));
    await click('New bot');
    expect(store.draft()?.definition.scope).toEqual({ kind: 'user' });
  });
  it('bounds mounted avatar rows and defers row avatar requests', async () => {
    const bots = Array.from({ length: 70 }, (_, index) => ({
      ...record,
      id: String(index),
      avatar: { kind: 'image' as const, imageId: String(index) },
    }));
    list.mockResolvedValue(new RpcResult(true, result(bots)));
    await setup();
    expect(root.querySelectorAll('ptah-bot-list-row')).toHaveLength(32);
    expect(getAvatar).toHaveBeenCalledTimes(32);
    expect(root.querySelectorAll('img').length).toBeLessThanOrEqual(32);
    await click('Next');
    expect(getAvatar).toHaveBeenCalledTimes(64);
    await click('Next');
    expect(getAvatar).toHaveBeenCalledTimes(70);
    await click('Previous');
    await click('Previous');
    expect(getAvatar.mock.calls.length).toBeGreaterThan(70);
  });
  it('re-requests an evicted avatar while its row stays mounted', async () => {
    const avatarBot = {
      ...record,
      avatar: { kind: 'image' as const, imageId: 'visible' },
    };
    list.mockResolvedValue(new RpcResult(true, result([avatarBot])));
    await setup();
    const row = fixture.debugElement.query(
      By.directive(BotListRowComponent),
    ).componentInstance;
    expect(getAvatar).toHaveBeenCalledTimes(1);
    await fixture.whenStable();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(store.avatars().get('visible')?.status).toBe('ready');
    // Simulate other store consumers filling the shared cache while this row stays mounted.
    for (let index = 0; index < 65; index++)
      await store.loadAvatar('other', 'other-' + index);
    expect(store.avatars().has('visible')).toBe(false);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(getAvatar).toHaveBeenCalledTimes(66);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(getAvatar).toHaveBeenCalledTimes(67);
    expect(
      fixture.debugElement.query(By.directive(BotListRowComponent))
        .componentInstance,
    ).toBe(row);
    expect(store.avatars().get('visible')?.status).toBe('ready');
  });
  it('passes successful skills and tool catalog state to the editor', async () => {
    await setup();
    await click('New bot');
    const editor = fixture.debugElement.query(By.directive(BotEditorComponent))
      .componentInstance as BotEditorComponent;
    expect(editor.catalogLoaded()).toBe(true);
    expect(editor.catalogLoading()).toBe(false);
    expect(editor.knownToolIds()).toEqual(['Bash']);
    expect(editor.installedSkills()).toEqual([]);
  });
  it('keeps catalogLoaded false while catalog requests are pending', async () => {
    call.mockReturnValue(new Promise(() => undefined));
    await setup();
    await click('New bot');
    const editor = fixture.debugElement.query(By.directive(BotEditorComponent))
      .componentInstance as BotEditorComponent;
    expect(editor.catalogLoaded()).toBe(false);
    expect(editor.catalogLoading()).toBe(true);
  });
  it.each(['archived', 'deleted'])(
    'clamps page 2 when its only bot is %s',
    async (change) => {
      const bots = Array.from({ length: 33 }, (_, index) => ({
        ...record,
        id: String(index),
        name: 'Helper ' + index,
      }));
      list.mockResolvedValue(new RpcResult(true, result(bots)));
      await setup();
      await click('Next');
      expect(root.textContent).toContain('Helper 32');
      list.mockResolvedValue(
        new RpcResult(
          true,
          result(
            change === 'deleted'
              ? bots.slice(0, 32)
              : bots.map((bot) =>
                  bot.id === '32' ? { ...bot, archivedAt: 2 } : bot,
                ),
          ),
        ),
      );
      await store.refresh();
      fixture.detectChanges();
      expect(root.querySelectorAll('.bot-row')).toHaveLength(32);
      expect(root.textContent).toContain('Helper 0');
      expect(root.querySelector('.pagination')).toBeNull();
    },
  );
  it.each([false, true])(
    'closes the detail after delete (last bot: %s)',
    async (last) => {
      await setup();
      root.querySelector<HTMLButtonElement>('.bot-row')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(root.querySelector('ptah-bot-editor article')).not.toBeNull();
      list.mockResolvedValue(
        new RpcResult(
          true,
          result(last ? [] : [{ ...record, id: 'remaining' }]),
        ),
      );
      await store.delete({ memory: 'keep', history: 'keep' });
      fixture.detectChanges();
      expect(remove).toHaveBeenCalled();
      expect(store.draft()).toBeNull();
      if (last) {
        expect(root.textContent).toContain('No bots yet');
        expect(root.querySelector('ptah-list-detail')).toBeNull();
      } else {
        const split = fixture.debugElement.query(
          By.directive(PtahListDetailComponent),
        ).componentInstance as PtahListDetailComponent;
        expect(split.selectedId()).toBeNull();
        expect(root.textContent).toContain('Select a bot');
      }
    },
  );
  it('closes the detail when a new draft is discarded', async () => {
    await setup();
    await click('New bot');
    store.discard();
    fixture.detectChanges();
    const split = fixture.debugElement.query(
      By.directive(PtahListDetailComponent),
    ).componentInstance as PtahListDetailComponent;
    expect(split.selectedId()).toBeNull();
    expect(root.textContent).toContain('Select a bot');
  });
  it.each([false, true])(
    'clears selection on workspace change (dirty: %s)',
    async (dirty) => {
      await setup();
      root.querySelector<HTMLButtonElement>('.bot-row')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      if (dirty) store.patchDraft({ name: 'Unsaved' });
      folders.set([{ path: '/next', name: 'Next' }]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(store.selected()).toBeNull();
      expect(store.draft()).toBeNull();
      const split = fixture.debugElement.query(
        By.directive(PtahListDetailComponent),
      ).componentInstance as PtahListDetailComponent;
      expect(split.selectedId()).toBeNull();
      expect(confirm).not.toHaveBeenCalled();
      const notices = Array.from(root.querySelectorAll('[role=status]')).filter(
        (node) =>
          node.textContent ===
          'Unsaved changes were discarded because the workspace changed.',
      );
      expect(notices).toHaveLength(dirty ? 1 : 0);
      if (dirty) expect(notices[0].getAttribute('aria-live')).toBe('polite');
      expect(list).toHaveBeenLastCalledWith({
        workspaceRoot: '/next',
        scopeFilter: 'all',
        includeArchived: true,
      });
    },
  );
  it('ignores an old-workspace confirmation after switching workspaces', async () => {
    await setup();
    await store.select(record.id);
    store.patchDraft({ name: 'Unsaved' });
    let resolve: (value: boolean) => void = () => undefined;
    confirm.mockReturnValue(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    fixture.debugElement
      .query(By.directive(BotListRowComponent))
      .componentInstance.selectedBot.emit('second');
    await Promise.resolve();
    folders.set([{ path: '/next', name: 'Next' }]);
    fixture.detectChanges();
    resolve(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.selected()).toBeNull();
    expect(store.draft()).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('keeps existing rows and search enabled during refresh', async () => {
    await setup();
    const row = root.querySelector('.bot-row');
    let resolve: (value: RpcResult<BotsListResult>) => void = () => undefined;
    list.mockReturnValue(
      new Promise<RpcResult<BotsListResult>>((done) => {
        resolve = done;
      }),
    );
    const refreshing = store.refresh();
    fixture.detectChanges();
    expect(root.querySelector('.bot-row')).toBe(row);
    expect(root.querySelector('ptah-skeleton')).toBeNull();
    expect(
      root.querySelector<HTMLInputElement>('input[type=search]')?.disabled,
    ).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('.bot-row')?.disabled).toBe(
      false,
    );
    resolve(new RpcResult(true, result()));
    await refreshing;
    fixture.detectChanges();
  });
  it('resets scope choices on root change and selects dynamic options correctly', async () => {
    folders.set([
      { path: '/one', name: 'One' },
      { path: '/two', name: 'Two' },
    ]);
    await setup();
    const choose = () => {
      const select = root.querySelector<HTMLSelectElement>(
        '.create-scope select',
      );
      if (!select) throw new Error('Missing scope');
      return select;
    };
    choose().value = '/two';
    choose().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(choose().selectedOptions[0].value).toBe('/two');
    folders.set([
      { path: '/three', name: 'Three' },
      { path: '/four', name: 'Four' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(choose().selectedOptions[0].value).toBe('');
    choose().value = '/four';
    choose().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(choose().selectedOptions[0].value).toBe('/four');
    await click('New bot');
    expect(store.draft()?.definition.scope).toEqual({
      kind: 'workspace',
      workspaceRoot: '/four',
    });
  });
  it('rejects a stale creation scope even before the layout updates', async () => {
    folders.set([
      { path: '/one', name: 'One' },
      { path: '/two', name: 'Two' },
    ]);
    await setup();
    const select = root.querySelector<HTMLSelectElement>(
      '.create-scope select',
    );
    if (!select) throw new Error('Missing scope');
    select.value = '/two';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    store.setWorkspaceRoots(['/new-one', '/new-two']);
    await click('New bot');
    expect(store.draft()).toBeNull();
    expect(root.textContent).toContain('Choose an explicit scope');
  });
  it('counts only archived rows matching scope and search', async () => {
    list.mockResolvedValue(
      new RpcResult(
        true,
        result([
          record,
          { ...record, id: 'user-old', name: 'Match user', archivedAt: 1 },
          {
            ...record,
            id: 'workspace-old',
            name: 'Match workspace',
            archivedAt: 1,
            scope: { kind: 'workspace', workspaceRoot: '/work' },
          },
          { ...record, id: 'other-old', name: 'Other user', archivedAt: 1 },
        ]),
      ),
    );
    await setup();
    expect(root.textContent).toContain('Show archived (3)');
    const scope = root.querySelector<HTMLSelectElement>('.filters select');
    if (!scope) throw new Error('Missing scope');
    scope.value = 'user';
    scope.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.textContent).toContain('Show archived (2)');
    const search = root.querySelector<HTMLInputElement>('input[type=search]');
    if (!search) throw new Error('Missing search');
    search.value = 'Match';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.textContent).toContain('Show archived (1)');
    const checkbox = root.querySelector<HTMLInputElement>(
      'input[type=checkbox]',
    );
    if (!checkbox) throw new Error('Missing checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.textContent).toContain('Match user');
    expect(root.textContent).not.toContain('Match workspace');
    expect(root.textContent).not.toContain('Other user');
    expect(root.textContent).toContain('Show archived (1)');
  });
});

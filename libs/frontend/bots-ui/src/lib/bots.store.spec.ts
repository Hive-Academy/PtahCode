import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService, RpcResult } from '@ptah-extension/core';
import type {
  BotRecord,
  BotsListResult,
  BotsWriteResult,
} from '@ptah-extension/shared';
import { BotsClient } from './bots-client';
import {
  BOT_AVATAR_CACHE_BYTES,
  BOT_AVATAR_CACHE_LIMIT,
  BotsStore,
  botErrorMessage,
  type BotDomainCode,
} from './bots.store';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred not initialized');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const record: BotRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  schemaVersion: 2,
  revision: 1,
  name: 'Bot',
  description: '',
  instructions: 'Help',
  enabled: false,
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
  origin: { kind: 'manual' },
  scope: { kind: 'workspace', workspaceRoot: 'D:/one' },
  skills: [],
  runtime: { kind: 'default' },
  memoryScope: { kind: 'private' },
  toolRequirements: { allow: [], deny: [] },
  triggers: [],
  approvalRules: { mode: 'ask' },
};
const listing: BotsListResult = {
  summaries: [record],
  unreadable: [],
  unidentifiedRowCount: 0,
  archivedCount: 0,
  executionAvailable: false,
};
const write = (value = record) =>
  new RpcResult<BotsWriteResult>(true, { record: value, diagnostics: [] });
class FakeBotsClient implements Pick<
  BotsClient,
  | 'list'
  | 'get'
  | 'create'
  | 'update'
  | 'setEnabled'
  | 'archive'
  | 'restore'
  | 'delete'
  | 'uploadAvatar'
  | 'getAvatar'
> {
  public readonly list = jest
    .fn<ReturnType<BotsClient['list']>, Parameters<BotsClient['list']>>()
    .mockResolvedValue(new RpcResult(true, listing));
  public readonly get = jest
    .fn<ReturnType<BotsClient['get']>, Parameters<BotsClient['get']>>()
    .mockResolvedValue(
      new RpcResult(true, {
        record,
        diagnostics: [],
        executionAvailable: false,
      }),
    );
  public readonly create = jest
    .fn<ReturnType<BotsClient['create']>, Parameters<BotsClient['create']>>()
    .mockResolvedValue(write());
  public readonly update = jest
    .fn<ReturnType<BotsClient['update']>, Parameters<BotsClient['update']>>()
    .mockResolvedValue(write({ ...record, revision: 2 }));
  public readonly setEnabled = jest
    .fn<
      ReturnType<BotsClient['setEnabled']>,
      Parameters<BotsClient['setEnabled']>
    >()
    .mockResolvedValue(write({ ...record, enabled: true, revision: 2 }));
  public readonly archive = jest
    .fn<ReturnType<BotsClient['archive']>, Parameters<BotsClient['archive']>>()
    .mockResolvedValue(write({ ...record, archivedAt: 10 }));
  public readonly restore = jest
    .fn<ReturnType<BotsClient['restore']>, Parameters<BotsClient['restore']>>()
    .mockResolvedValue(write({ ...record, enabled: false, archivedAt: null }));
  public readonly delete = jest.fn<
    ReturnType<BotsClient['delete']>,
    Parameters<BotsClient['delete']>
  >();
  public readonly uploadAvatar = jest
    .fn<
      ReturnType<BotsClient['uploadAvatar']>,
      Parameters<BotsClient['uploadAvatar']>
    >()
    .mockResolvedValue(new RpcResult(true, { imageId: 'image' }));
  public readonly getAvatar = jest
    .fn<
      ReturnType<BotsClient['getAvatar']>,
      Parameters<BotsClient['getAvatar']>
    >()
    .mockResolvedValue(
      new RpcResult(true, { mediaType: 'image/png', dataBase64: 'YQ==' }),
    );
}
class FakeRpc {
  public readonly call: ClaudeRpcService['call'] = jest.fn();
}

describe('BotsStore', () => {
  let store: BotsStore;
  let client: FakeBotsClient;
  let rpc: FakeRpc;
  beforeEach(() => {
    client = new FakeBotsClient();
    rpc = new FakeRpc();
    TestBed.configureTestingModule({
      providers: [
        BotsStore,
        { provide: BotsClient, useValue: client },
        { provide: ClaudeRpcService, useValue: rpc },
      ],
    });
    store = TestBed.inject(BotsStore);
    store.setWorkspaceRoots(['D:/one']);
  });
  it('advances draftEpoch for replacement but not patchDraft', async () => {
    expect(store.draftEpoch()).toBe(0);
    expect(store.newDraft()).toBe(true);
    expect(store.draftEpoch()).toBe(1);
    store.patchDraft({ name: 'Mine' });
    expect(store.draftEpoch()).toBe(1);
    await store.select(record.id);
    expect(store.draftEpoch()).toBe(2);
    store.patchDraft({ instructions: 'Changed' });
    expect(store.draftEpoch()).toBe(2);
    store.discard();
    expect(store.draftEpoch()).toBe(3);
  });
  it('clearList removes cached rows and ignores an outstanding response', async () => {
    await store.load({ workspaceRoot: 'D:/one' });
    expect(store.list()).toEqual(listing);
    const late = deferred<RpcResult<BotsListResult>>();
    client.list.mockReturnValueOnce(late.promise);
    const pending = store.refresh();
    store.clearList();
    expect(store.list()).toBeNull();
    expect(store.summaries()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.listError()).toBeNull();
    late.resolve(new RpcResult(true, listing));
    await pending;
    expect(store.list()).toBeNull();
    await store.load({ workspaceRoot: 'D:/two' });
    expect(store.list()).toEqual(listing);
  });
  it('clearList also ignores stale failures after the next workspace loads', async () => {
    const late = deferred<RpcResult<BotsListResult>>();
    client.list.mockReturnValueOnce(late.promise);
    const pending = store.load({ workspaceRoot: 'D:/one' });
    store.clearList();
    await store.load({ workspaceRoot: 'D:/two' });
    late.resolve(
      new RpcResult<BotsListResult>(false, undefined, 'Old workspace failure'),
    );
    await pending;
    expect(store.list()).toEqual(listing);
    expect(store.listError()).toBeNull();
    expect(store.loading()).toBe(false);
  });
  it('clearSelection clears dirty editor state and advances the draft epoch once', async () => {
    await store.select(record.id);
    store.patchDraft({ name: 'Unsaved' });
    const epoch = store.draftEpoch();
    store.clearSelection();
    expect(store.selected()).toBeNull();
    expect(store.draft()).toBeNull();
    expect(store.dirty()).toBe(false);
    expect(store.draftEpoch()).toBe(epoch + 1);
    expect(store.saveState()).toBe('pristine');
    expect(store.error()).toBeNull();
    expect(store.conflict()).toBeNull();
    expect(store.diagnostics()).toEqual([]);
    expect(store.avatarUpload()).toBeNull();
    expect(store.selecting()).toBe(false);
    expect(store.saving()).toBe(false);
    expect(client.create).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
  });
  it('clearSelection invalidates a pending selection', async () => {
    const late = deferred<Awaited<ReturnType<BotsClient['get']>>>();
    client.get.mockReturnValueOnce(late.promise);
    const pending = store.select(record.id);
    store.clearSelection();
    late.resolve(
      new RpcResult(true, {
        record,
        diagnostics: [],
        executionAvailable: false,
      }),
    );
    await pending;
    expect(store.selected()).toBeNull();
    expect(store.draft()).toBeNull();
    expect(store.selecting()).toBe(false);
    expect(store.draftEpoch()).toBe(1);
  });
  it('ignores stale list responses', async () => {
    const first = deferred<RpcResult<BotsListResult>>();
    client.list.mockReturnValueOnce(first.promise);
    const pending = store.load({ workspaceRoot: 'D:/one' });
    await store.load({ workspaceRoot: 'D:/two' });
    first.resolve(new RpcResult(true, { ...listing, summaries: [] }));
    await pending;
    expect(store.summaries()).toEqual([record]);
    expect(store.loading()).toBe(false);
  });
  it('ignores stale selection responses', async () => {
    const first = deferred<Awaited<ReturnType<BotsClient['get']>>>();
    client.get.mockReturnValueOnce(first.promise);
    const pending = store.select('old');
    await store.select(record.id);
    first.resolve(
      new RpcResult(true, {
        record: { ...record, name: 'old' },
        diagnostics: [],
        executionAvailable: false,
      }),
    );
    await pending;
    expect(store.draft()?.definition.name).toBe('Bot');
  });
  it('keeps dirty runtime, avatar and source drafts across refresh', async () => {
    store.newDraft(undefined, { kind: 'wizard-generated' });
    store.patchDraft({
      name: 'Mine',
      runtime: {
        kind: 'lane',
        target: { kind: 'system', cli: 'codex' },
        model: 'm',
      },
      avatar: { kind: 'icon', name: 'code' },
    });
    await store.load({ workspaceRoot: 'D:/one' });
    await store.refresh();
    expect(store.draft()?.definition.name).toBe('Mine');
    expect(store.draft()?.source).toEqual({ kind: 'wizard-generated' });
    expect(store.dirty()).toBe(true);
  });
  it('retains edits when reselecting the same bot', async () => {
    await store.select(record.id);
    store.patchDraft({ instructions: 'Mine' });
    await store.select(record.id);
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(store.draft()?.definition.instructions).toBe('Mine');
  });
  it('rebases only enabled and revision after toggle', async () => {
    await store.select(record.id);
    store.patchDraft({ instructions: 'Mine' });
    client.setEnabled.mockResolvedValueOnce(
      write({ ...record, name: 'Other', enabled: true, revision: 3 }),
    );
    await store.setEnabled(true);
    expect(store.draft()).toMatchObject({
      enabled: true,
      revision: 3,
      definition: { name: 'Bot', instructions: 'Mine' },
    });
    expect(store.selected()?.name).toBe('Bot');
    expect(store.dirty()).toBe(true);
    expect(client.setEnabled).toHaveBeenCalledWith({
      id: record.id,
      expectedRevision: 1,
      enabled: true,
    });
  });
  it('fetches conflict comparison, preserves mine and resubmits against latest', async () => {
    await store.select(record.id);
    store.patchDraft({ instructions: 'Mine' });
    client.update.mockResolvedValueOnce(
      new RpcResult<BotsWriteResult>(
        false,
        undefined,
        'Bot request was refused.',
        'BOT_REVISION_CONFLICT',
      ),
    );
    client.get.mockResolvedValueOnce(
      new RpcResult(true, {
        record: { ...record, revision: 4, instructions: 'Theirs' },
        diagnostics: [],
        executionAvailable: false,
      }),
    );
    await store.save();
    expect(store.conflict()?.latest.instructions).toBe('Theirs');
    expect(store.conflict()?.mine.definition.instructions).toBe('Mine');
    expect(store.draft()?.definition.instructions).toBe('Mine');
    await store.resubmitConflict();
    expect(client.update).toHaveBeenLastCalledWith({
      id: record.id,
      expectedRevision: 4,
      schemaVersion: 2,
      definition: expect.objectContaining({ instructions: 'Mine' }),
    });
  });
  it('can discard mine and load the conflict revision', async () => {
    await store.select(record.id);
    store.patchDraft({ name: 'Mine' });
    client.update.mockResolvedValueOnce(
      new RpcResult<BotsWriteResult>(
        false,
        undefined,
        '',
        'BOT_REVISION_CONFLICT',
      ),
    );
    client.get.mockResolvedValueOnce(
      new RpcResult(true, {
        record: { ...record, name: 'Latest', revision: 3 },
        diagnostics: [],
        executionAvailable: false,
      }),
    );
    await store.save();
    store.loadConflictLatest();
    expect(store.draft()?.definition.name).toBe('Latest');
    expect(store.dirty()).toBe(false);
  });
  it('ignores write completion after switching editor', async () => {
    await store.select(record.id);
    store.patchDraft({ name: 'Mine' });
    const pending = deferred<RpcResult<BotsWriteResult>>();
    client.update.mockReturnValueOnce(pending.promise);
    const saving = store.save();
    store.newDraft();
    pending.resolve(write({ ...record, name: 'Late' }));
    await saving;
    expect(store.draft()?.definition.name).toBe('');
    expect(store.saving()).toBe(false);
  });
  it('bounds avatar cache while keeping pending reads until they settle', async () => {
    const pending = deferred<Awaited<ReturnType<BotsClient['getAvatar']>>>();
    client.getAvatar.mockReturnValueOnce(pending.promise);
    const loading = store.loadAvatar(record.id, 'old');
    for (let i = 0; i < BOT_AVATAR_CACHE_LIMIT; i++)
      await store.loadAvatar(record.id, `image-${i}`);
    pending.resolve(
      new RpcResult(true, { mediaType: 'image/png', dataBase64: 'YQ==' }),
    );
    await loading;
    expect(store.avatars().size).toBe(BOT_AVATAR_CACHE_LIMIT);
    expect(store.avatars().get('old')?.status).toBe('ready');
  });
  it('ignores superseded image requests and resolves data for components', async () => {
    const pending = deferred<Awaited<ReturnType<BotsClient['getAvatar']>>>();
    client.getAvatar.mockReturnValueOnce(pending.promise);
    const loading = store.loadAvatar(record.id, 'image');
    await store.loadAvatar(record.id, 'image', true);
    pending.resolve(new RpcResult(false));
    await loading;
    expect(store.avatars().get('image')).toEqual({
      status: 'ready',
      dataUrl: 'data:image/png;base64,YQ==',
    });
  });
  it('exposes actionable avatar load failures and supports retry', async () => {
    client.getAvatar.mockResolvedValueOnce(new RpcResult(false));
    await store.loadAvatar(record.id, 'image');
    expect(store.avatars().get('image')).toMatchObject({
      status: 'error',
      error: { message: expect.stringContaining('Retry') },
    });
    await store.loadAvatar(record.id, 'image', true);
    expect(store.avatars().get('image')?.status).toBe('ready');
  });
  it('keeps the prior avatar on upload failure', async () => {
    store.newDraft();
    store.patchDraft({ avatar: { kind: 'icon', name: 'shield' } });
    client.uploadAvatar.mockResolvedValueOnce(
      new RpcResult<{ imageId: string }>(
        false,
        undefined,
        '',
        'INVALID_PARAMS',
      ),
    );
    await store.uploadAvatar({
      scope: record.scope,
      mediaType: 'image/png',
      dataBase64: 'YQ==',
    });
    expect(store.avatarUpload()).toMatchObject({ status: 'error' });
    expect(store.draft()?.definition.avatar).toEqual({
      kind: 'icon',
      name: 'shield',
    });
  });
  it('drops uploads after draft disposal', async () => {
    store.newDraft();
    const pending = deferred<Awaited<ReturnType<BotsClient['uploadAvatar']>>>();
    client.uploadAvatar.mockReturnValueOnce(pending.promise);
    const uploading = store.uploadAvatar({
      scope: record.scope,
      mediaType: 'image/png',
      dataBase64: 'YQ==',
    });
    store.discard();
    pending.resolve(new RpcResult(true, { imageId: 'late' }));
    await uploading;
    expect(store.draft()).toBeNull();
    expect(store.avatars().has('late')).toBe(false);
  });
  it('keeps unreadable diagnostics separate and aggregates unidentified count', async () => {
    const unreadable = [
      {
        id: record.id,
        schemaVersion: 9,
        diagnostics: [
          {
            code: 'unsupported',
            message: 'Update Ptah',
            severity: 'error' as const,
          },
        ],
      },
    ];
    client.list.mockResolvedValueOnce(
      new RpcResult(true, { ...listing, unreadable, unidentifiedRowCount: 3 }),
    );
    await store.load({ workspaceRoot: 'D:/one' });
    expect(store.unreadable()).toEqual(unreadable);
    expect(store.unidentifiedRowNotice()).toBe(
      '3 bot rows could not be identified.',
    );
  });
  it('requires explicit scope for multi-root create and passes it on wire', async () => {
    store.setWorkspaceRoots(['D:/one', 'D:/two']);
    expect(store.requiresCreateScope()).toBe(true);
    expect(store.newDraft()).toBe(false);
    expect(client.create).not.toHaveBeenCalled();
    store.newDraft({ kind: 'workspace', workspaceRoot: 'D:/two' });
    store.patchDraft({ name: 'New', instructions: 'Help' });
    await store.save();
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: expect.objectContaining({
          scope: { kind: 'workspace', workspaceRoot: 'D:/two' },
        }),
      }),
    );
  });
  it('preserves drafts and exposes errors on transport rejection', async () => {
    await store.select(record.id);
    store.patchDraft({ name: 'Mine' });
    client.update.mockRejectedValueOnce(new Error('offline'));
    await store.save();
    expect(store.error()?.message).toContain('Retry');
    expect(store.draft()?.definition.name).toBe('Mine');
    expect(store.saving()).toBe(false);
  });
  it('surfaces catalog unavailability and uses only discovery calls', async () => {
    const call = jest.spyOn(rpc, 'call');
    call.mockResolvedValue(new RpcResult(false));
    await store.loadLaneChoices();
    expect(store.catalogDiagnostics().length).toBe(3);
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'agent:detectClis',
      'agent:listCliModels',
      'ptahCli:list',
    ]);
    expect(store.catalogLoading()).toBe(false);
  });
  it('D1 refreshes list after stale successful writes without replacing the new draft', async () => {
    await store.load({ workspaceRoot: 'D:/one' });
    await store.select(record.id);
    store.patchDraft({ name: 'Saved remotely' });
    const pending = deferred<RpcResult<BotsWriteResult>>();
    client.update.mockReturnValueOnce(pending.promise);
    const saving = store.save();
    store.newDraft();
    const updated = { ...record, name: 'Saved remotely', revision: 2 };
    client.list.mockResolvedValueOnce(
      new RpcResult(true, { ...listing, summaries: [updated] }),
    );
    pending.resolve(write(updated));
    await saving;
    expect(store.summaries()).toEqual([updated]);
    expect(store.draft()?.definition.name).toBe('');
    expect(client.list).toHaveBeenCalledTimes(2);
  });
  it('D1 refreshes list after stale successful deletes without clearing the new draft', async () => {
    await store.load({ workspaceRoot: 'D:/one' });
    await store.select(record.id);
    const pending = deferred<Awaited<ReturnType<BotsClient['delete']>>>();
    client.delete.mockReturnValueOnce(pending.promise);
    const retention = { memory: 'keep', history: 'keep' } as const;
    const deleting = store.delete(retention);
    store.newDraft();
    client.list.mockResolvedValueOnce(
      new RpcResult(true, { ...listing, summaries: [] }),
    );
    pending.resolve(
      new RpcResult(true, {
        id: record.id,
        tombstoned: true,
        retention,
        removed: { memory: 0, history: 0, avatars: 0 },
      }),
    );
    await deleting;
    expect(store.summaries()).toEqual([]);
    expect(store.draft()).not.toBeNull();
    expect(client.list).toHaveBeenCalledTimes(2);
  });
  it('D2/N1 keeps all 30 small concurrent avatars ready without row reloads', async () => {
    const pending = Array.from({ length: 30 }, () =>
      deferred<Awaited<ReturnType<BotsClient['getAvatar']>>>(),
    );
    pending.forEach((item) =>
      client.getAvatar.mockReturnValueOnce(item.promise),
    );
    const loads = pending.map((_, i) =>
      store.loadAvatar(record.id, `concurrent-${i}`),
    );
    expect(store.avatars().size).toBe(30);
    expect(
      [...store.avatars().values()].every(
        (value) => value.status === 'loading',
      ),
    ).toBe(true);
    pending.forEach((item) =>
      item.resolve(
        new RpcResult(true, { mediaType: 'image/png', dataBase64: 'YQ==' }),
      ),
    );
    await Promise.all(loads);
    expect(client.getAvatar).toHaveBeenCalledTimes(30);
    expect(store.avatars().size).toBe(30);
    expect(
      [...store.avatars().values()].every((value) => value.status === 'ready'),
    ).toBe(true);
    await Promise.all(
      pending.map((_, i) => store.loadAvatar(record.id, `concurrent-${i}`)),
    );
    expect(client.getAvatar).toHaveBeenCalledTimes(30);
  });
  it('N1 counts only settled entries and protects the newest completion under entry pressure', async () => {
    const pending = Array.from({ length: 70 }, () =>
      deferred<Awaited<ReturnType<BotsClient['getAvatar']>>>(),
    );
    pending.forEach((item) =>
      client.getAvatar.mockReturnValueOnce(item.promise),
    );
    const loads = pending.map((_, i) =>
      store.loadAvatar(record.id, `overflow-${i}`),
    );
    for (const i of [0, 1]) {
      pending[i]?.resolve(
        new RpcResult(true, { mediaType: 'image/png', dataBase64: 'YQ==' }),
      );
      await loads[i];
    }
    expect(store.avatars().size).toBe(70);
    expect(store.avatars().get('overflow-0')?.status).toBe('ready');
    expect(store.avatars().get('overflow-1')?.status).toBe('ready');
    pending
      .slice(2)
      .forEach((item) =>
        item.resolve(
          new RpcResult(true, { mediaType: 'image/png', dataBase64: 'YQ==' }),
        ),
      );
    await Promise.all(loads);
    expect(store.avatars().size).toBe(64);
    expect(
      [...store.avatars().values()].every((value) => value.status === 'ready'),
    ).toBe(true);
    expect(store.avatars().get('overflow-69')?.status).toBe('ready');
  });
  it('N2 retains conflict and saveState when resubmit is blocked by selection', async () => {
    await store.select(record.id);
    store.patchDraft({ name: 'Mine' });
    client.update.mockResolvedValueOnce(
      new RpcResult<BotsWriteResult>(
        false,
        undefined,
        '',
        'BOT_REVISION_CONFLICT',
      ),
    );
    await store.save();
    const conflict = store.conflict();
    const pending = deferred<Awaited<ReturnType<BotsClient['get']>>>();
    client.get.mockReturnValueOnce(pending.promise);
    const selecting = store.select('other');
    await store.resubmitConflict();
    expect(store.conflict()).toEqual(conflict);
    expect(store.saveState()).toBe('conflict');
    expect(client.update).toHaveBeenCalledTimes(1);
    pending.resolve(new RpcResult(false));
    await selecting;
    await store.resubmitConflict();
    expect(store.conflict()).toBeNull();
    expect(store.saveState()).toBe('saved');
  });
  it('N2 leaves a consistent error state if conflict resubmission fails validation', async () => {
    await store.select(record.id);
    store.patchDraft({ name: 'Mine' });
    client.update.mockResolvedValueOnce(
      new RpcResult<BotsWriteResult>(
        false,
        undefined,
        '',
        'BOT_REVISION_CONFLICT',
      ),
    );
    await store.save();
    store.patchDraft({ name: '' });
    await store.resubmitConflict();
    expect(store.conflict()).toBeNull();
    expect(store.saveState()).toBe('error');
    expect(store.validation().length).toBeGreaterThan(0);
    expect(client.update).toHaveBeenCalledTimes(1);
  });
  it('N3 exposes selecting, saving, conflict and archived reasons for action controls', async () => {
    expect(store.blockedReason()).toBeNull();
    const pendingGet = deferred<Awaited<ReturnType<BotsClient['get']>>>();
    client.get.mockReturnValueOnce(pendingGet.promise);
    const selecting = store.select(record.id);
    expect(store.blockedReason()).toBe('selecting');
    pendingGet.resolve(
      new RpcResult(true, {
        record,
        diagnostics: [],
        executionAvailable: false,
      }),
    );
    await selecting;
    expect(store.blockedReason()).toBeNull();
    store.patchDraft({ name: 'Mine' });
    const pendingWrite = deferred<RpcResult<BotsWriteResult>>();
    client.update.mockReturnValueOnce(pendingWrite.promise);
    const saving = store.save();
    expect(store.blockedReason()).toBe('saving');
    pendingWrite.resolve(
      new RpcResult<BotsWriteResult>(
        false,
        undefined,
        '',
        'BOT_REVISION_CONFLICT',
      ),
    );
    await saving;
    expect(store.blockedReason()).toBe('conflict');
    await store.resubmitConflict();
    expect(store.blockedReason()).toBeNull();
    await store.archive();
    expect(store.blockedReason()).toBe('archived');
    await store.restore();
    expect(store.blockedReason()).toBeNull();
  });
  it('N4 pins the staged image against entry and byte eviction without an unsaved-bot reload', async () => {
    store.newDraft();
    const dataBase64 = 'A'.repeat(BOT_AVATAR_CACHE_BYTES / 6);
    await store.uploadAvatar({ mediaType: 'image/png', dataBase64 });
    const staged = store.avatars().get('image');
    for (let i = 0; i < BOT_AVATAR_CACHE_LIMIT + 1; i++)
      await store.loadAvatar(record.id, `small-${i}`);
    expect(store.avatars().get('image')).toEqual(staged);
    client.getAvatar.mockResolvedValue(
      new RpcResult(true, { mediaType: 'image/png', dataBase64 }),
    );
    for (let i = 0; i < 3; i++)
      await store.loadAvatar(record.id, `large-pinned-${i}`);
    expect(store.avatars().get('image')).toEqual(staged);
    expect(store.avatarCacheBytes()).toBeLessThanOrEqual(
      BOT_AVATAR_CACHE_BYTES,
    );
    expect(store.avatars().get('large-pinned-2')?.status).toBe('ready');
    client.getAvatar.mockClear();
    await store.loadAvatar('unsaved-bot', 'image');
    expect(client.getAvatar).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'N5 ignores a late get success=%s after upload stages the same image id',
    async (success) => {
      store.newDraft();
      const pending = deferred<Awaited<ReturnType<BotsClient['getAvatar']>>>();
      client.getAvatar.mockReturnValueOnce(pending.promise);
      const loading = store.loadAvatar('unsaved-bot', 'image');
      await store.uploadAvatar({ mediaType: 'image/png', dataBase64: 'YQ==' });
      pending.resolve(
        new RpcResult<{ mediaType: 'image/png'; dataBase64: string }>(
          success,
          success ? { mediaType: 'image/png', dataBase64: 'Yg==' } : undefined,
        ),
      );
      await loading;
      expect(store.avatars().get('image')).toEqual({
        status: 'ready',
        dataUrl: 'data:image/png;base64,YQ==',
      });
      expect(store.draft()?.definition.avatar).toEqual({
        kind: 'image',
        imageId: 'image',
      });
    },
  );
  it('D3 refuses upload staging during save with a retry action and preserves saving state', async () => {
    await store.select(record.id);
    store.patchDraft({ name: 'Mine' });
    const upload = deferred<Awaited<ReturnType<BotsClient['uploadAvatar']>>>();
    const update = deferred<RpcResult<BotsWriteResult>>();
    client.uploadAvatar.mockReturnValueOnce(upload.promise);
    client.update.mockReturnValueOnce(update.promise);
    const uploading = store.uploadAvatar({
      mediaType: 'image/png',
      dataBase64: 'YQ==',
    });
    const saving = store.save();
    upload.resolve(new RpcResult(true, { imageId: 'during-save' }));
    await uploading;
    expect(store.saving()).toBe(true);
    expect(store.saveState()).toBe('saving');
    expect(store.avatarUpload()).toMatchObject({
      status: 'error',
      error: {
        message: expect.stringContaining('Retry the upload after saving'),
      },
    });
    expect(store.draft()?.definition.avatar).toBeUndefined();
    update.resolve(write({ ...record, name: 'Mine', revision: 2 }));
    await saving;
    expect(store.saveState()).toBe('saved');
    expect(store.avatarUpload()?.status).toBe('error');
  });
  it('D4 keeps editor failures across list success and separates refresh failure after save', async () => {
    await store.select(record.id);
    store.patchDraft({ name: 'Mine' });
    client.update.mockResolvedValueOnce(
      new RpcResult<BotsWriteResult>(
        false,
        undefined,
        '',
        'PERSISTENCE_UNAVAILABLE',
      ),
    );
    await store.save();
    const editorFailure = store.error();
    await store.load({ workspaceRoot: 'D:/one' });
    expect(store.error()).toEqual(editorFailure);
    expect(store.listError()).toBeNull();
    client.list.mockResolvedValueOnce(new RpcResult(false));
    await store.save();
    expect(store.error()).toBeNull();
    expect(store.saveState()).toBe('saved');
    expect(store.listError()?.message).toContain('Retry loading bots');
    expect(store.listError()?.message).not.toContain('changes are still here');
  });
  it('D5 ignores absent and no-op drafts, returns to pristine, and keeps conflict state', async () => {
    store.patchDraft({ name: 'No draft' });
    expect(store.saveState()).toBe('pristine');
    await store.select(record.id);
    store.patchDraft({ name: record.name });
    expect(store.saveState()).toBe('pristine');
    store.patchDraft({ name: 'Mine' });
    expect(store.saveState()).toBe('dirty');
    store.patchDraft({ name: record.name });
    expect(store.saveState()).toBe('pristine');
    store.patchDraft({ name: 'Mine' });
    client.update.mockResolvedValueOnce(
      new RpcResult<BotsWriteResult>(
        false,
        undefined,
        '',
        'BOT_REVISION_CONFLICT',
      ),
    );
    await store.save();
    store.patchDraft({ name: 'Revised mine' });
    expect(store.saveState()).toBe('conflict');
    expect(store.conflict()?.mine.definition.name).toBe('Revised mine');
  });
  it('D6 preserves selection and dirty draft until selection succeeds, including failures', async () => {
    await store.select(record.id);
    store.patchDraft({ name: 'Mine' });
    const next = deferred<Awaited<ReturnType<BotsClient['get']>>>();
    client.get.mockReturnValueOnce(next.promise);
    const selecting = store.select('other');
    expect(store.selecting()).toBe(true);
    expect(store.selected()?.id).toBe(record.id);
    expect(store.draft()?.definition.name).toBe('Mine');
    next.resolve(new RpcResult(false));
    await selecting;
    expect(store.selecting()).toBe(false);
    expect(store.draft()?.definition.name).toBe('Mine');
    expect(store.dirty()).toBe(true);
    client.get.mockResolvedValueOnce(
      new RpcResult(true, {
        record: { ...record, id: 'other', name: 'Other' },
        diagnostics: [],
        executionAvailable: false,
      }),
    );
    await store.select('other');
    expect(store.selected()?.id).toBe('other');
    expect(store.draft()?.definition.name).toBe('Other');
  });
  it('D7 tolerates missing model keys and gives unique diagnostics for failed sources', async () => {
    const call = jest.spyOn(rpc, 'call');
    call.mockResolvedValueOnce(
      new RpcResult(true, {
        clis: [{ cli: 'codex', installed: true, messagingMode: 'none' }],
      }),
    );
    call.mockResolvedValueOnce(new RpcResult(true, {}));
    call.mockResolvedValueOnce(new RpcResult(false));
    await store.loadLaneChoices();
    expect(store.lanes()[0]?.models).toEqual([]);
    expect(store.catalogLoading()).toBe(false);
    call.mockResolvedValue(new RpcResult(false));
    await store.loadLaneChoices();
    expect(new Set(store.catalogDiagnostics()).size).toBe(3);
    expect(store.catalogLoading()).toBe(false);
  });
  it('D7 clears catalog loading after unexpected processing errors', async () => {
    const call = jest.spyOn(rpc, 'call');
    const detected = {
      get clis(): [] {
        throw new Error('Unreadable catalog');
      },
    };
    call.mockResolvedValueOnce(new RpcResult(true, detected));
    call.mockResolvedValueOnce(new RpcResult(false));
    call.mockResolvedValueOnce(new RpcResult(false));
    await store.loadLaneChoices();
    expect(store.catalogLoading()).toBe(false);
    expect(store.catalogDiagnostics()).toEqual([
      'Runtime catalog could not be read. Retry loading runtime choices.',
    ]);
  });
  it('D8 blocks enabled toggles while conflict comparison awaits resolution', async () => {
    await store.select(record.id);
    store.patchDraft({ name: 'Mine' });
    client.update.mockResolvedValueOnce(
      new RpcResult<BotsWriteResult>(
        false,
        undefined,
        '',
        'BOT_REVISION_CONFLICT',
      ),
    );
    client.get.mockResolvedValueOnce(
      new RpcResult(true, {
        record: { ...record, revision: 4 },
        diagnostics: [],
        executionAvailable: false,
      }),
    );
    await store.save();
    await store.setEnabled(true);
    expect(client.setEnabled).not.toHaveBeenCalled();
    expect(store.conflict()?.latest.revision).toBe(4);
    await store.resubmitConflict();
    expect(client.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedRevision: 4 }),
    );
  });
  it('D9 compares nested objects independently of key order while preserving array order', async () => {
    client.get.mockResolvedValueOnce(
      new RpcResult(true, {
        record: {
          ...record,
          runtime: { kind: 'main', providerId: 'provider', model: 'm' },
          skills: [{ id: 'a' }, { id: 'b' }],
        },
        diagnostics: [],
        executionAvailable: false,
      }),
    );
    await store.select(record.id);
    store.patchDraft({
      scope: { workspaceRoot: 'D:/one', kind: 'workspace' },
      runtime: { model: 'm', providerId: 'provider', kind: 'main' },
    });
    expect(store.dirty()).toBe(false);
    expect(store.saveState()).toBe('pristine');
    store.patchDraft({ skills: [{ id: 'b' }, { id: 'a' }] });
    expect(store.dirty()).toBe(true);
  });
  it('D10 derives upload scope from the draft and removes staged images on scope change', async () => {
    store.newDraft();
    await store.uploadAvatar({
      scope: { kind: 'user' },
      mediaType: 'image/png',
      dataBase64: 'YQ==',
    });
    expect(client.uploadAvatar).toHaveBeenCalledWith({
      scope: record.scope,
      mediaType: 'image/png',
      dataBase64: 'YQ==',
    });
    expect(store.draft()?.definition.avatar).toEqual({
      kind: 'image',
      imageId: 'image',
    });
    store.patchDraft({ scope: { kind: 'user' } });
    expect(store.draft()?.definition.avatar).toBeUndefined();
    expect(store.avatarUpload()).toBeNull();
  });
  it('D11 evicts settled images by byte budget before reaching the entry limit', async () => {
    const dataBase64 = 'A'.repeat(BOT_AVATAR_CACHE_BYTES / 6);
    client.getAvatar.mockResolvedValue(
      new RpcResult(true, { mediaType: 'image/png', dataBase64 }),
    );
    for (let i = 0; i < 3; i++) await store.loadAvatar(record.id, `large-${i}`);
    expect(store.avatarCacheBytes()).toBeLessThanOrEqual(
      BOT_AVATAR_CACHE_BYTES,
    );
    expect(store.avatars().size).toBeLessThan(3);
    expect(store.avatars().get('large-2')?.status).toBe('ready');
  });
  it('D11 distinguishes storage, invalid upload, and missing image failures', async () => {
    store.newDraft();
    client.uploadAvatar.mockResolvedValueOnce(
      new RpcResult<{ imageId: string }>(
        false,
        undefined,
        '',
        'PERSISTENCE_UNAVAILABLE',
      ),
    );
    await store.uploadAvatar({ mediaType: 'image/png', dataBase64: 'YQ==' });
    const failure = store.avatarUpload();
    expect(failure).toMatchObject({
      status: 'error',
      error: { message: expect.stringContaining('storage is unavailable') },
    });
    if (failure?.status === 'error')
      expect(failure.error.message).not.toContain('2 MB');
    client.uploadAvatar.mockResolvedValueOnce(
      new RpcResult<{ imageId: string }>(
        false,
        undefined,
        '',
        'INVALID_PARAMS',
      ),
    );
    await store.uploadAvatar({ mediaType: 'image/png', dataBase64: 'YQ==' });
    expect(store.avatarUpload()).toMatchObject({
      status: 'error',
      error: { message: expect.stringContaining('2 MB') },
    });
    client.getAvatar.mockResolvedValueOnce(
      new RpcResult<{ mediaType: 'image/png'; dataBase64: string }>(
        false,
        undefined,
        '',
        'BOT_NOT_FOUND',
      ),
    );
    await store.loadAvatar(record.id, 'missing');
    const image = store.avatars().get('missing');
    expect(image).toMatchObject({
      status: 'error',
      error: { message: expect.stringContaining('avatar image is missing') },
    });
    if (image?.status === 'error')
      expect(image.error.message).not.toContain('bot no longer exists');
  });
  it('maps each domain refusal to a distinct actionable message with fallback', () => {
    const codes: BotDomainCode[] = [
      'BOT_NOT_FOUND',
      'BOT_REVISION_CONFLICT',
      'BOT_ARCHIVED',
      'BOT_SCHEMA_UNSUPPORTED',
      'BOT_SOURCE_INVALID',
      'BOT_RETENTION_UNAVAILABLE',
      'BOT_ACTIVE_WORK',
      'PERSISTENCE_UNAVAILABLE',
      'INVALID_PARAMS',
      'UNAUTHORIZED_WORKSPACE',
    ];
    const messages = codes.map((code) => botErrorMessage(code));
    expect(new Set(messages).size).toBe(codes.length);
    expect(messages).not.toContain('Bot request was refused.');
    expect(botErrorMessage('NEW_CODE')).toBe(botErrorMessage());
  });
  it('discovers system and Ptah CLI models without starting lanes', async () => {
    const call = jest.spyOn(rpc, 'call');
    call.mockResolvedValueOnce(
      new RpcResult(true, {
        clis: [{ cli: 'codex', installed: true, messagingMode: 'none' }],
      }),
    );
    call.mockResolvedValueOnce(
      new RpcResult(true, {
        codex: [{ id: 'system-model', name: 'System', isFallback: true }],
        claude: [],
        copilot: [],
        cursor: [],
        antigravity: [],
        opencode: [],
        pi: [],
        grok: [],
      }),
    );
    call.mockResolvedValueOnce(
      new RpcResult(true, {
        agents: [
          {
            id: 'ptah-1',
            name: 'Local',
            enabled: true,
            hasApiKey: true,
            hasStoredKey: true,
            providerName: 'Local',
            providerId: 'local',
            status: 'available' as const,
            modelCount: 1,
          },
        ],
      }),
    );
    call.mockResolvedValueOnce(
      new RpcResult(true, {
        models: [{ id: 'local-model', name: 'Local model' }],
        isStatic: false,
      }),
    );
    await store.loadLaneChoices();
    expect(store.lanes()).toEqual([
      expect.objectContaining({
        target: { kind: 'system', cli: 'codex' },
        models: [expect.objectContaining({ id: 'system-model' })],
        diagnostics: ['Model catalog is using fallback data.'],
      }),
      expect.objectContaining({
        target: { kind: 'ptah-cli', ptahCliId: 'ptah-1' },
        models: [{ id: 'local-model', name: 'Local model' }],
        available: true,
      }),
    ]);
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'agent:detectClis',
      'agent:listCliModels',
      'ptahCli:list',
      'ptahCli:listModels',
    ]);
    expect(call).toHaveBeenLastCalledWith('ptahCli:listModels', {
      id: 'ptah-1',
    });
  });
  it('drops a stale catalog result', async () => {
    const call = jest.spyOn(rpc, 'call');
    const first = deferred<Awaited<ReturnType<ClaudeRpcService['call']>>>();
    call.mockReturnValueOnce(first.promise);
    call.mockResolvedValue(new RpcResult(false));
    const pending = store.loadLaneChoices();
    await store.loadLaneChoices();
    first.resolve(new RpcResult(true, { clis: [] }));
    await pending;
    expect(store.catalogDiagnostics()).toHaveLength(3);
    expect(store.lanes()).toEqual([]);
  });
  it('stages upload data, keeps unrelated edits, and caches by returned image id', async () => {
    store.newDraft();
    const pending = deferred<Awaited<ReturnType<BotsClient['uploadAvatar']>>>();
    client.uploadAvatar.mockReturnValueOnce(pending.promise);
    const uploading = store.uploadAvatar({
      scope: record.scope,
      mediaType: 'image/png',
      dataBase64: 'YQ==',
    });
    store.patchDraft({ name: 'Still editing' });
    pending.resolve(new RpcResult(true, { imageId: 'staged' }));
    await uploading;
    expect(store.draft()?.definition).toMatchObject({
      name: 'Still editing',
      avatar: { kind: 'image', imageId: 'staged' },
    });
    expect(store.avatarUpload()).toEqual({
      status: 'ready',
      dataUrl: 'data:image/png;base64,YQ==',
    });
    await store.loadAvatar(record.id, 'staged');
    expect(client.getAvatar).not.toHaveBeenCalled();
  });
  it('drops an upload superseded by an icon choice', async () => {
    store.newDraft();
    const pending = deferred<Awaited<ReturnType<BotsClient['uploadAvatar']>>>();
    client.uploadAvatar.mockReturnValueOnce(pending.promise);
    const uploading = store.uploadAvatar({
      scope: record.scope,
      mediaType: 'image/png',
      dataBase64: 'YQ==',
    });
    store.patchDraft({ avatar: { kind: 'icon', name: 'wrench' } });
    pending.resolve(new RpcResult(true, { imageId: 'late' }));
    await uploading;
    expect(store.draft()?.definition.avatar).toEqual({
      kind: 'icon',
      name: 'wrench',
    });
    expect(store.avatarUpload()).toBeNull();
  });
  it('surfaces unavailable catalog diagnostics returned with the bot', async () => {
    const diagnostic = {
      code: 'CATALOG_UNAVAILABLE',
      message: 'Tools unavailable',
      severity: 'warning' as const,
    };
    client.get.mockResolvedValueOnce(
      new RpcResult(true, {
        record,
        diagnostics: [diagnostic],
        executionAvailable: false,
      }),
    );
    await store.select(record.id);
    expect(store.diagnostics()).toEqual([diagnostic]);
  });
  it('archives and restores through ID-only calls and prevents archived edits', async () => {
    await store.select(record.id);
    await store.archive();
    store.patchDraft({ name: 'Forbidden' });
    expect(store.readonly()).toBe(true);
    expect(store.draft()?.definition.name).toBe('Bot');
    await store.restore();
    expect(store.readonly()).toBe(false);
    expect(store.draft()?.enabled).toBe(false);
    expect(client.archive).toHaveBeenCalledWith({
      id: record.id,
      expectedRevision: 1,
    });
    expect(client.restore).toHaveBeenCalledWith({
      id: record.id,
      expectedRevision: 1,
    });
  });
});

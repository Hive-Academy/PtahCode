import { TestBed } from '@angular/core/testing';
import {
  PROVIDER_MODELS_LOADER,
  PtahRichSelectComponent,
} from '@ptah-extension/ui';
import { ClaudeRpcService, RpcResult } from '@ptah-extension/core';
import type { BotEditable } from '@ptah-extension/shared';
import { BotsClient } from './bots-client';
import { BotsStore } from './bots.store';
import { BotIdentityRuntimeSectionComponent } from './bot-identity-runtime-section.component';
import { BotSkillsToolsSectionComponent } from './bot-skills-tools-section.component';
import { BotMemoryApprovalSectionComponent } from './bot-memory-approval-section.component';
import { ToolIdChipInputComponent } from './tool-id-chip-input.component';
import { By } from '@angular/platform-browser';

describe('Bot form sections', () => {
  const imageId = '00000000-0000-4000-8000-000000000002';
  let store: BotsStore;
  const uploadAvatar = jest.fn<
    ReturnType<BotsClient['uploadAvatar']>,
    Parameters<BotsClient['uploadAvatar']>
  >();
  const call = jest.fn();
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: BotsClient, useValue: { uploadAvatar } },
        { provide: ClaudeRpcService, useValue: { call } },
        {
          provide: PROVIDER_MODELS_LOADER,
          useValue: {
            listModels: jest.fn(async () => ({ models: [], totalCount: 0 })),
          },
        },
      ],
    });
    store = TestBed.inject(BotsStore);
    store.setWorkspaceRoots(['D:/one', 'D:/two']);
    store.newDraft({ kind: 'workspace', workspaceRoot: 'D:/one' });
    uploadAvatar.mockReset();
    call.mockReset();
  });
  const runtime = () => store.draft()?.definition.runtime;

  it('opens the labelled hidden avatar input from the upload button', () => {
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const file = root.querySelector<HTMLInputElement>('input[type="file"]');
    const trigger = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Upload image',
    );
    if (!file || !trigger) throw new Error('Missing avatar upload controls');
    expect(file.classList).toContain('sr-only');
    expect(file.getAttribute('accept')).toBe('image/png,image/jpeg,image/webp');
    expect(root.querySelector(`label[for="${file.id}"]`)?.textContent).toBe(
      'Upload image',
    );
    expect(trigger.hasAttribute('ptahButton')).toBe(true);
    const hint = trigger.getAttribute('aria-describedby');
    expect(hint && root.querySelector(`#${hint}`)?.textContent).toContain(
      'PNG, JPEG or WebP, up to 2 MB.',
    );
    const open = jest.spyOn(file, 'click').mockImplementation(() => undefined);
    trigger.click();
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('switches all runtime kinds with no stale fields', () => {
    const component = TestBed.createComponent(
      BotIdentityRuntimeSectionComponent,
    ).componentInstance;
    for (const from of ['default', 'main', 'lane']) {
      for (const to of ['default', 'main', 'lane']) {
        component.setKind(from);
        component.setEffort('high');
        component.setLaneModel('old-model');
        component.setTier('opus');
        component.setKind(to);
        expect(runtime()).toEqual(
          to === 'default'
            ? { kind: 'default' }
            : to === 'main'
              ? { kind: 'main', providerId: '', model: '' }
              : { kind: 'lane', target: { kind: 'system', cli: '' } },
        );
      }
    }
  });
  it('keeps Default symbolic when settings change', () => {
    const loader = TestBed.inject(PROVIDER_MODELS_LOADER);
    const models = jest.spyOn(loader, 'listModels');
    models.mockResolvedValue({ models: [], totalCount: 0 });
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    fixture.detectChanges();
    models.mockResolvedValue({
      models: [],
      totalCount: 0,
      error: 'Settings changed',
    });
    fixture.detectChanges();
    expect(models).not.toHaveBeenCalled();
    expect(runtime()).toEqual({ kind: 'default' });
    expect(fixture.nativeElement.textContent).toContain(
      'current default runtime',
    );
  });
  it('switches system and Ptah CLI targets without stale model fields', () => {
    jest.spyOn(store, 'lanes').mockReturnValue([
      {
        target: { kind: 'system', cli: 'codex' },
        label: 'Codex',
        available: true,
        models: [],
        diagnostics: [],
      },
      {
        target: { kind: 'ptah-cli', ptahCliId: 'team' },
        label: 'Team',
        available: false,
        models: [],
        diagnostics: [],
      },
    ]);
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    fixture.componentInstance.setKind('lane');
    fixture.componentInstance.setLaneModel('old-model');
    fixture.componentInstance.setTier('opus');
    fixture.componentInstance.setEffort('high');
    fixture.componentInstance.setLane('ptah-cli:team');
    expect(runtime()).toEqual({
      kind: 'lane',
      target: { kind: 'ptah-cli', ptahCliId: 'team' },
    });
    fixture.componentInstance.setLane('system:codex');
    expect(runtime()).toEqual({
      kind: 'lane',
      target: { kind: 'system', cli: 'codex' },
    });
  });
  it('retains unresolved system and Ptah CLI ids, models and tiers', () => {
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    for (const target of [
      { kind: 'system' as const, cli: 'missing' },
      { kind: 'ptah-cli' as const, ptahCliId: 'missing' },
    ]) {
      const value: BotEditable['runtime'] = {
        kind: 'lane',
        target,
        model: 'old-model',
        modelTier: 'sonnet',
        effort: 'high',
      };
      store.patchDraft({ runtime: value });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('(unresolved)');
      expect(runtime()).toEqual(value);
    }
  });
  it('only renders the provider picker for main and keeps unresolved main selections', () => {
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('ptah-provider-model-picker'),
    ).toBeNull();
    fixture.componentInstance.setKind('main');
    fixture.componentInstance.setMain({
      provider: 'missing-provider',
      model: 'missing-model',
    });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('ptah-provider-model-picker'),
    ).toBeTruthy();
    expect(runtime()).toEqual({
      kind: 'main',
      providerId: 'missing-provider',
      model: 'missing-model',
    });
    fixture.componentInstance.setKind('lane');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('ptah-provider-model-picker'),
    ).toBeNull();
  });
  it('chooses an icon and removes an image through the store', () => {
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    fixture.componentInstance.setAvatar('icon');
    fixture.componentInstance.setIcon('shield');
    expect(store.draft()?.definition.avatar).toEqual({
      kind: 'icon',
      name: 'shield',
    });
    store.patchDraft({ avatar: { kind: 'image', imageId } });
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Remove avatar')
      ?.click();
    expect(store.draft()?.definition.avatar).toBeUndefined();
  });
  it('shows staged upload failure without replacing the chosen icon', async () => {
    uploadAvatar.mockResolvedValue(
      new RpcResult<{ imageId: string }>(
        false,
        undefined,
        'failure',
        'INVALID_PARAMS',
      ),
    );
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    fixture.componentInstance.setIcon('code');
    await store.uploadAvatar({
      mediaType: 'image/png',
      dataBase64: 'aGVsbG8=',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Choose a PNG, JPEG or WebP',
    );
    expect(fixture.nativeElement.textContent).not.toContain('INVALID_PARAMS');
    expect(store.draft()?.definition.avatar).toEqual({
      kind: 'icon',
      name: 'code',
    });
    expect(uploadAvatar).toHaveBeenCalledWith({
      scope: { kind: 'workspace', workspaceRoot: 'D:/one' },
      mediaType: 'image/png',
      dataBase64: 'aGVsbG8=',
    });
  });
  function pick(
    component: BotIdentityRuntimeSectionComponent,
    file: File,
  ): void {
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    input.addEventListener('change', (event) => component.upload(event));
    input.dispatchEvent(new Event('change'));
  }
  function readSetup() {
    const readers: FileReader[] = [];
    jest
      .spyOn(FileReader.prototype, 'readAsDataURL')
      .mockImplementation(function (this: FileReader) {
        readers.push(this);
      });
    const abort = jest
      .spyOn(FileReader.prototype, 'abort')
      .mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    const upload = jest.spyOn(store, 'uploadAvatar').mockResolvedValue();
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });
    const finish = (
      index: number,
      kind: 'load' | 'error',
      data = 'aGVsbG8=',
    ): void => {
      const reader = readers[index];
      if (!reader) throw new Error('Reader missing');
      Object.defineProperty(reader, 'result', {
        configurable: true,
        value: 'data:image/png;base64,' + data,
      });
      reader.dispatchEvent(new Event(kind));
      fixture.detectChanges();
    };
    return { fixture, upload, file, finish, abort };
  }
  afterEach(() => jest.restoreAllMocks());
  it('uploads a successful reader result without scope after unrelated typing', () => {
    const { fixture, upload, file, finish } = readSetup();
    pick(fixture.componentInstance, file);
    fixture.componentInstance.patch({ name: 'Typed while reading' });
    finish(0, 'load');
    expect(upload).toHaveBeenCalledWith({
      mediaType: 'image/png',
      dataBase64: 'aGVsbG8=',
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('shows a local reader error without uploading', () => {
    const { fixture, upload, file, finish } = readSetup();
    pick(fixture.componentInstance, file);
    finish(0, 'error');
    expect(upload).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      'Retry the avatar upload',
    );
  });
  it('aborts the older reader and ignores out-of-order completion', () => {
    const { fixture, upload, file, finish, abort } = readSetup();
    pick(fixture.componentInstance, file);
    pick(fixture.componentInstance, file);
    expect(abort).toHaveBeenCalledTimes(1);
    finish(1, 'load', 'bmV3');
    finish(0, 'load', 'b2xk');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith({
      mediaType: 'image/png',
      dataBase64: 'bmV3',
    });
  });
  it.each(['scope', 'avatar'] as const)(
    'announces a dropped reader after %s changes',
    (field) => {
      const { fixture, upload, file, finish } = readSetup();
      pick(fixture.componentInstance, file);
      if (field === 'scope') fixture.componentInstance.setScope('user');
      else fixture.componentInstance.setIcon('shield');
      finish(0, 'load');
      expect(upload).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain(
        'Image read was dropped',
      );
      expect(
        fixture.nativeElement.querySelector('[role="status"]').textContent,
      ).toContain('Choose the image again');
    },
  );
  it.each(['invalid type', 'oversize'])(
    'rejects %s locally without an upload or read',
    (reason) => {
      const { fixture, upload } = readSetup();
      const file = new File(
        ['bad'],
        reason === 'invalid type' ? 'bad.txt' : 'big.png',
        { type: reason === 'invalid type' ? 'text/plain' : 'image/png' },
      );
      if (reason === 'oversize')
        Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 + 1 });
      pick(fixture.componentInstance, file);
      fixture.detectChanges();
      expect(upload).not.toHaveBeenCalled();
      expect(FileReader.prototype.readAsDataURL).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain(
        'Choose a PNG, JPEG or WebP up to 2 MB',
      );
    },
  );
  it('prefers an available lane and falls back to the first unavailable lane', () => {
    const lanes = jest.spyOn(store, 'lanes');
    const unavailable = {
      target: { kind: 'system' as const, cli: 'unavailable' },
      label: 'Unavailable',
      available: false,
      models: [],
      diagnostics: [],
    };
    const available = {
      ...unavailable,
      target: { kind: 'system' as const, cli: 'available' },
      available: true,
    };
    lanes.mockReturnValue([unavailable, available]);
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    fixture.componentInstance.setKind('lane');
    expect(runtime()).toEqual({ kind: 'lane', target: available.target });
    lanes.mockReturnValue([unavailable]);
    fixture.componentInstance.setKind('lane');
    expect(runtime()).toEqual({ kind: 'lane', target: unavailable.target });
  });
  it('uses designed effort choices and preserves an unresolved stored effort', () => {
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    fixture.componentInstance.setKind('lane');
    fixture.componentInstance.setEffort('special-effort');
    fixture.detectChanges();
    const selects = fixture.debugElement.queryAll(
      By.directive(PtahRichSelectComponent),
    );
    const effort = selects
      .map((node) => node.componentInstance as PtahRichSelectComponent<string>)
      .find((select) =>
        select.options().some((option) => option.value === 'special-effort'),
      );
    expect(effort?.options().map((option) => option.label)).toEqual([
      'Default',
      'low',
      'medium',
      'high',
      'special-effort (unresolved)',
    ]);
    expect(effort?.value()).toBe('special-effort');
    effort?.value.set('high');
    expect(runtime()).toMatchObject({ effort: 'high' });
    fixture.componentInstance.setEffort('');
    expect(runtime()).not.toHaveProperty('effort');
  });
  it('leaves the editor error to the composing editor', () => {
    jest
      .spyOn(store, 'error')
      .mockReturnValue({ code: 'BOT_NOT_FOUND', message: 'raw editor error' });
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain(
      'This bot no longer exists',
    );
    expect(fixture.nativeElement.textContent).not.toContain('raw editor error');
  });
  it('retries cached avatar errors with force true', () => {
    const definition = store.draft()?.definition;
    if (!definition) throw new Error('Draft missing');
    const selected = jest.spyOn(store, 'selected').mockReturnValue({
      ...definition,
      id: 'bot-id',
      schemaVersion: 2,
      revision: 1,
      enabled: false,
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
      origin: { kind: 'manual' },
    });
    store.patchDraft({ avatar: { kind: 'image', imageId } });
    jest.spyOn(store, 'avatars').mockReturnValue(
      new Map([
        [
          imageId,
          {
            status: 'error',
            error: { code: 'BOT_NOT_FOUND', message: 'raw' },
          },
        ],
      ]),
    );
    const load = jest.spyOn(store, 'loadAvatar').mockResolvedValue();
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).toContain('avatar image is missing');
    Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Retry avatar')
      ?.click();
    expect(load).toHaveBeenLastCalledWith('bot-id', imageId, true);
    selected.mockRestore();
  });
  it('disables fields while saving and keeps conflict edits available', () => {
    const readonly = jest.spyOn(store, 'readonly').mockReturnValue(false);
    const blocked = jest
      .spyOn(store, 'blockedReason')
      .mockReturnValue('conflict');
    const fixture = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector<HTMLInputElement>('#bot-name')?.disabled).toBe(
      false,
    );
    fixture.componentInstance.patch({ name: 'mine' });
    expect(store.draft()?.definition.name).toBe('mine');
    readonly.mockReturnValue(true);
    blocked.mockReturnValue('saving');
    // Fresh fixture ensures mocked signal reads are checked without cached computed values.
    const saving = TestBed.createComponent(BotIdentityRuntimeSectionComponent);
    saving.detectChanges();
    expect(saving.nativeElement.querySelector('#bot-name').disabled).toBe(true);
  });
  it('passes false catalogLoaded during tool loading or failure and preserves ids', () => {
    store.patchDraft({
      toolRequirements: { allow: ['unknown'], deny: ['unknown'] },
    });
    const fixture = TestBed.createComponent(BotSkillsToolsSectionComponent);
    fixture.componentRef.setInput('catalogLoaded', true);
    for (const state of ['catalogLoading', 'catalogFailed']) {
      fixture.componentRef.setInput(state, true);
      fixture.detectChanges();
      const child = fixture.debugElement.query(
        By.directive(ToolIdChipInputComponent),
      ).componentInstance as ToolIdChipInputComponent;
      expect(child.catalogLoaded()).toBe(false);
      expect(child.ids()).toEqual(['unknown']);
      fixture.componentRef.setInput(state, false);
    }
  });
  it('defaults to private memory and ask, validates roots, and leaves triggers inactive', () => {
    const fixture = TestBed.createComponent(BotMemoryApprovalSectionComponent);
    expect(store.draft()?.definition.memoryScope).toEqual({ kind: 'private' });
    expect(store.draft()?.definition.approvalRules).toEqual({ mode: 'ask' });
    fixture.componentInstance.setMemory('workspace');
    expect(fixture.componentInstance.rootError()).toBeNull();
    fixture.componentInstance.setRoot('D:/two');
    expect(fixture.componentInstance.rootError()).toContain('D:/one');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Not available yet');
    expect(store.draft()?.definition.triggers).toEqual([]);
  });
});

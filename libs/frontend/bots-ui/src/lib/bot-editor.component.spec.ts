import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ClaudeRpcService, RpcResult } from '@ptah-extension/core';
import { PROVIDER_MODELS_LOADER } from '@ptah-extension/ui';
import type { BotRecord, BotsWriteResult } from '@ptah-extension/shared';
import { BotsClient } from './bots-client';
import { BotsStore } from './bots.store';
import { BotEditorComponent } from './bot-editor.component';
import {
  BotSaveBarComponent,
  type BotSaveDisplayState,
} from './bot-save-bar.component';
import { BotDeleteDialogComponent } from './bot-delete-dialog.component';
import { BotSkillsToolsSectionComponent } from './bot-skills-tools-section.component';
import { BotIdentityRuntimeSectionComponent } from './bot-identity-runtime-section.component';

const record: BotRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  schemaVersion: 2,
  revision: 4,
  name: 'Release bot',
  description: '',
  instructions: 'Write release notes',
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
const success = (value = record) =>
  new RpcResult<BotsWriteResult>(true, { record: value, diagnostics: [] });

describe('Bot editor', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
  });
  let store: BotsStore;
  const get = jest.fn<
    ReturnType<BotsClient['get']>,
    Parameters<BotsClient['get']>
  >();
  const update = jest.fn<
    ReturnType<BotsClient['update']>,
    Parameters<BotsClient['update']>
  >();
  const setEnabled = jest.fn<
    ReturnType<BotsClient['setEnabled']>,
    Parameters<BotsClient['setEnabled']>
  >();
  const restore = jest.fn<
    ReturnType<BotsClient['restore']>,
    Parameters<BotsClient['restore']>
  >();
  const archive = jest.fn<
    ReturnType<BotsClient['archive']>,
    Parameters<BotsClient['archive']>
  >();
  const uploadAvatar = jest.fn<
    ReturnType<BotsClient['uploadAvatar']>,
    Parameters<BotsClient['uploadAvatar']>
  >();
  beforeEach(() => {
    jest.resetAllMocks();
    get.mockResolvedValue(
      new RpcResult(true, {
        record,
        diagnostics: [],
        executionAvailable: false,
      }),
    );
    update.mockResolvedValue(success({ ...record, revision: 5 }));
    setEnabled.mockResolvedValue(
      success({ ...record, revision: 5, enabled: true }),
    );
    restore.mockResolvedValue(
      success({ ...record, revision: 5, enabled: false }),
    );
    archive.mockResolvedValue(success({ ...record, archivedAt: 20 }));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BotsClient,
          useValue: { get, update, setEnabled, restore, archive, uploadAvatar },
        },
        { provide: ClaudeRpcService, useValue: { call: jest.fn() } },
        {
          provide: PROVIDER_MODELS_LOADER,
          useValue: {
            listModels: jest.fn(async () => ({ models: [], totalCount: 0 })),
          },
        },
      ],
    });
    store = TestBed.inject(BotsStore);
  });
  afterEach(() => jest.restoreAllMocks());
  async function setup(value = record) {
    get.mockResolvedValue(
      new RpcResult(true, {
        record: value,
        diagnostics: [],
        executionAvailable: false,
      }),
    );
    await store.select(value.id);
    const fixture = TestBed.createComponent(BotEditorComponent);
    fixture.detectChanges();
    return fixture;
  }
  function button(root: HTMLElement, text: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === text,
    );
    if (!found) throw new Error(`Missing button: ${text}`);
    return found;
  }
  it('associates Enabled with the exact hint and keeps execution unavailable', async () => {
    const fixture = await setup();
    const root: HTMLElement = fixture.nativeElement;
    const toggle = root.querySelector<HTMLInputElement>('[role="switch"]');
    expect(toggle).not.toBeNull();
    const hint = toggle?.getAttribute('aria-describedby');
    expect(hint && root.querySelector(`#${hint}`)?.textContent).toBe(
      'Applies at once. Does not save other edits.',
    );
    expect(root.textContent).toContain('Bots cannot start yet');
    store.patchDraft({ instructions: 'Unsaved work' });
    if (!toggle) throw new Error('Missing switch');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(setEnabled).toHaveBeenCalledWith({
      id: record.id,
      expectedRevision: 4,
      enabled: true,
    });
    expect(store.draft()?.definition.instructions).toBe('Unsaved work');
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['failure', 'conflict'])(
    'resets the Enabled checkbox after a %s',
    async (outcome) => {
      const fixture = await setup();
      store.patchDraft({ instructions: 'Unsaved work' });
      let finish: ((result: RpcResult<BotsWriteResult>) => void) | undefined;
      setEnabled.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const checkbox: HTMLInputElement | null =
        fixture.nativeElement.querySelector('[role="switch"]');
      if (!checkbox) throw new Error('Missing Enabled checkbox');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
      expect(checkbox.checked).toBe(true);
      if (!finish) throw new Error('Enabled request did not start');
      finish(
        new RpcResult<BotsWriteResult>(
          false,
          undefined,
          'Unavailable',
          outcome === 'conflict' ? 'BOT_REVISION_CONFLICT' : undefined,
        ),
      );
      await fixture.whenStable();
      expect(store.draft()?.enabled).toBe(false);
      expect(checkbox.checked).toBe(false);
      expect(store.draft()?.definition.instructions).toBe('Unsaved work');
      if (outcome === 'failure') {
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain(
          'Could not complete the action',
        );
      }
    },
  );
  it.each(['new draft', 'cancel then new', 'select'])(
    'resets validation attempts on %s',
    async (replacement) => {
      store.newDraft({ kind: 'user' });
      const fixture = TestBed.createComponent(BotEditorComponent);
      fixture.detectChanges();
      button(fixture.nativeElement, 'Create bot').click();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(
        'Fix 2 fields before you save.',
      );
      if (replacement === 'select') {
        await store.select(record.id);
      } else {
        if (replacement === 'cancel then new') {
          button(fixture.nativeElement, 'Cancel').click();
          fixture.detectChanges();
          expect(store.draft()).toBeNull();
          expect(fixture.nativeElement.textContent).not.toContain(
            'Your changes are still here.',
          );
        }
        store.newDraft({ kind: 'user' });
      }
      fixture.detectChanges();
      const bar = fixture.debugElement.query(By.directive(BotSaveBarComponent))
        .componentInstance as BotSaveBarComponent;
      expect(bar.state()).toBe(replacement === 'select' ? 'pristine' : 'new');
      expect(fixture.nativeElement.textContent).not.toContain(
        'Fix 2 fields before you save.',
      );
    },
  );
  it('keeps the invalid save summary when typing in another field', async () => {
    store.newDraft({ kind: 'user' });
    const fixture = TestBed.createComponent(BotEditorComponent);
    fixture.detectChanges();
    button(fixture.nativeElement, 'Create bot').click();
    fixture.detectChanges();
    const bar = fixture.debugElement.query(By.directive(BotSaveBarComponent))
      .componentInstance as BotSaveBarComponent;
    expect(bar.state()).toBe('invalid');
    const description: HTMLInputElement | null =
      fixture.nativeElement.querySelector(
        'ptah-field[label="Description"] input',
      );
    if (!description) throw new Error('Missing description field');
    description.value = 'x';
    description.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(store.draft()?.definition.description).toBe('x');
    expect(store.validation()).toHaveLength(2);
    expect(bar.state()).toBe('invalid');
    expect(fixture.nativeElement.textContent).toContain(
      'Fix 2 fields before you save.',
    );
  });
  it('renders readonly archive, hides save bar and restores disabled', async () => {
    const fixture = await setup({ ...record, archivedAt: 10 });
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('This bot is archived');
    expect(root.querySelector('fieldset')?.disabled).toBe(true);
    expect(root.querySelector('ptah-bot-save-bar')).toBeNull();
    expect(
      root.querySelector<HTMLInputElement>('[role="switch"]')?.disabled,
    ).toBe(true);
    button(root, 'Restore').click();
    await fixture.whenStable();
    expect(restore).toHaveBeenCalled();
    expect(store.draft()?.enabled).toBe(false);
  });
  it('disables Restore while a restore is pending', async () => {
    const fixture = await setup({ ...record, archivedAt: 10 });
    restore.mockReturnValue(new Promise(() => undefined));
    button(fixture.nativeElement, 'Restore').click();
    fixture.detectChanges();
    expect(button(fixture.nativeElement, 'Restore').disabled).toBe(true);
  });
  it('focuses the first invalid field without dropping the draft', async () => {
    const fixture = await setup();
    document.body.append(fixture.nativeElement);
    store.patchDraft({ name: '', instructions: '' });
    fixture.detectChanges();
    fixture.componentInstance.save();
    fixture.detectChanges();
    expect(document.activeElement?.id).toBe('bot-name');
    expect(fixture.nativeElement.textContent).toContain(
      'Fix 2 fields before you save.',
    );
    expect(update).not.toHaveBeenCalled();
    expect(store.draft()?.definition.instructions).toBe('');
    fixture.nativeElement.remove();
  });
  async function conflict() {
    const fixture = await setup();
    store.patchDraft({ instructions: 'My local instructions' });
    update.mockResolvedValue(
      new RpcResult<BotsWriteResult>(
        false,
        undefined,
        'Conflict',
        'BOT_REVISION_CONFLICT',
      ),
    );
    get.mockResolvedValue(
      new RpcResult(true, {
        record: { ...record, revision: 5, instructions: 'Latest instructions' },
        diagnostics: [],
        executionAvailable: false,
      }),
    );
    await store.save();
    fixture.detectChanges();
    return fixture;
  }
  it('shows only the conflict alert and disables ordinary discard', async () => {
    const fixture = await conflict();
    const root: HTMLElement = fixture.nativeElement;
    expect(store.error()).not.toBeNull();
    const alerts = root.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain('A newer revision exists');
    expect(root.textContent).not.toContain('Could not complete the action');
    const discard = button(root, 'Discard changes');
    expect(discard.disabled).toBe(true);
    discard.click();
    expect(store.draft()?.definition.instructions).toBe(
      'My local instructions',
    );
    expect(store.conflict()).not.toBeNull();
  });
  it('compares both revisions, allows editing mine and preserves local work', async () => {
    const fixture = await conflict();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('fieldset')?.disabled).toBe(true);
    expect(button(root, 'Compare with revision 5').disabled).toBe(false);
    button(root, 'Compare with revision 5').click();
    fixture.detectChanges();
    expect(root.querySelector('[role="dialog"]')?.textContent).toContain(
      'My local instructions',
    );
    expect(root.querySelector('[role="dialog"]')?.textContent).toContain(
      'Latest instructions',
    );
    button(root, 'Edit mine').click();
    fixture.detectChanges();
    expect(root.querySelector('fieldset')?.disabled).toBe(false);
    expect(store.draft()?.definition.instructions).toBe(
      'My local instructions',
    );
    expect(button(root, 'Save').disabled).toBe(true);
  });
  it('loads latest only on the explicit discard choice', async () => {
    const fixture = await conflict();
    button(fixture.nativeElement, 'Discard mine and load revision 5').click();
    fixture.detectChanges();
    expect(store.draft()?.definition.instructions).toBe('Latest instructions');
    expect(store.conflict()).toBeNull();
  });
  it('resubmits the full draft against the latest revision', async () => {
    const fixture = await conflict();
    update.mockResolvedValue(
      success({
        ...record,
        revision: 6,
        instructions: 'My local instructions',
      }),
    );
    button(fixture.nativeElement, 'Save mine as revision 6').click();
    await fixture.whenStable();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: 5,
        definition: expect.objectContaining({
          instructions: 'My local instructions',
        }),
      }),
    );
    expect(store.draft()?.revision).toBe(6);
  });
  it('owns one error display and retains work on failed save', async () => {
    const fixture = await setup();
    store.patchDraft({ instructions: 'Keep this' });
    update.mockResolvedValue(
      new RpcResult<BotsWriteResult>(false, undefined, 'Unavailable'),
    );
    await store.save();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll('[role="alert"]').length,
    ).toBe(1);
    expect(fixture.nativeElement.textContent).toContain(
      'Your changes are still here.',
    );
    expect(store.draft()?.definition.instructions).toBe('Keep this');
  });
  it('binds catalog readiness and passes target state to a closed removal dialog', async () => {
    const fixture = await setup();
    store.patchDraft({ name: 'Uncommitted rename' });
    fixture.componentRef.setInput('knownToolIds', ['Bash']);
    fixture.componentRef.setInput('catalogLoaded', true);
    fixture.componentRef.setInput('catalogLoading', true);
    fixture.detectChanges();
    const skills = fixture.debugElement.query(
      By.directive(BotSkillsToolsSectionComponent),
    ).componentInstance as BotSkillsToolsSectionComponent;
    expect(skills.knownToolIds()).toEqual(['Bash']);
    expect(skills.catalogLoaded()).toBe(false);
    const dialog = fixture.debugElement.query(
      By.directive(BotDeleteDialogComponent),
    ).componentInstance as BotDeleteDialogComponent;
    expect(dialog.isOpen()).toBe(false);
    expect(dialog.name()).toBe(record.name);
    expect(dialog.dirty()).toBe(true);
    expect(dialog.archived()).toBe(false);
    const trigger: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('[aria-label="More actions"]');
    trigger?.click();
    fixture.detectChanges();
    button(fixture.nativeElement, 'Archive').click();
    fixture.detectChanges();
    expect(dialog.isOpen()).toBe(true);
  });
  it('clears effort consistently with tier on null', async () => {
    const fixture = await setup();
    const identity = fixture.debugElement.query(
      By.directive(BotIdentityRuntimeSectionComponent),
    ).componentInstance as BotIdentityRuntimeSectionComponent;
    identity.setKind('lane');
    identity.setEffort('high');
    identity.setEffort(null);
    expect(store.draft()?.definition.runtime).not.toHaveProperty('effort');
  });
  it('invalid replacement cancels a valid avatar upload already in flight', async () => {
    const fixture = await setup();
    let finish:
      | ((value: Awaited<ReturnType<BotsClient['uploadAvatar']>>) => void)
      | undefined;
    uploadAvatar.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = store.uploadAvatar({
      mediaType: 'image/png',
      dataBase64: 'aGVsbG8=',
    });
    const identity = fixture.debugElement.query(
      By.directive(BotIdentityRuntimeSectionComponent),
    ).componentInstance as BotIdentityRuntimeSectionComponent;
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      value: [new File(['bad'], 'bad.txt', { type: 'text/plain' })],
    });
    const event = new Event('change');
    Object.defineProperty(event, 'target', { value: input });
    identity.upload(event);
    if (!finish) throw new Error('Upload was not started');
    finish(
      new RpcResult(true, { imageId: '00000000-0000-4000-8000-000000000002' }),
    );
    await pending;
    expect(store.draft()?.definition.avatar).toBeUndefined();
    expect(uploadAvatar).toHaveBeenCalledTimes(1);
  });
});

describe('Bot save bar', () => {
  it('does not emit ordinary discard during a conflict', () => {
    const fixture = TestBed.createComponent(BotSaveBarComponent);
    fixture.componentRef.setInput('state', 'conflict');
    const discard = jest.fn();
    fixture.componentInstance.discard.subscribe(discard);
    fixture.detectChanges();
    const button: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('button');
    expect(button?.disabled).toBe(true);
    button?.click();
    expect(discard).not.toHaveBeenCalled();
  });
  it.each<[BotSaveDisplayState, string, boolean]>([
    ['pristine', 'Revision 4 · saved', true],
    ['new', 'Not saved yet', false],
    ['dirty', 'Unsaved changes', false],
    ['invalid', 'Fix 2 fields before you save.', false],
    ['saving', 'Saving…', true],
    ['saved', 'Saved as revision 4.', true],
    ['conflict', 'Not saved: a newer revision exists.', true],
    ['error', 'Not saved.', false],
  ])('renders %s', (state, message, disabled) => {
    const fixture = TestBed.createComponent(BotSaveBarComponent);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('revision', 4);
    fixture.componentRef.setInput('invalidCount', 2);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(message);
    const buttons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('button');
    expect(buttons[1]?.disabled).toBe(disabled);
  });
});

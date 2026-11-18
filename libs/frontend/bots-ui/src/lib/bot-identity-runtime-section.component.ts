import {
  ChangeDetectionStrategy,
  DestroyRef,
  signal,
  ElementRef,
  viewChild,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import type { BotEditable, BotLaneTarget } from '@ptah-extension/shared';
import {
  PtahFieldComponent,
  PtahInputDirective,
  PtahTextareaDirective,
  PtahRichSelectComponent,
  ProviderModelPickerComponent,
  type ProviderModelSelection,
} from '@ptah-extension/ui';
import { BotsStore } from './bots.store';
import { avatarErrorMessage } from './bot-error-messages';

@Component({
  selector: 'ptah-bot-identity-runtime-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahFieldComponent,
    PtahInputDirective,
    PtahTextareaDirective,
    PtahRichSelectComponent,
    ProviderModelPickerComponent,
  ],
  styles: [
    `
      section {
        display: grid;
        grid-template-columns: minmax(130px, 1fr) minmax(0, 3fr);
        gap: 24px;
        padding: 24px 0;
        border-bottom: 1px solid var(--border);
      }
      .fields {
        display: grid;
        gap: 16px;
      }
      aside p {
        font-size: 12px;
        color: var(--bcm);
      }
      @media (max-width: 640px) {
        section {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  template: `
    @if (store.draft(); as draft) {
      <section aria-label="Identity">
        <aside>
          <h3>Identity</h3>
          <p>Name, purpose and where the bot is available.</p>
        </aside>
        <div class="fields">
          <ptah-field
            label="Name"
            [required]="true"
            [error]="fieldError('name')"
          >
            <input
              id="bot-name"
              ptahInput
              #name
              [value]="draft.definition.name"
              [disabled]="disabled()"
              (input)="patch({ name: name.value })"
            />
          </ptah-field>
          <ptah-field label="Description"
            ><input
              ptahInput
              #description
              [value]="draft.definition.description"
              [disabled]="disabled()"
              (input)="patch({ description: description.value })"
          /></ptah-field>
          <ptah-field label="Scope" hint="A saved bot keeps its scope.">
            <ptah-select
              [options]="scopeOptions"
              [value]="draft.definition.scope.kind"
              [disabled]="disabled() || !!store.selected()"
              (valueChange)="setScope($event)"
            />
          </ptah-field>
          @if (draft.definition.scope.kind === 'workspace') {
            <ptah-field label="Workspace" [error]="fieldError('scope')"
              ><ptah-select
                [options]="rootOptions()"
                [value]="workspaceRoot()"
                [disabled]="disabled() || !!store.selected()"
                (valueChange)="setRoot($event)"
            /></ptah-field>
          }
          <ptah-field
            label="Avatar"
            hint="Optional. Choose an icon or upload an image."
          >
            <ptah-select
              [options]="avatarOptions"
              [value]="avatarKind()"
              [disabled]="disabled()"
              (valueChange)="setAvatar($event)"
            />
          </ptah-field>
          @if (draft.definition.avatar?.kind === 'icon') {
            <ptah-field label="Icon"
              ><ptah-select
                [options]="iconOptions"
                [value]="iconName()"
                [disabled]="disabled()"
                (valueChange)="setIcon($event)"
            /></ptah-field>
          }
          @if (avatarState(); as state) {
            @if (state.status === 'ready') {
              <img
                [src]="state.dataUrl"
                alt="Bot avatar"
                width="48"
                height="48"
              />
            }
            @if (state.status === 'loading') {
              <p role="status">Loading avatar…</p>
            }
            @if (state.status === 'error') {
              <p role="alert">{{ avatarMessage(state.error.code, 'load') }}</p>
              <button
                type="button"
                [disabled]="disabled()"
                (click)="retryAvatar()"
              >
                Retry avatar
              </button>
            }
          }
          <ptah-field
            label="Upload image"
            hint="PNG, JPEG or WebP, up to 2 MB."
          >
            <input
              ptahInput
              type="file"
              #avatarFile
              accept="image/png,image/jpeg,image/webp"
              [disabled]="
                disabled() || store.avatarUpload()?.status === 'loading'
              "
              (change)="upload($event)"
            />
          </ptah-field>
          @if (avatarReadError()) {
            <p role="alert">{{ avatarReadError() }}</p>
          }
          @if (avatarReadStatus()) {
            <p role="status">{{ avatarReadStatus() }}</p>
          }
          @if (store.avatarUpload(); as upload) {
            @if (upload.status === 'loading') {
              <p role="status">Uploading avatar…</p>
            }
            @if (upload.status === 'error') {
              <p role="alert">
                {{ avatarMessage(upload.error.code, 'upload') }}
              </p>
            }
          }
          @if (draft.definition.avatar) {
            <button
              type="button"
              [disabled]="disabled()"
              (click)="patch({ avatar: undefined })"
            >
              Remove avatar
            </button>
          }
        </div>
      </section>
      <section aria-label="Instructions">
        <aside>
          <h3>Instructions</h3>
          <p>What the bot does and how. Sent at the start of each session.</p>
        </aside>
        <ptah-field
          label="Instructions"
          [required]="true"
          [error]="fieldError('instructions')"
        >
          <textarea
            id="bot-instructions"
            ptahTextarea
            #instructions
            rows="7"
            [value]="draft.definition.instructions"
            [disabled]="disabled()"
            (input)="patch({ instructions: instructions.value })"
          ></textarea>
        </ptah-field>
      </section>
      <section aria-label="Runtime">
        <aside>
          <h3>Runtime</h3>
          <p>The provider and model that run the bot.</p>
        </aside>
        <div class="fields">
          <ptah-field label="Runtime kind" [error]="fieldError('runtime')"
            ><ptah-select
              [options]="kindOptions"
              [value]="draft.definition.runtime.kind"
              [disabled]="disabled()"
              (valueChange)="setKind($event)"
          /></ptah-field>
          @switch (draft.definition.runtime.kind) {
            @case ('default') {
              <p>Uses the current default runtime when the bot starts.</p>
            }
            @case ('main') {
              <ptah-provider-model-picker
                label="Main provider and model"
                [provider]="mainProvider()"
                [model]="runtimeModel()"
                [extraProviders]="extraProviders()"
                [disabled]="disabled()"
                (selectionChange)="setMain($event)"
              />
              <p>
                Choose an explicit provider and model. Uses the account Ptah
                selects for this provider.
              </p>
            }
            @case ('lane') {
              <ptah-field label="CLI lane"
                ><ptah-select
                  [options]="laneOptions()"
                  [value]="laneKey()"
                  [disabled]="disabled()"
                  (valueChange)="setLane($event)"
              /></ptah-field>
              <ptah-field
                label="Lane model"
                hint="Leave empty for the lane default."
                ><input
                  ptahInput
                  #model
                  [value]="runtimeModel()"
                  [disabled]="disabled()"
                  (input)="setLaneModel(model.value)"
              /></ptah-field>
              <ptah-field label="Model tier"
                ><ptah-select
                  [options]="tierOptions"
                  [value]="modelTier()"
                  [disabled]="disabled()"
                  (valueChange)="setTier($event)"
              /></ptah-field>
            }
          }
          @if (draft.definition.runtime.kind !== 'default') {
            <ptah-field
              label="Effort"
              hint="Optional. Leave empty for the runtime default."
              ><ptah-select
                [options]="effortOptions()"
                [value]="runtimeEffort()"
                [disabled]="disabled()"
                (valueChange)="setEffort($event)"
            /></ptah-field>
          }
          @if (store.catalogLoading()) {
            <p role="status">Loading runtime choices…</p>
          }
          @if (store.catalogDiagnostics().length) {
            <p role="status">
              Some runtime choices are unavailable. Saved selections are kept.
            </p>
          }
        </div>
      </section>
    }
  `,
})
export class BotIdentityRuntimeSectionComponent {
  protected readonly store = inject(BotsStore);
  protected readonly avatarMessage = avatarErrorMessage;
  protected readonly disabled = computed(
    () =>
      this.store.readonly() ||
      (this.store.blockedReason() !== null &&
        this.store.blockedReason() !== 'conflict'),
  );
  private readonly definition = computed(() => this.store.draft()?.definition);
  protected readonly avatarKind = computed(
    () => this.definition()?.avatar?.kind ?? 'unset',
  );
  protected readonly iconName = computed(() => {
    const avatar = this.definition()?.avatar;
    return avatar?.kind === 'icon' ? avatar.name : 'bot';
  });
  protected readonly avatarState = computed(() => {
    const avatar = this.definition()?.avatar;
    return avatar?.kind === 'image'
      ? this.store.avatars().get(avatar.imageId)
      : undefined;
  });
  protected readonly workspaceRoot = computed(() => {
    const scope = this.definition()?.scope;
    return scope?.kind === 'workspace' ? scope.workspaceRoot : '';
  });
  protected readonly rootOptions = computed(() =>
    [
      ...new Set(
        [...this.store.workspaceRoots(), this.workspaceRoot()].filter(Boolean),
      ),
    ].map((value) => ({ value, label: value })),
  );
  protected readonly mainProvider = computed(() => {
    const runtime = this.definition()?.runtime;
    return runtime?.kind === 'main' ? runtime.providerId : '';
  });
  protected readonly extraProviders = computed(() =>
    this.mainProvider()
      ? [{ id: this.mainProvider(), name: this.mainProvider() }]
      : [],
  );
  protected readonly runtimeModel = computed(() => {
    const runtime = this.definition()?.runtime;
    return runtime && runtime.kind !== 'default' ? (runtime.model ?? '') : '';
  });
  protected readonly runtimeEffort = computed(() => {
    const runtime = this.definition()?.runtime;
    return runtime && runtime.kind !== 'default' ? (runtime.effort ?? '') : '';
  });
  protected readonly effortOptions = computed(() => {
    const choices = ['', 'low', 'medium', 'high'].map((value) => ({
      value,
      label: value || 'Default',
    }));
    const value = this.runtimeEffort();
    if (value && !choices.some((option) => option.value === value))
      choices.push({ value, label: value + ' (unresolved)' });
    return choices;
  });
  protected readonly avatarReadError = signal<string | null>(null);
  protected readonly avatarReadStatus = signal<string | null>(null);
  private pendingReader: FileReader | null = null;
  private readToken = 0;
  protected readonly modelTier = computed(() => {
    const runtime = this.definition()?.runtime;
    return runtime?.kind === 'lane' ? (runtime.modelTier ?? '') : '';
  });
  protected readonly laneKey = computed(() => {
    const runtime = this.definition()?.runtime;
    return runtime?.kind === 'lane' ? this.targetKey(runtime.target) : '';
  });
  protected readonly laneOptions = computed(() => {
    const choices = this.store.lanes().map((lane) => ({
      value: this.targetKey(lane.target),
      label: lane.label + (lane.available ? '' : ' (unavailable)'),
    }));
    const key = this.laneKey();
    if (key && !choices.some((choice) => choice.value === key))
      choices.push({ value: key, label: key + ' (unresolved)' });
    return choices;
  });
  protected readonly kindOptions = [
    { value: 'default', label: 'Default' },
    { value: 'main', label: 'Main provider' },
    { value: 'lane', label: 'CLI lane' },
  ];
  protected readonly scopeOptions = [
    { value: 'workspace', label: 'This workspace' },
    { value: 'user', label: 'All my workspaces' },
  ];
  protected readonly avatarOptions = [
    { value: 'unset', label: 'No avatar' },
    { value: 'icon', label: 'Icon' },
    { value: 'image', label: 'Image — upload below' },
  ];
  protected readonly iconOptions = [
    'bot',
    'sparkles',
    'wrench',
    'shield',
    'code',
  ].map((value) => ({ value, label: value }));
  protected readonly tierOptions = ['', 'opus', 'sonnet', 'haiku'].map(
    (value) => ({ value, label: value || 'Default' }),
  );

  public constructor() {
    inject(DestroyRef).onDestroy(() => {
      ++this.readToken;
      this.pendingReader?.abort();
    });
    effect(() => {
      const avatar = this.definition()?.avatar;
      const botId = this.store.selected()?.id;
      if (avatar?.kind === 'image' && botId)
        untracked(() => {
          void this.store.loadAvatar(botId, avatar.imageId);
        });
    });
  }
  public patch(patch: Partial<BotEditable>): void {
    if (!this.disabled()) this.store.patchDraft(patch);
  }
  public fieldError(field: string): string | null {
    if (!this.store.validation().some((issue) => issue.path[0] === field))
      return null;
    return field === 'name'
      ? 'Enter a name.'
      : field === 'instructions'
        ? 'Enter instructions.'
        : field === 'scope'
          ? 'Pick a workspace.'
          : 'Choose a provider, model or CLI lane.';
  }
  public setKind(kind: string | null): void {
    if (kind === 'default') this.patch({ runtime: { kind: 'default' } });
    if (kind === 'main')
      this.patch({ runtime: { kind: 'main', providerId: '', model: '' } });
    if (kind === 'lane')
      this.patch({
        runtime: {
          kind: 'lane',
          target: (
            this.store.lanes().find((lane) => lane.available) ??
            this.store.lanes()[0]
          )?.target ?? { kind: 'system', cli: '' },
        },
      });
  }
  public setMain(selection: ProviderModelSelection): void {
    if (this.definition()?.runtime.kind === 'main')
      this.patch({
        runtime: {
          kind: 'main',
          providerId: selection.provider,
          model: selection.model,
          ...(this.runtimeEffort() ? { effort: this.runtimeEffort() } : {}),
        },
      });
  }
  private targetKey(target: BotLaneTarget): string {
    return target.kind === 'system'
      ? `system:${target.cli}`
      : `ptah-cli:${target.ptahCliId}`;
  }
  public setLane(key: string | null): void {
    const runtime = this.definition()?.runtime;
    const target = this.store
      .lanes()
      .find((lane) => this.targetKey(lane.target) === key)?.target;
    if (runtime?.kind === 'lane' && target)
      this.patch({ runtime: { kind: 'lane', target } });
  }
  public setLaneModel(model: string): void {
    const runtime = this.definition()?.runtime;
    if (runtime?.kind === 'lane') {
      const rest = { ...runtime };
      delete rest.model;
      this.patch({
        runtime: { ...rest, ...(model.trim() ? { model: model.trim() } : {}) },
      });
    }
  }
  public setTier(value: string | null): void {
    const runtime = this.definition()?.runtime;
    if (runtime?.kind === 'lane') {
      const rest = { ...runtime };
      delete rest.modelTier;
      this.patch({
        runtime: {
          ...rest,
          ...(value === 'opus' || value === 'sonnet' || value === 'haiku'
            ? { modelTier: value }
            : {}),
        },
      });
    }
  }
  public setEffort(value: string | null): void {
    const effort = value?.trim();
    const runtime = this.definition()?.runtime;
    if (runtime && runtime.kind !== 'default') {
      const rest = { ...runtime };
      delete rest.effort;
      this.patch({
        runtime: { ...rest, ...(effort ? { effort } : {}) },
      });
    }
  }
  public setScope(kind: string | null): void {
    if (this.store.selected()) return;
    if (kind === 'user') this.patch({ scope: { kind: 'user' } });
    if (kind === 'workspace')
      this.patch({
        scope: {
          kind: 'workspace',
          workspaceRoot: this.store.workspaceRoots()[0] ?? '',
        },
      });
  }
  public setRoot(root: string | null): void {
    if (!this.store.selected() && root !== null)
      this.patch({ scope: { kind: 'workspace', workspaceRoot: root } });
  }
  private readonly avatarFile =
    viewChild<ElementRef<HTMLInputElement>>('avatarFile');
  public setAvatar(kind: string | null): void {
    if (this.disabled()) return;
    if (kind !== 'image') this.avatarReadError.set(null);
    if (kind === 'image') this.avatarFile()?.nativeElement.click();
    if (kind === 'unset') this.patch({ avatar: undefined });
    if (kind === 'icon') this.patch({ avatar: { kind: 'icon', name: 'bot' } });
  }
  public setIcon(name: string | null): void {
    if (
      name === 'bot' ||
      name === 'sparkles' ||
      name === 'wrench' ||
      name === 'shield' ||
      name === 'code'
    ) {
      this.avatarReadError.set(null);
      this.patch({ avatar: { kind: 'icon', name } });
    }
  }
  public retryAvatar(): void {
    const avatar = this.definition()?.avatar;
    const botId = this.store.selected()?.id;
    if (!this.disabled() && botId && avatar?.kind === 'image')
      void this.store.loadAvatar(botId, avatar.imageId, true);
  }
  private avatarContext(): string {
    const definition = this.definition();
    return JSON.stringify([
      this.store.selected()?.id,
      definition?.scope,
      definition?.avatar,
    ]);
  }
  public upload(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || this.disabled()) return;
    const token = ++this.readToken;
    const replaced = this.pendingReader !== null;
    this.pendingReader?.abort();
    this.pendingReader = null;
    this.avatarReadError.set(null);
    this.avatarReadStatus.set(
      replaced ? 'Previous image read was replaced.' : null,
    );
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const mediaType = file.type;
    if (
      (mediaType !== 'image/png' &&
        mediaType !== 'image/jpeg' &&
        mediaType !== 'image/webp') ||
      file.size > 2 * 1024 * 1024
    ) {
      // Re-patching the current avatar invalidates an older pending upload.
      this.store.patchDraft({ avatar: this.definition()?.avatar });
      this.avatarReadError.set(avatarErrorMessage('INVALID_PARAMS', 'upload'));
      return;
    }
    const context = this.avatarContext();
    const reader = new FileReader();
    this.pendingReader = reader;
    this.avatarReadStatus.set(
      replaced
        ? 'Previous image read was replaced. Reading the new image…'
        : 'Reading image…',
    );
    const accept = (): boolean => {
      if (token !== this.readToken) return false;
      this.pendingReader = null;
      if (this.disabled() || context !== this.avatarContext()) {
        this.avatarReadStatus.set(
          'Image read was dropped because the bot, scope or avatar changed. Choose the image again.',
        );
        return false;
      }
      this.avatarReadStatus.set(null);
      return true;
    };
    reader.onload = () => {
      if (!accept()) return;
      if (typeof reader.result !== 'string') {
        this.avatarReadError.set(avatarErrorMessage(undefined, 'upload'));
        return;
      }
      void this.store.uploadAvatar({
        mediaType,
        dataBase64: reader.result.split(',')[1] ?? '',
      });
    };
    reader.onerror = () => {
      if (accept())
        this.avatarReadError.set(avatarErrorMessage(undefined, 'upload'));
    };
    reader.readAsDataURL(file);
  }
}

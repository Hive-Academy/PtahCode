import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Boxes, Eye, EyeOff, LucideAngularModule, X } from 'lucide-angular';
import {
  ProvidersSettingsStateService,
  type ProvidersConnection,
  type ProvidersEditContext,
  type ProvidersSettingsCommit,
} from '@ptah-extension/core';
import {
  NativeModalComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahFieldComponent,
  PtahInputDirective,
  PtahRichSelectComponent,
  PtahIconButtonDirective,
  ProviderMarkComponent,
} from '@ptah-extension/ui';
import {
  ANTHROPIC_API_LANE_ENTRY,
  PROVIDER_SESSION_PROVIDER_IDS,
  getAnthropicProvider,
} from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { SettingsToastComponent } from '../feedback/settings-toast.component';

/** The instance an Edit opens with (from `cliAgents()`); `null` opens the create form. */
export interface CliInstanceEditTarget {
  readonly id: string;
  readonly name: string;
  readonly providerId: string;
  readonly providerName: string;
}

/**
 * Connections a Ptah CLI instance cannot use (the rule of the instance manager retired in Batch 34). A provider
 * session runs only as a native chat runtime and never serves a Ptah CLI lane.
 */
const EXCLUDED_PROVIDERS: ReadonlySet<string> = new Set([
  'openai-codex',
  ...PROVIDER_SESSION_PROVIDER_IDS,
]);
const COPILOT = 'github-copilot';
const MODALITY: Readonly<Record<string, string>> = {
  apiKey: 'API key',
  cli: 'CLI login',
  oauth: 'OAuth',
  'local-native': 'Local server',
  'local-proxy': 'Local server',
  custom: 'Custom endpoint',
};
const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';
const SAVE_SCOPE = 'global';
/** Gate V 36 M4: a stored key is not a checked key (the matrix then runs the new instance's Test). */
const KEY_NOT_VERIFIED = 'Key stored, not verified.';
/** M7: the rename and the key are separate host writes; a partial result says which one landed. */
const NAME_SAVED_KEY_NOT = 'Name saved. The key was not saved.';
const NAME_SAVED_KEY_UNKNOWN =
  'Name saved. Could not confirm whether the key was saved; check it before retrying.';
const KEY_SAVED_NAME_NOT = `${KEY_NOT_VERIFIED} The name was not saved.`;
const KEY_SAVED_NAME_UNKNOWN = `${KEY_NOT_VERIFIED} Could not confirm whether the name was saved; check it before retrying.`;
const DUPLICATE_NAME = 'Another Ptah CLI instance already uses this name.';

/** How a provider takes credentials in this form (#48). */
type KeyMode = 'required' | 'optional' | 'none' | 'sign-in';

/**
 * Add / Edit Ptah CLI instance (plan :750-758, prototype `#modalAddPtahCli`, interactions/orchestration-1), on the
 * shared `NativeModalComponent` (centered `<dialog>`, design-spec §6 decision).
 * - **Create:** name (unique, case-insensitive), provider connection (every connection except Claude API and OpenAI
 *   Codex), and the key the provider needs, masked with show/hide (#49). Switching provider drops the typed key, and a
 *   hidden key field is never sent (S2). GitHub Copilot re-reads its sign-in when chosen and signs in inline (#47, M6);
 *   Create stays disabled until this open's check or login reports `signed-in`. A created instance is reported through
 *   `created` so the matrix runs its Test (M4).
 * - **Edit (#50):** name and a replacement key, as two `ptahCli:update` writes so a partial result names what saved
 *   (M7). The provider is shown, not editable. A Copilot instance shows its sign-in only while Copilot is signed out.
 * Saves go through `SettingsSaveFeedbackService` and close on that save's own result (M2); a second
 * `<ptah-settings-toast>` in the footer is the one assistive tech hears while `showModal()` makes the page inert
 * (plan :542-544). Closing mid-save is allowed: the write continues and the page toast reports it. The typed key lives
 * only here and is cleared on every open, close and provider change.
 */
@Component({
  selector: 'ptah-add-cli-instance-modal',
  standalone: true,
  imports: [
    LucideAngularModule,
    NativeModalComponent,
    PtahButtonDirective,
    PtahBadgeDirective,
    PtahIconButtonDirective,
    ProviderMarkComponent,
    PtahFieldComponent,
    PtahInputDirective,
    PtahRichSelectComponent,
    SettingsToastComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './add-cli-instance-modal.component.html',
})
export class AddCliInstanceModalComponent {
  protected readonly TitleIcon = Boxes;
  protected readonly CloseIcon = X;
  protected readonly EyeIcon = Eye;
  protected readonly EyeOffIcon = EyeOff;
  protected readonly focusRing = FOCUS;
  protected readonly duplicateMessage = DUPLICATE_NAME;
  protected readonly state = inject(ProvidersSettingsStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService);

  readonly open = input(false);
  /** The instance to edit; `null` creates a new one. */
  readonly editing = input<CliInstanceEditTarget | null>(null);
  readonly closed = output<void>();
  /** A create saved (emitted before `closed`), with the trimmed name it was created under (unique). */
  readonly created = output<string>();

  protected readonly name = signal('');
  protected readonly providerId = signal('');
  /** The typed key: held only here, never in service state. */
  protected readonly key = signal('');
  protected readonly keyVisible = signal(false);
  protected readonly claudeSource = signal<'shared-connection' | 'instance'>(
    'shared-connection',
  );
  private context: ProvidersEditContext | null = null;
  private session = 0;

  protected readonly busy = this.feedback.saving;
  protected readonly providerSelectOptions = computed(() => [
    { value: '', label: 'Choose a provider connection…' },
    ...this.providerOptions().map((option) => ({
      value: option.id,
      label: option.label,
    })),
  ]);
  protected readonly providerOptions = computed(() =>
    (this.state.connections().data ?? [])
      .filter((connection) => !EXCLUDED_PROVIDERS.has(connection.id))
      .map((connection) => ({
        id: connection.id,
        label:
          connection.id === 'anthropic'
            ? 'Claude API · API key'
            : `${connection.name} · ${MODALITY[connection.authMode] ?? connection.authMode}`,
      })),
  );
  protected readonly provider = computed<ProvidersConnection | null>(() => {
    const id = this.editing()?.providerId ?? this.providerId();
    return (
      (this.state.connections().data ?? []).find(
        (connection) => connection.id === id,
      ) ?? null
    );
  });
  protected readonly keyMode = computed<KeyMode | null>(() => {
    const provider = this.provider();
    if (!provider) return this.editing() ? 'optional' : null;
    if (
      provider.id === 'anthropic' &&
      !this.editing() &&
      this.claudeSource() === 'shared-connection'
    )
      return 'none';
    if (provider.id === COPILOT) return 'sign-in';
    if (provider.authMode === 'cli') return 'none';
    if (
      provider.authMode === 'local-native' ||
      provider.authMode === 'local-proxy'
    ) {
      return getAnthropicProvider(provider.id)?.supportsOptionalApiKey
        ? 'optional'
        : 'none';
    }
    // An OAuth provider whose key is only a fallback (`apiKeyFallback`, Kimi Code) runs on the host's sign-in when empty.
    const entry = getAnthropicProvider(provider.id);
    return entry?.supportsOptionalApiKey || entry?.apiKeyFallback
      ? 'optional'
      : 'required';
  });
  protected readonly showKey = computed(
    () => this.keyMode() === 'required' || this.keyMode() === 'optional',
  );
  protected readonly keyLabel = computed(() =>
    this.editing()
      ? 'Replacement API key (leave empty to keep the stored one)'
      : this.keyMode() === 'optional'
        ? 'API key (optional)'
        : 'API key for this instance',
  );
  /** #48 hints (the old wording of the pre-#581 instance manager at `7ecdefa45^1`, where it existed). */
  protected readonly keyHint = computed(() => {
    const provider = this.provider();
    if (provider?.id === 'anthropic' && !this.editing())
      return this.claudeSource() === 'shared-connection'
        ? null
        : 'Enter a separate Claude API key for this instance.';
    if (this.editing()?.providerId === ANTHROPIC_API_LANE_ENTRY.id)
      return 'A key entered here becomes a separate key for this instance. Leave empty to keep the current credential source.';
    switch (this.keyMode()) {
      case 'none':
        return provider?.authMode === 'cli'
          ? 'No API key needed — uses your local Claude login / subscription.'
          : `No API key needed — make sure ${provider?.name ?? 'the local server'} is running locally.`;
      case 'optional':
        if (provider?.id === 'ollama-cloud')
          return (
            'Optional \u2014 run ollama signin to use Ollama Cloud, or paste an ollama.com API key above ' +
            'to enable live model discovery and pricing.'
          );
        // Edit: an empty field keeps the stored key (the label says so), so the connection hint is for creation only.
        if (provider && getAnthropicProvider(provider.id)?.apiKeyFallback)
          return this.editing()
            ? null
            : `Optional. Leave empty to use your ${provider.name} connection (CLI sign-in, or the provider's stored key as fallback). A key entered here is used instead.`;
        return 'Optional. Leave empty for keyless use or subscription sign-in.';
      case 'required':
        return this.editing()
          ? null
          : "Enter this instance's own key. Keys stored for the provider connection are not copied.";
      default:
        return null;
    }
  });

  /** M9: case-insensitive, against every other instance (an edit may keep its own name). */
  protected readonly duplicateName = computed(() => {
    const name = this.name().trim().toLowerCase(),
      self = this.editing()?.id;
    return (
      !!name &&
      (this.state.cliAgents().data ?? []).some(
        (agent) =>
          agent.id !== self && agent.name.trim().toLowerCase() === name,
      )
    );
  });

  /**
   * M6: only this open's own sign-in check or login counts: an earlier sign-in in the shared store (Providers tab, an
   * earlier open, then a sign-out) never reads as signed in.
   */
  private readonly signInAction = signal<'check' | 'login' | null>(null);
  protected readonly signInSection = computed(() => {
    const section = this.state.externalAuth();
    const ours =
      this.signInAction() !== null &&
      (section.data?.providerId === COPILOT ||
        section.status === 'loading' ||
        section.status === 'error');
    return ours ? section : null;
  });
  protected readonly signingIn = computed(
    () => this.signInSection()?.status === 'loading',
  );
  protected readonly signedIn = computed(
    () => this.signInSection()?.data?.signInState === 'signed-in',
  );
  protected readonly signInFailed = computed(
    () => this.signInSection()?.status === 'error',
  );
  protected readonly signInBusyLabel = computed(() =>
    this.signInAction() === 'check' ? 'Checking sign-in…' : 'Signing in…',
  );
  protected readonly signInLabel = computed(() =>
    this.signedIn()
      ? 'Signed in'
      : this.signingIn()
        ? this.signInBusyLabel()
        : 'Awaiting sign-in',
  );
  protected readonly signInMessage = computed(() =>
    this.signInFailed()
      ? this.signInAction() === 'check'
        ? 'Could not check the GitHub sign-in. Retry login with GitHub.'
        : 'Sign-in did not complete. Complete the GitHub login, then retry.'
      : (this.signInSection()?.data?.message ?? null),
  );
  /** Edit shows the sign-in only while Copilot reads as signed out (the connection row, M6); create always does. */
  protected readonly showSignIn = computed(() => {
    if (this.keyMode() !== 'sign-in') return false;
    return !this.editing() || this.provider()?.configured === false;
  });

  protected readonly canSubmit = computed(() => {
    if (
      this.busy() ||
      !this.name().trim() ||
      this.duplicateName() ||
      !this.state.reviewContext()
    )
      return false;
    const target = this.editing();
    if (target)
      return this.name().trim() !== target.name || !!this.key().trim();
    const provider = this.provider();
    if (!provider || EXCLUDED_PROVIDERS.has(provider.id)) return false;
    if (
      provider.id === 'anthropic' &&
      this.claudeSource() === 'shared-connection'
    )
      return provider.hasKey;
    if (this.keyMode() === 'sign-in') return this.signedIn();
    return this.keyMode() !== 'required' || !!this.key().trim();
  });

  constructor() {
    // Every open starts from the target's values and a fresh edit context; the key is never carried over.
    effect(() => {
      if (!this.open()) return;
      const target = this.editing();
      untracked(() => {
        this.session += 1;
        this.context = this.state.reviewContext();
        this.name.set(target?.name ?? '');
        this.providerId.set('');
        this.claudeSource.set('shared-connection');
        this.signInAction.set(null);
        this.clearKey();
      });
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  /** S2: a provider change drops the typed key (it was for the other vendor); Copilot re-reads its sign-in (M6). */
  protected selectClaudeSource(source: 'shared-connection' | 'instance'): void {
    this.clearKey();
    this.claudeSource.set(source);
  }

  protected selectProvider(id: string): void {
    this.providerId.set(id);
    this.claudeSource.set('shared-connection');
    this.clearKey();
    this.signInAction.set(null);
    if (id === COPILOT) {
      this.signInAction.set('check');
      void this.state.performExternalAuth(COPILOT, 'cli-check');
    }
  }

  protected signIn(): Promise<void> {
    this.signInAction.set('login');
    return this.state.performExternalAuth(COPILOT, 'sign-in');
  }

  /** Esc, the backdrop, Cancel and ✕: closes even mid-save (the write continues and the page toast reports it). */
  protected requestClose(): void {
    this.clearKey();
    this.closed.emit();
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    // The context taken on open; if the scopes were still loading then, the current one.
    const context = this.context ?? this.state.reviewContext();
    if (!context) return;
    const session = this.session,
      target = this.editing(),
      name = this.name().trim();
    // S2: a key field that is not shown is never sent.
    const key = this.showKey() ? this.key() : '';
    const result = target
      ? await this.saveEdit(target, name, key, context)
      : await this.saveCreate(name, key, context);
    if (result === 'failed' && this.state.commit().status === 'blocked')
      this.context = this.state.reviewContext();
    // M2: closes only on this save's own result, and only for the open it started in (D15).
    if (result !== 'saved' || session !== this.session || !this.open()) return;
    if (!target) this.created.emit(name);
    this.requestClose();
  }

  private saveCreate(name: string, key: string, context: ProvidersEditContext) {
    const providerId = this.providerId();
    return this.feedback.save({
      label: `Ptah CLI instance ${name}`,
      scope: SAVE_SCOPE,
      write: () =>
        this.state.saveSettings(
          {
            cli: [
              {
                action: 'create',
                params:
                  providerId === 'anthropic'
                    ? {
                        name,
                        providerId: ANTHROPIC_API_LANE_ENTRY.id,
                        credentialSource: this.claudeSource(),
                        ...(this.claudeSource() === 'instance'
                          ? { apiKey: key }
                          : {}),
                      }
                    : { name, providerId, apiKey: key },
              },
            ],
          },
          context,
        ),
      undo: null,
      // No promise of a Test here: the matrix runs it only once it finds the new instance (re-check N-1).
      ...(key.trim()
        ? { successMessage: `Created ${name}. ${KEY_NOT_VERIFIED}` }
        : {}),
    });
  }

  /** Name and key are two writes (M7); either one drops the instance's last Test (M8). */
  private saveEdit(
    target: CliInstanceEditTarget,
    name: string,
    key: string,
    context: ProvidersEditContext,
  ) {
    const nameChanged = name !== target.name,
      keyChanged = !!key.trim();
    const write =
      (params: { readonly name?: string; readonly apiKey?: string }) => () => {
        this.state.clearCliTest(target.id);
        return this.state.saveSettings(
          {
            cli: [
              ...(params.name !== undefined
                ? [
                    {
                      action: 'update' as const,
                      params: { id: target.id, name: params.name },
                    },
                  ]
                : []),
              ...(params.apiKey !== undefined
                ? [
                    {
                      action: 'update' as const,
                      // A key entered for a Claude API instance is a per-instance key: the source moves to
                      // 'instance' in the same write (the registry rejects a key for the shared source).
                      params:
                        target.providerId === ANTHROPIC_API_LANE_ENTRY.id
                          ? {
                              id: target.id,
                              apiKey: params.apiKey,
                              credentialSource: 'instance' as const,
                            }
                          : { id: target.id, apiKey: params.apiKey },
                    },
                  ]
                : []),
            ],
          },
          context,
        );
      };
    return this.feedback.save({
      label: `${target.name} instance`,
      scope: SAVE_SCOPE,
      write: write({
        ...(nameChanged ? { name } : {}),
        ...(keyChanged ? { apiKey: key } : {}),
      }),
      // A replaced key cannot be written back; a rename alone can.
      undo: nameChanged && !keyChanged ? write({ name: target.name }) : null,
      ...(keyChanged
        ? {
            successMessage: `Saved ${target.name} instance. ${KEY_NOT_VERIFIED}`,
          }
        : {}),
      failureMessage: (commit) => partialEditMessage(commit, target.id),
    });
  }

  private clearKey(): void {
    this.key.set('');
    this.keyVisible.set(false);
  }
}

/**
 * M7: one of the two writes landed and the other did not, in either direction: "Name saved. The key was not saved."
 * or, when the rename was rejected and the key stored (re-check N-3), "Key stored, not verified. The name was not saved."
 */
function partialEditMessage(
  commit: ProvidersSettingsCommit,
  id: string,
): string | null {
  const nameField = `ptahCliAgents.${id}.name`,
    keyField = `ptahCliAgents.${id}.apiKey`;
  if (commit.saved.includes(nameField)) {
    if (commit.unsaved.includes(keyField)) return NAME_SAVED_KEY_NOT;
    return commit.unconfirmed.includes(keyField)
      ? NAME_SAVED_KEY_UNKNOWN
      : null;
  }
  if (!commit.saved.includes(keyField)) return null;
  if (commit.unsaved.includes(nameField)) return KEY_SAVED_NAME_NOT;
  return commit.unconfirmed.includes(nameField) ? KEY_SAVED_NAME_UNKNOWN : null;
}

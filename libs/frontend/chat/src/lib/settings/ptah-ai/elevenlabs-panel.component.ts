import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
  type WritableSignal,
} from '@angular/core';
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  LucideAngularModule,
  XCircle,
} from 'lucide-angular';
import { ClaudeRpcService } from '@ptah-extension/core';
import type {
  VoiceInfoDto,
  VoiceProviderConfigElevenLabsDto,
} from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import {
  ELEVENLABS_STT_ROWS,
  ELEVENLABS_TTS_ROWS,
  type ElevenLabsSelectKey,
  type ElevenLabsSelectRow,
} from './elevenlabs-select-rows';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { SettingsConnectionTestComponent } from '../shared/settings-connection-test.component';
import {
  SAVE_KEY_FAILED_MESSAGE,
  CLEAR_KEY_FAILED_MESSAGE,
  SAVE_SETTINGS_FAILED_MESSAGE,
  LOAD_VOICES_FAILED_MESSAGE,
  VOICES_PERMISSION_HINT,
  VOICES_FALLBACK_HINT,
  TEST_OK_MESSAGE,
  TEST_FAILED_MESSAGE,
  testFailureMessage,
} from './elevenlabs-panel-messages';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahInputDirective,
  PtahSelectDirective,
  PtahFormSectionComponent,
  PtahFieldComponent,
  PtahInlineConfirmComponent,
} from '@ptah-extension/ui';

type WriteResult = { ok: true } | { ok: false; message: string };
type SelectionKey = 'voiceId' | ElevenLabsSelectKey;

interface TestResult {
  readonly ok: boolean;
  readonly message: string;
}

/** The host speaks with this voice while none is saved (`elevenlabs-tts-provider.ts` DEFAULT_VOICE_ID). */
const DEFAULT_VOICE_LABEL = 'Rachel (21m00Tcm4TlvDq8ikWAM)';
/** Mirrors the host's voice-id rule (`voice-rpc.schema.ts` CONFIG_ID). */
const VOICE_ID_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

/**
 * ElevenLabs cloud provider panel, drawer D-VOICE (pattern map V21-V25), rendered once per
 * direction. Shared: the API key block. Direction-specific: TTS shows voice, model and output
 * format; STT shows the transcription model. All controls are `table-sm` rows.
 *
 * Key (V21, G13 verify-then-save): a typed key must pass `voice:testConnection` with that exact
 * draft before Save turns on, so a key is never saved on a failed probe. Clear asks for an inline
 * confirm (P8) and has no Undo. With no draft, Test connection probes the stored key (V22).
 * Selections (V23-V25) save through {@link SettingsSaveFeedbackService.saveGeneric} with Undo; a
 * failed write reverts the select and raises an alert toast (D15).
 *
 * SECURITY: the key input is a password field, the stored key is never rendered (the panel only
 * knows `apiKeyConfigured`), and a saved or abandoned draft is dropped from the signal.
 */
@Component({
  selector: 'ptah-elevenlabs-panel',
  standalone: true,
  imports: [SettingsBusyDisabledDirective, SettingsConnectionTestComponent, LucideAngularModule, PtahBadgeDirective, PtahButtonDirective, PtahIconButtonDirective, PtahInputDirective, PtahSelectDirective, PtahFormSectionComponent, PtahFieldComponent, PtahInlineConfirmComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ptah-form-section heading="ElevenLabs" level="3" data-testid="elevenlabs-panel-table">

        <!-- V21: stored key status + Clear (S-confirm, no Undo) -->
        <div class="flex flex-col gap-[var(--ptah-gap-field)]">
          <div class="text-sm font-medium text-base-content">
            API key
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span
                class="flex items-center gap-1.5 text-xs font-semibold text-base-content"
                [attr.data-testid]="
                  config().apiKeyConfigured
                    ? 'elevenlabs-key-configured'
                    : 'elevenlabs-key-missing'
                "
              >
                <lucide-angular
                  [img]="config().apiKeyConfigured ? CheckCircleIcon : AlertCircleIcon"
                  class="w-3.5 h-3.5 shrink-0"
                  [class.text-success]="config().apiKeyConfigured"
                  [class.text-warning]="!config().apiKeyConfigured"
                  aria-hidden="true"
                />
                {{ config().apiKeyConfigured ? 'Key saved' : 'No key saved' }}
              </span>
              @if (config().apiKeyConfigured) {
                <div class="flex items-center gap-1">
                  @if (!showKeyForm()) {
                    <ptah-settings-connection-test label="Test" testId="elevenlabs-test-btn" [disabled]="!canTest()" [state]="isTesting() ? 'running' : 'idle'" (test)="testConnection()" />
                  }
                  <button
                    type="button"
                    ptahButton
                    variant="ghost"
                    size="xs"
                    [disabled]="saving()"
                    [attr.aria-expanded]="replacingKey()"
                    aria-controls="elevenlabs-key"
                    (click)="toggleReplaceKey()"
                    data-testid="elevenlabs-key-replace"
                  >
                    {{ replacingKey() ? 'Cancel' : 'Replace' }}
                  </button>
                  <button
                    #clearBtn
                    type="button"
                    ptahButton
                    size="xs"
                    [disabled]="saving()"
                    [attr.aria-expanded]="confirmingClear()"
                    (click)="openClearConfirm()"
                    data-testid="elevenlabs-key-clear"
                  >
                    Clear
                  </button>
                </div>
              }
            </div>
            @if (config().apiKeyConfigured && !showKeyForm()) {
              <p class="mt-1 text-xs text-base-content-muted" data-testid="elevenlabs-key-stored-note">
                Stored encrypted on this machine. The key itself is never shown.
              </p>
              <div aria-live="polite" class="mt-1">
                @if (testResult(); as result) {
                  <span ptahBadge appearance="outline" [tone]="result.ok ? 'ok' : 'err'"
                    class="h-auto gap-1"
                    data-testid="elevenlabs-test-result"
                  >
                    <lucide-angular
                      [img]="result.ok ? CheckCircleIcon : XCircleIcon"
                      class="w-3 h-3 shrink-0"
                      [class.text-success]="result.ok"
                      [class.text-error]="!result.ok"
                      aria-hidden="true"
                    />
                    {{ result.message }}
                  </span>
                }
              </div>
            }
            @if (config().apiKeyConfigured && confirmingClear()) {
              <ptah-inline-confirm
                message="Clear the stored ElevenLabs key from this machine?"
                detail="ElevenLabs voice stops working until a key is added."
                ariaLabel="Confirm clear ElevenLabs API key"
                confirmLabel="Clear key" tone="danger" [busy]="saving()"
                confirmTestId="elevenlabs-clear-confirm"
                cancelTestId="elevenlabs-clear-cancel"
                data-testid="elevenlabs-clear-group"
                (confirm)="clearKey()" (cancelled)="cancelClear()" />
            }
          </div>
        </div>

        <!-- V21/V22: new key, verify-then-save (G13); behind Replace once a key is saved. -->
        @if (showKeyForm()) {
        <div class="flex flex-col gap-[var(--ptah-gap-field)]">
          <div class="text-sm font-medium text-base-content">
            {{ config().apiKeyConfigured ? 'New key' : 'Add key' }}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1">
              <ptah-field label="ElevenLabs API key" appearance="floating" class="flex-1">
                <input
                  ptahInput
                  size="sm"
                  tone="mono"
                  id="elevenlabs-key"
                  [type]="keyVisible() ? 'text' : 'password'"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="ElevenLabs API key"
                  aria-describedby="elevenlabs-key-help"
                  class="w-full font-mono"
                  [value]="keyDraft()"
                  [disabled]="saving()"
                  [placeholder]="
                    config().apiKeyConfigured
                      ? 'New API key'
                      : 'Paste API key'
                  "
                  (input)="onKeyInput($event)"
                  data-testid="elevenlabs-key-input"
                />
                <span ptahFieldTrailing>
                  <button
                    type="button"
                    ptahIconButton
                    size="xs"
                    [label]="keyVisible() ? 'Hide API key' : 'Show API key'"
                    [attr.aria-pressed]="keyVisible()"
                    (click)="keyVisible.set(!keyVisible())"
                    data-testid="elevenlabs-key-visibility"
                  >
                    <lucide-angular
                      [img]="keyVisible() ? EyeOffIcon : EyeIcon"
                      class="w-3 h-3"
                      aria-hidden="true"
                    />
                  </button>
                </span>
              </ptah-field>
              <ptah-settings-connection-test label="Test connection" testId="elevenlabs-test-btn" [disabled]="!canTest()" [state]="isTesting() ? 'running' : 'idle'" (test)="testConnection()" />
              <button
                type="button"
                ptahButton
                variant="primary"
                size="xs"
                [disabled]="!canSaveKey()"
                (click)="saveKey()"
                data-testid="elevenlabs-key-save"
              >
                Save
              </button>
            </div>
            <p
              id="elevenlabs-key-help"
              class="mt-1 text-xs text-base-content-muted"
              data-testid="elevenlabs-key-hint"
            >
              @if (keyDraft().trim().length > 0 && !draftVerified()) {
                Test the key first; Save turns on once the test passes.
              } @else {
                Stored encrypted on this machine.
              }
            </p>
            <div aria-live="polite" class="mt-1">
              @if (testResult(); as result) {
                <span ptahBadge appearance="outline" [tone]="result.ok ? 'ok' : 'err'"
                  class="h-auto gap-1"
                  data-testid="elevenlabs-test-result"
                >
                  <lucide-angular
                    [img]="result.ok ? CheckCircleIcon : XCircleIcon"
                    class="w-3 h-3 shrink-0"
                    [class.text-success]="result.ok"
                    [class.text-error]="!result.ok"
                    aria-hidden="true"
                  />
                  {{ result.message }}
                </span>
              }
            </div>
          </div>
        </div>
        }

        @if (direction() === 'tts' && !keyOnly()) {
          <!-- V23: voice (S-sel + Undo) -->
          <div class="flex flex-col gap-[var(--ptah-gap-field)]">
            <div class="text-sm font-medium text-base-content">
              Voice
            </div>
            <div class="min-w-0">
              @if (!config().apiKeyConfigured) {
                <p
                  class="text-xs text-base-content-muted"
                  data-testid="elevenlabs-voices-locked"
                >
                  Save an API key to load your voices.
                </p>
              } @else if (isLoadingVoices()) {
                <div
                  class="text-xs text-base-content-muted"
                  data-testid="elevenlabs-voices-loading"
                >
                  Loading voices…
                </div>
              } @else if (voicesError(); as vErr) {
                <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <span
                    class="flex items-center gap-1 text-xs text-base-content"
                    data-testid="elevenlabs-voices-error"
                  >
                    <lucide-angular
                      [img]="AlertCircleIcon"
                      class="w-3 h-3 text-error shrink-0"
                      aria-hidden="true"
                    />
                    {{ vErr }}
                  </span>
                  <button
                    type="button"
                    ptahButton
                    variant="ghost"
                    size="xs"
                    (click)="loadVoices()"
                    data-testid="elevenlabs-voices-retry"
                  >
                    Retry
                  </button>
                </div>
                @if (voicesHint(); as hint) {
                  <p
                    class="text-xs text-base-content-muted"
                    data-testid="elevenlabs-voices-hint"
                  >
                    {{ hint }}
                  </p>
                }
                <!-- Without a voice list, a voice is still chosen by its ElevenLabs voice ID. -->
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    ptahInput
                    size="sm"
                    tone="mono"
                    class="w-full font-mono"
                    aria-label="ElevenLabs voice ID"
                    [placeholder]="'Default: ' + defaultVoiceLabel"
                    autocomplete="off"
                    spellcheck="false"
                    [value]="voiceIdDraft()"
                    (input)="onVoiceIdInput($event)"
                    (keydown.enter)="saveVoiceId()"
                    data-testid="elevenlabs-voice-id-input"
                  />
                  <button
                    type="button"
                    ptahButton
                    variant="ghost"
                    size="xs"
                    [disabled]="!canSaveVoiceId()"
                    (click)="saveVoiceId()"
                    data-testid="elevenlabs-voice-id-save"
                  >
                    Use voice ID
                  </button>
                </div>
                </div>
              } @else {
                <ptah-field label="Voice" appearance="stacked">
<select
                  ptahSelect
                  size="sm"
                  id="elevenlabs-voice"
                  aria-label="Voice"
                  class="w-full"
                  [value]="voiceId()"
                  [ptahBusyDisabled]="saving()"
                  (change)="onVoiceChange($event)"
                  data-testid="elevenlabs-voice-select"
                >
                  @for (voice of voices(); track voice.id) {
                    <option
                      [value]="voice.id"
                      [selected]="voice.id === voiceId()"
                    >
                      {{ voice.label }}
                    </option>
                  }
                </select>
</ptah-field>
              }
            </div>
          </div>
        }
        <!-- V24 (TTS model, output format) / V25 (STT model): S-sel + Undo -->
        @for (row of selectRows(); track row.key) {
          <div class="flex flex-col gap-[var(--ptah-gap-field)]">
            <div class="text-sm font-medium text-base-content">
              {{ row.label }}
            </div>
            <div class="min-w-0">
              <ptah-field label="Model or format" appearance="stacked">
<select
                ptahSelect
                size="sm"
                [id]="'elevenlabs-' + row.slug"
                [attr.aria-label]="row.ariaLabel"
                class="w-full"
                [value]="selection[row.key]()"
                [ptahBusyDisabled]="saving()"
                (change)="onSelectionChange($event, row)"
                [attr.data-testid]="'elevenlabs-' + row.slug + '-select'"
              >
                @for (opt of row.options; track opt.value) {
                  <option
                    [value]="opt.value"
                    [selected]="opt.value === selection[row.key]()"
                  >
                    {{ opt.label }}
                  </option>
                }
              </select>
</ptah-field>
            </div>
          </div>
        }

    </ptah-form-section>
  `,
})
export class ElevenLabsPanelComponent {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly feedback = inject(SettingsSaveFeedbackService);

  readonly direction = input.required<'stt' | 'tts'>();
  readonly config = input.required<VoiceProviderConfigElevenLabsDto>();
  /** Key block only (ElevenLabs not active yet): no voice/model rows and no cloud voice listing. */
  readonly keyOnly = input(false);
  readonly changed = output<void>();

  readonly AlertCircleIcon = AlertCircle;
  readonly CheckCircleIcon = CheckCircle;
  readonly XCircleIcon = XCircle;
  readonly EyeIcon = Eye;
  readonly EyeOffIcon = EyeOff;

  /** Save triggers are disabled while any settings write is in flight (D3). */
  readonly saving = this.feedback.saving;

  // Config-driven selects (reset when the container passes a fresh config).
  readonly voiceId = linkedSignal(() => this.config().voiceId ?? '');
  readonly selection: Readonly<
    Record<ElevenLabsSelectKey, WritableSignal<string>>
  > = {
    ttsModelId: linkedSignal(() => this.config().ttsModelId),
    outputFormat: linkedSignal(() => this.config().outputFormat),
    sttModelId: linkedSignal(() => this.config().sttModelId),
  };
  readonly selectRows = computed(() => {
    if (this.keyOnly()) return [];
    return this.direction() === 'tts' ? ELEVENLABS_TTS_ROWS : ELEVENLABS_STT_ROWS;
  });

  /** Draft key — NEVER seeded from the stored key (which is never sent to us). */
  readonly keyDraft = signal('');
  readonly keyVisible = signal(false);
  /** The exact draft that last passed `voice:testConnection`; `null` until one does (G13). */
  private readonly verifiedKey = signal<string | null>(null);
  readonly isTesting = signal(false);
  readonly testResult = signal<TestResult | null>(null);
  readonly confirmingClear = signal(false);

  readonly voices = signal<VoiceInfoDto[]>([]);
  readonly isLoadingVoices = signal(false);
  readonly voicesError = signal<string | null>(null);
  readonly voicesHint = signal<string | null>(null);
  readonly defaultVoiceLabel = DEFAULT_VOICE_LABEL;
  /** A saved key hides the key form until Replace is used; no key always shows it. */
  readonly replacingKey = signal(false);
  readonly showKeyForm = computed(
    () => !this.config().apiKeyConfigured || this.replacingKey(),
  );
  /** Manual voice id, used when the voice list cannot load; starts at the saved voice. */
  readonly voiceIdDraft = linkedSignal(() => this.voiceId());
  readonly canSaveVoiceId = computed(() => {
    const draft = this.voiceIdDraft().trim();
    return (
      !this.saving() && VOICE_ID_PATTERN.test(draft) && draft !== this.voiceId()
    );
  });

  readonly showVoicePicker = computed(
    () =>
      !this.keyOnly() &&
      this.direction() === 'tts' &&
      this.config().apiKeyConfigured,
  );
  /** The typed draft is the one that passed the probe. */
  readonly draftVerified = computed(() => {
    const draft = this.keyDraft().trim();
    return draft.length > 0 && this.verifiedKey() === draft;
  });
  /** G13: Save is on only for a draft that passed the probe. */
  readonly canSaveKey = computed(
    () => this.draftVerified() && !this.isTesting() && !this.saving(),
  );
  /** Probes the draft when one is typed, otherwise the stored key. */
  readonly canTest = computed(
    () =>
      !this.isTesting() &&
      (this.config().apiKeyConfigured || this.keyDraft().trim().length > 0),
  );

  private readonly clearButton =
    viewChild<ElementRef<HTMLButtonElement>>('clearBtn');

  constructor() {
    // Loads voices on mount and again once a first key is saved and the container re-reads.
    effect(() => {
      if (this.showVoicePicker()) untracked(() => void this.loadVoices());
    });
  }

  onKeyInput(event: Event): void {
    this.keyDraft.set((event.target as HTMLInputElement).value);
    this.verifiedKey.set(null);
    this.testResult.set(null);
  }

  /**
   * V22 probe. With a draft it tests exactly that draft and, on a pass, unlocks Save for it (G13);
   * without one it tests the stored key. The outcome is one fixed sentence per category (F1).
   */
  async testConnection(): Promise<void> {
    if (!this.canTest()) return;
    const draft = this.keyDraft().trim();
    this.testResult.set(null);
    this.verifiedKey.set(null);
    this.isTesting.set(true);
    let outcome: TestResult = { ok: false, message: TEST_FAILED_MESSAGE };
    try {
      const result = await this.rpc.call('voice:testConnection', {
        providerId: 'elevenlabs',
        ...(draft.length > 0 ? { apiKey: draft } : {}),
      });
      if (result.isSuccess()) {
        outcome = result.data.ok
          ? { ok: true, message: TEST_OK_MESSAGE }
          : { ok: false, message: testFailureMessage(result.data.category) };
      }
    } catch {
      // A thrown transport error gets the generic fixed sentence (F1).
    } finally {
      this.isTesting.set(false);
    }
    // The draft changed while the probe ran: this outcome is about a key no longer in the field.
    if (this.keyDraft().trim() !== draft) return;
    this.testResult.set(outcome);
    if (outcome.ok && draft.length > 0) this.verifiedKey.set(draft);
  }

  /** V21 save (S-verify, no Undo): only the draft that passed the probe is ever sent. */
  async saveKey(): Promise<void> {
    const apiKey = this.keyDraft().trim();
    if (apiKey.length === 0 || this.verifiedKey() !== apiKey) return;
    await this.feedback.saveGeneric({
      label: 'ElevenLabs API key',
      write: async () => {
        const result = await this.writeApiKey(apiKey, SAVE_KEY_FAILED_MESSAGE);
        if (result.ok) {
          this.keyDraft.set('');
          this.verifiedKey.set(null);
          this.keyVisible.set(false);
          this.testResult.set(null);
          this.replacingKey.set(false);
          // A replaced key may see a different voice library; a first key loads via the effect.
          if (this.showVoicePicker()) void this.loadVoices();
        }
        return result;
      },
      undo: null,
    });
  }

  openClearConfirm(): void {
    this.confirmingClear.set(true);
  }

  /** Cancel and Esc close the confirm; Esc stops here so the enclosing drawer stays open (Batch 49b). */
  cancelClear(event?: Event): void {
    event?.stopPropagation();
    this.confirmingClear.set(false);
    this.clearButton()?.nativeElement.focus();
  }

  /** V21 clear after the inline confirm (S-confirm, no Undo). The confirm stays open on failure. */
  async clearKey(): Promise<void> {
    await this.feedback.saveGeneric({
      label: 'removal of the ElevenLabs API key',
      write: async () => {
        const result = await this.writeApiKey('', CLEAR_KEY_FAILED_MESSAGE);
        if (result.ok) {
          this.confirmingClear.set(false);
          this.keyDraft.set('');
          this.verifiedKey.set(null);
          this.testResult.set(null);
          this.voices.set([]);
        }
        return result;
      },
      undo: null,
    });
  }

  async loadVoices(): Promise<void> {
    if (!this.showVoicePicker()) return;
    this.isLoadingVoices.set(true);
    this.voicesError.set(null);
    this.voicesHint.set(null);
    let loaded: VoiceInfoDto[] | null = null;
    let category: string | undefined;
    try {
      const result = await this.rpc.call('voice:listVoices', {
        providerId: 'elevenlabs',
      });
      if (result.isSuccess()) {
        if (result.data.ok) loaded = result.data.voices;
        else category = result.data.category;
      }
    } catch {
      // A thrown transport error gets the same fixed sentence (F1).
    } finally {
      this.isLoadingVoices.set(false);
    }
    if (loaded) {
      this.voices.set(loaded);
      return;
    }
    this.voicesError.set(LOAD_VOICES_FAILED_MESSAGE);
    // The key itself works (it was saved after a passing test), so `auth` here is a missing scope.
    this.voicesHint.set(
      category === 'auth' ? VOICES_PERMISSION_HINT : VOICES_FALLBACK_HINT,
    );
  }

  /** Opens the key form over a saved key, or cancels it and drops the draft. */
  toggleReplaceKey(): void {
    const opening = !this.replacingKey();
    this.replacingKey.set(opening);
    this.testResult.set(null);
    if (!opening) {
      this.keyDraft.set('');
      this.verifiedKey.set(null);
      this.keyVisible.set(false);
    }
  }

  onVoiceIdInput(event: Event): void {
    this.voiceIdDraft.set((event.target as HTMLInputElement).value);
  }

  async saveVoiceId(): Promise<void> {
    if (!this.canSaveVoiceId()) return;
    const next = this.voiceIdDraft().trim();
    const previous = this.voiceId();
    await this.feedback.saveGeneric({
      label: 'ElevenLabs voice',
      write: () => this.writeSelection(this.voiceId, 'voiceId', next, previous),
      undo:
        previous.length > 0
          ? () => this.writeSelection(this.voiceId, 'voiceId', previous, next)
          : null,
    });
  }

  onVoiceChange(event: Event): Promise<void> {
    return this.saveSelection(
      event,
      'ElevenLabs voice',
      this.voiceId,
      'voiceId',
    );
  }

  onSelectionChange(event: Event, row: ElevenLabsSelectRow): Promise<void> {
    const label = `ElevenLabs ${row.ariaLabel.toLowerCase()}`;
    return this.saveSelection(event, label, this.selection[row.key], row.key);
  }

  /**
   * V23-V25 (S-sel): saves on selection with Undo = the previous value. No Undo when there was no
   * previous value (an unset voice), since the host rejects an empty id.
   */
  private async saveSelection(
    event: Event,
    label: string,
    field: WritableSignal<string>,
    key: SelectionKey,
  ): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const next = select.value;
    const previous = field();
    if (next === previous) return;
    await this.feedback.saveGeneric({
      label,
      write: () => this.writeSelection(field, key, next, previous),
      undo:
        previous.length > 0
          ? () => this.writeSelection(field, key, previous, next)
          : null,
    });
    // The binding alone does not repaint when the signal ends where it started.
    select.value = field();
  }

  /** Shows `next` while it saves; restores `fallback` when the write fails (D15). */
  private async writeSelection(
    field: WritableSignal<string>,
    key: SelectionKey,
    next: string,
    fallback: string,
  ): Promise<WriteResult> {
    field.set(next);
    const elevenlabs: Partial<Record<SelectionKey, string>> = {};
    elevenlabs[key] = next;
    const result = await this.attempt(
      SAVE_SETTINGS_FAILED_MESSAGE,
      async () => {
        const answer = await this.rpc.call('voice:setProviderConfig', {
          elevenlabs,
        });
        return answer.isSuccess() && answer.data.ok;
      },
    );
    if (!result.ok) field.set(fallback);
    return result;
  }

  /** `voice:setApiKey` (`''` clears the stored key). */
  private writeApiKey(apiKey: string, failure: string): Promise<WriteResult> {
    return this.attempt(failure, async () => {
      const answer = await this.rpc.call('voice:setApiKey', {
        providerId: 'elevenlabs',
        apiKey,
      });
      return answer.isSuccess() && answer.data.ok;
    });
  }

  /**
   * Runs one write. Success only when the write's own result says so (D15); it emits `changed` so
   * the container re-reads the backend config. Any failure — RPC error, `{ok:false}` or a throw —
   * returns the fixed `failure` sentence for the toast, never host text (F1).
   */
  private async attempt(
    failure: string,
    request: () => Promise<boolean>,
  ): Promise<WriteResult> {
    let saved = false;
    try {
      saved = await request();
    } catch {
      // A thrown transport error gets the same fixed sentence (F1).
    }
    if (saved) {
      this.changed.emit();
      return { ok: true };
    }
    return { ok: false, message: failure };
  }
}

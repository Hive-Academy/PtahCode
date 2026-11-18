import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input,
  linkedSignal, output, signal, untracked, viewChild, type WritableSignal,
} from '@angular/core';
import {
  AlertCircle, CheckCircle, Eye, EyeOff, LucideAngularModule, XCircle,
} from 'lucide-angular';
import { ClaudeRpcService } from '@ptah-extension/core';
import type {
  VoiceInfoDto,
  VoiceProviderConfigElevenLabsDto,
} from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import {
  ELEVENLABS_STT_ROWS, ELEVENLABS_TTS_ROWS, type ElevenLabsSelectKey,
  type ElevenLabsSelectRow,
} from './elevenlabs-select-rows';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { SettingsConnectionTestComponent } from '../shared/settings-connection-test.component';
import {
  SAVE_KEY_FAILED_MESSAGE, CLEAR_KEY_FAILED_MESSAGE, SAVE_SETTINGS_FAILED_MESSAGE,
  LOAD_VOICES_FAILED_MESSAGE, VOICES_PERMISSION_HINT, VOICES_FALLBACK_HINT,
  TEST_OK_MESSAGE, TEST_FAILED_MESSAGE, testFailureMessage,
} from './elevenlabs-panel-messages';
import {
  PtahBadgeDirective, PtahButtonDirective, PtahIconButtonDirective, PtahInputDirective,
  PtahRichSelectComponent, PtahFieldGridDirective, PtahFormSectionComponent,
  PtahFieldComponent, PtahInlineConfirmComponent,
} from '@ptah-extension/ui';
type WriteResult = { ok: true } | { ok: false; message: string };
type SelectionKey = 'voiceId' | ElevenLabsSelectKey;
interface TestResult {
  readonly ok: boolean;
  readonly message: string;
}
const DEFAULT_VOICE_LABEL = 'Rachel (21m00Tcm4TlvDq8ikWAM)';
const VOICE_ID_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;
@Component({
  selector: 'ptah-elevenlabs-panel',
  standalone: true,
  imports: [
    SettingsBusyDisabledDirective,
    SettingsConnectionTestComponent,
    LucideAngularModule,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahInputDirective,
    PtahRichSelectComponent,
    PtahFieldGridDirective,
    PtahFormSectionComponent,
    PtahFieldComponent,
    PtahInlineConfirmComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ptah-form-section
      wide
      description="Configure cloud speech and voices."
      heading="ElevenLabs"
      level="3"
      data-testid="elevenlabs-panel-table"
    >
      <div class="flex flex-col gap-ptah-field">
        <div class="text-sm font-medium text-base-content">API key</div>
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
                [img]="
                  config().apiKeyConfigured ? CheckCircleIcon : AlertCircleIcon
                "
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
                  <ptah-settings-connection-test
                    label="Test"
                    testId="elevenlabs-test-btn"
                    [disabled]="!canTest()"
                    [state]="isTesting() ? 'running' : 'idle'"
                    (test)="testConnection()"
                  />
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
            <p
              class="mt-1 text-xs text-base-content-muted"
              data-testid="elevenlabs-key-stored-note"
            >
              Stored encrypted on this machine. The key itself is never shown.
            </p>
            <div aria-live="polite" class="mt-1">
              @if (testResult(); as result) {
                <span
                  ptahBadge
                  appearance="outline"
                  [tone]="result.ok ? 'ok' : 'err'"
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
              confirmLabel="Clear key"
              tone="danger"
              [busy]="saving()"
              confirmTestId="elevenlabs-clear-confirm"
              cancelTestId="elevenlabs-clear-cancel"
              data-testid="elevenlabs-clear-group"
              (confirm)="clearKey()"
              (cancelled)="cancelClear()"
            />
          }
        </div>
      </div>
      @if (showKeyForm()) {
        <div class="flex flex-col gap-ptah-field">
          <div class="min-w-0">
            <div class="flex items-center gap-1">
              <ptah-field
                label="API key"
                hint="Test the key before saving it."
                class="flex-1"
              >
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
                    config().apiKeyConfigured ? 'New API key' : 'Paste API key'
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
            </div>
            <div class="flex items-center gap-ptah-field">
              <ptah-settings-connection-test
                label="Test connection"
                testId="elevenlabs-test-btn"
                [disabled]="!canTest()"
                [state]="isTesting() ? 'running' : 'idle'"
                (test)="testConnection()"
              />
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
                <span
                  ptahBadge
                  appearance="outline"
                  [tone]="result.ok ? 'ok' : 'err'"
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
      <div ptahFieldGrid minColumn="sm">
        @if (direction() === 'tts' && !keyOnly()) {
          <div class="flex flex-col gap-ptah-field">
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
                  <div class="flex items-center gap-2">
                    <ptah-field class="flex-1" label="Voice ID"
                      ><input
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
                    /></ptah-field>
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
                <ptah-field label="Voice">
                  <ptah-select
                    #selectionControl
                    size="sm"
                    id="elevenlabs-voice"
                    aria-label="Voice"
                    class="w-full"
                    [value]="voiceId()"
                    [disabled]="saving()"
                    (valueChange)="onVoiceChange($event, selectionControl)"
                    data-testid="elevenlabs-voice-select"
                    [options]="voiceOptions()"
                  />
                </ptah-field>
              }
            </div>
          </div>
        }
        @for (row of selectRows(); track row.key) {
          <div class="flex flex-col gap-ptah-field">
            <div class="min-w-0">
              <ptah-field [label]="row.label">
                <ptah-select
                    #selectionControl
                  size="sm"
                  [id]="'elevenlabs-' + row.slug"
                  [attr.aria-label]="row.ariaLabel"
                  class="w-full"
                  [value]="selection[row.key]()"
                  [disabled]="saving()"
                  (valueChange)="onSelectionChange($event, row, selectionControl)"
                  [attr.data-testid]="'elevenlabs-' + row.slug + '-select'"
                  [options]="row.options"
                />
              </ptah-field>
            </div>
          </div>
        }
      </div>
    </ptah-form-section>
  `,
})
export class ElevenLabsPanelComponent {
  readonly voiceOptions = computed(() =>
    this.voices().map((voice) => ({ value: voice.id, label: voice.label })),
  );
  private readonly rpc = inject(ClaudeRpcService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  readonly direction = input.required<'stt' | 'tts'>();
  readonly config = input.required<VoiceProviderConfigElevenLabsDto>();
  readonly keyOnly = input(false);
  /** Opens the clear confirmation on mount (page "Clear key" action); the confirm still asks. */
  readonly startClearConfirm = input(false);
  readonly changed = output<void>();
  readonly AlertCircleIcon = AlertCircle;
  readonly CheckCircleIcon = CheckCircle;
  readonly XCircleIcon = XCircle;
  readonly EyeIcon = Eye;
  readonly EyeOffIcon = EyeOff;
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
    return this.direction() === 'tts'
      ? ELEVENLABS_TTS_ROWS
      : ELEVENLABS_STT_ROWS;
  });
  readonly keyDraft = signal('');
  readonly keyVisible = signal(false);
  private readonly verifiedKey = signal<string | null>(null);
  readonly isTesting = signal(false);
  readonly testResult = signal<TestResult | null>(null);
  readonly confirmingClear = signal(false);
  readonly voices = signal<VoiceInfoDto[]>([]);
  readonly isLoadingVoices = signal(false);
  readonly voicesError = signal<string | null>(null);
  readonly voicesHint = signal<string | null>(null);
  readonly defaultVoiceLabel = DEFAULT_VOICE_LABEL;
  readonly replacingKey = signal(false);
  readonly showKeyForm = computed(
    () => !this.config().apiKeyConfigured || this.replacingKey(),
  );
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
  readonly draftVerified = computed(() => {
    const draft = this.keyDraft().trim();
    return draft.length > 0 && this.verifiedKey() === draft;
  });
  readonly canSaveKey = computed(
    () => this.draftVerified() && !this.isTesting() && !this.saving(),
  );
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
    // One shot per request: a later config reload must not open the confirmation again.
    let clearRequestHandled = false;
    effect(() => {
      if (!this.startClearConfirm()) {
        clearRequestHandled = false;
      } else if (!clearRequestHandled && this.config().apiKeyConfigured) {
        clearRequestHandled = true;
        untracked(() => this.confirmingClear.set(true));
      }
    });
  }
  onKeyInput(event: Event): void {
    this.keyDraft.set((event.target as HTMLInputElement).value);
    this.verifiedKey.set(null);
    this.testResult.set(null);
  }
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
  cancelClear(event?: Event): void {
    event?.stopPropagation();
    this.confirmingClear.set(false);
    this.clearButton()?.nativeElement.focus();
  }
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
  async onVoiceChange(next: string | null, control: PtahRichSelectComponent<string>): Promise<void> {
    await this.saveSelection(
      next,
      'ElevenLabs voice',
      this.voiceId,
      'voiceId',
    );
    control.value.set(this.voiceId());
  }
  async onSelectionChange(
    next: string | null,
    row: ElevenLabsSelectRow,
    control: PtahRichSelectComponent<string>,
  ): Promise<void> {
    const label = `ElevenLabs ${row.ariaLabel.toLowerCase()}`;
    await this.saveSelection(next, label, this.selection[row.key], row.key);
    control.value.set(this.selection[row.key]());
  }
  private async saveSelection(
    next: string | null,
    label: string,
    field: WritableSignal<string>,
    key: SelectionKey,
  ): Promise<void> {
    if (next === null) return;
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
  }
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
  private writeApiKey(apiKey: string, failure: string): Promise<WriteResult> {
    return this.attempt(failure, async () => {
      const answer = await this.rpc.call('voice:setApiKey', {
        providerId: 'elevenlabs',
        apiKey,
      });
      return answer.isSuccess() && answer.data.ok;
    });
  }
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

import {
  Component,
  inject,
  input,
  output,
  computed,
  signal,
  linkedSignal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { LucideAngularModule, AlertCircle, Download } from 'lucide-angular';
import { ClaudeRpcService } from '@ptah-extension/core';
import type { VoiceProviderConfigLocalDto } from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { VoiceDownloadProgressService } from '../../services/voice-download-progress.service';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahInputDirective,
  PtahRichSelectComponent,
  PtahFieldGridDirective,
  PtahFormSectionComponent,
  PtahMeterComponent,
  PtahFieldComponent,
  PtahSettingRowComponent,
} from '@ptah-extension/ui';

interface WhisperModelOption {
  readonly value: string;
  readonly label: string;
}

const ENGLISH_MODELS: readonly WhisperModelOption[] = [
  { value: 'tiny.en', label: 'tiny.en (~40 MB, fastest)' },
  { value: 'base.en', label: 'base.en (~80 MB, default)' },
  { value: 'small.en', label: 'small.en (~250 MB, more accurate)' },
  { value: 'medium.en', label: 'medium.en (~780 MB)' },
] as const;

const MULTILINGUAL_MODELS: readonly WhisperModelOption[] = [
  { value: 'tiny', label: 'tiny (~40 MB, fastest)' },
  { value: 'base', label: 'base (~80 MB)' },
  { value: 'small', label: 'small (~250 MB)' },
  { value: 'medium', label: 'medium (~780 MB)' },
  { value: 'large-v3-turbo', label: 'large-v3-turbo (~800 MB, most accurate)' },
] as const;

type ModelSource = 'curated' | 'hf' | 'dir';
type WriteResult = { ok: true } | { ok: false; message: string };

const DOWNLOAD_MODEL_TIMEOUT_MS = 30 * 60 * 1000;

// F1: the backend returns raw error.message on failure, so a visible message
// is always one of these fixed sentences — never host error text.
const SAVE_FAILED_MESSAGE = 'Could not save the voice configuration.';
const DOWNLOAD_FAILED_MESSAGE = 'Could not download the voice model.';

/** `owner/name` HuggingFace repo id shape (letters, digits, `._-`). */
const HF_REPO_ID_RE = /^[\w.-]+\/[\w.-]+$/;

/**
 * Local Whisper (STT) panel, drawer D-VOICE tab "Speech-to-text" (pattern map
 * V13-V16, V20): the existing controls reflowed as `table-sm` rows. Saves run
 * through {@link SettingsSaveFeedbackService.saveGeneric} — "Saved" only after
 * the write's own result, a failed write reverts the control and raises an
 * alert toast (D15), the "Saved" chip is gone (V20). Returning to Curated saves
 * immediately with Undo (V13); a custom HF id / folder is committed by its Save
 * button (V15). The download button + live progress bar are unchanged and still
 * driven by `VoiceDownloadProgressService`, keyed by the model name.
 */
@Component({
  selector: 'ptah-local-stt-panel',
  standalone: true,
  imports: [
    SettingsBusyDisabledDirective,
    LucideAngularModule,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahInputDirective,
    PtahRichSelectComponent,
    PtahFieldGridDirective,
    PtahFormSectionComponent,
    PtahMeterComponent,
    PtahFieldComponent,
    PtahSettingRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ptah-form-section
      wide
      description="Transcribe audio on this device."
      heading="Local speech to text"
      level="3"
      data-testid="local-stt-panel-table"
    >
      <div ptahFieldGrid minColumn="sm">
        <!-- V13: source. Returning to Curated saves immediately; a custom source
             is committed by its Save button (V15). -->
        <ptah-setting-row
          label="Source"
          hint="Choose where the speech model comes from."
        >
          <div
            class="flex items-center gap-1"
            role="radiogroup"
            aria-label="Model source"
          >
            @for (opt of sourceOptions; track opt.value) {
              <button
                type="button"
                ptahButton
                size="xs"
                class="flex-1"
                [variant]="source() === opt.value ? 'primary' : 'ghost'"
                role="radio"
                [attr.aria-checked]="source() === opt.value"
                [ptahBusyDisabled]="saving()"
                (click)="onSourceChange(opt.value)"
                [attr.data-testid]="'local-stt-source-' + opt.value"
              >
                {{ opt.label }}
              </button>
            }
          </div>
        </ptah-setting-row>

        <!-- V14 curated model select / V15 custom id or folder -->
        <div class="flex flex-col gap-ptah-field" [class.col-span-full]="source() !== 'curated'">
          <div class="min-w-0">
            @if (source() === 'curated') {
              <ptah-field
                label="Whisper model"
                hint="Downloads on first use."
              >
                <ptah-select
                  #selectionControl
                  id="local-stt-model"
                  aria-label="Whisper model"
                  size="sm"
                  class="w-full"
                  [value]="selectedModel()"
                  [disabled]="saving()"
                  (valueChange)="onModelChange($event, selectionControl)"
                  data-testid="local-stt-model-select"
                  [options]="modelOptions"
                />
              </ptah-field>
            } @else {
              <div class="flex flex-col items-start gap-[var(--ptah-gap-field)]">
                <ptah-field
                  class="flex-1"
                  label="Custom model id or folder"
                  hint="Use owner/name or an absolute folder path."
                  ><input
                    id="local-stt-custom"
                    type="text"
                    aria-label="Custom model id or folder"
                    ptahInput
                    size="sm"
                    class="w-full"
                    tone="mono"
                    [invalid]="customModel().length > 0 && !customModelValid()"
                    [value]="customModel()"
                    [disabled]="saving()"
                    [placeholder]="
                      source() === 'hf'
                        ? 'owner/whisper-model (HF repo id)'
                        : 'Absolute path to model folder'
                    "
                    (input)="onCustomModelInput($event)"
                    data-testid="local-stt-custom-input"
                /></ptah-field>
                <button
                  type="button"
                  ptahButton
                  variant="primary"
                  size="xs"
                  [busy]="saving()"
                  [disabled]="!customModelValid()"
                  (click)="saveCustomSource()"
                  data-testid="local-stt-custom-save"
                >
                  Save
                </button>
              </div>
              @if (customModel().length > 0 && !customModelValid()) {
                <p
                  class="mt-1 flex items-center gap-1 text-[10px] text-base-content"
                  data-testid="local-stt-custom-hint"
                >
                  <lucide-angular
                    [img]="AlertCircleIcon"
                    class="w-3 h-3 text-error shrink-0"
                    aria-hidden="true"
                  />
                  {{
                    source() === 'hf'
                      ? 'Enter a valid HuggingFace repo id (owner/name).'
                      : 'Enter an absolute folder path.'
                  }}
                </p>
              }
            }
          </div>
        </div>
      </div>
      <!-- V16: download + live progress -->
      <div class="flex flex-col gap-ptah-field">
        <div class="text-sm font-medium text-base-content">Download</div>
        <div class="min-w-0">
          @if (isDownloading()) {
            <div
              class="flex items-center gap-2"
              data-testid="local-stt-download-status"
            >
              <ptah-meter
                class="flex-1"
                [value]="downloadPercent() ?? 0"
                [indeterminate]="downloadPercent() === null"
                [max]="100"
                label="Speech model download progress"
                [hideLabel]="true"
                [showValue]="false"
                barRole="progressbar"
                data-testid="local-stt-download-progress"
              />
              <span
                class="text-[10px] text-base-content-muted w-20 text-right"
                role="status"
              >
                <span class="sr-only">Downloading speech model</span>
                <span aria-hidden="true">
                  @if (downloadPercent() !== null) {
                    Downloading {{ downloadPercent() }}%
                  } @else {
                    Starting…
                  }
                </span>
              </span>
            </div>
          } @else {
            <div class="flex items-center justify-between gap-2">
              @if (downloaded()) {
                <span
                  ptahBadge
                  appearance="outline"
                  tone="ok"
                  class="gap-1 whitespace-nowrap"
                  data-testid="local-stt-download-status"
                >
                  <span
                    class="w-1.5 h-1.5 rounded-full bg-success"
                    aria-hidden="true"
                  ></span>
                  Downloaded
                </span>
              } @else {
                <span
                  ptahBadge
                  appearance="outline"
                  tone="warn"
                  class="gap-1 whitespace-nowrap"
                  data-testid="local-stt-download-status"
                >
                  <span
                    class="w-1.5 h-1.5 rounded-full bg-warning"
                    aria-hidden="true"
                  ></span>
                  Not downloaded
                </span>
              }

              <button
                type="button"
                ptahButton
                size="xs"
                [busy]="saving()"
                [disabled]="!canDownload()"
                (click)="downloadModel()"
                data-testid="local-stt-download-btn"
              >
                <lucide-angular
                  [img]="DownloadIcon"
                  class="w-3 h-3"
                  aria-hidden="true"
                />
                <span>{{ downloaded() ? 'Ready' : 'Download' }}</span>
              </button>
            </div>
          }
        </div>
      </div>
    </ptah-form-section>
  `,
})
export class LocalSttPanelComponent {
  readonly modelOptions = [
    ...ENGLISH_MODELS.map((option) => ({ ...option, group: 'English-only' })),
    ...MULTILINGUAL_MODELS.map((option) => ({
      ...option,
      group: 'Multilingual',
    })),
  ];
  private readonly rpc = inject(ClaudeRpcService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly downloadProgress = inject(VoiceDownloadProgressService);

  readonly config = input.required<VoiceProviderConfigLocalDto>();
  readonly changed = output<void>();

  readonly AlertCircleIcon = AlertCircle;
  readonly DownloadIcon = Download;

  readonly englishModels = ENGLISH_MODELS;
  readonly multilingualModels = MULTILINGUAL_MODELS;
  readonly sourceOptions: readonly { value: ModelSource; label: string }[] = [
    { value: 'curated', label: 'Curated' },
    { value: 'hf', label: 'HF repo id' },
    { value: 'dir', label: 'Local folder' },
  ];

  /** Save triggers are disabled while any settings write is in flight (D3). */
  readonly saving = this.feedback.saving;

  // Editable drafts seeded from the config input; reset whenever the container
  // re-reads and passes a fresh config object (backend source of truth).
  readonly selectedModel = linkedSignal(() => this.config().whisperModel);
  readonly source = linkedSignal<ModelSource>(() => this.config().modelSource);
  readonly customModel = linkedSignal(() => this.config().customModel ?? '');
  readonly downloaded = computed(() => this.config().sttDownloaded);

  readonly isDownloading = signal(false);

  /** True when the custom id/path passes basic shape validation. */
  readonly customModelValid = computed(() => {
    const value = this.customModel().trim();
    if (value.length === 0) return false;
    return this.source() === 'hf' ? HF_REPO_ID_RE.test(value) : true;
  });

  /** Download is only meaningful for curated models that aren't present yet. */
  readonly canDownload = computed(
    () => this.source() === 'curated' && !this.downloaded(),
  );

  /** The identifier used both for `voice:downloadModel` and progress keying. */
  private readonly downloadKey = computed(() =>
    this.source() === 'curated'
      ? this.selectedModel()
      : this.customModel().trim(),
  );

  readonly downloadPercent = computed(() => {
    const tick = this.downloadProgress.progress();
    if (!tick || tick.model !== this.downloadKey()) return null;
    return tick.percent;
  });

  /**
   * V13: returning to Curated saves immediately (S-sel, Undo restores the
   * previous source). Picking a custom source only switches the view; the
   * Save button commits it (V15, S-explicit). Abandoning an unsaved custom
   * draft needs no write — the backend is already on Curated.
   */
  onSourceChange(next: ModelSource): void {
    if (next === this.source()) return;
    if (next !== 'curated') {
      this.source.set(next);
      return;
    }
    const cfg = this.config();
    if (cfg.modelSource === 'curated') {
      this.source.set('curated');
      return;
    }
    const previousSource = cfg.modelSource;
    const previousCustom = cfg.customModel;
    void this.feedback.saveGeneric({
      label: 'speech-to-text model source',
      write: () => this.writeSource('curated', undefined, previousSource),
      undo: () => this.writeSource(previousSource, previousCustom, 'curated'),
    });
  }

  /** V14: saves on selection with Undo; a failed write reverts the select (D15). */
  async onModelChange(next: string | null, control: PtahRichSelectComponent<string>): Promise<void> {
    if (next === null) return;
    const previous = this.selectedModel();
    if (next === previous) return;
    await this.feedback.saveGeneric({
      label: 'speech-to-text model',
      write: () => this.writeModel(next, previous),
      undo: () => this.writeModel(previous, next),
    });
    // Restore the menu model even if the write failed before the next render.
    control.value.set(this.selectedModel());
  }

  onCustomModelInput(event: Event): void {
    this.customModel.set((event.target as HTMLInputElement).value);
  }

  /**
   * V15: explicit save of the custom id/path (S-explicit, no Undo). The draft
   * stays in the field on failure so it can be retried, like the web-search key
   * editor (Batch 45); the failure shows inline and as an alert toast.
   */
  saveCustomSource(): void {
    if (!this.customModelValid()) return;
    const modelSource = this.source();
    const customModel = this.customModel().trim();
    void this.feedback.saveGeneric({
      label: 'speech-to-text model source',
      write: () =>
        this.setConfig({
          whisperModel: this.selectedModel(),
          modelSource,
          customModel,
        }),
      undo: null,
    });
  }

  /** Shows `next` while it saves; restores `fallback` when the write fails (D15). */
  private async writeSource(
    next: ModelSource,
    nextCustom: string | undefined,
    fallback: ModelSource,
  ): Promise<WriteResult> {
    this.source.set(next);
    if (nextCustom !== undefined) this.customModel.set(nextCustom);
    const result = await this.setConfig({
      whisperModel: this.selectedModel(),
      modelSource: next,
      ...(nextCustom !== undefined ? { customModel: nextCustom } : {}),
    });
    if (!result.ok) this.source.set(fallback);
    return result;
  }

  private async writeModel(
    next: string,
    fallback: string,
  ): Promise<WriteResult> {
    this.selectedModel.set(next);
    const result = await this.setConfig({
      whisperModel: next,
      modelSource: 'curated',
    });
    if (!result.ok) this.selectedModel.set(fallback);
    return result;
  }

  /**
   * `voice:setConfig` (curated name always sent as the last-known-good value;
   * `modelSource`/`customModel` carry the custom source). Emits `changed` on
   * success so the container re-reads the backend config.
   */
  private async setConfig(params: {
    whisperModel: string;
    modelSource: ModelSource;
    customModel?: string;
  }): Promise<WriteResult> {
    try {
      const result = await this.rpc.call('voice:setConfig', params);
      if (result.isSuccess() && result.data.ok) {
        this.changed.emit();
        return { ok: true };
      }
      return { ok: false, message: SAVE_FAILED_MESSAGE };
    } catch {
      return { ok: false, message: SAVE_FAILED_MESSAGE };
    }
  }

  async downloadModel(): Promise<void> {
    if (this.isDownloading()) return;
    this.downloadProgress.reset();
    this.isDownloading.set(true);
    try {
      const result = await this.rpc.call(
        'voice:downloadModel',
        { model: this.downloadKey() },
        { timeout: DOWNLOAD_MODEL_TIMEOUT_MS },
      );
      if (result.isSuccess() && result.data.ok) {
        this.changed.emit();
      } else {
        this.feedback.announce(DOWNLOAD_FAILED_MESSAGE, 'alert');
      }
    } catch {
      // degradation-audit: reported - a thrown download gets the same fixed alert toast.
      this.feedback.announce(DOWNLOAD_FAILED_MESSAGE, 'alert');
    } finally {
      this.isDownloading.set(false);
      this.downloadProgress.reset();
    }
  }
}

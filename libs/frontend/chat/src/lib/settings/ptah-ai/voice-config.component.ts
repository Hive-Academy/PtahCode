import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  AlertCircle,
  ChevronRight,
  LucideAngularModule,
  Mic,
} from 'lucide-angular';
import { ClaudeRpcService } from '@ptah-extension/core';
import {
  PtahBadgeDirective,
  PtahIconButtonDirective,
  PtahFormSectionComponent,
  PtahFieldComponent,
  PtahSelectDirective,
} from '@ptah-extension/ui';
import type {
  VoiceProviderCapabilityDto,
  VoiceInfoDto,
  VoiceProviderConfigDto,
} from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import {
  VoiceDetailsDrawerComponent,
  type VoiceDirection,
} from './voice-details-drawer.component';

type VoiceProviderId = 'local' | 'elevenlabs';
type WriteResult = { ok: true } | { ok: false; message: string };

interface EngineStatus {
  readonly label: string;
  readonly dot: string;
}

/** One matrix row per direction (pattern map V10-V12). */
interface EngineRow {
  readonly direction: VoiceDirection;
  readonly name: string;
  readonly providerId: VoiceProviderId;
  readonly providerLabel: string;
  readonly options: readonly VoiceProviderCapabilityDto[];
  readonly modelLabel: string;
  /** Tooltip for the Model / Voice cell: the raw ElevenLabs voice id when its name is unknown. */
  readonly modelTitle: string | null;
  readonly detail: string;
  readonly status: EngineStatus;
}

const READY: EngineStatus = { label: 'Ready', dot: 'bg-success' };
const NOT_DOWNLOADED: EngineStatus = { label: 'Not downloaded', dot: 'bg-warning' };
const NO_KEY: EngineStatus = { label: 'No key', dot: 'bg-warning' };

function asProviderId(value: string | undefined): VoiceProviderId {
  return value === 'elevenlabs' ? 'elevenlabs' : 'local';
}

/** One fixed sentence per action (F1): no host or transport text reaches the alert or the toast. */
const LOAD_PROVIDERS_FAILED = 'Could not load the voice engines.';
const LOAD_CONFIG_FAILED = 'Could not load the voice settings.';
const SAVE_PROVIDER_FAILED: Record<VoiceDirection, string> = {
  stt: 'Could not save the speech-to-text engine.',
  tts: 'Could not save the text-to-speech engine.',
};

/**
 * Voice engines card on the Search & Voice tab (pattern map V9-V12, P2 + P4).
 *
 * One row per direction: the provider select lists every
 * provider for that direction (an unavailable one stays disabled with its reason as visible text), the
 * Model / Voice cell shows the active choice, the Status cell summarises readiness from the provider
 * config, and Details opens drawer D-VOICE on that direction's tab. A provider change saves on
 * selection through {@link SettingsSaveFeedbackService.saveGeneric}: "Saved" only after the write's
 * own result, a failed write reverts the row and raises an alert toast, Undo writes the previous
 * provider (D15). The drawer, which hosts the existing panels, is loaded only when first opened.
 */
@Component({
  selector: 'ptah-voice-config',
  standalone: true,
  imports: [LucideAngularModule, VoiceDetailsDrawerComponent, PtahBadgeDirective, PtahIconButtonDirective, PtahFormSectionComponent, PtahFieldComponent, PtahSelectDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="border-b border-base-content/10 pb-7"
      aria-labelledby="voice-engines-heading"
      data-glass-surface="content"
    >
      <ptah-form-section id="voice-engines-heading" heading="Voice engines" level="2"
        description="Pick the speech-to-text and text-to-speech engines used by the chat mic and messaging-gateway voice notes. Local engines run offline; cloud engines require an API key.">

      @if (errorMessage(); as message) {
        <div role="alert" data-testid="voice-config-error"
          class="mb-3 flex items-center gap-1.5 rounded border border-error/40 p-2 text-xs text-base-content">
          <lucide-angular [img]="AlertCircleIcon" class="w-3.5 h-3.5 text-error shrink-0" aria-hidden="true" />
          {{ message }}
        </div>
      }

      @if (isLoading()) {
        <p class="text-xs text-base-content-muted" role="status" data-testid="voice-config-loading">
          Loading voice providers…
        </p>
      } @else if (rows().length) {
        <div class="overflow-x-auto">
          <div class="flex flex-col" data-testid="voice-engines-matrix">

              @for (row of rows(); track row.direction) {
                <div class="flex flex-wrap items-center gap-[var(--ptah-gap-controls)] border-b border-base-300 py-[var(--ptah-gap-field)] last:border-b-0" [attr.data-testid]="'voice-engine-row-' + row.direction">
                  <div class="font-bold text-base-content">{{ row.name }}</div>
                  <div>
                    <ptah-field [label]="row.name + ' provider'" appearance="stacked">
                      <select ptahSelect size="sm" [value]="row.providerId" [disabled]="saving()"
                        [attr.aria-label]="row.name + ' provider: ' + row.providerLabel + '. Change provider'"
                        (change)="onProviderChange($event, row.direction)"
                        [attr.data-testid]="'voice-provider-btn-' + row.direction">
                        @for (option of row.options; track option.id) {
                          <option [value]="option.id" [disabled]="!option.available"
                            [attr.data-testid]="'voice-provider-option-' + row.direction + '-' + option.id">
                            {{ option.label }}@if (!option.available) { — Unavailable: {{ option.unavailableReason ?? 'not available on this machine' }} }
                          </option>
                        }
                      </select>
                    </ptah-field>
                    @for (option of row.options; track option.id) {
                      @if (!option.available) {
                        <span class="sr-only" [id]="'voice-reason-' + row.direction + '-' + option.id"
                          [attr.data-testid]="'voice-provider-reason-' + row.direction + '-' + option.id">
                          Unavailable: {{ option.unavailableReason ?? 'not available on this machine' }}
                        </span>
                      }
                    }
                  </div>
                  <div>
                    <span class="font-mono text-base-content" [attr.title]="row.modelTitle"
                      [attr.data-testid]="'voice-engine-model-' + row.direction">{{ row.modelLabel }}</span>
                  </div>
                  <div>
                    <span ptahBadge appearance="outline" class="gap-1 whitespace-nowrap text-base-content"
                      [attr.data-testid]="'voice-engine-status-' + row.direction">
                      <span [class]="'w-1.5 h-1.5 rounded-full ' + row.status.dot" aria-hidden="true"></span>
                      {{ row.status.label }}
                    </span>
                  </div>
                  <div class="flex-1 text-right">
                    <button type="button" ptahIconButton size="xs" (click)="openDetails(row.direction)"
                      [label]="row.name + ' details: ' + row.detail"
                      [attr.data-testid]="'voice-engine-details-' + row.direction">
                      <lucide-angular [img]="ChevronRightIcon" class="w-3.5 h-3.5 text-base-content" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              }

          </div>
        </div>
      }
      </ptah-form-section>
    </section>

    <!-- Lazy: the drawer and the panels it hosts load the first time a Details button is used. -->
    @defer (when drawerDirection() !== null) {
      <ptah-voice-details-drawer [(direction)]="drawerDirection" [config]="config()"
        (closed)="drawerDirection.set(null)" (changed)="reloadAll()" />
    }
  `,
  styles: `
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 1.25rem;
    }
  `,
})
export class VoiceConfigComponent implements OnInit {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly feedback = inject(SettingsSaveFeedbackService);

  readonly MicIcon = Mic;
  readonly AlertCircleIcon = AlertCircle;
  readonly ChevronRightIcon = ChevronRight;

  /** Save triggers are disabled while any settings write is in flight (D3). */
  readonly saving = this.feedback.saving;

  readonly providers = signal<VoiceProviderCapabilityDto[]>([]);
  readonly config = signal<VoiceProviderConfigDto | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(true);
  /** Direction whose provider popover is open. */
  /** Direction whose drawer tab is open; `null` closes drawer D-VOICE. */
  readonly drawerDirection = signal<VoiceDirection | null>(null);

  /** The ElevenLabs voice library, read once per tab visit to name the TTS voice; `null` until it loads. */
  readonly elevenLabsVoices = signal<readonly VoiceInfoDto[] | null>(null);
  private voicesRequested = false;

  readonly sttProviders = computed(() => this.providers().filter((p) => p.supports.stt));
  readonly ttsProviders = computed(() => this.providers().filter((p) => p.supports.tts));
  readonly sttProviderId = computed(() => asProviderId(this.config()?.sttProvider));
  readonly ttsProviderId = computed(() => asProviderId(this.config()?.ttsProvider));

  readonly rows = computed<EngineRow[]>(() => {
    const cfg = this.config();
    if (!cfg) return [];
    const label = (id: VoiceProviderId) =>
      this.providers().find((p) => p.id === id)?.label ?? (id === 'elevenlabs' ? 'ElevenLabs' : 'Local');
    const stt = this.sttProviderId();
    const tts = this.ttsProviderId();
    const keyStatus = cfg.elevenlabs.apiKeyConfigured ? READY : NO_KEY;
    return [
      {
        direction: 'stt',
        name: 'Speech-to-text',
        providerId: stt,
        providerLabel: label(stt),
        options: this.sttProviders(),
        modelLabel: stt === 'elevenlabs' ? cfg.elevenlabs.sttModelId : localSttModel(cfg),
        modelTitle: null,
        detail: 'model, download and source',
        status: stt === 'elevenlabs' ? keyStatus : cfg.local.sttDownloaded ? READY : NOT_DOWNLOADED,
      },
      {
        direction: 'tts',
        name: 'Text-to-speech',
        providerId: tts,
        providerLabel: label(tts),
        options: this.ttsProviders(),
        ...(tts === 'elevenlabs'
          ? this.elevenLabsVoiceCell(cfg.elevenlabs.voiceId)
          : { modelLabel: cfg.local.ttsVoice, modelTitle: null }),
        detail: 'voice, preview and download',
        status: tts === 'elevenlabs' ? keyStatus : cfg.local.ttsDownloaded ? READY : NOT_DOWNLOADED,
      },
    ];
  });

  constructor() {
    // Name the TTS voice only when ElevenLabs speaks with a chosen voice and a key can list voices.
    effect(() => {
      const cfg = this.config();
      if (this.ttsProviderId() !== 'elevenlabs' || !cfg?.elevenlabs.apiKeyConfigured || !cfg.elevenlabs.voiceId) return;
      untracked(() => void this.loadVoiceNames());
    });
  }

  async ngOnInit(): Promise<void> {
    await this.reloadAll();
    this.isLoading.set(false);
  }

  /** Provider availability depends on the stored key, so a panel save re-reads both. */
  async reloadAll(): Promise<void> {
    await Promise.all([this.loadProviders(), this.reloadConfig()]);
  }

  async loadProviders(): Promise<void> {
    try {
      const result = await this.rpc.call('voice:listProviders', {} as Record<string, never>);
      if (result.isSuccess() && result.data.ok) {
        this.providers.set(result.data.providers);
      } else {
        this.errorMessage.set(LOAD_PROVIDERS_FAILED);
      }
    } catch {
      // A thrown transport error gets the same fixed sentence.
      this.errorMessage.set(LOAD_PROVIDERS_FAILED);
    }
  }

  async reloadConfig(): Promise<void> {
    try {
      const result = await this.rpc.call('voice:getProviderConfig', {} as Record<string, never>);
      if (result.isSuccess() && result.data.ok) {
        this.config.set(result.data.config);
      } else {
        this.errorMessage.set(LOAD_CONFIG_FAILED);
      }
    } catch {
      // A thrown transport error gets the same fixed sentence.
      this.errorMessage.set(LOAD_CONFIG_FAILED);
    }
  }

  /**
   * One `voice:listVoices` read per component instance (tab visit). A failure is not surfaced: the
   * cell falls back to "Custom voice" with the id as its tooltip, and the drawer reports the error.
   */
  private async loadVoiceNames(): Promise<void> {
    if (this.voicesRequested) return;
    this.voicesRequested = true;
    try {
      const result = await this.rpc.call('voice:listVoices', { providerId: 'elevenlabs' });
      if (result.isSuccess() && result.data.ok) this.elevenLabsVoices.set(result.data.voices);
    } catch {
      // Same fallback as a failed result.
    }
  }

  private elevenLabsVoiceCell(voiceId: string | undefined): Pick<EngineRow, 'modelLabel' | 'modelTitle'> {
    if (!voiceId) return { modelLabel: 'No voice chosen', modelTitle: null };
    const name = this.elevenLabsVoices()?.find((voice) => voice.id === voiceId)?.label;
    return name ? { modelLabel: name, modelTitle: null } : { modelLabel: 'Custom voice', modelTitle: voiceId };
  }

  openDetails(direction: VoiceDirection): void {
    this.drawerDirection.set(direction);
  }

  async onProviderChange(event: Event, direction: VoiceDirection): Promise<void> {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    await this.chooseProvider(direction, target.value);
    const cfg = this.config();
    if (cfg) target.value = direction === 'stt' ? cfg.sttProvider : cfg.ttsProvider;
  }

  /** Saves on selection with Undo (S-sel). */
  async chooseProvider(direction: VoiceDirection, providerId: string): Promise<void> {
    const current = this.config();
    if (!current) return;
    const next = asProviderId(providerId);
    const previous = asProviderId(direction === 'stt' ? current.sttProvider : current.ttsProvider);
    if (previous === next) return;

    this.errorMessage.set(null);
    const name = direction === 'stt' ? 'speech-to-text' : 'text-to-speech';
    await this.feedback.saveGeneric({
      label: `${name} provider`,
      write: () => this.writeProvider(direction, next, previous),
      undo: () => this.writeProvider(direction, previous, next),
    });
  }

  /**
   * Shows `next` while it saves and re-reads the config after a confirmed write, so the row and the
   * drawer reflect the backend (downloaded state, saved fields). A failed write puts `fallback` back;
   * its fixed sentence goes to the page toast only.
   */
  private async writeProvider(
    direction: VoiceDirection,
    next: VoiceProviderId,
    fallback: VoiceProviderId,
  ): Promise<WriteResult> {
    this.setProvider(direction, next);
    try {
      const result = await this.rpc.call(
        'voice:setProviderConfig',
        direction === 'stt' ? { sttProvider: next } : { ttsProvider: next },
      );
      if (result.isSuccess() && result.data.ok) {
        await this.reloadConfig();
        return { ok: true };
      }
    } catch {
      // A thrown transport error is reported like a refused write.
    }
    const message = SAVE_PROVIDER_FAILED[direction];
    this.setProvider(direction, fallback);
    return { ok: false, message };
  }

  private setProvider(direction: VoiceDirection, id: VoiceProviderId): void {
    this.config.update((cfg) =>
      cfg ? (direction === 'stt' ? { ...cfg, sttProvider: id } : { ...cfg, ttsProvider: id }) : cfg,
    );
  }
}

function localSttModel(cfg: VoiceProviderConfigDto): string {
  const { modelSource, customModel, whisperModel } = cfg.local;
  if (modelSource === 'curated') return whisperModel;
  return customModel ?? (modelSource === 'hf' ? 'No Hugging Face model set' : 'No model folder set');
}

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import {
  SlidersHorizontal,
  LucideAngularModule,
} from 'lucide-angular';
import { ClaudeRpcService } from '@ptah-extension/core';
import {
  PtahAlertComponent,
  PtahIconButtonDirective,
  PtahFormSectionComponent,
  PtahSettingRowComponent,
  PtahStatusComponent,
  PtahRichSelectComponent,
  PtahSelectIconDirective,
  type PtahSelectOption,
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

import { SearchVoiceSummaryStore } from './search-voice-summary.store';
import { VoiceElevenlabsSummaryComponent } from './voice-elevenlabs-summary.component';
import { SettingsSectionStateComponent } from '../shared/settings-section-state.component';

type VoiceProviderId = 'local' | 'elevenlabs';
type WriteResult = { ok: true } | { ok: false; message: string };

interface EngineStatus {
  readonly label: string;
}

/** One matrix row per direction (pattern map V10-V12). */
interface EngineRow {
  readonly direction: VoiceDirection;
  readonly name: string;
  readonly providerId: VoiceProviderId;
  readonly providerLabel: string;
  readonly options: readonly PtahSelectOption<string>[];
  readonly modelLabel: string;
  /** Tooltip for the Model / Voice cell: the raw ElevenLabs voice id when its name is unknown. */
  readonly modelTitle: string | null;
  readonly detail: string;
  readonly status: EngineStatus;
}

const READY: EngineStatus = { label: 'Ready' };
const NOT_DOWNLOADED: EngineStatus = { label: 'Not downloaded' };
const NO_KEY: EngineStatus = { label: 'No key' };

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
  imports: [LucideAngularModule, VoiceDetailsDrawerComponent, VoiceElevenlabsSummaryComponent,
    PtahAlertComponent, PtahIconButtonDirective, PtahFormSectionComponent, PtahSettingRowComponent,
    PtahStatusComponent, PtahRichSelectComponent, PtahSelectIconDirective, SettingsSectionStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section id="voice-engines-heading" tabindex="-1" [attr.aria-labelledby]="voiceSection.headingId"
      data-glass-surface="content">
      <ptah-form-section #voiceSection heading="Voice" level="2" wide
        description="Talk to the agent and hear its answers. Local engines run on this device.">
        @if (errorMessage(); as message) {
          <ptah-alert tone="error" live="assertive" data-testid="voice-config-error">{{ message }}</ptah-alert>
        }
        @if (isLoading()) {
          <ptah-settings-section-state state="loading" data-testid="voice-config-loading" />
        } @else if (rows().length) {
          <div data-testid="voice-engines-matrix">
            @for (row of rows(); track row.direction) {
              <ptah-setting-row #settingRow [label]="row.name"
                [attr.data-testid]="'voice-engine-row-' + row.direction">
                <div status class="voice-row-status">
                  <ptah-status [status]="row.status.label === 'Ready' ? 'completed' : 'warning'"
                    [label]="row.status.label" appearance="inline"
                    [attr.data-testid]="'voice-engine-status-' + row.direction" />
                  <span class="voice-row-detail text-base-content-muted">
                    {{ row.providerId === 'local' ? 'Local engine' : 'ElevenLabs' }},
                    {{ row.direction === 'stt' ? 'model' : 'voice' }}
                    <span class="font-mono" [attr.title]="row.modelTitle"
                      [attr.data-testid]="'voice-engine-model-' + row.direction">{{ row.modelLabel }}</span>.
                  </span>
                </div>
                <ptah-select size="sm" class="voice-provider" [options]="row.options"
                  [value]="row.providerId" [disabled]="saving()" [labelledBy]="settingRow.titleId()"
                  [attr.aria-label]="(row.direction === 'stt' ? 'Speech-to-text' : 'Text-to-speech') + ' provider: ' + row.providerLabel + '. Change provider'"
                  (valueChange)="chooseProvider(row.direction, $event ?? row.providerId)"
                  [attr.data-testid]="'voice-provider-btn-' + row.direction">
                  <ng-template ptahSelectIcon let-opt let-place="place">
                    @if (place === 'option') {
                      <span [attr.data-testid]="'voice-provider-option-' + row.direction + '-' + opt.value"></span>
                    }
                  </ng-template>
                </ptah-select>
                @for (option of row.options; track option.value) {
                  @if (option.disabled) {
                    <span class="sr-only" [id]="'voice-reason-' + row.direction + '-' + option.value"
                      [attr.data-testid]="'voice-provider-reason-' + row.direction + '-' + option.value">
                      Unavailable: {{ option.description }}
                    </span>
                  }
                }
                <button type="button" ptahIconButton variant="ghost" size="xs" (click)="openDetails(row.direction)"
                  [label]="(row.direction === 'stt' ? 'Speech-to-text' : 'Text-to-speech') + ' details: ' + row.detail"
                  [attr.data-testid]="'voice-engine-details-' + row.direction">
                  <lucide-angular [img]="SlidersIcon" aria-hidden="true" />
                </button>
              </ptah-setting-row>
            }
          </div>
        }
      </ptah-form-section>
    </section>
    @if (config(); as cfg) {
      <ptah-voice-elevenlabs-summary [config]="cfg" [voices]="elevenLabsVoices()"
        (details)="openDetails('tts')" />
    }

    <!-- Lazy: the drawer and the panels it hosts load the first time a Details button is used. -->
    @defer (when drawerDirection() !== null) {
      <ptah-voice-details-drawer [(direction)]="drawerDirection" [config]="config()"
        (closed)="drawerDirection.set(null)" (changed)="reloadAll()" />
    }
  `,
  styles: `
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 0 1.25rem;
    }
    /* Same space as between the page sections in the shell. */
    ptah-voice-elevenlabs-summary { display: block; margin-top: var(--ptah-gap-group); }
    /* Width only: the select needs its own grid display to place the chevron on the trigger. */
    .voice-provider { width: 14rem; max-width: 100%; }
    /* The icon template only carries the option test hooks; it must not take icon space. */
    :host ::ng-deep .voice-provider .ptah-select__icon { display: none; }
    .voice-row-status { display: contents; }
    .voice-row-detail { flex-basis: 100%; font-weight: normal; }
  `,
})
export class VoiceConfigComponent implements OnInit {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly feedback = inject(SettingsSaveFeedbackService);

  private readonly summary = inject(SearchVoiceSummaryStore, { optional: true });
  readonly SlidersIcon = SlidersHorizontal;

  /** Save triggers are disabled while any settings write is in flight (D3). */
  readonly saving = this.feedback.saving;

  readonly providers = signal<VoiceProviderCapabilityDto[]>([]);
  readonly config = signal<VoiceProviderConfigDto | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(true);
  /** Direction whose drawer tab is open; `null` closes drawer D-VOICE. */
  readonly drawerDirection = signal<VoiceDirection | null>(null);

  /** The provider selects, one per row in row order (stt, tts). */
  private readonly providerSelects = viewChildren(PtahRichSelectComponent);

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
        name: 'Speech to text',
        providerId: stt,
        providerLabel: label(stt),
        options: this.providerOptions(this.sttProviders()),
        modelLabel: stt === 'elevenlabs' ? cfg.elevenlabs.sttModelId : localSttModel(cfg),
        modelTitle: null,
        detail: 'model, download and source',
        status: stt === 'elevenlabs' ? keyStatus : cfg.local.sttDownloaded ? READY : NOT_DOWNLOADED,
      },
      {
        direction: 'tts',
        name: 'Text to speech',
        providerId: tts,
        providerLabel: label(tts),
        options: this.providerOptions(this.ttsProviders()),
        ...(tts === 'elevenlabs'
          ? this.elevenLabsVoiceCell(cfg.elevenlabs.voiceId)
          : { modelLabel: cfg.local.ttsVoice, modelTitle: null }),
        detail: 'voice, preview and download',
        status: tts === 'elevenlabs' ? keyStatus : cfg.local.ttsDownloaded ? READY : NOT_DOWNLOADED,
      },
    ];
  });

  constructor() {
    effect(() => {
      const rows = this.rows();
      const meta = rows.map(row => `${row.providerId === 'local' ? 'Local' : 'ElevenLabs'} ${row.direction === 'stt' ? 'in' : 'out'}`).join(', ');
      const ready = rows.length === 2 && rows.every(row => row.status === READY);
      this.summary?.report('voice', this.isLoading()
        ? { value: 'Loading', tone: 'idle' }
        : this.errorMessage()
          ? { value: 'Error', tone: 'error' }
          : { value: ready ? 'Ready' : 'Needs setup', meta, tone: ready ? 'ok' : 'warn' });
    });
    // Name the selected cloud voice in the row and summary whenever a key can list voices.
    effect(() => {
      const cfg = this.config();
      if (!cfg?.elevenlabs.apiKeyConfigured || !cfg.elevenlabs.voiceId) return;
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

  private providerOptions(providers: readonly VoiceProviderCapabilityDto[]): PtahSelectOption<string>[] {
    return providers.map(provider => ({ value: provider.id, label: provider.label,
      disabled: !provider.available,
      description: provider.available ? undefined : provider.unavailableReason ?? 'not available on this machine',
    }));
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
    this.syncProviderSelects();
    return { ok: false, message };
  }

  /**
   * A select keeps the value the user picked until its `[value]` binding changes. When a write
   * fails, the row goes back to the provider it had, so the binding does not change: put the stored
   * provider back into each select. Setting the same value again is a no-op in chooseProvider.
   */
  private syncProviderSelects(): void {
    const rows = this.rows();
    this.providerSelects().forEach((select, index) => {
      const stored = rows[index]?.providerId;
      if (stored && select.value() !== stored) select.value.set(stored);
    });
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

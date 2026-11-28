import { PtahFieldComponent } from '@ptah-extension/ui';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Layers, LucideAngularModule, X } from 'lucide-angular';
import {
  ProvidersSettingsStateService,
  type ProvidersEditContext,
} from '@ptah-extension/core';
import {
  NativeModalComponent,
  PROVIDER_MODELS_LOADER,
  ProviderModelSearchFieldComponent,
  ProviderModelsNoticeComponent,
  savedModelListNotice,
  type ProviderModelSearchOption,
} from '@ptah-extension/ui';
import type { ProviderModelInfo } from '@ptah-extension/shared';
import {
  SettingsSaveFeedbackService,
  type SettingsSaveResult,
} from '../feedback/settings-save-feedback.service';
import { SettingsToastComponent } from '../feedback/settings-toast.component';
import {
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahInputDirective,
} from '@ptah-extension/ui';

/** The instance whose tiers the modal edits. */
export interface CliTierMappingTarget {
  readonly id: string;
  readonly name: string;
  readonly providerId: string;
  readonly providerName: string;
}

type Tier = 'sonnet' | 'opus' | 'haiku';
type TierMappings = Partial<Record<Tier, string>>;
const TIERS: readonly { readonly tier: Tier; readonly label: string }[] = [
  { tier: 'sonnet', label: 'Sonnet' },
  { tier: 'opus', label: 'Opus' },
  { tier: 'haiku', label: 'Haiku' },
];
/** The list's last row: swaps the search for a model-ID field (an id the catalogue does not list). */
const MANUAL = '__manual__';
const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';
const SAVE_SCOPE = 'global';
/** M9: a model id has no whitespace and a sane length. */
const MODEL_ID_MAX_LENGTH = 200;
const MODEL_ID_PATTERN = /^\S+$/;

interface Catalogue {
  readonly status: 'loading' | 'ready' | 'error';
  readonly models: readonly ProviderModelInfo[];
  /** The saved-list disclosure when the host served a saved (`persisted`) list; `null` for a live one. */
  readonly notice: string | null;
}

/**
 * A Ptah CLI instance's own tier mapping (#53, D5; plan :759-764, prototype `#modalTierMapping`), on the shared
 * `NativeModalComponent`. Compact like the prototype: one row per tier.
 * - Each row is the compact searchable model field (ids in mono, the current one checked) over the instance provider's
 *   catalogue (`PROVIDER_MODELS_LOADER`, loaded once per open), with "Enter a model ID…" for an unlisted id.
 * - Its default row and its line under the field name what the tier inherits without its own model: the provider-level
 *   `cliAgent` tier (`provider:getModelTiers {scope:'cliAgent'}`), else the provider default — the D5 order
 *   (instance > provider `cliAgent` > defaults, `ptah-cli-registry.ts` `resolveEffectiveTiers`).
 * - Each pick saves at once through `state.setCliInstanceTiers` with the **full** object (`ptahCli:update` replaces
 *   it); choosing the inherited row, or "Use inherited", sends the object without that tier. Undo sends the previous
 *   full object.
 * Every `write`/`undo` is that one state call (Batch 17 constraint), reported by `SettingsSaveFeedbackService`; the
 * footer's toast copy is the one heard while the page is inert (plan :542-544).
 */
@Component({
  selector: 'ptah-cli-tier-mapping-modal',
  standalone: true,
  imports: [
    PtahFieldComponent,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahInputDirective,
    LucideAngularModule,
    NativeModalComponent,
    ProviderModelSearchFieldComponent,
    ProviderModelsNoticeComponent,
    SettingsToastComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cli-tier-mapping-modal.component.html',
})
export class CliTierMappingModalComponent {
  protected readonly TitleIcon = Layers;
  protected readonly CloseIcon = X;
  protected readonly focusRing = FOCUS;
  protected readonly tiers = TIERS;
  protected readonly manualOption: ProviderModelSearchOption = {
    id: MANUAL,
    name: 'Enter a model ID…',
    supportsToolUse: null,
  };
  private readonly state = inject(ProvidersSettingsStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly loader = inject(PROVIDER_MODELS_LOADER);
  private readonly injector = inject(Injector);
  private readonly modal = viewChild(NativeModalComponent);

  readonly open = input(false);
  readonly target = input<CliTierMappingTarget | null>(null);
  readonly closed = output<void>();

  private context: ProvidersEditContext | null = null;
  private catalogueRequest = 0;
  protected readonly busy = this.feedback.saving;
  protected readonly catalogue = signal<Catalogue>({
    status: 'loading',
    models: [],
    notice: null,
  });
  /** The tier whose search is swapped for a model-ID field, if any. */
  protected readonly manualTier = signal<Tier | null>(null);
  protected readonly manualDraft = signal('');
  protected readonly manualIdError = `Enter a model ID without spaces, up to ${MODEL_ID_MAX_LENGTH} characters.`;
  /** A typed id that cannot be a model id (M9); an empty draft is just not ready yet. */
  protected readonly manualInvalid = computed(() => {
    const draft = this.manualDraft().trim();
    return (
      draft !== '' &&
      (!MODEL_ID_PATTERN.test(draft) || draft.length > MODEL_ID_MAX_LENGTH)
    );
  });
  protected readonly retryingMappings = signal(false);
  /** The mapping read failed, or finished without this instance (deleted meanwhile): waiting will not load it. */
  protected readonly mappingsFailed = computed(() => {
    const status = this.state.cliModels().status;
    return (
      !this.retryingMappings() && (status === 'error' || status === 'ready')
    );
  });

  /** The instance's own mapping as last read (`cliModels`); `null` while it is not loaded. */
  protected readonly mappings = computed<TierMappings | null>(() => {
    const id = this.target()?.id;
    const saved = id ? this.state.cliModels().data?.[id] : undefined;
    if (!saved) return null;
    const mappings: TierMappings = {};
    for (const { tier } of TIERS) {
      const model = saved.tierMappings?.[tier]?.trim();
      if (model) mappings[tier] = model;
    }
    return mappings;
  });
  /** The catalogue as compact-field options; ids lead, display names follow. */
  private readonly catalogueOptions = computed<
    readonly ProviderModelSearchOption[]
  >(() =>
    this.catalogue().models.map((model) => ({
      id: model.id,
      name: model.name || model.id,
      supportsToolUse: null,
    })),
  );

  constructor() {
    effect(() => {
      const target = this.target();
      if (!this.open() || !target) return;
      untracked(() => {
        this.context = this.state.reviewContext();
        this.manualTier.set(null);
        void this.state.refreshTiers({
          providerId: target.providerId,
          scope: 'cliAgent',
        });
        void this.loadModels();
      });
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected own(tier: Tier): string | null {
    return this.mappings()?.[tier] ?? null;
  }

  /** The catalogue, with this tier's own id kept listed when the catalogue lacks it (opening never changes it). */
  protected options(tier: Tier): readonly ProviderModelSearchOption[] {
    const options = this.catalogueOptions(),
      own = this.own(tier);
    return !own || options.some((option) => option.id === own)
      ? options
      : [
          {
            id: own,
            name: 'saved, not in the current list',
            supportsToolUse: null,
          },
          ...options,
        ];
  }

  protected inheritedLabel(tier: Tier): string {
    const section = this.state.tiers();
    if (section.status !== 'ready')
      return section.status === 'error' ? 'not loaded' : 'loading…';
    return section.data?.[tier] ?? 'provider default';
  }

  async loadModels(): Promise<void> {
    const providerId = this.target()?.providerId;
    if (!providerId) return;
    const request = ++this.catalogueRequest;
    this.catalogue.set({ status: 'loading', models: [], notice: null });
    try {
      const result = await this.loader.listModels(providerId);
      if (request !== this.catalogueRequest) return;
      this.catalogue.set({
        status: result.error ? 'error' : 'ready',
        models: result.models ?? [],
        notice: savedModelListNotice(result),
      });
    } catch {
      if (request === this.catalogueRequest)
        this.catalogue.set({ status: 'error', models: [], notice: null });
    }
  }

  protected async onPick(tier: Tier, model: string): Promise<void> {
    if (model === MANUAL) {
      this.manualDraft.set('');
      this.manualTier.set(tier);
      this.focusAfterRender(`[data-testid="cli-tier-manual-${tier}"]`);
      return;
    }
    await this.saveTier(tier, model.trim());
  }

  protected async applyManual(tier: Tier): Promise<void> {
    const model = this.manualDraft().trim();
    if (!model || this.manualInvalid()) return;
    // M2: closes on this save's own result, never on an earlier commit.
    if ((await this.saveTier(tier, model)) === 'saved') this.closeManual(tier);
  }

  protected async retryMappings(): Promise<void> {
    this.retryingMappings.set(true);
    try {
      await this.state.refreshCliModels();
    } finally {
      this.retryingMappings.set(false);
    }
  }

  protected closeManual(tier: Tier): void {
    this.manualTier.set(null);
    this.focusAfterRender(`#cli-tier-${tier}`);
  }

  protected async useInherited(tier: Tier): Promise<void> {
    await this.saveTier(tier, '');
  }

  /** One tier changes; the full object is sent (a blank tier is left out and inherits). `null`: nothing to save. */
  private async saveTier(
    tier: Tier,
    model: string,
  ): Promise<SettingsSaveResult | null> {
    const target = this.target(),
      previous = this.mappings();
    const context = this.context ?? this.state.reviewContext();
    if (!target || !previous || !context || (previous[tier] ?? '') === model)
      return null;
    const next: TierMappings = { ...previous };
    if (model) next[tier] = model;
    else delete next[tier];
    const label = TIERS.find((row) => row.tier === tier)?.label ?? tier;
    // M8: the instance's last Test described the previous mapping; every tier write (and its Undo) drops it.
    const write = (tiers: TierMappings) => () => {
      this.state.clearCliTest(target.id);
      return this.state.setCliInstanceTiers(target.id, tiers, context);
    };
    const result = await this.feedback.save({
      label: `${target.name} ${label} tier`,
      scope: SAVE_SCOPE,
      write: write(next),
      undo: write(previous),
    });
    // `failed` means this save ran, so `commit()` is its own: a blocked context is replaced for the next try.
    if (result === 'failed' && this.state.commit().status === 'blocked')
      this.context = this.state.reviewContext();
    return result;
  }

  /** The swapped-in control takes focus once rendered, so focus (and Esc) stay in the dialog. */
  private focusAfterRender(selector: string): void {
    afterNextRender(
      () =>
        this.modal()
          ?.panel()
          ?.nativeElement.querySelector<HTMLElement>(selector)
          ?.focus(),
      { injector: this.injector },
    );
  }
}

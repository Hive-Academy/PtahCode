import { PtahFieldGridDirective } from '@ptah-extension/ui';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  ProvidersSettingsStateService,
  type ProvidersConnection,
  type ProvidersCustomEntry,
} from '@ptah-extension/core';
import {
  validateProviderBaseUrl,
  type AuthVerifyDraftConnectionParams,
  type AuthVerifyDraftConnectionResult,
} from '@ptah-extension/shared';
import type { CancelDraftFn, VerifyDraftFn } from './credentials-tab.component';
import { runDrawerWrite, type DrawerWriteOutcome } from './drawer-write';
import { SettingsBusyDisabledDirective } from '../../feedback/busy-disabled.directive';
import { SettingsSaveFeedbackService } from '../../feedback/settings-save-feedback.service';
import { commitToast } from '../../feedback/settings-commit-toast';
import {
  PtahButtonDirective,
  PtahFieldComponent,
  PtahInputDirective,
} from '@ptah-extension/ui';

/** Verbatim (plan :662-664): pricing has no runtime reader (`provider-registry.ts:703-718`). */
export const PRICING_NOTE =
  'Stored for your reference; Ptah does not use it for cost estimates yet.';

type Section = 'endpoint' | 'help' | 'pricing' | 'delete';
type ProbeState = 'idle' | 'checking' | 'verified' | 'failed';

const SAVED_TEXT: Readonly<Record<Section, string>> = {
  endpoint: 'Endpoint saved.',
  help: 'Help URL saved.',
  pricing: 'Pricing saved.',
  delete: 'Connection deleted.',
};

const PROBE_FAILURE_COPY: Readonly<Record<string, string>> = {
  'credential-rejected': 'The provider rejected the key.',
  'permission-denied':
    'This account cannot use the requested service or model.',
  unreachable: 'Could not reach this address.',
  timeout: 'The endpoint did not answer in time.',
  'rate-limited': 'The endpoint is rate-limiting requests. Retry in a moment.',
  'quota-exhausted': 'This account has no available quota for the check.',
  'model-unavailable': 'The model used for the check is not available here.',
  cancelled: 'Check cancelled.',
  'no-stored-credential':
    'No key is stored for this connection. Add one on the Credentials tab.',
  'stored-credential-mismatch':
    'The stored key can only be checked against the saved address. Enter the key to check the new one.',
  unclassified: 'The check failed. Retry.',
};

let PROBE_COUNTER = 0;

function probeResultText(result: AuthVerifyDraftConnectionResult): string {
  const latency =
    result.latencyMs !== null && result.latencyMs !== undefined
      ? ` (${result.latencyMs}ms)`
      : '';
  return result.outcome === 'verified'
    ? `Endpoint verified${latency}. Save it to apply.`
    : `Check failed${latency}: ${PROBE_FAILURE_COPY[result.reason ?? 'unclassified'] ?? PROBE_FAILURE_COPY['unclassified']} Nothing was saved.`;
}

/** Parses the two price fields: both empty clears the pricing; otherwise both must be numbers ≥ 0. */
export function parsePricing(
  input: string,
  output: string,
):
  | { readonly ok: true; readonly value: ProvidersCustomEntry['pricing'] }
  | { readonly ok: false } {
  const a = input.trim(),
    b = output.trim();
  if (!a && !b) return { ok: true, value: null };
  const inputPerMillion = Number(a),
    outputPerMillion = Number(b);
  if (
    !a ||
    !b ||
    !Number.isFinite(inputPerMillion) ||
    !Number.isFinite(outputPerMillion) ||
    inputPerMillion < 0 ||
    outputPerMillion < 0
  ) {
    return { ok: false };
  }
  return { ok: true, value: { inputPerMillion, outputPerMillion } };
}

/**
 * Drawer tab "Advanced" (custom connections only; plan :659-665, prototype drawer Tab 4, D7):
 * - base URL and models endpoint, saved only after a passing check (D7): a changed base URL is checked
 *   with a typed key (the host checks a stored key only against its saved address); a models endpoint
 *   alone is checked against the current address with the stored key;
 * - help URL (#28) and pricing (#30, with the verbatim note), saved directly;
 * - Delete connection (#25) with an inline confirm, refused for the main agent's driver.
 * Values render by interpolation and `[value]` only.
 */
@Component({
  selector: 'ptah-connection-advanced-tab',
  standalone: true,
  imports: [
    PtahFieldGridDirective,
    SettingsBusyDisabledDirective,
    PtahButtonDirective,
    PtahFieldComponent,
    PtahInputDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './advanced-tab.component.html',
})
export class AdvancedTabComponent {
  private readonly state = inject(ProvidersSettingsStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  readonly connection = input.required<ProvidersConnection>();
  /** This connection drives the main agent: it cannot be deleted. */
  readonly isDriver = input(false);
  readonly verifyDraftConnection = input.required<VerifyDraftFn>();
  readonly cancelDraftVerification = input.required<CancelDraftFn>();

  protected readonly pricingNote = PRICING_NOTE;
  protected readonly entry = computed(() =>
    this.state.customEntry(this.connection().id),
  );
  /** `null` = not edited: the field shows the stored value. */
  protected readonly baseUrlDraft = signal<string | null>(null);
  protected readonly modelsEndpointDraft = signal<string | null>(null);
  protected readonly helpUrlDraft = signal<string | null>(null);
  protected readonly inputPriceDraft = signal<string | null>(null);
  protected readonly outputPriceDraft = signal<string | null>(null);
  /** Typed only to check a changed base URL; never saved. Cleared on a saved endpoint, another connection and destroy. */
  protected readonly keyDraft = signal('');
  protected readonly confirmingDelete = signal(false);
  protected readonly probeState = signal<ProbeState>('idle');
  protected readonly probeResult =
    signal<AuthVerifyDraftConnectionResult | null>(null);
  private readonly outcome = signal<DrawerWriteOutcome | null>(null);
  private probeId: string | null = null;
  private readonly connectionId = computed(() => this.connection().id);

  protected readonly baseUrl = computed(
    () => this.baseUrlDraft() ?? this.entry()?.baseUrl ?? '',
  );
  protected readonly modelsEndpoint = computed(
    () => this.modelsEndpointDraft() ?? this.entry()?.modelsEndpoint ?? '',
  );
  protected readonly helpUrl = computed(
    () => this.helpUrlDraft() ?? this.entry()?.helpUrl ?? '',
  );
  protected readonly inputPrice = computed(
    () =>
      this.inputPriceDraft() ??
      String(this.entry()?.pricing?.inputPerMillion ?? ''),
  );
  protected readonly outputPrice = computed(
    () =>
      this.outputPriceDraft() ??
      String(this.entry()?.pricing?.outputPerMillion ?? ''),
  );
  protected readonly baseUrlChanged = computed(
    () => this.baseUrl().trim() !== (this.entry()?.baseUrl ?? ''),
  );
  private readonly modelsEndpointChanged = computed(
    () => this.modelsEndpoint().trim() !== (this.entry()?.modelsEndpoint ?? ''),
  );
  protected readonly baseUrlError = computed(() =>
    this.baseUrlChanged() && !validateProviderBaseUrl(this.baseUrl().trim()).ok
      ? 'Enter an http:// or https:// URL.'
      : null,
  );
  protected readonly helpUrlError = computed(() => {
    const url = this.helpUrl().trim();
    return url && !/^https?:\/\/\S+$/i.test(url)
      ? 'Enter an http:// or https:// URL, or leave it empty.'
      : null;
  });
  protected readonly pricing = computed(() =>
    parsePricing(this.inputPrice(), this.outputPrice()),
  );
  protected readonly pricingDirty = computed(
    () => this.inputPriceDraft() !== null || this.outputPriceDraft() !== null,
  );
  protected readonly busy = computed(
    () =>
      this.state.commit().status === 'saving' ||
      this.outcome()?.status === 'saving',
  );
  protected readonly canCheck = computed(
    () =>
      !this.busy() &&
      this.probeState() !== 'checking' &&
      !this.baseUrlError() &&
      (this.baseUrlChanged() || this.modelsEndpointChanged()) &&
      (!this.baseUrlChanged() || !!this.keyDraft().trim()),
  );
  protected readonly canSaveEndpoint = computed(
    () =>
      !this.busy() &&
      this.probeState() === 'verified' &&
      this.probeResult()?.probeId === this.probeId &&
      (this.baseUrlChanged() || this.modelsEndpointChanged()),
  );
  /** The check's state stays inline: a `verified` result is what enables Save endpoint. */
  protected readonly probeText = computed(() => {
    const result = this.probeResult();
    switch (this.probeState()) {
      case 'checking':
        return 'Checking the endpoint…';
      case 'idle':
        return 'A changed base URL or models endpoint is saved only after a passing check.';
      default:
        return result ? probeResultText(result) : '';
    }
  });
  protected readonly probeDot = computed(
    () =>
      `h-2 w-2 shrink-0 rounded-full ${this.probeState() === 'verified' ? 'bg-success' : this.probeState() === 'failed' ? 'bg-error' : 'bg-base-content-muted'}`,
  );

  constructor() {
    effect(() => {
      this.connectionId();
      untracked(() => this.resetAll());
    });
    inject(DestroyRef).onDestroy(() => {
      this.abandonProbe();
      this.keyDraft.set('');
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected check(): void {
    if (!this.canCheck()) return;
    const probeId = `advanced-probe-${(PROBE_COUNTER += 1)}`;
    this.probeId = probeId;
    this.probeState.set('checking');
    this.probeResult.set(null);
    const params: AuthVerifyDraftConnectionParams = {
      probeId,
      providerId: this.connection().id,
      authMode: 'custom',
      baseUrl: this.baseUrl().trim(),
      credential: this.baseUrlChanged()
        ? { kind: 'apiKey', value: this.keyDraft().trim() }
        : { kind: 'stored' },
    };
    void this.verifyDraftConnection()(params)
      .then((result) => {
        if (this.probeId !== probeId || result.probeId !== probeId) return;
        this.settleProbe(result);
      })
      .catch(() => {
        if (this.probeId !== probeId) return;
        this.settleProbe({
          probeId,
          outcome: 'failed',
          reason: 'unclassified',
          detail: null,
          latencyMs: null,
          modelUsed: null,
          checkedAt: new Date().toISOString(),
        });
      });
  }

  /** Records a check's result (it gates Save endpoint, so it stays inline) and also says it in the page toast. */
  private settleProbe(result: AuthVerifyDraftConnectionResult): void {
    this.probeResult.set(result);
    const verified = result.outcome === 'verified';
    this.probeState.set(verified ? 'verified' : 'failed');
    this.feedback.announce(
      probeResultText(result),
      verified ? 'status' : 'alert',
    );
  }

  protected saveEndpoint(): Promise<void> {
    const probeId = this.probeId;
    if (!this.canSaveEndpoint() || !probeId) return Promise.resolve();
    const id = this.connection().id;
    const changes: { baseUrl?: string; modelsEndpoint?: string | null } = {};
    if (this.baseUrlChanged()) changes.baseUrl = this.baseUrl().trim();
    if (this.modelsEndpointChanged())
      changes.modelsEndpoint = this.modelsEndpoint().trim() || null;
    return this.write(
      'endpoint',
      (context) =>
        this.state.updateCustomEntryEndpoint(id, changes, probeId, context),
      () => {
        this.baseUrlDraft.set(null);
        this.modelsEndpointDraft.set(null);
        this.keyDraft.set('');
        this.abandonProbe();
        // The Credentials tab checks a replacement key against the stored address it read on open.
        if (changes.baseUrl !== undefined)
          void this.state.refreshConnectionSetup(id);
      },
    );
  }

  protected saveHelpUrl(): Promise<void> {
    const id = this.connection().id,
      helpUrl = this.helpUrl().trim();
    return this.write(
      'help',
      (context) => this.state.updateCustomEntryFields(id, { helpUrl }, context),
      () => this.helpUrlDraft.set(null),
    );
  }

  protected savePricing(): Promise<void> {
    const parsed = this.pricing();
    if (!parsed.ok) return Promise.resolve();
    const id = this.connection().id;
    return this.write(
      'pricing',
      (context) =>
        this.state.updateCustomEntryFields(
          id,
          { pricing: parsed.value },
          context,
        ),
      () => {
        this.inputPriceDraft.set(null);
        this.outputPriceDraft.set(null);
      },
    );
  }

  protected deleteConnection(): Promise<void> {
    this.confirmingDelete.set(false);
    const id = this.connection().id;
    return this.write(
      'delete',
      (context) => this.state.removeCustomEntry(id, context),
      () => undefined,
    );
  }

  /**
   * One write at a time; its own outcome only (D15). A saved write drops that section's drafts. An
   * outcome that lands after another connection opened in this tab belongs to that earlier connection
   * and is dropped.
   */
  private async write(
    section: Section,
    run: Parameters<typeof runDrawerWrite>[1],
    onSaved: () => void,
  ): Promise<void> {
    if (this.busy()) return;
    const id = this.connectionId();
    await runDrawerWrite(this.state, run, (outcome) => {
      if (this.connectionId() !== id) return;
      this.outcome.set(outcome);
      if (outcome.status === 'saved') onSaved();
      // The outcome is the page toast; Save stays disabled while it runs, so "Saving…" is not repeated.
      const said = commitToast(outcome, SAVED_TEXT[section]);
      if (said) this.feedback.announce(said.message, said.tone);
    });
  }

  protected abandonProbe(): void {
    const probeId = this.probeId;
    if (probeId && this.probeState() === 'checking')
      void this.cancelDraftVerification()({ probeId }).catch(() => undefined);
    this.probeId = null;
    this.probeState.set('idle');
    this.probeResult.set(null);
  }

  private resetAll(): void {
    this.abandonProbe();
    for (const draft of [
      this.baseUrlDraft,
      this.modelsEndpointDraft,
      this.helpUrlDraft,
      this.inputPriceDraft,
      this.outputPriceDraft,
    ])
      draft.set(null);
    this.keyDraft.set('');
    this.confirmingDelete.set(false);
    this.outcome.set(null);
  }
}

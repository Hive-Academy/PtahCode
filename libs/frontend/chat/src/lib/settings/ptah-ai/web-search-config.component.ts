import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  signal,
  effect,
  afterNextRender,
  Injector,
  untracked,
} from '@angular/core';
import { ClaudeRpcService } from '@ptah-extension/core';
import {
  PtahBadgeDirective,
  PtahSettingRowComponent,
  PtahAlertComponent,
} from '@ptah-extension/ui';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import {
  SettingsSectionStateComponent,
  SettingsSectionReadyDirective,
} from '../shared/settings-section-state.component';
import { SettingsConnectionTestComponent } from '../shared/settings-connection-test.component';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { ProviderId, ProviderOption, ProviderTestResult, WebSearchProviderRowsComponent } from './web-search-provider-rows.component';

import { SearchVoiceSummaryStore } from './search-voice-summary.store';

type WriteResult = { ok: true } | { ok: false; message: string };

const PROVIDER_OPTIONS: readonly ProviderOption[] = [
  {
    value: 'tavily',
    label: 'Tavily',
    summary: 'AI-optimized search API with built-in answer generation.',
    freeTier: 'Free tier: 1,000 searches/month.',
    signupUrl: 'https://tavily.com',
  },
  {
    value: 'serper',
    label: 'Serper',
    summary: 'Google Search API. Fast, reliable results.',
    freeTier: 'Free tier: 2,500 searches/month.',
    signupUrl: 'https://serper.dev',
  },
  {
    value: 'exa',
    label: 'Exa',
    summary: 'AI-powered semantic search engine.',
    freeTier: 'Free tier: 1,000 searches/month.',
    signupUrl: 'https://exa.ai',
  },
] as const;

/** One fixed sentence per action (F1): no host or transport text reaches the alert, popover or toast. */
const LOAD_CONFIG_FAILED = 'Could not load the web search settings.';
const SAVE_PROVIDERS_FAILED = 'Could not save the web search providers.';
const SAVE_MAX_RESULTS_FAILED = 'Could not save the web search max results.';
/**
 * Used for the whole probe and for each failed provider row: the backend's per-provider `error` is a
 * raw `Error.message` (`web-search-rpc.handlers.ts:202-207`), not a fixed reason.
 */
const TEST_FAILED = 'The connection test failed.';

function asProviderIds(values: readonly string[]): ProviderId[] {
  return values.filter((value): value is ProviderId =>
    PROVIDER_OPTIONS.some((option) => option.value === value),
  );
}

function providerLabel(provider: ProviderId): string {
  return (
    PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ??
    provider
  );
}

/** Web search provider cards. Writes retain feedback, rollback and inline key confirmation. */
@Component({
  selector: 'ptah-web-search-config',
  standalone: true,
  imports: [
    SettingsBusyDisabledDirective,
    PtahBadgeDirective,
    PtahSettingRowComponent,
    PtahAlertComponent,
    SettingsConnectionTestComponent,
    SettingsSectionStateComponent,
    SettingsSectionReadyDirective,
    WebSearchProviderRowsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="border-b border-base-content/10 pb-7"
      data-glass-surface="content"
    >
      <header class="web-search-header">
        <h2 id="web-search-heading" tabindex="-1">Web search</h2>
          <ptah-settings-connection-test
            label="Test web search"
            [state]="
              isTesting()
                ? 'running'
                : testResult()
                  ? testResult()?.success
                    ? 'ok'
                    : 'fail'
                  : 'idle'
            "
            [message]="
              testResult()
                ? testResult()?.success
                  ? 'Connection works'
                  : TEST_FAILED
                : null
            "
            testId="settings-web-search-test"
            ariaLabel="Test web search connection"
            (test)="testSearch()"
          />
        <p class="text-sm text-base-content-muted">Agents search through the selected providers. Keys stay encrypted on this device.</p>
      </header>
        @if (
          errorMessage() === LOAD_CONFIG_FAILED ? null : errorMessage();
          as message
        ) {
          <ptah-alert
            tone="error"
            [compact]="true"
            role="alert"
            data-testid="settings-web-search-error"
          >
            {{ message }}
          </ptah-alert>
        }

        <ptah-settings-section-state
          [state]="
            configLoaded()
              ? 'ready'
              : errorMessage() === LOAD_CONFIG_FAILED
                ? 'error'
                : 'loading'
          "
          [errorText]="LOAD_CONFIG_FAILED"
          errorTestId="settings-web-search-error"
          (retry)="loadConfig()"
        >
          <ng-template ptahSectionReady>
             <ptah-web-search-provider-rows
               [options]="providerOptions"
               [selectedProviders]="selectedProviders()"
               [apiKeyConfigured]="apiKeyConfigured()"
               [activeKeyProvider]="activeKeyProvider()"
               [confirmingClear]="confirmingClear()"
               [testResults]="testResult()?.results ?? []"
               [saving]="saving()"
               [apiKeyInput]="apiKeyInput()"
               [keyVisible]="keyVisible()"
               (providerChange)="onProviderChange($event.provider, $event.event)"
               (openKeyEditor)="openKeyEditor($event)"
               (closeKeyEditor)="closeKeyEditor()"
               (apiKeyChanged)="onApiKeyInput($event)"
               (keyVisibilityToggle)="keyVisible.set(!keyVisible())"
               (saveApiKey)="saveApiKey()"
               (requestClear)="requestClear($event)"
               (deleteApiKey)="deleteApiKey($event)"
               (cancelClear)="cancelClear($event)"
             />

            <p class="text-xs text-base-content-muted mt-2">
              At least one provider must stay selected.
            </p>

            <ptah-setting-row
              label="Max results"
              hint="Results each provider returns for one search."
              controlId="web-search-max-results"
              density="compact"
            >
              <input
                id="web-search-max-results"
                type="range"
                min="1"
                max="20"
                [value]="maxResults()"
                [ptahBusyDisabled]="saving()"
                (change)="onMaxResultsChange($event)"
                class="max-results range range-xs range-primary min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                data-testid="settings-web-search-max-results"
              />
              <span
                ptahBadge
                appearance="outline"
                count
                class="text-base-content"
                aria-hidden="true"
                >{{ maxResults() }}</span
              >
              <span class="text-xs text-base-content-muted whitespace-nowrap"
                >per search</span
              >
            </ptah-setting-row>
          </ng-template>
        </ptah-settings-section-state>

    </section>
  `,
  styles: `
    .web-search-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--ptah-gap-label) var(--ptah-gap-controls); margin-bottom: var(--ptah-gap-heading); }
    .web-search-header h2 { font-size: var(--ptah-text-section-title-size); line-height: var(--ptah-text-section-title-leading); font-weight: var(--ptah-text-section-title-weight); }
    .web-search-header p { grid-column: 1 / -1; }
    .max-results { width: 16rem; max-width: 100%; }
    @media (max-width: 639px) { .max-results { width: 100%; } }

    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 1.25rem;
    }
  `,
})
export class WebSearchConfigComponent implements OnInit {
  private readonly rpcService = inject(ClaudeRpcService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly summary = inject(SearchVoiceSummaryStore, { optional: true });
  private readonly injector = inject(Injector);
  private readonly keysLoading = signal(true);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly TEST_FAILED = TEST_FAILED;
  readonly LOAD_CONFIG_FAILED = LOAD_CONFIG_FAILED;
  readonly providerOptions = PROVIDER_OPTIONS;

  /** Save triggers are disabled while any settings write is in flight (D3). */
  readonly saving = this.feedback.saving;

  readonly selectedProviders = signal<ReadonlySet<ProviderId>>(new Set());
  readonly apiKeyConfigured = signal<Record<ProviderId, boolean>>({
    tavily: false,
    serper: false,
    exa: false,
  });
  readonly activeKeyProvider = signal<ProviderId | null>(null);
  readonly apiKeyInput = signal('');
  readonly keyVisible = signal(false);
  readonly confirmingClear = signal<ProviderId | null>(null);
  readonly maxResults = signal(5);
  readonly isTesting = signal(false);
  readonly testResult = signal<{
    success: boolean;
    results: ProviderTestResult[];
  } | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly configLoaded = signal(false);

  constructor() {
    effect(() => {
      const selected = this.providerOptions.filter(opt => this.selectedProviders().has(opt.value));
      const ready = selected.filter(opt => this.apiKeyConfigured()[opt.value]).length;
      const missing = selected.find(opt => !this.apiKeyConfigured()[opt.value]);
      const failed = this.errorMessage() === LOAD_CONFIG_FAILED;
      const loading = !this.configLoaded() || this.keysLoading();
      untracked(() => this.summary?.report('web-search', failed
        ? { value: 'Error', tone: 'error' }
        : loading ? { value: 'Loading', tone: 'idle' }
        : { value: `${ready} of 3 ready`, meta: missing ? `${missing.label} needs a key` : 'All selected have keys', tone: ready === 0 ? 'error' : missing ? 'warn' : 'ok' }));
    });
  }

  isSelected(provider: ProviderId): boolean {
    return this.selectedProviders().has(provider);
  }

  resultFor(provider: ProviderId): ProviderTestResult | undefined {
    return this.testResult()?.results.find((r) => r.provider === provider);
  }

  async ngOnInit(): Promise<void> {
    await this.loadConfig();
  }

  /** Loads the provider selection, max results and every key status. */
  async loadConfig(): Promise<void> {
    this.errorMessage.set(null);
    this.keysLoading.set(true);

    try {
      const configResult = await this.rpcService.call(
        'webSearch:getConfig',
        {} as Record<string, never>,
      );
      if (configResult.isSuccess()) {
        this.selectedProviders.set(
          new Set(asProviderIds(configResult.data.providers)),
        );
        this.maxResults.set(configResult.data.maxResults);
        this.configLoaded.set(true);
      } else {
        this.configLoaded.set(false);
        this.errorMessage.set(LOAD_CONFIG_FAILED);
      }
    } catch {
      // A thrown transport error gets the same fixed sentence.
      this.configLoaded.set(false);
      this.errorMessage.set(LOAD_CONFIG_FAILED);
    }

    await this.loadApiKeyStatuses();
    this.keysLoading.set(false);
  }

  /** Reads the key status of every provider; an unreadable status shows as "No key". */
  async loadApiKeyStatuses(): Promise<void> {
    let statusReadFailed = false;
    const entries = await Promise.all(
      this.providerOptions.map(async (opt) => {
        try {
          const result = await this.rpcService.call(
            'webSearch:getApiKeyStatus',
            { provider: opt.value },
          );
          if (!result.isSuccess()) statusReadFailed = true;
          return [
            opt.value,
            result.isSuccess() && result.data.configured,
          ] as const;
        } catch {
          // degradation-audit: reported - one fixed alert covers all failed key-status reads.
          statusReadFailed = true;
          return [opt.value, false] as const;
        }
      }),
    );
    if (statusReadFailed)
      this.feedback.announce(
        'Could not read the web search key status.',
        'alert',
      );
    this.apiKeyConfigured.set(
      Object.fromEntries(entries) as Record<ProviderId, boolean>,
    );
  }

  /**
   * Checkbox change handler. The DOM checkbox has already flipped; once the save settles (or is
   * refused) it is set back to the saved selection so the control never shows an unsaved state.
   */
  async onProviderChange(provider: ProviderId, event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    await this.toggleProvider(provider);
    checkbox.checked = this.isSelected(provider);
  }

  /** Saves the selection with one provider added or removed. Refuses to leave none selected. */
  async toggleProvider(provider: ProviderId): Promise<void> {
    if (!this.configLoaded()) {
      this.errorMessage.set(
        'Configuration failed to load. Reload the panel before changing providers.',
      );
      return;
    }

    const previous = this.selectedProviders();
    const next = new Set(previous);
    if (next.has(provider)) {
      if (next.size === 1) {
        this.errorMessage.set('At least one provider must stay selected.');
        return;
      }
      next.delete(provider);
    } else {
      next.add(provider);
    }

    this.errorMessage.set(null);
    await this.feedback.saveGeneric({
      label: 'web search providers',
      write: () => this.writeProviders(next, previous),
      undo: () => this.writeProviders(previous, next),
    });
  }

  openKeyEditor(provider: ProviderId): void {
    this.activeKeyProvider.set(provider);
    this.apiKeyInput.set('');
    this.keyVisible.set(false);
    this.confirmingClear.set(null);
  }

  /** Cancel, Escape and successful save drop the typed key and restore trigger focus. */
  closeKeyEditor(): void {
    const provider = this.activeKeyProvider();
    this.activeKeyProvider.set(null);
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLButtonElement>(`[data-testid="settings-web-search-key-btn-${provider}"]`)?.focus();
    }, { injector: this.injector });
    this.apiKeyInput.set('');
    this.keyVisible.set(false);
  }

  onApiKeyInput(event: Event): void {
    this.apiKeyInput.set((event.target as HTMLInputElement).value);
  }

  /** Saves the inline key (S-explicit, no Undo). The editor closes only on success. */
  async saveApiKey(): Promise<void> {
    const provider = this.activeKeyProvider();
    const apiKey = this.apiKeyInput().trim();
    if (!provider || !apiKey || this.saving()) return;

    await this.feedback.saveGeneric({
      label: `${providerLabel(provider)} API key`,
      write: async () => {
        const result = await this.writeKey(provider, apiKey);
        if (result.ok) {
          this.apiKeyConfigured.update((prev) => ({
            ...prev,
            [provider]: true,
          }));
          this.testResult.set(null);
          this.closeKeyEditor();
        }
        return result;
      },
      undo: null,
    });
  }

  /** Opens the row's inline Clear confirm; a failure from an earlier attempt is dropped. */
  requestClear(provider: ProviderId): void {
    this.confirmingClear.set(provider);
  }

  /**
   * Cancel and Esc close the confirm and return focus to the row's Clear button (P8). Esc stops here
   * only when it closed the confirm, so an enclosing overlay does not also close.
   */
  cancelClear(provider: ProviderId, event?: Event): void {
    if (this.confirmingClear() !== provider) return;
    event?.stopPropagation();
    this.confirmingClear.set(null);
    this.host.nativeElement
      .querySelector<HTMLButtonElement>(
        `[data-testid="settings-web-search-clear-btn-${provider}"]`,
      )
      ?.focus();
  }

  /** Clears a provider's key after the inline confirm (S-confirm, no Undo). */
  async deleteApiKey(provider: ProviderId): Promise<void> {
    this.errorMessage.set(null);

    await this.feedback.saveGeneric({
      label: `removal of the ${providerLabel(provider)} API key`,
      write: async () => {
        const result = await this.removeKey(provider);
        if (result.ok) {
          this.confirmingClear.set(null);
          this.apiKeyConfigured.update((prev) => ({
            ...prev,
            [provider]: false,
          }));
          this.testResult.set(null);
        }
        // FM-5: a failed Clear keeps the confirm open; the toast names the failure.
        return result;
      },
      undo: null,
    });
  }

  /** Probes every stored key and shows the outcome in each row's Status cell (a probe, not a write). */
  async testSearch(): Promise<void> {
    this.isTesting.set(true);
    this.testResult.set(null);
    this.errorMessage.set(null);

    try {
      const result = await this.rpcService.call(
        'webSearch:test',
        {} as Record<string, never>,
      );
      if (result.isSuccess()) {
        this.testResult.set({
          success: result.data.success,
          results: result.data.results,
        });
      } else {
        this.feedback.announce(TEST_FAILED, 'alert');
      }
    } catch {
      // degradation-audit: reported - a thrown transport error gets the same fixed alert toast.
      this.feedback.announce(TEST_FAILED, 'alert');
    } finally {
      this.isTesting.set(false);
    }
  }

  /** Saves max results on release (`change`). The slider is set back to the saved value afterwards. */
  async onMaxResultsChange(event: Event): Promise<void> {
    const slider = event.target as HTMLInputElement;
    const value = slider.valueAsNumber;
    const previous = this.maxResults();
    if (value !== previous) {
      this.errorMessage.set(null);
      await this.feedback.saveGeneric({
        label: 'web search max results',
        write: () => this.writeMaxResults(value, previous),
        undo: () => this.writeMaxResults(previous, value),
      });
    }
    slider.value = String(this.maxResults());
  }

  /** Shows `next` while it saves; puts `fallback` back when the write fails (D15). */
  private async writeProviders(
    next: ReadonlySet<ProviderId>,
    fallback: ReadonlySet<ProviderId>,
  ): Promise<WriteResult> {
    this.selectedProviders.set(next);
    this.testResult.set(null);
    const result = await this.saveConfig(
      { providers: Array.from(next) },
      SAVE_PROVIDERS_FAILED,
    );
    if (!result.ok) this.selectedProviders.set(fallback);
    return result;
  }

  private async writeMaxResults(
    next: number,
    fallback: number,
  ): Promise<WriteResult> {
    this.maxResults.set(next);
    const result = await this.saveConfig(
      { maxResults: next },
      SAVE_MAX_RESULTS_FAILED,
    );
    if (!result.ok) this.maxResults.set(fallback);
    return result;
  }

  private async writeKey(
    provider: ProviderId,
    apiKey: string,
  ): Promise<WriteResult> {
    const failed: WriteResult = {
      ok: false,
      message: `Could not save the ${providerLabel(provider)} API key.`,
    };
    try {
      const result = await this.rpcService.call('webSearch:setApiKey', {
        provider,
        apiKey,
      });
      return result.isSuccess() && result.data.success ? { ok: true } : failed;
    } catch {
      return failed;
    }
  }

  private async removeKey(provider: ProviderId): Promise<WriteResult> {
    const failed: WriteResult = {
      ok: false,
      message: `Could not clear the ${providerLabel(provider)} API key.`,
    };
    try {
      const result = await this.rpcService.call('webSearch:deleteApiKey', {
        provider,
      });
      return result.isSuccess() && result.data.success ? { ok: true } : failed;
    } catch {
      return failed;
    }
  }

  /** `webSearch:setConfig`; a failure returns `failedMessage` for the toast (V8). */
  private async saveConfig(
    params: { providers?: string[]; maxResults?: number },
    failedMessage: string,
  ): Promise<WriteResult> {
    this.errorMessage.set(null);
    try {
      const result = await this.rpcService.call('webSearch:setConfig', params);
      if (result.isSuccess() && result.data.success) return { ok: true };
    } catch {
      // A thrown transport error is reported like a refused write.
    }
    return { ok: false, message: failedMessage };
  }
}

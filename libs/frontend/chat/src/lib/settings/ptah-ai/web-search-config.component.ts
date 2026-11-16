import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Eye, EyeOff, Globe, Key, LucideAngularModule } from 'lucide-angular';
import { ClaudeRpcService } from '@ptah-extension/core';
import {
  NativePopoverComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahCheckboxDirective,
  PtahInputDirective,
  PtahFieldComponent,
  PtahFormSectionComponent,
  PtahStatusComponent,
  PtahInlineConfirmComponent,
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

type ProviderId = 'tavily' | 'serper' | 'exa';
type WriteResult = { ok: true } | { ok: false; message: string };

interface ProviderOption {
  value: ProviderId;
  label: string;
  /** What the provider is; shown in the row's tooltip and to screen readers, not as a visible line. */
  summary: string;
  /** The one visible line under the name (pattern map §3.2: a row stays within ~48 px). */
  freeTier: string;
  signupUrl: string;
}

interface ProviderTestResult {
  provider: string;
  success: boolean;
  error?: string;
}

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

/**
 * Web search card on the Search & Voice tab (pattern map V1-V8).
 *
 * A `table-xs` matrix with one row per provider (Tavily, Serper, Exa): an "On" checkbox, the
 * provider and its free-tier line, the key badge, the last test result and the key actions. Max
 * results sits in a policy bar under the matrix. Every write goes through
 * {@link SettingsSaveFeedbackService.saveGeneric}: "Saved" only after the write's own result, a
 * failed write reverts the control and raises an alert toast (D15). Keys are entered in a popover
 * and never rendered; Clear asks for an inline confirm and has no Undo. Testing probes the stored
 * keys only, so a key is saved first and tested after (G11).
 */
@Component({
  selector: 'ptah-web-search-config',
  standalone: true,
  imports: [
    SettingsBusyDisabledDirective,
    LucideAngularModule,
    NativePopoverComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahCheckboxDirective,
    PtahInputDirective,
    PtahFieldComponent,
    PtahFormSectionComponent,
    PtahStatusComponent,
    PtahInlineConfirmComponent,
    PtahSettingRowComponent,
    PtahAlertComponent,
    SettingsConnectionTestComponent,
    SettingsSectionStateComponent,
    SettingsSectionReadyDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="border-b border-base-content/10 pb-7"
      data-glass-surface="content"
    >
      <ptah-form-section
        id="web-search-heading"
        heading="Web Search"
        level="2"
        description="Enable web search for AI agents via the ptah_web_search MCP tool. Select one or more providers to run in parallel."
      >
        <div aside>
          <ptah-settings-connection-test
            label="Test connection"
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
        </div>
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
            <div
              class="flex flex-col gap-[var(--ptah-gap-field)]"
              role="list"
              aria-label="Web search providers"
            >
              @for (opt of providerOptions; track opt.value) {
                <div
                  role="listitem"
                  class="border-b border-base-content/10 py-[var(--ptah-gap-field)]"
                >
                  <div
                    class="flex flex-nowrap items-center gap-[var(--ptah-gap-controls)]"
                  >
                    <input
                      type="checkbox"
                      ptahCheckbox
                      size="xs"
                      [checked]="isSelected(opt.value)"
                      [ptahBusyDisabled]="saving()"
                      (change)="onProviderChange(opt.value, $event)"
                      [attr.data-testid]="
                        'settings-toggle-web-search-provider-' + opt.value
                      "
                      [attr.aria-label]="'Use ' + opt.label + ' for web search'"
                    />
                    <lucide-angular
                      [img]="GlobeIcon"
                      class="w-4 h-4 text-secondary"
                      aria-hidden="true"
                    />
                    <div
                      class="min-w-0 flex-1"
                      [attr.title]="opt.summary + ' ' + opt.freeTier"
                    >
                      <div class="font-bold text-base-content">
                        {{ opt.label
                        }}<span class="sr-only">: {{ opt.summary }}</span>
                      </div>
                      <p class="text-xs text-base-content-muted">
                        {{ opt.freeTier }}
                        <a
                          [href]="opt.signupUrl"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="link underline text-base-content"
                          [attr.data-testid]="
                            'settings-web-search-signup-' + opt.value
                          "
                          >Get API key</a
                        >
                      </p>
                    </div>
                    <span
                      [attr.data-testid]="
                        'settings-web-search-key-status-' + opt.value
                      "
                    >
                      <ptah-status
                        [status]="
                          apiKeyConfigured()[opt.value] ? 'online' : 'offline'
                        "
                        [label]="
                          apiKeyConfigured()[opt.value] ? 'Key set' : 'No key'
                        "
                      />
                    </span>
                    <span
                      [attr.data-testid]="
                        'settings-web-search-status-' + opt.value
                      "
                    >
                      @if (resultFor(opt.value); as r) {
                        <ptah-status
                          [status]="r.success ? 'online' : 'failed'"
                          [label]="r.success ? 'Works' : TEST_FAILED"
                        />
                      } @else {
                        <span class="sr-only">Not tested</span>
                      }
                    </span>
                    <div
                      class="flex shrink-0 flex-nowrap items-center gap-[var(--ptah-gap-controls)]"
                    >
                      <ptah-native-popover
                        [isOpen]="activeKeyProvider() === opt.value"
                        (closed)="closeKeyEditor()"
                      >
                        <button
                          type="button"
                          trigger
                          ptahButton
                          size="xs"
                          (click)="openKeyEditor(opt.value)"
                          [attr.aria-label]="
                            (apiKeyConfigured()[opt.value] ? 'Update' : 'Set') +
                            ' API key for ' +
                            opt.label
                          "
                          [attr.data-testid]="
                            'settings-web-search-key-btn-' + opt.value
                          "
                        >
                          <lucide-angular
                            [img]="KeyIcon"
                            class="w-3 h-3"
                            aria-hidden="true"
                          />
                          {{
                            apiKeyConfigured()[opt.value]
                              ? 'Update key'
                              : 'Set key'
                          }}
                        </button>
                        <div content class="p-3 w-72 space-y-2 text-left">
                          <ptah-field
                            [label]="'API key for ' + opt.label"
                            [appearance]="
                              apiKeyConfigured()[opt.value]
                                ? 'stacked'
                                : 'floating'
                            "
                            size="sm"
                            hint="Stored encrypted on this machine. Use Test connection after saving to check it."
                          >
                            <input
                              [id]="'web-search-api-key-' + opt.value"
                              [type]="keyVisible() ? 'text' : 'password'"
                              ptahInput
                              size="sm"
                              tone="mono"
                              class="w-full pr-9 text-xs"
                              placeholder="Paste the API key"
                              autocomplete="off"
                              spellcheck="false"
                              [value]="apiKeyInput()"
                              (input)="onApiKeyInput($event)"
                              (keydown.enter)="saveApiKey()"
                              data-testid="settings-web-search-key-input"
                            />
                            <span ptahFieldTrailing>
                              <button
                                type="button"
                                ptahIconButton
                                size="xs"
                                (click)="keyVisible.set(!keyVisible())"
                                [label]="
                                  keyVisible() ? 'Hide API key' : 'Show API key'
                                "
                                [attr.aria-pressed]="keyVisible()"
                                data-testid="settings-web-search-key-visibility"
                              >
                                <lucide-angular
                                  [img]="keyVisible() ? EyeOffIcon : EyeIcon"
                                  class="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              </button>
                            </span>
                          </ptah-field>
                          <a
                            [href]="opt.signupUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="link block underline text-base-content text-xs"
                            >Get a key</a
                          >
                          <div class="flex gap-2">
                            <button
                              type="button"
                              ptahButton
                              variant="primary"
                              [busy]="saving()"
                              [disabled]="!apiKeyInput().trim()"
                              (click)="saveApiKey()"
                              [attr.aria-label]="
                                'Save API key for ' + opt.label
                              "
                              data-testid="settings-web-search-key-save"
                            >
                              Save key
                            </button>
                            <button
                              type="button"
                              ptahButton
                              variant="ghost"
                              (click)="closeKeyEditor()"
                              data-testid="settings-web-search-key-cancel"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </ptah-native-popover>
                      @if (apiKeyConfigured()[opt.value]) {
                        <button
                          type="button"
                          ptahButton
                          size="xs"
                          [disabled]="saving()"
                          (click)="requestClear(opt.value)"
                          [attr.aria-label]="'Clear API key for ' + opt.label"
                          [attr.aria-expanded]="confirmingClear() === opt.value"
                          [attr.data-testid]="
                            'settings-web-search-clear-btn-' + opt.value
                          "
                        >
                          Clear
                        </button>
                      }
                    </div>
                  </div>
                  @if (
                    apiKeyConfigured()[opt.value] &&
                    confirmingClear() === opt.value
                  ) {
                    <ptah-inline-confirm
                      [message]="
                        'Clear the stored ' +
                        opt.label +
                        ' key from this machine?'
                      "
                      [detail]="
                        'Searches through ' +
                        opt.label +
                        ' stop until a key is added.'
                      "
                      [ariaLabel]="'Confirm clear ' + opt.label + ' API key'"
                      confirmLabel="Clear key"
                      tone="danger"
                      [busy]="saving()"
                      [confirmTestId]="
                        'settings-web-search-clear-confirm-' + opt.value
                      "
                      [cancelTestId]="
                        'settings-web-search-clear-cancel-' + opt.value
                      "
                      [attr.data-testid]="
                        'settings-web-search-clear-group-' + opt.value
                      "
                      (confirm)="deleteApiKey(opt.value)"
                      (cancelled)="cancelClear(opt.value)"
                    />
                  }
                </div>
              }
            </div>

            <p class="text-xs text-base-content-muted mt-2">
              At least one provider must stay selected.
            </p>

            <ptah-setting-row
              label="Max results"
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
                class="range range-xs range-primary w-40 max-w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                data-testid="settings-web-search-max-results"
              />
              <span
                ptahBadge
                appearance="outline"
                count
                class="font-mono text-base-content"
                aria-hidden="true"
                >{{ maxResults() }}</span
              >
              <span class="text-xs text-base-content-muted whitespace-nowrap"
                >per search</span
              >
            </ptah-setting-row>
          </ng-template>
        </ptah-settings-section-state>
      </ptah-form-section>
    </section>
  `,
  styles: `
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 1.25rem;
    }
  `,
})
export class WebSearchConfigComponent implements OnInit {
  private readonly rpcService = inject(ClaudeRpcService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly GlobeIcon = Globe;
  readonly TEST_FAILED = TEST_FAILED;
  readonly LOAD_CONFIG_FAILED = LOAD_CONFIG_FAILED;
  readonly KeyIcon = Key;
  readonly EyeIcon = Eye;
  readonly EyeOffIcon = EyeOff;
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

  /** Every dismissal route (Cancel, Esc, backdrop, successful save) drops the typed key. */
  closeKeyEditor(): void {
    this.activeKeyProvider.set(null);
    this.apiKeyInput.set('');
    this.keyVisible.set(false);
  }

  onApiKeyInput(event: Event): void {
    this.apiKeyInput.set((event.target as HTMLInputElement).value);
  }

  /** Saves the key typed in the open popover (S-explicit, no Undo). The popover closes only on success. */
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

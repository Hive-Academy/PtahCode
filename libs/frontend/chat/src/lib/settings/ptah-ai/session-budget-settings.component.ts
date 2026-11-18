import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LoggingService, VSCodeService, rpcCall } from '@ptah-extension/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  PtahFieldGridDirective,
  PtahFieldComponent,
  PtahFormSectionComponent,
  PtahSettingRowComponent,
  PtahButtonDirective,
  PtahToggleDirective,
  PtahRichSelectComponent,
  PtahInputDirective,
} from '@ptah-extension/ui';
import {
  SESSION_BUDGET_SETTINGS,
  isSessionBudgetPercentOrderValid,
  type SessionBudgetConfig,
  type SessionBudgetNumberSetting,
  type SessionBudgetUnit,
  type SessionBudgetTokenMeasure,
} from '@ptah-extension/shared';
import { SessionBudgetMeasureAdviceComponent } from './session-budget-measure-advice.component';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';

type BudgetKey = keyof SessionBudgetConfig;
type NumberKey =
  | 'tokens'
  | 'usd'
  | 'fallbackWeightedTokens'
  | 'tightenPercent'
  | 'handoffPercent'
  | 'handoffAfterCompactions'
  | 'tightenWindowTokens';
type BooleanKey = 'enabled' | 'autoHandoffAtLimit';

type Parsed =
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly error: string };

const BUDGET_KEYS = Object.keys(SESSION_BUDGET_SETTINGS) as BudgetKey[];
const NUMBER_FORMAT = new Intl.NumberFormat('en-US');
/** A missing host response must reveal Retry instead of leaving the settings card busy. */
const SETTINGS_READ_TIMEOUT_MS = 5_000;
/** A missing write response must free the card (busy) and say the save is unconfirmed. */
const SETTINGS_WRITE_TIMEOUT_MS = 5_000;
/** The prefix `rpcCall` puts on the error of a request that got no response in time. */
const RPC_TIMEOUT_PREFIX = 'RPC timeout';
/** A read-back value that can be written back (Undo); anything else offers no Undo. */
function isBudgetValue(
  value: unknown,
): value is
  number | null | boolean | SessionBudgetUnit | SessionBudgetTokenMeasure {
  return (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === 'tokens' ||
    value === 'cost' ||
    value === 'weighted' ||
    value === 'raw'
  );
}

const UNIT_LABELS: Readonly<Record<SessionBudgetUnit, string>> = {
  tokens: 'Tokens',
  cost: 'Cost (USD)',
};
const TOKEN_MEASURE_LABELS: Readonly<
  Record<SessionBudgetTokenMeasure, string>
> = {
  weighted: 'Weighted session tokens',
  raw: 'Raw session tokens',
};

interface NumberField {
  readonly key: NumberKey;
  readonly label: string;
  readonly help: string;
}

const NUMBER_FIELDS: readonly NumberField[] = [
  {
    key: 'tokens',
    label: 'Token budget',
    help: 'Chat token limit.',
  },
  {
    key: 'usd',
    label: 'Cost budget (USD)',
    help: 'Session cost limit.',
  },
  {
    key: 'fallbackWeightedTokens',
    label: 'Fallback weighted tokens',
    help: 'Used when model pricing is unavailable.',
  },
  {
    key: 'tightenPercent',
    label: 'Tighten at (%)',
    help: 'Starts tightening; stays below Handoff.',
  },
  {
    key: 'handoffPercent',
    label: 'Handoff at (%)',
    help: 'Offers to wrap up and hand off to a new session.',
  },
  {
    key: 'handoffAfterCompactions',
    label: 'Handoff after compactions',
    help: 'Handoff after repeated compactions leave context at least half full.',
  },
  {
    key: 'tightenWindowTokens',
    label: 'Tighten auto-compact window (tokens)',
    help: 'Advisory only until set; then lowers the compact window.',
  },
];

const BOOLEAN_LABELS: Readonly<Record<BooleanKey, string>> = {
  enabled: 'Track a budget for each chat session',
  autoHandoffAtLimit: 'Hand off automatically at 100%',
};

const BOOLEAN_HELP: Readonly<Record<BooleanKey, string>> = {
  enabled: 'Enable this limit for the current chat.',
  autoHandoffAtLimit:
    'Hand off once per session after the current turn; cancel from the banner.',
};

const LABELS: Readonly<Record<BudgetKey, string>> = {
  ...BOOLEAN_LABELS,
  unit: 'Budget unit',
  tokenMeasure: 'Token measure',
  ...(Object.fromEntries(
    NUMBER_FIELDS.map((field) => [field.key, field.label]),
  ) as Record<NumberKey, string>),
};

/** Bound check against the shared table (`SESSION_BUDGET_SETTINGS`); the cross-field rule is applied by the card. */
function parseNumber(setting: SessionBudgetNumberSetting, raw: string): Parsed {
  const text = raw.trim().replace(/[,_\s]/g, '');
  if (text === '') {
    return setting.nullable
      ? { ok: true, value: null }
      : { ok: false, error: 'Enter a value.' };
  }
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return { ok: false, error: 'Enter a number.' };
  }
  const value = Number(text);
  if (setting.integer && !Number.isInteger(value)) {
    return { ok: false, error: 'Enter a whole number.' };
  }
  if (value < setting.min || value > setting.max) {
    return {
      ok: false,
      error: `Enter a value from ${NUMBER_FORMAT.format(setting.min)} to ${NUMBER_FORMAT.format(setting.max)}.`,
    };
  }
  return { ok: true, value };
}

/** A read-back value as the backend reader takes it: a stored value that breaks the bounds reads as the default. */
function storedNumberIsValid(
  setting: SessionBudgetNumberSetting,
  value: unknown,
): boolean {
  if (value === null) return setting.nullable;
  return (
    typeof value === 'number' && parseNumber(setting, String(value)).ok === true
  );
}

/**
 * Session budget (`sessionBudget.*`, TASK_2026_597 N7). Reads and writes each key through `settings:get` / `settings:set`
 * (file-based, `~/.ptah/settings.json`), validating inline against `SESSION_BUDGET_SETTINGS` and the shared
 * tighten < handoff rule. An invalid value is never written. Toggles and the unit select show only the read-back
 * value; a number field keeps what the user typed until it is saved.
 */
@Component({
  selector: 'ptah-session-budget-settings',
  standalone: true,
  imports: [
    SessionBudgetMeasureAdviceComponent,
    SettingsBusyDisabledDirective,
    PtahFieldGridDirective,
    PtahFieldComponent,
    PtahFormSectionComponent,
    PtahSettingRowComponent,
    PtahButtonDirective,
    PtahToggleDirective,
    PtahRichSelectComponent,
    PtahInputDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <ptah-form-section wide
        heading="Session budget"
        description="Set per-chat limits and when Ptah should intervene."
        data-glass-surface="content"
        data-testid="settings-section-session-budget"
      >
        @switch (load()) {
          @case ('loading') {
            <p
              role="status"
              aria-live="polite"
              data-testid="session-budget-loading"
            >
              Loading session budget…
            </p>
          }
          @case ('error') {
            <div role="alert">
              <p data-testid="session-budget-load-error">
                The session budget settings could not be read. Your saved
                settings have not changed.
              </p>
              <button
                type="button"
                ptahButton
                (click)="reload()"
                data-testid="session-budget-retry"
              >
                Retry session budget
              </button>
            </div>
          }
          @default {
            @for (key of booleanKeys; track key) {
              <ptah-setting-row
                [label]="labels[key]"
                [hint]="booleanHelp[key]"
                [controlId]="'session-budget-' + key"
              >
                  <input
                    type="checkbox"
                    ptahToggle
                    size="sm"
                    [id]="'session-budget-' + key"
                    [checked]="booleanValue(key)"
                    [ptahBusyDisabled]="busy()"
                    (change)="toggle(key, $event)"
                    [attr.aria-describedby]="'session-budget-' + key + '-hint'"
                    [attr.data-testid]="'session-budget-' + key"
                  />
              </ptah-setting-row>
            }

            <div class="session-budget-fields">
              <div ptahFieldGrid minColumn="md">
                <ptah-field label="Budget unit" hint="Tokens use chat usage; Cost uses priced models.">
                  <ptah-select #unitSelect
                    triggerId="session-budget-unit"
                    label="Budget unit"
                    [options]="unitOptions" [value]="unitValue()" [disabled]="busy()"
                    aria-describedby="session-budget-unit-help"
                    (valueChange)="unitSelect.value.set(unitValue()); selectUnit($event)"
                    data-testid="session-budget-unit"
                  />
                  <p ptahFieldAfterError
                    id="session-budget-unit-help"
                    class="sr-only"
                  >
                    Tokens use chat usage; Cost uses priced models.
                  </p>
                  @if (errors()['unit']; as message) {
                    <p ptahFieldAfterError class="px-[var(--ptah-field-pad-x)] text-xs text-error" data-testid="session-budget-unit-error">{{ message }}</p>
                  }
                </ptah-field>

                <ptah-field label="Token measure" hint="Weighted discounts cache reads; raw counts all tokens.">
                  <ptah-select #measureSelect
                    triggerId="session-budget-token-measure"
                    label="Token measure"
                    [options]="tokenMeasureOptions" [value]="tokenMeasureValue()" [disabled]="busy()"
                    aria-describedby="session-budget-token-measure-help session-budget-token-measure-resolved"
                    (valueChange)="measureSelect.value.set(tokenMeasureValue()); selectTokenMeasure($event)"
                    data-testid="session-budget-token-measure"
                  />
                  <p ptahFieldAfterError
                    id="session-budget-token-measure-help"
                    class="sr-only"
                  >
                    Weighted discounts cache reads; raw counts all tokens.
                  </p>
                  <p ptahFieldAfterError
                    id="session-budget-token-measure-resolved"
                    class="sr-only"
                    data-testid="session-budget-token-measure-resolved"
                  >
                    Current measure:
                    {{ tokenMeasureLabels[tokenMeasureValue()] }}.
                  </p>
                  @if (errors()['tokenMeasure']; as message) {
                    <p ptahFieldAfterError role="alert" class="px-[var(--ptah-field-pad-x)] text-xs text-error">{{ message }}</p>
                  }
                </ptah-field>

                @if (tokenMeasureValue() === 'raw' && !recommendationDismissed()) {
                  <ptah-session-budget-measure-advice class="col-span-full"
                    [busy]="busy()" (switchMeasure)="selectWeighted()"
                    (dismissAdvice)="dismissRecommendation()" />
                }
                @for (field of numberFields; track field.key) {
                  <ptah-field
                    class="w-full min-w-0"
                    [label]="field.label"
                    [hint]="field.help + ' Range: ' + range(field.key) + '.'"
                    [error]="errors()[field.key] ?? null"
                    [errorTestId]="'session-budget-' + field.key + '-error'"
                  >
                    <input
                      ptahInput
                      size="sm"
                      type="text"
                      [id]="'session-budget-' + field.key"
                      [attr.inputmode]="
                        settings[field.key].integer ? 'numeric' : 'decimal'
                      "
                      class="join-item min-w-0 flex-1 tabular-nums"
                      [invalid]="!!errors()[field.key]"
                      [value]="numberText(field.key)"
                      [attr.aria-describedby]="
                        storedNotice(field.key)
                          ? 'session-budget-' + field.key + '-stored'
                          : null
                      "
                      [ptahBusyDisabled]="busy()"
                      (input)="edit(field.key, $event)"
                      (change)="commit(field.key)"
                      (focus)="focusedKey = field.key"
                      (blur)="blurred(field.key)"
                      [attr.data-testid]="'session-budget-' + field.key"
                    />
                    <span ptahFieldTrailing aria-hidden="true">{{
                      unitSuffix(field.key)
                    }}</span>
                    @if (errors()[field.key]) {
                      <span
                        ptahFieldBeforeHint
                        class="text-xs text-base-content-muted"
                        >{{ field.help }} Range: {{ range(field.key) }}.</span
                      >
                    }
                    @if (storedNotice(field.key); as notice) {
                      <p
                        ptahFieldAfterError
                        [id]="'session-budget-' + field.key + '-stored'"
                        class="rounded-md border border-info/30 bg-info/10 px-2 py-1"
                        [attr.data-testid]="
                          'session-budget-' + field.key + '-stored'
                        "
                      >
                        {{ notice }}
                      </p>
                    }
                  </ptah-field>
                }
              </div>
            </div>
          }
        }
      </ptah-form-section>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .session-budget-fields {
      container-type: inline-size;
      min-width: 0;
    }
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 1.25rem;
    }
  `,
})
export class SessionBudgetSettingsComponent implements OnInit {
  protected readonly unitOptions = Object.entries(UNIT_LABELS).map(([value, label]) => ({ value: value as SessionBudgetUnit, label }));
  protected readonly tokenMeasureOptions = Object.entries(TOKEN_MEASURE_LABELS).map(([value, label]) => ({ value: value as SessionBudgetTokenMeasure, label }));
  private readonly vscode = inject(VSCodeService);
  private readonly logger = inject(LoggingService);
  private readonly tabManager = inject(TabManagerService);
  private readonly feedback = inject(SettingsSaveFeedbackService);

  protected readonly settings = SESSION_BUDGET_SETTINGS;
  protected readonly labels = LABELS;
  protected readonly numberFields = NUMBER_FIELDS;
  protected readonly booleanKeys: readonly BooleanKey[] = [
    'enabled',
    'autoHandoffAtLimit',
  ];
  protected readonly booleanHelp = BOOLEAN_HELP;
  protected readonly units = SESSION_BUDGET_SETTINGS.unit.values;
  protected readonly tokenMeasures =
    SESSION_BUDGET_SETTINGS.tokenMeasure.values;
  protected readonly tokenMeasureLabels = TOKEN_MEASURE_LABELS;
  private readonly recommendationDismissed = signal(false);

  protected readonly load = signal<'loading' | 'error' | 'ready'>('loading');
  /** Read-back values by field, as stored (possibly out of bounds when the file was edited by hand). */
  private readonly saved = signal<Partial<Record<BudgetKey, unknown>>>({});
  /** What the user typed into a number field and has not saved yet. */
  private readonly drafts = signal<Partial<Record<NumberKey, string>>>({});
  protected readonly errors = signal<Partial<Record<BudgetKey, string>>>({});
  /** The field whose write is in flight; every control is busy meanwhile (the percent pair depends on each other). */
  private readonly savingKey = signal<BudgetKey | null>(null);
  protected readonly busy = computed(
    () => this.savingKey() !== null || this.feedback.saving(),
  );
  /** The number field that has focus: its draft is still being typed, so a partner save must not commit it. */
  protected focusedKey: NumberKey | null = null;

  protected readonly unitValue = computed<SessionBudgetUnit>(() => {
    const value = this.saved()['unit'];
    return (
      this.units.find((unit) => unit === value) ?? this.settings.unit.default
    );
  });
  protected readonly tokenMeasureValue = computed<SessionBudgetTokenMeasure>(
    () => {
      const value = this.saved()['tokenMeasure'];
      return (
        this.tokenMeasures.find((measure) => measure === value) ??
        this.settings.tokenMeasure.default
      );
    },
  );

  ngOnInit(): void {
    void this.reload();
  }

  /** Reads every `sessionBudget.*` key; any failed read shows the load error with Retry. */
  async reload(): Promise<void> {
    this.load.set('loading');
    this.recommendationDismissed.set(false);
    try {
      const results = await Promise.all(
        BUDGET_KEYS.map((key) =>
          rpcCall<{ success: boolean; value?: unknown }>(
            this.vscode,
            'settings:get',
            { key: SESSION_BUDGET_SETTINGS[key].key },
            SETTINGS_READ_TIMEOUT_MS,
          ),
        ),
      );
      if (results.some((result) => !result.success || !result.data?.success)) {
        this.load.set('error');
        return;
      }
      this.saved.set(
        Object.fromEntries(
          BUDGET_KEYS.map((key, index) => [key, results[index].data?.value]),
        ),
      );
      this.drafts.set({});
      this.errors.set({});
      this.load.set('ready');
    } catch (error: unknown) {
      this.logger.warn('SessionBudgetSettings', 'settings:get failed', error);
      this.load.set('error');
    }
  }

  protected booleanValue(key: BooleanKey): boolean {
    const value = this.saved()[key];
    return typeof value === 'boolean' ? value : this.settings[key].default;
  }

  protected numberText(key: NumberKey): string {
    const draft = this.drafts()[key];
    if (draft !== undefined) return draft;
    const value = this.saved()[key];
    return typeof value === 'number' ? String(value) : '';
  }

  protected range(key: NumberKey): string {
    const setting: SessionBudgetNumberSetting = this.settings[key];
    return `${NUMBER_FORMAT.format(setting.min)} to ${NUMBER_FORMAT.format(setting.max)}`;
  }

  protected unitSuffix(key: NumberKey): string {
    if (key === 'usd') return 'USD';
    if (key.endsWith('Percent')) return '%';
    if (key === 'handoffAfterCompactions') return 'runs';
    return 'tokens';
  }

  /** A stored value the backend ignores (out of bounds, wrong type, or a broken percent pair) says what applies instead. */
  protected storedNotice(key: NumberKey): string | null {
    const setting: SessionBudgetNumberSetting = this.settings[key];
    const value = this.saved()[key];
    if (value !== undefined && !storedNumberIsValid(setting, value)) {
      return `The saved value is not valid; Ptah uses the default (${this.formatDefault(setting)}).`;
    }
    if (key === 'handoffPercent' && !this.percentPairValid()) {
      return `Tighten at is not below Handoff at; Ptah uses the defaults (${this.settings.tightenPercent.default}% and ${this.settings.handoffPercent.default}%).`;
    }
    return null;
  }

  protected edit(key: NumberKey, event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.drafts.update((drafts) => ({ ...drafts, [key]: text }));
    this.setError(key, this.validate(key, text));
  }

  /**
   * Leaving a field commits its pending draft even when nothing was typed since focus: `change` only fires for a
   * new keystroke, so a draft a partner save made valid while this field had focus would otherwise be lost.
   * `commit` returns early for an invalid, unchanged or busy draft, so a `change` that already wrote it is not repeated.
   */
  protected blurred(key: NumberKey): void {
    if (this.focusedKey === key) this.focusedKey = null;
    if (this.drafts()[key] !== undefined) void this.commit(key);
  }

  /** On commit (blur / Enter): a valid, changed value is written; an invalid one stays on screen with its message. */
  async commit(key: NumberKey): Promise<void> {
    const text = this.drafts()[key];
    if (text === undefined || this.busy()) return;
    const error = this.validate(key, text);
    this.setError(key, error);
    if (error !== null) return;
    const parsed = parseNumber(this.settings[key], text);
    if (!parsed.ok) return;
    if (parsed.value === this.saved()[key]) {
      this.clearDraft(key);
      return;
    }
    if (await this.write(key, parsed.value)) {
      this.clearDraft(key);
      if (key === 'tightenPercent' || key === 'handoffPercent') {
        await this.commitPartner(
          key === 'tightenPercent' ? 'handoffPercent' : 'tightenPercent',
        );
      }
    }
  }

  /**
   * After one percent is saved, the other's pending draft is checked against it. A blurred draft is committed; a
   * focused one is still being typed, so it is only re-validated and is committed by its own blur / Enter.
   */
  private async commitPartner(
    key: 'tightenPercent' | 'handoffPercent',
  ): Promise<void> {
    if (this.focusedKey !== key) {
      await this.commit(key);
      return;
    }
    const text = this.drafts()[key];
    if (text !== undefined) this.setError(key, this.validate(key, text));
  }

  async toggle(key: BooleanKey, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const next = input.checked;
    // The box keeps showing the saved value; the successful write moves it.
    input.checked = this.booleanValue(key);
    if (this.busy() || next === this.booleanValue(key)) return;
    await this.write(key, next);
  }

  async selectUnit(value: SessionBudgetUnit | null): Promise<void> {
    const next = this.units.find((unit) => unit === value);
    if (this.busy() || next === undefined || next === this.unitValue()) return;
    await this.write('unit', next);
  }

  async selectTokenMeasure(value: SessionBudgetTokenMeasure | null): Promise<void> {
    const next = this.tokenMeasures.find((measure) => measure === value);
    if (this.busy() || next === undefined || next === this.tokenMeasureValue())
      return;
    await this.write('tokenMeasure', next);
  }

  async selectWeighted(): Promise<void> {
    if (!this.busy() && this.tokenMeasureValue() === 'raw') {
      await this.write('tokenMeasure', 'weighted');
    }
  }

  dismissRecommendation(): void {
    this.recommendationDismissed.set(true);
  }

  /** Bounds plus, for the percent pair, the shared tighten < handoff rule against the other field's effective value. */
  private validate(key: NumberKey, text: string): string | null {
    const parsed = parseNumber(this.settings[key], text);
    if (!parsed.ok) return parsed.error;
    if (key === 'tightenPercent' && parsed.value !== null) {
      const handoff = this.effectiveNumber('handoffPercent');
      if (!isSessionBudgetPercentOrderValid(parsed.value, handoff)) {
        return `Tighten at must be below Handoff at (${handoff}%).`;
      }
    }
    if (key === 'handoffPercent' && parsed.value !== null) {
      const tighten = this.effectiveNumber('tightenPercent');
      if (!isSessionBudgetPercentOrderValid(tighten, parsed.value)) {
        return `Handoff at must be above Tighten at (${tighten}%).`;
      }
    }
    return null;
  }

  /** The value the backend reads for a percent field: the stored one when in bounds, else the default. */
  private effectiveNumber(key: 'tightenPercent' | 'handoffPercent'): number {
    const setting = this.settings[key];
    const value = this.saved()[key];
    return typeof value === 'number' && storedNumberIsValid(setting, value)
      ? value
      : setting.default;
  }

  private percentPairValid(): boolean {
    return isSessionBudgetPercentOrderValid(
      this.effectiveNumber('tightenPercent'),
      this.effectiveNumber('handoffPercent'),
    );
  }

  /**
   * Writes one key through the page toast (`saveGeneric`): "Saved {label}." with Undo to the previous read-back
   * value, or the failure sentence. True when the host confirmed this write.
   */
  private async write(
    key: BudgetKey,
    value:
      number | null | boolean | SessionBudgetUnit | SessionBudgetTokenMeasure,
  ): Promise<boolean> {
    const previous = this.saved()[key];
    let confirmed = false;
    await this.feedback.saveGeneric({
      label: this.labels[key],
      write: async () => {
        const result = await this.writeOnce(key, value);
        confirmed = result.ok;
        return result;
      },
      undo: isBudgetValue(previous)
        ? () => this.writeOnce(key, previous)
        : null,
    });
    return confirmed;
  }

  /** One `settings:set`; a failure leaves the saved value and returns the sentence the toast shows. */
  private async writeOnce(
    key: BudgetKey,
    value:
      number | null | boolean | SessionBudgetUnit | SessionBudgetTokenMeasure,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const label = this.labels[key];
    this.savingKey.set(key);
    this.setError(key, null);
    let confirmed = false;
    let timedOut = false;
    try {
      const result = await rpcCall<{ success: boolean }>(
        this.vscode,
        'settings:set',
        { key: SESSION_BUDGET_SETTINGS[key].key, value },
        SETTINGS_WRITE_TIMEOUT_MS,
      );
      confirmed = result.success && result.data?.success === true;
      timedOut =
        !result.success &&
        (result.error?.startsWith(RPC_TIMEOUT_PREFIX) ?? false);
    } catch (error: unknown) {
      // Reported in the toast below, like a refused write.
      this.logger.warn('SessionBudgetSettings', 'settings:set failed', error);
    } finally {
      this.savingKey.set(null);
    }
    if (confirmed) {
      this.saved.update((saved) => ({ ...saved, [key]: value }));
      // Sends already go through once the budget is off; drop the stale banners now (F-D).
      if (key === 'enabled' && value === false) {
        this.tabManager.clearSessionBudgets();
      }
      return { ok: true };
    }
    // A timed-out write may still land on the host, so it cannot claim the setting is unchanged.
    return {
      ok: false,
      message: timedOut
        ? `Could not confirm saving ${label}. Reopen settings to see the saved value.`
        : `Could not save ${label}. The saved setting is unchanged.`,
    };
  }

  private formatDefault(setting: SessionBudgetNumberSetting): string {
    return setting.default === null
      ? 'advisory only'
      : NUMBER_FORMAT.format(setting.default);
  }

  private clearDraft(key: NumberKey): void {
    this.drafts.update((drafts) => {
      const next = { ...drafts };
      delete next[key];
      return next;
    });
  }

  private setError(key: BudgetKey, message: string | null): void {
    this.errors.update((errors) => {
      const next = { ...errors };
      if (message === null) delete next[key];
      else next[key] = message;
      return next;
    });
  }
}

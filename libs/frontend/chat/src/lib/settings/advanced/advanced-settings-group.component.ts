import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { VSCodeService, rpcCall } from '@ptah-extension/core';
import {
  ADVANCED_SETTINGS,
  ADVANCED_SETTING_GROUPS,
  validateAdvancedSettingValue,
  type AdvancedNumberSetting,
  type AdvancedSetting,
  type AdvancedSettingApply,
  type AdvancedSettingGroupId,
  type AdvancedSettingValidation,
} from '@ptah-extension/shared';
import { Info, LucideAngularModule } from 'lucide-angular';
import { NgTemplateOutlet } from '@angular/common';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahFieldGridDirective,
  PtahFieldComponent,
  PtahFormSectionComponent,
  PtahInputDirective,
  PtahIconButtonDirective,
  NativePopoverComponent,
  PtahSettingRowComponent,
  PtahToggleDirective,
} from '@ptah-extension/ui';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');
/** With glass on, removes the block padding of a form section that is the content of a glass card. */
const FLUSH_IN_GLASS_CARD = '[[data-glass=on]_&>section]:py-0';
/**
 * A missing host response must reveal Retry instead of leaving the group busy. It bounds both the `rpcCall`
 * response wait and, through the group's own deadline, `rpcCall`'s untimed wait for the host to become ready.
 */
const SETTINGS_READ_TIMEOUT_MS = 5_000;
/** A missing write response must free the group (busy) and say the save is unconfirmed. */
const SETTINGS_WRITE_TIMEOUT_MS = 5_000;
/** The prefix `rpcCall` puts on the error of a request that got no response in time. */
const RPC_TIMEOUT_PREFIX = 'RPC timeout';
/** Plain digits with an optional sign and fraction, after `,` `_` and spaces are stripped. */
const NUMBER_TEXT = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

const APPLY_NOTES: Readonly<Record<AdvancedSettingApply, string>> = {
  live: 'Applies right away.',
  'next-run': 'Applies on the next cleanup run.',
  'next-agent': 'Applies to the next Codex agent you start.',
  restart: 'Restart Ptah to apply.',
};

/** Typed text as a number, then the shared bounds check (`validateAdvancedSettingValue`). */
function parseNumber(
  setting: AdvancedNumberSetting,
  raw: string,
): AdvancedSettingValidation {
  const text = raw.trim().replace(/[,_\s]/g, '');
  if (text === '') {
    return setting.default === null
      ? { ok: true, value: null }
      : { ok: false, error: 'Enter a value.' };
  }
  if (!NUMBER_TEXT.test(text)) return { ok: false, error: 'Enter a number.' };
  return validateAdvancedSettingValue(setting, Number(text));
}

function formatValue(
  setting: AdvancedSetting,
  value: number | boolean | null,
): string {
  if (value === null) return 'Model default';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  const unit =
    setting.kind === 'number' && setting.unit ? ` ${setting.unit}` : '';
  return `${NUMBER_FORMAT.format(value)}${unit}`;
}

/**
 * One group of advanced file-based settings (`~/.ptah/settings.json`, TASK_2026_658), rendered from the shared
 * `ADVANCED_SETTINGS` table. Reads each key with `settings:get` and writes with `settings:set`, like the session
 * budget card (session-budget-settings.component.ts), whose behaviour and copy it follows. A number field keeps what
 * the user typed until it is saved; an invalid value is never written. A toggle shows only the read-back value.
 */
@Component({
  selector: 'ptah-advanced-settings-group',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    LucideAngularModule,
    PtahIconButtonDirective,
    NativePopoverComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahFieldGridDirective,
    PtahFieldComponent,
    PtahFormSectionComponent,
    PtahSettingRowComponent,
    PtahInputDirective,
    PtahToggleDirective,
    SettingsBusyDisabledDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (group(); as group) {
      <section
        [attr.data-glass-surface]="contentSurface() ? 'content' : null"
        class="flex flex-col gap-[var(--ptah-gap-field)] text-sm text-base-content"
        [class.border-b]="headingStyle() === 'caps'"
        [class.border-base-content/10]="headingStyle() === 'caps'"
        [class.pb-7]="headingStyle() === 'caps'"
        [attr.aria-labelledby]="idPrefix() + '-heading'"
        [attr.data-testid]="'settings-section-' + group.id"
      >
        <!-- The write error and the invalid-stored-value notice of one setting. -->
        <ng-template #messages let-setting>
          @if (errors()[setting.key]; as message) {
            <p
              role="alert"
              [id]="'advanced-setting-' + setting.key + '-error'"
              class="mt-[var(--ptah-gap-label)] text-xs text-error"
              [attr.data-testid]="'advanced-setting-' + setting.key + '-error'"
            >
              {{ message }}
            </p>
          }
          @if (storedNotice(setting); as notice) {
            <p
              [id]="'advanced-setting-' + setting.key + '-stored'"
              class="mt-[var(--ptah-gap-label)] rounded-md border border-info/30 bg-info/10 px-2 py-1 text-xs"
              [attr.data-testid]="'advanced-setting-' + setting.key + '-stored'"
            >
              {{ notice }}
            </p>
          }
        </ng-template>
        <ng-template #info let-setting>
          <ptah-native-popover
            [isOpen]="openHelp() === setting.key"
            [keepInViewport]="true"
            (closed)="openHelp.set(null)"
          >
            <button trigger type="button" ptahIconButton size="xs"
              [label]="'About ' + setting.label"
              [attr.aria-label]="'About ' + setting.label"
              (click)="openHelp.set(openHelp() === setting.key ? null : setting.key)">
              <lucide-angular [img]="InfoIcon" />
            </button>
            <p content class="max-w-xs text-sm">{{ helpText(setting) }}</p>
          </ptah-native-popover>
        </ng-template>
        <ng-template #description>
          <p class="mt-0.5 text-xs text-base-content-muted">
            {{ group.description }}
          </p>
          @if (group.id === 'context-budgets') {
            <p class="mt-1 text-xs text-base-content-muted">
              Agent limits apply even when compaction is off.
            </p>
          }
        </ng-template>
        <!-- 'section': the sentence-case heading of the sibling setting sections (session budget); 'caps': the
             small uppercase group label of the Advanced tab and the Codex drawer. -->
        @if (headingStyle() === 'hidden') {
          <!-- 'hidden': a disclosure row already shows the title (Fine-tuning), so the heading only names the
               section for assistive technology. -->
          <h3 [id]="idPrefix() + '-heading'" class="sr-only">
            {{ group.title }}
          </h3>
        } @else if (headingStyle() === 'section') {
          <!-- 'section': the shared form section of Context Management (title and description at the left, the
               group at the right); the sr-only span keeps the aria-labelledby id. -->
          <!-- Glass on with its own plane: the card owns the inset, so the form section has no block padding. -->
          <ptah-form-section wide [heading]="group.title" [description]="group.description" [class]="contentSurface() ? flushInCard : ''">
            <span class="sr-only" [id]="idPrefix() + '-heading'">{{ group.title }}</span>
            @if (group.id === 'context-budgets') {
              <p aside class="text-xs text-base-content-muted">Agent limits apply even when compaction is off.</p>
            }
            <ng-container [ngTemplateOutlet]="body" />
          </ptah-form-section>
        } @else {
          <div section-header class="mb-[var(--ptah-gap-heading)]">
            <h3
              [id]="idPrefix() + '-heading'"
              class="text-xs font-bold uppercase tracking-wider text-base-content"
            >
              {{ group.title }}
            </h3>
            <ng-container [ngTemplateOutlet]="description" />
          </div>
        }

        <ng-template #body>
        @switch (load()) {
          @case ('loading') {
            <p
              role="status"
              aria-live="polite"
              [attr.data-testid]="idPrefix() + '-loading'"
            >
              Loading {{ group.title }}…
            </p>
          }
          @case ('error') {
            <div role="alert" class="space-y-1.5">
              <p [attr.data-testid]="idPrefix() + '-load-error'">
                The {{ group.title }} settings could not be read. Your saved
                settings have not changed.
              </p>
              <button
                type="button"
                ptahButton
                (click)="reload()"
                [attr.data-testid]="idPrefix() + '-retry'"
              >
                Retry {{ group.title }}
              </button>
            </div>
          }
          @default {
            <!-- Switches first, as aligned setting rows (title and help at the left, the switch at the right). -->
            @if (booleanSettings().length > 0) {
              <div
                class="flex flex-col divide-y divide-base-content/10"
                data-testid="advanced-group-switches"
              >
                @for (setting of booleanSettings(); track setting.key) {
                  <div
                    class="min-w-0 py-[var(--ptah-gap-controls)] first:pt-[calc(var(--ptah-gap-controls)*0)]"
                    [attr.data-testid]="
                      'advanced-setting-' + setting.key + '-field'
                    "
                  >
                    <ptah-setting-row
                      [label]="setting.label"
                      [controlId]="'advanced-setting-' + setting.key"
                      [controlAlign]="rowLayout() === 'aligned' ? 'end' : 'start'"
                      [edgePadding]="rowLayout() === 'aligned' ? 'trim' : 'all'"
                    >
                      @if (setting.apply === 'restart') {
                        <span
                          status
                          ptahBadge
                          tone="info"
                          data-restart-badge
                          aria-hidden="true"
                          >Restart</span
                        >
                      }
                      <p
                        status
                        [id]="'advanced-setting-' + setting.key + '-help'"
                        class="basis-full text-xs font-normal text-base-content-muted"
                      >
                        {{ applyNote(setting) }}
                        <ng-container [ngTemplateOutlet]="info"
                          [ngTemplateOutletContext]="{ $implicit: setting }" />
                      </p>
                      <span
                        meta
                        class="text-xs text-base-content-muted"
                        [attr.data-testid]="
                          'advanced-setting-' + setting.key + '-state'
                        "
                        >{{
                          booleanValue(setting) ? 'Enabled' : 'Disabled'
                        }}</span
                      >
                      <input
                          type="checkbox"
                          ptahToggle
                          size="sm"
                          [id]="'advanced-setting-' + setting.key"
                          [checked]="booleanValue(setting)"
                          [ptahBusyDisabled]="busy()"
                          (change)="toggle(setting, $event)"
                          [attr.aria-invalid]="
                            errors()[setting.key] ? 'true' : null
                          "
                          [attr.aria-label]="setting.label"
                          [attr.aria-describedby]="describedBy(setting)"
                          [attr.data-testid]="'advanced-setting-' + setting.key"
                        />
                    </ptah-setting-row>
                    <ng-container
                      [ngTemplateOutlet]="messages"
                      [ngTemplateOutletContext]="{ $implicit: setting }"
                    />
                  </div>
                }
              </div>
            }
            <!-- Numbers: related short fields side by side (at most three columns), floating labels, unit at the
                 right of the box, help under the box. -->
            @if (numberSettings().length > 0) {
              <div
                ptahFieldGrid
                class="number-grid"
                minColumn="md"
                data-testid="advanced-group-numbers"
              >
                @for (setting of numberSettings(); track setting.key) {
                  <div
                    class="flex min-w-0 flex-col"
                    [attr.data-testid]="
                      'advanced-setting-' + setting.key + '-field'
                    "
                  >
                    <ptah-field [label]="setting.label" [hint]="rangeHint(setting)" [info]="helpText(setting)">
                      <input
                        type="text"
                        ptahInput
                        [id]="'advanced-setting-' + setting.key"
                        [attr.inputmode]="
                          setting.integer ? 'numeric' : 'decimal'
                        "
                        class="tabular-nums"
                        [invalid]="!!errors()[setting.key]"
                        [value]="numberText(setting)"
                        [placeholder]="setting.default === null ? 'Model default' : ''"
                        [attr.aria-describedby]="describedBy(setting)"
                        [ptahBusyDisabled]="busy()"
                        (input)="edit(setting, $event)"
                        (change)="commit(setting)"
                        (blur)="blurred(setting)"
                        [attr.data-testid]="'advanced-setting-' + setting.key"
                      />
                      @if (setting.unit) {
                        <span
                          ptahFieldTrailing
                          class="shrink-0 whitespace-nowrap pr-[var(--ptah-gap-heading)] text-xs text-base-content-muted"
                          aria-hidden="true"
                          >{{ setting.unit }}</span
                        >
                      }
                      @if (setting.apply === 'restart') {
                        <span
                          ptahFieldBeforeHint
                          ptahBadge
                          tone="info"
                          size="xs"
                          data-restart-badge
                          class="self-start"
                          aria-hidden="true"
                          >Restart</span
                        >
                      }
                      <div ptahFieldAfterError>
                        <p class="sr-only" [id]="'advanced-setting-' + setting.key + '-help'">{{ helpText(setting) }}</p>
                        <ng-container
                          [ngTemplateOutlet]="messages"
                          [ngTemplateOutletContext]="{ $implicit: setting }"
                        />
                      </div>
                    </ptah-field>
                  </div>
                }
              </div>
            }
          }
        }
        </ng-template>
        @if (headingStyle() !== 'section') {
          <ng-container [ngTemplateOutlet]="body" />
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }
    /* Keep empty tracks so one- and two-field groups align with larger groups. */
    .number-grid {
      grid-template-columns: repeat(auto-fill, minmax(min(100%, max(var(--ptah-field-grid-min-md), calc((100% - 2 * var(--ptah-gap-field)) / 3))), 1fr));
    }
  `,
})
export class AdvancedSettingsGroupComponent implements OnInit {
  readonly openHelp = signal<string | null>(null);
  readonly InfoIcon = Info;
  protected readonly flushInCard = FLUSH_IN_GLASS_CARD;
  readonly contentSurface = input(true);
  /** 'section' matches the sentence-case section headings of the Context Management tab; 'caps' is the group label. */
  readonly headingStyle = input<'caps' | 'section' | 'hidden'>('caps');
  /**
   * 'aligned': each switch row has its control at the right edge and trimmed edge padding (the Fine-tuning rows of
   * the Advanced page). 'default' keeps the row rendering of the Codex drawer and Context Management.
   */
  readonly rowLayout = input<'default' | 'aligned'>('default');
  private readonly vscode = inject(VSCodeService);
  /** The page toast: every write's outcome (with Undo after a save) is said there. */
  private readonly feedback = inject(SettingsSaveFeedbackService);

  readonly groupId = input.required<AdvancedSettingGroupId>();

  protected readonly group = computed(() =>
    ADVANCED_SETTING_GROUPS.find((group) => group.id === this.groupId()),
  );
  protected readonly settings = computed(() =>
    ADVANCED_SETTINGS.filter((setting) => setting.group === this.groupId()),
  );
  protected readonly booleanSettings = computed(() =>
    this.settings().filter((setting) => setting.kind === 'boolean'),
  );
  protected readonly numberSettings = computed(() =>
    this.settings().filter(
      (setting): setting is AdvancedNumberSetting => setting.kind === 'number',
    ),
  );
  protected readonly idPrefix = computed(
    () => `advanced-group-${this.groupId()}`,
  );

  protected readonly load = signal<'loading' | 'error' | 'ready'>('loading');
  /** Read-back values by key, as stored (possibly invalid when the file was edited by hand). */
  private readonly saved = signal<Readonly<Record<string, unknown>>>({});
  /** What the user typed into a number field and has not saved yet. */
  private readonly drafts = signal<Readonly<Record<string, string>>>({});
  protected readonly errors = signal<Readonly<Record<string, string>>>({});
  /** The key whose write is in flight; every control in the group is busy meanwhile. */
  private readonly savingKey = signal<string | null>(null);
  protected readonly busy = computed(
    () => this.savingKey() !== null || this.feedback.saving(),
  );
  /** The deadline timer of the read in flight; cleared when the read settles or the group is destroyed. */
  private readDeadline: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.readDeadline));
  }

  ngOnInit(): void {
    void this.reload();
  }

  /**
   * Reads every key of the group in parallel; any failed read, or no answer within the group's own deadline
   * (`rpcCall` starts its timeout only once the host is ready), shows the load error with Retry.
   */
  async reload(): Promise<void> {
    this.load.set('loading');
    const settings = this.settings();
    const reads = Promise.all(
      settings.map((setting) =>
        // degradation-audit: reported - a null read sets load to 'error', which
        // shows the group's load error with Retry.
        rpcCall<{ success: boolean; value?: unknown }>(
          this.vscode,
          'settings:get',
          { key: setting.key },
          SETTINGS_READ_TIMEOUT_MS,
        ).catch(() => null),
      ),
    );
    clearTimeout(this.readDeadline);
    const deadline = new Promise<null>((resolve) => {
      this.readDeadline = setTimeout(
        () => resolve(null),
        SETTINGS_READ_TIMEOUT_MS,
      );
    });
    const results = await Promise.race([reads, deadline]);
    clearTimeout(this.readDeadline);
    if (
      results === null ||
      results.some(
        (result) => result === null || !result.success || !result.data?.success,
      )
    ) {
      this.load.set('error');
      return;
    }
    this.saved.set(
      Object.fromEntries(
        settings.map((setting, index) => [
          setting.key,
          results[index]?.data?.value,
        ]),
      ),
    );
    this.drafts.set({});
    this.errors.set({});
    this.load.set('ready');
  }

  protected booleanValue(setting: AdvancedSetting): boolean {
    const value = this.saved()[setting.key];
    return typeof value === 'boolean' ? value : setting.default === true;
  }

  protected numberText(setting: AdvancedNumberSetting): string {
    const draft = this.drafts()[setting.key];
    if (draft !== undefined) return draft;
    const value = this.saved()[setting.key];
    return typeof value === 'number' ? String(value) : '';
  }

  /** A short apply note for switch rows and the full explanation in the popover. */
  protected applyNote(setting: AdvancedSetting): string {
    return APPLY_NOTES[setting.apply];
  }

  protected helpText(setting: AdvancedSetting): string {
    return `${setting.help} ${this.applyNote(setting)}`;
  }

  protected rangeHint(setting: AdvancedNumberSetting): string {
    const range = `${NUMBER_FORMAT.format(setting.min)} to ${NUMBER_FORMAT.format(setting.max)}${setting.unit ? ` ${setting.unit}` : ''}`;
    return setting.default === null ? `Model default or ${range}` : range;
  }

  protected describedBy(setting: AdvancedSetting): string {
    const id = `advanced-setting-${setting.key}`;
    return [
      `${id}-help`,
      this.errors()[setting.key] ? `${id}-error` : null,
      this.storedNotice(setting) ? `${id}-stored` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(' ');
  }

  /**
   * A stored value the shared validator refuses (hand-edited file) is flagged. The copy does not say which value
   * applies instead: clamped consumers (memory retention / lifecycle) use the nearest bound, others the default.
   */
  protected storedNotice(setting: AdvancedSetting): string | null {
    const value = this.saved()[setting.key];
    if (value === undefined || validateAdvancedSettingValue(setting, value).ok)
      return null;
    return `The saved value is not valid. Save a new value to replace it. Default: ${formatValue(setting, setting.default)}.`;
  }

  protected edit(setting: AdvancedNumberSetting, event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.drafts.update((drafts) => ({ ...drafts, [setting.key]: text }));
    const parsed = parseNumber(setting, text);
    this.setError(setting.key, parsed.ok ? null : parsed.error);
  }

  /** Leaving a field commits a pending draft that `change` did not (e.g. after an unconfirmed save). */
  protected blurred(setting: AdvancedNumberSetting): void {
    if (this.drafts()[setting.key] !== undefined) void this.commit(setting);
  }

  /** On commit (blur / Enter): a valid, changed value is written; an invalid one stays on screen with its message. */
  async commit(setting: AdvancedNumberSetting): Promise<void> {
    const text = this.drafts()[setting.key];
    if (text === undefined || this.busy()) return;
    const parsed = parseNumber(setting, text);
    this.setError(setting.key, parsed.ok ? null : parsed.error);
    if (!parsed.ok) return;
    if (parsed.value === (this.saved()[setting.key] ?? null)) {
      this.clearDraft(setting.key);
      return;
    }
    if (await this.write(setting, parsed.value)) this.clearDraft(setting.key);
  }

  async toggle(setting: AdvancedSetting, event: Event): Promise<void> {
    const box = event.target as HTMLInputElement;
    const next = box.checked;
    // The box keeps showing the saved value; the successful write moves it.
    box.checked = this.booleanValue(setting);
    if (this.busy() || next === this.booleanValue(setting)) return;
    await this.write(setting, next);
  }

  /**
   * Writes one key through the page toast (`saveGeneric`); true when the host confirmed the write. The toast says
   * "Saved {label}." with an Undo to the previous read-back value, or the failure; the saved value stays shown.
   */
  private async write(
    setting: AdvancedSetting,
    value: number | boolean | null,
  ): Promise<boolean> {
    const { key, label } = setting;
    const previous = validateAdvancedSettingValue(setting, this.saved()[key] ?? null);
    this.savingKey.set(key);
    this.setError(key, null);
    try {
      const result = await this.feedback.saveGeneric({
        label,
        write: () => this.send(setting, value),
        // An unreadable or hand-edited previous value cannot be written back.
        undo:
          previous.ok
            ? () => this.send(setting, previous.value)
            : null,
      });
      return result === 'saved';
    } finally {
      this.savingKey.set(null);
    }
  }

  /** One `settings:set` write; a confirmed one moves the read-back value. */
  private async send(
    setting: AdvancedSetting,
    value: number | boolean | null,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const { key, label } = setting;
    let confirmed = false;
    let timedOut = false;
    try {
      const result = await rpcCall<{ success: boolean }>(
        this.vscode,
        'settings:set',
        { key, value },
        SETTINGS_WRITE_TIMEOUT_MS,
      );
      confirmed = result.success && result.data?.success === true;
      timedOut =
        !result.success &&
        (result.error?.startsWith(RPC_TIMEOUT_PREFIX) ?? false);
    } catch {
      // degradation-audit: reported - a transport failure is said in the toast like a refused write.
    }
    if (confirmed) {
      this.saved.update((saved) => ({ ...saved, [key]: value }));
      return { ok: true };
    }
    // A timed-out write may still land on the host, so it cannot claim the setting is unchanged. Host error text
    // is never shown (it may carry paths or secrets); the client validator already refused out-of-range values.
    const message = timedOut
      ? `Could not confirm saving ${label}. Reopen settings to see the saved value.`
      : `Could not save ${label}. The saved setting is unchanged.`;
    // The field keeps the same fixed message: its typed value stays and is not the saved one (the toast times out).
    this.setError(key, message);
    return { ok: false, message };
  }

  private clearDraft(key: string): void {
    this.drafts.update((drafts) => {
      const next = { ...drafts };
      delete next[key];
      return next;
    });
  }

  private setError(key: string, message: string | null): void {
    this.errors.update((errors) => {
      const next = { ...errors };
      if (message === null) delete next[key];
      else next[key] = message;
      return next;
    });
  }
}

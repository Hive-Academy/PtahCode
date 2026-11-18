import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type {
  CronCreateParams,
  CronUpdateParams,
  ScheduledJobDto,
} from '@ptah-extension/shared';
import {
  PtahAlertComponent,
  PtahButtonDirective,
  PtahFieldComponent,
  NativeDrawerComponent,
  PtahInputDirective,
  PtahRichSelectComponent,
  PtahSettingRowComponent,
  PtahTextareaDirective,
  PtahToggleDirective,
  type PtahSelectOption,
} from '@ptah-extension/ui';

import { CronExpressionService } from '../services/cron-expression.service';
import { CronStateService } from '../services/cron-state.service';

interface CronJobFormState {
  name: string;
  cronExpr: string;
  prompt: string;
  workspaceRoot: string;
  timezone: string;
  enabled: boolean;
}

/** The fields that can block a save, in the order they appear in the form. */
type ValidatedField = 'name' | 'cronExpr' | 'prompt';

const VALIDATED_FIELDS: readonly ValidatedField[] = [
  'name',
  'cronExpr',
  'prompt',
];

const SUGGESTED_TIMEZONES: readonly string[] = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

/**
 * The host rejects a prompt with this prefix (`cron-rpc.handlers.ts`): it
 * names an internal handler. The form reports it before the round trip.
 */
const RESERVED_PROMPT_PREFIX = 'handler:';

/** One-click schedules offered under the cron expression field. */
const SCHEDULE_PRESETS: readonly { id: string; label: string; expr: string }[] =
  [
    { id: '30min', label: 'Every 30 min', expr: '*/30 * * * *' },
    { id: 'hourly', label: 'Hourly', expr: '0 * * * *' },
    { id: 'daily', label: 'Daily 09:00', expr: '0 9 * * *' },
    { id: 'weekdays', label: 'Weekdays 09:00', expr: '0 9 * * 1-5' },
    { id: 'weekly', label: 'Weekly Mon 07:30', expr: '30 7 * * 1' },
  ];

const SAVE_FAILED_FALLBACK = 'The job could not be saved.';

function detectUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // Intl can be unavailable or restricted; UTC is the documented fallback.
    return 'UTC';
  }
}

function toFormState(
  job: ScheduledJobDto | null,
  defaultWorkspaceRoot: string | null,
  detectedTimezone: string,
): CronJobFormState {
  if (!job) {
    return {
      name: '',
      cronExpr: '',
      prompt: '',
      workspaceRoot: defaultWorkspaceRoot ?? '',
      timezone: detectedTimezone,
      enabled: true,
    };
  }
  return {
    name: job.name,
    cronExpr: job.cronExpr,
    prompt: job.prompt,
    workspaceRoot: job.workspaceRoot ?? '',
    timezone: job.timezone,
    enabled: job.enabled,
  };
}

/**
 * Create / edit form for one scheduled job.
 *
 * - `job`: the job to edit, or `null` to create a new job.
 * - `defaultWorkspaceRoot`: the workspace stamped on a new job.
 * - `saved`: emitted after `CronStateService.create` / `update` returned a job.
 * - `cancelled`: emitted when the user closes the form without saving.
 *
 * The form state is keyed on the job id, so a list refresh that replaces the
 * job object does not discard what the user typed. A failed save keeps the
 * form open and shows the message of `CronStateService.saveError`. Saving an
 * existing job sends only the fields that differ from the values the form
 * loaded, so a stale field never overwrites a newer value on the host.
 */
@Component({
  selector: 'ptah-cron-job-form',
  standalone: true,
  imports: [
    PtahAlertComponent,
    PtahButtonDirective,
    PtahFieldComponent,
    NativeDrawerComponent,
    PtahInputDirective,
    PtahRichSelectComponent,
    PtahSettingRowComponent,
    PtahTextareaDirective,
    PtahToggleDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-native-drawer
      [isOpen]="open()"
      [ariaLabel]="heading()"
      widthClass="w-full max-w-xl"
      (closed)="cancel()"
    >
      <div drawer-header class="flex min-w-0 flex-col">
        <h2 class="truncate text-sm font-semibold">{{ heading() }}</h2>
        @if (job(); as current) {
          <span class="truncate text-xs text-base-content-muted">{{
            current.name
          }}</span>
        }
      </div>

      <form
        novalidate
        id="cron-job-form"
        class="flex flex-col gap-[var(--ptah-gap-field)]"
        data-testid="cron-form"
        (submit)="submit($event)"
      >
        @if (invalidSummary(); as summary) {
          <ptah-alert
            tone="warning"
            [compact]="true"
            live="assertive"
            data-testid="cron-form-invalid-summary"
          >
            {{ summary }}
          </ptah-alert>
        }

        <ptah-field
          label="Name"
          required
          hint="Shown in the list and in run history."
          [error]="shownErrors().name"
        >
          <input
            #nameInput
            type="text"
            ptahInput
            required
            autocomplete="off"
            data-testid="cron-form-name"
            [disabled]="saving()"
            [value]="form().name"
            (input)="patch({ name: controlValue($event) })"
          />
        </ptah-field>

        <ptah-field
          label="Cron expression"
          required
          [hint]="expression().description ?? expressionHelp"
          [error]="shownErrors().cronExpr"
        >
          <input
            #exprInput
            type="text"
            ptahInput
            required
            autocomplete="off"
            spellcheck="false"
            class="font-mono"
            data-testid="cron-form-expr"
            [disabled]="saving()"
            [value]="form().cronExpr"
            (input)="patch({ cronExpr: controlValue($event) })"
          />
        </ptah-field>

        <div
          class="flex flex-wrap gap-[var(--ptah-gap-controls)]"
          role="group"
          aria-label="Schedule presets"
        >
          @for (preset of presets; track preset.id) {
            <button
              type="button"
              ptahButton
              variant="ghost"
              size="xs"
              [selected]="form().cronExpr.trim() === preset.expr"
              [attr.data-testid]="'cron-form-preset-' + preset.id"
              [disabled]="saving()"
              (click)="applyPreset(preset.expr)"
            >
              {{ preset.label }}
            </button>
          }
        </div>

        <ptah-field label="Timezone" [hint]="timezoneHint">
          <ptah-select
            size="sm"
            class="w-full"
            data-testid="cron-form-timezone"
            [options]="timezoneOptions()"
            [value]="form().timezone"
            [disabled]="saving()"
            (valueChange)="selectTimezone($event)"
          />
        </ptah-field>

        <ptah-field
          label="Prompt"
          required
          hint="What the agent does each time the job runs."
          [error]="shownErrors().prompt"
        >
          <textarea
            #promptInput
            ptahTextarea
            required
            rows="6"
            data-testid="cron-form-prompt"
            [disabled]="saving()"
            [value]="form().prompt"
            (input)="patch({ prompt: controlValue($event) })"
          ></textarea>
        </ptah-field>

        <ptah-field
          label="Workspace root"
          hint="Optional. Leave it empty for a job without a workspace."
        >
          <input
            type="text"
            ptahInput
            autocomplete="off"
            spellcheck="false"
            class="font-mono"
            data-testid="cron-form-workspace"
            [disabled]="saving()"
            [value]="form().workspaceRoot"
            (input)="patch({ workspaceRoot: controlValue($event) })"
          />
        </ptah-field>

        <ptah-setting-row
          label="Enabled"
          hint="A job that is not enabled keeps its schedule but does not run."
          controlId="cron-form-enabled"
        >
          <input
            id="cron-form-enabled"
            type="checkbox"
            ptahToggle
            size="sm"
            data-testid="cron-form-enabled"
            [disabled]="saving()"
            [checked]="form().enabled"
            (change)="patch({ enabled: checkboxValue($event) })"
          />
        </ptah-setting-row>

        @if (saveError(); as message) {
          <ptah-alert
            tone="error"
            [compact]="true"
            live="assertive"
            title="Could not save the job"
            data-testid="cron-form-save-error"
          >
            {{ message }}
          </ptah-alert>
        }
      </form>

      <div
        drawer-footer
        class="flex items-center gap-[var(--ptah-gap-controls)] border-t border-surface-border px-4 py-3"
      >
        <button
          type="submit"
          form="cron-job-form"
          ptahButton
          variant="primary"
          data-testid="cron-form-submit"
          [disabled]="saving()"
        >
          {{ submitLabel() }}
        </button>
        <button
          type="button"
          ptahButton
          variant="ghost"
          data-testid="cron-form-cancel"
          [disabled]="saving()"
          (click)="cancel()"
        >
          Cancel
        </button>
      </div>
    </ptah-native-drawer>
  `,
})
export class CronJobFormComponent {
  private readonly state = inject(CronStateService);
  private readonly cronExpr = inject(CronExpressionService);

  /** Whether the drawer is open; a closed to open change resets the form. */
  public readonly open = input<boolean>(false);
  public readonly job = input<ScheduledJobDto | null>(null);
  public readonly defaultWorkspaceRoot = input<string | null>(null);
  public readonly saved = output<void>();
  public readonly cancelled = output<void>();

  private readonly nameInput =
    viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly exprInput =
    viewChild<ElementRef<HTMLInputElement>>('exprInput');
  private readonly promptInput =
    viewChild<ElementRef<HTMLTextAreaElement>>('promptInput');

  private readonly injector = inject(Injector);
  protected readonly presets = SCHEDULE_PRESETS;
  private readonly detectedTimezone = detectUserTimezone();
  private destroyed = false;
  /** The params of the job as the form loaded it; the base of an update patch. */
  private loaded: CronCreateParams | null = null;

  protected readonly expressionHelp =
    'Standard cron syntax, for example */5 * * * *.';
  protected readonly timezoneHint = `Detected timezone: ${this.detectedTimezone}`;

  protected readonly saving = signal(false);
  private readonly submitAttempted = signal(false);
  private readonly saveFailed = signal(false);

  private readonly jobId = computed(() => this.job()?.id ?? null);

  /** Rebuilt only when the edited job changes identity, not on a list refresh. */
  protected readonly form = linkedSignal<string | null, CronJobFormState>({
    source: this.jobId,
    computation: () => this.initialState(),
  });

  protected readonly heading = computed(() =>
    this.jobId() ? 'Edit job' : 'New job',
  );
  protected readonly submitLabel = computed(() =>
    this.jobId() ? 'Save changes' : 'Create job',
  );

  protected readonly timezoneOptions = computed<PtahSelectOption<string>[]>(
    () => {
      const zones = new Set<string>(SUGGESTED_TIMEZONES);
      zones.add(this.detectedTimezone);
      const jobTimezone = this.job()?.timezone;
      if (jobTimezone) zones.add(jobTimezone);
      return [...zones].map((zone) => ({ value: zone, label: zone }));
    },
  );

  /** Live reading of the expression: a description when valid, the parser's message when not. */
  protected readonly expression = computed<{
    valid: boolean;
    description: string | null;
    error: string | null;
  }>(() => {
    const expr = this.form().cronExpr;
    if (expr.trim().length === 0) {
      return { valid: false, description: null, error: null };
    }
    const result = this.cronExpr.validate(expr);
    if (!result.valid) {
      return {
        valid: false,
        description: null,
        error: result.error ?? 'This cron expression is not valid.',
      };
    }
    return {
      valid: true,
      description: this.cronExpr.describe(expr),
      error: null,
    };
  });

  private readonly errors = computed<Record<ValidatedField, string | null>>(
    () => {
      const f = this.form();
      const prompt = f.prompt.trim();
      let promptError: string | null = null;
      if (prompt.length === 0) {
        promptError = 'Enter a prompt.';
      } else if (prompt.toLowerCase().startsWith(RESERVED_PROMPT_PREFIX)) {
        promptError =
          'Prompts that start with "handler:" are reserved for internal jobs.';
      }
      const expr = this.expression();
      return {
        name: f.name.trim().length === 0 ? 'Enter a name.' : null,
        cronExpr: expr.valid
          ? null
          : (expr.error ?? 'Enter a cron expression.'),
        prompt: promptError,
      };
    },
  );

  /**
   * What each field shows. An empty required field stays quiet until the user
   * tried to save; a filled field with a wrong value reports it at once.
   */
  protected readonly shownErrors = computed<
    Record<ValidatedField, string | null>
  >(() => {
    const f = this.form();
    const errors = this.errors();
    const attempted = this.submitAttempted();
    const show = (field: ValidatedField): string | null =>
      attempted || f[field].trim().length > 0 ? errors[field] : null;
    return {
      name: attempted ? errors.name : null,
      cronExpr: show('cronExpr'),
      prompt: show('prompt'),
    };
  });

  private readonly invalidFields = computed(() => {
    const errors = this.errors();
    return VALIDATED_FIELDS.filter((field) => errors[field] !== null);
  });

  protected readonly invalidSummary = computed<string | null>(() => {
    const count = this.invalidFields().length;
    if (!this.submitAttempted() || count === 0) return null;
    return `Fix ${count} ${count === 1 ? 'field' : 'fields'} before you save.`;
  });

  protected readonly saveError = computed<string | null>(() =>
    this.saveFailed() ? (this.state.saveError() ?? SAVE_FAILED_FALLBACK) : null,
  );

  public constructor() {
    // A second open must not show the text of the previous one.
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.reset();
        afterNextRender(() => this.nameInput()?.nativeElement.focus(), {
          injector: this.injector,
        });
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
    });
  }

  protected patch(partial: Partial<CronJobFormState>): void {
    if (this.saving()) return;
    this.form.update((current) => ({ ...current, ...partial }));
  }

  protected applyPreset(expr: string): void {
    if (this.saving()) return;
    this.patch({ cronExpr: expr });
    this.exprInput()?.nativeElement.focus();
  }

  protected selectTimezone(timezone: string | null): void {
    if (this.saving()) return;
    if (timezone) this.patch({ timezone });
  }

  protected controlValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected checkboxValue(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected cancel(): void {
    // The drawer stays open until the request settles.
    if (this.saving()) return;
    this.reset();
    this.cancelled.emit();
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;

    this.submitAttempted.set(true);
    this.saveFailed.set(false);
    const firstInvalid = this.invalidFields()[0];
    if (firstInvalid) {
      this.focusField(firstInvalid);
      return;
    }

    const id = this.jobId();
    const values = this.toParams(this.form());
    let patch: CronUpdateParams['patch'] | null = null;
    if (id) {
      patch = this.changedFields(values);
      if (Object.keys(patch).length === 0) {
        // Nothing to write: the job already holds these values.
        this.reset();
        this.saved.emit();
        return;
      }
    }
    this.saving.set(true);
    let result: ScheduledJobDto | null;
    try {
      result =
        id && patch
          ? await this.state.update(id, patch)
          : await this.state.create(values);
    } finally {
      this.saving.set(false);
    }
    // The host can close the form while the request is in flight; a destroyed
    // output must not emit.
    if (this.destroyed) return;

    if (!result) {
      this.saveFailed.set(true);
      return;
    }
    this.reset();
    this.saved.emit();
  }

  private toParams(f: CronJobFormState): CronCreateParams {
    const workspaceRoot = f.workspaceRoot.trim();
    return {
      name: f.name.trim(),
      cronExpr: f.cronExpr.trim(),
      prompt: f.prompt,
      workspaceRoot: workspaceRoot.length === 0 ? null : workspaceRoot,
      timezone: f.timezone,
      enabled: f.enabled,
    };
  }

  /** The fields of `values` that differ from what the form loaded. */
  private changedFields(values: CronCreateParams): CronUpdateParams['patch'] {
    const loaded = this.loaded;
    const patch: CronUpdateParams['patch'] = {};
    if (!loaded || values.name !== loaded.name) patch.name = values.name;
    if (!loaded || values.cronExpr !== loaded.cronExpr) {
      patch.cronExpr = values.cronExpr;
    }
    if (!loaded || values.timezone !== loaded.timezone) {
      patch.timezone = values.timezone;
    }
    if (!loaded || values.prompt !== loaded.prompt)
      patch.prompt = values.prompt;
    if (!loaded || values.workspaceRoot !== loaded.workspaceRoot) {
      patch.workspaceRoot = values.workspaceRoot;
    }
    if (!loaded || values.enabled !== loaded.enabled) {
      patch.enabled = values.enabled;
    }
    return patch;
  }

  /** Builds the form state from `job()` and records it as the loaded snapshot. */
  private initialState(): CronJobFormState {
    const state = toFormState(
      untracked(this.job),
      untracked(this.defaultWorkspaceRoot),
      this.detectedTimezone,
    );
    this.loaded = this.toParams(state);
    return state;
  }

  private reset(): void {
    this.state.clearSaveError();
    this.form.set(this.initialState());
    this.submitAttempted.set(false);
    this.saveFailed.set(false);
  }

  private focusField(field: ValidatedField): void {
    const refs = {
      name: this.nameInput(),
      cronExpr: this.exprInput(),
      prompt: this.promptInput(),
    };
    refs[field]?.nativeElement.focus();
  }
}

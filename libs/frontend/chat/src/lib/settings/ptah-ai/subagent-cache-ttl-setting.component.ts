import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  ProvidersSettingsStateService,
  type ProvidersEditContext,
} from '@ptah-extension/core';
import {
  SUBAGENT_PROMPT_CACHE_TTL_SETTINGS,
  type SubagentPromptCacheTtlSetting,
} from '@ptah-extension/shared';
import {
  SettingsSaveFeedbackService,
  settingNotConfirmedMessage,
  settingNotSavedMessage,
  type SettingsSaveResult,
} from '../feedback/settings-save-feedback.service';
import {
  PtahAlertComponent,
  PtahButtonDirective,
  PtahFieldComponent,
  PtahFieldGridDirective,
  PtahFormSectionComponent,
  PtahRichSelectComponent,
} from '@ptah-extension/ui';

const ENV_VAR = 'CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL';
const LABEL = 'Subagent prompt-cache TTL';
const NOT_SAVED = `${settingNotSavedMessage(LABEL)} The saved setting is unchanged.`;
const NOT_CONFIRMED = `${settingNotConfirmedMessage(LABEL)} Check the saved setting again before changing it.`;
/** The state method's own answer for one write; see `select()`. */
type WriteAttempt = 'skipped' | 'threw' | 'refused' | 'started';
const LABELS: Readonly<Record<SubagentPromptCacheTtlSetting, string>> = {
  auto: 'Auto (1 hour for sessions with subagents)',
  '5m': '5 minutes',
  '1h': '1 hour',
};

/**
 * Subagent prompt-cache TTL (`agentOrchestration.subagentPromptCacheTtl`, TASK_2026_597 N1). Same save model as
 * `CopilotAutoApproveToggleComponent`: the write is `state.saveSettings({orchestration:{subagentPromptCacheTtl}})` through
 * `SettingsSaveFeedbackService` (toast + Undo), and the select only ever shows the read-back value (D15). An unknown
 * outcome blanks the select and takes no writes until "Check saved setting again" reads the value. Outcomes are
 * reported only in the page toast: `save()` names a failed or unconfirmed write, and a saved write whose read-back
 * differs is announced here as an alert.
 *
 * When the host's `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL` is set (`subagentPromptCacheTtlEnvOverride`, read-only) the
 * select stays editable and a notice says the env var takes precedence, or that its value is invalid and ignored.
 */
@Component({
  selector: 'ptah-subagent-cache-ttl-setting',
  standalone: true,
  imports: [
    PtahButtonDirective,
    PtahRichSelectComponent,
    PtahAlertComponent,
    PtahFieldComponent,
    PtahFieldGridDirective,
    PtahFormSectionComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <ptah-form-section wide
        heading="Subagent prompt cache"
        description="How long the prompt cache of subagent requests stays valid."
        data-testid="subagent-cache-ttl-setting"
        data-glass-surface="content"
      >
        <div ptahFieldGrid>
          <ptah-field label="Subagent prompt-cache TTL" [hint]="envNotice() ? 'Your environment sets this value.' : null">
            <ptah-select #cacheSelect
              triggerId="subagent-cache-ttl"
              [options]="options"
              [value]="shown()"
              placeholder="Unknown"
              [disabled]="saving() || needsRecheck() || feedback.saving()"
              [attr.aria-describedby]="envNotice() ? 'subagent-cache-ttl-env' : null"
              (valueChange)="cacheSelect.value.set(shown()); select($event)"
              data-testid="subagent-cache-ttl"
            />
          </ptah-field>
        </div>
        @if (envNotice(); as notice) {
          <ptah-alert
            tone="info"
            [compact]="true"
            id="subagent-cache-ttl-env"
            data-testid="subagent-cache-ttl-env"
          >
            @if (notice.invalid) {
              <code class="font-mono">{{ envVar }}</code> has an invalid value
              and is ignored by Ptah.
            } @else {
              <code class="font-mono">{{ envVar }}={{ notice.value }}</code> is
              set in your environment and takes precedence.
            }
          </ptah-alert>
        }
        @if (saved() === null) {
          <p
            class="text-xs text-base-content-muted"
            role="status"
            data-testid="subagent-cache-ttl-unloaded"
          >
            The saved setting could not be read.
          </p>
        }
        @if (needsRecheck()) {
          <button
            type="button"
            ptahButton
            [busy]="saving()"
            (click)="recheck()"
            data-testid="subagent-cache-ttl-recheck"
          >
            Check saved setting again
          </button>
        }
      </ptah-form-section>
    </section>
  `,
  styles: `
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 1.25rem;
    }
  `,
})
export class SubagentCacheTtlSettingComponent {
  protected readonly envVar = ENV_VAR;
  protected readonly options = SUBAGENT_PROMPT_CACHE_TTL_SETTINGS.map(
    (value) => ({ value, label: LABELS[value] }),
  );
  private readonly state = inject(ProvidersSettingsStateService);
  protected readonly feedback = inject(SettingsSaveFeedbackService);

  /** The saved value as last read, or `null` when the orchestration read has no data. */
  protected readonly saved = computed(
    () => this.state.orchestration().data?.subagentPromptCacheTtl ?? null,
  );
  /** The env override notice, or `null` when the env var is unset (or the read has no data). */
  protected readonly envNotice = computed(() => {
    const value =
      this.state.orchestration().data?.subagentPromptCacheTtlEnvOverride;
    if (value === 'invalid') return { invalid: true, value };
    return value === '5m' || value === '1h' ? { invalid: false, value } : null;
  });
  /** True while this setting's write or re-read runs; the select is disabled meanwhile. */
  protected readonly saving = signal(false);
  /** A write's outcome is unknown: no value is shown and no write is taken until a re-read succeeds. */
  protected readonly unconfirmed = signal(false);
  protected readonly needsRecheck = computed(
    () => this.unconfirmed() || this.saved() === null,
  );
  /** What the select shows: the read-back value, or nothing while the last write's outcome is unknown. */
  protected readonly shown = computed(() =>
    this.unconfirmed() ? null : this.saved(),
  );

  async select(value: SubagentPromptCacheTtlSetting | null): Promise<void> {
    const saved = this.saved();
    const next = SUBAGENT_PROMPT_CACHE_TTL_SETTINGS.find(
      (option) => option === value,
    );
    // The select keeps showing the saved value; the read-back after the write moves it.
    const context = this.state.reviewContext();
    if (
      saved === null ||
      next === undefined ||
      next === saved ||
      this.saving() ||
      this.unconfirmed() ||
      !context
    )
      return;
    this.saving.set(true);
    try {
      // `refused`: another save in flight, nothing written; `started`: the commit describes this write; `threw`: the
      // outcome is unknown; `skipped`: never called.
      const result: { attempt: WriteAttempt } = { attempt: 'skipped' };
      const undo: { attempt: WriteAttempt } = { attempt: 'skipped' };
      const outcome = await this.feedback.save({
        label: LABEL,
        scope: 'global',
        write: () => this.write(next, context, result),
        // The Undo is a write too: it is reconciled the same way once its own toast is shown.
        undo: () => this.write(saved, context, undo),
        undoSettled: (undoOutcome) =>
          this.reconcile(undo.attempt, saved, undoOutcome),
      });
      this.reconcile(result.attempt, next, outcome);
    } finally {
      this.saving.set(false);
    }
  }

  /** Re-reads the saved value after an unconfirmed write; accepts writes again once it reads one. */
  async recheck(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await this.state.refreshOrchestration();
      if (
        this.state.orchestration().status === 'ready' &&
        this.saved() !== null
      ) {
        this.unconfirmed.set(false);
      } else {
        this.unconfirmed.set(true);
      }
    } finally {
      this.saving.set(false);
    }
  }

  private async write(
    value: SubagentPromptCacheTtlSetting,
    context: ProvidersEditContext,
    track: { attempt: WriteAttempt },
  ): Promise<boolean> {
    track.attempt = 'threw';
    const started = await this.state.saveSettings(
      { orchestration: { subagentPromptCacheTtl: value } },
      context,
    );
    track.attempt = started ? 'started' : 'refused';
    return started;
  }

  private reconcile(
    attempt: WriteAttempt,
    requested: SubagentPromptCacheTtlSetting,
    outcome: SettingsSaveResult,
  ): void {
    if (attempt === 'started') this.settle(requested, outcome === 'saved');
    else if (attempt === 'threw') this.unconfirmed.set(true);
  }

  /** `toastSaid`: the toast reported this write as saved, so a read-back mismatch needs its own alert. */
  private settle(
    requested: SubagentPromptCacheTtlSetting,
    toastSaid: boolean,
  ): void {
    if (this.state.commit().status === 'unconfirmed' || this.saved() === null) {
      this.unconfirmed.set(true);
      // The toast said "Saved", but nothing was read back: correct it.
      if (toastSaid) this.feedback.announce(NOT_CONFIRMED, 'alert');
      return;
    }
    if (toastSaid && this.saved() !== requested)
      this.feedback.announce(NOT_SAVED, 'alert');
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import {
  AppStateManager,
  ClaudeRpcService,
  LoggingService,
} from '@ptah-extension/core';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import {
  SettingsSaveFeedbackService,
  settingNotConfirmedMessage,
  settingNotSavedMessage,
} from '../feedback/settings-save-feedback.service';
import { parseDecisionModelStatus } from '../providers/decision-model-row.view';
import {
  PtahAlertComponent,
  PtahButtonDirective,
  PtahSettingRowComponent,
  PtahSkeletonComponent,
  PtahToggleDirective,
  PtahFormSectionComponent,
} from '@ptah-extension/ui';

const RPC_TIMEOUT_MS = 5_000;
const SETTING_KEY = 'agentOrchestration.hostRouting';
/** The visible label; the checkbox's `aria-label` is the same text. */
const LABEL = 'Routing suggestions';
/** The toast's field name ("Saved routing suggestions."). */
const TOAST_LABEL = 'routing suggestions';
const NOT_SAVED = `${settingNotSavedMessage(TOAST_LABEL)} The saved setting is unchanged.`;
const NOT_CONFIRMED = settingNotConfirmedMessage(TOAST_LABEL);
/** The read-back does not prove this write: an acknowledged write read back different, or a refused write read back equal. */
const NOT_APPLIED = `${settingNotSavedMessage(TOAST_LABEL)} The switch shows the saved value.`;

type WriteResult = { ok: true } | { ok: false; message: string };
type SetAnswer = 'acknowledged' | 'refused' | 'unknown';

/**
 * Routing suggestions (`agentOrchestration.hostRouting`, TASK_2026_857 Component 19). Electron only: the parent
 * mounts it under `isElectron`, because only the Electron host runs the routing coordinator.
 *
 * Reads `settings:get` (the stored flag; no stored value reads as the default `true`) and `agent:getConfig` (whether a
 * decision model is configured) in parallel. The setting is effective only with a decision model, so without one the
 * checkbox is unchecked and disabled with a note, and nothing is written; the stored value is left as it is.
 *
 * Writes go through `settings:set` and `SettingsSaveFeedbackService.saveGeneric` (toast + Undo); every write, and its
 * Undo, re-reads `settings:get`, so the checkbox only shows a value it read back, and "Saved" needs a read-back equal
 * to the requested value. A failed read shows Retry and takes no writes until a read succeeds.
 */
@Component({
  selector: 'ptah-host-routing-setting',
  standalone: true,
  imports: [
    SettingsBusyDisabledDirective,
    PtahButtonDirective,
    PtahAlertComponent,
    PtahSettingRowComponent,
    PtahSkeletonComponent,
    PtahToggleDirective,
    PtahFormSectionComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-form-section
      wide
      level="2"
      heading="Routing suggestions"
      description="Ptah suggests a lane for each task from its kind and size."
      data-glass-surface="content"
      class="flex flex-col gap-3 text-sm text-base-content"
      aria-labelledby="host-routing-heading"
      data-testid="host-routing-setting"
    >
      <div>
        <span id="host-routing-heading" hidden>{{ label }}</span>
        <ptah-setting-row
          label="Suggest a lane for each task"
          hint="Suggestions appear before a lane starts. You can always choose another lane."
          controlId="host-routing-toggle"
        >
          @if (load() === 'ready') {
            <input
              id="host-routing-toggle"
              type="checkbox"
              ptahToggle
              [checked]="effective()"
              [disabled]="!modelConfigured()"
              [ptahBusyDisabled]="saving() || feedback.saving()"
              [attr.aria-label]="label"
              [attr.aria-describedby]="describedBy()"
              (change)="toggle($event)"
              data-testid="host-routing-toggle"
            />
          }
        </ptah-setting-row>
        <p id="host-routing-help" class="sr-only">
          Before planning, Ptah checks whether the engineering task is agreed
          and suggests a task type, depth and available executors. Uses one
          decision-model call per message.
        </p>
      </div>

      @switch (load()) {
        @case ('loading') {
          <ptah-skeleton shape="lines" />
          <p
            class="text-xs text-base-content-muted"
            role="status"
            aria-live="polite"
            data-testid="host-routing-loading"
          >
            Loading routing suggestions…
          </p>
        }
        @case ('error') {
          <div class="space-y-1.5">
            <ptah-alert
              tone="error"
              live="assertive"
              [compact]="true"
              data-testid="host-routing-load-error"
              >The setting could not be read.</ptah-alert
            >
            <button
              type="button"
              ptahButton
              [busy]="saving()"
              (click)="reload()"
              data-testid="host-routing-retry"
            >
              Retry
            </button>
          </div>
        }
        @default {
          @if (!modelConfigured()) {
            <ptah-alert
              tone="warning"
              [compact]="true"
              id="host-routing-needs-model"
              data-testid="host-routing-needs-model"
            >
              Suggestions need a routing model. Choose one in Background models.
              <button
                alertAction
                ptahButton
                variant="ghost"
                tone="warning"
                type="button"
                (click)="chooseModel()"
              >
                Choose model
              </button>
            </ptah-alert>
          }
        }
      }
    </ptah-form-section>
  `,
  styles: `
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 1.25rem;
    }
  `,
})
export class HostRoutingSettingComponent implements OnInit {
  readonly modelConfiguredChange = output<boolean | null>();
  private readonly rpc = inject(ClaudeRpcService);
  private readonly appState = inject(AppStateManager);

  protected chooseModel(): void {
    this.appState.requestSettingsTab({
      tab: 'providers',
      section: 'background-models',
    });
  }
  private readonly logger = inject(LoggingService);
  protected readonly feedback = inject(SettingsSaveFeedbackService);

  protected readonly label = LABEL;

  /** The stored flag as last read; `null` when it could not be read. */
  private readonly stored = signal<boolean | null>(null);
  /** Whether a decision model is configured, as last read; `null` when it could not be read. */
  protected readonly modelConfigured = signal<boolean | null>(null);
  protected readonly load = signal<'loading' | 'ready' | 'error'>('loading');
  /** True while this row's write or read runs. */
  protected readonly saving = signal(false);

  /** Routing runs only with a decision model and a stored value that is not `false`. */
  protected readonly effective = computed(
    () => this.modelConfigured() === true && this.stored() !== false,
  );
  protected readonly describedBy = computed(() =>
    this.modelConfigured() === false
      ? 'host-routing-help host-routing-needs-model'
      : 'host-routing-help',
  );

  ngOnInit(): void {
    void this.reload();
  }

  /** Reads the stored flag and the decision model together; either failing shows Retry. */
  protected async reload(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.load.set('loading');
    try {
      const [stored, model] = await Promise.all([
        this.readStored(),
        this.readModelConfigured(),
      ]);
      this.stored.set(stored);
      this.modelConfigured.set(model);
      this.modelConfiguredChange.emit(model);
      this.load.set(stored !== null && model !== null ? 'ready' : 'error');
    } finally {
      this.saving.set(false);
    }
  }

  async toggle(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const current = this.effective();
    // The checkbox keeps showing the read value; the read-back after the write moves it.
    input.checked = current;
    if (
      this.load() !== 'ready' ||
      this.modelConfigured() !== true ||
      this.stored() === null ||
      this.saving() ||
      this.feedback.saving()
    )
      return;
    const next = !current;
    this.saving.set(true);
    try {
      await this.feedback.saveGeneric({
        label: TOAST_LABEL,
        write: () => this.write(next),
        undo: () => this.write(current),
      });
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * One `settings:set` write, then a `settings:get` re-read whatever the outcome. The read-back decides the result:
   * only a read value equal to `value` after a `settings:set` that was not refused is a save (toast + Undo); a failed
   * read is unconfirmed whatever `settings:set` answered; any other result is a failure without Undo, and the checkbox
   * shows the read value.
   */
  private async write(value: boolean): Promise<WriteResult> {
    const answer = await this.set(value);
    const stored = await this.readStored();
    this.stored.set(stored);
    if (stored === null) {
      this.load.set('error');
      return { ok: false, message: NOT_CONFIRMED };
    }
    // A refused write is never this user's save, even when the read-back matches.
    if (answer === 'refused') {
      return { ok: false, message: stored === value ? NOT_APPLIED : NOT_SAVED };
    }
    if (stored === value) return { ok: true };
    return {
      ok: false,
      message: answer === 'acknowledged' ? NOT_APPLIED : NOT_SAVED,
    };
  }

  /**
   * The `settings:set` answer: `acknowledged` only for a literal `success: true`, `refused` for any other answer,
   * `unknown` when the call threw (for example a timeout).
   */
  private async set(value: boolean): Promise<SetAnswer> {
    try {
      const response = await this.rpc.call(
        'settings:set',
        { key: SETTING_KEY, value },
        { timeout: RPC_TIMEOUT_MS },
      );
      // The RPC boundary is untrusted at runtime: only a literal `success: true` acknowledges the write.
      return response.isSuccess() && response.data.success === true
        ? 'acknowledged'
        : 'refused';
    } catch (error: unknown) {
      // degradation-audit: reported - the re-read in write() decides the toast and shows the real value.
      this.logger.warn('HostRoutingSetting', 'settings:set failed', {
        errorType: errorTypeOf(error),
      });
      return 'unknown';
    }
  }

  /** The stored flag; no stored value is the default `true`. `null` when the read failed or held another type. */
  private async readStored(): Promise<boolean | null> {
    try {
      const response = await this.rpc.call(
        'settings:get',
        { key: SETTING_KEY },
        { timeout: RPC_TIMEOUT_MS },
      );
      if (!response.isSuccess() || response.data.success !== true) return null;
      const value = response.data.value;
      if (value === undefined || value === null) return true;
      return typeof value === 'boolean' ? value : null;
    } catch (error: unknown) {
      // degradation-audit: reported - a failed read shows the error row with Retry.
      this.logger.warn('HostRoutingSetting', 'settings:get failed', {
        errorType: errorTypeOf(error),
      });
      return null;
    }
  }

  /** Whether `agent:getConfig` names a decision model; `null` when it could not be read. */
  private async readModelConfigured(): Promise<boolean | null> {
    try {
      const response = await this.rpc.call('agent:getConfig', undefined, {
        timeout: RPC_TIMEOUT_MS,
      });
      if (!response.isSuccess()) return null;
      const status = parseDecisionModelStatus(response.data.decisionModel);
      if (!status) return null;
      // `unset` + `unreachable` is the host's "selection not read" answer, not a real unset.
      if (status.selection.kind === 'unset')
        return status.state === 'unreachable' ? null : false;
      return true;
    } catch (error: unknown) {
      // degradation-audit: reported - a failed read shows the error row with Retry.
      this.logger.warn('HostRoutingSetting', 'agent:getConfig failed', {
        errorType: errorTypeOf(error),
      });
      return null;
    }
  }
}

/** A safe log classification: the constructor name, never the error's message, stack or fields. */
function errorTypeOf(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

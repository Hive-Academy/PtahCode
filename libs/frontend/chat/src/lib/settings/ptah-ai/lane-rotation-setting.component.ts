import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import type { AgentGetCapabilityMatrixParams } from '@ptah-extension/shared';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { RoutingDisplayNamesStore } from './routing-display-names.store';
import {
  SettingsSaveFeedbackService,
  settingNotConfirmedMessage,
  settingNotSavedMessage,
} from '../feedback/settings-save-feedback.service';
import {
  PtahButtonDirective,
  PtahSettingRowComponent,
  PtahSkeletonComponent,
  PtahToggleDirective,
  PtahFormSectionComponent,
  PtahBadgeDirective,
  PtahAlertComponent,
} from '@ptah-extension/ui';

const RPC_TIMEOUT_MS = 5_000;
const SETTING_KEY = 'agentOrchestration.laneRotation';
const LABEL = 'Rotate close executors';
const TOAST_LABEL = 'executor rotation';
const NOT_SAVED = `${settingNotSavedMessage(TOAST_LABEL)} The saved setting is unchanged.`;
const NOT_CONFIRMED = settingNotConfirmedMessage(TOAST_LABEL);
const NOT_APPLIED = `${settingNotSavedMessage(TOAST_LABEL)} The switch shows the saved value.`;

type WriteResult = { ok: true } | { ok: false; message: string };
type SetAnswer = 'acknowledged' | 'refused' | 'unknown';

/**
 * Lane rotation (`agentOrchestration.laneRotation`). Electron only: the parent
 * mounts it under `isElectron`, beside routing suggestions.
 *
 * Reads `settings:get`. No stored value is the default `true`. Writes go
 * through `settings:set` and `SettingsSaveFeedbackService.saveGeneric`. The
 * checkbox shows only a value it read back.
 */
@Component({
  selector: 'ptah-lane-rotation-setting',
  standalone: true,
  imports: [
    SettingsBusyDisabledDirective,
    PtahButtonDirective,
    PtahSettingRowComponent,
    PtahSkeletonComponent,
    PtahToggleDirective,
    PtahFormSectionComponent,
    PtahBadgeDirective,
    PtahAlertComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-form-section
      wide
      level="2"
      heading="Rotate close executors"
      description="When two lanes rate the same, Ptah takes turns between them."
      data-glass-surface="content"
      class="flex flex-col gap-3 text-sm text-base-content [container-type:inline-size]"
      aria-labelledby="lane-rotation-heading"
      data-testid="lane-rotation-setting"
    >
      <div>
        <span id="lane-rotation-heading" hidden>{{ label }}</span>
        <ptah-setting-row
          label="Take turns between close lanes"
          hint="Recent picks, newest first."
          controlId="lane-rotation-toggle"
        >
          @if (load() === 'ready' && stored() !== null) {
            <input
              id="lane-rotation-toggle"
              type="checkbox"
              ptahToggle
              [checked]="stored()"
              [ptahBusyDisabled]="saving() || feedback.saving()"
              [attr.aria-label]="label"
              aria-describedby="lane-rotation-help"
              (change)="toggle($event)"
              data-testid="lane-rotation-toggle"
            />
          }
        </ptah-setting-row>
        <p id="lane-rotation-help" class="sr-only">
          When several executors are equally suitable, Ptah cycles which one it
          picks. Off keeps the first candidate.
        </p>
        @if (lastPicks().length > 0) {
          <ul
            class="mt-3 flex flex-wrap gap-2"
            data-testid="lane-rotation-last-picks"
          >
            @for (pick of lastPicks(); track pick.key) {
              <li>
                <span
                  ptahBadge
                  [title]="names.route(pick.key).text + ': ' + pick.candidateId"
                  >{{ chipRoute(pick.key) }}: {{ names.executor(pick.candidateId).text }}</span
                >
              </li>
            }
          </ul>
        } @else if (load() === 'ready' && !lastPicksUnavailable()) {
          <p class="mt-2 text-xs text-base-content-muted">
            No recent picks yet
          </p>
        }
        @if (lastPicksUnavailable()) {
          <ptah-alert tone="warning" [compact]="true" live="polite">
            Recent picks unavailable
            <button
              alertAction
              type="button"
              ptahButton
              variant="ghost"
              (click)="retryPicks()"
            >
              Retry
            </button>
          </ptah-alert>
        }
      </div>

      @switch (load()) {
        @case ('loading') {
          <ptah-skeleton shape="lines" />
          <p
            class="text-xs text-base-content-muted"
            role="status"
            aria-live="polite"
            data-testid="lane-rotation-loading"
          >
            Loading executor rotation…
          </p>
        }
        @case ('error') {
          <div role="alert" class="space-y-1.5">
            <ptah-alert
              tone="error"
              [compact]="true"
              data-testid="lane-rotation-load-error"
            >
              The setting could not be read.
            </ptah-alert>
            <button
              type="button"
              ptahButton
              [busy]="saving()"
              (click)="reload()"
              data-testid="lane-rotation-retry"
            >
              Retry
            </button>
          </div>
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
export class LaneRotationSettingComponent implements OnInit {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly logger = inject(LoggingService);
  protected readonly feedback = inject(SettingsSaveFeedbackService);
  protected readonly names = inject(RoutingDisplayNamesStore);

  protected readonly label = LABEL;

  /** Chip label: "Research" for 'research|research' (task kind once); the title keeps the full route. */
  protected chipRoute(key: string): string {
    const text = this.names.route(key).text;
    const [first, second] = text.split(' · ');
    return second !== undefined && first.toLowerCase() === second.toLowerCase() ? first : text;
  }
  protected readonly stored = signal<boolean | null>(null);
  protected readonly load = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal(false);
  protected readonly lastPicks = signal<
    readonly { key: string; candidateId: string }[]
  >([]);
  protected readonly lastPicksUnavailable = signal(false);

  ngOnInit(): void {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.load.set('loading');
    try {
      const stored = await this.readStored();
      this.stored.set(stored);
      this.load.set(stored === null ? 'error' : 'ready');
      if (stored !== null) await this.readLastPicks();
    } finally {
      this.saving.set(false);
    }
  }

  private async readLastPicks(): Promise<void> {
    try {
      const params: AgentGetCapabilityMatrixParams = {};
      const response = await this.rpc.call(
        'agent:getCapabilityMatrix',
        params,
        { timeout: RPC_TIMEOUT_MS },
      );
      if (response.isSuccess()) {
        this.lastPicks.set([...(response.data.lastPicks ?? [])].reverse());
        this.lastPicksUnavailable.set(response.data.lastPicksUnavailable === true);
      } else {
        this.lastPicksUnavailable.set(true);
      }
    } catch (error: unknown) {
      // degradation-audit: reported - rotation history is optional while the setting remains usable.
      this.logger.warn('LaneRotationSetting', 'rotation history read failed', {
        errorType: errorTypeOf(error),
      });
      this.lastPicksUnavailable.set(true);
    }
  }

  protected async retryPicks(): Promise<void> {
    this.lastPicksUnavailable.set(false);
    await this.readLastPicks();
  }

  async toggle(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const current = this.stored();
    input.checked = current === true;
    if (
      this.load() !== 'ready' ||
      current === null ||
      this.saving() ||
      this.feedback.saving()
    ) {
      return;
    }
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

  private async write(value: boolean): Promise<WriteResult> {
    const answer = await this.set(value);
    const stored = await this.readStored();
    this.stored.set(stored);
    if (stored === null) {
      this.load.set('error');
      return { ok: false, message: NOT_CONFIRMED };
    }
    if (answer === 'refused') {
      return { ok: false, message: stored === value ? NOT_APPLIED : NOT_SAVED };
    }
    if (stored === value) return { ok: true };
    return {
      ok: false,
      message: answer === 'acknowledged' ? NOT_APPLIED : NOT_SAVED,
    };
  }

  private async set(value: boolean): Promise<SetAnswer> {
    try {
      const response = await this.rpc.call(
        'settings:set',
        { key: SETTING_KEY, value },
        { timeout: RPC_TIMEOUT_MS },
      );
      return response.isSuccess() && response.data.success === true
        ? 'acknowledged'
        : 'refused';
    } catch (error: unknown) {
      // degradation-audit: reported - the re-read in write() decides the toast and shows the real value.
      this.logger.warn('LaneRotationSetting', 'settings:set failed', {
        errorType: errorTypeOf(error),
      });
      return 'unknown';
    }
  }

  /** The stored flag. No stored value is the default `true`. */
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
      this.logger.warn('LaneRotationSetting', 'settings:get failed', {
        errorType: errorTypeOf(error),
      });
      return null;
    }
  }
}

function errorTypeOf(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

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

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';
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
  imports: [SettingsBusyDisabledDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      data-glass-surface="content"
      class="flex flex-col gap-3 text-sm text-base-content [container-type:inline-size]"
      aria-labelledby="lane-rotation-heading"
      data-testid="lane-rotation-setting"
    >
      <div class="border-b border-base-content/10 pb-2">
        <div class="flex items-center justify-between gap-3">
          <label
            id="lane-rotation-heading"
            for="lane-rotation-toggle"
            class="text-base font-semibold text-base-content"
            >{{ label }}</label
          >
          @if (load() === 'ready' && stored() !== null) {
            <input
              id="lane-rotation-toggle"
              type="checkbox"
              [class]="'toggle toggle-xs toggle-success ' + focusRing"
              [checked]="stored()"
              [ptahBusyDisabled]="saving() || feedback.saving()"
              [attr.aria-label]="label"
              aria-describedby="lane-rotation-help"
              (change)="toggle($event)"
              data-testid="lane-rotation-toggle"
            />
          }
        </div>
        <p
          id="lane-rotation-help"
          class="mt-0.5 text-xs text-base-content-muted"
        >
          When several executors are equally suitable, Ptah cycles which one
          it picks. Off keeps the first candidate.
        </p>
        @if (lastPicks().length > 0) {
          <ul class="rotation-picks mt-3 grid grid-cols-1 gap-2 text-xs" data-testid="lane-rotation-last-picks">
            @for (pick of lastPicks(); track pick.key) {
              <li class="min-h-11 rounded-lg border border-base-content/20 bg-base-200/40 p-2">
                <span class="block text-base-content-muted">Last pick ({{ names.route(pick.key).text }})</span>
                <span class="font-medium text-base-content">{{ names.executor(pick.candidateId).text }}</span>
                @if (names.executor(pick.candidateId).raw; as raw) {
                  <details class="mt-1"><summary class="flex min-h-11 cursor-pointer items-center">ID details</summary><code class="break-all">{{ raw }}</code></details>
                }
              </li>
            }
          </ul>
        } @else if (load() === 'ready' && !lastPicksUnavailable()) {
          <p class="mt-2 text-xs text-base-content-muted">No recent picks yet</p>
        }
        @if (lastPicksUnavailable()) {
          <div class="mt-2 flex items-center gap-2 text-xs text-warning" role="status">Recent picks unavailable
            <button type="button" class="btn btn-outline btn-sm" (click)="retryPicks()">Retry</button>
          </div>
        }
      </div>

      @switch (load()) {
        @case ('loading') {
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
            <p data-testid="lane-rotation-load-error">
              The setting could not be read.
            </p>
            <button
              type="button"
              [class]="
                'btn btn-outline btn-sm border-base-content-muted text-base-content ' +
                focusRing
              "
              [ptahBusyDisabled]="saving()"
              (click)="reload()"
              data-testid="lane-rotation-retry"
            >
              Retry
            </button>
          </div>
        }
      }
    </section>
  `,
  styles: `
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 1.25rem;
    }
    @container (min-width: 480px) { .rotation-picks { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @container (min-width: 850px) { .rotation-picks { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `,
})
export class LaneRotationSettingComponent implements OnInit {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly logger = inject(LoggingService);
  protected readonly feedback = inject(SettingsSaveFeedbackService);
  protected readonly names = inject(RoutingDisplayNamesStore);

  protected readonly focusRing = FOCUS;
  protected readonly label = LABEL;
  protected readonly stored = signal<boolean | null>(null);
  protected readonly load = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal(false);
  protected readonly lastPicks = signal<readonly { key: string; candidateId: string }[]>([]);
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
      const response = await this.rpc.call('agent:getCapabilityMatrix', params, { timeout: RPC_TIMEOUT_MS });
      if (response.isSuccess()) {
        this.lastPicks.set(response.data.lastPicks ?? []);
        this.lastPicksUnavailable.set(response.data.lastPicksUnavailable === true || response.data.lastPicks === undefined);
      } else {
        this.lastPicksUnavailable.set(true);
      }
    } catch (error: unknown) {
      // degradation-audit: reported - rotation history is optional while the setting remains usable.
      this.logger.warn('LaneRotationSetting', 'rotation history read failed', { errorType: errorTypeOf(error) });
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

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import {
  PtahAlertComponent,
  PtahButtonDirective,
  PtahSettingRowComponent,
  PtahSkeletonComponent,
  PtahToggleDirective,
} from '@ptah-extension/ui';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import {
  SettingsSaveFeedbackService,
  settingNotConfirmedMessage,
  settingNotSavedMessage,
  type SettingsGenericWriteResult,
} from '../feedback/settings-save-feedback.service';

const SETTING_KEY = 'agentOrchestration.performanceRouting';
const RPC_OPTIONS = { timeout: 5_000 };
const TOAST_LABEL = 'performance routing';

@Component({
  selector: 'ptah-performance-routing-setting',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahAlertComponent,
    PtahButtonDirective,
    PtahSettingRowComponent,
    PtahSkeletonComponent,
    PtahToggleDirective,
    SettingsBusyDisabledDirective,
  ],
  template: `
    <div class="flex flex-col gap-ptah-controls text-sm text-base-content">
      @let value = stored();
      <div>
        <ptah-setting-row
          label="Use measured performance"
          hint="Use recent outcomes to rank lane, model and effort choices."
          [controlId]="value !== 'loading' && value !== 'error' ? 'performance-routing-toggle' : null"
        >
          @if (value !== 'loading' && value !== 'error') {
            <input
              id="performance-routing-toggle"
              type="checkbox"
              ptahToggle
              aria-describedby="performance-routing-toggle-hint"
              [checked]="value"
              [ptahBusyDisabled]="feedback.saving()"
              (change)="toggle($event)"
              data-testid="performance-routing-toggle"
            />
          }
        </ptah-setting-row>
      </div>
      @if (value === 'loading') {
        <ptah-skeleton shape="lines" />
        <p class="sr-only" role="status">Loading performance routing…</p>
      } @else if (value === 'error') {
        <ptah-alert tone="error" [compact]="true" live="polite">
          Performance routing could not be read.
          <button
            alertAction
            type="button"
            ptahButton
            variant="ghost"
            (click)="reload()"
          >
            Retry
          </button>
        </ptah-alert>
      }
    </div>
  `,
})
export class PerformanceRoutingSettingComponent implements OnInit {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly logger = inject(LoggingService);
  protected readonly feedback = inject(SettingsSaveFeedbackService);
  protected readonly stored = signal<boolean | 'loading' | 'error'>('loading');

  ngOnInit(): void {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.stored.set('loading');
    this.stored.set(await this.readStored());
  }

  protected async toggle(event: Event): Promise<void> {
    if (!(event.target instanceof HTMLInputElement)) return;
    const previous = this.stored();
    if (typeof previous !== 'boolean') return;
    event.target.checked = previous;
    if (this.feedback.saving()) return;
    await this.feedback.saveGeneric({
      label: TOAST_LABEL,
      write: () => this.write(!previous),
      undo: () => this.write(previous),
    });
  }

  private async write(value: boolean): Promise<SettingsGenericWriteResult> {
    const accepted = await this.setStored(value);
    const stored = await this.readStored();
    this.stored.set(stored);
    if (stored === 'error') {
      return { ok: false, message: settingNotConfirmedMessage(TOAST_LABEL) };
    }
    if (accepted !== false && stored === value) return { ok: true };
    return {
      ok: false,
      message: `${settingNotSavedMessage(TOAST_LABEL)} The switch shows the saved value.`,
    };
  }

  /** An interrupted response leaves success unknown until read-back. */
  private async setStored(value: boolean): Promise<boolean | null> {
    try {
      const response = await this.rpc.call(
        'settings:set',
        { key: SETTING_KEY, value },
        RPC_OPTIONS,
      );
      return response.isSuccess() && response.data.success === true;
    } catch {
      // degradation-audit: reported - read-back determines the displayed value and feedback.
      this.logger.warn('PerformanceRoutingSetting', 'settings:set failed');
      return null;
    }
  }

  private async readStored(): Promise<boolean | 'error'> {
    try {
      const response = await this.rpc.call(
        'settings:get',
        { key: SETTING_KEY },
        RPC_OPTIONS,
      );
      if (!response.isSuccess() || response.data.success !== true) return 'error';
      const value = response.data.value;
      if (value === undefined || value === null) return true;
      return typeof value === 'boolean' ? value : 'error';
    } catch {
      // degradation-audit: reported - the control shows a retryable read error.
      this.logger.warn('PerformanceRoutingSetting', 'settings:get failed');
      return 'error';
    }
  }
}

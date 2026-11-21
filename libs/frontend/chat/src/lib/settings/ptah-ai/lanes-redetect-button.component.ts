import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Loader2, LucideAngularModule, RefreshCw } from 'lucide-angular';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import { PtahIconButtonDirective } from '@ptah-extension/ui';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';

const DETECT_FAILED =
  'Could not re-detect CLI agents. Your saved settings have not changed.';

/**
 * The icon-only "Re-detect CLIs" button of the Lanes card (CLI group header and Add more strip header).
 * It runs `state.redetectClis()` and announces the result through the page toast: a fixed sentence, never
 * the host error text.
 */
@Component({
  selector: 'ptah-lanes-redetect-button',
  standalone: true,
  imports: [LucideAngularModule, PtahIconButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <button
      type="button"
      ptahIconButton
      size="xs"
      label="Re-detect CLIs"
      [busy]="detecting()"
      [attr.data-testid]="testId()"
      (click)="redetect()"
    >
      <lucide-angular
        [img]="detecting() ? BusyIcon : RefreshIcon"
        class="h-3.5 w-3.5"
        [class.animate-spin]="detecting()"
        aria-hidden="true"
      />
    </button>
  `,
})
export class LanesRedetectButtonComponent {
  protected readonly RefreshIcon = RefreshCw;
  protected readonly BusyIcon = Loader2;

  /** `policy-redetect` in the CLI group header; `lanes-strip-redetect` in the Add more strip. */
  readonly testId = input('policy-redetect');

  private readonly state = inject(ProvidersSettingsStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService);

  private readonly redetecting = signal(false);
  protected readonly detecting = computed(
    () =>
      this.redetecting() ||
      // Shared with the install guides: pending until any running Re-detect's read-backs end.
      this.state.cliRedetecting() ||
      this.state.cliDetection().status === 'loading',
  );

  protected async redetect(): Promise<void> {
    if (this.detecting()) return;
    this.redetecting.set(true);
    let ok = false;
    try {
      ok = await this.state.redetectClis();
    } catch (error: unknown) {
      // degradation-audit: reported - the toast says re-detect failed.
      // The state settles its own read failures; a throw means the command itself broke.
      void error;
    } finally {
      this.redetecting.set(false);
    }
    if (ok) this.feedback.announce('CLI agents re-detected.', 'status');
    else this.feedback.announce(DETECT_FAILED, 'alert');
  }
}

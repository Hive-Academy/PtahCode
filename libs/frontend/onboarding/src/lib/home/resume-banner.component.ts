import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { ArrowRight, LucideAngularModule, Play } from 'lucide-angular';
import { SetupActionDirective } from '@ptah-extension/ui';
import {
  RunStatusChipComponent,
  type OnboardingRunChipState,
} from '../shared/run-status-chip.component';

@Component({
  selector: 'ptah-resume-banner',
  standalone: true,
  imports: [LucideAngularModule, RunStatusChipComponent, SetupActionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="flex flex-wrap items-center gap-3 rounded-[14px] border p-4"
      [class.border-state-run]="state() === 'running'"
      [class.border-state-need]="state() !== 'running'"
      data-glass-surface="chrome"
      [attr.aria-label]="ariaLabel()"
    >
      <ptah-run-status-chip [state]="state()" />
      <div class="min-w-0 flex-1">
        <p class="font-medium">{{ title() }}</p>
        @if (detail(); as fact) {
          <p class="text-sm text-base-content-muted">{{ fact }}</p>
        }
      </div>
      <button
        type="button"
        [ptahSetupAction]="'glass'"
        (click)="resumeRequested.emit()"
      >
        <lucide-angular
          [img]="actionIcon()"
          class="size-4"
          aria-hidden="true"
        />{{ actionLabel() }}
      </button>
    </section>
  `,
})
export class ResumeBannerComponent {
  readonly state = input<OnboardingRunChipState>('resumable');
  readonly title = input.required<string>();
  readonly detail = input<string | null>(null);
  readonly resumeRequested = output<void>();
  protected readonly icons = {
    play: Play,
    arrowRight: ArrowRight,
  } as const;
  protected readonly ariaLabel = computed(() => {
    const current = this.state();
    if (current === 'running') return 'Active run in progress';
    if (current === 'cancelling') return 'Stopping run';
    return 'Continue an interrupted run';
  });
  protected readonly isActive = computed(
    () => this.state() === 'running' || this.state() === 'cancelling',
  );
  protected readonly actionLabel = computed(() =>
    this.isActive() ? 'View' : 'Resume',
  );
  protected readonly actionIcon = computed(() =>
    this.isActive() ? this.icons.arrowRight : this.icons.play,
  );
}

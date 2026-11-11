import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  LoaderCircle,
  LucideAngularModule,
  Play,
  RotateCcw,
  Square,
} from 'lucide-angular';
import {
  safeFailureCopy,
  type GenerationViewState,
} from '@ptah-extension/setup-wizard';
import {
  RunStatusChipComponent,
  type OnboardingRunChipState,
} from './run-status-chip.component';
import {
  StatusCardComponent,
  type StatusCardTone,
} from './status-card.component';
import { PtahButtonDirective } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-run-panel',
  standalone: true,
  imports: [
    RunStatusChipComponent,
    StatusCardComponent,
    LucideAngularModule,
    PtahButtonDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ptah-status-card
      [tone]="tone()"
      [label]="title()"
      [busy]="state() === 'running' || state() === 'cancelling'"
    >
      <lucide-angular
        statusIcon
        [img]="statusIcon()"
        class="size-5"
        aria-hidden="true"
      />
      <h2 statusTitle class="flex flex-wrap items-center gap-2">
        <span>{{ title() }}</span
        ><ptah-run-status-chip [state]="state()" />
      </h2>
      <span statusSub>{{ message() }}</span>
      @if (safeError(); as errorText) {
        <p class="mt-3 text-sm text-base-content" role="alert">
          {{ errorText }}
        </p>
      }
      <ng-content />
      <div statusActions class="flex flex-wrap gap-2">
        @if (state() === 'running') {
          <button
            type="button"
            class="btn btn-outline btn-sm min-h-8 border-state-err text-base-content"
            (click)="stop.emit()"
          >
            <lucide-angular
              [img]="icons.stop"
              class="size-4"
              aria-hidden="true"
            />Stop
          </button>
        } @else if (state() === 'failed' || needsStopRecovery()) {
          <button
            ptahButton
            variant="primary"
            type="button"
            (click)="retry.emit()"
          >
            <lucide-angular
              [img]="icons.retry"
              class="size-4"
              aria-hidden="true"
            />Retry
          </button>
          <button
            ptahButton
            variant="ghost"
            type="button"
            (click)="startOver.emit()"
          >
            Start over
          </button>
        } @else if (state() === 'resumable') {
          <button
            ptahButton
            variant="primary"
            type="button"
            (click)="resumeRequested.emit()"
          >
            <lucide-angular
              [img]="icons.play"
              class="size-4"
              aria-hidden="true"
            />Resume
          </button>
        } @else if (state() === 'done') {
          <button
            ptahButton
            variant="primary"
            type="button"
            (click)="continueRun.emit()"
          >
            {{ continueLabel() }}
          </button>
        }
      </div>
    </ptah-status-card>
  `,
})
export class RunPanelComponent {
  readonly state = input.required<OnboardingRunChipState>();
  readonly viewState = input<GenerationViewState | null>(null);
  readonly title = input.required<string>();
  readonly message = input<string>('');
  readonly continueLabel = input('Continue');
  protected readonly tone = computed<StatusCardTone>(() => {
    switch (this.state()) {
      case 'running':
        return 'run';
      case 'cancelling':
      case 'resumable':
        return 'need';
      case 'failed':
        return 'err';
      case 'done':
        return 'done';
      default:
        return 'idle';
    }
  });
  protected readonly statusIcon = computed(() => {
    switch (this.tone()) {
      case 'run':
        return LoaderCircle;
      case 'need':
        return CircleDashed;
      case 'err':
        return CircleX;
      case 'done':
        return CircleCheck;
      case 'idle':
        return CircleDashed;
    }
  });
  readonly error = input<string | null>(null);
  protected readonly safeError = computed(() => {
    const raw = this.error();
    return raw === null
      ? null
      : safeFailureCopy(raw, 'The run could not be completed. Try again.');
  });
  protected readonly needsStopRecovery = computed(
    () =>
      this.state() === 'cancelling' &&
      (this.viewState() === 'stop-unconfirmed' ||
        this.viewState() === 'stop-unknown'),
  );
  readonly stop = output<void>();
  readonly retry = output<void>();
  readonly startOver = output<void>();
  readonly resumeRequested = output<void>();
  readonly continueRun = output<void>();
  protected readonly icons = {
    stop: Square,
    retry: RotateCcw,
    play: Play,
  } as const;
}

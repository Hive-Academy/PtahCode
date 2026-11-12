import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import type { GuidanceCommittedResult } from '../services/guidance-generation.store';
import { PtahButtonDirective, PtahToggleDirective } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-guidance-result-panel',
  standalone: true,
  imports: [DatePipe, PtahButtonDirective, PtahToggleDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-lg border border-base-300 bg-base-200 p-4"
      aria-labelledby="guidance-result-title"
    >
      <h2 id="guidance-result-title" class="font-semibold">Saved guidance</h2>
      @if (result(); as saved) {
        <p class="text-sm">
          Last saved:
          {{
            saved.generatedAt
              ? (saved.generatedAt | date: 'medium')
              : 'Date unavailable'
          }}
        </p>
        <p class="text-sm text-base-content-muted">
          {{ saved.cacheValid ? 'Cache is current' : 'Cache needs refreshing' }}
        </p>
        <label class="flex cursor-pointer items-center justify-start gap-2">
          <input
            #enabledToggle
            type="checkbox"
            ptahToggle
            [checked]="saved.enabled"
            (change)="
              enabledChanged.emit(enabledToggle.checked);
              enabledToggle.checked = saved.enabled
            "
            aria-label="Enable project guidance"
          />
          <span>Use project guidance</span>
        </label>
        <div class="flex flex-wrap gap-2">
          <button ptahButton type="button" (click)="cacheRequested.emit()">
            Refresh cache status
          </button>
          <button ptahButton type="button" (click)="contentRequested.emit()">
            View content
          </button>
          <button ptahButton type="button" (click)="downloadRequested.emit()">
            Download
          </button>
          @if (!runActive()) {
            <button
              ptahButton
              variant="primary"
              type="button"
              (click)="regenerateRequested.emit()"
            >
              Regenerate guidance
            </button>
          }
        </div>
      } @else {
        <p class="text-sm text-base-content-muted">
          No saved guidance is available yet.
        </p>
      }
      @if (showSkip()) {
        <button
          ptahButton
          variant="ghost"
          type="button"
          class="mt-2"
          (click)="skipRequested.emit()"
        >
          Skip guidance
        </button>
      }
    </section>
  `,
})
export class GuidanceResultPanelComponent {
  readonly runActive = input(false);
  readonly showSkip = input(false);
  readonly result = input<GuidanceCommittedResult | null>(null);
  readonly enabledChanged = output<boolean>();
  readonly cacheRequested = output<void>();
  readonly contentRequested = output<void>();
  readonly downloadRequested = output<void>();
  readonly regenerateRequested = output<void>();
  readonly skipRequested = output<void>();
}

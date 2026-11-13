import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PtahButtonDirective } from '../button/button.directive';

export type PtahPanelState = 'loading' | 'empty' | 'error' | 'partial' | 'no-permission';

@Component({
  selector: 'ptah-state-panel', standalone: true, imports: [PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (state() === 'partial') {
    <div class="alert alert-warning mb-4 text-xs rounded-[var(--ptah-card-radius)]" role="status"><div>
      @if (title()) { <h2 class="text-sm font-semibold">{{ title() }}</h2> }
      @if (body()) { <p class="mt-2">{{ body() }}</p> }
      @if (actionLabel()) { <button ptahButton type="button" class="mt-4" (click)="action.emit()">{{ actionLabel() }}</button> }
    </div></div>
    <ng-content />
  } @else { <section class="surface-1 rounded-[var(--ptah-card-radius)] mx-auto min-h-32 max-w-sm px-4 py-10 text-center text-xs" [attr.aria-busy]="state() === 'loading' ? 'true' : null" [attr.role]="state() === 'error' ? 'alert' : null">
    @if (state() === 'loading') { <h2 class="sr-only">{{ title() || 'Loading' }}</h2><div class="space-y-3" aria-hidden="true"><div class="skeleton h-3 w-full"></div><div class="skeleton h-3 w-5/6"></div><div class="skeleton h-3 w-4/6"></div></div> }
    @else { @if (title()) { <h2 class="text-sm font-semibold">{{ title() }}</h2> } @if (body()) { <p class="mt-2 text-base-content-muted">{{ body() }}</p> }
      @if (actionLabel()) { <button ptahButton type="button" class="mt-4" (click)="action.emit()">{{ actionLabel() }}</button> }
    }
  </section> }`,
})
export class PtahStatePanelComponent {
  readonly state = input.required<PtahPanelState>();
  readonly title = input<string | null>(null);
  readonly body = input<string | null>(null);
  readonly actionLabel = input<string | null>(null);
  readonly action = output<void>();
}

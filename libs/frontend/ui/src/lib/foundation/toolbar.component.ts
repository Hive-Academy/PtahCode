import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PtahFieldControlDirective } from '../surfaces/field-control.directive';

@Component({
  selector: 'ptah-toolbar', standalone: true, imports: [PtahFieldControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-ptah-controls gap-y-ptah-controls border-b border-surface-border bg-[var(--surface-1)] px-ptah-surface pt-ptah-surface pb-ptah-controls">
    <input ptahFieldControl type="search" aria-label="Search" class="min-w-0 w-full text-xs" [placeholder]="placeholder()" [value]="query()" (input)="onInput($event)" />
    <span class="min-w-32 text-xs empty:hidden [&_select]:text-xs"><ng-content select="[sort]" /></span>
    <span class="flex items-center gap-ptah-controls empty:hidden"><ng-content select="[filters]" /></span>
    @if (count() !== null) { <span class="justify-self-end text-xs tabular-nums text-base-content-muted" aria-live="polite">{{ count() }} results</span> }
  </div>`,
})
export class PtahToolbarComponent {
  readonly query = input('');
  readonly placeholder = input('Search');
  readonly queryChange = output<string>();
  readonly count = input<number | null>(null);
  onInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.queryChange.emit(event.target.value);
  }
}

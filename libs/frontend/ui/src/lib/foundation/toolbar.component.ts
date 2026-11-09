import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PtahFieldControlDirective } from '../surfaces/field-control.directive';

@Component({
  selector: 'ptah-toolbar', standalone: true, imports: [PtahFieldControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div data-glass-surface="bar" class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-surface-border p-2">
    <input ptahFieldControl type="search" aria-label="Search" class="min-w-40 flex-1 text-xs" [placeholder]="placeholder()" [value]="query()" (input)="onInput($event)" />
    <ng-content select="[filters]" /><span class="text-xs [&_select]:text-xs"><ng-content select="[sort]" /></span>
    @if (count() !== null) { <span class="ml-auto text-xs tabular-nums text-base-content-muted" aria-live="polite">{{ count() }} results</span> }
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

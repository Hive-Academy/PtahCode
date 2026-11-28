import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideAngularModule, Search } from 'lucide-angular';
import { PtahInputDirective } from '@ptah-extension/ui';

/**
 * Compact search field shared by the dashboard table and list. The visible
 * placeholder is a hint only; the accessible name comes from `aria-label`.
 */
@Component({
  selector: 'ptah-dashboard-collection-filter',
  standalone: true,
  imports: [LucideAngularModule, PtahInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <lucide-angular [img]="searchIcon" aria-hidden="true"
      class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-base-content-muted" />
    <input #field [id]="inputId()" type="search" ptahInput size="sm" class="w-full pl-7"
      [placeholder]="placeholder()" [attr.aria-label]="'Filter ' + accessibleName()"
      [value]="value()" [attr.data-apps-focus-key]="focusKey()" (input)="valueChange.emit(field.value)" />
  `,
})
export class DashboardCollectionFilterComponent {
  public readonly inputId = input.required<string>();
  public readonly accessibleName = input.required<string>();
  public readonly placeholder = input('Filter');
  public readonly value = input('');
  public readonly focusKey = input.required<string>();
  public readonly valueChange = output<string>();
  public readonly searchIcon = Search;
}

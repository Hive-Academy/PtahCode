import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PtahButtonDirective } from '../button/button.directive';

@Component({
  selector: 'ptah-page-header', standalone: true, imports: [PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header data-glass-surface="bar" class="flex flex-wrap items-center gap-3 border-b border-surface-border px-4 py-3">
    @if (backLabel()) { <button ptahButton variant="ghost" size="xs" type="button" (click)="back.emit()"><svg aria-hidden="true" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg><span>{{ backLabel() }}</span></button> }
    <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h1 class="text-lg font-semibold tracking-tight">{{ title() }}</h1><ng-content select="[status]" /></div>
    @if (description()) { <p class="text-xs text-base-content-muted">{{ description() }}</p> }</div>
    <ng-content select="[actions]" />
  </header>`,
})
export class PtahPageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly backLabel = input<string | null>(null);
  readonly back = output<void>();
}

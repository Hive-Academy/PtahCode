import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PtahAlertTone = 'info' | 'success' | 'warning' | 'error';

@Component({
  selector: 'ptah-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="alert rounded-[var(--ptah-card-radius)]" [class.alert-info]="tone() === 'info'" [class.alert-success]="tone() === 'success'" [class.alert-warning]="tone() === 'warning'" [class.alert-error]="tone() === 'error'" [class.p-2]="compact()" [class.text-xs]="compact()" [attr.role]="tone() === 'warning' || tone() === 'error' ? 'alert' : 'status'"><div>@if (title()) { <h2 class="text-sm font-semibold">{{ title() }}</h2> }<ng-content /></div><ng-content select="[alertAction]" /></div>`,
})
export class PtahAlertComponent {
  readonly tone = input<PtahAlertTone>('info');
  readonly title = input<string | null>(null);
  readonly compact = input(false);
}

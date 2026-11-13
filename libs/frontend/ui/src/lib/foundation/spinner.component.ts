import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PtahSpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type PtahSpinnerKind = 'spinner' | 'dots' | 'ring';

@Component({
  selector: 'ptah-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="loading" [class.loading-spinner]="kind() === 'spinner'" [class.loading-dots]="kind() === 'dots'" [class.loading-ring]="kind() === 'ring'" [class.loading-xs]="size() === 'xs'" [class.loading-sm]="size() === 'sm'" [class.loading-md]="size() === 'md'" [class.loading-lg]="size() === 'lg'" [attr.aria-hidden]="label() === null ? 'true' : null" [attr.role]="label() === null ? null : 'status'"><span class="sr-only">{{ label() }}</span></span>`,
})
export class PtahSpinnerComponent {
  readonly size = input<PtahSpinnerSize>('sm');
  readonly kind = input<PtahSpinnerKind>('spinner');
  readonly label = input<string | null>(null);
}

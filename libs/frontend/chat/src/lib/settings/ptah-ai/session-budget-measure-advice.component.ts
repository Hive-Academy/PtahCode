import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PtahAlertComponent, PtahButtonDirective } from '@ptah-extension/ui';

/** Compact advice spanning the budget fields. */
@Component({
  selector: 'ptah-session-budget-measure-advice',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahAlertComponent, PtahButtonDirective],
  template: `
    <ptah-alert tone="info" [compact]="true" data-testid="session-budget-token-measure-recommendation">
      Weighted session tokens are recommended. Switching keeps your saved token budget unchanged.
      <div alertAction class="flex flex-wrap gap-[var(--ptah-gap-label)]">
        <button type="button" ptahButton variant="ghost" size="xs" [disabled]="busy()"
          (click)="switchMeasure.emit()" data-testid="session-budget-token-measure-switch">Switch to weighted</button>
        <button type="button" ptahButton variant="ghost" size="xs" (click)="dismissAdvice.emit()">Dismiss</button>
      </div>
    </ptah-alert>
  `,
})
export class SessionBudgetMeasureAdviceComponent {
  readonly busy = input(false);
  readonly switchMeasure = output<void>();
  readonly dismissAdvice = output<void>();
}

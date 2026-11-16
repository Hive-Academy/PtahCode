import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  PtahAlertComponent,
  PtahButtonDirective,
  PtahSkeletonComponent,
  PtahStatePanelComponent,
} from '@ptah-extension/ui';

export type SettingsSectionState = 'loading' | 'error' | 'ready' | 'empty';

@Component({
  selector: 'ptah-settings-section-state',
  standalone: true,
  imports: [
    PtahAlertComponent,
    PtahButtonDirective,
    PtahSkeletonComponent,
    PtahStatePanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div role="status" aria-label="Loading" aria-busy="true">
          <ptah-skeleton [lines]="skeletonLines()" />
        </div>
      }
      @case ('error') {
        <ptah-alert tone="error" [compact]="true" live="assertive" [attr.data-testid]="errorTestId()">
          {{ errorText() }}
          <button alertAction ptahButton type="button" variant="ghost" (click)="retry.emit()">
            {{ retryLabel() }}
          </button>
        </ptah-alert>
      }
      @case ('empty') {
        <ptah-state-panel
          state="empty"
          [title]="emptyTitle()"
          [body]="emptyBody()"
          [actionLabel]="emptyActionLabel()"
          (action)="emptyAction.emit()"
        />
      }
      @case ('ready') {
        <ng-content />
      }
    }
  `,
})
export class SettingsSectionStateComponent {
  readonly state = input.required<SettingsSectionState>();
  readonly errorText = input('Could not load this section.');
  readonly retryLabel = input('Retry');
  readonly skeletonLines = input(3);
  readonly emptyTitle = input('Nothing here yet.');
  readonly emptyBody = input<string | null>(null);
  readonly emptyActionLabel = input<string | null>(null);
  readonly errorTestId = input<string | null>(null);

  readonly retry = output<void>();
  readonly emptyAction = output<void>();
}

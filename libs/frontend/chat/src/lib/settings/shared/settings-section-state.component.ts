import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  Directive,
  input,
  output,
  TemplateRef,
} from '@angular/core';
import {
  PtahAlertComponent,
  PtahButtonDirective,
  PtahSkeletonComponent,
  PtahStatePanelComponent,
} from '@ptah-extension/ui';

export type SettingsSectionState = 'loading' | 'error' | 'ready' | 'empty';

/**
 * Marks the ready content of a `ptah-settings-section-state`:
 * `<ng-template ptahSectionReady>...</ng-template>`.
 * Angular creates this content only in the ready state. Plain projected content
 * is created in every state, so its constructors, effects and RPC calls would run
 * during loading, error and empty.
 */
@Directive({ selector: 'ng-template[ptahSectionReady]', standalone: true })
export class SettingsSectionReadyDirective {}

@Component({
  selector: 'ptah-settings-section-state',
  standalone: true,
  imports: [
    NgTemplateOutlet,
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
        @if (readyTemplate(); as ready) {
          <ng-container [ngTemplateOutlet]="ready" />
        }
      }
    }
  `,
})
export class SettingsSectionStateComponent {
  protected readonly readyTemplate = contentChild(SettingsSectionReadyDirective, {
    read: TemplateRef,
  });

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

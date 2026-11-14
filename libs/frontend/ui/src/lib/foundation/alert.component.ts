import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type PtahAlertTone = 'info' | 'success' | 'warning' | 'error';
export type PtahAlertLive = 'off' | 'polite' | 'assertive';
export type PtahAlertHeadingLevel = 2 | 3 | 4 | null;

@Component({
  selector: 'ptah-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="alert rounded-[var(--ptah-card-radius)]"
      [class.alert-info]="tone() === 'info'"
      [class.alert-success]="tone() === 'success'"
      [class.alert-warning]="tone() === 'warning'"
      [class.alert-error]="tone() === 'error'"
      [class]="densityClass()"
      [attr.role]="role()"
    >
      <div>
        @if (title()) {
          @switch (headingLevel()) {
            @case (2) {
              <h2 [class]="titleClass">{{ title() }}</h2>
            }
            @case (3) {
              <h3 [class]="titleClass">{{ title() }}</h3>
            }
            @case (4) {
              <h4 [class]="titleClass">{{ title() }}</h4>
            }
            @default {
              <p [class]="titleClass">{{ title() }}</p>
            }
          }
        }
        <ng-content />
      </div>
      <div class="flex items-center gap-[var(--ptah-gap-controls)] empty:hidden">
        <ng-content select="[alertAction]" />
      </div>
    </div>
  `,
})
export class PtahAlertComponent {
  readonly tone = input<PtahAlertTone>('info');
  readonly title = input<string | null>(null);
  readonly compact = input(false);
  readonly headingLevel = input<PtahAlertHeadingLevel>(null);
  readonly live = input<PtahAlertLive>('off');

  protected readonly titleClass = 'font-semibold text-sm';

  protected readonly densityClass = computed(() =>
    this.compact() ? 'p-2 text-xs' : 'p-[var(--ptah-surface-pad)]',
  );

  protected readonly role = computed(() => {
    const live = this.live();
    if (live === 'polite') return 'status';
    if (live === 'assertive') return 'alert';
    return null;
  });
}

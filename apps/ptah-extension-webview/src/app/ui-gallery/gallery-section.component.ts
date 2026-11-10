import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ptah-gallery-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section
    [attr.id]="id()"
    [attr.aria-labelledby]="id() + '-title'"
    class="surface-2 flex flex-col gap-ptah-heading rounded-ptah-surface border border-surface-border p-ptah-surface text-left"
  >
    <h2
      [attr.id]="id() + '-title'"
      class="text-ptah-section-title text-base-content"
    >
      {{ title() }}
    </h2>
    <div class="flex flex-col gap-ptah-group">
      <ng-content />
    </div>
  </section>`,
})
export class GallerySectionComponent {
  public readonly id = input.required<string>();
  public readonly title = input.required<string>();
}

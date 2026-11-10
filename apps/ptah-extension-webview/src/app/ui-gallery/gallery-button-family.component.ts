import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { GalleryButtonColumnComponent } from './gallery-button-column.component';
import { GallerySectionComponent } from './gallery-section.component';

interface ButtonLookColumn {
  readonly id: 'current' | 'proposed';
  readonly heading: string;
  readonly subtitle: string;
  readonly lookScope: 'next' | null;
}

@Component({
  selector: 'ptah-gallery-button-family',
  standalone: true,
  imports: [GallerySectionComponent, GalleryButtonColumnComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-gallery-section id="family-button" title="Button family">
    <p class="text-ptah-hint text-base-content-muted">
      Side-by-side comparison of the current button styling and the proposed
      token-based look.
    </p>
    <p
      class="text-ptah-hint text-base-content-muted"
      data-testid="button-family-danger-rule"
    >
      Destructive actions: use ghost for a remove or delete trigger in a row or
      list. Use danger only for the confirmation, or for the destructive action
      of a single resource card.
    </p>
    <div class="grid gap-ptah-group lg:grid-cols-2">
      @for (column of columns(); track column.id) {
        <div
          [attr.data-testid]="'button-family-col-' + column.id"
          [attr.data-ptah-look]="column.lookScope"
        >
          <ptah-gallery-button-column
            [heading]="column.heading"
            [subtitle]="column.subtitle"
          />
        </div>
      }
    </div>
  </ptah-gallery-section>`,
})
export class GalleryButtonFamilyComponent {
  public readonly columns = signal<readonly ButtonLookColumn[]>([
    {
      id: 'current',
      heading: 'Current',
      subtitle: 'Unscoped DaisyUI + glass button rules currently in production',
      lookScope: null,
    },
    {
      id: 'proposed',
      heading: 'Proposed',
      subtitle: 'Opt-in token-only contract look under [data-ptah-look="next"]',
      lookScope: 'next',
    },
  ]);
}

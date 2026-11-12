import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GalleryButtonColumnComponent } from './gallery-button-column.component';
import { GallerySectionComponent } from './gallery-section.component';

@Component({
  selector: 'ptah-gallery-button-family',
  standalone: true,
  imports: [GallerySectionComponent, GalleryButtonColumnComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-gallery-section id="family-button" title="Button family">
    <p class="text-ptah-hint text-base-content-muted">
      Reference for the button family: the six variants, the three sizes, the
      forced states, icon buttons and the busy state. Each button uses the
      ptahButton or ptahIconButton directive.
    </p>
    <p
      class="text-ptah-hint text-base-content-muted"
      data-testid="button-family-danger-rule"
    >
      Destructive actions: use ghost for a remove or delete trigger in a row or
      list. Use danger only for the confirmation, or for the destructive action
      of a single resource card.
    </p>
    <div data-testid="button-family-reference">
      <ptah-gallery-button-column
        heading="Button family"
        subtitle="Token-based look from libs/frontend/ui/src/lib/button/ptah-button.css"
      />
    </div>
  </ptah-gallery-section>`,
})
export class GalleryButtonFamilyComponent {}

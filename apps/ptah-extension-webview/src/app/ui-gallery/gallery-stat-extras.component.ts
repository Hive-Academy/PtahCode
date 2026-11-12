import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PtahStatComponent } from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';

/** Gallery section for the optional states of `ptah-stat`. */
@Component({
  selector: 'ptah-gallery-stat-extras',
  standalone: true,
  imports: [GallerySectionComponent, PtahStatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-gallery-section id="family-stat-extras" title="Stat extras">
      <p class="text-ptah-hint text-base-content-muted">
        Unit, loading, error with Retry, content slot, icon slot and polarity pill.
      </p>
      <div data-testid="stat-extras-reference" class="grid gap-ptah-group sm:grid-cols-3">
        <ptah-stat label="Latency" value="120" unit="ms" hint="Median" />
        <ptah-stat label="Loading" [value]="0" [loading]="true" />
        <ptah-stat label="Failed" [value]="0" error="Could not load." />
        <ptah-stat label="Good change" value="1,248" trend="up" delta="+12%" polarity="good" />
        <ptah-stat label="Bad change" value="3.1" unit="s" trend="up" delta="+0.4" polarity="bad" />
        <ptah-stat label="Neutral change" value="52" trend="flat" delta="0" polarity="neutral" />
        <ptah-stat label="With slots" [value]="9" hint="Last 7 days">
          <svg ptahStatIcon width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none"
            stroke="currentColor" stroke-width="2"><path d="M4 12h16M12 4v16" /></svg>
          <span class="text-xs text-base-content-muted">Extra detail below the hint</span>
        </ptah-stat>
      </div>
    </ptah-gallery-section>
  `,
})
export class GalleryStatExtrasComponent {}

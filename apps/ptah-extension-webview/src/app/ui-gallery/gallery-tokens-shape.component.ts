import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { PtahButtonDirective } from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';
import { GalleryTokensShapeControlsComponent } from './gallery-tokens-shape-controls.component';

@Component({
  selector: 'ptah-gallery-tokens-shape',
  standalone: true,
  imports: [
    GallerySectionComponent,
    GalleryTokensShapeControlsComponent,
    PtahButtonDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-gallery-section
    id="tokens-shape"
    title="Shape, elevation, motion and state"
  >
    <div class="grid gap-ptah-group md:grid-cols-2">
      <div class="flex flex-col gap-ptah-heading">
        <h3 class="text-ptah-group-title text-base-content">Radius</h3>
        <div class="grid gap-ptah-field sm:grid-cols-3">
          @for (item of radii; track item.token) {
            <div
              class="flex flex-col gap-ptah-label border border-surface-border bg-base-100 p-ptah-surface"
              [class]="{
                'rounded-ptah-control': item.token === '--ptah-radius-control',
                'rounded-ptah-surface': item.token === '--ptah-radius-surface',
                'rounded-ptah-chip': item.token === '--ptah-radius-chip',
              }"
              data-testid="radius-specimen"
            >
              <span class="text-ptah-label text-base-content">{{
                item.label
              }}</span>
              <span class="text-ptah-caption text-base-content-muted">{{
                item.token
              }}</span>
            </div>
          }
        </div>
      </div>
      <div class="flex flex-col gap-ptah-heading">
        <h3 class="text-ptah-group-title text-base-content">Border</h3>
        <div class="grid gap-ptah-field sm:grid-cols-2">
          @for (item of borders; track item.token) {
            <div
              class="flex flex-col gap-ptah-label rounded-ptah-surface border bg-base-100 p-ptah-surface"
              [style.border-width]="'var(--ptah-border-width)'"
              [style.border-color]="'var(' + item.token + ')'"
              data-testid="border-specimen"
            >
              <span class="text-ptah-label text-base-content">{{
                item.label
              }}</span>
              <span class="text-ptah-caption text-base-content-muted"
                >{{ item.token }} · --ptah-border-width (1 px)</span
              >
            </div>
          }
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-ptah-heading">
      <h3 class="text-ptah-group-title text-base-content">
        Elevation (0 to 3)
      </h3>
      <div class="grid gap-ptah-field sm:grid-cols-2 xl:grid-cols-4">
        @for (item of elevations; track item.token) {
          <div
            class="flex flex-col gap-ptah-label rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
            [class]="{
              'shadow-none': item.token === '--ptah-elevation-0',
              'shadow-ptah-1': item.token === '--ptah-elevation-1',
              'shadow-ptah-2': item.token === '--ptah-elevation-2',
              'shadow-ptah-3': item.token === '--ptah-elevation-3',
            }"
            data-testid="elevation-specimen"
          >
            <span class="text-ptah-label text-base-content">{{
              item.label
            }}</span>
            <span class="text-ptah-caption text-base-content-muted"
              >{{ item.token }} · {{ item.use }}</span
            >
          </div>
        }
      </div>
    </div>

    <div class="grid gap-ptah-group md:grid-cols-2">
      <div class="flex flex-col gap-ptah-heading">
        <h3 class="text-ptah-group-title text-base-content">Focus ring</h3>
        <div
          class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
        >
          <button
            type="button"
            data-testid="focus-ring-specimen"
            class="inline-flex h-ptah-control-sm items-center gap-ptah-inline self-start rounded-ptah-control border border-surface-border bg-base-200 px-ptah-control-x text-ptah-label text-base-content focus-visible:outline focus-visible:outline-ptah-focus-width focus-visible:outline-ptah-focus focus-visible:outline-offset-ptah-focus"
          >
            Focus with keyboard (Tab)
          </button>
          <p class="text-ptah-caption text-base-content-muted">
            outline outline-ptah-focus-width outline-ptah-focus
            outline-offset-ptah-focus (--ptah-focus-ring-width 2 px, offset 2
            px)
          </p>
        </div>
      </div>
      <div class="flex flex-col gap-ptah-heading">
        <div
          class="flex flex-wrap items-center justify-between gap-ptah-controls"
        >
          <h3 class="text-ptah-group-title text-base-content">
            Motion durations
          </h3>
          <button
            ptahButton
            size="xs"
            variant="secondary"
            type="button"
            (click)="toggleMotion()"
          >
            {{ motionActive() ? 'Reset motion' : 'Preview motion' }}
          </button>
        </div>
        <div class="grid gap-ptah-controls sm:grid-cols-3">
          @for (item of motions; track item.token) {
            <div
              class="flex flex-col gap-ptah-label rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
              data-testid="motion-specimen"
            >
              <div
                class="flex h-ptah-control-xs items-center rounded-ptah-control bg-primary px-ptah-control-x-xs text-ptah-caption text-primary-content transition-transform ease-ptah-standard hover:translate-x-2"
                [class]="{
                  'duration-ptah-fast': item.token === '--ptah-duration-fast',
                  'duration-ptah-base': item.token === '--ptah-duration-base',
                  'duration-ptah-slow': item.token === '--ptah-duration-slow',
                }"
                [class.translate-x-2]="motionActive()"
              >
                {{ item.label }}
              </div>
              <span class="text-ptah-caption text-base-content-muted">{{
                item.token
              }}</span>
            </div>
          }
        </div>
      </div>
    </div>

    <ptah-gallery-tokens-shape-controls />
  </ptah-gallery-section>`,
})
export class GalleryTokensShapeComponent {
  public readonly motionActive = signal(false);
  public toggleMotion(): void {
    this.motionActive.update((v) => !v);
  }
  public readonly radii = [
    {
      label: 'Control radius',
      token: '--ptah-radius-control',
      radiusClass: 'rounded-ptah-control',
    },
    {
      label: 'Surface radius',
      token: '--ptah-radius-surface',
      radiusClass: 'rounded-ptah-surface',
    },
    {
      label: 'Chip radius',
      token: '--ptah-radius-chip',
      radiusClass: 'rounded-ptah-chip',
    },
  ] as const;
  public readonly borders = [
    { label: 'Default border', token: '--ptah-border-color' },
    { label: 'Strong border', token: '--ptah-border-color-strong' },
  ] as const;
  public readonly elevations = [
    {
      label: 'Elevation 0',
      token: '--ptah-elevation-0',
      shadowClass: 'shadow-none',
      use: 'Flat surface',
    },
    {
      label: 'Elevation 1',
      token: '--ptah-elevation-1',
      shadowClass: 'shadow-ptah-1',
      use: 'Floating card',
    },
    {
      label: 'Elevation 2',
      token: '--ptah-elevation-2',
      shadowClass: 'shadow-ptah-2',
      use: 'Menu or popover',
    },
    {
      label: 'Elevation 3',
      token: '--ptah-elevation-3',
      shadowClass: 'shadow-ptah-3',
      use: 'Dialog or drawer',
    },
  ] as const;
  public readonly motions = [
    {
      label: 'Fast (120 ms)',
      token: '--ptah-duration-fast',
      durationClass: 'duration-ptah-fast',
    },
    {
      label: 'Base (180 ms)',
      token: '--ptah-duration-base',
      durationClass: 'duration-ptah-base',
    },
    {
      label: 'Slow (320 ms)',
      token: '--ptah-duration-slow',
      durationClass: 'duration-ptah-slow',
    },
  ] as const;
}

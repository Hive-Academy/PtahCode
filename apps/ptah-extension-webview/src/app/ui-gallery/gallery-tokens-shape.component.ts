import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { PtahButtonDirective } from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';

@Component({
  selector: 'ptah-gallery-tokens-shape',
  standalone: true,
  imports: [GallerySectionComponent, PtahButtonDirective],
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
              [class]="item.radiusClass"
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
            [class]="item.shadowClass"
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
                [class]="item.durationClass"
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

    <div class="grid gap-ptah-group md:grid-cols-3">
      <div class="flex flex-col gap-ptah-heading">
        <h3 class="text-ptah-group-title text-base-content">Control heights</h3>
        <div
          class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
        >
          @for (item of controlHeights; track item.token) {
            <div
              class="flex flex-col gap-ptah-label"
              data-testid="control-height-specimen"
            >
              <div
                class="inline-flex items-center rounded-ptah-control border border-surface-border bg-base-200 text-ptah-label text-base-content"
                [class]="item.classes"
              >
                {{ item.label }}
              </div>
              <span class="text-ptah-caption text-base-content-muted"
                >{{ item.token }} · {{ item.px }}</span
              >
            </div>
          }
        </div>
      </div>
      <div class="flex flex-col gap-ptah-heading">
        <h3 class="text-ptah-group-title text-base-content">Icon sizes</h3>
        <div
          class="flex flex-col gap-ptah-field rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
        >
          @for (item of iconSizes; track item.token) {
            <div
              class="flex items-center gap-ptah-inline"
              data-testid="icon-size-specimen"
            >
              <svg
                aria-hidden="true"
                [class]="item.sizeClass + ' text-base-content'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 2v20M2 12h20" />
              </svg>
              <span class="text-ptah-caption text-base-content-muted"
                >{{ item.token }} · {{ item.sizeClass }} ({{ item.px }})</span
              >
            </div>
          }
        </div>
      </div>
      <div class="flex flex-col gap-ptah-heading">
        <h3 class="text-ptah-group-title text-base-content">State inks</h3>
        <div
          class="flex flex-col gap-ptah-field rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
        >
          @for (item of stateInks; track item.token) {
            <div
              class="flex flex-col gap-ptah-label"
              data-testid="state-ink-specimen"
            >
              <span
                class="text-ptah-label"
                [style.color]="'var(' + item.token + ')'"
                >{{ item.label }}</span
              >
              <span class="text-ptah-caption text-base-content-muted">{{
                item.token
              }}</span>
            </div>
          }
        </div>
      </div>
    </div>
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
  public readonly controlHeights = [
    {
      label: 'xs control',
      token: '--ptah-control-h-xs',
      px: '24 px',
      classes: 'h-ptah-control-xs px-ptah-control-x-xs',
    },
    {
      label: 'sm control',
      token: '--ptah-control-h-sm',
      px: '32 px',
      classes: 'h-ptah-control-sm px-ptah-control-x',
    },
    {
      label: 'md control',
      token: '--ptah-control-h-md',
      px: '40 px',
      classes: 'h-ptah-control-md px-ptah-control-x-md',
    },
    {
      label: 'field control',
      token: '--ptah-control-h-field',
      px: '52 px',
      classes: 'h-ptah-control-field px-ptah-control-x-md',
    },
  ] as const;
  public readonly iconSizes = [
    { token: '--ptah-icon-xs', sizeClass: 'size-ptah-icon-xs', px: '12 px' },
    { token: '--ptah-icon-sm', sizeClass: 'size-ptah-icon-sm', px: '14 px' },
    { token: '--ptah-icon-md', sizeClass: 'size-ptah-icon-md', px: '16 px' },
  ] as const;
  public readonly stateInks = [
    { label: 'State ok · Completed', token: '--ptah-state-ok' },
    { label: 'State warn · Needs review', token: '--ptah-state-warn' },
    { label: 'State err · Failed', token: '--ptah-state-err' },
    { label: 'State info · Running', token: '--ptah-state-info' },
  ] as const;
}

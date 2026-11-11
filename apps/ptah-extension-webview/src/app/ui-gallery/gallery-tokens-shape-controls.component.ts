import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ptah-gallery-tokens-shape-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
                [class]="{
                  'h-ptah-control-xs': item.token === '--ptah-control-h-xs',
                  'px-ptah-control-x-xs': item.token === '--ptah-control-h-xs',
                  'h-ptah-control-sm': item.token === '--ptah-control-h-sm',
                  'px-ptah-control-x': item.token === '--ptah-control-h-sm',
                  'h-ptah-control-md': item.token === '--ptah-control-h-md',
                  'h-ptah-control-field':
                    item.token === '--ptah-control-h-field',
                  'px-ptah-control-x-md':
                    item.token === '--ptah-control-h-md' ||
                    item.token === '--ptah-control-h-field',
                }"
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
                class="text-base-content"
                [class]="{
                  'size-ptah-icon-xs': item.token === '--ptah-icon-xs',
                  'size-ptah-icon-sm': item.token === '--ptah-icon-sm',
                  'size-ptah-icon-md': item.token === '--ptah-icon-md',
                }"
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
  `,
})
export class GalleryTokensShapeControlsComponent {
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

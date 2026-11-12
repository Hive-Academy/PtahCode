import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  PtahButtonDirective,
  PtahButtonSize,
  PtahButtonVariant,
  PtahIconButtonDirective,
} from '@ptah-extension/ui';

interface ButtonStateSample {
  readonly id:
    'default' | 'hover' | 'focus' | 'active' | 'disabled' | 'loading';
  readonly caption: string;
  readonly forcedState?: 'hover' | 'focus' | 'active';
  readonly disabled?: boolean;
  readonly busy?: boolean;
}

@Component({
  selector: 'ptah-gallery-button-column',
  standalone: true,
  imports: [PtahButtonDirective, PtahIconButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="surface-2 flex flex-col gap-ptah-field rounded-ptah-surface border border-surface-border p-ptah-surface"
  >
    <div class="flex flex-col gap-ptah-label">
      <h3 class="text-ptah-group-title text-base-content">{{ heading() }}</h3>
      <p class="text-ptah-hint text-base-content-muted">{{ subtitle() }}</p>
    </div>

    <div class="flex flex-col gap-ptah-controls">
      <h4 class="text-ptah-label text-base-content">
        Variants × sizes (default state)
      </h4>
      <div class="grid gap-ptah-controls sm:grid-cols-3">
        @for (variant of variants; track variant) {
          @for (size of sizes; track size) {
            <div
              data-testid="button-matrix-specimen"
              class="surface-1 flex flex-col items-start gap-ptah-label rounded-ptah-control border border-surface-border p-ptah-surface"
            >
              <button
                ptahButton
                type="button"
                [variant]="variant"
                [size]="size"
              >
                {{ variantLabel(variant) }}
              </button>
              <span class="text-ptah-caption text-base-content-muted">
                {{ variant }} / {{ size }}
              </span>
            </div>
          }
        }
      </div>
    </div>

    <div class="flex flex-col gap-ptah-controls">
      <h4 class="text-ptah-label text-base-content">
        States by variant (size sm)
      </h4>
      <div class="flex flex-col gap-ptah-controls">
        @for (variant of variants; track variant) {
          <div
            data-testid="button-state-row"
            class="surface-1 flex flex-col gap-ptah-label rounded-ptah-control border border-surface-border p-ptah-surface"
          >
            <span class="text-ptah-label text-base-content">{{ variant }}</span>
            <div class="grid grid-cols-2 gap-ptah-controls sm:grid-cols-3">
              @for (state of states; track state.id) {
                <div
                  data-testid="button-state-specimen"
                  class="flex flex-col items-start gap-ptah-label"
                >
                  <button
                    ptahButton
                    type="button"
                    size="sm"
                    [variant]="variant"
                    [disabled]="state.disabled ?? false"
                    [busy]="state.busy ?? false"
                    [attr.data-state]="state.forcedState ?? null"
                  >
                    {{ variantLabel(variant) }}
                  </button>
                  <span class="text-ptah-caption text-base-content-muted">
                    {{ variant }} · {{ state.caption }}
                  </span>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>

    <div class="flex flex-col gap-ptah-controls">
      <h4 class="text-ptah-label text-base-content">
        Icon buttons, leading icon and long label
      </h4>
      <div class="grid grid-cols-3 gap-ptah-controls">
        @for (variant of iconVariants; track variant) {
          @for (size of sizes; track size) {
            <div
              data-testid="icon-button-specimen"
              class="surface-1 flex flex-col items-start gap-ptah-label rounded-ptah-control border border-surface-border p-ptah-surface"
            >
              <button
                ptahIconButton
                type="button"
                [variant]="variant"
                [size]="size"
                [label]="iconLabel(variant, size)"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  class="h-ptah-icon-sm w-ptah-icon-sm"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8 3.25v9.5M3.25 8h9.5"
                  />
                </svg>
              </button>
              <span class="text-ptah-caption text-base-content-muted">
                icon {{ variant }} / {{ size }}
              </span>
            </div>
          }
        }
      </div>

      <div class="grid gap-ptah-controls sm:grid-cols-2">
        <div
          data-testid="leading-icon-specimen"
          class="surface-1 flex flex-col items-start gap-ptah-label rounded-ptah-control border border-surface-border p-ptah-surface"
        >
          <button ptahButton type="button" variant="primary" size="sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              class="h-ptah-icon-sm w-ptah-icon-sm"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8 3.25v9.5M3.25 8h9.5"
              />
            </svg>
            <span>New connection</span>
          </button>
          <span class="text-ptah-caption text-base-content-muted">
            leading icon + label (8 px gap)
          </span>
        </div>

        <div
          data-testid="long-text-specimen"
          class="surface-1 flex flex-col items-start gap-ptah-label rounded-ptah-control border border-surface-border p-ptah-surface"
        >
          <button ptahButton type="button" variant="secondary" size="sm">
            Verify credentials and synchronize workspace rules
          </button>
          <span class="text-ptah-caption text-base-content-muted">
            long-text action label (no wrap)
          </span>
        </div>
      </div>
    </div>
  </div>`,
})
export class GalleryButtonColumnComponent {
  public readonly heading = input.required<string>();
  public readonly subtitle = input.required<string>();

  public readonly variants: readonly PtahButtonVariant[] = [
    'primary',
    'secondary',
    'outline',
    'ghost',
    'danger',
    'link',
  ];
  public readonly iconVariants: readonly Exclude<PtahButtonVariant, 'link'>[] =
    ['ghost', 'secondary', 'primary'];
  public readonly sizes: readonly PtahButtonSize[] = ['xs', 'sm', 'md'];
  public readonly states: readonly ButtonStateSample[] = [
    { id: 'default', caption: 'default' },
    { id: 'hover', caption: 'hover', forcedState: 'hover' },
    { id: 'focus', caption: 'focus-visible', forcedState: 'focus' },
    { id: 'active', caption: 'active', forcedState: 'active' },
    { id: 'disabled', caption: 'disabled', disabled: true },
    { id: 'loading', caption: 'loading', busy: true },
  ];

  public variantLabel(variant: PtahButtonVariant): string {
    const labels: Readonly<Record<PtahButtonVariant, string>> = {
      primary: 'Save changes',
      secondary: 'Test connection',
      outline: 'More options',
      ghost: 'Refresh',
      danger: 'Revoke key',
      link: 'View logs',
    };
    return labels[variant];
  }

  public iconLabel(variant: PtahButtonVariant, size: PtahButtonSize): string {
    return `Add item (${variant} ${size})`;
  }
}

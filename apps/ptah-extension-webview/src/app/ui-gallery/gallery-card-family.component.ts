import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahCardPadding,
  PtahCardTone,
  PtahCardVariant,
  PtahSectionHeaderComponent,
  PtahSurfaceDirective,
  SurfaceCardComponent,
} from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';

/**
 * Gallery section of the card family (TASK_2026_1012_b1dc,
 * family-card-look.md): each variant, padding and state of
 * `ptah-surface-card`, the `ptahSurface` panel directive and the
 * `ptah-section-header`. The theme switch at the top shows both themes.
 */
@Component({
  selector: 'ptah-gallery-card-family',
  standalone: true,
  imports: [
    GallerySectionComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahSectionHeaderComponent,
    PtahSurfaceDirective,
    SurfaceCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-gallery-section id="family-card" title="Card, panel surface and section header family">
    <p class="text-ptah-hint text-base-content-muted">
      One look for every card and panel. The default card is the base-200 fill,
      the base-300 border, a 12 px radius and 16 px padding. A card is static
      unless it is interactive. Hover and focus use forced states here.
    </p>

    <div data-testid="card-family-variants" class="flex flex-col gap-ptah-heading">
      <ptah-section-header heading="Variants" level="3" eyebrow="ptah-surface-card" />
      <div class="grid gap-ptah-field sm:grid-cols-2 lg:grid-cols-4">
        @for (variant of variants; track variant) {
          <ptah-surface-card [variant]="variant">
            <ptah-section-header card-header [heading]="variant" level="4" />
            <p class="text-ptah-hint text-base-content-muted">{{ variantNotes[variant] }}</p>
          </ptah-surface-card>
        }
      </div>
    </div>

    <div data-testid="card-family-padding" class="flex flex-col gap-ptah-heading">
      <ptah-section-header heading="Padding" level="3" description="none 0, sm 12 px, md 16 px (default), lg 20 px" />
      <div class="grid gap-ptah-field sm:grid-cols-2 lg:grid-cols-4">
        @for (padding of paddings; track padding) {
          <ptah-surface-card [padding]="padding">
            @if (padding === 'none') {
              <div style="padding: var(--ptah-card-padding-md)">
                <span class="text-ptah-label text-base-content">padding none</span>
                <p class="text-ptah-hint text-base-content-muted">Content supplies its own spacing.</p>
              </div>
            } @else {
              <span class="text-ptah-label text-base-content">padding {{ padding }}</span>
            }
          </ptah-surface-card>
        }
      </div>
    </div>

    <div data-testid="card-family-states" class="flex flex-col gap-ptah-heading">
      <ptah-section-header heading="States" level="3" description="Only an interactive card has hover, focus and activation" />
      <div class="grid gap-ptah-field sm:grid-cols-2 lg:grid-cols-3">
        <ptah-surface-card>
          <span class="text-ptah-label text-base-content">default (static)</span>
        </ptah-surface-card>
        <ptah-surface-card
          [interactive]="true"
          ariaLabel="Interactive card"
          (activated)="activations.set(activations() + 1)"
        >
          <span class="text-ptah-label text-base-content">interactive: click, Enter or Space</span>
          <span class="text-ptah-hint text-base-content-muted">Activations: {{ activations() }}</span>
        </ptah-surface-card>
        <ptah-surface-card data-state="hover" [interactive]="true" ariaLabel="Hover state">
          <span class="text-ptah-label text-base-content">hover (forced)</span>
        </ptah-surface-card>
        <ptah-surface-card data-state="focus" [interactive]="true" ariaLabel="Focus state">
          <span class="text-ptah-label text-base-content">focus-visible (forced)</span>
        </ptah-surface-card>
        <ptah-surface-card
          [selectable]="true"
          [selected]="selected()"
          tone="primary"
          ariaLabel="Selectable card"
          (activated)="selected.set(!selected())"
        >
          <span class="text-ptah-label text-base-content">selectable: {{ selected() ? 'selected' : 'not selected' }}</span>
        </ptah-surface-card>
        <ptah-surface-card [interactive]="true" [disabled]="true" ariaLabel="Disabled card">
          <span class="text-ptah-label text-base-content">disabled</span>
        </ptah-surface-card>
        <ptah-surface-card>
          <div card-header>
            <ptah-section-header heading="With header" level="4">
              <span ptahBadge status tone="ok" size="xs">active</span>
            </ptah-section-header>
          </div>
          <p class="text-ptah-hint text-base-content-muted">Body text below the header slot.</p>
        </ptah-surface-card>
        <ptah-surface-card>
          <span class="text-ptah-label text-base-content">With footer</span>
          <p class="text-ptah-hint text-base-content-muted">Body text above the footer slot.</p>
          <div card-footer class="flex justify-end gap-ptah-controls">
            <button ptahButton type="button" size="xs" variant="ghost">Cancel</button>
            <button ptahButton type="button" size="xs" variant="secondary">Save</button>
          </div>
        </ptah-surface-card>
        <ptah-surface-card>
          <span class="text-ptah-label text-base-content">Body only</span>
          <p class="text-ptah-hint text-base-content-muted">A simple card without header or footer slots.</p>
        </ptah-surface-card>
      </div>
    </div>

    <div data-testid="card-family-tones" class="flex flex-col gap-ptah-heading">
      <ptah-section-header heading="Tone and spine" level="3" description="The tone colors the spine and the selected ring" />
      <div class="grid gap-ptah-field sm:grid-cols-2 lg:grid-cols-4">
        @for (tone of tones; track tone) {
          <ptah-surface-card [tone]="tone" [spine]="true" [selectable]="true" [selected]="tone === 'warning'" [ariaLabel]="tone + ' card'">
            <span class="text-ptah-label text-base-content">{{ tone }}</span>
          </ptah-surface-card>
        }
      </div>
    </div>

    <div data-testid="card-family-panel" class="flex flex-col gap-ptah-heading">
      <ptah-section-header
        heading="Panel directive"
        level="3"
        description="ptahSurface puts the same look on a raw panel and keeps its DOM"
      />
      <div class="grid gap-ptah-field sm:grid-cols-2 lg:grid-cols-4">
        @for (variant of variants; track variant) {
          <div ptahSurface [variant]="variant" padding="sm">
            <span class="text-ptah-label text-base-content">div ptahSurface {{ variant }} sm</span>
          </div>
        }
      </div>
      <div data-testid="card-family-options" class="grid gap-ptah-field sm:grid-cols-2 lg:grid-cols-4">
        <div ptahSurface tone="info" [toneBorder]="true" padding="sm">
          <span class="text-ptah-label text-base-content">tone info with toneBorder</span>
        </div>
        <div ptahSurface [translucent]="50" shadow="sm" padding="sm">
          <span class="text-ptah-label text-base-content">translucent 50 with shadow sm</span>
        </div>
        <div ptahSurface border="faint" padding="sm">
          <span class="text-ptah-label text-base-content">border faint</span>
        </div>
        <div ptahSurface padding="sm">
          <span class="text-ptah-label text-base-content">defaults (no option)</span>
        </div>
      </div>
      <section ptahSurface padding="md">
        <span class="text-ptah-label text-base-content">Outer panel</span>
        <div ptahSurface variant="inset" padding="sm" class="mt-ptah-heading">
          <span class="text-ptah-hint text-base-content-muted">Inset block in a panel</span>
        </div>
      </section>
    </div>

    <div data-testid="card-family-section-header" class="flex flex-col gap-ptah-heading">
      <ptah-section-header heading="Section header" level="3" eyebrow="Composite" />
      <div ptahSurface class="flex flex-col gap-ptah-field">
        <ptah-section-header heading="Title only" level="4" />
        <ptah-section-header heading="With description" level="4" description="Muted hint text below the heading" />
        <ptah-section-header heading="Providers" level="4" eyebrow="Settings" description="Eyebrow, status and actions">
          <span ptahBadge status count size="xs">3</span>
          <div actions class="flex gap-ptah-controls">
            <button ptahButton type="button" size="xs" variant="ghost">Refresh</button>
            <button ptahButton type="button" size="xs" variant="primary">Add</button>
          </div>
        </ptah-section-header>
        <ptah-section-header heading="Section size" level="4" size="section" description="16 px title" />
      </div>
    </div>
  </ptah-gallery-section>`,
})
export class GalleryCardFamilyComponent {
  public readonly variants: readonly PtahCardVariant[] = ['card', 'subtle', 'inset', 'raised'];
  public readonly paddings: readonly PtahCardPadding[] = ['none', 'sm', 'md', 'lg'];
  public readonly tones: readonly PtahCardTone[] = [
    'neutral',
    'info',
    'success',
    'warning',
    'error',
    'accent',
    'secondary',
    'primary',
  ];
  public readonly variantNotes: Readonly<Record<PtahCardVariant, string>> = {
    card: 'Default. Base-200 fill, base-300 border.',
    subtle: 'Quieter plane. Surface-1 fill.',
    inset: 'Nested block. Base-100 fill, 8 px radius.',
    raised: 'Floats over the page. Surface-3 fill and a shadow.',
    'surface-1': 'Glass plane. Surface-1 fill, surface border and highlight.',
    'surface-2': 'Raised plane. Surface-2 fill, surface border and highlight.',
    legacy: 'Temporary exception. Old surface-2 look. Not for new use.',
  };
  public readonly activations = signal(0);
  public readonly selected = signal(false);
}

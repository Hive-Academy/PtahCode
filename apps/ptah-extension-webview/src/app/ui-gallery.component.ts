import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from '@ptah-extension/core';
import {
  PtahButtonDirective,
  PtahPageHeaderComponent,
  PtahStatusBadgeComponent,
} from '@ptah-extension/ui';
import { GalleryBadgeFamilyComponent } from './ui-gallery/gallery-badge-family.component';
import { GalleryButtonFamilyComponent } from './ui-gallery/gallery-button-family.component';
import { GalleryChartsFamilyComponent } from './ui-gallery/gallery-charts-family.component';
import { GalleryComponentsComponent } from './ui-gallery/gallery-components.component';
import { GalleryFormControlsFamilyComponent } from './ui-gallery/gallery-form-controls-family.component';
import { GalleryTokensShapeComponent } from './ui-gallery/gallery-tokens-shape.component';
import { GalleryTokensSpacingComponent } from './ui-gallery/gallery-tokens-spacing.component';
import { GalleryTokensTypeComponent } from './ui-gallery/gallery-tokens-type.component';

interface GallerySectionLink {
  readonly id: string;
  readonly label: string;
}

/** Electron dev gallery: navigate the Angular router directly to `/ui-gallery`. */
@Component({
  selector: 'ptah-ui-gallery',
  standalone: true,
  imports: [
    PtahButtonDirective,
    PtahPageHeaderComponent,
    PtahStatusBadgeComponent,
    GalleryTokensSpacingComponent,
    GalleryTokensTypeComponent,
    GalleryTokensShapeComponent,
    GalleryButtonFamilyComponent,
    GalleryFormControlsFamilyComponent,
    GalleryBadgeFamilyComponent,
    GalleryChartsFamilyComponent,
    GalleryComponentsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-h-0' },
  template: `<main
    #scroller
    tabindex="0"
    data-testid="ui-gallery-scroller"
    class="surface-0 flex h-full min-h-0 flex-col gap-ptah-section overflow-y-auto px-ptah-gutter py-ptah-group text-left focus:outline-none"
  >
    <ptah-page-header
      title="UI foundation gallery"
      description="Design tokens and each component state, in both reference themes"
      backLabel="Back to chat"
      (back)="goToChat()"
    >
      <ptah-ui-status-badge status="online" label="Electron preview" />
      <div
        actions
        role="group"
        aria-label="Theme switch"
        class="flex items-center gap-ptah-controls"
      >
        <button
          ptahButton
          type="button"
          size="xs"
          [variant]="isDarkTheme() ? 'primary' : 'ghost'"
          [attr.aria-pressed]="isDarkTheme()"
          (click)="setTheme('ptah-glass')"
        >
          Dark
        </button>
        <button
          ptahButton
          type="button"
          size="xs"
          [variant]="isLightTheme() ? 'primary' : 'ghost'"
          [attr.aria-pressed]="isLightTheme()"
          (click)="setTheme('ptah-glass-light')"
        >
          Light
        </button>
      </div>
    </ptah-page-header>

    <nav
      aria-label="Gallery sections"
      class="surface-1 flex flex-wrap items-center gap-ptah-controls rounded-ptah-surface border border-surface-border p-ptah-surface"
    >
      <span class="text-ptah-label text-base-content-muted">Sections</span>
      @for (section of sections; track section.id) {
        <a
          [attr.href]="'#' + section.id"
          (click)="scrollToSection($event, section.id)"
          class="inline-flex h-ptah-control-xs items-center rounded-ptah-control px-ptah-control-x-xs text-ptah-label text-base-content transition-colors duration-ptah-fast ease-ptah-standard hover:bg-base-200 focus-visible:outline focus-visible:outline-ptah-focus-width focus-visible:outline-ptah-focus focus-visible:outline-offset-ptah-focus"
        >
          {{ section.label }}
        </a>
      }
    </nav>

    <div class="flex flex-col gap-ptah-section">
      <ptah-gallery-tokens-spacing />
      <ptah-gallery-tokens-type />
      <ptah-gallery-tokens-shape />
      <ptah-gallery-button-family />
      <ptah-gallery-form-controls-family />
      <ptah-gallery-badge-family />
      <ptah-gallery-charts-family />
      <ptah-gallery-components />
    </div>
  </main>`,
})
export class UiGalleryComponent {
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  public readonly currentTheme = this.themeService.currentTheme;

  /** The app shell does not scroll, and a fragment URL must not reach the router. */
  public scrollToSection(event: Event, id: string): void {
    event.preventDefault();
    const root = this.scroller().nativeElement;
    const target = root.querySelector<HTMLElement>(`section[id="${id}"]`);
    target?.scrollIntoView({ block: 'start' });
  }
  public readonly isDarkTheme = computed(
    () => this.currentTheme() === 'ptah-glass',
  );
  public readonly isLightTheme = computed(
    () => this.currentTheme() === 'ptah-glass-light',
  );

  public readonly sections: readonly GallerySectionLink[] = [
    { id: 'tokens-spacing', label: 'Spacing and white space' },
    { id: 'tokens-type', label: 'Typography and hierarchy' },
    { id: 'tokens-shape', label: 'Shape, elevation, motion and state' },
    { id: 'family-button', label: 'Button family' },
    { id: 'family-form-controls', label: 'Form controls family' },
    { id: 'family-badge', label: 'Badge and status family' },
    { id: 'family-meter', label: 'Meter family' },
    { id: 'family-ring', label: 'Ring family' },
    { id: 'family-sparkline', label: 'Sparkline family' },
    { id: 'family-stat', label: 'Stat family' },
    { id: 'components-buttons', label: 'Buttons' },
    { id: 'components-fields', label: 'Fields' },
    { id: 'components-metrics', label: 'Metrics' },
    { id: 'components-list-detail', label: 'List and detail' },
    { id: 'components-inbox-layout', label: 'Inbox layout' },
    { id: 'components-statuses', label: 'Statuses' },
    { id: 'components-states', label: 'States' },
    { id: 'components-meters', label: 'Meters' },
    { id: 'components-surfaces', label: 'Surfaces' },
  ];

  public constructor() {
    // The theme switch is a preview. followTheme does not persist, so the saved
    // theme of the user is never changed. Restore the shown theme on exit.
    const themeOnEntry = this.currentTheme();
    inject(DestroyRef).onDestroy(() => {
      if (this.currentTheme() !== themeOnEntry) {
        this.themeService.followTheme(themeOnEntry);
      }
    });
  }

  public goToChat(): void {
    void this.router.navigateByUrl('/chat');
  }

  public setTheme(theme: 'ptah-glass' | 'ptah-glass-light'): void {
    this.themeService.followTheme(theme);
  }
}

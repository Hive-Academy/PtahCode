import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Listbox, Option } from '@angular/aria/listbox';
import {
  PtahButtonDirective,
  PtahAlertComponent,
  PtahAlertTone,
  PtahListDetailComponent,
  PtahListRowComponent,
  PtahPanelState,
  PtahRichSelectComponent,
  PtahSkeletonComponent,
  PtahSpinnerComponent,
  PtahSpinnerKind,
  PtahSpinnerSize,
  PtahStatePanelComponent,
  PtahToolbarComponent,
  SurfaceCardComponent,
  SurfaceTileComponent,
} from '@ptah-extension/ui';
import { SORT_OPTIONS } from './gallery-form-controls.data';
import { GallerySectionComponent } from './gallery-section.component';
import { InboxLayoutDemoComponent } from './inbox-layout-demo.component';

@Component({
  selector: 'ptah-gallery-components',
  standalone: true,
  imports: [
    Listbox,
    Option,
    PtahButtonDirective,
    PtahAlertComponent,
    PtahListDetailComponent,
    PtahListRowComponent,
    PtahRichSelectComponent,
    PtahSkeletonComponent,
    PtahSpinnerComponent,
    PtahStatePanelComponent,
    PtahToolbarComponent,
    SurfaceCardComponent,
    SurfaceTileComponent,
    GallerySectionComponent,
    InboxLayoutDemoComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="flex flex-col gap-ptah-section">
    <ptah-gallery-section id="components-list-detail" title="List and detail">
      <ptah-list-detail [selectedId]="selection()" (back)="selection.set(null)">
        <div list>
          <ptah-toolbar
            [query]="query()"
            (queryChange)="query.set($event)"
            [count]="4"
          >
            <button
              ptahButton
              filters
              variant="ghost"
              size="xs"
              type="button"
              aria-pressed="true"
            >
              All runs
            </button>
            <ptah-select
              sort
              size="xs"
              label="Sort runs"
              [options]="sortOptions"
              [(value)]="sort"
            />
          </ptah-toolbar>
          <div
            ngListbox
            selectionMode="explicit"
            aria-label="Review runs"
            [value]="selectedValues()"
            (valueChange)="selectRow($event)"
          >
            <div
              ptahListRow
              ngOption
              value="security"
              title="API security review"
              meta="org/api · Running"
              [current]="selection() === 'security'"
            ></div>
            <div
              ptahListRow
              ngOption
              value="regression"
              title="Regression sweep"
              meta="org/web · Completed"
            ></div>
            <div
              ptahListRow
              ngOption
              value="release"
              title="Release readiness"
              meta="Queued"
            ></div>
            <div
              ptahListRow
              ngOption
              value="archived"
              title="Archived review"
              [disabled]="true"
            ></div>
          </div>
        </div>
        <div detail class="p-ptah-surface">
          <h3 class="text-ptah-group-title">{{ selection() }} review</h3>
          <p class="mt-ptah-label text-ptah-hint text-base-content-muted">
            Findings and run activity appear here.
          </p>
          <section
            class="mt-ptah-group border-t border-surface-border pt-ptah-group"
          >
            <h3 class="text-ptah-group-title">Run context</h3>
            <p class="mt-ptah-label text-ptah-hint text-base-content-muted">
              Repository: org/api
            </p>
          </section>
        </div>
        <div
          empty
          class="p-ptah-surface text-ptah-hint text-base-content-muted"
        >
          Select a review run to see its details.
        </div>
      </ptah-list-detail>
    </ptah-gallery-section>

    <ptah-gallery-section id="components-inbox-layout" title="Inbox layout">
      <ptah-inbox-layout-demo />
    </ptah-gallery-section>

    <ptah-gallery-section id="components-states" title="States">
      <div class="mb-ptah-group flex flex-wrap items-center gap-ptah-field">
        @for (size of spinnerSizes; track size) {
          <ptah-spinner [size]="size" [label]="'Loading ' + size" />
        }
        @for (kind of spinnerKinds; track kind) {
          <ptah-spinner [kind]="kind" [label]="'Loading ' + kind" />
        }
      </div>
      <div class="mb-ptah-group grid gap-ptah-field sm:grid-cols-2">
        <ptah-skeleton />
        <ptah-skeleton shape="block" height="4rem" />
      </div>
      <div class="mb-ptah-group grid gap-ptah-field sm:grid-cols-2">
        @for (tone of alertTones; track tone) {
          <ptah-alert [tone]="tone" [title]="tone">Sample {{ tone }} message</ptah-alert>
        }
      </div>
      <div class="grid gap-ptah-field sm:grid-cols-2 xl:grid-cols-5">
        @for (state of states; track state) {
          <ptah-state-panel
            [state]="state"
            [title]="state"
            body="Sample review state"
            actionLabel="Try again"
          />
        }
      </div>
    </ptah-gallery-section>

    <ptah-gallery-section id="components-surfaces" title="Surfaces">
      <div class="grid gap-ptah-field sm:grid-cols-2">
        <ptah-surface-card
          ><h3 class="text-ptah-group-title">Surface card</h3>
          <p class="mt-ptah-label text-ptah-hint">
            Review overview
          </p></ptah-surface-card
        >
        <ptah-surface-tile [selected]="true"
          ><h3 class="text-ptah-group-title">Selected tile</h3>
          <p class="mt-ptah-label text-ptah-hint">
            Machine summary
          </p></ptah-surface-tile
        >
      </div>
    </ptah-gallery-section>
  </div>`,
})
export class GalleryComponentsComponent {
  public readonly spinnerSizes: PtahSpinnerSize[] = ['xs', 'sm', 'md', 'lg'];
  public readonly spinnerKinds: PtahSpinnerKind[] = ['spinner', 'dots', 'ring'];
  public readonly alertTones: PtahAlertTone[] = ['info', 'success', 'warning', 'error'];
  public readonly states: PtahPanelState[] = [
    'loading',
    'empty',
    'error',
    'partial',
    'no-permission',
  ];
  public readonly selection = signal<string | null>(null);
  public readonly query = signal('');
  public readonly sort = signal<string | null>('newest');
  public readonly sortOptions = SORT_OPTIONS;
  public readonly selectedValues = (): string[] =>
    this.selection() ? [this.selection() as string] : [];
  public selectRow(values: string[]): void {
    this.selection.set(values[0] ?? null);
  }
}

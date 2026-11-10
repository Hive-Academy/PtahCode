import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Listbox, Option } from '@angular/aria/listbox';
import {
  PtahButtonDirective,
  PtahFieldComponent,
  PtahFieldControlDirective,
  PtahListDetailComponent,
  PtahListRowComponent,
  PtahMeterComponent,
  PtahPanelState,
  PtahStatCardComponent,
  PtahStatePanelComponent,
  PtahStatus,
  PtahStatusBadgeComponent,
  PtahToolbarComponent,
  SurfaceCardComponent,
  SurfaceTileComponent,
} from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';
import { InboxLayoutDemoComponent } from './inbox-layout-demo.component';

@Component({
  selector: 'ptah-gallery-components',
  standalone: true,
  imports: [
    Listbox,
    Option,
    PtahButtonDirective,
    PtahFieldComponent,
    PtahFieldControlDirective,
    PtahStatCardComponent,
    PtahListDetailComponent,
    PtahListRowComponent,
    PtahStatusBadgeComponent,
    PtahStatePanelComponent,
    PtahToolbarComponent,
    PtahMeterComponent,
    SurfaceCardComponent,
    SurfaceTileComponent,
    GallerySectionComponent,
    InboxLayoutDemoComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="flex flex-col gap-ptah-section">
    <ptah-gallery-section id="components-buttons" title="Buttons">
      <div class="flex flex-wrap gap-ptah-controls">
        @for (variant of variants; track variant) {
          @for (size of sizes; track size) {
            <button ptahButton [variant]="variant" [size]="size" type="button">
              {{ variant }} {{ size }}
            </button>
          }
        }
        <button
          ptahButton
          [iconOnly]="true"
          aria-label="More actions"
          type="button"
        >
          ⋯
        </button>
        <button ptahButton [busy]="true" type="button">Saving</button>
        <button ptahButton type="button" disabled>Disabled</button>
      </div>
    </ptah-gallery-section>

    <ptah-gallery-section id="components-fields" title="Fields">
      <div class="grid gap-ptah-field md:grid-cols-3">
        <ptah-field label="Review name" hint="Shown in the run list"
          ><input ptahFieldControl value="API security review"
        /></ptah-field>
        <ptah-field label="Repository" hint="Choose a connected repository"
          ><select ptahFieldControl>
            <option>org/api</option>
            <option>org/web</option>
          </select></ptah-field
        >
        <ptah-field label="Instructions" error="A summary is required">
          <textarea ptahFieldControl rows="2"></textarea>
        </ptah-field>
      </div>
    </ptah-gallery-section>

    <ptah-gallery-section id="components-metrics" title="Metrics">
      <div class="grid gap-ptah-field sm:grid-cols-2">
        <ptah-stat-card label="Review runs" [value]="24" trend="This month" />
        <ptah-stat-card
          label="Connected machines"
          [value]="3"
          size="dense"
          trend="2 online"
        />
      </div>
    </ptah-gallery-section>

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
            <select sort ptahFieldControl aria-label="Sort runs">
              <option>Newest first</option>
              <option>Oldest first</option>
            </select>
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
        </div>
        <div
          empty
          class="p-ptah-surface text-ptah-hint text-base-content-muted"
        >
          Select a review run to see its details.
        </div>
        <div meta class="p-ptah-surface text-ptah-hint">
          <h3 class="text-ptah-group-title">Run context</h3>
          <p class="mt-ptah-label">Repository: org/api</p>
        </div>
      </ptah-list-detail>
    </ptah-gallery-section>

    <ptah-gallery-section id="components-inbox-layout" title="Inbox layout">
      <ptah-inbox-layout-demo />
    </ptah-gallery-section>

    <ptah-gallery-section id="components-statuses" title="Statuses">
      <div class="flex flex-wrap gap-ptah-controls">
        @for (status of statuses; track status) {
          <ptah-ui-status-badge [status]="status" />
        }
      </div>
    </ptah-gallery-section>

    <ptah-gallery-section id="components-states" title="States">
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

    <ptah-gallery-section id="components-meters" title="Meters">
      <div class="grid gap-ptah-field sm:grid-cols-2 xl:grid-cols-3">
        @for (sample of meterSamples; track sample.label) {
          <ptah-meter
            [label]="sample.label"
            [value]="sample.value"
            [max]="sample.max"
            unit="%"
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
  public readonly variants = [
    'primary',
    'secondary',
    'ghost',
    'danger',
  ] as const;
  public readonly sizes = ['xs', 'sm'] as const;
  public readonly statuses: PtahStatus[] = [
    'running',
    'queued',
    'pending',
    'needs-review',
    'warning',
    'failed',
    'offline',
    'completed',
    'online',
  ];
  public readonly states: PtahPanelState[] = [
    'loading',
    'empty',
    'error',
    'partial',
    'no-permission',
  ];
  public readonly meterSamples = [
    { label: 'Unused', value: 0, max: 100 },
    { label: 'Below limit', value: 89, max: 100 },
    { label: 'Near limit', value: 90, max: 100 },
    { label: 'Almost full', value: 99, max: 100 },
    { label: 'At limit', value: 100, max: 100 },
    { label: 'Unavailable', value: 0, max: 0 },
  ];
  public readonly selection = signal<string | null>(null);
  public readonly query = signal('');
  public readonly selectedValues = (): string[] =>
    this.selection() ? [this.selection() as string] : [];
  public selectRow(values: string[]): void {
    this.selection.set(values[0] ?? null);
  }
}

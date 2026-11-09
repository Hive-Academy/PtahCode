import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Listbox, Option } from '@angular/aria/listbox';
import {
  PtahButtonDirective, PtahFieldComponent, PtahFieldControlDirective,
  PtahStatCardComponent, PtahPageHeaderComponent, PtahListDetailComponent,
  PtahListRowComponent, PtahStatusBadgeComponent, PtahStatus,
  PtahStatePanelComponent, PtahPanelState, PtahToolbarComponent,
  PtahMeterComponent, SurfaceSectionComponent, SurfaceCardComponent, SurfaceTileComponent,
} from '@ptah-extension/ui';

/** Electron dev gallery: navigate the Angular router directly to `/ui-gallery`. */

@Component({
  selector: 'ptah-ui-gallery', standalone: true,
  imports: [Listbox, Option, PtahButtonDirective, PtahFieldComponent,
    PtahFieldControlDirective, PtahStatCardComponent, PtahPageHeaderComponent,
    PtahListDetailComponent, PtahListRowComponent, PtahStatusBadgeComponent,
    PtahStatePanelComponent, PtahToolbarComponent, PtahMeterComponent, SurfaceSectionComponent, SurfaceCardComponent, SurfaceTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main class="surface-0 mx-auto max-w-[1600px] p-4 md:p-6">
    <ptah-page-header title="UI foundation gallery" description="Reviews and Machines sample states" backLabel="Back to chat" (back)="goToChat()">
      <ptah-ui-status-badge status="online" label="Electron preview" />
      <button ptahButton actions variant="ghost" type="button">Refresh preview</button>
    </ptah-page-header>
    <div class="mt-4 grid gap-4">
      <ptah-surface-section><h2 section-header class="text-sm font-semibold">Buttons</h2>
        <div class="flex flex-wrap gap-2">@for (variant of variants; track variant) { @for (size of sizes; track size) { <button ptahButton [variant]="variant" [size]="size" type="button">{{ variant }} {{ size }}</button> } }
          <button ptahButton [iconOnly]="true" aria-label="More actions" type="button">⋯</button><button ptahButton [busy]="true" type="button">Saving</button><button ptahButton type="button" disabled>Disabled</button>
        </div>
      </ptah-surface-section>
      <ptah-surface-section><h2 section-header class="text-sm font-semibold">Fields</h2><div class="grid gap-4 md:grid-cols-3">
        <ptah-field label="Review name" hint="Shown in the run list"><input ptahFieldControl value="API security review" /></ptah-field>
        <ptah-field label="Repository" hint="Choose a connected repository"><select ptahFieldControl><option>org/api</option><option>org/web</option></select></ptah-field>
        <ptah-field label="Instructions" error="A summary is required"><textarea ptahFieldControl rows="2"></textarea></ptah-field>
      </div></ptah-surface-section>
      <ptah-surface-section><h2 section-header class="text-sm font-semibold">Metrics</h2><div class="grid gap-4 sm:grid-cols-2"><ptah-stat-card label="Review runs" [value]="24" trend="This month" /><ptah-stat-card label="Connected machines" [value]="3" size="dense" trend="2 online" /></div></ptah-surface-section>
      <ptah-surface-section><h2 section-header class="text-sm font-semibold">List and detail</h2>
        <ptah-list-detail [selectedId]="selection()" (back)="selection.set(null)">
          <div list><ptah-toolbar [query]="query()" (queryChange)="query.set($event)" [count]="4"><button ptahButton filters variant="ghost" size="xs" type="button" aria-pressed="true">All runs</button><select sort ptahFieldControl aria-label="Sort runs"><option>Newest first</option><option>Oldest first</option></select></ptah-toolbar>
            <div ngListbox selectionMode="explicit" aria-label="Review runs" [value]="selectedValues()" (valueChange)="selectRow($event)">
              <div ptahListRow ngOption value="security" title="API security review" meta="org/api · Running" [current]="selection() === 'security'"></div>
              <div ptahListRow ngOption value="regression" title="Regression sweep" meta="org/web · Completed"></div>
              <div ptahListRow ngOption value="release" title="Release readiness" meta="Queued"></div>
              <div ptahListRow ngOption value="archived" title="Archived review" [disabled]="true"></div>
            </div>
          </div>
          <div detail class="p-5"><h3 class="text-sm font-semibold">{{ selection() }} review</h3><p class="mt-2 text-xs text-base-content-muted">Findings and run activity appear here.</p></div>
          <div empty class="p-5 text-xs text-base-content-muted">Select a review run to see its details.</div>
          <div meta class="p-5 text-xs"><h3 class="font-semibold">Run context</h3><p class="mt-2">Repository: org/api</p></div>
        </ptah-list-detail>
      </ptah-surface-section>
      <ptah-surface-section><h2 section-header class="text-sm font-semibold">Statuses</h2><div class="flex flex-wrap gap-2">@for (status of statuses; track status) { <ptah-ui-status-badge [status]="status" /> }</div></ptah-surface-section>
      <ptah-surface-section><h2 section-header class="text-sm font-semibold">States</h2><div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">@for (state of states; track state) { <ptah-state-panel [state]="state" [title]="state" body="Sample review state" actionLabel="Try again" /> }</div></ptah-surface-section>
      <ptah-surface-section><h2 section-header class="text-sm font-semibold">Meters</h2><div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">@for (sample of meterSamples; track sample.label) { <ptah-meter [label]="sample.label" [value]="sample.value" [max]="sample.max" unit="%" /> }</div></ptah-surface-section>
      <ptah-surface-section><h2 section-header class="text-sm font-semibold">Surfaces</h2><div class="grid gap-4 sm:grid-cols-2"><ptah-surface-card><h3 class="text-sm font-semibold">Surface card</h3><p class="mt-2 text-xs">Review overview</p></ptah-surface-card><ptah-surface-tile [selected]="true"><h3 class="text-sm font-semibold">Selected tile</h3><p class="mt-2 text-xs">Machine summary</p></ptah-surface-tile></div></ptah-surface-section>
    </div>
  </main>`,
})
export class UiGalleryComponent {
  private readonly router = inject(Router);
  public goToChat(): void { void this.router.navigateByUrl('/chat'); }
  public readonly variants = ['primary', 'secondary', 'ghost', 'danger'] as const;
  public readonly sizes = ['xs', 'sm'] as const;
  public readonly statuses: PtahStatus[] = ['running', 'queued', 'pending', 'needs-review', 'warning', 'failed', 'offline', 'completed', 'online'];
  public readonly states: PtahPanelState[] = ['loading', 'empty', 'error', 'partial', 'no-permission'];
  public readonly meterSamples = [{ label: 'Unused', value: 0, max: 100 }, { label: 'Below limit', value: 89, max: 100 }, { label: 'Near limit', value: 90, max: 100 }, { label: 'Almost full', value: 99, max: 100 }, { label: 'At limit', value: 100, max: 100 }, { label: 'Unavailable', value: 0, max: 0 }];
  public readonly selection = signal<string | null>(null);
  public readonly query = signal('');
  public readonly selectedValues = () => this.selection() ? [this.selection() as string] : [];
  public selectRow(values: string[]): void { this.selection.set(values[0] ?? null); }
}

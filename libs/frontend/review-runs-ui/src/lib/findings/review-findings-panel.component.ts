import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { Lens, ReviewFinding, Severity } from '@ptah-extension/review-contracts';
import { PtahButtonDirective, PtahFieldControlDirective } from '@ptah-extension/ui';
import { ReviewFindingCardComponent } from './review-finding-card.component';
import { ReviewFindingsStore } from './review-findings.store';
import { filterAndSortFindings, openTriage, summarizeFindings, toFindingViews, type SortField, type TriageState } from './review-finding-view';

@Component({
  selector: 'ptah-review-findings-panel', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReviewFindingCardComponent, PtahButtonDirective, PtahFieldControlDirective],
  template: `
    <section aria-label="Findings" class="space-y-4">
      <div class="rounded-lg border border-base-300 bg-base-200 p-3 text-sm">
        <p class="font-medium">{{ summary().total }} findings</p>
        <p>Critical {{ summary().severity.Critical }} · Major {{ summary().severity.Major }} · Minor {{ summary().severity.Minor }} · Nitpick {{ summary().severity.Nitpick }}</p>
        <p>Open {{ summary().states.open }} · Accepted {{ summary().states.accepted }} · Dismissed {{ summary().states.dismissed }}</p>
        <p class="mt-1 text-xs text-base-content-muted">Accepted and dismissed marks are kept for this session only. The reply on GitHub is permanent.</p>
      </div>
      @if (views().length) {
        <div class="flex flex-wrap items-center gap-2 border-b border-base-300 p-2">
          <div filters class="flex flex-wrap items-center gap-2">
          <label class="sr-only" for="finding-severity">Severity</label><select ptahFieldControl id="finding-severity" [value]="severity()" (change)="setSeverity($event)"><option value="all">All severities</option>@for (item of severities; track item) { <option [value]="item">{{ item }}</option> }</select>
          <label class="sr-only" for="finding-lens">Lens</label><select ptahFieldControl id="finding-lens" [value]="lens()" (change)="setLens($event)"><option value="all">All lenses</option>@for (item of lenses(); track item) { <option [value]="item">{{ item }}</option> }</select>
          <label class="sr-only" for="finding-triage">Triage state</label><select ptahFieldControl id="finding-triage" [value]="triageState()" (change)="setTriage($event)"><option value="all">All states</option><option value="open">Open</option><option value="accepted">Accepted</option><option value="dismissed">Dismissed</option></select>
          </div><div sort class="flex items-center gap-1"><label class="sr-only" for="finding-sort">Sort findings</label><select ptahFieldControl id="finding-sort" [value]="sortField()" (change)="setSort($event)"><option value="severity">Severity</option><option value="lens">Lens</option><option value="location">Location</option><option value="confidence">Confidence</option></select>
          <button ptahButton variant="ghost" size="xs" type="button" (click)="ascending.set(!ascending())" [attr.aria-label]="ascending() ? 'Sort descending' : 'Sort ascending'">{{ ascending() ? '↑' : '↓' }}</button>
          </div>
        </div>
      }
      @if (store.openError()) { <p role="alert" class="text-sm text-error">{{ store.openError() }}</p> }
      @if (store.copyError()) { <p role="alert" class="text-sm text-error">{{ store.copyError() }}</p> }
      @if (store.copied()) { <p role="status" class="text-sm">Fix prompt copied.</p> }
      @if (!views().length) { <p class="text-sm text-base-content-muted">No accepted findings for this run.</p> }
      @else if (!visible().length) { <p class="text-sm text-base-content-muted">No matching findings.</p><button ptahButton variant="ghost" size="sm" type="button" (click)="clearFilters()">Clear filters</button> }
      @else { <div class="space-y-3">@for (view of visible(); track view.key) {
        <ptah-review-finding-card [view]="view" [triage]="store.triage()[view.key] ?? openTriage" (openEvidence)="store.openEvidence($event.path, $event.line)" (respond)="store.respond(view, $event.action, $event.body)" (sendToLane)="store.sendToLane(view)" />
      }</div> }
    </section>
  `,
})
export class ReviewFindingsPanelComponent {
  readonly findings = input.required<readonly ReviewFinding[]>();
  readonly store = inject(ReviewFindingsStore);
  readonly openTriage = openTriage;
  readonly severities: readonly Severity[] = ['Critical', 'Major', 'Minor', 'Nitpick'];
  readonly views = computed(() => toFindingViews(this.findings()));
  readonly lenses = computed(() => [...new Set(this.views().map(view => view.lens))]);
  readonly severity = signal<Severity | 'all'>('all');
  readonly lens = signal<Lens | 'all'>('all');
  readonly triageState = signal<TriageState | 'all'>('all');
  readonly sortField = signal<SortField>('severity');
  readonly ascending = signal(true);
  readonly summary = computed(() => summarizeFindings(this.views(), this.store.triage()));
  readonly visible = computed(() => filterAndSortFindings(this.views(), { severity: this.severity(), lens: this.lens(), triage: this.triageState(), sortField: this.sortField(), ascending: this.ascending() }, this.store.triage()));
  clearFilters(): void { this.severity.set('all'); this.lens.set('all'); this.triageState.set('all'); }
  setSeverity(event: Event): void { const value = this.value(event); if (value === 'all' || this.severities.some(item => item === value)) this.severity.set(value as Severity | 'all'); }
  setLens(event: Event): void { const value = this.value(event); if (value === 'all' || this.lenses().some(item => item === value)) this.lens.set(value as Lens | 'all'); }
  setTriage(event: Event): void { const value = this.value(event); if (value === 'all' || value === 'open' || value === 'accepted' || value === 'dismissed') this.triageState.set(value); }
  setSort(event: Event): void { const value = this.value(event); if (value === 'severity' || value === 'lens' || value === 'location' || value === 'confidence') this.sortField.set(value); }
  private value(event: Event): string { return event.target instanceof HTMLSelectElement ? event.target.value : ''; }
}

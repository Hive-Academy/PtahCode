import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { PtahSelectDirective } from '@ptah-extension/ui';
import type { Lens, ReviewFinding, Severity } from '@ptah-extension/review-contracts';

/** Presentation shape supplied by a validated finding RPC in P1-16. */
export interface ReviewFindingRow {
  id: string;
  severity: Severity;
  lens: Lens;
  path: string;
  line: number | null;
  title: string;
  failureMode: string;
  affectedBehavior: string;
  scenario: string;
  evidence: ReviewFinding['evidence'];
  fixPrompt: string;
  status: 'accepted';
  confidence: number;
}

/**
 * Maps a validated `review:listFindings` payload onto table rows. The RPC lists
 * accepted findings only (`review-query.repository.ts` selects kind
 * 'accepted'), and the wire shape carries no row id, so the id is derived from
 * the location and the payload order.
 */
export function reviewFindingRows(
  findings: readonly ReviewFinding[],
): ReviewFindingRow[] {
  return findings.map((finding, index) => ({
    id: `${finding.lens}:${finding.path}:${finding.line ?? 0}:${index}`,
    severity: finding.severity,
    lens: finding.lens,
    path: finding.path,
    line: finding.line,
    title: finding.title,
    failureMode: finding.failureMode,
    affectedBehavior: finding.affectedBehavior,
    scenario: finding.scenario,
    evidence: finding.evidence,
    fixPrompt: finding.fixPrompt,
    status: 'accepted',
    confidence: finding.confidence,
  }));
}
type SortField = 'severity' | 'lens' | 'location' | 'confidence';
const severityOrder: Record<Severity, number> = { Critical: 0, Major: 1, Minor: 2, Nitpick: 3 };

@Component({
  selector: 'ptah-review-findings-table', standalone: true, imports: [PtahSelectDirective], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Findings" class="space-y-3">
      <div class="flex flex-wrap gap-2">
        <label class="sr-only" for="finding-lens">Filter findings by lens</label>
        <select id="finding-lens" ptahSelect (change)="setLens($event)">
          <option value="all">All lenses</option>@for (lens of lenses; track lens) { <option [value]="lens">{{ lens }}</option> }
        </select>
      </div>
      @if (rows().length === 0) { <p class="text-sm text-base-content-muted">No accepted findings for this run.</p> }
      @else if (visibleRows().length === 0) { <p class="text-sm text-base-content-muted">No matching findings.</p> }
      @else { <div class="overflow-x-auto"><table class="table table-zebra table-sm">
        <caption class="sr-only">Findings for selected review run</caption>
        <thead><tr>
          <th scope="col"><button type="button" (click)="sort('severity')">Severity</button></th>
          <th scope="col"><button type="button" (click)="sort('lens')">Lens</button></th>
          <th scope="col">Finding</th>
          <th scope="col"><button type="button" (click)="sort('location')">Location</button></th>
          <th scope="col"><button type="button" (click)="sort('confidence')">Confidence</button></th>
        </tr></thead><tbody>
          @for (finding of visibleRows(); track finding.id) { <tr>
            <td>{{ finding.severity }}</td><td>{{ finding.lens }}</td>
            <td>
              <span class="font-medium">{{ finding.title }}</span>
              <details class="mt-1 text-sm">
                <summary>Explanation</summary>
                <dl class="mt-2 space-y-1">
                  <dt class="font-medium">Failure mode</dt><dd>{{ finding.failureMode }}</dd>
                  <dt class="font-medium">Affected behavior</dt><dd>{{ finding.affectedBehavior }}</dd>
                  <dt class="font-medium">Scenario</dt><dd>{{ finding.scenario }}</dd>
                  <dt class="font-medium">Evidence</dt>
                  <dd><ul class="list-disc pl-4">@for (item of finding.evidence; track $index) {
                    <li>{{ item.path }}:{{ item.line }} — {{ item.excerpt }}</li>
                  }</ul></dd>
                  <dt class="font-medium">Fix prompt</dt><dd>{{ finding.fixPrompt }}</dd>
                </dl>
              </details>
            </td>
            <td class="font-mono text-xs">{{ finding.path }}:{{ finding.line ?? '—' }}</td>
            <td>{{ (finding.confidence * 100).toFixed(0) }}%</td>
          </tr> }
        </tbody></table></div> }
    </section>
  `,
})
export class ReviewFindingsTableComponent {
  readonly rows = input.required<readonly ReviewFindingRow[]>();
  readonly lenses: readonly Lens[] = ['correctness-lifecycle', 'contracts-callers', 'security-privacy', 'host-di-config'];
  readonly lens = signal<string>('all');
  readonly sortField = signal<SortField>('severity');
  readonly ascending = signal(true);
  readonly visibleRows = computed(() => this.rows()
    .filter(row => this.lens() === 'all' || row.lens === this.lens())
    .slice().sort((a, b) => {
      const field = this.sortField();
      const left = field === 'severity' ? severityOrder[a.severity] : field === 'location' ? `${a.path}:${a.line ?? 0}` : a[field];
      const right = field === 'severity' ? severityOrder[b.severity] : field === 'location' ? `${b.path}:${b.line ?? 0}` : b[field];
      const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
      return (this.ascending() ? result : -result) || a.id.localeCompare(b.id);
    }));
  sort(field: SortField): void { this.ascending.set(this.sortField() === field ? !this.ascending() : true); this.sortField.set(field); }
  setLens(event: Event): void { const target = event.target; if (target instanceof HTMLSelectElement && (target.value === 'all' || this.lenses.some(lens => lens === target.value))) this.lens.set(target.value); }
}

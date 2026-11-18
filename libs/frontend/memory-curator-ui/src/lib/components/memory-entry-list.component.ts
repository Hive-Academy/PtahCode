import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Pin, PinOff, Trash2 } from 'lucide-angular';

import type { MemoryWire } from '@ptah-extension/shared';
import {
  PtahIconButtonDirective,
  PtahStatePanelComponent,
  PtahTableComponent,
} from '@ptah-extension/ui';
import { matchesGraphFilters } from './graph/model/matches-graph-filters';
import { MemoryGraphStateService } from '../services/memory-graph-state.service';
import { MemoryStateService } from '../services/memory-state.service';

@Component({
  selector: 'ptah-memory-entry-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    LucideAngularModule,
    PtahIconButtonDirective,
    PtahStatePanelComponent,
    PtahTableComponent,
  ],
  template: `
    <section
      aria-label="Memory entries"
      data-testid="thoth-section-memory-entries"
    >
      <p class="mb-2 text-xs text-base-content-muted">
        Showing {{ visibleEntries().length }} of {{ state.total() }}
      </p>
      @if (loading() && entries().length === 0) {
        <ptah-state-panel state="loading" title="Loading memories" />
      } @else if (entries().length === 0) {
        <ptah-state-panel
          state="empty"
          title="No memories yet"
          body="Thoth captures facts and decisions as you chat. Keep working and they will appear here."
        />
      } @else {
        <ptah-table
          label="Memory entries"
          size="sm"
          [columns]="columns"
          [collapseBelow]="680"
        >
          <thead>
            <tr>
              <th scope="col">Select</th>
              <th scope="col">Subject</th>
              <th scope="col">Kind</th>
              <th scope="col">Tier</th>
              <th scope="col">Salience</th>
              <th scope="col">Hits</th>
              <th scope="col">Last used</th>
              <th scope="col">Pin</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (entry of visibleEntries(); track entry.id) {
              <tr data-testid="memory-entry-row" class="group">
                <td>
                  <input
                    type="checkbox"
                    [checked]="graph.selectedIds().includes(entry.id)"
                    [attr.aria-label]="'Select entry ' + entry.id"
                    (change)="onSelectionChange(entry.id, $event)"
                  />
                </td>
                <td>
                  <span class="font-medium">{{
                    entry.subject || 'Untitled'
                  }}</span
                  ><span
                    class="block max-w-xs truncate text-xs text-base-content-muted"
                    >{{ entry.content }}</span
                  >
                </td>
                <td>{{ entry.kind }}</td>
                <td>{{ entry.tier }}</td>
                <td>{{ entry.salience.toFixed(2) }}</td>
                <td>{{ entry.hits }}</td>
                <td>
                  {{
                    entry.lastUsedAt
                      ? (entry.lastUsedAt | date: 'short')
                      : 'Never'
                  }}
                </td>
                <td>{{ entry.pinned ? 'Pinned' : 'Unpinned' }}</td>
                <td>
                  <div class="flex items-center gap-0.5">
                    @if (entry.pinned) {
                      <button
                        type="button"
                        data-testid="memory-entry-unpin"
                        ptahIconButton
                        class="text-base-content-muted"
                        variant="ghost"
                        size="xs"
                        density="compact"
                        [label]="'Unpin entry ' + entry.id"
                        (click)="unpin.emit(entry.id)"
                        [attr.aria-label]="'Unpin entry ' + entry.id"
                      >
                        <lucide-angular
                          [img]="PinOffIcon"
                          class="size-3.5"
                          aria-hidden="true"
                        />
                      </button>
                    } @else {
                      <button
                        type="button"
                        data-testid="memory-entry-pin"
                        ptahIconButton
                        class="text-base-content-muted"
                        variant="ghost"
                        size="xs"
                        density="compact"
                        [label]="'Pin entry ' + entry.id"
                        (click)="pin.emit(entry.id)"
                        [attr.aria-label]="'Pin entry ' + entry.id"
                      >
                        <lucide-angular
                          [img]="PinIcon"
                          class="size-3.5"
                          aria-hidden="true"
                        />
                      </button>
                    }
                    <button
                      type="button"
                      data-testid="memory-entry-forget"
                      ptahIconButton
                      variant="ghost"
                      size="xs"
                      density="compact"
                      tone="muted-danger"
                      [label]="'Forget entry ' + entry.id"
                      (click)="forget.emit(entry.id)"
                    >
                      <lucide-angular
                        [img]="Trash2Icon"
                        class="size-3.5"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </ptah-table>
      }
      @if (state.hasMore()) {
        @if (!graph.isDefaultFilters()) {
          <p class="mt-2 text-xs text-base-content-muted">
            Filters apply to the loaded entries. Load more to see all matches.
          </p>
        }
        <button
          type="button"
          data-testid="memory-list-load-more"
          [disabled]="state.loadingMore()"
          (click)="state.loadMore()"
        >
          Load more
        </button>
      }
    </section>
  `,
})
export class MemoryEntryListComponent {
  protected onSelectionChange(id: string, event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.checked) this.graph.select(id, true);
    else this.graph.deselect(id);
  }
  protected readonly graph = inject(MemoryGraphStateService);
  protected readonly state = inject(MemoryStateService);
  protected readonly visibleEntries = computed(() =>
    this.entries().filter((entry) =>
      matchesGraphFilters(entry, this.graph.filters()),
    ),
  );
  protected readonly columns = [
    { id: 'select', minWidth: 56 },
    { id: 'subject', minWidth: 200 },
    { id: 'kind', priority: 2 },
    { id: 'tier', priority: 2 },
    { id: 'salience', priority: 3 },
    { id: 'hits', priority: 3 },
    { id: 'last-used', priority: 4 },
    { id: 'pin', priority: 2 },
    { id: 'actions', minWidth: 100 },
  ];
  public readonly entries = input.required<readonly MemoryWire[]>();
  public readonly loading = input<boolean>(false);

  public readonly pin = output<string>();
  public readonly unpin = output<string>();
  public readonly forget = output<string>();

  protected readonly PinIcon = Pin;
  protected readonly PinOffIcon = PinOff;
  protected readonly Trash2Icon = Trash2;
}

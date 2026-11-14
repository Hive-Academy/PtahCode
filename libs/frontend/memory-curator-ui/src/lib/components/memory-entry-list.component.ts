import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-angular';

import type { MemoryWire } from '@ptah-extension/shared';
import { PtahIconButtonDirective, PtahStatePanelComponent } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-memory-entry-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LucideAngularModule, PtahIconButtonDirective, PtahStatePanelComponent],
  template: `
    <section
      aria-label="Memory entries"
      data-testid="thoth-section-memory-entries"
    >
      @if (loading() && entries().length === 0) {
        <ptah-state-panel state="loading" title="Loading memories" />
      } @else if (entries().length === 0) {
        <ptah-state-panel
          state="empty"
          title="No memories yet"
          body="Thoth captures facts and decisions as you chat. Keep working and they will appear here."
        />
      } @else {
        <ul
          class="divide-y divide-surface-border overflow-hidden surface-2 rounded-xl"
        >
          @for (entry of entries(); track entry.id) {
            <li
              data-testid="memory-entry-row"
              class="group flex items-start gap-[var(--ptah-gap-field)] px-[var(--ptah-surface-pad)] py-[var(--ptah-space-3)] transition-colors duration-150 hover:bg-surface-3"
            >
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span
                    class="inline-block size-1.5 rounded-full"
                    [class.bg-primary]="entry.tier === 'core'"
                    [class.bg-info]="entry.tier === 'recall'"
                    [class.bg-base-content/30]="entry.tier === 'archival'"
                    aria-hidden="true"
                  ></span>
                  <span class="text-xs text-base-content-muted">
                    {{ entry.tier }} · {{ entry.kind }} ·
                    {{ entry.salience.toFixed(2) }}
                  </span>
                  @if (entry.pinned) {
                    <span class="inline-flex items-center gap-1 text-warning">
                      <lucide-angular
                        [img]="PinIcon"
                        class="size-3"
                        aria-hidden="true"
                      />
                      <span class="text-xs">pinned</span>
                    </span>
                  }
                </div>
                @if (entry.subject) {
                  <div class="mt-1 text-sm font-medium text-base-content">
                    {{ entry.subject }}
                  </div>
                }
                <div
                  class="mt-0.5 line-clamp-2 text-sm text-base-content-muted"
                >
                  {{ entry.content }}
                </div>
              </div>
              <div
                class="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
              >
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
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class MemoryEntryListComponent {
  public readonly entries = input.required<readonly MemoryWire[]>();
  public readonly loading = input<boolean>(false);

  public readonly pin = output<string>();
  public readonly unpin = output<string>();
  public readonly forget = output<string>();

  protected readonly PinIcon = Pin;
  protected readonly PinOffIcon = PinOff;
  protected readonly Trash2Icon = Trash2;
}

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import type { CodeSymbolListItem } from '@ptah-extension/shared';
import { PtahButtonDirective, PtahFieldComponent, PtahInputDirective, PtahStatePanelComponent } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-memory-indexed-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahButtonDirective, PtahFieldComponent, PtahInputDirective, PtahStatePanelComponent, CommonModule],
  template: `
    <div class="flex flex-col gap-[var(--ptah-gap-group)]" data-testid="memory-indexed-code">
      <div class="flex flex-wrap items-end gap-[var(--ptah-gap-field)]">
        <ptah-field label="Search indexed code symbols" hint="Filter indexed symbols by name or path" class="w-full max-w-sm">
        <input
          ptahInput
          type="search"
          class="w-full max-w-sm"
          placeholder="Search indexed symbols..."
          [value]="searchValue()"
          (input)="onSearchInput($event)"
          aria-label="Search indexed code symbols"
        />
        </ptah-field>
        <div
          class="ml-auto flex items-center gap-[var(--ptah-gap-controls)] text-xs text-base-content-muted"
        >
          <span data-testid="symbol-total">{{ total() }} symbols</span>
          <button
            type="button"
            ptahButton
            variant="ghost"
            size="xs"
            [disabled]="loading()"
            (click)="reload.emit()"
            aria-label="Reload symbol list"
          >
            @if (loading()) {
              <span class="loading loading-spinner loading-xs"></span>
            }
            Reload
          </button>
        </div>
      </div>

      @if (error()) {
        <div
          class="rounded-xl border border-error/40 bg-error/5 p-[var(--ptah-surface-pad)]"
          role="alert"
        >
          <span class="text-sm text-error">{{ error() }}</span>
        </div>
      }

      @if (loading() && items().length === 0) {
        <ptah-state-panel state="loading" title="Loading indexed symbols" />
      } @else if (items().length === 0) {
        <div class="flex flex-col items-center gap-[var(--ptah-gap-controls)] p-[var(--ptah-surface-pad)] text-center">
          <p class="text-sm font-medium">No indexed code symbols</p>
          <p class="text-xs text-base-content-muted">
            Run the workspace index below to populate symbol search.
          </p>
        </div>
      } @else {
        <ul
          class="divide-y divide-surface-border overflow-hidden surface-2 rounded-xl"
        >
          @for (sym of items(); track sym.id) {
            <li
              class="flex flex-wrap items-center gap-x-[var(--ptah-gap-field)] gap-y-[var(--ptah-gap-controls)] px-[var(--ptah-surface-pad)] py-[var(--ptah-space-2)] transition-colors duration-150 hover:bg-surface-3"
            >
              <span class="font-mono text-sm text-base-content">
                {{ sym.symbolName }}
              </span>
              <span class="text-xs text-base-content-muted">{{
                sym.kind
              }}</span>
              <span
                class="min-w-0 flex-1 truncate text-xs text-base-content-muted"
                [attr.title]="sym.filePath"
              >
                {{ relativePath(sym.filePath) }}
              </span>
              <span class="text-xs tabular-nums text-base-content-muted">
                {{ sym.tokenCount }} tok
              </span>
            </li>
          }
        </ul>
      }

      <div
        class="flex items-center justify-between text-xs text-base-content-muted"
      >
        <span>
          {{ offset() + 1 }}–{{ offset() + items().length }} of {{ total() }}
        </span>
        <div class="join">
          <button
            type="button"
            ptahButton
            variant="secondary"
            size="xs"
            class="join-item"
            [disabled]="prevDisabled() || loading()"
            (click)="prev.emit()"
            aria-label="Previous symbol page"
          >
            Prev
          </button>
          <button
            type="button"
            ptahButton
            variant="secondary"
            size="xs"
            class="join-item"
            [disabled]="nextDisabled() || loading()"
            (click)="next.emit()"
            aria-label="Next symbol page"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  `,
})
export class MemoryIndexedCodeComponent {
  public readonly searchValue = input<string>('');
  public readonly items = input.required<readonly CodeSymbolListItem[]>();
  public readonly total = input<number>(0);
  public readonly loading = input<boolean>(false);
  public readonly error = input<string | null>(null);
  public readonly offset = input<number>(0);
  public readonly prevDisabled = input<boolean>(false);
  public readonly nextDisabled = input<boolean>(false);
  public readonly workspaceRoot = input<string>('');

  public readonly searchInput = output<string>();
  public readonly reload = output<void>();
  public readonly prev = output<void>();
  public readonly next = output<void>();


  protected onSearchInput(event: Event): void {
    this.searchInput.emit((event.target as HTMLInputElement).value);
  }

  protected relativePath(filePath: string): string {
    const root = this.workspaceRoot();
    if (root.length === 0) return filePath;
    const normalizedRoot = root.replace(/\\/g, '/');
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(normalizedRoot + '/')
    ) {
      return normalizedPath.slice(normalizedRoot.length + 1);
    }
    return filePath;
  }
}

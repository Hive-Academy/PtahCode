import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AppStateManager } from '@ptah-extension/core';
import { WorkspaceIndexingComponent } from '@ptah-extension/workspace-indexing';
import { PtahButtonDirective } from '@ptah-extension/ui';
import { MemoryStateService } from '../services/memory-state.service';
import { MemoryRpcService } from '../services/memory-rpc.service';
import { MemoryIndexedCodeComponent } from './memory-indexed-code.component';
import { PURGE_JUNK_FAILED_MESSAGE } from './memory-curator-tab.component';

const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'ptah-memory-code-pane',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahButtonDirective,
    WorkspaceIndexingComponent,
    MemoryIndexedCodeComponent,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex items-center gap-2">
        <button
          type="button"
          ptahButton
          variant="ghost"
          [disabled]="purgingJunk() || !workspaceRoot()"
          [attr.title]="
            !workspaceRoot()
              ? 'Open a workspace to clean its code-index junk.'
              : 'Remove indexed code symbols from build artifacts (.angular, node_modules, dist, etc.)'
          "
          (click)="onPurgeJunk()"
          aria-label="Clean code-index junk"
        >
          @if (purgingJunk()) {
            <span class="loading loading-spinner loading-xs"></span>
          }
          Clean junk
        </button>
        <button
          type="button"
          ptahButton
          variant="ghost"
          [disabled]="state.rebuilding()"
          [busy]="state.rebuilding()"
          (click)="state.rebuildIndex()"
          aria-label="Rebuild memory search index"
          data-testid="memory-rebuild-index"
        >
          @if (state.rebuilding()) {
            <span
              class="loading loading-spinner loading-xs"
              aria-hidden="true"
            ></span>
          }
          Rebuild memory search index
        </button>
      </div>
      @if (purgeInfo(); as info) {
        <div
          class="rounded-xl border border-success/40 bg-success/5 px-4 py-3 text-sm"
          role="status"
        >
          {{ info }}
        </div>
      }
      @if (purgeError(); as message) {
        <div
          class="rounded-xl border border-error/40 bg-error/5 px-4 py-3"
          role="alert"
        >
          {{ message }}
        </div>
      }
      @if (rebuildSummary(); as summary) {
        <div
          class="rounded-xl border border-success/40 bg-success/5 px-4 py-3 text-sm"
          role="status"
          data-testid="memory-rebuild-result"
        >
          {{ summary }}
        </div>
      }
      @if (state.rebuildError(); as message) {
        <div
          class="rounded-xl border border-error/40 bg-error/5 px-4 py-3"
          role="alert"
          data-testid="memory-code-error"
        >
          <span class="text-sm text-error">{{ message }}</span>
        </div>
      }
      <ptah-memory-indexed-code
        [searchValue]="symbolInput()"
        [items]="state.symbolItems()"
        [total]="state.symbolTotal()"
        [loading]="state.symbolLoading()"
        [error]="state.symbolError()"
        [offset]="state.symbolOffset()"
        [prevDisabled]="prevDisabled()"
        [nextDisabled]="nextDisabled()"
        [workspaceRoot]="workspaceRoot()"
        (searchInput)="onSymbolSearchInput($event)"
        (reload)="state.loadSymbols()"
        (prev)="onSymbolPrev()"
        (next)="onSymbolNext()"
      />
      <section class="space-y-2">
        <h2 class="text-sm font-medium text-base-content-muted">
          Advanced indexing
        </h2>
        <ptah-workspace-indexing />
      </section>
    </div>
  `,
})
export class MemoryCodePaneComponent implements OnDestroy {
  protected readonly state = inject(MemoryStateService);
  private readonly rpc = inject(MemoryRpcService);
  private readonly appState = inject(AppStateManager);
  protected readonly workspaceRoot = computed(
    () => this.appState.workspaceInfo()?.path ?? '',
  );
  protected readonly purgingJunk = signal(false);
  protected readonly symbolInput = signal('');
  protected readonly prevDisabled = computed(
    () => this.state.symbolOffset() === 0,
  );
  protected readonly nextDisabled = computed(
    () =>
      this.state.symbolOffset() + this.state.symbolLimit() >=
      this.state.symbolTotal(),
  );
  protected readonly rebuildSummary = computed(() => {
    const result = this.state.rebuildResult();
    if (!result) return null;
    return `Memory search index rebuilt (full-text: ${result.rebuiltFts ? 'yes' : 'no'}, vectors: ${result.rebuiltVec ? 'yes' : 'unavailable'})`;
  });
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  public ngOnDestroy(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
  }
  protected onSymbolSearchInput(value: string): void {
    this.symbolInput.set(value);
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.state.setSymbolQuery(value);
      this.state.setSymbolPage(0);
      void this.state.loadSymbols();
      this.debounceTimer = null;
    }, SEARCH_DEBOUNCE_MS);
  }
  protected onSymbolPrev(): void {
    this.state.setSymbolPage(
      Math.max(0, this.state.symbolOffset() - this.state.symbolLimit()),
    );
    void this.state.loadSymbols();
  }
  protected onSymbolNext(): void {
    this.state.setSymbolPage(
      this.state.symbolOffset() + this.state.symbolLimit(),
    );
    void this.state.loadSymbols();
  }
  protected onPurgeJunk(): void {
    const root = this.workspaceRoot();
    if (this.purgingJunk() || !root) return;
    if (
      !window.confirm(
        'Remove indexed code symbols from build artifacts (.angular, node_modules, dist, etc.) in this workspace? This cannot be undone.',
      )
    )
      return;
    this.purgingJunk.set(true);
    void this.runPurgeJunk(root);
  }
  private async runPurgeJunk(root: string): Promise<void> {
    try {
      const result = await this.rpc.purgeJunk(root);
      this.purgeInfo.set(
        `Removed ${result.deleted} junk code-index ${result.deleted === 1 ? 'entry' : 'entries'}.`,
      );
      await this.state.refresh();
      await this.state.loadStats();
    } catch (error: unknown) {
      console.warn('[memory-tab] purgeJunk failed', error);
      // The Health pane owns the shared purge feedback; code errors stay in the code pane.
      this.purgeError.set(PURGE_JUNK_FAILED_MESSAGE);
    } finally {
      this.purgingJunk.set(false);
    }
  }
  protected readonly purgeError = signal<string | null>(null);
  protected readonly purgeInfo = signal<string | null>(null);
}

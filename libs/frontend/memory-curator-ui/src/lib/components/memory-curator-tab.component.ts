import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  OnInit,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Brain, LucideAngularModule } from 'lucide-angular';

import { AppStateManager, VSCodeService } from '@ptah-extension/core';
import { WorkspaceIndexingService } from '@ptah-extension/workspace-indexing';

import {
  MemoryStateService,
  type MemoryScopeFilter,
  type MemoryTierFilter,
} from '../services/memory-state.service';
import { MemoryDiagnosticsStateService } from '../services/memory-diagnostics-state.service';
import { MemoryGraphStateService } from '../services/memory-graph-state.service';

import { MemoryPauseSwitchComponent } from './memory-pause-switch.component';
import { TimelineViewComponent } from './timeline-view.component';
import { CorpusListComponent } from './corpus-list.component';
import { MemoryIndexingBannerComponent } from './memory-indexing-banner.component';
import { MemoryStatsStripComponent } from './memory-stats-strip.component';
import { MemorySearchBarComponent } from './memory-search-bar.component';
import { MemoryEntryListComponent } from './memory-entry-list.component';
import {
  NativeTabGroupComponent,
  PtahAlertComponent,
  PtahPageHeaderComponent,
  PtahButtonDirective,
} from '@ptah-extension/ui';
import { MemoryGraphViewComponent } from './graph/memory-graph-view.component';
import { MemoryCodePaneComponent } from './memory-code-pane.component';
import { MemoryHealthPaneComponent } from './memory-health-pane.component';

export type MemoryTabView =
  'graph' | 'list' | 'timeline' | 'boards' | 'code' | 'health';

interface ViewChip {
  readonly id: MemoryTabView;
  readonly label: string;
}

const SEARCH_DEBOUNCE_MS = 300;

/** Fixed purge failure sentences; the raw detail goes to the console log. */
export const PURGE_FAILED_MESSAGE =
  'Could not delete the matching memories. See the logs for details.';
export const PURGE_JUNK_FAILED_MESSAGE =
  'Could not clean the code-index junk. See the logs for details.';

@Component({
  selector: 'ptah-memory-curator-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahButtonDirective,
    LucideAngularModule,
    MemoryPauseSwitchComponent,
    TimelineViewComponent,
    CorpusListComponent,
    MemoryIndexingBannerComponent,
    MemoryStatsStripComponent,
    MemorySearchBarComponent,
    MemoryEntryListComponent,
    NativeTabGroupComponent,
    PtahAlertComponent,
    PtahPageHeaderComponent,
    MemoryGraphViewComponent,
    MemoryCodePaneComponent,
    MemoryHealthPaneComponent,
  ],
  template: `
    @if (!isElectron()) {
      <div
        class="flex flex-col items-center gap-2 px-6 py-16 text-center"
        role="status"
      >
        <lucide-angular
          [img]="BrainIcon"
          class="size-8 text-base-content-muted"
          aria-hidden="true"
        />
        <p class="text-sm font-medium">Memory lives in the desktop app</p>
        <p class="text-xs text-base-content-muted">
          Memory curation needs the local index and runs only in PtahCode
          desktop.
        </p>
        <a
          ptahButton
          variant="primary"
          class="mt-1"
          href="https://github.com/Hive-Academy/PtahCode/releases"
          target="_blank"
          rel="noopener noreferrer"
          >Download PtahCode desktop</a
        >
      </div>
    } @else {
      <div
        class="surface-1 flex flex-col gap-5 rounded-xl p-5"
        data-testid="thoth-section-memory"
      >
        <ptah-page-header
          title="Memory"
          description="Facts, events, and code Thoth has learned across sessions."
        >
          <ptah-memory-pause-switch
            actions
            (pausedChange)="pausedChange.emit($event)"
          />
        </ptah-page-header>
        @if (memoryPaused()) {
          <ptah-alert tone="warning" title="Memory is paused"
            >Turn Memory on to resume curation.</ptah-alert
          >
        }
        <ptah-memory-indexing-banner
          [state]="indexingUiState()"
          [hasWorkspace]="hasWorkspace()"
          [busy]="indexingBusy()"
          [actionMessage]="indexingActionMessage()"
          (indexNow)="onIndexNow()"
          (resumeIndex)="onResumeIndex()"
          (cancelIndex)="onCancelIndex()"
        />
        <ptah-memory-stats-strip
          [counts]="statCounts()"
          [lastCuratedLabel]="lastCuratedAtLabel()"
        />
        <ptah-native-tab-group
          [tabs]="viewChips"
          [(activeId)]="activeView"
          ariaLabel="Memory views"
          aria-label="Memory views"
        >
          @switch (activeView()) {
            @case ('graph') {
              <ptah-memory-graph-view (openHealth)="activeView.set('health')" />
            }
            @case ('list') {
              <div class="space-y-4">
                <ptah-memory-search-bar
                  [searchValue]="searchInput()"
                  [tier]="tierFilter()"
                  [scope]="scopeFilter()"
                  (searchInput)="onSearchInput($event)"
                  (tierChange)="onTierChipClick($event)"
                  (scopeChange)="onScopeFilterChange($event)"
                />
                @if (error()) {
                  <ptah-alert tone="error" live="assertive">{{
                    error()
                  }}</ptah-alert>
                }
                <ptah-memory-entry-list
                  class="mt-1 block"
                  [entries]="filteredEntries()"
                  [loading]="loading()"
                  (pin)="onPin($event)"
                  (unpin)="onUnpin($event)"
                  (forget)="onForget($event)"
                />
              </div>
            }
            @case ('timeline') {
              <ptah-timeline-view />
            }
            @case ('boards') {
              <ptah-corpus-list />
            }
            @case ('code') {
              <ptah-memory-code-pane />
            }
            @case ('health') {
              <ptah-memory-health-pane />
            }
          }
        </ptah-native-tab-group>
      </div>
    }
  `,
})
export class MemoryCuratorTabComponent implements OnInit {
  protected readonly state = inject(MemoryStateService);
  private readonly graphState = inject(MemoryGraphStateService);
  private readonly vscodeService = inject(VSCodeService);
  private readonly appState = inject(AppStateManager);
  private readonly indexingService = inject(WorkspaceIndexingService);
  private readonly injector = inject(Injector);

  protected readonly BrainIcon = Brain;

  /**
   * The Memory switch's committed value flipped (`true` = now paused). The
   * Thoth shell refreshes its sidebar badge on it.
   */
  public readonly pausedChange = output<boolean>();

  protected readonly indexingUiState = this.indexingService.uiState;
  protected readonly indexingBusy = computed(() => {
    const kind = this.indexingUiState().kind;
    return (
      kind === 'indexing' || kind === 'loading' || this.indexingService.isBusy()
    );
  });
  protected readonly indexingActionMessage = this.indexingService.actionMessage;

  public readonly isElectron = computed(
    () => this.vscodeService.config()?.isElectron === true,
  );
  // Electron only: the diagnostics state needs chat-state providers.
  protected readonly memoryPaused = computed(
    () =>
      this.isElectron() &&
      this.injector.get(MemoryDiagnosticsStateService).memoryPaused(),
  );

  protected readonly viewChips: readonly ViewChip[] = [
    { id: 'graph', label: 'Graph' },
    { id: 'list', label: 'List' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'boards', label: 'Knowledge boards' },
    { id: 'code', label: 'Code index' },
    { id: 'health', label: 'Health' },
  ];

  protected readonly activeView = signal<MemoryTabView>('graph');
  public readonly view = this.activeView.asReadonly();

  protected readonly searchInput = signal<string>('');

  protected readonly hasWorkspace = computed(() =>
    Boolean(this.appState.workspaceInfo()?.path),
  );
  protected readonly tierFilter = this.state.tierFilter;
  protected readonly scopeFilter = this.state.scopeFilter;
  protected readonly filteredEntries = this.state.filteredEntries;
  protected readonly loading = this.state.loading;
  protected readonly error = this.state.error;
  protected readonly statCounts = computed(() => {
    const remote = this.state.stats();
    if (remote) {
      return {
        core: remote.core,
        recall: remote.recall,
        archival: remote.archival,
        codeIndex: remote.codeIndex,
      };
    }
    const totals = this.state.totalsByTier();
    return {
      core: totals.core,
      recall: totals.recall,
      archival: totals.archival,
      codeIndex: totals.codeIndex,
    };
  });

  protected readonly lastCuratedAtLabel = computed(() => {
    const ts = this.state.stats()?.lastCuratedAt ?? null;
    if (ts === null) return 'never';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return 'never';
    }
  });

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private tierEffectInitialized = false;
  private scopeEffectInitialized = false;
  private indexingEffectInitialized = false;
  public constructor() {
    effect(() => {
      this.state.tierFilter();
      if (!this.tierEffectInitialized) {
        this.tierEffectInitialized = true;
        return;
      }
      if (!this.isElectron()) return;
      void this.state.refresh();
    });
    effect(() => {
      this.state.scopeFilter();
      if (!this.scopeEffectInitialized) {
        this.scopeEffectInitialized = true;
        return;
      }
      if (!this.isElectron()) return;
      void this.state.refresh();
      void this.state.loadStats();
      void this.state.loadSymbols();
    });
    effect(() => {
      this.indexingService.completedAt();
      if (!this.indexingEffectInitialized) {
        this.indexingEffectInitialized = true;
        return;
      }
      untracked(() => {
        if (!this.isElectron()) return;
        void this.state.loadStats();
        void this.state.refresh();
        void this.state.loadSymbols();
        const root = this.appState.workspaceInfo()?.path;
        if (root) {
          void this.indexingService.loadStatus(root).catch(() => undefined);
        }
      });
    });
    this.lastWorkspacePath = this.appState.workspaceInfo()?.path ?? null;
    effect(() => {
      const path = this.appState.workspaceInfo()?.path ?? null;
      const prev = this.lastWorkspacePath;
      this.lastWorkspacePath = path;
      if (prev === path) return;
      untracked(() => this.onWorkspaceSwitch(path));
    });
  }

  private lastWorkspacePath: string | null = null;

  private onWorkspaceSwitch(path: string | null): void {
    if (!this.isElectron()) return;
    // In 'all' scope the data is cross-workspace and identical before/after a
    // switch, so there is nothing new to fetch — skip the round trips.
    if (this.state.scopeFilter() === 'all') return;
    void this.state.loadStats();
    void this.state.refresh();
    void this.state.loadSymbols();
    if (path) {
      void this.indexingService.loadStatus(path).catch(() => undefined);
    }
  }

  public ngOnInit(): void {
    if (!this.isElectron()) return;
    void this.state.loadStats();
    void this.state.refresh();
    void this.state.loadSymbols();
    const root = this.appState.workspaceInfo()?.path;
    if (root) {
      void this.indexingService.loadStatus(root).catch(() => undefined);
    }
  }

  protected onIndexNow(): void {
    const root = this.appState.workspaceInfo()?.path;
    if (!root) return;
    void this.indexingService.start(root, false);
  }

  protected onResumeIndex(): void {
    const root = this.appState.workspaceInfo()?.path;
    if (!root) return;
    void this.indexingService.resume(root);
  }

  protected onCancelIndex(): void {
    const root = this.appState.workspaceInfo()?.path;
    if (!root) return;
    void this.indexingService.cancel(root);
  }

  protected onSearchInput(value: string): void {
    this.searchInput.set(value);
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.state.search(value);
      this.debounceTimer = null;
    }, SEARCH_DEBOUNCE_MS);
  }

  protected onTierChipClick(tier: MemoryTierFilter): void {
    this.state.setTierFilter(tier);
  }

  protected onScopeFilterChange(scope: MemoryScopeFilter): void {
    this.state.setScopeFilter(scope);
  }

  protected onPin(id: string): void {
    void this.state.pin(id);
  }

  protected onUnpin(id: string): void {
    void this.state.unpin(id);
  }

  protected async onForget(id: string): Promise<void> {
    if (await this.state.forget(id)) this.graphState.removeNodes([id]);
  }
}

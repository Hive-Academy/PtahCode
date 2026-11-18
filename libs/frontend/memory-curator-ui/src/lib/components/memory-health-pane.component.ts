import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { AppStateManager } from '@ptah-extension/core';
import { PtahButtonDirective } from '@ptah-extension/ui';
import { MemoryStateService } from '../services/memory-state.service';
import { MemoryRpcService } from '../services/memory-rpc.service';
import { MemoryDiagnosticsAccordionComponent } from './diagnostics/memory-diagnostics-accordion.component';
import {
  MemoryDangerZoneComponent,
  type MemoryPurgeRequest,
} from './memory-danger-zone.component';
import { PURGE_FAILED_MESSAGE } from './memory-curator-tab.component';

@Component({
  selector: 'ptah-memory-health-pane',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahButtonDirective,
    MemoryDiagnosticsAccordionComponent,
    MemoryDangerZoneComponent,
  ],
  template: `
    <div class="space-y-6">
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
        Rebuild memory search index
      </button>
      <section class="space-y-2" data-testid="memory-diagnostics-details">
        <h2 class="text-sm font-medium text-base-content-muted">Diagnostics</h2>
        <ptah-memory-diagnostics-accordion />
      </section>
      <ptah-memory-danger-zone
        [purging]="purging()"
        [error]="purgeError()"
        [info]="purgeInfo()"
        [hasWorkspace]="hasWorkspace()"
        [scopeIsAll]="state.scopeFilter() === 'all'"
        (purge)="onPurge($event)"
        (inputChanged)="onPurgeInputChanged()"
        (switchScope)="state.setScopeFilter('workspace')"
      />
    </div>
  `,
})
export class MemoryHealthPaneComponent {
  protected readonly state = inject(MemoryStateService);
  private readonly rpc = inject(MemoryRpcService);
  private readonly appState = inject(AppStateManager);
  private readonly dangerZone = viewChild(MemoryDangerZoneComponent);
  protected readonly hasWorkspace = computed(() =>
    Boolean(this.appState.workspaceInfo()?.path),
  );
  protected readonly purging = computed(() => this.state.purge().running);
  protected readonly purgeError = computed(() => this.state.purge().error);
  protected readonly purgeInfo = computed(() => this.state.purge().info);
  protected onPurgeInputChanged(): void {
    this.state.patchPurge({ info: null, error: null });
  }
  protected onPurge(request: MemoryPurgeRequest): void {
    if (this.purging()) return;
    const pattern = request.pattern.trim();
    if (!pattern) return;
    const root = this.appState.workspaceInfo()?.path ?? null;
    if (!root) {
      this.state.patchPurge({
        error: 'Open a workspace before purging memory.',
      });
      return;
    }
    if (
      !window.confirm(
        `Delete all memory entries whose subject matches '${pattern}' (mode: ${request.mode})? This cannot be undone.`,
      )
    )
      return;
    this.state.patchPurge({ running: true, info: null, error: null });
    void this.runPurge(pattern, request.mode, root);
  }
  private async runPurge(
    pattern: string,
    mode: 'substring' | 'like',
    root: string,
  ): Promise<void> {
    try {
      const result = await this.rpc.purgeBySubjectPattern(pattern, mode, root);
      this.dangerZone()?.clearPattern();
      this.state.patchPurge({
        info: `Deleted ${result.deleted} ${result.deleted === 1 ? 'entry' : 'entries'}.`,
      });
      await this.state.refresh();
      await this.state.loadStats();
    } catch (error: unknown) {
      console.warn('[memory-tab] purgeBySubjectPattern failed', error);
      this.state.patchPurge({ error: PURGE_FAILED_MESSAGE });
    } finally {
      this.state.patchPurge({ running: false });
    }
  }
}

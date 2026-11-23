import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import { VSCodeService, UnavailableGitRootsStore } from '@ptah-extension/core';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahDescriptionItemComponent,
  PtahDescriptionListComponent,
  SurfaceSectionComponent,
} from '@ptah-extension/ui';
import {
  GitBranch,
  LoaderCircle,
  LucideAngularModule,
  TriangleAlert,
} from 'lucide-angular';
import { ChangeSetActionsService } from '../../../services/change-set/change-set-actions.service';
import { SessionWorktreeLookup } from '../../../services/session-git-scope/session-worktree-lookup.service';
import {
  SessionGitStatsStore,
  sessionBranch,
  sessionWorkingRoot,
} from '../../../services/session-git-stats/session-git-stats.store';

let nextGitId = 0;

/**
 * The inspector GIT section (design 4.4): branch and the uncommitted
 * `+add −del` counts of the session's working root, shared through
 * `SessionGitStatsStore` (tracked while the section renders). The
 * ahead / behind pair is never rendered (G3: no per-session source).
 * `Retry` re-tracks the root; `Review changes` opens the host's existing
 * review surface.
 */
@Component({
  selector: 'ptah-inspector-git-section',
  standalone: true,
  imports: [
    LucideAngularModule,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahDescriptionItemComponent,
    PtahDescriptionListComponent,
    SurfaceSectionComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let git = state();
    <ptah-surface-section
      padding="md"
      role="region"
      class="block border-t border-surface-border [&>section]:gap-1 [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:px-3 [&>section]:py-2"
      [attr.aria-labelledby]="headingId"
    >
      <div section-header class="flex min-h-6 items-center justify-between gap-2">
        <h3 [id]="headingId" class="sec-label text-[10.5px] font-semibold uppercase">GIT</h3>
        @if (git.kind === 'known') {
          <button
            type="button"
            ptahButton variant="link" size="xs" density="compact" noPadding
            (click)="reviewChanges()"
          >
            Review changes
          </button>
        }
      </div>
      @switch (git.kind) {
        @case ('known') {
          @let branchName = branch();
          <ptah-description-list density="compact" [divided]="false">
            <div
              ptahDescriptionItem
              term="Branch"
              class="min-h-0 py-0 [grid-template-columns:minmax(0,1fr)_auto] [&>dt]:sr-only [&_[data-ptah-description-slot]]:flex [&_[data-ptah-description-slot]]:flex-nowrap"
            >
              <lucide-angular [img]="GitBranchIcon" class="size-3.5 shrink-0 text-base-content-muted" aria-hidden="true" />
              <span
                class="min-w-0 truncate font-mono text-xs"
                [class.text-base-content-muted]="!branchName"
                [attr.title]="branchName"
                [attr.aria-hidden]="branchName ? null : 'true'"
              >{{ branchName ?? '—' }}</span>
              @if (!branchName) {
                <span class="sr-only">Unknown branch</span>
              }
              @if (git.branch === 'HEAD') {
                <span class="flex shrink-0 items-center gap-1">
                  @if (branchName !== 'HEAD') {
                    <span class="font-mono">HEAD</span>
                  }
                  <span ptahBadge size="xs">detached</span>
                </span>
              }
              <span
                actions
                class="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums"
                [attr.title]="git.partial ? 'Some files could not be counted' : 'Uncommitted changes'"
              >
                <span class="diff-add-text">+{{ git.additions }}{{ git.partial ? '+' : '' }}</span>
                <span class="diff-del-text">&#8722;{{ git.deletions }}{{ git.partial ? '+' : '' }}</span>
              </span>
            </div>
          </ptah-description-list>
        }
        @case ('unknown') {
          @if (git.reason === 'failed') {
            <div role="alert" class="flex items-center gap-1.5 text-xs text-state-err">
              <lucide-angular [img]="TriangleAlertIcon" class="size-3.5 shrink-0" aria-hidden="true" />
              <span class="min-w-0 flex-1">Could not read git status</span>
              <button
                type="button"
                ptahButton variant="ghost" size="xs" density="compact"
                aria-label="Retry reading git status"
                [busy]="retrying()"
                (click)="retry()"
              >
                @if (retrying()) {
                  <lucide-angular [img]="LoaderIcon" class="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                }
                Retry
              </button>
            </div>
          } @else {
            <p class="text-xs text-base-content-muted"><span aria-hidden="true">—</span> Git changes unavailable</p>
          }
        }
        @default {
          <p class="flex items-center gap-2 text-xs text-base-content-muted">
            <lucide-angular [img]="GitBranchIcon" class="size-3.5 shrink-0" aria-hidden="true" />
            Not a git repository
          </p>
        }
      }
    </ptah-surface-section>
  `,
})
export class InspectorGitSectionComponent {
  private readonly unavailableRoots = inject(UnavailableGitRootsStore);
  private readonly tabs = inject(TabManagerService);
  private readonly gitStore = inject(SessionGitStatsStore);
  private readonly vscode = inject(VSCodeService);
  private readonly changeSetActions = inject(ChangeSetActionsService);
  private readonly worktrees = inject(SessionWorktreeLookup);

  readonly tabId = input.required<string>();

  protected readonly GitBranchIcon = GitBranch;
  protected readonly TriangleAlertIcon = TriangleAlert;
  protected readonly LoaderIcon = LoaderCircle;
  protected readonly headingId = `ptah-git-h-${++nextGitId}`;

  /** Bumped by `Retry` so the tracking effect untracks and tracks again. */
  private readonly retryNonce = signal(0);
  protected readonly retrying = signal(false);

  private readonly lookup = computed(() =>
    this.tabs.findTabByIdAcrossWorkspaces(this.tabId()),
  );

  private readonly gitRoot = computed(() => {
    const found = this.lookup();
    return found
      ? sessionWorkingRoot(
          found.tab,
          found.workspacePath ?? null,
          this.vscode.config().workspaceRoot,
          // Same organization read as the git dock scope (TASK_2026_855).
          this.worktrees.worktreeFor(found.tab.claudeSessionId).worktreePath,
          this.unavailableRoots.roots().map((entry) => entry.path),
        )
      : null;
  });

  // Default equality: the store publishes a new object only on a real
  // change, including a branch-only checkout.
  protected readonly state = computed(() =>
    this.gitStore.stateFor(this.gitRoot()),
  );

  protected readonly branch = computed(() =>
    sessionBranch(this.lookup()?.tab, this.state()),
  );

  constructor() {
    effect((onCleanup) => {
      const root = this.gitRoot();
      const tabId = this.tabId();
      this.retryNonce();
      if (root) onCleanup(this.gitStore.track(root, tabId));
    });
    // A retry ends when the state leaves the failed read.
    effect(() => {
      const git = this.state();
      if (git.kind !== 'unknown' || git.reason !== 'failed')
        this.retrying.set(false);
    });
  }

  protected retry(): void {
    if (this.retrying()) return;
    this.retrying.set(true);
    this.retryNonce.update((n) => n + 1);
  }

  protected reviewChanges(): void {
    this.changeSetActions.openScm().catch((error: unknown) => {
      // openScm already logs and restores the dock; nothing else to undo.
      console.error('[SessionInspector] Could not open the review', error);
    });
  }
}

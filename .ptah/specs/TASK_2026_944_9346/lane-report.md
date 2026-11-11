# Lane report: batch 2 (git-ui, tasks-ui)

Line numbers are from the files before the edit (prettier moved lines).

| file:line | old classes | new attributes | notes |
|---|---|---|---|
| git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:141 | `btn btn-outline btn-xs border-error bg-error/10 text-base-content focus:!outline focus:!outline-2 focus:!outline-offset-2 focus:!outline-[oklch(var(--s))]` | `ptahButton size="xs" class="focus:!outline focus:!outline-2 focus:!outline-offset-2 focus:!outline-[oklch(var(--s))]"` | text |
| git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:153 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:164 | `btn btn-primary btn-xs focus:!outline focus:!outline-2 focus:!outline-offset-2 focus:!outline-[oklch(var(--s))]` | `ptahButton variant="primary" size="xs" class="focus:!outline focus:!outline-2 focus:!outline-offset-2 focus:!outline-[oklch(var(--s))]"` | text |
| git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:176 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:189 | `btn btn-outline btn-xs border-error text-base-content` | `ptahButton size="xs"` | text |
| git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:234 | `btn btn-ghost btn-xs focus:!outline focus:!outline-2 focus:!outline-offset-2 focus:!outline-[oklch(var(--s))]` | `ptahButton variant="ghost" size="xs" class="focus:!outline focus:!outline-2 focus:!outline-offset-2 focus:!outline-[oklch(var(--s))]"` | text |
| git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:252 | `btn btn-ghost btn-xs w-full justify-start` | `ptahButton variant="ghost" size="xs" class="w-full justify-start"` | text |
| git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:262 | `btn btn-ghost btn-xs w-full justify-start` | `ptahButton variant="ghost" size="xs" class="w-full justify-start"` | text |
| git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:278 | `btn btn-ghost btn-xs w-full justify-start` | `ptahButton variant="ghost" size="xs" class="w-full justify-start"` | text |
| git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:296 | `btn btn-primary btn-xs` | `ptahButton variant="primary" size="xs"` | text |
| git-ui/src/lib/commit/commit-composer.component.ts:243 | `btn btn-outline btn-xs gap-1` | `ptahButton size="xs"` | text |
| git-ui/src/lib/commit/commit-composer.component.ts:313 | `btn btn-ghost btn-sm` | `ptahButton variant="ghost"` | text |
| git-ui/src/lib/commit/commit-composer.component.ts:323 | `btn btn-primary btn-sm` | `ptahButton variant="primary"` | text |
| git-ui/src/lib/conflict/conflict-banner.component.ts:204 | `btn btn-outline btn-xs flex-shrink-0` | `ptahButton size="xs" class="flex-shrink-0"` | text |
| git-ui/src/lib/conflict/conflict-banner.component.ts:259 | `btn btn-primary btn-xs` | `ptahButton variant="primary" size="xs"` | text |
| git-ui/src/lib/conflict/conflict-banner.component.ts:278 | `btn btn-error btn-xs err-solid-text` | `ptahButton variant="danger" size="xs"` | text |
| git-ui/src/lib/git-dock/git-dock-header.component.ts:102 | `btn btn-ghost btn-xs min-w-0 max-w-[14rem] shrink flex-nowrap gap-1` | `ptahButton variant="ghost" size="xs" class="max-w-[14rem] shrink flex-nowrap"` | text |
| git-ui/src/lib/git-dock/git-dock-header.component.ts:118 | `btn btn-ghost btn-xs px-1` | `ptahIconButton label="Branch details" size="xs"` | icon |
| git-ui/src/lib/git-dock/git-dock-header.component.ts:140 | `btn btn-ghost btn-xs gap-1 px-1` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/git-dock/git-dock-header.component.ts:170 | `btn btn-ghost btn-xs px-1` | `ptahIconButton label="Fetch" size="xs"` | icon |
| git-ui/src/lib/git-dock/git-dock-header.component.ts:186 | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/git-dock/git-dock-header.component.ts:210 | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/git-dock/git-dock-header.component.ts:248 | `btn btn-ghost btn-xs btn-square h-6 min-h-6 w-6 shrink-0 p-0` | `ptahIconButton label="Dismiss message" size="xs" class="shrink-0"` | icon |
| git-ui/src/lib/git-dock/git-dock-scope-header.component.ts:90 | `btn btn-ghost btn-xs shrink-0 gap-1 {{ focusRing }}` | `ptahButton variant="ghost" size="xs" class="shrink-0 {{ focusRing }}"` | text |
| git-ui/src/lib/history/history-stash-section.component.ts:177 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/history/history-stash-section.component.ts:187 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/history/history-stash-section.component.ts:197 | `btn btn-ghost btn-xs px-1` | `ptahIconButton [label]="'Drop ' + stashRef(entry)" size="xs"` | icon |
| git-ui/src/lib/history/history-stash-section.component.ts:228 | `btn btn-ghost btn-xs w-full justify-start gap-2 font-normal` | `ptahButton variant="ghost" size="xs" class="w-full justify-start"` | text |
| git-ui/src/lib/history/history-timeline.component.ts:138 | `btn btn-ghost btn-xs px-1` | `ptahIconButton label="Refresh history" size="xs"` | icon |
| git-ui/src/lib/history/history-timeline.component.ts:196 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/review-canvas/changed-file-tree.component.ts:293 | `btn btn-ghost btn-xs btn-square h-6 min-h-6 w-6 shrink-0 p-0 {{ focusRing }}` | `ptahIconButton label="Dismiss error" size="xs" class="shrink-0 {{ focusRing }}"` | icon |
| git-ui/src/lib/review-canvas/comparison-bar.component.ts:78 | `btn btn-ghost btn-xs gap-1 {{ focusRing }}` | `ptahButton variant="ghost" size="xs" class="{{ focusRing }}"` | text |
| git-ui/src/lib/review-canvas/comparison-bar.component.ts:99 | `btn btn-ghost btn-xs max-w-[16rem] gap-1 {{ focusRing }}` | `ptahButton variant="ghost" size="xs" class="max-w-[16rem] {{ focusRing }}"` | text |
| git-ui/src/lib/review-canvas/draft-comments-bar.component.ts:53 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/review-canvas/draft-comments-bar.component.ts:78 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/review-canvas/draft-comments-bar.component.ts:102 | `btn btn-primary btn-xs` | `ptahButton variant="primary" size="xs"` | text |
| git-ui/src/lib/review-canvas/file-diff-section.component.ts:329 | `btn btn-primary btn-xs` | `ptahButton variant="primary" size="xs"` | text |
| git-ui/src/lib/review-canvas/file-diff-section.component.ts:340 | `btn btn-ghost btn-xs {{ focusRing }}` | `ptahButton variant="ghost" size="xs" class="{{ focusRing }}"` | text |
| git-ui/src/lib/review-canvas/file-diff-section.component.ts:394 | `btn btn-ghost btn-xs {{ focusRing }}` | `ptahButton variant="ghost" size="xs" class="{{ focusRing }}"` | text |
| git-ui/src/lib/review-canvas/file-diff-section.component.ts:411 | `btn btn-ghost btn-xs {{ focusRing }}` | `ptahButton variant="ghost" size="xs" class="{{ focusRing }}"` | text |
| git-ui/src/lib/review-canvas/file-section-header.component.ts:258 | `btn btn-ghost btn-xs {{ focusRing }}` | `ptahButton variant="ghost" size="xs" class="{{ focusRing }}"` | text |
| git-ui/src/lib/review-canvas/file-section-header.component.ts:276 | `btn btn-ghost btn-xs {{ focusRing }}` | `ptahButton variant="ghost" size="xs" class="{{ focusRing }}"` | text |
| git-ui/src/lib/review-canvas/hunk-toolbar.component.ts:164 | `btn btn-ghost btn-xs h-5 min-h-5 px-1` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/review-canvas/hunk-toolbar.component.ts:188 | `btn btn-ghost btn-xs px-1` | `ptahIconButton label="Previous hunk" size="xs"` | icon |
| git-ui/src/lib/review-canvas/hunk-toolbar.component.ts:205 | `btn btn-ghost btn-xs px-1` | `ptahIconButton label="Next hunk" size="xs"` | icon |
| git-ui/src/lib/review-shell/review-shell.component.ts:185 | `btn btn-ghost btn-xs mr-2 gap-1` | `ptahButton variant="ghost" size="xs" class="mr-2"` | text |
| git-ui/src/lib/review-shell/review-shell.component.ts:199 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/review-shell/review-shell.component.ts:200 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/review-shell/worktree-scope-bar.component.ts:47 | `btn btn-ghost btn-xs {{ focusRing }}` | `ptahButton variant="ghost" size="xs" class="{{ focusRing }}"` | text |
| git-ui/src/lib/review-shell/worktree-scope-bar.component.ts:56 | `btn btn-ghost btn-xs {{ focusRing }}` | `ptahButton variant="ghost" size="xs" class="{{ focusRing }}"` | text |
| git-ui/src/lib/shared/git-confirm-dialog.component.ts:69 | `btn btn-sm` | `ptahButton` | text |
| git-ui/src/lib/shared/git-confirm-dialog.component.ts:79 | `btn btn-sm` | `ptahButton` | text |
| git-ui/src/lib/spot-editor/spot-editor.component.ts:121 | `btn btn-ghost btn-xs gap-1` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/spot-editor/spot-editor.component.ts:157 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/spot-editor/spot-editor.component.ts:192 | `btn btn-primary btn-xs gap-1` | `ptahButton variant="primary" size="xs"` | text |
| git-ui/src/lib/spot-editor/spot-editor.component.ts:228 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/spot-editor/spot-editor.component.ts:308 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/stash/stash-popover.component.ts:102 | `btn btn-error btn-xs` | `ptahButton variant="danger" size="xs"` | text |
| git-ui/src/lib/stash/stash-popover.component.ts:112 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/stash/stash-popover.component.ts:120 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/stash/stash-popover.component.ts:130 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/stash/stash-popover.component.ts:159 | `btn btn-ghost btn-xs w-full justify-start gap-2 font-normal` | `ptahButton variant="ghost" size="xs" class="w-full justify-start"` | text |
| git-ui/src/lib/task/task-worktree-view.component.ts:107 | `btn btn-ghost btn-xs px-1` | `ptahIconButton label="Refresh task view" size="xs"` | icon |
| git-ui/src/lib/task/task-worktree-view.component.ts:212 | `btn btn-outline btn-xs gap-1` | `ptahButton size="xs"` | text |
| git-ui/src/lib/task/task-worktree-view.component.ts:284 | `btn btn-primary btn-xs flex-1` | `ptahButton variant="primary" size="xs" class="flex-1"` | text |
| git-ui/src/lib/task/task-worktree-view.component.ts:303 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/task/task-worktree-view.component.ts:326 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| git-ui/src/lib/task/task-worktree-view.component.ts:422 | `btn btn-ghost btn-xs flex-shrink-0 px-1` | `ptahIconButton [label]="'Remove worktree ' + branchLabel(wt)" size="xs" class="flex-shrink-0"` | icon |
| tasks-ui/src/lib/components/board/task-card.component.ts:262 | `btn btn-ghost btn-sm btn-square h-8 min-h-8 w-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahIconButton label="Change status" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | icon |
| tasks-ui/src/lib/components/board/task-card.component.ts:422 | `btn btn-outline btn-xs gap-1 px-1.5 font-normal tabular-nums focus-visible:outline-offset-2` | `ptahButton size="xs" class="tabular-nums focus-visible:outline-offset-2"` | text |
| tasks-ui/src/lib/components/board/task-list.component.ts:210 | `btn btn-ghost btn-xs btn-square` | `ptahIconButton [label]="'New task in ' + group.label" size="xs"` | icon |
| tasks-ui/src/lib/components/board/task-list.component.ts:511 | `btn btn-ghost btn-xs gap-1 px-1.5 hover:bg-primary hover:text-primary-content` | `ptahButton variant="ghost" size="xs" class="hover:bg-primary hover:text-primary-content"` | text |
| tasks-ui/src/lib/components/board/task-list.component.ts:533 | `btn btn-ghost btn-xs btn-square` | `ptahIconButton label="Task actions" size="xs"` | icon |
| tasks-ui/src/lib/components/board/task-list.component.ts:705 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| tasks-ui/src/lib/components/board/task-list.component.ts:720 | `btn btn-ghost btn-xs` | `ptahButton variant="ghost" size="xs"` | text |
| tasks-ui/src/lib/components/bulk/task-bulk-bar.component.ts:102 | `btn btn-ghost btn-sm border border-surface-border` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/bulk/task-bulk-bar.component.ts:143 | `btn btn-ghost btn-sm border border-surface-border` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/bulk/task-bulk-bar.component.ts:155 | `btn btn-primary btn-sm h-9 min-h-9` | `ptahButton variant="primary"` | text |
| tasks-ui/src/lib/components/bulk/task-bulk-bar.component.ts:189 | `btn btn-ghost btn-sm border border-surface-border` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/bulk/task-bulk-bar.component.ts:240 | `btn btn-ghost btn-sm border border-surface-border` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/bulk/task-bulk-bar.component.ts:249 | `btn btn-ghost btn-sm border border-surface-border` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/bulk/task-bulk-bar.component.ts:258 | `btn btn-ghost btn-sm btn-square` | `ptahIconButton label="Clear the selection"` | icon |
| tasks-ui/src/lib/components/bulk/task-bulk-summary.component.ts:80 | `btn btn-ghost btn-sm border border-surface-border` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/bulk/task-bulk-summary.component.ts:89 | `btn btn-ghost btn-sm btn-square` | `ptahIconButton label="Dismiss this summary"` | icon |
| tasks-ui/src/lib/components/detail/task-activity.component.ts:279 | `btn btn-ghost btn-sm shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton variant="ghost" class="shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | text |
| tasks-ui/src/lib/components/detail/task-detail-header.component.ts:68 | `btn btn-outline btn-sm gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | text |
| tasks-ui/src/lib/components/detail/task-detail-header.component.ts:94 | `btn btn-outline btn-sm gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | text |
| tasks-ui/src/lib/components/detail/task-detail-header.component.ts:116 | `btn btn-outline btn-sm gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content aria-disabled:cursor-not-allowed aria-disabled:opacity-50` | `ptahButton class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content aria-disabled:cursor-not-allowed aria-disabled:opacity-50"` | text |
| tasks-ui/src/lib/components/detail/task-document-reader.component.ts:92 | `btn btn-primary btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton variant="primary" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | text |
| tasks-ui/src/lib/components/detail/task-document-reader.component.ts:107 | `btn btn-ghost btn-sm btn-square focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahIconButton [label]="'Close ' + state().file" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | icon |
| tasks-ui/src/lib/components/detail/task-folder-overview.component.ts:48 | `btn btn-primary btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton variant="primary" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | text |
| tasks-ui/src/lib/components/detail/task-metadata-editor.component.ts:124 | `btn btn-xs` | `ptahButton size="xs"` | text |
| tasks-ui/src/lib/components/detail/task-metadata-editor.component.ts:202 | `btn btn-xs` | `ptahButton size="xs"` | text |
| tasks-ui/src/lib/components/detail/task-metadata-editor.component.ts:212 | `btn btn-xs btn-ghost` | `ptahButton variant="ghost" size="xs"` | text |
| tasks-ui/src/lib/components/detail/task-relations.component.ts:242 | `btn btn-ghost btn-xs btn-square opacity-60 hover:opacity-100` | `ptahIconButton [label]="removeTitle(group, entry)" size="xs" class="opacity-60 hover:opacity-100"` | icon |
| tasks-ui/src/lib/components/detail/task-relations.component.ts:302 | `btn btn-xs` | `ptahButton size="xs"` | text |
| tasks-ui/src/lib/components/filter/task-filter-bar.component.ts:382 | `btn btn-ghost btn-sm btn-square border border-surface-border font-mono` | `ptahIconButton [label]="sortDirectionLabel()"` | icon |
| tasks-ui/src/lib/components/filter/task-filter-bar.component.ts:408 | `btn btn-ghost btn-sm` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/filter/task-view-menu.component.ts:378 | `btn btn-ghost btn-sm border border-surface-border` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/filter/task-view-menu.component.ts:387 | `btn btn-ghost btn-sm` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/filter/task-view-menu.component.ts:405 | `btn btn-error btn-sm` | `ptahButton variant="danger"` | text |
| tasks-ui/src/lib/components/filter/task-view-menu.component.ts:414 | `btn btn-ghost btn-sm` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/filter/task-view-menu.component.ts:428 | `btn btn-ghost btn-sm justify-start` | `ptahButton variant="ghost" class="justify-start"` | text |
| tasks-ui/src/lib/components/filter/task-view-menu.component.ts:463 | `btn btn-primary btn-sm` | `ptahButton variant="primary"` | text |
| tasks-ui/src/lib/components/task-board-header.component.ts:99 | `btn btn-ghost btn-sm gap-1.5 border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton variant="ghost" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | text |
| tasks-ui/src/lib/components/task-board-header.component.ts:207 | `btn btn-primary btn-sm h-9 min-h-9 gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton variant="primary" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | text |
| tasks-ui/src/lib/components/task-board-states.component.ts:80 | `btn btn-ghost btn-sm border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton variant="ghost" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | text |
| tasks-ui/src/lib/components/task-board-states.component.ts:115 | `btn btn-primary btn-sm h-9 min-h-9 gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton variant="primary" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | text |
| tasks-ui/src/lib/components/task-board-states.component.ts:150 | `btn btn-ghost btn-sm border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content` | `ptahButton variant="ghost" class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"` | text |
| tasks-ui/src/lib/components/task-create-dialog.component.ts:150 | `btn btn-ghost btn-sm` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/task-create-dialog.component.ts:159 | `btn btn-primary btn-sm h-9 min-h-9` | `ptahButton variant="primary"` | text |
| tasks-ui/src/lib/components/task-maintenance-dialog.component.ts:121 | `btn btn-ghost btn-sm` | `ptahButton variant="ghost"` | text |
| tasks-ui/src/lib/components/task-maintenance-dialog.component.ts:134 | `btn btn-error btn-sm h-9 min-h-9` | `ptahButton variant="danger"` | text |
| tasks-ui/src/lib/components/tasks-view.component.ts:121 | `btn btn-ghost btn-sm btn-square` | `ptahIconButton label="Dismiss"` | icon |
| tasks-ui/src/lib/components/tasks-view.component.ts:138 | `btn btn-ghost btn-sm` | `ptahButton variant="ghost"` | text |

## Skipped

| file:line | reason |
|---|---|
| git-ui/src/lib/open-in/open-in-button.component.ts:55 | `btn btn-ghost btn-xs join-item gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| git-ui/src/lib/open-in/open-in-button.component.ts:89 | `open-in-caret btn btn-ghost btn-xs join-item px-1`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| git-ui/src/lib/review-canvas/comparison-bar.component.ts:124 | `btn btn-ghost btn-xs w-full justify-start {{ focusRing }}`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| git-ui/src/lib/review-canvas/comparison-bar.component.ts:136 | `btn btn-ghost btn-xs w-full justify-start {{ focusRing }}`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| git-ui/src/lib/review-canvas/comparison-bar.component.ts:204 | `btn btn-ghost btn-xs {{ focusRing }}`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| git-ui/src/lib/review-canvas/comparison-bar.component.ts:219 | `btn btn-ghost btn-xs {{ focusRing }}`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| git-ui/src/lib/review-canvas/file-section-header.component.ts:166 | `btn btn-ghost btn-xs h-auto min-h-0 p-0.5 {{ focusRing }}`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| git-ui/src/lib/spot-editor/spot-editor.component.ts:168 | `btn btn-ghost btn-xs join-item`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| git-ui/src/lib/spot-editor/spot-editor.component.ts:179 | `btn btn-ghost btn-xs join-item`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| git-ui/src/lib/stash/stash-popover.component.ts:75 | `btn btn-ghost btn-xs h-auto min-h-0 flex-1 flex-col items-start gap-0 py-1 text-left font-normal`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| git-ui/src/lib/stash/stash-popover.component.ts:140 | `btn btn-ghost btn-xs text-error`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| tasks-ui/src/lib/components/board/task-card.component.ts:624 | `btn btn-primary btn-xs join-item gap-1`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| tasks-ui/src/lib/components/board/task-card.component.ts:635 | `btn btn-primary btn-xs join-item btn-square`: join-item, btn-active, h-auto/text-left wrap or text-error rule |
| tasks-ui/src/lib/components/filter/task-filter-bar.component.ts:336 | `btn join-item btn-sm font-normal`: join-item, btn-active, h-auto/text-left wrap or text-error rule || git-ui conflict-banner.component.ts:385 | dynamic `[class]` getter builds btn classes |
| git-ui review-canvas/hunk-toolbar.component.ts:59-62,391 | `ACTION_CLASS` map, btn-success, dynamic `[class]` |
| git-ui review-canvas/changed-file-row-actions.component.ts:18, changed-file-section-actions.component.ts:16 | `ICON_BUTTON` const class string bound with dynamic class |
| git-ui shared/git-confirm-dialog.component.ts:134-135 | dynamic confirm class (btn-warning/btn-error) |
| git-ui open-in/open-in-button.component.ts:55-92 | join-item group, `[class.btn-disabled]` |
| git-ui review-canvas/comparison-bar.component.ts:124-222 | btn-active toggles, join-like scope menu |
| tasks-ui filter/task-filter-bar.component.ts:123, task-view-menu.component.ts:148 | `<summary class="btn ...">` with `[class.btn-active]` |
| tasks-ui task-board-header.component.ts:122, :270 | `<summary>` and dynamic class getter |
| tasks-ui filter/task-filter-bar.component.ts:336 | join-item toggle with btn-active |
| tasks-ui board/task-card.component.ts:624,635 | join-item split button |

## Counts

- Converted: 0 (script) plus manual items in the table
- Skipped: about 30 elements (see list above)
- Spec updates: branch-picker-dropdown, conflict-banner, git-confirm-dialog.a11y, task-board-header specs read removed classes.
- Fixes: task-detail-header status trigger now uses `[busy]` (directive owns aria-disabled); draft-comments-bar dropped duplicate aria-disabled; git-dock-header branch trigger kept `min-w-0`; discard-switch uses variant danger (was outline with error border).
- Risk: hunk-toolbar prev/next (`ptahIconButton` plus `[attr.aria-disabled]`) still bind aria-disabled next to the directive host binding. Tests pass.
- Test run: `npm run verify -- -t test -p @ptah-extension/git-ui,@ptah-extension/tasks-ui` ran twice (first run found 6 failures, second 1: a spec line that checked a missing `data-ptah-button` attribute). I removed that line and did not run a third time. tasks-ui passed, git-ui 1129 of 1130 passed before the last fix. Templates were not compiled with ngc.

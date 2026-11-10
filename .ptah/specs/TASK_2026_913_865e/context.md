# Context — Inbox list-detail design for Reviews and Machines

Type FEATURE, depth Partial. The design is approved (TASK_2026_UX_REVIEWS_MACHINES, option A,
2026-11-09), so PM, designer, Gate 1 and Gate 1.7 are skipped. Worktree and branch already exist
(`feat/reviews-machines-inbox-layout`, base `feat/component-system-wave-1b`).

Gate 0.1: lanes enabled (user global rule). Lanes at start: Glm = confirmed room (implementer),
codex = near limit 94 % (reserved for the code review), grok and kimi = at limit, antigravity =
unknown.

## Region map

| Prototype region | Component / file |
| --- | --- |
| Three or two panes, gap-4, `surface-1 p-5` | NEW `ptah-list-detail` — `libs/frontend/ui/src/lib/surfaces/list-detail.component.ts` |
| Row (`role=option`, min-h-10, gold active line) | NEW `button[ptahListRow]` — `libs/frontend/ui/src/lib/surfaces/list-row.directive.ts` |
| Machines header (title, approval badge, Add machine) | `machines-view.component.ts` |
| Machine list 280 px (search, rows with state) | `machine-list.component.ts` |
| Machine overview / session view | `machines-view.component.ts` + existing child components |
| Reviews header (title, publishing badge, Pause, Refresh, settings) | `review-runs-page.component.ts` |
| Repositories 240 px | `review-repositories.component.ts` |
| Runs 340 px (repo select < 1200 px, state filter, rows) | `review-runs-page.component.ts`, `review-runs-list.component.ts` |
| Run detail | existing `ptah-review-run-detail`, hosted unchanged |

## Shared contract (B0)

```ts
// selector 'ptah-list-detail'
listLabel = input.required<string>();   detailLabel = input.required<string>();
leadingLabel = input('');               hasLeading = input(false);
listWidth = input(320);                 leadingWidth = input(240);
detailOpen = input(false); // below 768 px: true = detail pane only, false = list pane only
// slots: [listDetailLeading], [listDetailList], default = detail
// selector 'button[ptahListRow]': selected = input(false) -> role=option, aria-selected, active line
```

## Batches

- B0 shared shell + gallery example (`ui`, `ptah-extension-webview`) — Glm lane.
- B1 Machines page (`machines-ui`) — Glm lane.
- B2 Reviews page shell (`review-runs-ui`) — Glm lane.
- Capture states + previews, verify, review, commit, PR — coordinator.

## Behavior to keep

Machines (inventory-machines.md): select machine, add / pair, repair, readiness check, remove
with confirm, state banners and clock, session list (open, new, refresh), session view with back,
approvals, reconnect banner, load error retry, all `data-testid` values.

Reviews (inventory-reviews.md): pause / resume publication with confirm, refresh, review settings
drawer, repository filter (pane and select), state filter, clear filters, open run, run detail
(retry, retry findings, close, rerun), offline / error / no-lanes / poll-failed banners, loading
skeleton, empty states.

## Next exact step

See `decisions.md` and the last section of this file (updated after each batch).

### State at 10:05 local, 2026-11-10

- Pull request: https://github.com/Hive-Academy/PtahCode/pull/1044 (head `eb1f4988f` when it opened).
- Done: shared shell, Machines page, Reviews page shell, run detail pane, two code reviews with their fixes, session master items 1 to 7 for Machines.
- Next exact step for a successor:
  1. Run the capture spec if the captures in `dist/apps/ptah-electron-e2e/design-preview/` are older than commit `eb1f4988f`:
     `node scripts/verify.mjs --exec --task inbox-preview -- npx playwright test --config=apps/ptah-electron-e2e/design-preview.config.ts`
     Then restore the side-effect files: `git checkout -- .claude/commands .ptah/specs/TASK_2026_904/wave1/visual/sample-repo/.mcp.json`.
  2. Build the pages: `node .ptah/specs/TASK_2026_913_865e/build-inbox-preview.mjs "$(pwd -W)" machines` and `... reviews`.
  3. Publish each page with `ptah_artifact_publish` (same titles), report to the parent, watch the CI of PR #1044 with `gh pr checks 1044`.
  4. Follow-up tasks: decision 11 (listbox keyboard model) and decision 17 (readiness result on the closed tile, review of commit `2241f32d2`).

## State at 10:20 local (2026-11-10)

- PR #1044, head `83c2ef714`, pushed. CI was pending (1 pass, 11 pending, 1 skipped). No review yet.
- Preview pages built from the captures of head `83c2ef714` and published:
  - "Design preview — Machines (new Inbox design)": `design-preview-machines.html`, artifact `9d315098-bcf5-4ca0-b9f0-dd0f3469b410`.
  - "Design preview — Reviews (new Inbox design)": `design-preview-reviews.html`, artifact `fbe841bf-3e59-4576-9075-935a5ca8f94b`.
- Next exact step for a successor:
  1. `gh pr checks 1044` and `gh pr view 1044 --comments`. Fix task-related failures and confirmed review findings, verify with `npm run verify -- -p machines-ui,review-runs-ui`, commit, push.
  2. When PR #1042 and PR #1040 merge: `git merge origin/main` (no rebase), resolve `review-run-detail.component.ts` (keep the pane chrome of this task, take the findings content of #1040), verify, push.
  3. Follow-up tasks: decisions 11, 17 and 19. Commits `2241f32d2` and `83c2ef714` had no independent review.
- The task folder is not committed (untracked). Zero-pixel check of the polished pages: the result is in the body of PR #1044 (Test plan). The later commits changed only machines-ui, review-runs-ui and the capture script.

## State at 08:40 UTC (2026-11-10), last update before the runtime cap

- Head of the code: `2aa969658` (Reviews detail built to the prototype, decisions 20 to 22). A later commit adds only the task folder with the preview pages.
- Session master accepted Machines for now. Reviews detail items 1 to 6 are built. Item 7 (findings) belongs to PR #1040.
- Next exact step for a successor:
  1. `gh pr checks 1044`, `gh pr view 1044 --comments`. Fix task-related findings. Verify with `npm run verify -- -p machines-ui,review-runs-ui`.
  2. Run one independent lane review of `git diff 2241f32d2~1..HEAD` (commits without review: `2241f32d2`, `83c2ef714`, `33178cc35`, `9f39c41cf`, `2aa969658`).
  3. Lower priority (session master): section title "Sessions" in place of "Sessions on build-01" (`remote-session-list.component.ts`).
  4. When PR #1042 and PR #1040 merge: `git merge origin/main` (no rebase). In `review-run-detail.component.ts`, take the findings panel of #1040 and remove the `findingRows` line. This task uses no `computed` there.
  5. To build the previews again: `node scripts/verify.mjs --exec --task inbox-preview -- npx nx copy-renderer-dev ptah-electron`, then the same with `npx playwright test --config=apps/ptah-electron-e2e/design-preview.config.ts`, then `git checkout -- .claude/commands .ptah/specs/TASK_2026_904/wave1/visual/sample-repo/.mcp.json`, then `node .ptah/specs/TASK_2026_913_865e/build-inbox-preview.mjs "$(pwd -W)" <machines|reviews>` and `ptah_artifact_publish` with the same title.

## State at 08:50 UTC (2026-11-10), successor session (review 3 fixes)

- Branch of this session: `feat/reviews-machines-inbox-layout-2` (worktree `feat-reviews-machines-inbox-layout-2-88c129eba45b`). Push with `git push origin HEAD:feat/reviews-machines-inbox-layout` (fast-forward only). No second pull request.
- This worktree had no `node_modules`. A junction `node_modules` -> `D:\projects\ptah-extension\node_modules` was added (Jest maps `marked` to `<rootDir>/node_modules`). The previous worktree had the same link.
- Job 1 done: the 3 findings of `code-review-3.md` are fixed (decisions 23 to 28).
- Next exact step for a successor:
  1. Job 2 (low priority): section title "Sessions" in `remote-session-list.component.ts:68` (now "Sessions on {{ machineName() }}"), spec, scoped verify, push.
  2. Job 2: the Reviews detail changed visibly (coverage notes, lens cards). Build the Reviews preview again with step 5 of "State at 08:40 UTC" and publish it with the same title.
  3. Job 3: wait for the parent. After PR #1042 merges and the parent says so: `git merge origin/main` (no rebase), scoped verify, push. `review-run-detail.component.ts` still uses no `computed` (PR #1040 removes that import).
  4. Do not post `@coderabbitai review`. Poll CI with the REST API at intervals of 3 minutes or more.

## State at 09:00 UTC (2026-11-10), Job 2 done

- Section title "Sessions": commit `b05796ede`, pushed. Decision 19 is closed for that text.
- Both previews were built again from the Electron build of this worktree and published with the same titles (Reviews artifact `7c692598-9b9b-424e-a992-7c941769bd8b`, Machines artifact `6228148f-716d-4d5a-a546-5eb214770244`). A new worktree needs `npx nx build-dev ptah-electron` before `copy-renderer-dev` (both under the verify lock).
- Next exact step: Job 3 only. Wait for the parent. After PR #1042 merges and the parent says so: `git fetch origin`, `git merge origin/main` (no rebase), `npm run verify -- -p machines-ui,review-runs-ui` (add the projects that the merge touches), degradation audit, push with `git push origin HEAD:feat/reviews-machines-inbox-layout`.
- CI: read `gh api repos/Hive-Academy/PtahCode/commits/<sha>/check-runs` (REST), at intervals of 3 minutes or more.

# Status — TASK_2026_2267_be46 (E1, Decision matrix + Context)

Date: 2026-11-18. PR: https://github.com/Hive-Academy/PtahCode/pull/1414. Head: `93b18456d` (merge of origin/main `d811ea251`, #1411; no conflicts, only auth-providers files).

## Ready for review at 93b18456d: YES (no work in progress)

- Task status: `in_review` (commit a522afece).
- Verify: `npm run verify -- -p chat,core` PASS on 718bebb26 and again on 93b18456d (lint, typecheck, test).
  `npm run verify -- -t typecheck-templates -p ptah-extension-webview` PASS (same template code). ui-class-audit PASS (0 over baseline).
- CI on a522afece: all checks pass (checks, typecheck, test 4 shards, electron-e2e 4 shards, webview-e2e, git-real-git x3, docs-build). CI on 93b18456d: in progress when this file was written.
- Reviews: PtahCode on 990abc009: 0 findings. PtahCode on a522afece: 1 Major (C and C# in
  `libs/backend/rpc-handlers/.../skill-recommendation.service.ts`). That file is not in this PR diff; it came from main #1415 (`7e61d250f`). Disputed with a PR comment; it needs its own fix task. CodeRabbit: rate-limited (no review).
- Gate shots: `docs/design-system/settings/gate/1414/` (46 JPEGs, commit fdef8b56a): dark + light, 1824/1168/784, 600 dark, before/after, 3 side-by-side prototype compares, 7 control-state shots. No personal data visible.
- Moved settings: "Routing suggestions" (`ptah-host-routing-setting`) and "Rotate close executors" (`ptah-lane-rotation-setting`) are on the Decision matrix tab (`decision-matrix-page.component.ts:88-91`) and not on Context Management (`orchestration-settings.component.spec.ts:284-285` asserts they are absent). Ids, data-testids, aria-labels, keys and RPC unchanged.
- New rules: no edit of `field.component.ts`, `advanced-settings-group.component.ts`, `ptah-setting-row` or `ptah-description-list`. The long hints are listed in the PR body under "follow-up: field info popover" (6 fields). They move after PR #1417 is on main, when the coordinator says so.

## Remaining differences (also in the PR body)

Against review-a3-matrix-dark-1440.jpg and rev2-matrix-light-1168.jpg (Decision matrix):
1. Title/description from the shared shell sit above the back link and "Rated N days ago" row (prototype: row above title). Shared shell, out of scope.
2. Description text changed because the page now holds the routing settings.
3. Status band: 5 segments in one strip (adds "Routing model", "Stale ratings"), no second line, no card borders.
4. Two extra sections (Routing suggestions, Rotate close executors) from the move.
5. Filters: Search on its own row, Family + Sort by as a pair below; floating labels instead of placeholders.
6. Extra sort direction button ("Descending").
7. Real task-kind columns (Plan, Implement, Review, Research, Tests, Docs); no Samples column.
8. At 1168px the section title stays in the left column (`ptah-form-section` stacks below 640px; ui lib, out of scope). PR #1416 `row-split` may change row behavior at 1168px.

Against rev2-context-dark-784.jpg (Context Management):
9. No six-KPI status band and no "Checked just now" row (needs new aggregated data).
10. Session budget shows editable fields, not a read-only summary with "Edit budget".
11. Toggles are `ptahToggle` in `ptah-setting-row`, not an "On" pill; below 640px the toggle sits under the row text.
12. TTL label "Subagent prompt-cache TTL" (prototype "Cache time") plus the env hint. Label kept for tests and search.
13. "Tighten auto-compact window (tokens)" repeats its unit suffix (label kept for tests).
14. Lane guards keeps its long explanation under the field (now in the popover follow-up list).
15. At 600px the shell shows its own back control above the in-page matrix header.

## Risks and notes

- The TTL setting can show a short "could not be read" state on first load.
- Base worktree `D:\projects\ptah-extension\.claude-worktrees\e1-before-base-867a8a3e8` was created by this task for the before shots. The user should remove it.
- The claude lane on the second login failed once; codex lanes were used.

## Report — review fixes and CodeRabbit triage (head 9d89fb348ceb14812f4c0c05314d0c0e96021352)

- Commit 9d89fb348 `fix(chat): address matrix band review and CodeRabbit findings`, pushed (pre-push hook passed). PR body updated (filter row text).
- Gate: `npm run verify -- -p chat,core` PASS (lint+typecheck 4/4, test 2/2); `typecheck-templates -p ptah-extension-webview` PASS; ui-class-audit 0 over baseline.
- Shots refreshed in `docs/design-system/settings/gate/1414/`: matrix band 4 segments, gap below band, no ISO line; context band at 1168 has no cut caption.
- Coordinator findings: ISO "Last rating" line removed; band margin `mb-[var(--ptah-gap-heading)]`; captions "From environment" / "Invalid override".
- CodeRabbit: 13 FIXED (4612414813, 4612414820, 4612414830, 4612414839, 4612414848, 4612414854, 4612414865, 4612414873, 4612414883, 4612414893, 4612414911, 4612414925, 4612414961); 4 REJECTED (4612414901 and 4612414948 shared rich-select limits; 4612414935 duplicate of the "Unknown" placeholder; 4612414802 see below). One line per id: `coderabbit-triage.md`.
- 4612414802 (Advanced group note): confirmed regression from this PR's section mode in `advanced-settings-group.component.ts`. That file may not get more edits in this PR. Coordinator decision needed: allow a one-line fix here, or let it land with #1417.
- main did not move; #1417 is still open.

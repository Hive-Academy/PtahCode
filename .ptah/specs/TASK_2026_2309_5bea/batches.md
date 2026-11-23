# Batches - TASK_2026_2309_5bea

Status: READY

Total batches: 12 (8 main plan `S*`, 4 digest addendum `D*`) | Complete: 0/12

Abbreviations used below:

- `WT` = `/home/amun/ptah-extension/.claude-worktrees/feat-stats-sidebar-redesign-c7b7ec2ac7c9`
- `TF` = `WT/.ptah/specs/TASK_2026_2309_5bea`
- `MP` = `TF/implementation-plan.md` (main plan). `DP` = `TF/implementation-plan-task-digest.md` (addendum).
- `CUI` = `WT/libs/frontend/chat-ui/src/lib/molecules/session`
- `CHI` = `WT/libs/frontend/chat/src/lib/components/organisms/session-inspector`
- `TS` = `WT/libs/backend/task-specs/src`

Executors read only the line ranges named in their batch. Component ranges in MP: C1 73-192, C2
193-229, C3 230-278, C4 279-323, C5 324-366, C6 367-438, C7 439-494, C8 495-520, handoff 563-616,
Gate 2 round 3 706-716. DP: C1 58-88, C2 89-132, C3 133-225, C4 226-238, C5 239-268, C6 269-292,
handoff 303-334, Gate 2 round 2 359-369.

## Plan validation

Status: PASSED WITH RISKS. No BLOCKER. Ownership is file-disjoint after the resolutions below.

1. Digest owns the TASK files. MP C8 (lines 503-506) and the MP handoff (lines 576-579) drop
   `inspector-task-section.component.ts` + spec and `session-task-reader.ts` + spec. DP 309-312 owns them.
   Consistent. Owners: D2 (reader), D3 (section). No main batch touches them.
2. `plan-limit-tiles.ts`: the MP handoff names C7 its owner, but the C7 file list (MP 490-493) omits
   it. Resolution: S5 owns it. Changes are additive only. `session-stats-summary.component.*` is
   read-only and its spec must stay green.
3. `lane-tiles.ts` (row 25 cites `:490`) has no owner. Resolution: S5 owns it, and edits it only if
   the reason-label path needs it.
4. C6 is split. The chat-ui files go to S4 (W3). `session-inspector.component.{ts,html,spec}` and
   `canvas-inspector-dock.component.ts` + spec go to S8 (W5). Each file still has one owner.
5. MP C8 hands the header "Answer" binding and its fixture to the C6 owner (MP 508-511, Gate 2
   round 3). Resolution: S8 implements it. S6 delivers no edits to the `session-inspector.component` files.
6. MP C1 and C2 share the barrel `chat-ui/src/index.ts`, which has one owner (C1). Resolution: C1 and C2
   form one sequential batch, S1.
7. DP batch B1 (C1-C4) is too large for one sitting. Resolution: it is split into sequential D1a
   (C1+C2) and D1b (C3+C4). The file sets stay disjoint. The DP B1 checklist entry
   (`expected-resolvable.ts`, one entry) goes to D1b.
8. `session-budget-format.ts` exists in both `chat-ui` (`CUI/session-budget-format.ts`, has spec) and
   `chat` (`.../molecules/notifications/session-budget-format.ts`). MP C6 means the chat-ui file
   (spec named alongside). The chat copy is not touched.
9. `inspector-git-section.component.ts` has no spec on disk. MP C8 says "+ their specs".
   Resolution: S6 creates `inspector-git-section.component.spec.ts`.
10. Forbidden for every batch: `WT/libs/shared/src/lib/types/plan-limit.types.ts` and anything
    under `WT/libs/backend/auth-providers` (another session owns them). The `.gitignore` change
    is never committed.

Binding rules (they override stricter wording anywhere else):

- Row 22 ("trust the data"): show `≥` only when the app DETECTS a loss or gap. A detected loss is a
  failed read, a lane removed or evicted while the session is open, a lane that reported no usage,
  a resumed session whose lanes are not in memory, an observed CLI gap after recovery, or a missing price.
  Orchestrator = SDK snapshot minus the SDK subagent rows, shown with `~`. There is no backend
  ledger and no strict membership proof.
- Row 5: an unknown duration shows a muted `--:--`.
- A9: the implementer confirms in code whether a "CLI recovery failed" signal exists. If none
  exists, no mark is shown for it (S3 checks this. S1 consumes the result).
- Row 25: for `no-usage-source` with a `statusReason`, show `planLimitReasonLabel(statusReason,
  providerId)`. Group comes only from a typed `windowGroupOf`. Never parse labels (S5).
- Row 17: fixtures for Kimi at the limit (monthly 100% + 5-hour 0%) and grok signed out (S5).

Assumptions:

- A9 (recovery-failure signal): unverified. Checked in S3, task 3.1.
- A4 (git detached state in data): unverified. Checked in S6. If the data is absent, drop the badge and record it under Q3.
- A5 (CLI tray eligibility): only the current `trayEntryHasAction` actions are used. Checked in S7.
- Sibling `PlanLimitWindow.group?` may or may not be merged when S5 runs. `windowGroupOf` compiles both ways.

## Check rules (copy into every executor and lane brief)

- Executors and CLI lanes run ONLY focused checks:
  - `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`
  - `npx tsc --noEmit --project <tsconfig>`
  - `npx eslint <changed files>`
- They never run `npm run verify`, `nx`, build, serve, dev or e2e. They never commit or push. They do not
  edit `batches.md` or `task.md`. Work only in `WT`.
- Coordinator after each batch: `npm run verify -- --related -p <projects>`, then
  `npm run verify -- -t lint,typecheck -p <projects>`. After template changes:
  `npm run verify -- -t typecheck-templates -p ptah-extension-webview`. Write output to
  `WT/.ptah/tmp/<name>.log` and filter the file.
- Do not start a check of a project while a lane edits files of that project. `@ptah-extension/chat`
  is shared by both plans. The coordinator runs chat checks only when no lane edits chat. The same
  rule applies to `@ptah-extension/chat-ui` in W3.
- Electron first. No feature work in `apps/ptah-tui` or `apps/ptah-extension-vscode` beyond compatibility.

## Batches

### S1: Session usage totals + Orchestrator figure (chat-ui pure logic) — PENDING

- Wave: W1 | Depends on: none | Shape: logic | Parallel with: D1a, D1b
- Executor: CLI lane (frontend capability). The brief comes from MP C1+C2. Pure TS, no template.
- Files: CREATE `CUI/session-usage-totals.ts`, `CUI/session-usage-totals.spec.ts`,
  `CUI/session-usage-format.ts`, `CUI/session-usage-format.spec.ts`, `CUI/orchestrator-usage.ts`,
  `CUI/orchestrator-usage.spec.ts`. MODIFY `WT/libs/frontend/chat-ui/src/index.ts` (C1 exports, then C2 exports).
- Read: MP 73-229, MP 591-603 (implementer checks), MP 706-716.
- Contract excerpt: `UsageAmount = { value: number | null; estimated; lowerBound; comparable; causes }`.
  `UsageTotal = { state; value; sdk; cli; coverage: 'full'|'partial'|'missing'; reportedCount; missingCount; causes }`.
- Acceptance:
  - `sdkContribution` has no blanket `empty` shortcut. Each metric is classified from its own fields.
    An empty snapshot with `coverage: 'partial'` is incomplete.
  - The legacy `ok` snapshot without `pricingCoverage` uses a finite `totalCost`, 0 included. It shows `≥`
    only for partial coverage. Null gives missing. The three legacy fixtures are present.
  - A CLI input/output split is included, comparable and unmarked. `≥` appears only for a token-class omission or an
    opaque provider-only total (Gate 2 round 3 #2). The double-count regression (R2.1) is covered.
  - "Not priced" needs a rate-missing reason. A null CLI cost or `costPartial` alone gets the generic cost-gap cause.
  - Orchestrator = SDK snapshot minus the SDK subagent rows, with `~`. A negative result gives `—` + cause. A subagent
    row without cost gives cost `—` while tokens keep `~`. An absent or error snapshot gives `—`.
  - The partial-coverage copy stays generic unless the input names a narrower cause.
- Focused checks: jest `WT/libs/frontend/chat-ui/jest.config.ts` on the three new specs. tsc
  `WT/libs/frontend/chat-ui/tsconfig.lib.json`. eslint on the changed files.
- Coordinator: `-p @ptah-extension/chat-ui`.

### D1a: Digest shared contract + extractor rules (addendum B1 part 1) — PENDING

- Wave: W1 | Depends on: none | Shape: contract | Parallel with: S1
- Executor: CLI lane (backend capability). Fallback: backend-developer subagent.
- Files: MODIFY `WT/libs/shared/src/lib/types/task-spec.types.ts`, `.../types/task-spec.contract.ts`,
  `.../types/task-folder-markdown-eligibility.ts` (+ its existing spec), `.../types/rpc/rpc-tasks.types.ts`,
  `.../types/rpc.types.ts`, `WT/libs/frontend/tasks-ui/src/lib/task-stage.ts` (import the moved handoff
  pattern), `TS/lib/contract.guard.spec.ts` (only if the allowlist needs it). CREATE
  `TS/lib/task-digest/task-digest-rules.ts` + `.spec.ts` + `__fixtures__/` markdown.
- Read: DP 58-132, DP 303-334.
- Acceptance:
  - The eligibility spec accepts upper case and rejects `../x.md`, `a/b.md` and `.md`.
  - The existing `documentProgress` cases move from the reader spec to the rules spec. Only the rules spec
    is edited here. The reader spec belongs to D2, which deletes the cases there.
  - The equal-mtime fixture selects `Design-spec-v3.md`. The comparator keeps the smallest code unit. Original names are kept.
  - Review severity patterns are pinned by fixtures from three real reviews (row 21).
  - The digest has no `branch`/`pr` fields (row 21).
  - `plan-limit.types.ts` is not touched.
- Focused checks: jest `WT/libs/shared/jest.config.ts` (eligibility, contract specs) and
  `WT/libs/backend/task-specs/jest.config.ts` (rules spec). tsc on the shared, tasks-ui and task-specs lib
  tsconfigs. eslint on the changed files.
- Coordinator: `-p @ptah-extension/shared,@ptah-extension/tasks-ui,@ptah-extension/task-specs`.

### D1b: TaskDigestService + RPC + Electron registration (addendum B1 part 2) — PENDING

- Wave: W1 (after D1a) | Depends on: D1a | Shape: logic | Parallel with: S1
- Executor: backend-developer subagent (DI, RPC schema, Electron wiring in one sitting).
- Files: CREATE `TS/lib/contained-task-folder.ts` + `.spec.ts`, `TS/lib/task-digest/task-digest.service.ts`
  + `.spec.ts`. MODIFY `TS/lib/task-index.service.ts`, `TS/lib/di/tokens.ts`, `TS/lib/di/register.ts`,
  `TS/index.ts`, `WT/libs/backend/rpc-handlers/src/lib/handlers/tasks-rpc.handlers.ts`, `tasks-rpc.schema.ts`,
  `tasks-rpc.handlers.spec.ts`, `tasks-rpc.views-durability.spec.ts` (+ all constructor fixtures),
  `WT/apps/ptah-electron/src/replay/scenario-sanitizer.ts` + `.spec.ts`,
  `WT/apps/ptah-electron/src/di/expected-resolvable.ts` (one entry).
- Read: DP 133-238, DP 303-334, DP 359-369.
- Acceptance:
  - `list(parts, maxDepth)`, `inspect(name)` and `read` share validation only. `listFolderEntries` keeps
    depth 4 and `too_many`. `readFolderMarkdown` keeps `directory`, `too_large` and `rejected`. The digest uses depth 2.
  - `NESTED_LIST_CAP = 64`. Every list is charged. Budgets are checked before enqueuing. Unvisited summaries are
    `truncated`. The order is breadth-first.
  - Unreadable, unstable or transient results are not memoized. The failure-then-success fixture passes. A warm success reads 0 content bytes.
  - Electron no-follow read: the canonical path before/after checks and the opened-file identity checks are preserved.
  - Freshness is nested-only. The watcher fingerprint is not widened (rows 21, 23).
  - `manifest.ts` is unedited, and the manifest and surface specs pass.
- Focused checks: jest on the task-specs and rpc-handlers specs above, and `WT/apps/ptah-electron/jest.config.ts`
  on the sanitizer spec. tsc on each project's tsconfig. eslint on the changed files.
- Coordinator: `-p @ptah-extension/task-specs,@ptah-extension/rpc-handlers,@ptah-extension/cli-engine,ptah-electron`.

### S2: Shared UI extensions (`@ptah-extension/ui`) — PENDING

- Wave: W2 | Depends on: none (placed in W2 by plan) | Shape: logic | Parallel with: S3
- Executor: CLI lane (frontend capability).
- Files: MODIFY `WT/libs/frontend/ui/src/lib/charts/chart.types.ts`, `charts/meter.component.ts` + spec,
  `charts/ring.component.ts` + spec, `charts/stat.component.ts` + spec, `charts/charts.a11y.spec.ts`,
  `charts/meter.marker.a11y.spec.ts`, `WT/libs/frontend/ui/src/lib/time/timer.component.ts` + spec,
  `time/time-a11y.spec.ts`. S2 is the sole owner of these files.
- Read: MP 324-366.
- Acceptance:
  - The meter renders zero width with no floor. The ring has a new size in all four exhaustive size maps (`ring.component.ts:6-49`).
  - The timer shows a muted `--:--` for an unknown or invalid duration (row 5). The duration validity check is kept.
  - The stat placeholder and the spoken (accessible) value text are covered by specs.
  - The reduced-motion and keyboard cases still pass.
  - The existing public API stays backward compatible for the other consumers.
- Focused checks: jest `WT/libs/frontend/ui/jest.config.ts` on the listed specs. tsc on the ui lib tsconfig. eslint.
- Coordinator: `-p @ptah-extension/ui`, then `typecheck-templates -p ptah-extension-webview`.

### S3: Inspector agent rows projection (chat) — PENDING

- Wave: W2 | Depends on: S1 | Shape: logic | Parallel with: S2
- Executor: CLI lane (frontend capability).
- Files: CREATE `CHI/inspector-agent-rows.ts` + `.spec.ts`. MODIFY `CHI/inspector-agent-list.ts` (delete
  `agentListTotal` and `AgentListTotal`, new order), `CHI/inspector-agent-list.spec.ts`. NOT `agent-monitor.store.ts`.
- Read: MP 230-278, MP 591-603, MP 706-716.
- Acceptance:
  - Task 3.1 (A9): find out in code whether a "CLI recovery failed" signal exists. Report file:line, or report
    "none". If none exists, no mark is shown for it.
  - History open with no CLI lanes gives no mark. A restored lane with usable data gives no mark. An identified lane that is still missing
    usage gives `≥` for that metric only, and the mark clears once the lane reports usable data. A fresh tab gives no mark.
  - There is no `hasLiveSession` latch.
  - The `sub:`/`bg:` alias fixture yields one lane identity (`session-agent-roster.ts:150-184`).
  - `inspector-agent-usage.spec.ts` figures are unchanged.
- Focused checks: jest `WT/libs/frontend/chat/jest.config.ts` on the two specs. tsc on the chat lib tsconfig. eslint.
- Coordinator: `-p @ptah-extension/chat-ui,@ptah-extension/chat`.

### S4: SESSION section + Models disclosure + cache tile (C6 chat-ui part) — PENDING

- Wave: W3 | Depends on: S1, S2 | Shape: logic (templates) | Parallel with: S5, S6 (file-disjoint, all edit chat-ui)
- Executor: frontend-developer subagent (REWRITE of the main stats component, needs visual judgement).
- Files: REWRITE `CUI/inspector-stats/inspector-session-stats.component.ts` + `.spec.ts`. MODIFY
  `CUI/session-stats-view.ts` + spec (`compactSessionMetrics` takes totals), `CUI/session-budget-format.ts`
  + spec, `CUI/session-model-breakdown.component.ts` + spec (SDK label, categories),
  `CUI/inspector-stats/inspector-cache-tile.component.ts` + spec (cache-detail API for S7).
- Read: MP 367-438, `TF/design-spec-v3.md` SESSION part only.
- Acceptance:
  - Tokens and Cost come from S1 totals with `~`, `≥` or `—` per row 22. No other source is used.
  - Rail Time shows a muted `--:--` when unknown (row 5).
  - The parity cases at `inspector-session-stats.component.ts:53-111` are kept. The cache countdown, idle, estimated, expired and
    warning states (`inspector-cache-tile.component.ts:100-138`) are kept.
  - The cache tile exposes the detail API that S7 consumes.
  - `session-stats-summary.component.spec.ts` stays green.
- Focused checks: jest chat-ui on the listed specs. tsc chat-ui. eslint.
- Coordinator: after S4, S5 and S6 all return: `-p @ptah-extension/chat-ui,@ptah-extension/chat`, then
  `typecheck-templates -p ptah-extension-webview`.

### S5: PLAN LIMITS restyle + state mapping (C7) — PENDING

- Wave: W3 | Depends on: S2 | Shape: logic (templates) | Parallel with: S4, S6
- Executor: frontend-developer subagent.
- Files: MODIFY `CUI/inspector-stats/inspector-limits-lanes.component.ts` + spec,
  `CUI/plan-limits/plan-limit-tile.component.ts` + spec, `plan-window-detail.component.ts` + spec,
  `provider-lane-limit-tile.component.ts` + spec, `stats-limit-view-model.ts` + spec,
  `stats-limit-view-model.types.ts`, `plan-limit-tiles.ts` (additive only), `lane-tiles.ts` (only if needed).
- Read: MP 439-494. Decision rows 17 and 25 (`TF/decisions.md` lines 21 and 29).
- Acceptance:
  - For `no-usage-source` with a `statusReason`, the view shows `planLimitReasonLabel(statusReason, providerId)`
    (`plan-limit-tiles.ts:254-268`, `lane-tiles.ts:490`, `stats-limit-view-model.ts:131`).
  - `windowGroupOf(window: PlanLimitWindow): string | null` reads through `PlanLimitWindow & { readonly group?:
    unknown }`, trims and returns null if empty. It compiles with and without the sibling's `group?`. No label parsing.
  - The view model has a new `group: string | null`. Grouping is used only when EVERY window of a provider has a group. A mixed,
    absent or invalid group renders ungrouped. The line text is always the full `label`.
  - Fixtures: the pre-merge ungrouped case, the post-merge agy case (two groups), Kimi at the limit (monthly 100% + 5-hour
    0%) and grok signed out (`no-usage-source` + `cli-not-signed-in`).
  - `session-stats-summary.component.spec.ts` stays green. `plan-limit.types.ts` and auth-providers are untouched.
- Focused checks: jest chat-ui on the listed specs + `session-stats-summary.component.spec.ts`. tsc chat-ui. eslint.
- Coordinator: see S4.

### S6: GIT, linked sessions, actions styles (C8) — PENDING

- Wave: W3 | Depends on: S2 | Shape: mechanical (templates) | Parallel with: S4, S5
- Executor: CLI lane (frontend capability).
- Files: MODIFY `CHI/inspector-git-section.component.ts`, CREATE `CHI/inspector-git-section.component.spec.ts`;
  MODIFY `CUI/inspector-stats/inspector-linked-sessions.component.ts` + spec,
  `CHI/inspector-session-actions.component.html` + `inspector-session-actions.component.spec.ts`.
- Read: MP 495-520.
- Acceptance:
  - Behaviour and data are unchanged (parity rows `SIC.html:84-127,197-215`).
  - A4: confirm detached state in the git data. If present, add a `detached` badge next to `HEAD`. If absent, drop the badge and report it.
  - The `session-inspector.component.*` files and the TASK files are not touched. The header "Answer" binding goes to S8.
- Focused checks: jest chat + chat-ui on the listed specs. tsc. eslint.
- Coordinator: see S4.

### S7: AGENTS section + agent row (C4) — PENDING

- Wave: W3 (after S4 and S6) | Depends on: S2, S3, S4 | Shape: logic (templates)
- Executor: frontend-developer subagent.
- Files: MODIFY `CHI/inspector-agents-section.component.ts` + `.spec.ts`, `CHI/inspector-agent-row.component.ts`,
  `CHI/inspector-request-panel.component.ts` (focus/Escape only if needed),
  `CHI/inspector-agent-actions-menu.component.ts` (styling only).
- Read: MP 279-323, MP 591-603.
- Acceptance:
  - The caption comes from the roster. Share bars follow the S1 totals, including the share-bar consequence cases (Gate 2 round 3 #2).
  - The Orchestrator detail reuses the S4 cache-tile API.
  - CLI row actions are only what `trayEntryHasAction` allows plus the lane composer. No new action (A5).
  - The keyboard and reduced-motion cases still pass. The agent-lane-stats specs stay green.
- Focused checks: jest chat on the agents-section spec. tsc chat. eslint.
- Coordinator: `-p @ptah-extension/chat` (only once no lane edits chat), then typecheck-templates.

### D2: Renderer task reader (addendum B2) — PENDING

- Wave: W4 | Depends on: D1b | Shape: logic | Not blocked
- Executor: frontend-developer subagent.
- Files: MODIFY `CHI/session-task-reader.ts` + `CHI/session-task-reader.spec.ts` (sole owner).
- Read: DP 239-268, DP 303-334.
- Acceptance:
  - D2 defines the `TaskSectionData` shape. D3 consumes it.
  - `openDocument` runs a fresh `tasks:readFolderMarkdown` check for every eligible name. After the await it revalidates the echoed
    task/file, the link key, the held task and the current `openable`. The fresh-rejection case is covered.
  - The `documentProgress` cases moved to the D1a rules spec are deleted from this spec.
  - The editor path-open window stays explicit.
- Focused checks: jest chat on the reader spec. tsc chat. eslint.
- Coordinator: `-p @ptah-extension/chat` (no other lane editing chat).

### D3: TASK section component (addendum B3) — BLOCKED

- BLOCKED until the user approves the TASK-section design update `TF/design-spec-v3-task.md`.
- Wave: W4 | Depends on: D2 + user approval | Shape: logic (templates)
- Executor: frontend-developer subagent.
- Files: MODIFY `CHI/inspector-task-section.component.ts` + `CHI/inspector-task-section.component.spec.ts` (sole owner).
- Read: DP 269-292, `TF/design-spec-v3-task.md` (approved version only).
- Acceptance:
  - Folders are not shown as files. Every entry opens or explains why not. Important files are visible. The count is correct.
    Nested files show as per-directory counts only (row 23). The >200 entries case shows no error.
  - Unvisited summaries render `not counted`.
  - The styling matches the approved v3 tokens and row styles.
- Focused checks: jest chat on the section spec. tsc chat. eslint.
- Coordinator: `-p @ptah-extension/chat`, then typecheck-templates.

### S8: Inspector integration + canvas focus host (C6 integration) — PENDING

- Wave: W5 (last) | Depends on: S4, S6, S7, D2 (and D3 if D3 changes the section's inputs) | Shape: logic (templates)
- Executor: frontend-developer subagent.
- Files: MODIFY `CHI/session-inspector.component.ts`, `CHI/session-inspector.component.html`,
  `CHI/session-inspector.component.spec.ts`,
  `WT/libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts` + `.spec.ts` (invoker restore only).
- Read: MP 367-438 (integration part), MP 495-520 (header Answer handoff), MP 563-590.
- Acceptance:
  - Header "Answer": the existing request-id emit and the focus restore to close are kept
    (`session-inspector.component.html:132-142`). Selecting the asking row and focusing its request panel is
    additive and has an integration fixture.
  - Canvas dock: open from Cost, dismiss, and focus returns to Cost through the rail's `data-rail-control` markup.
  - All parity-inventory specs and `session-stats-summary.component.spec.ts` stay green.
- Focused checks: jest chat + canvas on the listed specs. tsc. eslint.
- Coordinator: `-p @ptah-extension/chat,@ptah-extension/canvas`, then typecheck-templates.

## Wave table

| Wave | Batches | Parallel | Coordinator checks after |
| --- | --- | --- | --- |
| W1 | S1, D1a, then D1b | S1 runs in parallel with D1a and D1b; D1b starts after D1a | chat-ui; shared, tasks-ui, task-specs; then task-specs, rpc-handlers, cli-engine, ptah-electron |
| W2 | S2, S3 | S2 runs in parallel with S3 (ui vs chat) | ui; chat-ui and chat |
| W3 | S4, S5, S6, then S7 | S4, S5 and S6 run in parallel (file-disjoint; chat-ui is checked once all three return); S7 starts after S4 and S6 | chat-ui and chat after S4-S6; chat after S7 |
| W4 | D2, then D3 (BLOCKED) | sequential; both edit chat | chat |
| W5 | S8 | runs alone, last | chat and canvas, then templates |

## Final gate

The coordinator runs this once, before the first push. Confirm each name against `project.json`
(all eleven names verified on 2026-11-23):

`npm run verify -- -p @ptah-extension/ui,@ptah-extension/chat-ui,@ptah-extension/chat,@ptah-extension/canvas,ptah-extension-webview,@ptah-extension/shared,@ptah-extension/task-specs,@ptah-extension/rpc-handlers,ptah-electron,@ptah-extension/tasks-ui,@ptah-extension/cli-engine`

Then run `npm run verify -- -t typecheck-templates -p ptah-extension-webview`.

## Review plan

- One independent code-logic review of the combined diff. It runs after S8 (and D3 if approved).
  The reviewer comes from a different model family than the implementers. Record both families. It must
  re-check in code the Gate 2 last-round rules (row 24): MP Gate 2 round 3 (706-716) and DP round 2 (359-369).
  It also checks row 22 `≥` detection, the row 5 `--:--` and the row 25 reason label and `windowGroupOf`.
- Senior-tester: the fixture specs (Kimi, grok, agy groups, legacy SDK cost, alias, resumed lanes, digest caps).
- Electron visual review: dark and light themes, widths 300/336/400/448, rail 56, sheet 360, compared against
  `TF/prototype/v3/screenshots/*` (TASK section against the approved `design-spec-v3-task.md`).
- Style review: only where a new public API is added (chat-ui barrel exports, ui ring size, digest RPC).

## Risks and unknowns

| Risk | Severity | Mitigation |
| --- | --- | --- |
| D3 blocked on design approval and delays S8 | MEDIUM | S8 depends on D3 only if section inputs change. Otherwise S8 lands and D3 follows with its own check. |
| chat and chat-ui are edited by several batches | MEDIUM | File-disjoint owners. Coordinator checks only when no lane edits the project. |
| Sibling `group?` merge timing | LOW | `windowGroupOf` widened type. Fixtures for before and after the merge (S5). |
| A9 signal may not exist | LOW | S3 task 3.1 reports it. If none exists, no mark. |
| A4 detached data may be absent | LOW | S6 drops the badge and records it under Q3. |
| `plan-limit-tiles.ts` shared with the summary | MEDIUM | Additive only. The summary spec must stay green (S5). |
| Digest B1 split may leave D1a without the DI wiring | LOW | D1b follows D1a directly. Coordinator checks after each part. |

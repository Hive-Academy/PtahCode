# CI triage — PR #1488, head 755736ccb

Read-only triage. Logs fetched with `gh api repos/Hive-Academy/PtahCode/actions/jobs/<id>/logs`
(`gh run view --log-failed` returned nothing while the run was still in progress).
Product code was read at `HEAD` (`git show HEAD:…`), not from the dirty working tree.

Classes: **a** = PR changed markup/text on purpose, test expectation is stale;
**b** = caused by this PR, product code must change; **c** = unrelated to this PR.

## Summary

| Job | Failures | Class |
| --- | --- | --- |
| `checks` 137774752900 | 1 lint task (`ui-class-audit:lint`, rule `daisyui-class`) | b |
| `test (shard 1/4)` 137774753475 | 1 test (task-specs contract guard) | b |
| `test (shard 4/4)` 137774753404 | 1 test (ui design-token guard) | b |
| `webview-e2e` 137774753239 | 6 tests, one assertion (12 runs with retries) | a (confirm) |
| `electron-e2e (shard 1/4)` 137774753488 | 1 test, 2 stale assertions | a (confirm cost rounding) |
| `main` 137785606156 | aggregate gate, failed in 3 s | follows the jobs above |

Totals: a = 2 jobs (7 tests), b = 3 jobs (3 findings), c = 0.

Pending when checked: `electron-e2e (shard 2/4)`, `git-real-git (macos-latest)`.
`test (shard 2/4)` finished with success. No new failure besides the aggregate `main` job.

Evidence against class c: the PR touches no file under `apps/ptah-electron-e2e`,
`libs/frontend/webview-e2e-harness`, `tools/ui-class-audit`, `libs/frontend/ui/src/lib/tokens`
or `contract.guard.spec.ts` (`git diff --stat $(git merge-base main HEAD) HEAD` is empty for
them), and each offending line was added by the PR. The only failed run on `main` near the
merge base (Electron E2E 45161025603 on 467a1ddb6) failed in `electron-e2e-perf` only, a job
that is skipped on this PR.

## `checks` 137774752900 — step: lint, `ui-class-audit:lint`

| File:line | Rule | Finding | Class | Minimal change |
| --- | --- | --- | --- | --- |
| `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.html:57` | `ui-class-audit [daisyui-class]` | `skeleton — move this markup into an extracted component in @ptah-extension/ui (raw skeleton class)`; "1 token count(s) over baseline" | b | Replace `<div class="skeleton h-7"></div>` with `ptah-skeleton` (`libs/frontend/ui/src/lib/foundation/skeleton.component.ts`) |
| same file `:58` | same | same | b | same; import the component in `session-inspector.component.ts` |

The `raw-spacing` part of the same log only reports decreases ("0 token count(s) over
baseline") and is not a failure. Do not raise the baseline for `skeleton`.

## `test (shard 1/4)` 137774753475 — step: test, project `task-specs`

| Spec file:line | Test | Expected vs received | Class | Minimal change |
| --- | --- | --- | --- | --- |
| `libs/backend/task-specs/src/lib/contract.guard.spec.ts:210` | `contract guard — per-task filename literals › appear only in the contract module and its explicit allowlist` | expected `[]`; received `["libs/shared/src/lib/types/task-spec.types.ts → batches.md, tasks.md"]` | b | `libs/shared/src/lib/types/task-spec.types.ts:263` (`progress?: { …; source: 'batches.md' \| 'tasks.md' }`) and the doc comment at `:198`: remove the filename literals. Type the field from the contract module (`typeof BATCHES_FILE` in `task-spec.contract.ts:67`; add a `TASKS_FILE` constant there if none exists) or use neutral values such as `'batches' \| 'tasks'`. |

Suite result: 1 failed, 716 passed. An allowlist entry in the guard spec (`LITERAL_ALLOWLIST`,
line 164) would also pass, but the guard exists to stop exactly this, so prefer the type fix.
Producers of `progress.source` (task digest in `libs/backend/task-specs/src/lib/task-digest`,
frontend readers) change with it if the value changes.

## `test (shard 4/4)` 137774753404 — step: test, project `ui`

| Spec file:line | Test | Expected vs received | Class | Minimal change |
| --- | --- | --- | --- | --- |
| `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts:229` | `ptah design tokens › keeps token-only folders free of raw palette and pixel values` | expected `{ file: …/charts/meter.component.ts, raw: undefined }`; received `raw: "2px"` | b | `libs/frontend/ui/src/lib/charts/meter.component.ts:6` (`TRACK_OVERRIDE = { '2px': 'h-[2px]', '3px': 'h-[3px]' }`) and `:104` (`input<'2px' \| '3px' \| undefined>`). `charts` is in `TOKEN_ONLY_DIRS`; the regex is `\b\d+(\.\d+)?px\b`. Rename the keys to non-pixel names (for example `'hairline' \| 'thin'`) and map them to scale classes (`h-0.5` = 2px; a token for 3px) with no `px` text in the file. |

Suite result: 1 failed, 1760 passed. Callers that pass the input must follow the rename:
`chat-ui/.../inspector-stats/inspector-session-stats.component.ts:93,195`,
`chat-ui/.../inspector-stats/inspector-cache-tile.component.ts:72`,
`chat-ui/.../plan-limits/provider-lane-limit-tile.component.ts:69`,
`chat/.../session-inspector/inspector-agent-row.component.ts:120`, plus their specs.

## `webview-e2e` 137774753239 — step: Run webview E2E specs

6 failed, 372 passed, 22 skipped. All 6 are the same assertion (2 themes x 3 widths).

| Spec file:line | Test | Expected vs received | Class | Minimal change |
| --- | --- | --- | --- | --- |
| `libs/frontend/webview-e2e-harness/src/lib/scenarios/plan-limits/plan-limits-visual.e2e.spec.ts:150` (test at `:105`) | `plan limits > session inspector › session inspector {anubis,anubis-light} {280,360,440}` | `providerRow('opencode')` expected substring `"Limits not tracked"`; received `"OpenCode— No usage source "` | a | Update line 150 to `'No usage source'`. Line 151 (`copilot`, same expectation) was not reached; it most likely needs the same edit. |

Evidence for a: the PR added, in
`libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/stats-limit-view-model.ts:136-138`,
`noSource = ownerSnapshot?.status === 'no-usage-source' ? planLimitReasonLabel(…) ?? 'No usage source' : undefined`
and removed the old `'Limits not tracked' : 'Usage unknown'` branch. The unit spec at head
(`stats-limit-view-model.spec.ts:541`) asserts `value: 'No usage source'`. The tile template
still falls back to `'Limits not tracked'` only when no message is set
(`provider-lane-limit-tile.component.ts:53`).

Not determined: whether the approved design wants "No usage source" for a provider lane whose
owner reports no usage. `provider-lane-limit-tile.component.spec.ts:55` asserts
`not.toContain('No usage source')` for the `untracked` owner state, so the two texts are both
live. Confirm against the design reference before editing the e2e spec; if the design says
"Limits not tracked" here, this is class b and the view-model line changes instead.

## `electron-e2e (shard 1/4)` 137774753488 — step: Playwright run

1 failed, 51 passed, 9 skipped.

| Spec file:line | Test | Expected vs received | Class | Minimal change |
| --- | --- | --- | --- | --- |
| `apps/ptah-electron-e2e/src/specs/chat/compaction-duplicate-session.spec.ts:290` (test at `:52`) | `Compaction recovery for duplicate visible session tiles (TASK_2026_391) › restores both tiles in place when /compact originates from the non-first same-session tile` | `[data-testid="inspector-session-stats"]` expected substring `"$35.67"`; received `"…Cost$35.66Whole-session cost: $35.668…"` | a (confirm) | Change the expectation to `'$35.66'`. |
| same spec `:291` (not reached, will fail next) | same test | expects `'1 compaction'` inside `inspector-session-stats`; the received text has no compaction text at all | a | Assert the count where the redesign puts it: `inspector-agents-section.component.ts:214-215` renders `<dt>Compactions</dt><dd>{{ compactionCount() }}</dd>` in the orchestrator row details. Point the locator at the agents section (expanding the orchestrator row if the details are collapsed) and expect `Compactions` / `1`. |

Evidence for a: the PR added `floorDecimal` in
`libs/frontend/chat-ui/src/lib/molecules/session/session-usage-format.ts` (cost at head line 53:
`` `${MARKERS[…]}$${floorDecimal(value, decimals)}` ``), with unit tests named `floors %s (%s) to %s`
in `session-usage-format.spec.ts:19`. The value is 35.668, so the displayed figure moved from
the rounded `$35.67` to the floored `$35.66`; the accessible text still gives `$35.668`. On
`main`, `inspector-session-stats.component.ts:84-87` rendered `{{ compactionCount }} compaction(s)`;
at head that block is gone and the count lives in the agents section.

Not determined: whether flooring cost (showing less than was spent) is an approved product
decision. It is deliberate in code and unit-tested, so it is classed a; if the design did not
ask for it, it is class b and `session-usage-format.ts` changes instead of the e2e spec. Whether
the orchestrator row details are open by default in this test was not checked (no test run).

## Files that need an edit

Product code (class b):
- `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.html` (lines 57-58) and `session-inspector.component.ts` (import)
- `libs/shared/src/lib/types/task-spec.types.ts` (lines 198, 263), possibly `libs/shared/src/lib/types/task-spec.contract.ts` and the `progress.source` producers/readers
- `libs/frontend/ui/src/lib/charts/meter.component.ts` (lines 6, 104) and the five `track=` callers listed above

Tests (class a):
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/plan-limits/plan-limits-visual.e2e.spec.ts` (lines 150-151)
- `apps/ptah-electron-e2e/src/specs/chat/compaction-duplicate-session.spec.ts` (lines 290-291)

Note: the working tree has uncommitted edits to `session-usage-format.ts` and other files; this
triage describes commit 755736ccb. The three class b offending lines are still present in the
working tree.

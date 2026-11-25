# Code logic review — TASK_2026_2325_899d (D46)

## Verdict: REVISE  Score: 6/10

The diff accounts for all 28 logged failures and preserves the visual assertions. Two contract gaps remain under the requested scope. The new write resolver can accept an incomplete or malformed pair, and the standalone Electron test driver still gives Settings the wrong reply shape.

## Check 1 — Setup RPC replies

- **Valid reads and writes match the contract.** `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts:4–30,119–135` defines a read with `state` and a write receipt with `committed`, `state`, and `commitSeq`. `settings.fixtures.ts:580–596,623–636,845–859` starts with an unset pair, returns the effective fixture workspace pair on read, trims both strings on write, and clears when both trimmed strings are empty. A valid write returns a copy of the pair committed by that call, or `null` for clear, and advances the per-boot sequence once. The synchronous resolver captures the receipt before another resolver call can change state. The read carries no sequence. The frontend reconstructs the read baseline using its last applied sequence (`libs/frontend/core/src/lib/services/providers-settings-state.service.ts:264–284`), ignores older receipts, and uses `committed` as the basis for Undo (`libs/frontend/core/src/lib/services/providers-commit.service.ts:141–159,182–220`).
- **Invalid writes diverge.** A half-empty pair is treated as committed and malformed values can become a clear. Both change state and advance the sequence. The production handler validates before persistence and advances the sequence after a successful commit (`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:122–125,413–449`). See finding 2.

## Check 2 — Fixture coverage

- **All four host/theme combinations and all Settings scenario variants in the webview harness inherit both replies.** `settings.fixtures.ts:971–975,1015–1023` routes both entry points to `statefulSettingsFixtures` and merges overrides over it. The live-shape map (`settings-live-shape.fixtures.ts:30–71`, installed at `settings-visual.e2e.spec.ts:1269–1275`) and Cursor key map (`settings-cursor-key.fixtures.ts:15–36`, installed at `settings-orchestration.e2e.spec.ts:103,531,613`) leave both methods intact. `settings-advanced-search-voice.fixtures.ts:269–290` preserves the base methods and its dedicated variant boot merges over the base again (`settings-advanced-search-voice.reach.ts:186–194`). The drawer variant spreads the base before overrides (`settings-drawer.reach.ts:49–61`). Onboarding's B1b Settings drawer uses the readiness map, which also spreads the base (`../onboarding/onboarding-ready.fixtures.ts:213–247,264–267`, `../onboarding/onboarding-ready-visual.e2e.spec.ts:465–485`). Paths in this paragraph are relative to `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/`.
- **The standalone Electron app fixture does not inherit the webview replies.** The default `ui` fixture replaces the main IPC listener and supplies its own map (`apps/ptah-electron-e2e/src/support/fixtures.ts:107–128`). Settings and Thoth specs enter Settings through that driver (`apps/ptah-electron-e2e/src/specs/settings/settings.spec.ts:1,22–34`, `apps/ptah-electron-e2e/src/specs/thoth/skills.spec.ts:1,114–121`). The Settings lanes, advanced, search/voice, and field-info previews also use it. They inherit its generic response for both methods. The Providers gate preview uses the real IPC handlers (`apps/ptah-electron-e2e/src/design-preview/settings-providers-gate.shot.ts:12,209`, `apps/ptah-electron-e2e/src/support/real-rpc-fixtures.ts:15–26`, `apps/ptah-electron/src/di/phase-4-handlers.ts:189`). See finding 1.
- The VS Code shell navigation smoke installs a host and message bridge without an RPC responder, then checks Settings mount and switches to Thoth (`libs/frontend/webview-e2e-harness/src/lib/scenarios/vscode-shell/switch-view-navigation.e2e.spec.ts:23–46`). It has no Settings RPC map and its navigation assertions can pass without a ready Setup section.

## Check 3 — All 28 CI failures

`ProvidersCommitService.run()` awaits a full refresh after writes and rejections before it publishes the terminal save state (`libs/frontend/core/src/lib/services/providers-commit.service.ts:532–564`). That refresh now includes the Setup read, and readiness explicitly requires the section (`libs/frontend/core/src/lib/services/providers-settings-state.service.ts:246–280,1104–1122`). The pre-fix responder ignored unlisted methods (`libs/frontend/webview-e2e-harness/src/lib/scenarios/marketplace/marketplace.fixtures.ts:238–242`). The renderer's default RPC timeout is 30 seconds (`libs/frontend/core/src/lib/services/claude-rpc.service.ts:24,155`), so the modal, focus and toast assertions could time out while the commit remained in progress. The four baseline failures show the stale count directly.

All log lines below are from `.ptah/tmp/ci/webview-e2e-failed.log`. Grouped rows list the first error line for each host or theme.

| Failures | Log lines | Observed failure explained by the patch |
| --- | --- | --- |
| 1, 9 | 526, 1128 | Add-instance modal retains `open` after Create. |
| 2, 10 | 606, 1208 | Edit modal retains `open` after rename. |
| 3, 11 | 684, 1286 | Codex model picker stays open after the model write. |
| 4, 12 | 762, 1364 | Undo click times out waiting for the CLI toggle confirmation. |
| 5, 13 | 822, 1424 | Reorder focus cannot return to the disabled button (832, 1434). |
| 6, 14 | 900, 1502 | Copilot-backed instance modal stays open after Create. |
| 7, 15 | 980, 1582 | Cursor key success toast never appears. |
| 8, 16 | 1054, 1656 | Cursor key rejection toast never appears. Rejected writes also await refresh. |
| 17, 21 | 1730, 2052 | Stored key deletion confirmation never appears. |
| 18, 22 | 1810, 2132 | Copilot sign-out confirmation never appears. |
| 19, 23 | 1894, 2216 | Main-agent popover stays open after the model save. |
| 20, 24 | 1974, 2296 | Keyboard model-search test reaches Save at `settings-providers.e2e.spec.ts:333–340`, then waits for the popover to close. |
| 25–28 | 2374, 2454, 2534, 2614 | Consumer row assertion expects 3 and receives 4 in both hosts and themes. |

**Unexplained logged failures:** None. The credential changes go through the same commit pipeline (`libs/frontend/core/src/lib/services/providers-connection-setup.service.ts:904–945`). The fourth row is expected because the consumer builder prepends Setup (`libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts:271–332`) and the template adds Decision model (`libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:624`).

**Other stale count or order expectations:** None found. The Orchestration and reachability specs use the table or a named role (`libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-orchestration.e2e.spec.ts:365–373`, `settings-reachability.table.ts:1103–1112` in the same directory). Electron's Thoth spec targets Enhancement by ID. The Angular assignments spec already requires Setup first (`libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.spec.ts:376–380`) and the routing spec expects all four named rows (`libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.spec.ts:202–209`).

## Check 4 — Assertion strength

The two assertion edits both change exact cardinality from 3 to 4 (`libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-visual.e2e.spec.ts:718–735`). The test still requires each label to fit in 24 px (`:736–737`) and keeps the existing popover, viewport and focus checks (`:741–767`). No assertion was weakened.

## New findings

1. **Moderate — Electron's fake IPC listener answers the Setup calls with unrelated default data.** `apps/ptah-electron-e2e/src/support/ui-driver.ts:108–109,137–177` replaces the real listener and returns the generic success payload when a method is absent from the map. Opening Settings through the default `ui` fixture gives `refreshSetupModel()` no `state`. Accessing `state.kind` fails, and `readSection` marks Setup as an error (`libs/frontend/core/src/lib/services/providers-settings-state.service.ts:268–280`, `libs/frontend/core/src/lib/services/providers-settings-sections.ts:95–107`). The current Electron mount assertions can pass in this state. A subsequent Setup write would likewise receive no receipt fields. **Fix:** Seed typed, stateful Setup get/set answers in Electron's default UI fixture so its Settings specs and preview overrides inherit them. Keep the real-RPC fixture on the existing handlers. This gap is outside the 28 webview CI failures but inside the requested fixture audit.
2. **Moderate — Malformed or partial Setup writes can produce a successful receipt.** `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts:848–859` converts missing and nonstring values to empty strings and stores a pair if either field is nonempty. For example, `{ provider: 'claude-cli', model: ' ' }` stores an incomplete pair and increments the sequence. Passing an empty object can erase an existing pair. Production rejects those inputs before committing (`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:122–125,413–425`, `libs/backend/settings-core/src/scope/workspace-scope-resolver.ts:421–439`). **Fix:** Require both fields to be strings and reject a partial trimmed pair using a failed RPC envelope, preserving both stored state and sequence. The webview responder already supports failed fixtures through `rpcError` (`libs/frontend/webview-e2e-harness/src/lib/scenarios/marketplace/marketplace.fixtures.ts:107–113,217–231`). The 28 logged tests depend on the read resolver or the row count, so this finding does not change their mapping.

## Five logic questions

1. **Silent failure.** The Electron driver's success envelope can hide the missing Setup reply from a navigation or visibility assertion. See finding 1.
2. **Unexpected user action.** A provider-only draft reaching the fixture write can produce a saved message for an incomplete pair. The current editor gates ordinary Save on two populated fields (`libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:820–822,889–898`), so the gap primarily hides regressions in the caller. See finding 2.
3. **Input yielding a wrong answer.** Missing or nonstring fields can be coerced into a clear and acknowledge a write the host would reject. See finding 2.
4. **Dependency timeout or wrong shape.** An unanswered call delays refresh until the RPC deadline. A reply without `state` fails immediately inside the section read. In both cases the Setup section cannot satisfy the readiness predicate.
5. **Missing case.** The baseline exercises a successful Setup read. None of the 28 logged failure paths exercises Setup Save, Clear or Undo, so the run cannot establish receipt fidelity.

## Decisions

- Counted the Electron renderer's fake IPC map under check 2 because the assignment expressly includes Electron shell and app fixtures. Restricting the verdict to the Chromium job would omit the gap at the standalone Electron Settings entry point. The fixture correction is reversible and local to the test harness.

## Verification

Reviewed the uncommitted diff, fixture consumers, backend and frontend contracts, and filtered CI error lines. `git diff --check` and the scoped harness library `tsc --noEmit` passed. ESLint reported zero errors and one `max-lines` warning in `settings.fixtures.ts:899`. The implementer's report records unavailable Ptah diagnostics and unrelated spec-tsconfig errors (`batch-fix-ci-e2e-report.md:90–93`). E2E, browser, build and workspace verification were excluded from this review. Ptah file search returned zero hits for the task Markdown glob, so task-folder discovery fell back to `rg --files`. Skill loading was unavailable through the lane's tools.

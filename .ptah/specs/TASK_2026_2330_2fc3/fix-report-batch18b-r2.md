# Fix Report — Batch 18B Round 2 (`TASK_2026_2330_2fc3`)

Addressed all three Major findings from `.ptah/specs/TASK_2026_2330_2fc3/code-logic-review-batch18b.md` (`## Re-review round 1` → `### Findings` 1, 2, 3), strictly within `libs/frontend/onboarding/src/lib/proposal/**`. All earlier behaviors are preserved: Batch 12 F14–F17, Batch 17b reply `workspacePath` attribution and `cancelled: true` non-launch, Phase C F5/F6/F9, cancel on invalidate, malformed reply guard, and sidecar cap protection.

---

## Per-Finding Changes and Regression Specs

### 1. Major — `saveDraft()` inferred `guidanceLoaded: true` from facts/analysis, turning failed guidance into a loaded checkpoint

- **Root cause:** `saveDraft()` inferred `guidanceLoaded: true` whenever `update.guidanceFacts !== undefined || update.guidanceAnalysis !== undefined`. When guidance failed on review but recommendations succeeded, `installAndLaunch()` saved the empty `guidanceFacts` and `guidanceAnalysis` without an explicit `guidanceLoaded`, overriding the page's explicit `false`. After install completion and a workspace switch before first send, same-renderer recovery hydrated `guidanceLoaded: true` and dispatched chat without retrying guidance.
- **Changes:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:56,68`: added explicit optional `guidanceLoaded?: boolean` to `TeamBuilderInstallRequest` and `TeamBuilderLaunchRequest`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:424-427`: removed inference in `saveDraft()`; `guidanceLoaded` is now strictly explicit (`update.guidanceLoaded !== undefined ? update.guidanceLoaded : (prev?.guidanceLoaded ?? false)`), never inferred from `guidanceFacts` or `guidanceAnalysis`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:467-469,509-511`: forwarded explicit `request.guidanceLoaded` into `saveDraft()` from both `installAndLaunch()` and `launch()`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:448-458,524-528,558,567-571,699,772`: cleared stale `guidanceLoaded: true` on the coordinator draft when starting a fresh `loadReview()`, persisted `guidanceLoaded: false` on recommendation failure and rejected calls (in addition to unsuccessful guidance responses), kept `guidanceLoaded: true` only when `wizard:get-project-guidance` succeeds with a valid `facts` array (including empty `[]`), and passed explicit `guidanceLoaded: this.hasLoadedGuidanceFor(record.id)` into `coordinator.installAndLaunch()` and `coordinator.launch()`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:1842,1856,1975`: updated three existing Batch 12 `coordinator.saveDraft(...)` fixture calls that intentionally seed already-loaded in-memory drafts to pass `guidanceLoaded: true` explicitly.
- **Regression specs (verified failing before fix in `.ptah/tmp/b18b-r2-red.log`, passing after):**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:2071-2100` — `never infers guidanceLoaded from guidanceFacts or guidanceAnalysis in saveDraft (18B r2 F1)`. Asserts `saveDraft()` with `guidanceAnalysis`/`guidanceFacts` leaves `guidanceLoaded: false`, explicit `true`/`false` is honored, and subsequent `installCompleted: true` updates do not flip `false` back to `true`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:2514-2686` — `keeps failed guidance unloaded through install, workspace interruption, and same-renderer recovery (18B r2 F1)`. Covers recommendations succeeding while guidance fails, selecting/installing a skill, interrupting via workspace switch before first send, confirming `draft.guidanceLoaded === false`, returning in the same renderer, clicking **Continue** while guidance still fails (asserts `wizard:get-project-guidance` is retried, error shown, zero chat dispatch), and then succeeding with an empty `facts: []` response and launching chat.

---

### 2. Major — Installed (post-install) recovery offered no way to make a newly required owner decision

- **Root cause:** When an interrupted (or failed) post-install record had `ownerDecision: null` and reloaded guidance introduced a non-`follow` fact (e.g. `tolerate`), `launchChat()` blocked dispatch via `blockForOwnerDecision()`, but the `@else if (skillsInstalled())` recovery branch only rendered **Back** and **Continue to team builder** while the owner-decision radio group lived exclusively in `<ptah-stack-skill-review>`.
- **Changes:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:21-24,38,70,308-314`: imported `ProjectGuidance` and `PtahCheckboxDirective` (added to component `imports`) and added `public guidanceLabel(value: ProjectGuidance['label']): string` matching `StackSkillReviewComponent.label`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html:201-257`: inside `@else if (skillsInstalled())`, when `ownerDecisionRequired()` is true, reused the guidance facts list and owner-decision radio fieldset (`name="owner-decision"`, values `'match'` and `'raise'`, bound to `state.ownerDecision()`, `state.ownerDecisionPrompt()`, `onOwnerDecisionChange(...)`, `ownerDecisionError()`, `state.loading()`, `starting()`, and `guidanceLabel(...)`). Selecting a decision clears `ownerDecisionError`, persists `ownerDecision`, and allows **Continue to team builder** to launch chat without reinstalling.
- **Regression spec (verified failing before fix in `.ptah/tmp/b18b-r2-red.log`, passing after):**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:2688-2816` — `surfaces owner-decision controls in installed recovery when reloaded guidance requires a decision and allows Continue without reinstalling (18B r2 F2)`. Recovers an interrupted post-install record with `ownerDecision: null`, reloads guidance returning a `tolerate` fact, verifies dispatch blocks and the installed recovery panel renders both the fact and the `match`/`raise` radio controls, selects `raise`, clicks **Continue to team builder**, and asserts zero reinstall RPC calls, one chat send containing the fact and `Owner decision: Raise the standard`, and completion with `installed: ['owner/repo/one']`.

---

### 3. Major — Newer handoff overwrote confirmed skill names restored by a late stopped install reply

- **Root cause:** `executeLaunch()` froze `const installed = [...request.installed]` and passed it into `handoffDirect()`. When a late stopped install reply from attempt A arrived while attempt B's handoff was awaiting prompt/send, `recordStoppedInstall()` merged A's confirmed skill into `record.teamBuilder.installed` and `activeExecution.installed`, but B's handoff settlement (on direct send success, fallback launcher success, or launch failure) wrote back its stale `installed` copy, overwriting A's confirmed skill.
- **Changes:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:476-481,519-529`: reconciled existing record `installed` names (for the same normalized workspace) when starting `installAndLaunch()` and `launch()`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:941-963`: added `mergeInstalledNames(recordId, execution, extra)` and `currentInstalledNames(recordId, execution)` to merge `record.teamBuilder.installed` (same normalized workspace), `execution.installed`, and any newly confirmed names without overwriting.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:965-1006`: updated `recordStoppedInstall()` to merge `record.teamBuilder.installed`, `matchingExecution.installed`, and `confirmed` into both `matchingExecution.installed` and the reported record.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:715,839,861,930,1020-1035,1084,1097-1111,1128-1140,1170-1180,1184-1188,1320-1335`: removed the stale `installed` parameter from `handoffDirect()` and read `currentInstalledNames(request.recordId, execution)` at every settlement, interruption, fallback launch, and failure report/return site so late-reconciled skills from attempt A are always combined with attempt B's skills.
- **Regression specs (verified failing before fix in `.ptah/tmp/b18b-r2-red.log`, passing after):**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:1777-1928` — `preserves confirmed skills from a late stopped install reply that arrives while a retried handoff is in flight (18B r2 F3)`. Interrupts attempt A, retries the same record with attempt B (`owner/repo/from-b`), pauses B inside `sendOrQueueMessage`, settles A with `owner/repo/from-a`, then resolves B's send and asserts both the returned `handed-off` outcome and the final `completed` record contain both `owner/repo/from-a` and `owner/repo/from-b`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:1930-2069` — `preserves late-reconciled skills when a retried handoff fails after send dispatch (18B r2 F3)`. Verifies the same late-reply arrival during B's in-flight send when send fails, asserting both the `failed` outcome and the `failed` record retain both `owner/repo/from-a` and `owner/repo/from-b`.

---

## Checks Run

| Check | Exact Command | Result | Log |
| --- | --- | --- | --- |
| Pre-fix red run (new r2 specs) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts` | **FAIL (EXIT 1)** — 5/5 new r2 regression tests failed on pre-fix code (69/69 existing passed) | `.ptah/tmp/b18b-r2-red.log` |
| Focused Jest (`proposal/` specs) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill.store.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-guidance-brief.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts` | **PASS (EXIT 0)** — 6/6 suites, **107/107 tests passed** | `.ptah/tmp/b18b-r2-jest.log` |
| TypeScript (`onboarding` lib) | `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` | **PASS (EXIT 0)** — 0 errors | `.ptah/tmp/b18b-r2-tsc.log` |
| ESLint (changed files) | `npx eslint libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts` | **PASS (EXIT 0)** — 0 errors, 2 pre-existing `max-lines` warnings | `.ptah/tmp/b18b-r2-eslint.log` |
| Ptah Diagnostics (scoped) | `ptah_get_diagnostics` on the 4 changed TS/spec files | **PASS** — 0 diagnostics in all 4 requested files | — |

---

## Notes

- File ownership strictly respected: only the five files under `libs/frontend/onboarding/src/lib/proposal/` (`team-builder-run.coordinator.ts`, `team-builder-run.coordinator.spec.ts`, `team-builder-start.page.ts`, `team-builder-start.page.html`, `team-builder-start.page.spec.ts`) were modified.
- Tool/skill notes: `ptah_lsp_references` failed to resolve worktree-relative paths against the main repo path, so `grep` was used as fallback for reference lookup. The host skill catalogue did not list `ui-ux-designer` or `angular-frontend-patterns`.

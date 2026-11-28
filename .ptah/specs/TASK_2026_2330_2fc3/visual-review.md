# Live End-to-End Visual Review — TASK_2026_2330_2fc3

**Verdict:** **FAIL**

The core `SetupRunStore` persistence, background execution, chat-session isolation, `skill-review.json` caching, Team Builder consent/install/handoff flow, and mid-run restart reconciliation all worked cleanly in live Electron runs with Claude Haiku. However, the review **fails** because **`SETUP_RUN_ENTRY` is never provided in `apps/ptah-extension-webview/src/app/app.config.ts`**, causing four production integration breaks that unit tests did not catch (every unit test stubbed the token and every consumer injected it `{ optional: true }`):
1. The Setup nav tab never shows the pulsing running dot (`setup-tab-running`) while a Setup run is active.
2. The Setup nav tab never shows the attention count badge (`setup-tab-attention`) when a run needs input or finishes unseen.
3. Clicking the Setup nav tab while a run is active always lands on bare Setup Home (`/onboarding`) instead of re-entering the active run's step.
4. Chat-side `Generate agents ->` (`SetupStatusStore.launchGeneration('setup-agent-generation')`) falls back to bare Setup Home, and `SetupGenerationOpenHandler` silently no-ops — leaving no reachable UI path to start a live `agent-generation` run.

---

## 1. Environment

| Item | Value |
| --- | --- |
| Task | `TASK_2026_2330_2fc3` — Run setup workflows in the background from a Setup-owned store |
| Worktree | `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs` |
| Branch / Commit | `feat/setup-background-runs` @ `9fd2c322ad06e2bd1b3a76a909fd19275f8640a6` (`Merge origin/main into feat/setup-background-runs`) |
| OS / Display | Linux (`DISPLAY=:0`), Node.js `v24.15.0`, Electron `44.4.3`, Playwright `_electron` |
| Build commands (under `scripts/verify.mjs` lock) | 1) `npx nx build-dev ptah-electron` (`.ptah/tmp/live-build-dev.log`) <br>2) `node apps/ptah-electron/scripts/rebuild-native.js && node scripts/copy-wasm.js dist/apps/ptah-electron && npx nx copy-renderer-dev ptah-electron` (`.ptah/tmp/live-renderer.log`) |
| Profile isolation | Temp copy in `/tmp/ptah-live-profile-DULUJy` (removed on cleanup): `--user-data-dir=<tmp>/userData`, `PTAH_DB_PATH=<tmp>/state/ptah.sqlite` (copied from cleanly closed `ptah-dev.sqlite` + `provider-accounts`), `PTAH_SESSIONS_DB_PATH=<tmp>/state/sessions.sqlite` (fresh), `PTAH_SETTINGS_DIR=<tmp>/ptah-settings`, `NODE_ENV=test`, `PTAH_E2E=1`. Real profiles (`~/.config/Ptah`, `~/.config/Ptah Dev`, `~/.ptah`, `~/.ptah-dev`) verified untouched by SHA-256 hash check. |
| Sample workspace | Fresh temp TypeScript + Express REST API project (`/tmp/ptah-live-sample-ws`, 10 files including `package.json`, `tsconfig.json`, `src/`, `tests/`, removed on cleanup). |
| Model selected | **Claude Haiku 4.5** (`provider: 'claude-cli'`, `model: 'claude-haiku-4-5-20251001'`) selected via Settings -> Providers -> Background models -> Setup (`02a-settings-haiku-picker.png`, `02b-after-save.png`, `02-haiku-selected.png`), and set as workspace/chat model in isolated `settings.json` so all Setup and Team Builder handoff calls used Haiku only. |
| Skill discovery note | No `ui-ux-designer` or `angular-frontend-patterns` skills were listed in this lane's available skills; live verification followed `TASK_2026_2330_2fc3/task.md`, `implementation-plan.md`, and Playwright `_electron` screenshot inspection of all 40 captured frames (0 blank frames). |

---

## 2. Exact Steps Executed

1. **Build**: Ran `npx nx build-dev ptah-electron` (32.1s, exit 0), then `rebuild-native.js`, `copy-wasm.js`, and `nx copy-renderer-dev ptah-electron` (1m 40s, exit 0) under `node scripts/verify.mjs --exec`.
2. **Profile copy & auth check**: Copied `secrets.json`, `config.json`, `Local State`, `Preferences`, `ptah-dev.sqlite`, `provider-accounts/`, and `~/.ptah/{settings.json,plugins,user,templates,capabilities}` into `/tmp/ptah-live-profile-DULUJy`, seeded `global-state.json` with `ptah.workspaces.folders = ['/tmp/ptah-live-sample-ws']`, and booted Electron. Confirmed Claude Code reported `Ready` (`Signed in: Yes`) on Get Ready (`00-boot-initial.png`) and verified real profile hashes were unchanged.
3. **Model selection (Haiku only)**: Opened Setup -> Analyze workspace (`01b-analyze-pre-model.png`), clicked `Change in Settings`, changed Setup provider/model from `Kimi Code / k3.1-pro` to `Claude (Subscription)` / `Haiku 4.5` (`01c-settings-setup-model.png`, `02a-settings-haiku-picker.png`, `02b-after-save.png`), and confirmed Analyze workspace showed `Set` · `anthropic / claude-haiku-4-5-20251001` (`02-haiku-selected.png`, `03-analyze-ready-haiku.png`).
4. **Step 4a — Project analysis + background switch to Chat**:
   - Clicked `Start analysis`, verified Phase 1 streaming live (`04-analysis-running.png`) and record `setup-f417dcd3-...` (`status: "running"`, `step: "analyzing"`) written to `localStorage['ptah.setup-runs.v1']`.
   - Switched to Chat (`05-chat-during-analysis.png`), waited 20 seconds (`05b-chat-after-20s.png`). Confirmed `ptah.workflow-sessions.v1` was `null`, `Sessions 0 / 9 running`, and no chat tab was created or mixed with analysis. Observed that `[data-testid="setup-tab-running"]` was missing on the Setup nav tab (Defect #1).
   - Clicked the Setup nav tab: landed on bare Setup Home (`06-setup-returned-during-analysis.png`, Defect #1) instead of the active analysis page. Setup Home rendered one unified `ptah-setup-runs-list` row (`Running · Workspace analysis · Open`) with zero legacy `ptah-analysis-found-card` or `ptah-resume-banner` elements (`08-home-after-analysis.png`).
   - Clicked `Open` on the `Workspace analysis` row: full live progress and transcript restored (`09-analysis-restored-phase4.png` — Phase 4 of 4, 318 events, 303s elapsed). All 4 phases completed cleanly (`manifest.json`: `lifecycle: "completed"`, `runId: "01M8HGDW84S0ACFETSXSNC559F"`, `model: "claude-haiku-4-5-20251001"`).
   - On next boot, Setup Home reconciled the record to `Done · Workspace analysis · Review skills | Re-run | Dismiss` with `unseen: true` (`10-home-after-analysis-reconcile.png`), while `setup-tab-attention` remained absent (Defect #1).
5. **Step 4b — Skill review (background switch + `skill-review.json` persistence)**:
   - Clicked `Review skills` from Setup Home (`11-skill-review-running.png`), verified `skill-review` record created (`parentId` chained to analysis).
   - Switched to Chat for 10 seconds (`12-chat-during-skill-review.png`): confirmed `workflowSessions: null`, no chat tab created, and no `setup-tab-running` dot (Defect #1).
   - Clicked Setup nav tab -> landed on Setup Home (`12b-setup-home-during-skill-review.png`, Defect #1) showing `Running · Skill review · Open` above `Done · Workspace analysis`. Clicked `Open` -> reattached to in-flight review and finished at `status: "needs-input"`, `step: "selecting"` with 98 skills across 16 stack items (`13-skill-review-results.png`) and wrote `.ptah/analysis/ptah-live-sample-ws/skill-review.json` on disk.
   - Revisited Skill review from Setup Home in a fresh launch (`15-skill-review-revisit-cached.png`): loaded all 101 checkboxes immediately (`loadingVisible: false`) from `skill-review.json` with zero new LLM call.
6. **Step 4b — Agent generation entry check**:
   - On Chat empty state (`2/3 ready`, `12-chat-during-skill-review.png`), clicked `Generate agents ->`. Landed on bare Setup Home (`14-after-generate-agents-click.png`, Defects #1 & #2) instead of starting or opening agent generation. Inspected `analyze/skills` and Setup Home; no UI button starts a new `agent-generation` run.
7. **Step 4b — Project guidance (background switch + completion)**:
   - From Skill review (`15-skill-review-revisit-cached.png`), clicked `Continue without skills` -> landed on `Onboarding / Project guidance` (`16-project-guidance-entry.png`).
   - Clicked `Start guidance` (`16b-project-guidance-running.png`), verified `project-guidance` record `setup-4295ef6b-...` created (`status: "running"`, `backendRunId` bound).
   - Switched to Chat for 10 seconds (`17-chat-during-guidance.png`): confirmed `workflowSessions: null`, zero chat tabs created, and no `setup-tab-running` dot (Defect #1).
   - Returned via Setup tab -> Setup Home (`17b-home-during-guidance.png`, Defect #1) -> clicked `Open` on `Running · Project guidance` -> live streaming `Details log` restored (`17c-guidance-returned.png`), then completed all 4 guidance sections (`18-guidance-complete.png`).
8. **Step 4b — AI team builder (consent dialog, Back/Install/Cancel, handoff)**:
   - Opened `AI team builder` from Setup Home (`18b-home-before-team-builder.png`, `19-team-builder-intent.png`), submitted intent `"Build a REST API feature team for this TypeScript Express notes service"`, waited for 44 recommended skills (`19b-team-builder-review.png`).
   - Selected owner decision (`Match the repository`) and 1 skill (`Typescript Advanced Types`), clicked `Install 1 skill and continue`.
   - Verified `needs-input` / `consent` persisted across restart (`19c-home-with-tb-needs-input.png`) and automatically restored the consent dialog (`20a-consent-restored-on-reopen.png`, `20-team-builder-consent-dialog.png`: `Review skill installation`, content hash, `No scripts detected`, `All files (2)`).
   - Tested **Back** inside the consent dialog -> closed dialog cleanly back to review; re-opened consent dialog -> clicked **Install 1 skill and continue**.
   - Verified **Back** (`team-builder-installing-back`) and **Cancel** (`team-builder-cancel`) rendered and were reachable during `Installing skills...` (`20b-team-builder-installing-cancel-back.png`).
   - Confirmed install succeeded (`installed: ["wshobson/agents/typescript-advanced-types"]`) and handed off to a `Configure Harness / AI Team Builder` chat tab (`21-team-builder-after-install.png`, `handoffTabId` saved per Decision D3).
   - Confirmed Setup Home showed `Done · AI team builder · 1 skill installed` (`21b-home-after-team-builder.png`) and reopening it showed `"Conversation opened"` with reachable `"Open conversation"` and `"Back"` buttons (`21c-team-builder-handed-off-view.png`).
9. **Step 4c — Close and relaunch mid-run**:
   - Clicked `Re-run` on the completed `Workspace analysis` row in Setup Home. Verified a new record `setup-43f1df90-...` (`status: "running"`) was created while keeping the prior completed record (`setup-f417dcd3-...`) intact. Waited 12 seconds until Phase 1 was actively streaming (45 events, 14s elapsed, `22-pre-restart-in-progress.png`), then closed Electron while the run was in progress.
   - Relaunched Electron with the same temp profile. Setup Home reconciled the interrupted run cleanly (`23-post-restart-setup-home.png`): Row 1 showed **`Interrupted · Workspace analysis · started 2026-11-28 19:04:26 · Open | Dismiss`** (`status: "interrupted"`, `unseen: true`, `backendRunId: "01M8HHV17SSGHXJ1VQQ5DBAY6V"`), and all 4 prior `Done` runs remained intact.
   - Clicked `Open` on the interrupted row (`24-post-restart-run-detail.png`): displayed **`Interrupted analysis — An unfinished run is available.`** with **`Continue previous run`** and **`Start fresh`** actions (status: **interrupted & resumable**, not lost).

---

## 3. Workflow Results Table

| Workflow / Check | Result | Notes | Screenshots |
| --- | --- | --- | --- |
| Model selection (Haiku only) | **PASS** | Configured `claude-cli` / `claude-haiku-4-5-20251001` in Settings; confirmed on Analyze card before any run. | [01c-settings-setup-model.png](./visual-review/01c-settings-setup-model.png), [02a-settings-haiku-picker.png](./visual-review/02a-settings-haiku-picker.png), [02b-after-save.png](./visual-review/02b-after-save.png), [02-haiku-selected.png](./visual-review/02-haiku-selected.png), [03-analyze-ready-haiku.png](./visual-review/03-analyze-ready-haiku.png) |
| Project analysis (background + 20s Chat switch + completion) | **FAIL** *(partial — core background run passed; Setup nav dot & active-run re-entry failed due to Defect #1)* | Ran all 4 phases in background across 20s Chat visit with zero chat tabs created; progress & 318-event transcript restored via Setup Home `Open`; reconciled to `Done` on restart. **Failed:** no Setup nav running dot/attention badge, and clicking Setup nav went to bare Home instead of the active analysis page. | [04-analysis-running.png](./visual-review/04-analysis-running.png), [05-chat-during-analysis.png](./visual-review/05-chat-during-analysis.png), [05b-chat-after-20s.png](./visual-review/05b-chat-after-20s.png), [06-setup-returned-during-analysis.png](./visual-review/06-setup-returned-during-analysis.png), [08-home-after-analysis.png](./visual-review/08-home-after-analysis.png), [09-analysis-restored-phase4.png](./visual-review/09-analysis-restored-phase4.png), [10-home-after-analysis-reconcile.png](./visual-review/10-home-after-analysis-reconcile.png) |
| Setup Home unified runs list | **PASS** | Single `ptah-setup-runs-list` rendered; legacy `ptah-analysis-found-card` and `ptah-resume-banner` absent; live status chips (`Running`, `Needs input`, `Done`, `Interrupted`) and `Open`/`Re-run`/`Dismiss` controls worked cleanly. | [08-home-after-analysis.png](./visual-review/08-home-after-analysis.png), [10-home-after-analysis-reconcile.png](./visual-review/10-home-after-analysis-reconcile.png), [17b-home-during-guidance.png](./visual-review/17b-home-during-guidance.png), [21b-home-after-team-builder.png](./visual-review/21b-home-after-team-builder.png) |
| Skill review (background switch + `skill-review.json` cache) | **FAIL** *(partial — background run & disk cache passed; Setup nav dot/badge/re-entry failed due to Defect #1; AI judging fell back to registry order)* | Continued in background during 10s Chat visit, zero chat tabs created, wrote `skill-review.json`, and instant cached revisit (101 checkboxes, no loading spinner). **Failed:** Setup nav dot/badge/re-entry missing (Defect #1); also note AI judge fell back to registry order (Defect #3d). | [11-skill-review-running.png](./visual-review/11-skill-review-running.png), [12-chat-during-skill-review.png](./visual-review/12-chat-during-skill-review.png), [12b-setup-home-during-skill-review.png](./visual-review/12b-setup-home-during-skill-review.png), [13-skill-review-results.png](./visual-review/13-skill-review-results.png), [15-skill-review-revisit-cached.png](./visual-review/15-skill-review-revisit-cached.png) |
| Agent generation | **FAIL** | Clicking `Generate agents ->` on Chat empty state (`2/3 ready`) fell back to bare Setup Home (`/onboarding`) because `SETUP_RUN_ENTRY` is unprovided (Defect #1). Even if wired, `analyze/agents` redirects to `analyze/skills` which advances to `analyze/guidance`, leaving no UI path to start a new `agent-generation` run (Defect #2). | [12-chat-during-skill-review.png](./visual-review/12-chat-during-skill-review.png), [14-after-generate-agents-click.png](./visual-review/14-after-generate-agents-click.png) |
| Project guidance (background switch + completion) | **FAIL** *(partial — background run, transcript restore & chat isolation passed; Setup nav dot & active-run re-entry failed due to Defect #1)* | Ran without creating any chat tab or workflow session, survived 10s Chat switch, restored live `Details log` via Setup Home `Open`, and generated all 4 sections cleanly. **Failed:** Setup nav running dot and active-run re-entry missing (Defect #1). | [16-project-guidance-entry.png](./visual-review/16-project-guidance-entry.png), [16b-project-guidance-running.png](./visual-review/16b-project-guidance-running.png), [17-chat-during-guidance.png](./visual-review/17-chat-during-guidance.png), [17b-home-during-guidance.png](./visual-review/17b-home-during-guidance.png), [17c-guidance-returned.png](./visual-review/17c-guidance-returned.png), [18-guidance-complete.png](./visual-review/18-guidance-complete.png) |
| AI team builder (consent dialog, Install, Back/Cancel, handoff) | **PASS** *(attention badge on unseen completion still affected by Defect #1)* | Consent dialog rendered cleanly (and auto-restored across restart), `Back` closed dialog and returned to review, `Install 1 skill and continue` installed `wshobson/agents/typescript-advanced-types`, `Back` and `Cancel` were visible and reachable during `Installing skills...`, handoff opened a single `Configure Harness` chat tab (D3), and Setup Home + reopen showed `"Conversation opened"` + `"Open conversation"`. | [18b-home-before-team-builder.png](./visual-review/18b-home-before-team-builder.png), [19-team-builder-intent.png](./visual-review/19-team-builder-intent.png), [19b-team-builder-review.png](./visual-review/19b-team-builder-review.png), [19c-home-with-tb-needs-input.png](./visual-review/19c-home-with-tb-needs-input.png), [20a-consent-restored-on-reopen.png](./visual-review/20a-consent-restored-on-reopen.png), [20-team-builder-consent-dialog.png](./visual-review/20-team-builder-consent-dialog.png), [20b-team-builder-installing-cancel-back.png](./visual-review/20b-team-builder-installing-cancel-back.png), [21-team-builder-after-install.png](./visual-review/21-team-builder-after-install.png), [21b-home-after-team-builder.png](./visual-review/21b-home-after-team-builder.png), [21c-team-builder-handed-off-view.png](./visual-review/21c-team-builder-handed-off-view.png) |
| Close & relaunch while a Setup run is in progress (Step 4c) | **PASS** *(attention badge on unseen interrupted run still affected by Defect #1)* | Closed Electron while `Workspace analysis` Re-run was actively streaming Phase 1 (45 events). On relaunch with same profile, Setup Home showed **`Interrupted · Workspace analysis`** (preserving prior `Done` runs) and opening it showed **`Interrupted analysis — An unfinished run is available.`** with **`Continue previous run`** and **`Start fresh`**. | [22-pre-restart-in-progress.png](./visual-review/22-pre-restart-in-progress.png), [23-post-restart-setup-home.png](./visual-review/23-post-restart-setup-home.png), [24-post-restart-run-detail.png](./visual-review/24-post-restart-run-detail.png) |

---

## 4. Defects Found

### Defect 1 — HIGH (Blocker): `SETUP_RUN_ENTRY` token is never provided in `app.config.ts`
- **Severity:** High (blocks acceptance criteria for Component 5: nav badge, running indicator, active-run re-entry, and chat/host workflow entry points).
- **Reproduction steps:**
  1. Launch Electron with a workspace and start any Setup workflow (e.g., Project analysis, Skill review, or Project guidance).
  2. Switch to Chat while the run is actively running (or wait until a run is `needs-input` / `completed` with `unseen: true`).
  3. Observe the top nav `Setup` tab (`[data-test="config-menu-item-setup-hub"]`): neither `[data-testid="setup-tab-running"]` nor `[data-testid="setup-tab-attention"]` ever renders, and `aria-label` stays `"Setup"`.
  4. Click the `Setup` tab while the run is active: it lands on bare Setup Home (`/onboarding`) instead of the active run's step.
  5. From Chat empty state (`2/3 ready`), click `Generate agents ->`: it falls back to bare Setup Home (`/onboarding`) instead of invoking `SetupRunEntryService.openWorkflow('setup-agent-generation', 'independent-start')`.
- **Root cause & likely file:**
  - `apps/ptah-extension-webview/src/app/app.config.ts` does not register `{ provide: SETUP_RUN_ENTRY, useExisting: SetupRunEntryService }` (specified in `implementation-plan.md` Component 5, lines 489 & 523).
  - Because `ElectronShellComponent` (`libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:802`), `SetupStatusStore` (`libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts:95`), and `SetupGenerationOpenHandler` (`libs/frontend/setup-wizard/src/lib/services/setup-generation-open.handler.ts:23`) all call `inject(SETUP_RUN_ENTRY, { optional: true })`, Angular silently resolves `null` in production while unit tests pass with stubbed providers.

### Defect 2 — MEDIUM: No reachable UI flow starts a new `agent-generation` run
- **Severity:** Medium.
- **Reproduction steps:**
  1. Complete Workspace analysis so Chat empty state shows `2/3 ready` and `Generate agents ->` (`12-chat-during-skill-review.png`).
  2. Click `Generate agents ->`. Currently lands on bare Setup Home (`14-after-generate-agents-click.png`, Defect #1).
  3. Even with `SETUP_RUN_ENTRY` wired, `SetupRunEntryService.openWorkflow('setup-agent-generation')` navigates to `entrySubPathFor('agent-generation')` = `['analyze', 'skills']` (`libs/frontend/setup-wizard/src/lib/services/setup-run-steps.ts:111-112`), and `analyze/agents` redirects to `analyze/skills` (`libs/frontend/onboarding/src/lib/onboarding.routes.ts:77-79`). On `analyze/skills` (`13-skill-review-results.png`), the forward action navigates to `analyze/guidance`, not `analyze/generate`.
- **Likely files:**
  - `apps/ptah-extension-webview/src/app/app.config.ts`
  - `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-steps.ts`
  - `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`

### Defect 3 — LOW: Minor UX copy, polish, and fallback observations
- **3a. Clicking `Setup` top nav tab while already on a Setup sub-route is a no-op (fallback path):** While on `/onboarding/analyze/skills`, clicking `[data-test="config-menu-item-setup-hub"]` did not navigate because `openSetupHub()` fell back to `appState.setCurrentView('onboarding')` when `setupEntry` was `null`.
  - *Likely file:* `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts` (`openSetupHub`, lines 896–902).
- **3b. Stale "bound session" subtitle on Project guidance running panel:** During live guidance generation (`16b-project-guidance-running.png`, `17c-guidance-returned.png`), the panel subtitle says `"The run continues in its bound session."` even though guidance is now tab-free and owned by `SetupRunStore`.
  - *Likely file:* `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts`.
- **3c. Unformatted provider id in Setup model card:** After selecting `Claude (Subscription)` / `Haiku 4.5` in Settings, `Analyze workspace` displays lowercase `anthropic / claude-haiku-4-5-20251001` (`02-haiku-selected.png`) rather than a display name (`Anthropic` or `Claude (Subscription)`).
  - *Likely file:* `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` (`formatProviderDisplayName` / `setupPairText`).
- **3d. Skill review AI judge fell back to registry order:** On `13-skill-review-results.png`, top provenance pills showed `Decision stage: attempted ollama / d3:4b` and `Normal stage: attempted anthropic / claude-haiku-4-5-20251001` with `"AI review is unavailable — showing registry order (16 not judged)"` despite Haiku working on analysis and project guidance. Persistence (`skill-review.json`) and cached revisit still succeeded.
  - *Likely file:* `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (`wizard:recommend-analysis-skills`).

---

## 5. Renderer Console Errors

| Phase | Console Errors Captured |
| --- | --- |
| Boot & Haiku configuration probes | `[]` (0 errors) |
| Phase A (Project analysis + 20s Chat switch) | `[]` (0 errors) |
| Phase B (Analysis reconcile + Skill review + 10s Chat switch) | `[]` (0 errors) |
| Phase C (Generate agents CTA + cached Skill review + Project guidance + 10s Chat switch + Team Builder review) | `[]` (0 errors) |
| Phase D (Team Builder consent restore, Back, Install, handoff) | `[]` (0 errors) |
| Phase E Launch 1 (Analysis Re-run + mid-run close) | `['AbortError: Transition was skipped']` (1 transient View Transition API error on rapid route switch after clicking `Re-run`) |
| Phase E Launch 2 (Post-restart reconcile & detail open) | `[]` (0 errors) |

---

## 6. Approximate Paid Model Calls (Haiku Only)

All model calls ran against **`claude-haiku-4-5-20251001`** on the 10-file sample workspace (`/tmp/ptah-live-sample-ws`):

| Workflow | Paid Haiku Calls (approx.) | Notes |
| --- | --- | --- |
| Project analysis (run 1 — full 4 phases) | ~4 phase runs (`project-profile`, `architecture-assessment`, `quality-audit`, `elevation-plan`; 328s total) | Verified in `manifest.json`: `model: "claude-haiku-4-5-20251001"`. |
| Skill review (run 1 + cached revisit) | ~1 judge attempt (fell back to registry order); **0 calls** on cached revisit | `skill-review.json` persisted and served cache. |
| Project guidance (run 1) | ~1 structured generation call (~25s) | Produced all 4 sections cleanly. |
| AI team builder (handoff turn started) | ~1 initial chat turn (interrupted on app close after handoff confirmed) | Used isolated `claude-cli` + `claude-haiku-4-5-20251001`. |
| Project analysis Re-run (Step 4c mid-run close) | ~1 partial Phase 1 call (closed at 14s) | Reconciled to `Interrupted` on relaunch. |
| **Total** | **~8 Haiku calls** | Zero Opus/Sonnet/Codex/Kimi calls made. |

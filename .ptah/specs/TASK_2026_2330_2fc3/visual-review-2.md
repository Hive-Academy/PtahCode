# Second Live End-to-End Visual Review — TASK_2026_2330_2fc3

**Verdict:** **PASS**

All Batch 14 fixes (Defects 1, 2, 3a, 3b), Batch 16 saved-analysis discovery / freshness / durable dismissal / error-retry behaviors, and live regressions (20 s background Chat visit during analysis; Team Builder consent dialog and Install) passed cleanly in live Electron runs with **0 renderer console errors** across all launches.

---

## 1. Environment

| Item | Value |
| --- | --- |
| Task | `TASK_2026_2330_2fc3` — Run setup workflows in the background from a Setup-owned store (Second live run: Batch 14 + Batch 16) |
| Worktree | `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs` |
| Branch / Commit | `feat/setup-background-runs` @ `7920ac82d7a7fb60ea4debe2b27d111f806182fd` (`feat(setup-wizard,webview,rpc-handlers): wire setup entry and discovery`) |
| OS / Display / Runtime | Linux (`DISPLAY=:0`), Node.js `v24.15.0`, Electron, Playwright `_electron` |
| Build commands (under `scripts/verify.mjs` lock) | 1) `node scripts/verify.mjs --exec --task live-build-2 -- npx nx build-dev ptah-electron` (`.ptah/tmp/live2-build-dev.log`, exit 0) <br>2) `node scripts/verify.mjs --exec --task live-renderer-2 -- bash -c "node apps/ptah-electron/scripts/rebuild-native.js && node scripts/copy-wasm.js dist/apps/ptah-electron && npx nx copy-renderer-dev ptah-electron"` (`.ptah/tmp/live2-renderer.log`, exit 0) |
| Profile isolation | Three isolated temp copies (`/tmp/ptah-live2-profile-A`, `/tmp/ptah-live2-profile-B`, `/tmp/ptah-live2-profile-C`; all removed on cleanup): `--user-data-dir=<tmp>/userData`, `PTAH_DB_PATH=<tmp>/state/ptah.sqlite` (copied from closed `ptah-dev.sqlite` + `provider-accounts`), `PTAH_SESSIONS_DB_PATH=<tmp>/state/sessions.sqlite` (fresh), `PTAH_SETTINGS_DIR=<tmp>/ptah-settings`, `NODE_ENV=test`, `PTAH_E2E=1`. Real profiles (`~/.config/Ptah Dev/{config.json,secrets.json,global-state.json}`, `~/.ptah/settings.json`, `~/.ptah/state/ptah-dev.sqlite`) verified unchanged by SHA-256 checksum before and after all runs. |
| Sample workspace | Fresh temp TypeScript + Express + Zod + Vitest project (`/tmp/ptah-live2-sample-ws`, 8 files: `package.json`, `tsconfig.json`, `README.md`, `src/{types,store,routes,index}.ts`, `tests/store.test.ts`; removed on cleanup). |
| Model selected | **Claude Haiku 4.5** (`provider: 'claude-cli'`, `model: 'claude-haiku-4-5-20251001'`) configured in isolated `ptah-settings/settings.json` and confirmed on the Analyze workspace `Setup model` card (`Set` · `anthropic / claude-haiku-4-5-20251001`, `03-analyze-haiku-ready.png`) and in persisted `manifest.json` (`model: "claude-haiku-4-5-20251001"`) before and after execution. |
| Skill discovery note | No `ui-ux-designer` or `angular-frontend-patterns` skills were listed in this lane's available skills; verification followed `visual-review.md`, `impl-report-batch14.md`, `impl-report-batch16.md`, and direct inspection of all 25 captured PNG screenshots (0 blank frames). |

---

## 2. Exact Steps Executed

1. **Rebuild Electron & renderer**: Ran `live-build-2` (`nx build-dev ptah-electron`) and `live-renderer-2` (`rebuild-native.js`, `copy-wasm.js`, `nx copy-renderer-dev ptah-electron`), logging to `.ptah/tmp/live2-build-dev.log` and `.ptah/tmp/live2-renderer.log` (both exit 0).
2. **Isolated profiles & baseline hashes**: Created `/tmp/ptah-live2-sample-ws`, recorded SHA-256 hashes of real profile files, and created clean temp profile copies `A` and `B` seeded with `ptah.workspaces.folders = ['/tmp/ptah-live2-sample-ws']` and Setup model `claude-cli / claude-haiku-4-5-20251001`.
3. **Phase 1 — Defects 1, 2, 3a & 20 s background analysis regression (Profile A, `.ptah/tmp/live2-phase1.log`)**:
   - Opened Chat empty state (`01-chat-empty-state-2step.png`): verified `1/2 ready` (2-step count, `Skills` + `Project scan`) with CTA `Run setup ->` and **no** `"Generate agents"` action or `/3 ready` text.
   - Opened Setup Home (`02-setup-home-initial.png`): verified `1 Claude Code Ready`, `Current folder: ptah-live2-sample-ws`, and all path tiles (`Analyze current project`, `New project`, `AI team builder`) reachable with no dead CTA.
   - Opened `Analyze current project` (`03-analyze-haiku-ready.png`): verified `Setup model · Set · anthropic / claude-haiku-4-5-20251001`.
   - Clicked `Start analysis` (`04-analysis-running.png`): verified Phase 1 streaming and `[data-testid="setup-tab-running"]` blue dot visible on the top nav `Setup` tab.
   - Switched to Chat (`05-chat-during-analysis-running-dot.png`) and waited 20 seconds (`06-chat-after-20s-running-dot.png`): confirmed `setup-tab-running` dot stayed visible, `ptah.workflow-sessions.v1` remained `null`, and zero chat tabs were created.
   - Clicked top nav `Setup` tab from Chat (`07-setup-tab-reentry-from-chat.png`): returned **directly** to `Onboarding / Analyze workspace` (`Phase 2 of 4`, 49 events, 29s elapsed) — not bare Setup Home.
   - Navigated via `Onboarding` breadcrumb to Setup Home -> `AI team builder` (`08a-setup-child-route-during-run.png`), then clicked top nav `Setup` tab from that Setup child route (**Defect 3a**): returned **directly** to the active running analysis (`Onboarding / Analyze workspace`, `Phase 2 of 4`, 63 events, 36s elapsed, `08b-setup-tab-reentry-from-child.png`).
   - Switched back to Chat and waited for analysis to finish in the background (`manifest.json`: `runId: "01M8HKYCHYWPRTVZ59KBC39JEV"`, `lifecycle: "completed"`, `model: "claude-haiku-4-5-20251001"`, 301s): verified running dot disappeared and orange attention badge `1` (`[data-testid="setup-tab-attention"]`, `aria-label="Setup: 1 run needs attention"`) appeared on the `Setup` nav tab (`09-chat-analysis-done-attention-badge.png`).
   - Clicked `Setup` nav tab -> opened Setup Home showing `Done · Workspace analysis · started 2026-11-28 19:41:13 · Review skills | Re-run | Dismiss` (`10-setup-home-after-analysis-done.png`).
4. **Phase 2 — `needs-input` attention badge, Defect 3b (Project guidance), & Team Builder consent/install (Profile A, `.ptah/tmp/live2-phase2.log`, `.ptah/tmp/live2-phase4b.log`)**:
   - Clicked `Review skills` from Setup Home and switched to Chat: verified Chat empty state hid the readiness ring once both checks were ready (`2/2`, zero `"Generate agents"` CTA) and the `Setup` nav tab transitioned from running dot to orange `1` attention badge when Skill review reached `needs-input` (`11a-chat-skill-review-needs-input-badge.png`).
   - Clicked `Setup` nav tab -> returned **directly** to `Onboarding / Review skills` (`Choose skills for your stack`, 77 skills, `11b-setup-tab-reentry-needs-input.png`).
   - Clicked `Continue without skills` -> `Start guidance`: inspected running panel (`12-project-guidance-running-no-bound-subtitle.png`): showed `Creating guidance` + `Running` chip + `Stop` button with **no `"bound session"` subtitle** (Defect 3b verified), while `Setup` nav tab showed the running dot. Waited for completion (`13-project-guidance-complete.png`: `Guidance ready · Done`, 4 of 4 sections generated).
   - Opened `AI team builder`, submitted intent `"Build a REST API feature team for this TypeScript Express task tracker"`, selected `Match the repository` and `Typescript Advanced Types` (`14a-team-builder-review.png`), clicked `Install 1 skill and continue`.
   - Verified consent dialog rendered cleanly (`14-team-builder-consent-dialog.png`: `Review skill installation`, `wshobson/agents/typescript-advanced-types`, content hash, `No scripts detected`, `All files (2)`, `Back`, `Install 1 skill and continue`) and auto-restored cleanly across restart.
   - Clicked `Install 1 skill and continue` in the consent dialog: verified skill installed on disk (`.claude/skills/typescript-advanced-types` and `.agents/skills/typescript-advanced-types`), `SetupRunRecord` updated to `status: "completed"`, `step: "handed-off"`, `installed: ["wshobson/agents/typescript-advanced-types"]`, and handed off to the `Configure Harness / AI Team Builder` chat tab (`15-team-builder-after-install.png`).
5. **Phase 3 & 4 — Batch 16 discovery error + Retry, disk analysis discovery, staleness, Dismiss + explicit resume (fresh Profiles B & C, 0 paid calls, `.ptah/tmp/live2-phase3.log`, `.ptah/tmp/live2-phase4.log`)**:
   - **16(d) Discovery failure + Retry**: Set `chmod 000 /tmp/ptah-live2-sample-ws/.ptah/analysis`, booted fresh Profile B (0 run records in `localStorage`), opened Setup Home -> confirmed `role="alert"` `"Could not check for saved workspace analyses."` and `[data-testid="saved-analysis-retry"]` (`Retry`) rendered with 0 rows (`16-batch16-discovery-error.png`). Restored `chmod 755` and clicked `Retry` -> error cleared cleanly.
   - **16(a) Disk analysis with no run record -> Home row with `Review skills`**: Immediately after Retry on fresh Profile B (which had no prior run records), Setup Home adopted the on-disk completed analysis as `Done · Workspace analysis · started 2026-11-28 19:41:13 · Review skills | Re-run | Dismiss` with `unseen: false` and `analysisFreshness: { state: "fresh", reason: "ok" }` (`17-batch16-discovered-disk-analysis.png`). Clicking `Review skills` opened `Onboarding / Review skills` (`17b-batch16-review-skills-target.png`, loaded cached `skill-review.json` with 0 LLM calls).
   - **16(b) Stale text on Home row**: Updated root workspace metadata `/tmp/ptah-live2-sample-ws/package.json` (`version: "1.1.0"` + added `cors` dependency — note: `AnalysisFreshnessService` hashes root metadata files & top-level entries, so editing a nested source file body does not trigger staleness, whereas editing `package.json` does). Booted fresh Profile C -> Setup Home row displayed **`Saved analysis is stale because the workspace changed.`** with `Review skills | Re-run | Dismiss` (`18-batch16-stale-workspace-changed.png`).
   - **16(c) Dismiss, relaunch (no passive return), explicit resume**: On Profile B, clicked `Dismiss` on the `Workspace analysis` row (`19a-batch16-after-dismiss.png`); verified dismissal marker persisted in `ptah.setup-runs.v1` (`dismissals: [{ workspacePath: "/tmp/ptah-live2-sample-ws", workflow: "analysis", backendRunId: "01M8HKYCHYWPRTVZ59KBC39JEV" }]`). Closed and relaunched Electron with Profile B -> verified the dismissed `Workspace analysis` row did **not** reappear passively (`19b-batch16-after-relaunch-dismissed.png`). Opened `Analyze current project` -> clicked **`Use`** under `Saved analyses` -> verified explicit resume restored `Analysis complete · Done · Completed in 301s` with reachable **`Review skills`** button (`19c-batch16-explicit-resume.png`).
6. **Cleanup & profile safety check**: Verified zero running `ptah-electron` processes, re-verified all real profile SHA-256 hashes (`OK`), and removed `/tmp/ptah-live2-profile-{A,B,C}`, `/tmp/ptah-live2-sample-ws`, and `/tmp/ptah-live2-*` temp files.

---

## 3. Verification Results Table

| # | Verification Item | Result | Evidence / Notes | Screenshots |
| --- | --- | --- | --- | --- |
| 1a | **Defect 1**: Setup nav running indicator while a Setup run is active | **PASS** | `[data-testid="setup-tab-running"]` blue dot renders on `[data-test="config-menu-item-setup-hub"]` during live Analysis, Skill review, and Project guidance, including while viewing Chat. | [04-analysis-running.png](./visual-review-2/04-analysis-running.png), [05-chat-during-analysis-running-dot.png](./visual-review-2/05-chat-during-analysis-running-dot.png), [06-chat-after-20s-running-dot.png](./visual-review-2/06-chat-after-20s-running-dot.png), [12-project-guidance-running-no-bound-subtitle.png](./visual-review-2/12-project-guidance-running-no-bound-subtitle.png) |
| 1b | **Defect 1**: Setup nav attention badge on completion & `needs-input` while in Chat | **PASS** | Orange badge `1` (`[data-testid="setup-tab-attention"]`, `aria-label="Setup: 1 run needs attention"`) appears on unseen Analysis completion in Chat and on Skill review `needs-input` in Chat (and after Team Builder handoff completion). | [09-chat-analysis-done-attention-badge.png](./visual-review-2/09-chat-analysis-done-attention-badge.png), [11a-chat-skill-review-needs-input-badge.png](./visual-review-2/11a-chat-skill-review-needs-input-badge.png), [15-team-builder-after-install.png](./visual-review-2/15-team-builder-after-install.png) |
| 1c | **Defect 1 & 3a**: Clicking Setup nav tab returns to active run's step from Chat and from a Setup child route | **PASS** | From Chat during analysis -> returned directly to `Analyze workspace` (`Phase 2 of 4`); from Setup child route `Onboarding / AI team builder` during analysis -> returned directly to `Analyze workspace` (`Phase 2 of 4`); from Chat during Skill review `needs-input` -> returned directly to `Review skills`. | [07-setup-tab-reentry-from-chat.png](./visual-review-2/07-setup-tab-reentry-from-chat.png), [08a-setup-child-route-during-run.png](./visual-review-2/08a-setup-child-route-during-run.png), [08b-setup-tab-reentry-from-child.png](./visual-review-2/08b-setup-tab-reentry-from-child.png), [11b-setup-tab-reentry-needs-input.png](./visual-review-2/11b-setup-tab-reentry-needs-input.png) |
| 2 | **Defect 2**: Chat empty state shows 2-step ready count, no `"Generate agents"` action, and no dead CTA in Setup | **PASS** | Chat empty state shows `1/2 ready` + `Run setup ->` before analysis and hides the readiness ring once both checks are ready (`2/2`); zero `"Generate agents"` actions in Chat or Setup Home; all Setup Home CTAs (`Analyze current project`, `New project`, `AI team builder`, `Review skills`, `Re-run`, `Dismiss`) work cleanly. | [01-chat-empty-state-2step.png](./visual-review-2/01-chat-empty-state-2step.png), [02-setup-home-initial.png](./visual-review-2/02-setup-home-initial.png), [10-setup-home-after-analysis-done.png](./visual-review-2/10-setup-home-after-analysis-done.png), [11a-chat-skill-review-needs-input-badge.png](./visual-review-2/11a-chat-skill-review-needs-input-badge.png) |
| 3 | **Defect 3b**: Project guidance running panel has no `"bound session"` subtitle | **PASS** | Running panel displays `Creating guidance`, `Running` chip, and `Stop` button with no `"The run continues in its bound session."` subtitle (`hasBoundSessionText: false`). Completed cleanly with 4 of 4 sections. | [12-project-guidance-running-no-bound-subtitle.png](./visual-review-2/12-project-guidance-running-no-bound-subtitle.png), [13-project-guidance-complete.png](./visual-review-2/13-project-guidance-complete.png) |
| 4a | **Batch 16(a)**: Completed disk analysis with no run record shows as Home row with `Review skills` target | **PASS** | Fresh Profile B (zero run records in `localStorage`) discovered the saved on-disk manifest and rendered `Done · Workspace analysis · Review skills | Re-run | Dismiss`; clicking `Review skills` opened `Onboarding / Review skills`. | [17-batch16-discovered-disk-analysis.png](./visual-review-2/17-batch16-discovered-disk-analysis.png), [17b-batch16-review-skills-target.png](./visual-review-2/17b-batch16-review-skills-target.png) |
| 4b | **Batch 16(b)**: Stale/incomplete text on Home row | **PASS** | After modifying `package.json` (`version: "1.1.0"`, added `cors`), fresh Profile C displayed `"Saved analysis is stale because the workspace changed."` on the `Workspace analysis` Home row. | [18-batch16-stale-workspace-changed.png](./visual-review-2/18-batch16-stale-workspace-changed.png) |
| 4c | **Batch 16(c)**: Dismiss row -> relaunch does not bring it back passively; explicit resume still works | **PASS** | Clicking `Dismiss` removed the row and persisted a dismissal marker; relaunching Profile B did not restore the `Workspace analysis` row; opening `Analyze current project` -> clicking `Use` under `Saved analyses` explicitly restored `Analysis complete` + `Review skills`. | [19a-batch16-after-dismiss.png](./visual-review-2/19a-batch16-after-dismiss.png), [19b-batch16-after-relaunch-dismissed.png](./visual-review-2/19b-batch16-after-relaunch-dismissed.png), [19c-batch16-explicit-resume.png](./visual-review-2/19c-batch16-explicit-resume.png) |
| 4d | **Batch 16(d)**: Discovery failure + `Retry` | **PASS** | Making `<ws>/.ptah/analysis` unreadable (`chmod 000`) rendered `role="alert"` `"Could not check for saved workspace analyses."` + `Retry` with 0 rows; restoring `chmod 755` and clicking `Retry` cleared the alert and discovered the saved analysis row. | [16-batch16-discovery-error.png](./visual-review-2/16-batch16-discovery-error.png), [17-batch16-discovered-disk-analysis.png](./visual-review-2/17-batch16-discovered-disk-analysis.png) |
| 5a | **Regression**: Analysis keeps running during 20 s Chat visit | **PASS** | Analysis progressed from Phase 1 to Phase 2 across the 20 s Chat visit with zero chat tabs created (`ptah.workflow-sessions.v1: null`) and completed all 4 phases cleanly. | [05-chat-during-analysis-running-dot.png](./visual-review-2/05-chat-during-analysis-running-dot.png), [06-chat-after-20s-running-dot.png](./visual-review-2/06-chat-after-20s-running-dot.png), [07-setup-tab-reentry-from-chat.png](./visual-review-2/07-setup-tab-reentry-from-chat.png) |
| 5b | **Regression**: Team Builder consent dialog renders and Install works | **PASS** | Consent dialog (`Review skill installation`, content hash, `No scripts detected`, `All files (2)`) rendered and auto-restored across restart; clicking `Install 1 skill and continue` installed `wshobson/agents/typescript-advanced-types` to `.claude/skills/` and `.agents/skills/` and handed off to `Configure Harness / AI Team Builder`. | [14a-team-builder-review.png](./visual-review-2/14a-team-builder-review.png), [14-team-builder-consent-dialog.png](./visual-review-2/14-team-builder-consent-dialog.png), [15-team-builder-after-install.png](./visual-review-2/15-team-builder-after-install.png) |

---

## 4. Defects & Observations

**No high- or medium-severity defects were found.** All Batch 14 and Batch 16 acceptance items passed.

### Low / Informational Observations (non-blocking)
- **Obs 1 (Low — Chat readiness live refresh while staying in Chat):** On [09-chat-analysis-done-attention-badge.png](./visual-review-2/09-chat-analysis-done-attention-badge.png), when Workspace analysis completed in the background while the user remained continuously on the Chat empty state, the readiness ring stayed at `1/2 ready` until leaving and returning to Chat (on [11a-chat-skill-review-needs-input-badge.png](./visual-review-2/11a-chat-skill-review-needs-input-badge.png), the ring properly updated and hid because both checks were ready).
  - *Likely file:* `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts` (readiness status refreshes on view entry rather than subscribing to `SetupRunStore` analysis completion).
- **Obs 2 (Pre-existing from Run 1, out of Batch 14/16 scope):** `Analyze workspace` still displays lowercase `anthropic / claude-haiku-4-5-20251001` (`03-analyze-haiku-ready.png`), and Skill review AI judging still fell back to registry order (`11b-setup-tab-reentry-needs-input.png`, `Decision stage: attempted ollama / d3:4b`, `Normal stage: attempted anthropic / claude-haiku-4-5-20251001`) while persisting and serving `skill-review.json` cleanly.

---

## 5. Renderer Console Errors

| Phase / Launch | Renderer Console Errors |
| --- | --- |
| Phase 1 — Profile A (Chat empty state, Analysis, 20 s Chat visit, Defect 1/3a re-entry, completion attention badge) | `[]` (0 errors) |
| Phase 2 — Profile A (Skill review `needs-input`, Defect 3b Project guidance, Team Builder skill recommendations) | `[]` (0 errors) |
| Phase 3 Launch 1 — Profile B (Batch 16 discovery error + Retry + fresh disk analysis discovery + Review skills target) | `[]` (0 errors) |
| Phase 3 Launch 2 — Profile B (Setup Home + Dismiss) | `[]` (0 errors) |
| Phase 3 Launch 3 — Profile B (Post-dismiss relaunch + explicit `Use` resume) | `[]` (0 errors) |
| Phase 4 Launch 1 — Profile C (Batch 16 `workspace-changed` stale message after editing `package.json`) | `[]` (0 errors) |
| Phase 4b — Profile A (Team Builder consent auto-restore + Install + handoff) | `[]` (0 errors) |

---

## 6. Paid Model Calls

All Setup workflow calls ran against **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`), with each workflow executed at most once:

| Workflow | Paid Calls (approx.) | Model / Notes |
| --- | --- | --- |
| Project analysis (1 full run, 4 phases) | ~4 phase calls (`project-profile`, `architecture-assessment`, `quality-audit`, `elevation-plan`; 301s total) | Verified in `manifest.json`: `claude-haiku-4-5-20251001`. |
| Skill review (1 run + 1 cached revisit in Phase 3) | ~1 judge attempt (fell back to registry order); **0 calls** on cached revisit | `skill-review.json` persisted and reused. |
| Project guidance (1 run) | ~1 structured generation call (~38s) | `claude-haiku-4-5-20251001`; 4 of 4 sections generated. |
| AI team builder (1 skill recommendation + handoff) | ~1 initial chat handoff turn (closed 3s after handoff opened) | Note: the handed-off Chat session opened with `Default (recommended)` before closing ~3s later; all Setup-owned calls used `claude-haiku-4-5-20251001` only. |
| Batch 16 checks (Profile B & C) | **0 calls** | Pure local disk discovery, freshness check, dismissal, and cached `skill-review.json` / `Use` resume. |
| **Total** | **~7 calls** | Within budget (at most 1 run per workflow). |

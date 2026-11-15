# Electron E2E triage (82fb58bdd)

Read-only investigation. Evidence is from source, the fetched Phase 5 tip, the local dev profile/workspace, and `.ptah/tmp/dev-run5.log`; no source or process was changed. The Angular frontend patterns skill was read. Ptah workspace analysis was attempted but did not return, so targeted native searches were used.

## Q1 — `/orchestrate`

**Verdict: release blocker for the tested configuration; packaged fresh-install behavior not proved.**

**Cause.** The command and skill exist in the bundled `ptah-core` plugin, including in this dev profile. They were not made visible to this session. Bundled plugins are expressly opt-in (`libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.ts:12-13`): effective workspace configuration must enable `ptah-core`. Electron initializes the plugin loader (`apps/ptah-electron/src/activation/plugin-activation.ts:264-284`), mirrors enabled plugin material into the user layer (`:391-434`), then reconciles copies to `.claude/{skills,commands}` (`:789-830`). The workspace overlay is derived from enabled IDs and suppresses disabled IDs (`plugin-loader.service.ts:1985-2012`). The Claude SDK query logs the actual `options.plugins` count (`libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts:467`). The local log shows `pluginCount:0` at line 23422. Thus the model's response accurately reflects missing session exposure. It is not evidence that the files are absent from the installed plugin.

**Evidence.** `plugins/ptah-core/commands/orchestrate.md` and `plugins/ptah-core/skills/orchestration/SKILL.md` exist; the corresponding dev-profile `ptah-core/commands/orchestrate.md` exists. The temp workspace `.claude/commands` contains only `init-saas.md` and `initialize-workspace.md`; `.claude/skills` is absent, and `.agents` contains only `mcp_config.json`. Log lines 23416-23417 show an empty resolved plugin set beside a five-plugin set, and line 23422 confirms zero SDK plugins for the query. Log line 984 says mirror copied zero skills/commands in that pass. `git log -p --stat` on the command/skill shows Phase 4/6 edits (including `56111b2f2`, `b6a0164e3`, `f1cadf1fd`); harness policy was added in `5704bf65b` and modified for edited copies in `5ebf249aa`. These changes establish content/policy evolution, but **do not prove a regression** caused by Phase 4 or Phase 6. Setup completion is not shown as a prerequisite in the plugin loader; plugin enablement is the direct gate. The likely user action is to enable `ptah-core` in Plugins for this workspace, then start a new chat/reconcile. Whether a packaged release defaults to that enabled state is **not proved** by this dev run, and a fresh packaged user should not be promised working `/orchestrate` without that check.

**Proposed fix.** If `/orchestrate` is intended to work by default, ensure `ptah-core` is enabled for a new workspace in `plugin-loader.service.ts`/Electron activation and that the user-layer/harness pass runs before first chat; add a focused fresh-workspace integration assertion that the command/skill and SDK plugin path are present. If opt-in is intentional, expose the required Plugins action in onboarding/chat instead of implying the command is installed.

## Q2 — Setup UI and Phase 5

**Verdict: release blocker; all four items still present after Phase 5.**

**Cause/evidence.** `git fetch origin feat/phase5-remove-agent-generation` succeeded. `git diff origin/main...FETCH_HEAD --stat` includes backend removal of agent-generation paths and Setup RPC changes, but none of these renderer files. Direct `git show FETCH_HEAD:<path>` confirms:

| Item | Current source | Phase 5 tip |
| --- | --- | --- |
| `No built-in agents available` / zero-selection dead end | `libs/frontend/onboarding/src/lib/analyze/agent-recommendation-list.component.ts:111`; `choose-agents.page.ts:209` | Still present at the same lines |
| Disabled `Preview and generate` | `libs/frontend/onboarding/src/lib/analyze/choose-agents.page.ts:209` (selection gating in same component) | Still present at line 209 |
| `Only generate agents` plus analysis promise to recommend/write agents | `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts:166,268` | Still present at lines 166,268 |
| Advanced system-prompt promise | `libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.ts:248` (also `agent-behaviour-section.component.ts:59`) | Still present at line 248 |

**Proposed fix.** Phase 5 must remove/redirect the agent choice/generation route and stale home copy, and update the Advanced guidance text to describe the surviving Setup output. This is not fixed by the fetched branch as inspected.

## Q3 — analysis execute_code errors

**Verdict: minor for the completed analysis; exact `substring` source not proved.**

**Cause.** `ptah.files` is read-only by API (available methods in the error: `read`, `readJson`, `list`). A search of shipped plugin Markdown did not find an instruction to call `ptah.files.write`; the observed call is most likely model-generated misuse. The dispatcher catches and formats code execution errors (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:4408,4492`), matching the analysis continuing. A possible undefined `.substring` source is VS Code signature-help conversion at `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/ide-capabilities.vscode.ts:263`, where `sig.label.substring(...)` assumes a label. Other sites include `code-execution.engine.ts:308,314-315`; the available log does not include a stack to select one. **Exact cause not proved.**

**Evidence.** Reported log errors are documented in `.ptah/tmp/e2e-report.md` under scenario 4 and Host error log check; the four analysis phases nevertheless completed. `rg 'ptah\.files\.write' plugins -g '*.md'` returned no match. The API tool description likewise declares `ptah.files` read-only.

**Proposed fix.** No product fix is established for the model's forbidden write call; keep the typed error and clarify read-only API help if recurrence warrants. Capture a stack for the `substring` failure; guard the identified nullable labels only if the stack confirms that path.

## Q4 — startup errors

**Verdict: minor; dev-profile-only attribution not proved.**

**Cause/evidence.** Usage reconciliation catches its scan failure and logs the original error at `libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts:140-147`; scan loads cursor state and enumerates Claude/Codex roots at `:171-179`. The `ProviderAccountStoreError` could arise from account-store validation/storage/lease checks (`libs/backend/auth-providers/src/lib/accounts/provider-account.store.ts:139-168,209-235`), but the log does not identify the failing operation or account. Therefore corruption or staleness of `~/.ptah-dev` is **not proved**. Review startup catches failures at `apps/ptah-electron/src/services/review/review-sync-schedule.service.ts:161-168`, but replaces the original exception with a generic `new Error('Review startup poll failed')`; source could be settings read or per-repository poll. The same startup error handling exists in packaged builds, so a packaged profile with the same underlying state could show these errors, but recurrence in a clean packaged profile is **not proved**. The E2E report shows normal chat/edit/analysis despite them; usage totals or review polling may be stale, with no demonstrated impact on those tested flows.

**Proposed fix.** Preserve/log the real review exception safely, including which startup stage failed; add bounded diagnostics for usage reconciliation without account data. Then repair only the confirmed profile state or code path.

## Six-line release summary

1. `/orchestrate` was absent from the actual Claude query; `pluginCount:0` and missing workspace copies corroborate the model reply.
2. `ptah-core` content exists in repo and dev profile; plugin enablement is the gate, while packaged fresh-install defaults are not proved.
3. Phase 5 leaves all four cited Setup/Advanced UI problems in place.
4. `ptah.files.write` is an unsupported model call handled by the executor; no shipped plugin prompt match was found.
5. The exact `substring` source and both startup error root causes are not proved by the available log.
6. Hold release on orchestration/default-enablement and Setup dead-end verification; other observed errors did not stop the tested flows.

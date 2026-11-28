# Decision model and recent picks in Electron dev

## Findings

1. **The Decision model saves and survives restart.** The Background models row awaits `agent:setConfig` and reloads with `agent:getConfig`. The backend writer passes the selection to `DecisionModelConfig.setSelection`, which writes `ptah.agentOrchestration.decisionModel`. Electron routes that key to its file settings manager. In development, the Electron profile is `Ptah Dev` and the settings file is `~/.ptah-dev/settings.json`. Production settings can seed the dev file once. An existing dev file keeps its own values. The default is unset in either profile, which keeps routing calls opt-in. This patch keeps that product behavior. For the Electron design preview, the routing-evidence scenario now supplies a configured structured model so it can display the configured state.

   Evidence: `libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts:295`, `:447`; `libs/backend/rpc-handlers/src/lib/handlers/decision-model-writer.ts:195`; `libs/backend/lane-routing/src/lib/decision-model/decision-model.config.ts:187`, `:212`; `libs/backend/platform-electron/src/implementations/electron-workspace-provider.ts:94`, `:216`; `libs/backend/platform-core/src/file-settings-keys.ts:394`; `apps/ptah-electron/src/main.ts:76`; `libs/backend/platform-core/src/file-settings-manager.ts:96`.

2. **The editor and matrix use the same backend setting.** The matrix reads `agent:getConfig.decisionModel` via the Routing suggestions row. The settings shell recreates the matrix when the user returns from Background models, so the row reads again on initialization. The renderer regression test exercises the unset → navigate away → configured read sequence. The supplied screenshot scenario inherited an explicitly unset model from the shared fixture, which explains its “Needs a model” state.

   Evidence: `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:545`; `libs/frontend/chat/src/lib/settings/settings.component.html:125`; `libs/frontend/chat/src/lib/settings/ptah-ai/host-routing-setting.component.ts:207`, `:326`; `libs/frontend/chat/src/lib/settings/ptah-ai/host-routing-setting.component.spec.ts:136`; `apps/ptah-electron-e2e/src/design-preview/settings-lanes.fixtures.ts:105`.

3. **Recent picks is part of `agent:getCapabilityMatrix`.** The shared host manifest registers it without a capability gate. The previous handler read history through the entire route-decision service and could omit the optional history field if that service was absent or failed to resolve. The renderer treated an omitted field as a failure. A fresh rotation store already returns an empty list with no error. The handler now reads the registered rotation store directly and returns an explicit history result. The renderer accepts a successful response with omitted history as empty and still offers Retry for an RPC failure or an explicit history error. The screenshot scenario now supplies a successful capability matrix response with empty history. A live Electron dev failure was not reproduced in this run.

   Evidence: `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:176`; `libs/backend/lane-routing/src/lib/di/register.ts:110`; `libs/backend/lane-routing/src/lib/ranking/rotation.store.ts:158`; `libs/backend/rpc-handlers/src/lib/handlers/capability-matrix-rpc.handlers.ts:96`; `libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts:213`; `apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts:275`.

## Files changed

- `libs/backend/rpc-handlers/src/lib/handlers/capability-matrix-rpc.handlers.ts` and its spec read the rotation store independently and cover fresh history, stored picks, and resolution or storage errors.
- `libs/backend/lane-routing/src/index.ts` exports the store type for the RPC's read-only dependency.
- `libs/backend/platform-electron/src/implementations/electron-workspace.file-routing.spec.ts` checks disk persistence and reconstruction under an isolated dev settings directory.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts` and its spec distinguish success with no history from an unavailable read. The adjacent `host-routing-setting.component.spec.ts` covers model readback on return to the matrix.
- `apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts` supplies a ready model and an empty history for the routing-evidence capture.

## Checks

- RPC handler Jest suites passed, 55 tests across 2 suites.
- Electron workspace file-routing Jest suite passed, 5 tests.
- Renderer Jest suites passed, 62 tests across 4 suites for the decision row, host routing, lane rotation and matrix page.
- `tsc --noEmit` passed for Electron main, the Electron renderer, the Electron preview spec project, and `cli-engine`.
- ESLint and `git diff --check` passed for the changed source and spec files.
- No live Electron instance was attached to the Ptah browser tools. The screenshot fixture was updated without running Playwright or recapturing the image.
- Skills were read from the repository's `.claude/skills` files. Codex had no matching native catalog entry. Native shell reads were used for skill files and Git diff checks.

## Verify in Electron dev

1. From this worktree, start Electron with `npm run dev`. Use **Ptah Dev** and open the workspace you want to inspect.
2. Open **Settings → Providers → Background models → Decision model**. Open the picker, choose **Structured-output model**, select a configured provider, then choose or enter a model that supports structured output and click **Save**. For a local Ollama setup, choose **Ollama decision model** and enter an installed model supported by its decision endpoint. Confirm the row shows the saved selection and its readiness status.
3. Open **Settings → Context management → Decision matrix**. Confirm the “Needs a model” notice is gone. If the Routing suggestions toggle was previously turned off, enable it to exercise suggestions. Return to Background models, change the model, and revisit the matrix.
4. Quit Ptah Dev fully and launch it again. Confirm the same decision model is shown in Background models and the matrix still recognizes it. The dev selection should be in `~/.ptah-dev/settings.json` under `agentOrchestration.decisionModel`.
5. In a dev profile that has never recorded a rotation pick, confirm Lane rotation shows **No recent picks yet**. After routing records eligible picks, revisit the matrix and confirm the newest recorded pick appears first. A failed read should display **Recent picks unavailable** with **Retry**.

## Connected providers in the Decision model picker

- The structured provider selector uses the connected identities supplied by Background models. If the saved provider is missing from that list, the selector adds its display name with **(unavailable)** and keeps the saved provider and model selected when opening the editor. Opening the editor performs no settings write.
- When the connection list is empty, the editor shows **No providers connected.** and **Connect a provider**. The action closes the editor and opens **Providers → More providers**, the same route used by the other Background models rows.
- The Decision model component, template, and component spec implement and cover both states. The focused Decision model row and endpoint Jest run passed 73 tests across two suites.
- Scoped ESLint passed. The renderer's no-emit Angular template compiler passed with six unused-import warnings in unrelated components. The navigation dependency uses the component's existing `inject()` pattern to satisfy the repository's Angular ESLint rule. Live Electron verification is pending.
- To verify in Electron dev, save a structured provider and model, disconnect the provider in **Settings → Providers**, and then reopen the Decision model editor. Confirm its previous provider is labeled **(unavailable)** and the model field still shows the saved ID. With zero connections, open the structured provider picker and confirm **Connect a provider** opens **More providers**.

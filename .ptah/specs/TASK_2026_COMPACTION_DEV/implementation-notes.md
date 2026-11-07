## Changes

- `libs/backend/platform-core/src/file-settings-manager.ts`: shared settings-directory resolver and copy-once seed helper.
- `libs/backend/platform-core/src/index.ts`: export the settings helpers.
- `libs/backend/platform-core/src/file-settings-keys.ts`: route `compaction.threshold` to file settings in Electron.
- `libs/backend/platform-core/src/file-settings-path.spec.ts`: cover directory precedence, production fallback, and copy-once seeding.
- `libs/backend/platform-core/src/file-settings-keys.spec.ts`: cover threshold routing.
- `apps/ptah-electron/src/main.ts`: seed `~/.ptah-dev/settings.json` and set `PTAH_SETTINGS_DIR` before boot composition in development.
- `libs/backend/platform-electron/src/settings/electron-settings-registration.ts`: run settings migrations against the manager's resolved directory, keeping secrets in `~/.ptah`.
- `libs/backend/settings-core/src/migrations/v3-migration.ts`: keep encrypted secrets in `~/.ptah` during development migration.
- `libs/backend/settings-core/src/migrations/runner.ts`: keep dev migration markers in `~/.ptah/migrations` under distinct names.
- `libs/backend/agent-sdk/src/lib/helpers/auto-compact-control.ts`: default first-party Claude to 200,000 tokens.
- `libs/backend/agent-sdk/src/lib/helpers/auto-compact-control.spec.ts`: cover the new default.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts`: update default SDK settings assertions.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.auto-compact-argv.spec.ts`: update real-argv default assertions.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts`: update default settings assertion.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts`: correct the default-window comment.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts`: update default and readback assertions.
- `libs/backend/rpc-handlers/src/lib/harness/config/harness-config-store.service.ts`: route the harness's direct settings read/write through the shared resolver.
- `libs/backend/rpc-handlers/src/lib/harness/config/harness-config-store.service.spec.ts`: verify a dev harness write leaves production settings untouched.

## Verification

- `npm run verify -- -p platform-core,agent-sdk,platform-electron,settings-core,ptah-electron | Select-Object -Last 40`: first run: lint/typecheck 9/9 succeeded; tests 12/15 succeeded. Changed-setting expectation failures were fixed. Second run: lint/typecheck 9/9 succeeded; tests 12/15 succeeded, revealing two more stale expectations, now fixed. Third run: lint/typecheck 9/9 succeeded; tests 12/15 succeeded; remaining failures were unrelated Windows symlink, installed SDK version, and Electron fixture cases. The wrapper named all five requested projects; its output did not show an Nx `Running target ... for N projects` header.
- `npm run verify -- -p platform-core,agent-sdk,platform-electron,settings-core,ptah-electron,rpc-handlers | Select-Object -Last 40`: exit 1. The wrapper listed all six requested projects. Lint/typecheck: 11/11 tasks succeeded. Tests: 12/16 tasks succeeded (2 cached), 4 failed: platform-core, agent-sdk, rpc-handlers, ptah-electron. The new harness settings test passed; rpc-handlers failures were in 13 other suites, chiefly Windows symlink/path fixtures. The output did not show an Nx `Running target ... for N projects` header, so its requested count could not be confirmed from that header; the `[verify]` lines listed six projects.
- `ptah_get_diagnostics` scoped to changed source files: TypeScript check exceeded 45 seconds twice on the last two harness files and returned unavailable. Earlier scoped check on `runner.ts` found no error in that file but reported two sibling spec TS2835 import-extension errors. The required verify typecheck completed successfully.

## A/B/C/D findings

- A: `file-settings-manager.ts:65-82,118-119` now resolves and seeds the file; `main.ts:66-73` sets the dev directory before DI. The file store and watcher share `workspaceProvider.fileSettings` (`electron-settings-registration.ts:75-80`), so both follow that path. `electron-settings-registration.ts:143-150` passes the same path to migrations. Export uses `workspaceProvider.getConfiguration` (`settings-export.service.ts:140-145`), which routes through the manager. Import skips config values and imports only secrets (`settings-import.service.ts:1-4,43-48`). The harness wizard was a direct reader/writer of `~/.ptah/settings.json`; `harness-config-store.service.ts:46-48,101-102` now uses the resolver, while its presets remain under `~/.ptah/harnesses` (`:28-34`). V3 secrets remain in `~/.ptah` via the third argument (`v3-migration.ts:44-48,78`). Migration markers stay in `~/.ptah/migrations` under `dev-vN.applied` (`runner.ts:24-40`), avoiding shared production sentinels. The direct-path search found no other non-test Electron settings reader/writer.
- B: `auto-compact-control.ts:67-69` is the shipped default. `compaction-config-provider.ts:150` reads the key through ConfigManager. Electron routes only file-based keys to settings.json, and `file-settings-keys.ts:143-149` had omitted threshold, so it was added.
- C: `libs/shared/src/lib/types/advanced-settings.types.ts:152-161` declares handoff default 150,000 and UI min/max 1,000–2,000,000; lines 178-187 declare weighted-stop default 3,000,000 and UI min/max 1,000–100,000,000. `compaction-config-provider.ts:29-31,258-273` enforces only a positive safe integer at runtime, so a hand-edited file accepts 1 through `Number.MAX_SAFE_INTEGER`. The proposed 20,000–30,000 handoff and 200,000–300,000 weighted-stop values satisfy both the UI limits and runtime check; no minimum change.
- D: `platform-core/src/file-settings-keys.ts:104,295` supports provider model keys; `settings-core/src/repositories/model-settings.ts:10-18` selects `provider.<authKey>.selectedModel`, where `active-provider-auth-key.ts:20-37` derives authKey. `rpc-handlers/src/lib/chat/session/chat-session.service.ts:1584` selects that model for a new main chat; `sdk-query-options-builder.ts:1208-1209,1499` sends it to the SDK. The installed SDK `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:38-57` says a subagent definition's `model` overrides the default, otherwise a configured subagent model or the main model applies. No Ptah settings key for the default subagent model was found in the builder. Anthropic's [environment variable reference](https://code.claude.com/docs/ko/env-vars) documents `CLAUDE_CODE_SUBAGENT_MODEL`; the normal chat builder passes through `process.env` (`sdk-query-options-builder.ts:1552-1563`), so set it before launching Electron to select Haiku independently of the main model. Handoff records live under the session workspace's `.ptah/subagent-handoffs/` (`subagent-handoff-files.ts:31,66-71`). At 85% of the handoff limit (`subagent-budget-monitor.ts:185,519`), Ptah calls `postSubagentNotice` and logs `Near-budget warning queued` (`:530-538`). A successful stop invokes `budgetStopCallbacks.notifyAll` (`:1016-1022`) and logs `Subagent stopped` with `reason: 'handoff'` or `reason: 'safety'` (`:474-481,1036-1042`).

## Live test settings JSON

For a first-party API-key or Claude CLI main session; start a new chat after changing the model:

```json
{
  "provider": {
    "apiKey": { "selectedModel": "haiku" },
    "claudeCli": { "selectedModel": "haiku" }
  },
  "compaction": {
    "subagentHandoffTokens": 25000,
    "subagentStopWeightedTokens": 250000
  }
}
```

For a guaranteed independent subagent default, launch Electron with `CLAUDE_CODE_SUBAGENT_MODEL=haiku`; existing agent definitions may specify their own `model`. The JSON alone causes subagents without an override or configured default to inherit the Haiku main model. A third-party provider uses its own authKey, so this example assumes first-party authentication.

## Decisions

- Use `PTAH_SETTINGS_DIR` as a host-neutral directory override. Explicit constructor override still wins; unset keeps production, VS Code, and CLI on `~/.ptah`. Reversible: yes.
- Keep V3 secrets in `~/.ptah` while moving its settings input/output to the resolved directory. Reversible: yes.
- Route the harness writer through the same resolver; its presets retain their production path. Reversible: yes.

## Open risks

- The required six-project verify exited 1 because of four test targets with failures outside the changed tests: Windows symlink/handle and path fixtures, installed SDK 0.3.278 versus expected 0.3.318, and Electron packaging/config-home fixtures. Lint and typecheck passed. The Nx `Running target ... for N projects` header was absent from the filtered output; only the wrapper's six-project list was visible.
- SDK subagent definitions can override the main or default subagent model, so a Haiku main setting alone does not force every defined agent to Haiku.






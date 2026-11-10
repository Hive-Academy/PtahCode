## List comparison

Before editing, I compared the literal arrays: both contain 34 models (the task description said 35). IDs only in either list: none. Order differences: none. Display-name differences: none. The shared entries also have `description`, `contextLength`, `supportsToolUse`, `inputCostPerToken`, and `outputCostPerToken`; the adapter's `CliModelInfo` contains only `id` and `name`. The shared list is the reviewed, drift-checked source, and projecting its `id`/`name` preserves every previous CLI value.

## Changes

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts`: derive `COPILOT_MODELS` from `COPILOT_PROVIDER_ENTRY.staticModels` through `@ptah-extension/shared`.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts`: assert the adapter fallback preserves the provider list's IDs, order, and names.
- `libs/shared/src/lib/providers/entries/copilot-provider-entry.ts`: update the stale comment to identify this list as the source.

## Decisions

- Decision: project `id` and `name` from the public provider entry. Options: expose another public list constant or use the existing `COPILOT_PROVIDER_ENTRY.staticModels`. Evidence: `libs/shared/src/index.ts` exports `./lib/providers`, whose index already exports `COPILOT_PROVIDER_ENTRY`; `CliModelInfo` has only `id` and `name`; the adapter already imports `@ptah-extension/shared`. Reversible: yes.
- Decision: preserve all 34 entries unchanged. Options: alter a list or derive the adapter list. Evidence: pre-edit comparison found no ID, order, or name difference; the shared list has a weekly drift check. Reversible: yes.

## Verification

Command: `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/shared` (one run, with PowerShell's `Select-Object -Last 60` output filter, equivalent to `tail -60`). Both names were confirmed in their `project.json` files. The verification header selected exactly 2 projects: `@ptah-extension/cli-agent-runtime` and `@ptah-extension/shared`.

Result: exit code 0. Lint/typecheck: 4/4 tasks passed (2 per target), 0 failed. Test: 2/2 tasks passed (1 per target), 0 failed. The command waited 1196 seconds for a machine-wide slot before starting. `ptah_get_diagnostics` was attempted after edits but returned unchecked because its TypeScript worker had been terminated by another timed-out run; the required verification then passed.

Last relevant output lines:

```text
[verify 2026-11-09T23:20:12.802Z] lock slot 0 acquired after 1196s: verify lint,typecheck (@ptah-extension/cli-agent-runtime,@ptah-extension/shared) then verify test (@ptah-extension/cli-agent-runtime,@ptah-extension/shared)
NX   4 tasks: 4 succeeded
[verify 2026-11-09T23:21:54.164Z] starting verify test (@ptah-extension/cli-agent-runtime,@ptah-extension/shared)
NX   2 tasks: 2 succeeded
Run duration:      11m 56s
@ptah-extension/cli-agent-runtime:test    11m 8s
[verify 2026-11-09T23:34:10.350Z] lock released after 837.5s, exit code 0
```

## Extra reads

Read task `context.md` and `task.md`; shared provider index and public index; both project manifests; `CliModelInfo`; adapter spec. `ptah_code_search_symbols` had an empty index and `ptah_lsp_references` could not locate the symbol, so a single native `rg` search found references in the adapter and its spec only.

## Open items

None for this batch. No failures attributable to other writers appeared in this verification output.

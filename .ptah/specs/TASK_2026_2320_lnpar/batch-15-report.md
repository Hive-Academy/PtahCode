# Batch 15 report: B2 handle contract, capability resolver, command filter

## Task 15.0 post-rebase checks (all pass)

- agy builds its handle through `createProviderSessionLaneHandle` with `profile: antigravityAcpProfile`
  (`cli-adapters/antigravity-cli.adapter.ts:409-410`).
- The lane handle's `diagnostic` branch (`provider-session-lane-handle.ts:137-141`) calls
  `laneStderrLine(event.line, options.mcpToken)`, which wraps `redactLaneStderr`
  (`provider-session/lane-stderr-redaction.ts:80,98`). Not edited.
- No stream-json manifest is left: `stream-json` appears only in comments
  (`antigravity-acp-lane.ts:101`) and in ACP spec assertions that no stream-json spawn happens.
- `cli-adapter.interface.ts` `SdkHandle` re-located by symbol (continue/steer near the
  `supportsContinuation` member); `agent-effective-capabilities.ts` 41 lines; planner 44 lines.

## Changes

- MODIFIED `cli-adapters/cli-adapter.interface.ts`: `SdkHandle.continue(message, content?)`,
  `steer(message, content?)`, new optional `supportsSteer`, `applyTurnSettings`,
  `turnInputSupport`, `listTurnOptions`. New types `LaneTurnOptionsCatalog`,
  `LaneTurnSettingsResult`, and the `LaneTurnSettingRefusal` error class (`field`, `reason`).
  All additive: existing adapters compile unchanged.
- MODIFIED `messaging/agent-effective-capabilities.ts`: steer needs `steer` and
  `supportsSteer?.() !== false`. The output always has `turnInput`, `usage`, `prompts` and
  `effectiveApproval` (A-TL1).
  - Live: an item is supported only when the manifest says so and the handle has the operation
    (`applyTurnSettings` for model/effort; images also need the live `turnInputSupport().images`
    gate). A live gate can only narrow. `commands.blocked` = manifest blocked plus live blocked.
  - Missing manifest section: "{CLI} does not declare per-turn {item}.".
  - Restored record: model, effort, files, commands, skills copied from the manifest; images
    "Images need a running lane."; `commands.blocked` always carried.
  - Throwing `turnInputSupport()`: all items unsupported "Lane options could not be read.".
  - `effectiveApproval`: mode from `info.effectivePolicy.permission` (else `unknown`), reason names
    the spawn source, the native mode and whether approval prompts reach Ptah (D11).
- MODIFIED `messaging/agent-delivery-planner.ts`: mode selection unchanged. New
  `turnInputRefusal(plan, message, turn, current?)` returning `{ code, reason }` for a blocked
  `/command` (live and cold), images on a resume plan / on a steer without `onSteer`, unsupported
  files/model/effort, and a model/effort change on a steer (`turn-options-refused`).
- CREATED `cli-adapters/lane-command-filter.ts`: `filterLaneCommands`, `blockedLaneCommand`,
  `leadingLaneCommand`, `matchesLaneCommand`, `blockedLaneCommandReason` (D18 text).
- CREATED `testing/lane-turn-input-contract.ts`: `laneTurnInputContractViolations(handle, manifest)`
  and `assertLaneTurnInputContract(name, handle, manifest)`.

## Verification

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false
  --runTestsByPath` on the three specs: 3 suites, 35 tests passed.
- `npx eslint` on the 8 changed files: 0 errors (one `no-useless-assignment` warning fixed).
- Typecheck not run locally (user: CI verifies).

## Plan deviations

- The contract helper is a framework-free checker (`laneTurnInputContractViolations` /
  `assertLaneTurnInputContract`) instead of `describeLaneTurnInputContract(...)`: the lib
  `tsconfig.lib.json` has `types: ["node"]` and includes `src/**/*.ts` except specs, so a helper
  calling jest's `describe`/`it` outside a spec would break the lib typecheck.
- A throwing `turnInputSupport()` is not logged: the resolver is a pure function with no logger.
  The failure is surfaced to the user through the item reason (degradation-audit `reported`).

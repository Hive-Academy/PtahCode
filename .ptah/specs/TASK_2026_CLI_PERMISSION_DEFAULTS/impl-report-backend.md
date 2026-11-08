# Backend implementation report

## Files changed

- `libs/shared/src/lib/types/agent-process.types.ts`, `cli-lane-defaults.types.ts`, `rpc/rpc-agents.types.ts`, `libs/shared/src/index.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts`, `cli-lane-policy-resolver.spec.ts`, `agent-spawn-environment.service.ts`, `agent-process-manager.service.ts`, `messaging/lane-resumers/system-cli-lane-resumer.ts`, `messaging/lane-resumers/ptah-cli-lane-resumer.ts`, `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts`, `libs/backend/cli-agent-runtime/src/index.ts`
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-permission-routing.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts`, `agent-rpc.handlers.set-config.spec.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts`, `agent-namespace.builder.spec.ts`, `ptah-api-builder.service.ts`
- `apps/ptah-electron/src/di/codex-lane-composition.ts`, `codex-lane-composition.spec.ts`, `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts`
- `libs/backend/platform-core/src/file-settings-keys.ts`, `file-settings-keys.spec.ts`

## DTO

`AgentOrchestrationConfig.cliLaneDefaults: CliLaneDefaults` is returned by `agent:getConfig`; `AgentSetConfigParams.cliLaneDefaults?: CliLaneDefaults` is accepted by `agent:setConfig`. `CliLaneDefaults` is a partial map keyed by `CliType`, including one shared `ptah-cli` entry. Each entry is a strict object with optional `permission?: 'plan' | 'ask' | 'auto-edit' | 'yolo'` and `network?: 'allow' | 'deny'`. `CLI_LANE_DEFAULTS_SCHEMA` is exported from `@ptah-extension/shared`. `EffectiveLanePolicy` includes `permissionSource` and `networkSource`, each `'spawn' | 'saved' | 'built-in' | 'parent-plan'`.

## Behavior

- Resolution is per field: spawn argument, saved entry, then strongest supported manifest pair. A combined unsupported pair is refused before SDK/process launch. The static Ptah CLI registry path uses the same resolver and its own workspace settings read.
- `agent:setConfig` merges provided rows and fields into the current map inside its existing serialized write queue. It Zod-checks the map and validates available adapter manifests before writing any setting. Absent adapters leave choices saved for later validation.
- A parent `plan` level forces lane permission `plan`; Codex also forces network `deny`. Unsupported plan capability refuses the spawn. The level flows from `ptah_agent_spawn` in `agent-namespace.builder.ts`, through `getParentLevel` bound to `SdkSessionLifecycleManager.find(...).permissionLevel`, into `SpawnAgentRequest.parentLevel` or Ptah CLI registry options. The entry drops caller-supplied `parentLevel`.
- Internal resumers forward the original `effectivePolicy` snapshot. Canonical Codex values take precedence over legacy values. Legacy Codex read values are projected into the returned canonical map; legacy writes update the canonical entry, while canonical writes project the compatibility key. Electron and CLI Codex lane composition read the canonical map first. Copilot bridge approval remains separate.

## Decisions

- Use the existing `agent:setConfig` serialization queue for the two Codex keys; no new service or RPC method was added. This keeps writes ordered. Reversible: the projection and resolver are isolated.
- Register `cliLaneDefaults` in the file-backed settings keys, alongside legacy `codexSandboxMode`. Otherwise Electron, CLI, and VS Code route the two settings to different stores. Reversible: remove the key registration if storage ownership changes.
- Use the live SDK session record's permission level as the verified parent context. Reversible: remove the callback and request field if the transport contract changes.

## Verification

- Added resolver tests for built-in selection, independent field precedence, plan cap, unsupported adapters, resume snapshot, host Codex projection, and four legacy mappings. Added RPC tests for malformed map rejection, manifest incompatibility, compatibility read-back, canonical precedence, Copilot bridge independence, retained fields/rows, and concurrent edits. Added static Ptah CLI spawn tests and the MCP parent-level propagation regression.
- `npm run verify -- -p @ptah-extension/shared,@ptah-extension/platform-core,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/vscode-lm-tools,ptah-electron,@ptah-extension/cli-engine`: lint/typecheck 14/14 Nx tasks passed (2 cached). Its full test phase was stopped after the scoped lint/typecheck passed because the prior full test phase had remained active without completing; focused tests below cover the changed behavior. The runner did not print the requested `Running target test for N projects` header.
- `npm run verify -- -p @ptah-extension/shared,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/vscode-lm-tools,ptah-electron,@ptah-extension/cli-engine`: first attempt 8/12 lint/typecheck tasks passed, 4 failed on two TypeScript errors; both errors were fixed. Second attempt 12/12 lint/typecheck tasks passed (2 cached); its full test phase was stopped after remaining active without completing.
- `npm run verify -- -t test -p @ptah-extension/rpc-handlers -- --testPathPatterns=agent-rpc.handlers.set-config.spec.ts --coverage=false --maxWorkers=2 --forceExit`: first pass 1/1 Nx task passed; after additional regression tests, one run 0/1 due a test harness TypeScript cast; final run 1/1 passed after the cast was fixed.
- `npm run verify -- -t test -p @ptah-extension/platform-core -- --testPathPatterns=file-settings-keys.spec.ts --coverage=false --maxWorkers=2 --forceExit`: 1/1 Nx task passed.
- `npm run verify -- -t test -p @ptah-extension/vscode-lm-tools -- --testPathPatterns=agent-namespace.builder.spec.ts --coverage=false --maxWorkers=2 --forceExit`: 1/1 Nx task passed.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=ptah-cli-registry-permission-routing.spec.ts --coverage=false --maxWorkers=2 --forceExit`: 1/1 Nx task passed.
- `npm run verify -- -t test -p ptah-electron -- --testPathPatterns=codex-lane-composition.spec.ts --coverage=false --maxWorkers=2 --forceExit`: 11/11 Nx tasks passed; Nx ran target dependencies for the one requested project.
- `npm run verify -- -t test -p @ptah-extension/cli-engine -- --testPathPatterns=codex-lane-runtime-composition.spec.ts --coverage=false --maxWorkers=2 --forceExit`: 1/1 Nx task passed.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=cli-lane-policy-resolver.spec.ts --coverage=false --maxWorkers=2 --forceExit`: 1/1 Nx task passed, repeated after adding the unsupported-plan regression with 1/1 passed.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=cli-lane-policy-resolver.spec.ts --coverage=false --maxWorkers=2`: initial run 1/1 Nx task passed.
- `ptah_get_diagnostics` after final edits on five source files returned unavailable: TypeScript compiler still running after 45 seconds, five unchecked. The scoped Nx typecheck above passed.

## Open issues

- Full project test suites did not complete; the focused tests above passed. The verifier's full test phase stalled during the earlier six-project run and was stopped during the final seven-project run after lint/typecheck completed.
- Parent-level lookup uses SDK session records. The Codex chat runtime does not have a verified level source at this MCP entry, so its plan cap cannot be claimed as enforced yet. This requires a trusted host context path; accepting a caller-supplied level would be unsafe.
- No skill loader or skill catalogue was available to this lane.

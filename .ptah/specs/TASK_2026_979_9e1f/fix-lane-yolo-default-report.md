# Fix: CLI lane built-in default becomes yolo + network allow

User intent: "i want a very important change in our default setting for all cli to be on yolo model and allowed network".

## Design

- One ordered constant pair in `libs/shared/src/lib/types/cli-lane-defaults.types.ts`, exported through `@ptah-extension/shared`:
  - `CLI_LANE_BUILT_IN_PERMISSION_ORDER = ['yolo', 'auto-edit', 'ask', 'plan']`
  - `CLI_LANE_BUILT_IN_NETWORK_ORDER = ['allow', 'deny']`
- `resolveCliLaneDefaultPair` walks these orders when no saved or requested value exists. It picks the first permission the manifest supports, then the first network that permission supports. Every consumer calls this one function: the backend resolver (`builtInLanePolicy`, `resolveCliLanePolicy`), the settings RPC validator, and the frontend cell, lanes table and status. Because of that, the UI default cannot drift from the backend default. The old private `PERMISSIONS` constant was unused, so I deleted it.
- If a CLI supports no pair (pi), the result is still `{ unsupported }`. The message now reads "Adapter supports no permission/network pair; no default possible."
- Precedence is unchanged. A spawn request comes first, then the saved `agentOrchestration.cliLaneDefaults`, then the legacy codex `codexSandboxMode` (only when stored, see `agent-spawn-environment.service.ts:197-206`), then the built-in default. The plan-parent cap is also unchanged: plan is applied first, and codex still gets network deny.
- A partial request also goes down the order. Example: codex with `network: 'deny'` and no permission resolves to `auto-edit` + deny, because codex yolo only supports allow.
- The resolver error at `cli-lane-policy-resolver.ts:107-114` now reads "The <cli> adapter supports no verified permission mode for a built-in default and no explicit permission was provided." The old "does not support plan" text was no longer correct.
- The codex mapping already did the right thing: yolo becomes `danger-full-access`, and network stays allowed (`networkAccess` undefined). `DEFAULT_CODEX_SANDBOX_MODE` was already `danger-full-access`, so I left it alone.

## UI dialog choice

`cli-lane-default-cell.component.ts`:
- `defaultPair` already uses the shared resolver. A CLI with nothing saved now shows Yolo / Allowed, or the most capable mode it supports.
- `propose()`: the full-access dialog now opens only when the user moves up to yolo (`choice.permission === 'yolo' && effectivePermission() !== 'yolo'`). Saving yolo while yolo is already in effect, including the built-in default, needs no confirmation. Before this change, any choice with yolo opened the dialog, including a network-only change.
- `requestReset()`: a reset to a yolo built-in default asks for confirmation only when the current effective permission is not already yolo. Resetting a saved `plan` therefore still asks for confirmation, because it grants full access. Resetting a saved yolo does not ask.
- I left the warning copy unchanged.

## Files changed (production)

- `libs/shared/src/lib/types/cli-lane-defaults.types.ts` — added the order constants and the new resolution order.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts` — new error text.
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts` — dialog only on a move up to yolo.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts` — the `ptah_agent_spawn` `permission` and `network` property descriptions now state the omitted-value behaviour (saved per-CLI default, else the built-in default: yolo or the most capable mode, network allow) and the plan-parent cap.

## Specs changed or added

- `libs/shared/src/lib/types/cli-lane-defaults.types.spec.ts` — built-in default is now yolo/allow. Added: walking down the order (ask/deny), no default when no mode is supported, the exported orders.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts` — "most capable" pair is yolo/allow. Path 3 now defaults to yolo/allow. Added: partial network walks down to auto-edit/deny, saved `plan` beats the built-in default, a stored legacy codex mode beats the built-in default, the plan parent still caps, a plan-only manifest defaults to plan. The fail-closed case now uses a manifest with no supported mode and the new message.
- `.../agent-spawn-environment.service.spec.ts` — ptah-cli default is yolo → `bypassPermissions`. Added: plan parent caps to plan.
- `.../cli-adapters/codex/codex-app-server-lane.adapter.spec.ts` — added: default is yolo + allow → `danger-full-access`, plan parent caps to plan/deny (uses the real codex manifest).
- `.../cli-adapters/grok-cli.adapter.spec.ts` — added: no explicit mode resolves to yolo/allow. Before this change it threw.
- `.../cli-adapters/opencode-cli.adapter.spec.ts` — added: the built-in default spawns with `--auto`.
- `.../cli-adapters/pi-cli.adapter.spec.ts` — added: pi still has no built-in policy (throws).
- `.../ptah-cli/ptah-cli-registry-permission-routing.spec.ts` — the D24 "built-in plan" test now expects built-in yolo (`bypassPermissions`). The saved-plan and plan-parent tests in this file already existed and still pass.
- `libs/frontend/chat/.../cli-lane-default-cell.component.spec.ts` — Cursor now shows its yolo default (no "Unsupported combination"). Cursor saves yolo without the dialog. Added: an unsaved codex shows Yolo/Allowed with no dialog. A reset from saved plan asks for confirmation. A reset from saved yolo does not. The reset-label tests now use "Auto — full access".
- `libs/frontend/chat/.../cli-orchestration-matrix.writes.spec.ts` — resetting saved codex plan now confirms the dialog before saving.
- `libs/backend/vscode-lm-tools/.../__snapshots__/effective-tool-list.spec.ts.snap` — only the `ptah_agent_spawn` schema hash changed (3 snapshots), because its description changed.
- Unchanged and passing: `agent-spawn-environment.settings-routing.spec.ts`, `lane-spawn-policy.spec.ts`, `lanes-table.component.spec.ts`, `cli-orchestration-matrix.component.spec.ts`.

## Verification (focused; each run under `node scripts/verify.mjs --exec --task lane-yolo --`)

- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/cli-lane-defaults.types.spec.ts` → 6/6 passed. This run was before I added more cases, so the newer cases are not in this count. Typecheck of `libs/shared` passed with them.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts ... cli-lane-policy-resolver, agent-spawn-environment.service, agent-spawn-environment.settings-routing, lane-spawn-policy, grok-cli.adapter, opencode-cli.adapter, pi-cli.adapter, codex-app-server-lane.adapter` → 8 suites, 355/355 passed.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts ... ptah-cli-registry-permission-routing, agent-process-manager.service` → 314/314 passed.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts ... cli-lane-defaults-config, agent-rpc.handlers.set-config` → 99/99 passed.
- `npx jest --config apps/ptah-electron/jest.config.ts ... codex-lane-composition.spec.ts` → 17/17 passed.
- `npx jest --config libs/frontend/chat/jest.config.ts ... cli-lane-default-cell, lanes-table, cli-orchestration-matrix.component, cli-orchestration-matrix.writes` → 130/130 passed. A second run (lanes-table-status, lanes-table-detail, lanes-table.visual, cli-lane-default-cell, matrix.writes) → 112/112 passed.
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts ... tool-description.builder, effective-tool-list, mcp-contract.sweep, agent-spawn-surface-parity, child-phase-policy` → 208/211 passed. The 3 failures were the expected `ptah_agent_spawn` schema-hash snapshots. `-u` on `effective-tool-list.spec.ts` → 10/10 passed, 3 snapshots updated.
- `npx tsc --noEmit --project libs/shared/tsconfig.spec.json` → 0 errors.
- `libs/backend/vscode-lm-tools/tsconfig.lib.json` → 0 errors.
- `libs/frontend/chat/tsconfig.lib.json` → 0 errors.
- `libs/backend/cli-agent-runtime/tsconfig.spec.json` → 3 errors, all in `mcp-directory/gateway/mcp-gateway.service.spec.ts` and `server-sources.spec.ts`. Those come from another session's uncommitted gateway work, not from this change.
- `libs/frontend/chat/tsconfig.spec.json` → 378 errors already present across the project's spec files. The two in `cli-lane-default-cell.component.spec.ts` (lines 103 and 127, the narrow `setup()` value type) and the two in `cli-orchestration-matrix.writes.spec.ts` (76, 225) are on lines this change did not touch.
- `npx eslint <14 changed files>` → 0 errors, 15 warnings. All warnings are on lines this change did not touch: non-null assertions, and `max-lines` in tool-description.builder.ts.

## Notes for the coordinator

- The worktree also has uncommitted changes I did not make: `mcp-directory/gateway/mcp-gateway.service.ts`, `server-sources.ts`, the new `stdio-server-host.ts`, `.ptah/specs/TASK_2026_979_9e1f/batches.md`, `decisions.md` and `parity-inventory.md`. Leave them out of this change's commit.

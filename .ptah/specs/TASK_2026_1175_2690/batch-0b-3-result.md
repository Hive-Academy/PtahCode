# Batch 0b-3 result: snapshot check and usage totals RPC

## Changed files

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/effective-tool-list.spec.ts`: the three
  full-definition snapshots now check an ordered list of `<tool name> <16-hex sha256 of canonical
  inputSchema>` lines. The hash uses sorted keys, so key order does not change it.
- `.../mcp-core/__snapshots__/effective-tool-list.spec.ts.snap`: rewritten with `-u` on this spec only
  (8264 lines -> 225 lines; 3 old entries removed, 3 new written).
- New `libs/backend/rpc-handlers/src/lib/handlers/usage-rpc.handlers.ts`, `usage-rpc.schema.ts`,
  `usage-rpc.handlers.spec.ts`: RPC `usage:getDimensionTotals`.
- `libs/backend/rpc-handlers/src/lib/handlers/index.ts`, `libs/backend/rpc-handlers/src/index.ts`:
  export `UsageRpcHandlers`.
- `libs/backend/rpc-handlers/src/lib/register-shared-rpc-handlers.ts`: `registerSingleton(UsageRpcHandlers)`.
- `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts`: new entry `key: 'usage'`, `requires: []`.
- `libs/shared/src/lib/types/rpc.types.ts`: types `UsageDimensionTotalRow`,
  `UsageGetDimensionTotalsParams/Result`, registry entry and the `true` map entry.
- `libs/backend/vscode-core/src/messaging/rpc-handler.ts`: `'usage:'` added to `ALLOWED_METHOD_PREFIXES`
  (the prefix was not there).
- `apps/ptah-electron/src/di/rpc-surface.spec.ts`, `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`:
  `usage:getDimensionTotals` added to the `arrayContaining` list of served methods.

## Decisions and assumptions

- No `usage:` method existed, so the new prefix was added. The existing `analytics:` prefix was not reused,
  because the brief names `usage:getDimensionTotals`.
- Missing repository (optional injection) answers `PERSISTENCE_UNAVAILABLE`; a failed read does the same and logs
  a warning. Bad params answer `INVALID_PARAMS`. Schema is strict (`sessionId` non-empty, no extra fields).
- The result is the repository shape unchanged (snake_case rows), typed in `rpc.types.ts`.
- The schema hash covers `inputSchema` only. A description change does not fail the check (brief says schema).
- No VS Code app guard spec lists RPC methods by name (searched `attention:getSnapshot`, `analytics:`), and
  `container.smoke.spec.ts`/`surface-composition.spec.ts` do not list methods, so they were not edited.
  The manifest invariant (`assertManifestInvariants`) covers all hosts.

## Checks

- `jest -u` on `effective-tool-list.spec.ts` via verify lock: 4 passed, snapshots 3 removed / 3 written.
- `npx eslint` on the 4 new/changed spec and handler files: clean.
- `npx tsc --noEmit -p libs/backend/rpc-handlers/tsconfig.lib.json`: only errors from the 0b-2 lane's
  in-progress `lane-routing` files were present earlier (see Risks).
- role census: exit 0.
- `usage-rpc.handlers.spec.ts` (jest via verify lock): 10 passed. eslint on it: clean.

## Not done

- `rpc-allowlist.spec.ts`, `manifest.spec.ts`, the Electron and CLI `rpc-surface.spec.ts` runs: not completed
  (the first two failed to compile because of lane 0b-2's unfinished `lane-routing` edits).
- No UI (per brief).

## Risks for the coordinator

- Run `rpc-allowlist.spec.ts`, `host-profile/manifest.spec.ts`, and both `rpc-surface.spec.ts` after 0b-2 lands.
- Replay scenario sanitizer (`apps/ptah-electron/src/replay/scenario-sanitizer.ts`) lists RPC methods; it is not
  in this batch's ownership and was not changed.

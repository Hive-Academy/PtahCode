# CR-A round 1 revision

| Finding | Fix files and lines | Spec added |
| --- | --- | --- |
| 1. Setup picker and Undo | `libs/frontend/core/src/lib/services/providers-settings-state.service.ts:119,303,339` uses the canonical pair for the picker on both loads and receipts. `providers-commit.service.ts:120,216` compares the stored Undo baseline and displays the effective pair in save feedback. `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts:123` documents the get response field. | `providers-settings-state.service.spec.ts:286,301` checks the picker input after reload for both selectors, the raw RPC payload on Undo, and the canonical row and feedback after Undo. |
| 2. Non-batch refresh | `libs/backend/settings-core/src/reactive/reactive-settings-store.ts:50` refreshes every requested key whenever one is missing, including on the single-key backend path. | `libs/backend/settings-core/src/settings-core.spec.ts:1469` checks both values after out-of-band changes and partial invalidation. |
| 3. File-settings concurrency and echoes | `libs/backend/platform-core/src/file-settings-manager.ts:146,227,283` tracks the latest pending write for each key until it settles. A batch persists and publishes its receipt while the visible cache preserves newer optimistic values. A failed latest write restores the committed value. | `libs/backend/platform-core/src/file-settings-manager.spec.ts:1580,1615,1636` checks same-key success and failure, cache reads during a batch followed by two same-key writes, and the watcher's echo handler while a newer write is optimistic. |
| 4. Setup resolver interface | `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts:63,98` declares the stored pair and candidate validation. `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:369` uses the interface for Setup reads and validation. | `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts:1013,1035` types the stored-selector fixture against the port and checks that a resolver without validation cannot save a candidate. |

## PR thread replies

- **CR2** Setup uses the resolved provider and model in the picker. After reload, Undo still writes the original `apiKey` or `claudeCli` selector. The tests cover both selectors.
- **CR4** If one requested key is missing from the cache, the store refreshes every requested key. This also works on backends that read one key at a time.

## Checks run

`ptah_get_diagnostics` hit its 1 GB TypeScript memory limit with the changed paths. The focused `tsc` commands provide the compiler results.

All Jest runs used the project Jest config, `--runInBand --coverage=false --runTestsByPath`, and the named specs only. Logs are under `.ptah/tmp/`.

| Check | Result | Log |
| --- | --- | --- |
| Platform core, three file-settings-manager suites | 101 passed | `cr-a2-jest-platform.log` |
| Settings core, settings-core spec | 53 passed | `cr-a2-jest-settings.log` |
| Frontend core, Providers settings-state and commit specs | 197 passed | `cr-a2-jest-frontend.log` |
| RPC handlers, Setup RPC spec | 77 passed | `cr-a2-jest-rpc.log` |
| Auth providers, workspace LLM resolver spec | 37 passed | `cr-a2-jest-auth.log` |
| Agent SDK, commit message generator spec | 28 passed | `cr-a2-jest-sdk.log` |
| `npx tsc --noEmit --project <project>/tsconfig.lib.json` for platform-core, settings-core, frontend core, rpc-handlers, agent-sdk, auth-providers, and shared | All seven passed | `cr-a2-tsc-{platform-core,settings-core,core,rpc-handlers,agent-sdk,auth-providers,shared}.log` |
| `npx eslint` on the 11 changed source and spec files | 0 errors, 17 warnings | `cr-a2-eslint.log` |
| `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` | TOTAL 0 unsuppressed sites | `cr-a2-degradation.log` |

## Decisions

- Keep the existing Setup RPC payload and map both reads and receipts to the same picker-facing shape. The separate `undoBaseline` carries the original selector because the picker consumes the row's `committed` pair and Undo must send the stored selector. Hosts that omit the optional get field still use the pair exposed by the status. This local mapping is reversible.
- Preserve same-key optimistic values by tracking pending write ownership at batch publication. Moving the optimistic mutation into the queue would change immediate reads. Watcher arguments and batch receipts still describe the corresponding disk commit. The ownership change is local to the file manager and reversible.
- Keep candidate validation optional on the port to support existing resolve-only callers and typed test doubles. A nonempty write requires validation and fails before persistence if the capability is missing. The contract can be tightened with a coordinated update of those test doubles.
- `ptah_search_files` and `ptah_code_search_symbols` returned zero hits for task inputs and the resolver interface. Used `rg` to locate them and Ptah AST results to locate the source sections. The auth-providers resolver implementation and the chat row builder were read to verify selector mapping and picker inputs.

# B09 — RPC prefix gate

Status: complete. All five requested checks passed (4 Jest suites, 71 tests total).

## Changes

- `libs/backend/vscode-core/src/messaging/rpc-handler.ts:73`: add `bots:` alongside the existing agent prefix, preserving exact, case-sensitive `startsWith` validation.
- `libs/backend/vscode-core/src/messaging/bots-prefix.spec.ts:20`: verify a new handler has no active methods.
- `libs/backend/vscode-core/src/messaging/bots-prefix.spec.ts:24`: register and dispatch `bots:list` successfully.
- `libs/backend/vscode-core/src/messaging/bots-prefix.spec.ts:40`: reject `bot:x`, `botsx:y`, `BOTS:list`, and `malicious:hack`, leaving the registry empty.
- No handler, manifest, or `rpc.types.ts` entry added. No extra source files changed.

## Tests and check results

| Check                                                                                                                                                                                                                              | Result                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `npx tsc --noEmit --project libs/backend/vscode-core/tsconfig.lib.json`                                                                                                                                                            | PASS, exit 0                        |
| `npx eslint libs/backend/vscode-core/src/messaging/rpc-handler.ts libs/backend/vscode-core/src/messaging/bots-prefix.spec.ts`                                                                                                      | PASS, exit 0                        |
| `npx jest --config libs/backend/vscode-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-core/src/messaging/bots-prefix.spec.ts`                                                               | PASS, 1 suite / 6 tests             |
| `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts` | PASS unchanged, 2 suites / 45 tests |
| `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`                                                                  | PASS unchanged, 1 suite / 20 tests  |

The TypeScript Jest configs emitted a Node module-loading warning; both requested Jest commands above completed successfully.

## Decisions

- Preserve existing prefix validation; add no runtime handlers or registry entries.
- CLI skill discovery is unavailable in this session; no matching backend skill is exposed by the CLI skill catalog. Native file inspection is used where needed.
- Ptah workspace and AST tools were available. The dependency graph remained building; targeted `rg` inspection of registration and invariant tests was the fallback.
- Test setup uses a child DI container with a mock logger; no unsafe casts or `any` were introduced.
- No git writes, Nx targets, workspace verification, builds, or runtime servers were run.
- Used the exact lane-only checks requested; the shared RPC gate permits bots for Electron and CLI while the existing registry invariants remain unchanged. No pinned fixture exception was needed. No unmet acceptance requirements.

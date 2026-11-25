# Fix round 1 F3 — TASK_2026_2325_899d

## Files changed

- `libs/backend/platform-core/src/file-settings-manager.ts`
- `libs/backend/platform-core/src/file-settings-manager.spec.ts`
- `libs/shared/src/lib/utils/skill-document.ts`
- `libs/shared/src/lib/utils/skill-document.spec.ts`

## Findings and plan references

- **A2.** `file-settings-manager.ts:317-328` catches exceptions from each `setMany()` watcher after persistence and in-memory publication, logs the setting key, and continues notifying watchers. The call returns its committed slice even if a watcher throws. This preserves the batch contract in `implementation-plan.md:362,676`.
- **A3.** `file-settings-manager.ts:279-281` documents that a queued batch can overwrite a later optimistic `set()` on the same key if the latter runs before the batch commits. It tells callers to await the batch before issuing the same-key write. The fix is documentation per `brief-fix-r1.md:46` and follows the `set()` scope guard in `implementation-plan.md:675-677`.
- **A4.** `skill-document.ts:22-38` doubles existing backslashes before escaping quotes and line breaks in both YAML fields. The serializer still writes the body verbatim per `implementation-plan.md:456-459`. The harness tests at `libs/backend/rpc-handlers/src/lib/harness/io/harness-fs.service.spec.ts:88,131` passed for legacy fixture bytes and Preview/Create parity.
- **A5.** `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts:635-646` checks credentials before acquiring the proxy, as specified in `implementation-plan.md:90`. `libs/backend/auth-providers/src/lib/auth/provider-proxy-pool.ts:278-292` reuses live entries keyed by provider and credential/configuration fingerprint. Lines 336–349 share an in-flight start for that key. Lines 428–455 bind at most one active entry per workspace and provider, retaining at most one retired generation when the fingerprint changes. Lines 687–705 release entries when their last workspace hold is removed. A first read can start a proxy. Repeated reads under the same live configuration reuse it. The resolver and its spec needed no edits.

## Regression specs

- `file-settings-manager.spec.ts:1260` verifies that a throwing watcher is logged, later watchers on the same and next keys receive their values, and the batch succeeds with values readable from memory and after reopening the settings file.
- `skill-document.spec.ts:95` pins the emitted YAML for a multiline name, quoted text, `C:\path`, CRLF, and a trailing backslash in both fields.
- Existing `provider-proxy-pool.spec.ts:384` acquires twice for the same workspace/provider and asserts one instance and the same base URL.

## Checks

Scoped `ptah_get_diagnostics` exceeded its 1,024 MB TypeScript limit. The focused CLI checks used the repository lock via `node scripts/verify.mjs --exec --task <name> -- <command>`.

| Command | Result |
| --- | --- |
| `npx jest --config libs/backend/platform-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-core/src/file-settings-manager.spec.ts` | 61 passed on rerun. The first run exposed an overly broad warning-count assertion, which now matches the batch-watcher warning specifically. |
| `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/utils/skill-document.spec.ts` | 17 passed. |
| `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/harness/io/harness-fs.service.spec.ts` | 5 passed, including legacy byte identity and Preview/Create byte equality. |
| `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/auth/provider-proxy-pool.spec.ts` | 32 passed. |
| `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` | Passed. |
| `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.lib.json` | Passed. |
| `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` | Passed. |
| `npx eslint` on the four changed TypeScript files listed above | Passed with four existing `no-non-null-assertion` warnings outside the changed lines in the settings manager and its spec. |

## Decisions

- **A2.** Catch errors per watcher inside the queued notification loop. Moving callbacks past the write await would change notification timing and would still require catching errors to protect the result. The per-watcher catch preserves synchronous delivery and is reversible.
- **A3.** Document same-key ordering per the lane brief. Skipping keys when their generation changes would alter which entries the transaction commits. The doc edit is reversible.
- **A4.** Apply the same escaping to both fields, including explicit `\r` and `\n` escapes to represent CRLF correctly in quoted YAML. The exact-output spec covers the chosen representation. The change is reversible.
- **A5.** Keep the existing acquisition path. The live-entry lookup, shared startup and per-workspace binding satisfy the reuse criterion in `brief-fix-r1.md:51-52`; a separate check-only mode would alter how Setup detects startup failures. No code change to revert.

## Open items and changes needed in other groups

None for F3. `PtahFileSettingsManager.set()` retains its C1 behavior.

## Extra reads

- `CLAUDE.md` and the focused-check entry point in `scripts/verify.mjs`.
- Targeted ranges of `implementation-plan.md` for Setup proxy resolution, section 3.2, section 3.5 and amendment C1.
- The auth resolver's Setup proxy branch, `provider-proxy-pool.ts` and its existing reuse spec.
- Targeted byte-identity assertions in `harness-fs.service.spec.ts`.
- The four scoped Jest configs and three library TypeScript configs for verification.

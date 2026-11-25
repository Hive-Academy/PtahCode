# G-Setup-RPC-Integration (W8)

## Files changed

- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` wires Setup model reads and atomic writes, skill draft generation, the recommendation guard and judge inputs, launch-scoped analysis snapshots, and typed saved-analysis failures. Removes the `SkillRankingService` re-export.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts` covers the handlers through RPC registration, including concurrent writes through the real scope resolver and file settings manager.
- `libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts` asserts the three new methods are in the registry and owned by the Setup manifest entry.
- `apps/ptah-electron/src/di/expected-resolvable.ts` replaces the legacy ranking service in the census with the judge and draft generation services. The ranking caller remains a dependency of the judge.
- `apps/ptah-electron/src/di/rpc-surface.spec.ts` checks the new methods and DI census entries.

## Plan items

- Lines 71–81, 162–165, 368–381 and amendment C1 at 671 onward. The get RPC returns a secret-free Setup state. The set RPC trims and admits a proposed pair before writing, supports explicit clear, and takes the transaction receipt from `commitSetupPair`. It assigns the process-wide sequence before re-resolving current state. The concurrency test delays the earlier response past the later one and checks both receipts, sequence order, and the reloaded settings file.
- Line 165. The draft RPC validates and sanitizes text while preserving evidence line breaks and per-item reasons, forwards the active workspace root, and preserves the service's typed result. Unexpected service failures return a safe draft error.
- Lines 133–140, 583–606 and D28. The recommendation RPC captures `Date.now()` at entry and shares the first 6 s between strict Setup resolution and the saved-run load. It passes the strict snapshot, entry timestamp, and saved pair to the service. It preserves typed recommendation failures and returns per-item registry failures as ordinary results. Empty responses carry the empty judge and the saved pair when present.
- Lines 143–149. Deep analysis resolves and forwards one Setup snapshot for either fresh or resumed launches. It drops the client model from service options.
- Lines 245, 340 and 349. The Setup handler manifest and Electron surface publish the new RPCs, with the corresponding census changes.

## Checks

The native commands used `node scripts/verify.mjs --exec` for the repository's shared lock.

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath` with `setup-rpc.handlers.spec.ts`, `rpc-allowlist.spec.ts`, `setup-rpc-skill-install.spec.ts`, and `setup-rpc-skills-stubs.spec.ts`. Final run passed all four suites and 125 tests. Jest emitted a Node ES module loading warning for the config.
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/rpc-surface.spec.ts` passed all 17 tests.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` exited 0 with zero errors.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json` exited 0 with zero errors.
- `npx eslint <five assigned files>` exited 0 with zero errors and two warnings in the Setup handler. The existing `resolveService` throw lacks a cause, and the handler exceeds the project's line limit.
- Scoped `ptah_get_diagnostics` returned unavailable after its 45-second compiler wait. The two requested native typechecks completed successfully.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Allocate the sequence at the receipt boundary | Allocate before or after the effective state lookup. The lookup can finish out of order, so sequence assignment follows the commit receipt and precedes that lookup per 3.2. | Yes |
| Project Setup state from the strict resolution and keep the saved receipt separate | The strict resolution provides the effective provider/model. The committed receipt preserves the transaction's input provider/model identity, including direct-auth aliases. | Yes |
| Use one absolute deadline for the recommendation pre-search phase | Separate relative timeouts could exceed the +6 s budget in section 5. Both races use D28's entry clock and clear their timers on settlement. The dependency APIs lack cancellation input. | Yes |
| Apply the saved-analysis error code to direct filename loads as well | The existing direct load also surfaces storage failures. The wrapper covers the read and leaves authorization and post-load linking behavior in its existing paths. | Yes |

## Open items

- The recommendation handler maps a rejected or timed-out `loadByRunId` to `ANALYSIS_LOAD_FAILED`. `AnalysisStorageService` currently collapses directory read errors and invalid manifests into missing results during enumeration, before the handler can classify them. Distinguishing those cases in production requires a storage-side change outside the five-file batch.
- If post-commit Setup resolution throws or times out, the settings receipt has already been persisted. The RPC returns a typed Setup resolution error because it could not evaluate the effective state.
- The coordinator owns independent review and project or host verification gates. The ranking deletion batch owns the remaining legacy ranking files and temporary token, registration, and barrel entries.

## Extra reads

- Root `CLAUDE.md`, orchestration skill, and task carrier for lane rules. The user-supplied worktree and scoped commands governed this batch.
- Shared RPC contracts and method registry, SDK resolver port, auth-providers resolver and DI registration, Settings Core resolver and its file-backed test, public exports, and Platform Core workspace provider contract for the existing APIs.
- Analysis storage service and Agent Generation exports for the read and launch signatures, manifest discovery behavior, and saved pair exposure.
- Skill recommendation and draft generation services and RPC Handler error serialization for the input and error boundaries.
- Setup RPC schemas, adjacent wizard generation and enhanced-prompts handler patterns, RPC manifest, skill DI registration and exports, and the verification lock wrapper.
- Targeted task description and decision references and the existing provider settings catalogue mapping to check the relationship between provider picker IDs and effective provider IDs.
- `ptah_search_files` returned zero handoff stubs and zero `AGENTS.md` files. A focused `rg --files` fallback confirmed both searches.

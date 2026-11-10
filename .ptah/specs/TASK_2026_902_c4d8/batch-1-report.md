# Batch B1 report

## Files changed

- `libs/backend/review-contracts/src/lib/review-rpc.schema.ts`: added `review:respondToFinding`, title tie-breaker, strict failure codes, and exported accepted/dismissed markers through the existing index wildcard.
- `libs/backend/review-contracts/src/lib/review-contracts.spec.ts`: valid and invalid parameter cases, including unsafe path and missing reply body.
- `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts`: registered the method, bounded thread lookup, ambiguity handling, marker replies, sanitized GitHub failures.
- `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.spec.ts`: action bodies, thread selection, failure cases, no guessed post, and sanitization.
- `libs/shared/src/lib/types/rpc.types.ts`: added runtime RPC map entry. The registry param/result types are inferred automatically through `libs/shared/src/lib/types/rpc-review.types.ts`; no edit there.
- `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`: added to expected absent CLI methods.
- `apps/ptah-electron/src/di/rpc-surface.spec.ts`: updated review method count and explicit presence assertion.

## Registration and guard audit

Literal `review:exportRun` occurrences (excluding `.ptah/`) were in `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`, `libs/shared/src/lib/types/rpc.types.ts`, `libs/backend/review-contracts/src/lib/review-rpc.schema.ts`, `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts`, `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.spec.ts`, and `libs/backend/review-core/src/lib/persistence/review-artifact.reader.ts`. The last file uses the export schema internally, is not a method registry or guard, and is outside this batch's allowed write scope.

Additional host checks: `apps/ptah-electron/src/di/expected-resolvable.ts` lists the handler class, so no method edit; `apps/ptah-electron/src/di/rpc-surface.spec.ts` had a fixed count and was updated; `apps/ptah-electron/src/di/surface-composition.spec.ts` has no per-method review list; `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts` derives methods from `ReviewRpcHandlers.METHODS`, so no edit.

## Decisions

- Match path and line across at most five pages. For multiple matches, narrow by title in published body, then by unresolved state only when that leaves exactly one. Otherwise return `ambiguous-thread`. This is reversible and avoids posting to an uncertain thread.
- Published inline bodies contain the finding title and a finding-id marker. The request carries no finding id, so title is the available tie-breaker; no marker lookup is possible. This is reversible if a finding id is later added to the wire contract.
- The existing publication policy guard belongs to `review:rerun` before a new run is queued. No existing handler checks it before a direct GitHub reply. This method posts only to an already published thread and follows that direct-reply behavior; it does not change review publication state. Reversible if a separate operator-reply policy is defined.
- GitHub errors are logged as a fixed message plus a newly created, sanitized Error object. Neither adapter error text nor user body is logged.

## Verification and open points

- Jest was not run, as instructed. Scoped Ptah diagnostics were requested for changed files; all three scoped requests returned unavailable after 45 seconds while TypeScript remained running. The orchestrator should type-check during its verification.
- No open implementation decision. Frontend lane was notified that `title` is required and failure responses include `code`.


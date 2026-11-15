# Handoff acknowledgement fix

## Changed files

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts`: added serialized `transition` with `moved`, `already`, and `missing` results. Lookups search active storage then registered workspace delegates. Writes for known records use the delegate for `workspaceRoot` when available. Reused platform-core's existing `isWorkspaceScopedStateStorage` guard.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts`: uses `transition` for recorded acknowledgements. A missing record now logs a warning with predecessor ID and workspace root and returns a retryable failure.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts`: covers transition outcomes, workspace switching and pinned transition/CAS writes; existing plain `IStateStorage` tests still pass.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts`: covers a record found before transition but missing at transition time.

## Design notes

The store serializes each public operation. For a workspace-aware storage, lookup probes the active document first and then known workspace delegates. A mutation re-reads the record's workspace delegate before writing, so an active-workspace switch cannot move that write to another document. Plain storage continues to use the original single document. The platform-core guard avoids a new dependency on vscode-core or Electron.

## Checks

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts` â€” PASS, 2 suites / 18 tests (before final small refinement).
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` â€” PASS, 1 suite / 75 tests.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` â€” PASS, 3 suites / 93 tests (final code).
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` â€” PASS (final code).
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` â€” PASS (final code).
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts` â€” PASS, 0 errors; 6 warnings in the existing large service file. The Nx module-boundaries rule was skipped because no cached project graph was available.
- `git diff --check` â€” PASS.

## Open

No functional requirement remains open. This CLI session had no native skill invocation mechanism or available skill catalog; the requested skill could not be loaded. The existing platform-core workspace guard supplied the relevant pattern.

## Review round 1

- Finding 1 (root spelling): `storageForRoot` matches `getAllWorkspacePaths()` using the exported platform-core `normalizeWorkspaceRoot`, unified separators, and Windows case folding. It passes the registered key to the exact-key storage getter. An unmatched root warns through the injected logger and falls back to ambient storage so the handoff remains writable; lookups search all documents. A spec covers a trailing separator.
- Finding 2 (default document): the new candidate helper structurally probes `getDefaultStorage()` and deduplicates storage instances. A spec writes while the proxy uses default storage, activates another workspace, then finds and transitions the record in the default document.
- Finding 3 (duplicates): `record()` now locates existing records across candidates, applies the existing replacement rule, removes a replaceable record from its previous document, and writes to the new pinned document. A spec checks cross-document replacement.
- Finding 4 (enumeration): `records()` returns the union of active, registered, and default documents, deduped by predecessor ID with the pinned document preferred. `session-handoff-lineage.ts` calls this for delivery target recovery.
- Finding 5 (race and warning): specs assert concurrent transitions produce one `moved` and one `already`, and that a vanished record triggers a service Logger warning containing predecessor ID and workspace root.
- Nits: hoisted the predecessor predicate, formatted changed files, and extracted storage candidate/root matching into `session-handoff-ack.storage-candidates.ts`. The coordinator's fallback to the document holding an existing record and its spec were retained. `session-handoff.service.ts` gained no new production code in this round.

### Review round 1 checks

- `npx prettier --write libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.storage-candidates.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts` — PASS.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` — initial run FAIL on test-only TS excess-property typing; corrected the fake declaration. Final run PASS, 3 suites / 97 tests.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` — PASS.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.storage-candidates.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts` — PASS, 0 errors and 6 warnings in the existing service file.
- `git diff --check` — PASS.

Open: no known functional issue. The store is 335 formatted lines after extracting the storage candidate helper; further split would require moving document parsing and persistence logic and was outside this focused review change. Skill discovery was unavailable in this CLI lane; no matching skill could be loaded.


## PR review round 1 (#1312)

- A: Workspace-scoped candidate enumeration now returns deduplicated concrete workspace documents and the default document. The switching proxy is used only when neither exists. Lookup, enumeration, and subsequent mutations therefore stay on a concrete document. A spec switches the active proxy during a read and verifies only the original document changes.
- B: An unregistered root now writes to `getDefaultStorage()` when available; the warning and comment describe that fallback. A spec starts with another workspace active and verifies it remains untouched.
- C: Lookup scans candidates and prefers a record in its pinned workspace document. Enumeration uses the same preference. A duplicate spec verifies lookup, transition, and enumeration choose the pinned record.
- D: Root matching treats backslashes as separators and folds case only for Windows or drive-letter roots. POSIX roots retain literal backslashes. The POSIX branch uses `path.posix.resolve` so the platform-mocked spec also behaves correctly on a Windows test host; this has the same normalization behavior as `normalizeWorkspaceRoot` on a POSIX host.

Checks: Prettier passed on the three changed source/spec files. Jest passed (3 suites, 99 tests). `tsc --noEmit` passed for both lib and spec configs. ESLint passed on the three changed files. `git diff --check` passed. An initial Jest run found the mocked-POSIX path issue; it was corrected before the passing run. No commit or push was made.

# Code logic re-review — fix C

Scope: uncommitted diff for fix C, prior findings in `code-logic-review-0b-fix.md`, and focused new path, capability, and stale-write logic. No source file was edited.

## Prior findings

| Finding | Status | Current evidence |
| --- | --- | --- |
| D1 browser gate without a field | Closed | `phase-definition-resolver.ts:114-120` refuses v2 without the field; `route-decide.service.ts:331-355` keeps the v1 and read-failure browser gate. The enhancer now uses the same effective rule at `skill-enhancer.service.ts:954-966`. |
| D2 partial clone | Closed | `phase-definition-file.reader.ts:19-22` falls back per file. Disabled-clone host wiring remains deferred. |
| D3 gate log error code | Closed | `route-decide.service.ts:339-345` logs the `PhaseDefinitionError` code. |
| D4 reader unavailable log noise | Closed | `route-decide.service.ts:347-354` logs once per service instance. |
| D5 missing `SKILL.md` on write | Closed | `user-layer-skill-phase-writer.ts:62-70` requires the clone and main file before writing. |
| D6 revert when live `phases/` is absent | Closed | `skill-clone-file-path.ts:36-40` accepts a missing child under an existing safe clone; `user-layer-skill-phase-writer.ts:106-114` creates the folder. The RPC calls this check at `skills-synthesis-rpc.handlers.ts:553-560`. |
| C1 symlinked write parent | Closed, with residual race S1 | `user-layer-skill-phase-writer.ts:50-54,70-83` checks real paths and links before the write. |
| C2 revert source outside history | Closed, with residual race S1 | `user-layer-skill-phase-writer.ts:100-114` checks the snapshot, its phase folder, and source before copy. |
| C3 stale phase apply | Closed for phase files | `skill-enhancer.service.ts:582-603` sends the preview body hash and refuses a stale result; `user-layer-skill-phase-writer.ts:74-77` compares it under the slug lock before snapshot. Main skill, agent, and command writes still have the older behavior. |
| N1 v1-to-v2 browser capability loss | Closed | `phase-definition-resolver.ts:43-49` defines the effective v1 browser rule; `skill-enhancer.service.ts:958-966` compares effective current and candidate capabilities. |
| N2 D6 blocked by RPC and missing snapshot phase folder throws | Closed for the named cases | `skill-clone-file-path.ts:36-40` accepts a missing `phases/` folder under an existing snapshot; `skills-synthesis-rpc.handlers.ts:506-530` then returns a null body. The missing *snapshot directory* case below is still wrong. |
| S1 path check to write race | Not closed; residual risk | `user-layer-skill-phase-writer.ts:81-83,111-114` checks paths, then calls the atomic writer or copier. An outside process can replace a directory between those calls. |
| S2 explicit v1 capabilities ignored | Not closed; declared compatibility rule | `phase-definition-resolver.ts:46-49` uses the legacy table for every v1 definition, including one with an explicit field. `route-decide.service.ts:338` and `skill-enhancer.service.ts:960` now agree on this rule. |
| S3 linked content inside a history snapshot | Not closed; not proven defective here | `user-layer-skill-phase-writer.ts:77,109` calls `snapshotDirToHistory`; this review did not establish whether the snapshot copier follows an unrelated linked child. |

Deferred as directed: C4 history filter, D7 CLI DI spec, D2 host wiring.

## New finding

### Minor: deleted history snapshot becomes an invalid-parameter error

- Trigger: `listHistory` returns an entry, then the snapshot directory is removed before `getHistoryBody` resolves its phase path. This can happen when another process cleans history.
- Evidence: `skills-synthesis-rpc.handlers.ts:492-506` uses the listed path; `skill-clone-file-path.ts:34-35` requires the directory to exist and returns null on `ENOENT` at `:43-45`; the handler throws `INVALID_PARAMS` at `skills-synthesis-rpc.handlers.ts:507-511`. Its missing-file path already returns `{ body: null }` at `:527-529`.
- Impact: a vanished snapshot is shown as a bad request instead of an empty history body. The new test at `skills-synthesis-rpc.handlers.spec.ts:2217-2225` covers a missing `phases/` child, but not a vanished snapshot directory.
- Fix: in `getHistoryBody`, treat a vanished snapshot entry as `{ body: null, ts }` before the path helper, while retaining rejection of a present symlink or escaping path. Add that race case to the RPC spec.

## Five logic questions

1. **Silent failure:** No new silent write failure was found. A missing phase target yields a stale result when an expected hash exists (`user-layer-skill-phase-writer.ts:74-77`). `getHistoryBody` still returns null for an absent phase file (`skills-synthesis-rpc.handlers.ts:527-529`).
2. **Unexpected user action:** Opening a history row after another process deletes its snapshot gives `INVALID_PARAMS` (new finding above).
3. **Wrong input answer:** A v1 design file without `machineCapabilities` keeps `browser`, and a v2 candidate with `[]` fails (`phase-definition-resolver.ts:43-49`; `skill-enhancer.service.ts:958-966`).
4. **Dependency failure:** A phase read failure falls back to the legacy gate and logs its code (`route-decide.service.ts:339-355`). A missing snapshot directory is misclassified as invalid input.
5. **Unspecified case:** Concurrent history cleanup needs a stable null-body rule. The code has that rule for a missing phase file, but not for a missing snapshot folder.

## Path and stale checks

- The RPC file argument is an exact schema value (`skill-clone-file-path.spec.ts:24-49`). `join` and `isInsideRoot` constrain lexical traversal (`skill-clone-file-path.ts:17-20,31-32`). On Windows, `relative` returns an absolute result for a different drive, which line 20 rejects. The nearest existing ancestor is checked through `realpathSync` (`:36-42`); an existing linked `phases/` parent or target is rejected. No confirmed symlink escape or `..` escape was found.
- The nearest-ancestor test covers a missing `phases/` folder and an existing linked parent (`skill-clone-file-path.spec.ts:90-120`). It does not cover a vanished snapshot folder or Windows root and drive cases. The exact-file schema limits the `..` surface; the missing cases are test gaps, not evidence of an escape.
- The stale check hashes the live UTF-8 body under the lock and runs before snapshot (`user-layer-skill-phase-writer.ts:68-77`). `skill-enhancer.service.ts:588,602-603` passes the preview hash and refuses a mismatch. No new stale-hash defect was found. External edits between the final check and write remain part of S1.

## Checks and limits

Fix-C reports eight focused TypeScript checks, focused Jest suites, and ESLint passing in `fix-C-result.md`. I did not rerun Jest or Nx. Scoped `ptah_get_diagnostics` for the RPC helper and enhancer was unavailable after its 45-second compiler wait; it reported both files unchecked. This review is based on source and diff inspection, not a new passing diagnostic result. Skill discovery/loading was unavailable in this lane; repository guidance was used.

## Decisions

- Keep the v1 legacy browser rule, even when a v1 file declares a capability. Evidence: the shared helper at `phase-definition-resolver.ts:43-49` and the fix-C decision record. This is reversible in a later contract change.

## Verdict: CHANGES

Score: 84/100. The core capability, path, and stale fixes close the prior confirmed defects. The new history race is a visible but narrow regression. The remaining path race needs an outside process with local write access.

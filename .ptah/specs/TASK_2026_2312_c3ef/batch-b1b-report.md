# Batch B1b — JavaScript emitted twins

## Files changed

- `libs/backend/workspace-intelligence/src/file-indexing/typescript-twin.ts`
- `libs/backend/workspace-intelligence/src/file-indexing/typescript-twin.spec.ts`
- `libs/backend/workspace-intelligence/src/index.ts`
- `libs/backend/thoth-runtime/src/lib/workspace-index-lifecycle.ts`
- `libs/backend/thoth-runtime/src/lib/workspace-index-lifecycle.spec.ts`

## Public API

```ts
function isJavaScriptPath(path: string): boolean;
function typeScriptTwinCandidates(path: string): readonly string[];
function hasTypeScriptSourceTwin(
  path: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<boolean>;
function hasTypeScriptSourceTwinIn(
  path: string,
  present: ReadonlySet<string> | ((candidate: string) => boolean),
): boolean;
```

The sync lookup expects forward-slash keys, lowercased on Windows. The filesystem helper passes the original separators and stem spelling to the probe, which must enforce exact spelling outside Windows. The watcher verifies that a successful access refers to a file. Outside Windows it also verifies exact filename spelling.

## Specs

- All four JavaScript and TypeScript extension pairs, presence and absence, declaration-only and same-stem declaration cases, different directories, TypeScript input, rejected probes, host case rules, and Windows separators through both lookup variants.
- The watcher drops a JavaScript update with a TypeScript twin before counting it toward a full run, schedules a lone JavaScript update, and forwards a JavaScript delete without probing. Additional regressions cover differently cased directory entries, a directory named with a TypeScript extension, and a delete arriving during an earlier update probe.

## Focused checks

- Workspace-intelligence Jest first run passed (exit 0). `Test Suites: 1 passed, 1 total`. `Tests: 11 passed, 11 total`. Final rerun passed (exit 0). `Test Suites: 1 passed, 1 total`. `Tests: 12 passed, 12 total`.
  ```sh
  npx jest --config libs/backend/workspace-intelligence/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/workspace-intelligence/src/file-indexing/typescript-twin.spec.ts
  ```
- Thoth-runtime Jest first run passed (exit 0). `Test Suites: 1 passed, 1 total`. `Tests: 25 passed, 25 total`. Final rerun passed (exit 0). `Test Suites: 1 passed, 1 total`. `Tests: 27 passed, 27 total`.
  ```sh
  npx jest --config libs/backend/thoth-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/thoth-runtime/src/lib/workspace-index-lifecycle.spec.ts
  ```
- Workspace-intelligence TypeScript passed (exit 0, no diagnostics).
  ```sh
  npx tsc --noEmit --project libs/backend/workspace-intelligence/tsconfig.lib.json
  ```
- Thoth-runtime TypeScript passed on both runs (exit 0, no diagnostics).
  ```sh
  npx tsc --noEmit --project libs/backend/thoth-runtime/tsconfig.lib.json
  ```
- Changed-file ESLint passed (exit 0, no diagnostics).
  ```sh
  npx eslint libs/backend/workspace-intelligence/src/file-indexing/typescript-twin.ts libs/backend/workspace-intelligence/src/file-indexing/typescript-twin.spec.ts libs/backend/workspace-intelligence/src/index.ts libs/backend/thoth-runtime/src/lib/workspace-index-lifecycle.ts libs/backend/thoth-runtime/src/lib/workspace-index-lifecycle.spec.ts
  ```
- Scoped `ptah_get_diagnostics` remained in progress after 45 seconds and returned 5 unchecked files. The focused TypeScript commands above passed.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Use caller-normalized lookup keys for the synchronous predicate. | Normalize discovered paths once, or scan the discovered set per JavaScript file. | D6 uses the discovered set without extra I/O. Normalized keys allow direct membership tests with the Windows case rule. | Yes. The normalization contract is documented at the function. |
| Probe with Node `access` and preserve batch order while a probe is pending. | Concurrent batch completion or arrival-ordered completion. | The lifecycle has no injected filesystem. Its per-path debounce replaces older events, so a probe must not let an older update overwrite a later delete. Non-probing batches remain synchronous when no earlier batch is pending. | Yes. The watcher prefilter is internal. |
| Verify the sibling is a file and check its spelling outside Windows. | Path existence alone or verification after successful access. | A directory can have a TypeScript extension, and case-insensitive volumes can accept a differently cased path outside Windows. | Yes. The check is private to the watcher. |
| Ignore declaration suffixes during lookup. | Exclude standard declarations only by stem mismatch, or also exclude same-stem declarations explicitly. | A name such as `b.d.js` can otherwise match `b.d.ts` and lose the implementation. Candidate generation still returns the four sibling names. | Yes. Both predicates share the declaration check. |

## Outstanding work

B3 wires both twin predicates into the symbol indexer. Build the full-run lookup once using forward-slash keys and lowercase those keys on Windows. Deleting the TypeScript twin makes the JavaScript eligible at the next full run, as specified by D6.

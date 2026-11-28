## Changes

- `glob-pattern-validation.ts:8` now rejects NUL, absolute paths on either platform, parent segments encoded with glob braces/brackets, and the required `././` form; it returns only an optional error and leaves the input unchanged. The lexical static-base containment check uses the original pattern.
- `nav/inspect.ts:113` validates the list pattern, then passes `op.pattern` unchanged to the existing bounded, exclude-aware list search.
- `nav/inspect.spec.ts:159` covers the rejected patterns; `nav/inspect.spec.ts:198` verifies all accepted patterns reach bounded search unchanged.
- `glob-pattern-validation.spec.ts:3` directly covers all requested accepted and rejected validator inputs.
- `protocol-dispatcher.spec.ts:2018` verifies escaped brackets are forwarded byte-for-byte. Removed the added `ptah_search_files` glob validation and normalization tests.
- `protocol-dispatcher.ts:1171` restores the `ptah_search_files` case block to its `main` version.

## ptah_search_files diff against main

The `ptah_search_files` case block is now identical to `main`. No remaining differences in that block.

## Verification

- Jest: 6 suites; 609 passed, 1 failed, 610 total. The sole failure is the allowed Windows symlink `EPERM` in `protocol-dispatcher.spec.ts`; the other 5 suites passed. 4 snapshots passed.
- TypeScript: `tsconfig.lib.json` passed; `tsconfig.spec.json` passed.
- ESLint: 0 errors; 77 warnings, all on pre-existing lines (0 warnings on added lines). Exit code 0.
- `git diff --check`: passed.

## Out of scope

The shared glob walk's symlinked-base gap exists on `main` and remains out of scope.

## Not done

The Windows symlink `EPERM` test could not pass in this environment. No other requested work remains.

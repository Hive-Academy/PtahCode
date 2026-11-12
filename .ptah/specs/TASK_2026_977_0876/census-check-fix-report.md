# Census check: fix round report

Input: `census-check-review.md` (verdict REVISE, findings F1 to F9).
Implementer: `codex` lane (resumed session). The lane made the code changes and ran both scoped
checks, then stopped with a runtime error before it wrote this report. The orchestrator wrote this
report from the code and ran the checks again.

## Changes

| Finding | Change | Where |
| --- | --- | --- |
| F1 | A file that is not valid UTF-8 is decoded as `latin1` and counted | `check-role-census.ts:132-136` |
| F2 | A file is binary only when a NUL byte is in its first 8,000 bytes. A binary file is counted as a skip | `check-role-census.ts:128-131` |
| F9 | A file that does not exist (`ENOENT`) is counted as `unreadable`. The check exits 1 when `unreadable` is more than 0. The summary line is `skipped: N binary, N unreadable`. `--json` has a top-level `skipped` object, which is not written to `baseline.json` | `check-role-census.ts:120-127,162-163,177-178` |
| F3 | `--reason`, `--fixture-dir` and `--baseline-path` need a value that does not start with `--` (exit 2). `--reason` needs at least 10 characters | `check-role-census.ts:145-156` |
| F6 | `**/` matches zero folders. A leading `./` is removed. An exclusion that matches no tracked file is an error (exit 2) | `check-role-census.ts:55-70,112-116` |
| F7 | A path segment that ends in `-e2e` goes to the `test` bucket | `check-role-census.ts:28` |
| F8 | The baseline reader narrows `unknown` values. An exclusion `**` or `**/*` is an error. An exclusion that matches more than 50 tracked files is an error (`MAX_EXCLUDED_FILES`) | `check-role-census.ts:15,72-88,115` |
| F4 | No code change. `README.md` has a `## Limits` section: the check compares lines for each bucket only, and each phase runs `--update` in the pull request that removes names | `README.md` |
| F5 | New self-test cases: binary file, `latin1` file, `-e2e` path, fixed exclusions (`.ptah/specs`, lock file), flag with no value (three flags), short reason, exclusion with no path, `./` exclusion, `**/` exclusion at the top level, exclusion that matches nothing, exclusion that is too broad, exclusion that matches more than 50 files | `run-self-test.js:42-110` |

`tools/role-census/__fixtures__/sample.md` was deleted. No file read it.

## Baseline

The new rules did not change the counts. `baseline.json` is unchanged: 2,085 lines in 298 files.
The check now reports `skipped: 132 binary, 0 unreadable`.

## Checks (orchestrator, 2026-11-12)

| Command | Result |
| --- | --- |
| `npm run verify -- -t self-test -p role-census` | 1 task succeeded, exit code 0 |
| `npm run verify -- -t lint -p role-census` | 1 task succeeded, exit code 0 |
| `npx ts-node --transpile-only tools/role-census/check-role-census.ts` | all 7 buckets equal to the baseline, exit 0 |

## Not done

- No self-test case for an `unreadable` file. The fixture walk lists only files that exist, so the
  fixture mode cannot produce `ENOENT`.
- No run on Linux. The CI job is the first Linux run.
- `raw as Baseline` and `raw as Record<string, unknown>` stay in `readBaseline` after the
  validation of each field.

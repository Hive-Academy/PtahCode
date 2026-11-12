# Census check: re-review of the fix round

## Verdict

APPROVED. All agreed fixes are present and correct. Two Minor robustness gaps remain, and neither blocks CI today.

## Fix status

| Finding | Status | Evidence (file:line) |
| --- | --- | --- |
| F1 latin1 fallback | fixed | `check-role-census.ts:109,132-136` (fatal decoder, `TypeError` caught, `latin1`). Test `run-self-test.js:46,56` |
| F2 binary = NUL in first 8,000 bytes | fixed | `check-role-census.ts:128-131`. Test `run-self-test.js:45,59` |
| F3 flag values, `--reason` length | fixed | `check-role-census.ts:145-151,155`. Tests `run-self-test.js:76-79` |
| F5 new self-test cases | fixed (see assertion notes below) | `run-self-test.js:42-110` |
| F6 glob `**/`, `./`, stale exclusion | fixed | `check-role-census.ts:57,60-63,114`. Tests `run-self-test.js:89-103` |
| F7 `-e2e` segment to `test` | fixed | `check-role-census.ts:28`. Test `run-self-test.js:42,55` |
| F8 `unknown` narrowing, broad exclusion, 50-file cap | fixed | `check-role-census.ts:72-88,115`. Tests `run-self-test.js:104-110` |
| F9 `ENOENT` = unreadable, exit 1, `skipped` output | fixed | `check-role-census.ts:120-127,162-163,177-178`. `skipped` is not in `next` (line 182) |
| F4 (no code change) | README accepted | `README.md:9-11` text is correct |

## New defects

1. **Minor** — `check-role-census.ts:120-127`. Only `ENOENT` is handled. Other read errors exit 2.
   Scenario (inference from Node behavior, not run): a tracked symlink that points to a directory, or a submodule gitlink, gives `EISDIR`. The check throws and exits 2. A broken symlink gives `ENOENT` and exits 1. The repository has no symlink and no gitlink now (`git ls-files -s` mode 120000 and 160000: no match, no `.gitmodules`), so CI is not affected today.
   Fix: `lstat` first, skip non-regular files and count them as `binary` or a new `nonfile` counter. Or catch `EISDIR`.
2. **Minor** — `run-self-test.js:112`. The PASS message lists "update guards". The self-test has no case for `--update` with an `unreadable` file, and the report says so (fix report, "Not done"). The `unreadable` path (`check-role-census.ts:178`) has no test. Not vacuous, but uncovered.
   Fix: accept as known gap, or add a unit test through an exported collector with a missing path.

## Answers to the specific questions

- **Valid run exit 1 or 2 in CI?** Not with the current tracked files. The only conditions are a file that is deleted from the work tree (exit 1, by design), and the two cases in defect 1. A fresh `actions/checkout` has none of them.
- **`latin1` fallback across OS?** No difference. Decoding depends on the bytes only (`TextDecoder` fatal, then `latin1`). Paths use `/` (lines 102, 107). Line split uses `/\r?\n/` (line 42). Inference: `TextDecoder` removes a UTF-8 BOM on both systems.
- **`matchesGlob` after the `**/` change?** Correct. `**/x` gives `^(?:.*/)?x$`, `docs/**` gives `^docs/.*$`, and `a/**/b` matches `a/b` and `a/x/b`. A lone `**` or `**/*` is refused before matching (line 80). Other special characters are escaped (line 67). Test `run-self-test.js:96-100` fails without the zero-folder rule, because the `other` count would be 2.
- **`--update` writes `skipped`?** No. `next` is `{ ...counts, excludes }` (line 182), and `counts` has no `skipped` key. The `--json` branch returns before any write (lines 161-164).

## Assertion check (question 3)

- Line 56-58: expected counts are consistent. 7 bucket files, plus `docs/latin1.md`, plus the `-e2e` file, gives 9. The binary file, `.ptah/specs` and the lock file are not counted, so the fixed exclusions are tested.
- Line 59: `skipped` equals `{ binary: 1, unreadable: 0 }`. It is a real check.
- Lines 77-79: the `--reason --update` case hits the value rule, not the unknown-flag rule. Correct.
- Lines 89-93: without the `./` strip the exclusion matches no file and the run exits 2. Not vacuous.
- Lines 82-87: both assertions match the same message. Redundant, but each has a distinct input. Not vacuous.
- Lines 101-110: each message regex matches the intended error. No always-true assertion found.

## Commands run

- `npm run verify -- -t self-test -p role-census` — 1 task succeeded, exit code 0.
- `npx ts-node --transpile-only tools/role-census/check-role-census.ts` — all buckets equal to baseline, `TOTAL: 2085 lines in 298 files`, `skipped: 132 binary, 0 unreadable`.
- `git ls-files -s` filter for modes 120000 and 160000 — no output. `.gitmodules` absent.
- `baseline.json` has `"excludes": []`.
- Loop over `git ls-files` with `[ -e ]` — it finished later in the background and printed no `MISSING` line. No tracked file is missing from the work tree.

## Not checked

- The lint target (`-t lint`). The fix report says it passed. I did not run it again.
- A Linux run. No Linux host was available.
- `--update --force-raise` against the real baseline (I did not write `baseline.json`).
- Behavior with a real symlink or gitlink (inference only).
- Files that are untracked in `tools/role-census/` (all of the directory shows as `??`, so the tool is not yet committed).

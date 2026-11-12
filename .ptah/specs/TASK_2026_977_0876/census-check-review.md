## Verdict

REVISE — the ratchet works on the real tree and the self-test passes, but a new role line can hide in a non-UTF-8 file, and `--reason` accepts a flag name as its text.

## Findings

| ID | Severity | file:line | What is wrong | Proof | Smallest fix |
|----|----------|-----------|---------------|-------|--------------|
| F1 | Serious | check-role-census.ts:107-109 | A tracked file that is not valid UTF-8 (for example Latin-1) is skipped with no message. A role name added to it is never counted. | Fixture with `docs/a.md` (`team-leader`) and `docs/latin1.md` (`team-leader \xe9`): `--json` gives docs `lines: 1`, not 2. | Decode with `latin1` (or `utf8` non-fatal) and count. At least print the skipped path and fail on any skip. |
| F2 | Serious | check-role-census.ts:107 | Any file with one NUL byte is treated as binary and is skipped. A text file with `\0` and a role name is not counted. | Fixture `docs/bin.md` = `team-leader\0\n`: not counted (docs stays 1). | Use `git ls-files --eol` / `-z` text attribute, or do not skip. Print skipped files. |
| F3 | Moderate | check-role-census.ts:118-122 | `value()` returns the next argument even if it is a flag. `--reason --update` gives reason `--update`. The `--force-raise` guard checks only that the reason is non-blank. | `--reason --update --force-raise` exit 0, printed `Approved raise reason: --update`. `--update --force-raise --reason --baseline-path <copy>` raised the copy with reason `--baseline-path`. | Reject a value that starts with `--`. Require a minimum reason length. |
| F4 | Moderate | check-role-census.ts:129-131 | The ratchet compares `lines` only. `files` and `total` in baseline.json are never compared. Slack from a stale baseline also lets a new line pass: remove 5 lines in file A and add 5 in file B of the same bucket, exit 0. | Code path. `baseline[bucket].files` and `baseline.total` are never read. | Compare `files` and `total`. Call out slack in the README, or fail when current < baseline in CI. |
| F5 | Moderate | run-self-test.js:49-65 | Missing tests: (a) `--update` that lowers a baseline and writes it; (b) an exclusion with a missing `path`; (c) an exclusion that works (a file is skipped); (d) `--force-raise` without a reason refused; (e) always-excluded paths (`.ptah/specs`, lock files, NUL file). | Read of the test. Only the missing `reason` case (line 62) and the refuse and approve paths are tested. | Add the five cases. |
| F6 | Moderate | check-role-census.ts:57,26 | `**/foo.md` does not match a top-level `foo.md` (the `/` is required). `./docs/x` never matches `docs/x` and gives no warning. A glob that matches no file is not reported. | `node` harness: `foo.md` vs `**/foo.md` false; `docs/x.md` vs `./docs/x.md` false. | Treat `**/` as optional. Strip `./`. Warn on an exclusion that matches nothing. |
| F7 | Minor | check-role-census.ts:26 | `apps/ptah-electron-e2e/src/x.ts` goes to `source`, not `test`. The regex needs a folder named exactly `e2e`. Real files exist in `apps/ptah-electron-e2e/`. | See answer D. Real `/e2e/` folders: 0. | Add `-e2e/` to the test pattern. |
| F8 | Minor | check-role-census.ts:68-69 | `item` is implicit `any` (after `Array.isArray`). This conflicts with "no any". A `**` exclusion with a reason sets all counts to 0 and exit 0 (by design, but a reviewer must read the JSON). | Fixture with `excludes:[{path:"**",reason:"x"}]`: TOTAL 0, exit 0. | Type `raw.excludes` as `unknown[]`. Consider a guard that fails on an exclusion that hides more than N files. |
| F9 | Minor | check-role-census.ts:105-106 | ENOENT is skipped silently. A sparse or broken checkout counts less and passes. Not an issue in CI today (see G). | Code path. | Count the skips and print them. |

No Blocking finding: on the real tree the check gives exit 0 and a stable count, and an increase in a bucket gives exit 1 (self-test line 53).

## Answers A to J

**A.** Yes, in these cases. (1) A role line in a non-UTF-8 file (F1). (2) A role line in a file with a NUL byte (F2). (3) Slack from a stale baseline in the same bucket (F4). (4) An `excludes` entry (needs a reason, F8). (5) `--json` (see I). I found no plain case (valid UTF-8 text file, no exclusion) with an increase and exit 0.

**B.** `--update` without `--force-raise` refuses a raise: exit 1, baseline not written (tested by me and by the self-test). `--force-raise` alone or with a blank reason exits 2. But a flag used as the reason value passes the guard (F3): `--reason --update --force-raise` raised and wrote the baseline. `--baseline-path` as the value of `--reason` also works. Flag order has no effect. `--update --json` returns before the write, so it cannot raise.

**C.** I found no platform difference. `.gitattributes` has `* text=auto eol=lf`, so a Windows checkout has LF. The split uses `/\r?\n/`, so CRLF is safe in any case. `git ls-files -z` gives `/` paths. A BOM is removed by `TextDecoder`. The `localeCompare('en')` sort only affects the printed list. Bucket regexes are case-sensitive on both systems. The tree has no symlink (mode 120000) and no submodule (160000), so there is no EISDIR or symlink-text difference. Run on Windows here: TOTAL 2085 lines, 298 files, equal to baseline. I could not run on Linux (see Not checked).

**D.** With the rules as written: `.claude/agents/team-leader.md` → generated-agents; `plugins/ptah-core/skills/orchestration/SKILL.md` → skills; `apps/ptah-docs/.../built-in-agents.md` → docs; `libs/backend/agent-generation/templates/agents/team-leader.template.md` → templates; `phase-plan.spec.ts` → test; `README.md` → docs; `CLAUDE.md` → docs; `apps/ptah-electron-e2e/src/x.ts` → source (a reader expects test; F7). Also `__fixtures__/x.md` goes to docs because docs is before test. Same file type `.spec.js` goes to source.

**E.** `**` → `.*` works (`docs/**` matches `docs/a/b.md`). `*` → `[^/]*` works (`docs/*.md` does not match `docs/a/x.md`). `?` works. Regex characters (`+ ( ) .`) are escaped (`a+b(1).md` matches; `axmd` vs `a.md` false). Defects: `**/foo.md` misses top-level `foo.md`, and a leading `./` never matches (F6).

**F.** Req 4: tested (line 53 exit 1; line 59 decrease with the hint). Req 5: refuse tested (line 54, baseline unchanged line 55); raise with force tested (line 49). Not tested: a decrease written by `--update`, and force without a reason. Req 6: only the missing `reason` is tested; the missing `path` and a working exclusion have no test (F5). Cleanup: yes, `finally` removes the temporary folder, also on failure (the error is then re-thrown).

**G.** Job `checks` runs on `ubuntu-latest` with `actions/checkout@v4` and `fetch-depth: 0` (ci.yml lines 33-57). No sparse checkout is set in the lines I read. `git ls-files` sees the full tree. The step is placed after the degradation-audit step with the same pattern.

**H.** `false` is correct. The result depends on every tracked file in the repository, including `.md`, `.json` and `.yaml`. The reference pattern lists only `libs/**/src/**/*.ts` and `apps/**/src/**/*.ts` as inputs, which is possible only because it counts only those files. A role-census input list would miss docs, skills and templates, so a cache hit could skip a real failure. Cost: about 13 s per run (measured).

**I.** `--json` returns exit 0 before the comparison (line 126). CI calls the check with no argument, so CI always compares. The risk exists only if someone adds `--json` to the CI command. Low. A baseline read error still throws before (exit 2).

**J.** Other points: (1) The ratchet counts a name inside a longer word (for example `my-team-leader-x`). This is stated as intended in the requirement, so I did not list it. (2) Excludes and `tools/role-census/**` hide any amount of text by design. (3) F4: `files` and `total` are written but not enforced. (4) tsconfig.json has `ignoreDeprecations: "6.0"`; I did not verify that this value is valid for the installed TypeScript (the ts-node run ignores it with `--transpile-only`).

## Commands run

- `git ls-files -s | awk 120000/160000` — exit 0, no symlink or submodule.
- `npx ts-node --transpile-only tools/role-census/check-role-census.ts` — exit 0 (all 7 buckets equal to baseline, TOTAL 2085/298).
- same with `--json` — exit 0.
- `node tools/role-census/run-self-test.js` — exit 0 (PASS).
- Fixture runs in a temporary folder outside the repository with `--fixture-dir` and `--baseline-path` (Latin-1 and NUL files, flag-as-value, `--update` raise, `--force-raise` alone, blank reason, `**` exclude) — exit codes as quoted in F1 to F8: 0, 0, 1, 2, 2, 0.
- `node /tmp/g.js` (copy of `matchesGlob` logic) — exit 0.
- `git diff -- .github/workflows/ci.yml`, `git config core.autocrlf` (true), read of `.gitattributes`, `nx.json` and `tools/degradation-audit/project.json`.

The real `baseline.json` was not changed.

## Not checked

- A run on Linux. No Linux host here. Answer C rests on code reading and `.gitattributes`.
- The full `ci.yml` job beyond lines 1-95 (for example a later sparse checkout in another step).
- `tsconfig.json` validity (`ignoreDeprecations`) with `tsc`; project rules forbid wide checks.
- The `README.md` and `__fixtures__/sample.md` content (not read in detail).

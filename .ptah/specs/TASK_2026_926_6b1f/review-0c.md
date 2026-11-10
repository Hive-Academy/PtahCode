## Verdict

APPROVE (two minor notes, no blocker).

## Findings

1. Low. `tools/ui-class-audit/project.json:22` (`lint`) and `:31` (`update-baseline`) use `npx ts-node`.
   `tools/degradation-audit/project.json:19` does the same, and the ci.yml "no npx" comment
   (`.github/workflows/ci.yml` ~lines 60-83) covers only the workflow `run:` lines, not the
   Nx target commands. So the new step is consistent with the existing step. `ts-node` is a local
   dependency, so `npx` does not install anything on demand. Fix (optional, separate task): call
   `node_modules/.bin/ts-node` in both tools. Do not block this change.
2. Low. The explicit step repeats `ui-class-audit:test` and `:lint`, which `nx affected -t test lint`
   can also run later. Both targets have `cache: true`, so the second run is a cache hit.
   The cost is small. No fix needed.
3. Info. The `lint` run I made in the worktree was a 100% cache hit (cache from the seeding run
   with the same inputs). It confirms the inputs match. It is not a fresh run, but the result is
   exit 0 with no failures.

## Checked and correct

1. Job and position. The new step is at `.github/workflows/ci.yml:89-99`, in job `checks`
   (line 33), the same job as `degradation-audit` (line 84). It is after checkout and
   `./.github/actions/setup-ci` (Node, install, Nx cache restore). It is not inside a conditional.
   YAML indentation matches the neighbor step (6 spaces for `- name`, 8 for `run`, block scalar).
   The `run:` uses `node_modules/.bin/nx`, not `npx`, as the `di-lint` and `degradation-audit`
   steps do.
2. `test` target (`tools/ui-class-audit/project.json:34-44`). `cwd` is `tools/ui-class-audit`,
   where `jest.config.ts` lives (preset `../../jest.preset.js`). Nx `run-commands` puts
   `node_modules/.bin` on PATH, so bare `jest` works on Linux. The `TS_NODE_COMPILER_OPTIONS`
   env value is plain JSON with no OS-specific syntax. `ts-jest` uses `<rootDir>/tsconfig.json`.
3. Baseline format. `writeBaseline` (`tools/ui-class-audit/check-ui-classes.ts` ~lines 455-470)
   sorts files and tokens with `localeCompare(…, 'en')`, drops zero counts, and writes
   `JSON.stringify(x, null, 2)` plus `\n`. I re-serialised the new `baseline.json` and it is
   byte-identical to the file. The file keys are sorted, the file ends with `}\n`.
4. Scope. Every key starts with `apps/ptah-extension-webview/` or `libs/frontend/`. No key has a
   backslash or a drive letter. No absolute path is present.
5. Diff summary. Files: 451 before, 452 after. 5 files gained entries, 4 files lost entries.
   Tokens: 5572 before, 5570 after (net -2). `git diff --stat`: ci.yml +12, baseline.json
   +88/-67. The re-seed pruned stale files and recorded the 44 per-file increases that were above
   the old baseline.
6. Spec independence. `tools/ui-class-audit/check-ui-classes.spec.ts` builds a temp repo
   (`makeTempRepo`, lines 33-35) with its own `baselinePath`. All baseline assertions use that
   temp file (lines 58-59, 369+). It does not read the committed `baseline.json`. The re-seed
   cannot break it.
7. Forks and OS matrix. The `checks` job `if:` (lines 49-52) depends on PR state and branch
   name only. The step needs no secrets and no write permission (`contents: read`). It runs the
   same way for a fork PR. It sits in a single `ubuntu-latest` job, not in the `git-real-git` OS
   matrix (line 338), so other runners do not run it. No other workflow references the project.
8. Honest limit. A ratchet that re-seeds up (44 increases) only locks in the current main state.
   This is the stated intent of the task and is not a defect of this change.

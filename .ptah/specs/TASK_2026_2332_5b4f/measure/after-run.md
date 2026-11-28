# Second probe run ("after")

State on 2026-11-27: not run. The new code is not live until the local build is installed.

## Build

- Installer: `dist/release/local-production/Ptah-Local-6c8364ce76c5-2.0.0.exe` in the task worktree
  (unsigned, build identity = commit `6c8364ce7`, built with `npm run electron:package:local-production`).
- Install steps and the mandatory backup: `docs/development/electron-local-production.md`.
  Close every Ptah host first. Do not install without the paired backup.

## Run (in a session of the installed build)

1. Confirm the build: the lane policy of a new lane must contain the sentence
   "For workspace file reads, searches and listings, call the matching Ptah tool first", and
   `ptah_inspect` must be in the tool list.
2. Start two lanes with the exact text of `../probe-prompt.md` as the task, working directory = the
   main checkout on the same commit as the baseline run (`6a99ab936`) or note the difference:
   - `cli: codex`, `model: gpt-6-luna`
   - `cli: antigravity`, `model: gemini-4-hydrogen-high`
   Give no tool hint in the task. Declare no deliverable.
3. Count each lane from the task folder:
   `node measure/count-lane-calls.mjs --agent <ptahAgentId> --session <cliSessionId> --vendor <codex|antigravity>`
4. Write the results to `measure/after.md` in the format of `baseline.md` and compare.

## Baseline (current production build, 2026-11-26)

| Lane | Total | Ptah | Native | Ptah share | Ptah errors | Substitutable native |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| codex / gpt-6-luna | 23 | 17 | 6 | 73.91% | 1 | 3 |
| antigravity / gemini-4-hydrogen-high | 49 | 7 | 42 | 14.29% | 0 | 33 |

## What to look for

- Antigravity: native file reads (24) and shell searches (6) must move to `ptah_read_symbol`,
  `ptah_grep` or `ptah_inspect`. This is the main test of the "Ptah tool first" lane rule.
- Both: the git questions (Q1, Q4) must use `ptah_inspect` git operations, not shell git.
- Both: total calls must not increase. One `ptah_inspect` call can replace several reads.
- Ptah errors must stay at 0 or 1; an alias key must not produce an error.
- One run for each model is a small sample. Run each probe two times if the result is near the
  baseline, and report the two values.

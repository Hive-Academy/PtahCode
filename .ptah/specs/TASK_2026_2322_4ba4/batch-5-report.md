# Batch 5 report — ACP profile wording (TASK_2026_2322_4ba4)

**Tasks completed**: Task 5.1 (reword the profile comments and spec titles). No behaviour change.

## Files modified

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\acp-runtime\src\lib\profiles\antigravity-acp-profile.ts`. I changed the three comments at `:11`, `:13-14` and `:135-136`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\acp-runtime\src\lib\profiles\antigravity-acp-profile.spec.ts`. I changed the two test titles at `:52` and `:77`.

## Changes (each comment now describes the behaviour itself)

| Location | Before | After |
| --- | --- | --- |
| profile `:11` | `--add-dir <workingDirectory>`, as the stream-json lane does | `--add-dir <workingDirectory>`, which adds it to the agy workspace |
| profile `:13-14` | hidden console, the same as the stream-json lane; agy's shell tool runs through a pty. | hidden console, because agy's shell tool runs through a pty. |
| profile `:135-136` | so they are refused, as the stream-json lane never granted them). | so their permission requests are refused). |
| spec `:52` | ...unattended by default and for yolo, as the stream-json lane does | ...unattended by default and for yolo |
| spec `:77` | ...to the workspace, as stream-json does (round 4) | ...to the workspace (round 4) |

## Acceptance evidence

- Running `grep -n -i "stream-json"` on both files returns no matches.
- `git diff -- libs/backend/acp-runtime` shows that only comment lines and `it(...)` title strings changed. The diff has 5 hunks' worth of lines, and no code tokens changed.

## Verification

- `npm run verify -- --related -p @ptah-extension/acp-runtime` passed (EXIT=0). Log: `.ptah/tmp/b5-related.log`. Tail:
  `NX 1 task: 1 succeeded` / `[verify] lock released after 65.0s, exit code 0`.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/acp-runtime` passed (EXIT=0). Log: `.ptah/tmp/b5-lint.log`. Tail:
  `NX 2 tasks: 2 succeeded` / `[verify] lock released after 14.0s, exit code 0`.
- The `--related` run used Nx's compact output, so its log does not name the specs that ran. To confirm the required spec runs, I ran `npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.spec.ts` separately. Log: `.ptah/tmp/b5-spec.log`. Result:
  `Test Suites: 1 passed, 1 total` / `Tests: 61 passed, 61 total`.

## Decisions

- Wording for `:11`: I used "which adds it to the agy workspace". This matches the existing spec title "adds the working directory to the workspace". I did not claim any extra capability. The change is reversible.

**Plan deviations**: none.
**Out-of-scope observations**: none. I did not create any git commits.

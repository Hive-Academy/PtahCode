# Chat shots code review — round 2

Review family: claude (implementer: codex)

Scope: the current `git diff origin/main` of
`apps/ptah-electron-e2e/src/docs-screenshots/chat.shot.ts`,
`apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-profile.ts` and
`apps/ptah-docs/SCREENSHOTS.md`, read against round 1 (`chat-shots-code-review.md`), the fix
report (`chat-shots-fix-report.md`), the unchanged `shooter.ts` and `docs-fixtures.ts`, and the
transcript readers. Line numbers are working-tree lines. No capture, e2e, build or verify run was
done. The modified `chat-model-selector.webp` was opened and examined: it shows no price text.

## Verdict

**APPROVED. Score: 8/10.**

All six High defects from round 1 are fixed. Each chat image is now masked and checked
immediately before its screenshot, and the saved-session images go to `public/screenshots/`
only after all six checks pass. The live test is disabled, and no test gets the real Claude
config. The DB copy fails loudly with named errors. The encoding is clean (no BOM, no mojibake,
the price class is `[\u00B7\u2022]`).

The score is not 9 because two Low gaps remain in the mask: the path pattern also matches URL
schemes, and the workspace name gets the label `sample-user`. Also, a small race between the
check and the shutter remains. The score is not 7 because no remaining gap can put private text
or prices into `public/screenshots/` without a loud failure.

## Earlier defects

| # | Sev. (r1) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | High | FIXED | `chat.shot.ts`, `SCREENSHOTS.md` and `docs-profile.ts` start with `69 6d 70` / `23 20 53` (no `EF BB BF`). No `â€` or `Â` in any file. Describe titles use `—` (`chat.shot.ts:70,121,152`). The price class is `[\u00B7\u2022]` (`:90`). |
| 2 | High | FIXED | `chat.shot.ts:82-83` asserts that the description count is greater than 0. `:95` asserts that `menu.innerText()` has no `$<digit>` before `shoot` (`:96`). Each different format now fails loudly. |
| 3 | High | FIXED | `chat.shot.ts:136-142` uses `tablist "Lanes"`, a non-Orchestrator tab, `ptah-canvas-lane-view ptah-subagent-lane` and `tool-rail`. This is the same path as the saved-session test (`:177-185`). Not run (the test is disabled). |
| 4 | High | FIXED | The live test stages only `chat-execution-tree` and `chat-overview` (`chat.shot.ts:144,147`), each through `stageShot` → `maskAndCheck`. `publishShots` follows (`:148`). |
| 5 | High | FIXED | `stageShot` (`chat.shot.ts:48-58`) calls `maskAndCheck` (`:52`) before the screenshot (`:53`) and writes into the run directory (`:55-56`). `sessions-tabs` uses it (`:206`). |
| 6 | High | FIXED (doc only, per coordinator) | `SCREENSHOTS.md:17` says that saved transcripts cannot replay, because the readers use `os.homedir()/.claude/projects`. This agrees with `jsonl-reader.service.ts:60` and `session-rpc.handlers.ts:2037`. It says that the harness does not set `CLAUDE_CONFIG_DIR`. This agrees with `docs-profile.ts:131-139` (no `CLAUDE_CONFIG_DIR`). See new defect 2 for one missing consequence. |
| 7 | Medium | FIXED | All six saved-session images are staged (`chat.shot.ts:192-212`). `publishShots` (`:65-68`, `:213`) copies them only after the last check. A failure leaves `public/screenshots/` unchanged. The run directory is `dirname(userData)` = `runDir/profile` (`main.ts:71` with `APPDATA` = `runDir/profile`), so the staged files stay in the temporary run directory and are removed at cleanup. |
| 8 | Medium | PARTIAL | Fixed: the mask uses escaped case-insensitive regexes (`chat.shot.ts:18,22`). The mask and check run in one helper after the settle, immediately before the shutter (`:49-53`). `input`/`textarea` values and `title` attributes are masked and checked (`:32-37`, `:40-43`). Open: the workspace-name label (new defect 3). `::before` content and images are not covered. A re-render between `maskAndCheck` and `crop.screenshot()` can still restore text (Low; Angular rewrites a text node only when its binding value changes). |
| 9 | Medium | FIXED | `chat.shot.ts:122-123` skips the live describe unconditionally with a D14 reason. `SCREENSHOTS.md:13,17` says that saved-session mode sends no prompt and that the live shot is disabled. The "read-only" claim is gone. |
| 10 | Medium | FIXED | `docs-profile.ts` no longer sets `CLAUDE_CONFIG_DIR` (`:131-139`). No test gets the real `~/.claude`. |
| 11 | Medium | PARTIAL (accepted residual) | `docs-profile.ts:81-112` takes size and mtime before the copy, checks the copied size, then checks size, mtime and sidecar presence again. A change during the copy fails with a named error. The schema mismatch is documented (`SCREENSHOTS.md:16`), not detected. An undetectable same-size, same-mtime change is documented (`:15`). `-shm` is still copied. This is harmless, because the first SQLite connection rebuilds the wal-index. |
| 12 | Low | FIXED | `docs-profile.ts:85` throws `[docs-shot] required development database is missing: <file>` with no home path. |
| 13 | Low | FIXED | `SCREENSHOTS.md:13` says that the images were not regenerated and may be stale. The rules are now a list (`:15-18`). |

## New defects

1. **Low — the path mask also matches URL schemes.** `chat.shot.ts:20`
   `/(?:[A-Z]:[\\/])[^\s<>"']*/gi` matches `s://github.com/...` in `https://github.com/...`,
   because `s:` is a letter and a colon. The mask writes `http[local path]` into the image,
   and the check (`:12`) then passes. Real saved sessions often contain URLs (PR links, docs
   links), so the images can show garbled text with no failure. This is not a privacy leak.
   **Fix:** use a lookbehind on both patterns: `(?<![A-Za-z0-9])[A-Z]:[\\/]` at `:12` and `:20`.

2. **Low — SCREENSHOTS.md does not state the result of defect 6.** `SCREENSHOTS.md:13`
   says that saved-session mode "attempts to refresh" six images. `:17` says that transcripts
   cannot replay. The doc does not say what follows: if the lane and its tool calls come
   from the JSONL transcripts, the test fails at `chat.shot.ts:189` for each candidate. A
   reader can spend a run to learn this. **Fix:** add one sentence to `:17`, for example "Thus
   the saved-session test is expected to fail at lane selection until a transcript source is
   available."

3. **Low — the workspace name gets the label `sample-user`.** `chat.shot.ts:10,22` puts the
   username and the workspace basename in one list with one replacement. With
   `PTAH_DOCS_SESSION_WORKSPACE=D:\projects\ptah-extension`, text such as
   `@ptah-extension/chat` becomes `@sample-user/chat`. Round 1 used `sample repository` for the
   workspace. The images are not private, but they are wrong. Also, the product name is masked
   in a product screenshot. **Fix:** give the workspace basename its own replacement
   (`sample-repo`). Alternatively, do not add the basename when it equals the product name.

## Decisions

- **Defect 6 is judged on the doc only.** The coordinator decided on a doc-only fix (no
  junction, no product change). The doc claim agrees with the three `os.homedir()` call sites.
  New defect 2 asks only for one more sentence. Reversible: yes.
- **APPROVED with three Low defects.** Options: APPROVED, or REVISE for the Lows. Evidence: no
  remaining path writes unmasked or unchecked text into `public/screenshots/`. Each Low gives
  a visible cosmetic error or a wasted run, not a leak. Per-asset inspection before commit
  (D8, D11) still applies. The coordinator can fix the Lows in the same commit or defer them.
  Reversible: yes.
- **Defect 11 residual is accepted.** The review's round 1 fix offered the documented
  alternative. A size-and-mtime check with a named error meets the D15 copy rules
  (file-only, `-dev` families only, no SQLite open on the originals). Reversible: yes.
- **Not run:** captures, e2e, `npm run verify` and Playwright targets, by the brief. The fix
  report records `npm run verify -- -p ptah-electron-e2e` exit 0 (lint and typecheck) and the
  screenshot reference check exit 0. This review did not run them again.

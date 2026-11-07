# Chat shots code review

Review family: claude (implementer: codex)

Scope: the working-tree diff (`git diff` against HEAD on `docs/docs-chat-shots`) of
`apps/ptah-electron-e2e/src/docs-screenshots/chat.shot.ts`,
`apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-profile.ts` and
`apps/ptah-docs/SCREENSHOTS.md`, read against D11–D15 in `decisions.md`, the unchanged harness
(`docs-fixtures.ts`, `docs-run-guard.ts`, `shooter.ts`) and the lane report
`batch5-live-chat-report.md`. No capture, e2e, build or verify target was run (per the brief).
Line numbers are working-tree lines.

## Verdict

**REVISE. Score: 4/10.**

The isolation core is sound. HOME/USERPROFILE stay temporary, the settings hash guard is
unchanged, the DB copy is file-only and limited to the two `-dev` families, and the live mode
is opt-in. But the diff has these problems:

- It corrupts the file encoding. This breaks the price mask's character class.
- The price mask can fail silently.
- The live test uses a selector that the lane report already shows is stale.
- The live test captures four images with no masking or privacy check.
- One saved-session image is written before its privacy check.
- The main premise of the saved-session mode (transcripts read through `CLAUDE_CONFIG_DIR`)
  is not true for the app's transcript readers. SCREENSHOTS.md states it as fact.

The score is higher than 3 because no defect writes the real `~/.ptah` or copies credentials.
It is lower than 5 because two paths can put private or price text into
`public/screenshots/` with no loud failure.

## Defects

1. **High — encoding corruption (BOM + cp1252 mojibake).**
   `chat.shot.ts:1` and `SCREENSHOTS.md:1` now start with a UTF-8 BOM (`EF BB BF`). HEAD had
   none. `chat.shot.ts:8`, `:56` and `:117`: the describe titles changed from `—` to `â€”` (bytes
   `C3 A2 E2 82 AC E2 80 9D`). This changes the test titles for any `--grep` on the old names.
   `chat.shot.ts:26`: the price regex class `[Â·â€¢]` is the set {`Â`, `·`, `â`, `€`, `¢`}.
   The intended `•` (U+2022) is **not** in the set, so a `•`-separated price is not removed.
   **Fix:** save both files as UTF-8 without a BOM. Restore `—`. Write the class as
   `[\u00B7\u2022]`.

2. **High — the price mask fails silently (D13).** `chat.shot.ts:20-30` rewrites text nodes
   and then calls `shoot` with no assertion. If an option has no `.text-base-content-muted`
   child (`continue` at `:23`), or the description format is different from
   `$x / $y per Mtok` (for example `$3/M`, `per MTok input`, a `•` separator from defect 1, or
   a price in a child element instead of a direct text node), the image is captured with the
   prices. The price text comes from `model.description`
   (`model-selector.component.ts:158-159`). No source in `libs/` contains `Mtok`, so the
   harness cannot pin the format.
   **Fix:** after the mask, assert `expect(await menu.innerText()).not.toMatch(/\$\s?\d/)`.
   Also assert that the description element count is greater than 0.

3. **High — stale selectors in the live test.** `chat.shot.ts:70-75` waits for
   `ptah-inline-agent-bubble`, `button[aria-expanded]` and `load-agent-output`. The lane report
   (`batch5-live-chat-report.md:17`) records that the authorized retry failed on
   `ptah-inline-agent-bubble` because the current UI shows the sub-agent as a lane tab. The
   saved-session test was moved to `tablist "Lanes"` / `ptah-subagent-lane`, but the live test
   was not. Each opt-in run spends a real AI prompt and then fails after the turn ends.
   **Fix:** use the lane-tab path from the saved-session test, or delete the live test (see
   defect 9).

4. **High — the live test captures four images with no masking or privacy check.**
   `chat.shot.ts:80-92` masks and checks once, before `chat-execution-tree` and
   `chat-overview`. After that, it writes `chat-cost-bar` (`:96`), `sessions-overview` (`:97`),
   `sessions-tabs` (`:98`) and `sessions-history` (`:102`) with no `hasPrivateText` check. The
   `sessions-history` dialog is a new DOM subtree that the earlier mask never saw. The live mask
   (`:85-86`) also does not mask emails or forward-slash paths. These four images are also
   outside D12, which approved only `chat-overview` and `chat-execution-tree`.
   **Fix:** remove the four extra shots from the live test, or mask and check before each one.

5. **High — `sessions-tabs` is written before its privacy check.** `chat.shot.ts:196-198`:
   `maskPrivateText()`, then `shoot(page, 'sessions-tabs', { crop: focused })`, then the
   `body` check that throws on private text. No check is done on `focused` before the
   shutter. If private text remains (for example a different-case username, see defect 8),
   the image is already in `apps/ptah-docs/public/screenshots/`. The lane report (`:50`) says
   that the current `sessions-tabs.webp` already shows a private project name.
   **Fix:** check `focused.innerText()` before the shot. In general, do the check
   immediately before each `shoot`.

6. **High — `CLAUDE_CONFIG_DIR` does not make the app read saved transcripts in place.**
   `docs-profile.ts:122-125` sets `CLAUDE_CONFIG_DIR`. The app's transcript readers ignore it:
   `jsonl-reader.service.ts:60` and `:427`, and `session-rpc.handlers.ts:2037`, use
   `path.join(os.homedir(), '.claude', 'projects')`. `os.homedir()` is the temporary home.
   Thus saved sessions open from `sessions-dev.sqlite` but find no JSONL transcripts. This
   agrees with the lane report (`:28`): the titles were not replayable. SCREENSHOTS.md
   ("existing Claude transcripts are read in place") states a behavior that the code does not
   have. The only changes that make it work touch user-reserved scope: a junction from the
   temporary home to the real `~/.claude`, or a product change so the readers honor
   `CLAUDE_CONFIG_DIR`. See Decisions.
   **Fix:** change the doc claim now. Send the junction-or-product-change choice to the
   coordinator.

7. **Medium — a partial run leaves a mixed set of images.** `shoot` (`shooter.ts:118-131`)
   writes directly into `public/screenshots/`. The saved-session test writes
   `chat-execution-tree` (`chat.shot.ts:180`), then `chat-overview`, `chat-cost-bar` and so
   on. A later privacy throw (`:187`, `:192`, `:199`, `:205`) leaves some new images and some
   stale images. SCREENSHOTS.md says the mode "fails without writing these images". That is
   true only for the lane-selection failure at `:163`.
   **Fix:** write the six images to `runDir` and move them into `SHOT_DIR` only after all six
   checks pass. Otherwise, narrow the doc sentence.

8. **Medium — gaps in the mask and check.**
   - The mask and the check can disagree on case. `maskPrivateText` (`chat.shot.ts:174-175`)
     uses case-sensitive `replaceAll(username)` and `replaceAll(project)`.
     `hasPrivateText` (`:114-115`) compares in lowercase. Text such as `Abdal` or
     `PTAH-EXTENSION` stays unmasked. The check then throws. This is a loud failure, not a
     leak, but with defect 5 the shot is already written.
   - With `PTAH_DOCS_SESSION_WORKSPACE=D:\projects\ptah-extension` (the value in the lane
     report, `:75`), the workspace name is the product name. The mask replaces every
     `ptah-extension` (for example `@ptah-extension/...`) with `sample repository`. The check
     rejects any text it did not replace.
   - Race: the check (`:179`) runs before `shoot`. `shoot` then injects a style, waits 400 ms
     and scrolls. Angular re-render, virtual scroll, lazy output or relative timestamps can
     restore the original text after the check. After the Orchestrator tab click (`:183`),
     `maskPrivateText` runs before the `expect`s that wait for the content to render. Content
     that renders later is not masked, and the check then throws (a flaky failure).
   - The TreeWalker and `innerText` cover only rendered text nodes. They do not cover
     `input`/`textarea` values (for example a restored composer draft), `title` tooltips,
     `::before` content or avatar images.

   **Fix:** use case-insensitive escaped regexes in the mask. Mask and check in one helper
   that runs after the settle, immediately before the screenshot. Alternatively, check after
   the screenshot and delete the file on failure. Also scan `input` and `textarea` values.

9. **Medium — the live mode conflicts with D14, and the doc overstates it.** D14 says "No
   more live prompts". The lane report (`:17`) says the one D12 retry was used. The live
   describe (`chat.shot.ts:56-107`) is still runnable, and SCREENSHOTS.md says "still runs one
   read-only prompt". Nothing makes the prompt read-only: only the prompt text asks
   "Do not edit files", and the lane report says the retry ran in default approval mode.
   **Fix:** delete the live describe, or keep it with an explicit "not authorized after D14"
   note. Remove "read-only" from the doc.

10. **Medium — `CLAUDE_CONFIG_DIR` leaks into every test of a live run.**
    `docs-profile.ts:123` keys on the process env, not on a fixture option. With
    `PTAH_DOCS_LIVE_AI=1`, all shots in the run (setup, skills, MCP or settings pages) get the
    real `~/.claude`. Real skill names, MCP servers and plugins can then appear in unrelated
    images. These images do not get the chat-only mask. With `CLAUDE_CONFIG_DIR` set, the CLI
    also uses `$CLAUDE_CONFIG_DIR/.claude.json` in the real `~/.claude`.
    **Fix:** add a `useRealClaudeConfig` fixture option. Set it only in the live and
    saved-session describes, and pass it to `prepareDocsProfile`.

11. **Medium — the DB copy is not a consistent snapshot, and a schema mismatch is not
    detected.** `docs-profile.ts:85-91` copies the main file, `-wal` and `-shm` one after
    the other with `copyFileSync`. The harness does not check that the dev app or another
    session is not writing at that time, so the copy can be torn. Copying a `-shm` is not
    necessary: SQLite rebuilds the wal-index from the WAL. A `-journal` (rollback mode) is not
    handled. The lane report (`:75`) shows the next failure: the copied schema was newer than
    the build (`PERSISTENCE_UNAVAILABLE`), and the test failed 3 minutes later on an unrelated
    click timeout.
    **Fix:** skip `-shm`. Copy `-wal` immediately after the main file and compare the sizes
    and mtimes again after the copy. Add a fast check for persistence health after launch,
    with a clear "dev DB schema is newer than this build" message.

12. **Low — raw ENOENT for a missing dev DB.** `docs-profile.ts:84`: `fs.lstatSync(source)`
    throws ENOENT with the real home path in the message, not a `[docs-shot]` error.
    **Fix:** check `fs.existsSync(source)` first and throw a named error.

13. **Low — SCREENSHOTS.md claims that do not match the result.** The diff deletes
    "Not produced by the harness" (`SCREENSHOTS.md:15-21` in HEAD). The lane report (`:38`)
    says that no saved-session image was regenerated and that the six current images are stale.
    Until a capture succeeds, the three `sessions-*` images are still not produced by the
    harness. The new paragraph (`SCREENSHOTS.md:15`) is one block of about 300 words that
    contains five separate rules.
    **Fix:** keep a short "not yet regenerated" note, and split the paragraph into a list.

## Checked and OK

- **Real `~/.ptah` not written by the harness.** `HOME_ENV_KEYS` are set to the temporary
  home (`docs-profile.ts:115`), and `assertChildHome` (`docs-fixtures.ts:82`) checks the child
  env. `copyDevelopmentDatabases` only reads `~/.ptah/state/*-dev.sqlite*` and writes into
  `runDir/state`.
- **The settings hash guard stays on.** `productionSettingsHash` is taken before launch
  (`docs-fixtures.ts:57`) and asserted after (`:89`). The global-setup and global-teardown
  baseline (`docs-run-guard.ts`) is unchanged. The diff adds no bypass.
- **DB copy scope (D15).** The file names are a literal union type
  (`'ptah-dev.sqlite' | 'sessions-dev.sqlite'`). The code copies only `''`, `-wal` and `-shm`.
  It uses `lstat().isFile()`, so it rejects symlinks and directories. No SQLite open is done on
  the originals. No production DB is read. The copy runs only when `devSessionWorkspace` is
  set.
- **`PTAH_SESSIONS_DB_PATH` is honored** (`session-store-db-path.ts:20-22`), and
  `PTAH_DB_PATH` too (`db-path.ts:54-55`).
- **No copy of `~/.claude`.** `CLAUDE_CONFIG_DIR` is only an env path. No credential file is
  copied.
- **Live AI is opt-in.** `test.skip(process.env['PTAH_DOCS_LIVE_AI'] !== '1', …)` at
  `chat.shot.ts:57`. A default run sends no prompt. Without the env, the profile does not set
  `CLAUDE_CONFIG_DIR` unless saved-session mode is selected.
- **Saved-session mode is opt-in** (`test.skip(!devSessionWorkspace, …)`). Lane selection
  fails loudly (`:163`) instead of the earlier silent `test.skip`.
- **The `privateNames` filter** (`name.length >= 3`) prevents an empty workspace basename from
  matching all text.
- **TypeScript strictness:** the diff has no `any`, `@ts-ignore` or `as unknown as`.
  `catch (error: unknown)` is not used in new code.

## Decisions

- **Severity of defect 6 (transcript path).** Options: a doc-only fix; a junction from the
  temporary home `.claude` to the real `~/.claude`; a product change so
  `jsonl-reader.service.ts` and `session-rpc.handlers.ts` honor `CLAUDE_CONFIG_DIR`. Evidence:
  the three `os.homedir()` call sites, and lane report `:28`. A junction gives the app write
  access to the real `~/.claude` through the temporary home. A product change is outside this
  docs task. Both are user-reserved, so this review recommends a doc fix now and sends the
  choice to the coordinator. Reversible: yes.
- **Defect 1 is High, not Low.** The mojibake changes runtime behavior (the regex class), not
  only the look of the text. Evidence: byte dump of `chat.shot.ts:26`. Reversible: yes.
- **Defects 4 and 5 are High, not Critical.** Each image still needs the per-asset privacy
  inspection before commit (D8, D11). Thus the defects put private text in the publish
  directory but do not publish it. Reversible: yes.
- **Not run:** captures, e2e, `npm run verify` and Playwright targets, by the brief. Runtime
  claims (for example the `Session statistics` region in the canvas view, and the price
  format) come only from source reads and the lane report.

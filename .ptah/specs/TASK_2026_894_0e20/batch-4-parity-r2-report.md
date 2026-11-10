# Summary

Created `cli-orchestration-matrix.writes.spec.ts` with 24 card-era cases covering all 24 specified old cases, with the approved system CLI Test replacement. The last measured Jest run had 20 passing and 4 failing; all four failures were install guide tests whose selector clicked Close instead of Re-detect. That selector was corrected after the third allowed run, so its result is unverified.

# Coverage table

| Old test title | Migrated / obsolete | New test name or design rule |
|---|---|---|
| closes the guide and focuses the row once the CLI is found | migrated | same title; card checkbox focus |
| says the CLI is still missing when detection does not find it | migrated | same title |
| says detection failed when the re-read fails | migrated | same title |
| decides on its own detection result, not the shared section an overlapping re-detect replaced | migrated | same title |
| has install copy for every system CLI, Codex and Copilot as before (#77) | migrated | same title; card guide |
| saves a lane default and Undo restores the previous row | migrated | same title |
| resets a saved default with a null row and Undo restores it | migrated | same title; More default actions popover |
| keeps the prior selection when a write is rejected | migrated | same title |
| switches a system CLI off through disabledClis, with Undo | migrated | same title |
| switches a system CLI on by removing it from disabledClis | migrated | same title |
| switches an instance through ptahCli:update.enabled, with Undo | migrated | same title |
| keeps the checkbox on the saved value until the read-back moves it | migrated | same title |
| disables uninstalled toggles, and every toggle while a save runs or the scopes are not loaded | migrated | same title |
| deletes an instance after the inline confirm, with no Undo | migrated | same title |
| cancels a delete without writing; focus moves to the confirm, then back to More | migrated | same title |
| M2: a refused delete keeps the confirm even when commit() still says an earlier save landed | migrated | same title |
| Minor 4: Undo of a system on/off restores only that CLI, against the list as it is at Undo time | migrated | same title |
| tests the instance, announces the latency in the toast, and keeps it as the card last test | migrated | same title |
| M1: a failure is a fixed sentence, followed only by the state's own fixed reason | migrated | same title |
| S1: a failed or timed-out run never reports the earlier pass | migrated | same title |
| says when the test itself could not run | migrated | same title |
| M4 / Minor 2: a create runs the new instance's Test; from the empty-state button focus moves to its first action | migrated | same title |
| re-check N-1: a create the refreshed list does not hold runs no Test and says so in a fixed toast | migrated | same title |
| renders no Test for system CLIs (D11) | obsolete | `design-spec.md` lines 21–23 require a test status line and Test footer on every card; replaced by "renders Test for installed system CLIs (design-spec.md section 3.5)" |

# Missing behavior

No production behavior gap was confirmed. The four last-run failures were test interaction errors in the install guide cases: `button:last-child` matched the header's Close button. The new spec now clicks the button named Re-detect. This correction was not rerun because the three-run limit was reached.

# Verification

- First shell attempt: `npm run verify -- -t test -p chat -- --testPathPatterns=cli-orchestration-matrix.writes | tail -60` — PowerShell has no `tail`; npm did not start.
- Run 1: `npm run verify -- -t test -p chat -- --testPathPatterns=cli-orchestration-matrix.writes 2>&1 | Select-Object -Last 60` — 1 passed, 23 failed due to a copied closing brace that placed tests outside the parent describe. Corrected.
- Run 2: same command — 20 passed, 4 failed in install guide Re-detect.
- Run 3: same command — 20 passed, 4 failed in install guide Re-detect. Tailed result: `NX 1 task: 0 succeeded, 1 failed`; full Jest log: `Tests: 4 failed, 20 passed, 24 total`. The four failures were the Close/Re-detect selector error corrected afterward.
- `ptah_ast_analyze`: parseStatus ok, zero parse errors on the final spec.
- `ptah_get_diagnostics`: TypeScript compiler unavailable after 45s, file unchecked.
- Chat lint was not run because the test run budget was exhausted.

## Decisions

- **System CLI Test:** replace the old absence assertion with a presence assertion. Options were retaining D11 or following the approved card design. `design-spec.md` lines 21–23 specify test status and Test on every card, and `cli-provider-card.component.ts` renders the button. Reversible.
- **Popover interaction:** click Re-detect by its visible label. Options were positional CSS selectors or label selection; the popover has Close before Re-detect, making positional selection ambiguous. Reversible.

## Not done

A fourth Jest run and chat lint were omitted under the verification limit. Final selector correction and TypeScript diagnostics remain unverified. No production file was edited. Skill discovery/loading was unavailable in this host tool catalogue.


# Chat shots fix report

## Fixes

| Defect | File:line | Status |
| --- | --- | --- |
| 1. BOM and mojibake | `chat.shot.ts:69,89`; `SCREENSHOTS.md:1` | Fixed; UTF-8 without BOM, em dashes restored, price class uses Unicode escapes. |
| 2. Silent price mask | `chat.shot.ts:83,95` | Fixed; descriptions must exist and no dollar price may remain. |
| 3. Stale live selector | `chat.shot.ts:137-142` | Fixed; lane tab and `ptah-subagent-lane`, verified in `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane.component.ts:47`. |
| 4. Live capture scope/privacy | `chat.shot.ts:144-148` | Fixed; only two D12 images, each staged after masking and checking. |
| 5. Premature sessions-tabs write | `chat.shot.ts:48-56,206` | Fixed; check precedes staged screenshot, publish follows all six checks. |
| 6. False transcript claim | `SCREENSHOTS.md:17`; `docs-profile.ts:138-139` | Fixed in docs; no junction or product change. |
| 7. Mixed new/stale saved images | `chat.shot.ts:193-213` | Fixed for capture and privacy failures; publish follows all six checks. |
| 8. Mask/check gaps | `chat.shot.ts:11-55` | Fixed case rule, rendered text, fields, titles, and post-settle check immediately before screenshot. |
| 9. D14 live conflict | `chat.shot.ts:123`; `SCREENSHOTS.md:17` | Fixed; live test disabled regardless of environment. |
| 10. Global Claude config | `docs-profile.ts:138-139` | Fixed; no test gets the real Claude config. |
| 11. DB snapshot/schema | `docs-profile.ts:85-109`; `SCREENSHOTS.md:15-16` | Fixed with main/WAL/SHM size and mtime validation; schema mismatch documented. |
| 12. Raw missing DB error | `docs-profile.ts:85` | Fixed; named error. |
| 13. Screenshot claims | `SCREENSHOTS.md:13-18` | Fixed; stale image note and separate rules. |

## Not fixed

- Saved-session transcript replay remains unavailable under the temporary home. The required doc-only decision excludes a junction and product changes.
- D14 prohibits a live prompt, so the live flow was not exercised. No capture, Playwright target, build, serve, dev, or package command was run.
- The DB check cannot guarantee a transactionally consistent snapshot if bytes change without size or mtime changes. A schema mismatch is documented rather than detected at startup.
- The allowed file list excludes `docs-fixtures.ts`; the disabled live test does not receive real Claude login. A future authorized live run would need a per-test fixture option before enabling it.

## Verification

- `ptah_get_diagnostics` scoped to `chat.shot.ts` and `docs-profile.ts`: 0 errors, 0 warnings.
- `npm run verify -- -p ptah-electron-e2e | Select-Object -Last 20`: exit 0; exactly one named project, `ptah-electron-e2e`; lint and typecheck 2/2 succeeded, test target absent (0 tasks).
- `node apps/ptah-docs/scripts/check-screenshot-refs.mjs`: exit 0; 29 references resolve.
- `head -c3 <file> | od -An -tx1` via Git tools: `chat.shot.ts` = `69 6d 70`, `SCREENSHOTS.md` = `23 20 53`; neither is `ef bb bf`.
- `grep -c 'â€\|Â' <file>` via Git tools: 0 for each; grep exit 1 means no matches.

## Decisions

- D14: keep the repaired live flow disabled, since the user explicitly prohibited more live prompts. Reversible: yes.
- Defect 6: document that `os.homedir()/.claude/projects` under the temp home prevents replay. Do not add a junction or change product code. Reversible: yes.
- Defect 11 schema mismatch: document the known `PERSISTENCE_UNAVAILABLE` risk instead of probing persistence after launch; this is one of the review's permitted options and stays within the allowed files. Reversible: yes.
- D15: copy each DB family with present WAL/SHM members; fail on missing source, incomplete copy, or detectable source changes. Reversible: yes.
- Skill discovery: no skill catalogue or skill-loading tool was listed in this lane; no skill instructions were loaded.

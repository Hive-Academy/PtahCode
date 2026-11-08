## Gap 1 fix

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-handoff-files.ts:121` adds `SubagentHandoffFiles.redactNotes`. It reads the agent-written notes, applies the monitor's credential redactor, and rewrites changed text after a successful stop. It skips non-regular files and reports I/O failures without logging notes content.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:1338` awaits that scrub before delivering the handoff to the parent. Ptah's canonical record and parent message carry the notes path, not a copy of its contents; both continue to pass through `redactBudgetSecrets`.
- `subagent-budget-monitor.spec.ts:2068` covers a fake credential written to the notes file and checks it is removed before parent delivery.

## Gap 2 fix

- `subagent-budget-monitor.ts:265` requires a plausible credential token after Bearer/Basic outside an explicit Basic authorization header, redacts URL passwords through the first `@`, and classifies strong and weak credential names separately. This preserves ordinary prose such as `Basic usage`, `primary key: id`, `monkey: x`, `the key insight`, `password reset flow`, and `Bearer of bad news`.
- `subagent-budget-monitor.spec.ts:345` adds the normal-sentence cases. All existing fake credential cases remain covered.

## Tests

- The focused `subagent-budget-monitor.spec.ts` suite passed after the final source edit. No FAILED suite in this run.

## Verification

- `npm run verify -- -t test -p agent-sdk -- --testPathPatterns=subagent-budget-monitor.spec.ts` — PASS, 1 task succeeded; final rerun exit 0.
- `npm run verify -- -t lint,typecheck -p shared,agent-sdk,rpc-handlers` — PASS after the final edit, 6 tasks succeeded (2 cached), exit 0.
- `ptah_get_diagnostics` on the three changed TypeScript files returned unavailable after its 45-second limit. The scoped `verify` typecheck passed.
- FAILED suites: none observed.

## Remaining limits

- An agent can write a secret into its workspace notes while it runs. Ptah sanitizes the notes only after a successful budget stop. If the stop fails, the file changes later, or I/O prevents the scrub, the original content may remain. The scrub cannot prevent a separate agent or user reading the file before that point.

## Live check needed

- In a scratch workspace with Haiku, ask a subagent to write a fake `API_KEY` marker assembled from parts into its 85% notes file, then run until the budget stop. Confirm the notes file contains `[redacted]`, the canonical `.handoff.md` and parent turn contain no marker value, and a fresh subagent can follow the notes path.

## Decisions

- Sanitize after `stopSubagent` succeeds and before parent delivery. The alternative was sanitizing while the agent could still write; the stop boundary reduces overwrites during the read/write. Reversible.

## Round 1 fixes

- `subagent-budget-monitor.ts`: `credentialNameStrength` and `redactedAssignment` classify strong credential fields separately from weak bare `key`/`token`. `redactBudgetSecrets` now covers punctuation after Bearer/Basic values, letters-only values on strong fields, camelCase and quoted JSON fields, and URL passwords containing `/`. Identifier matching starts at a fixed delimiter so a long `a-a-a-...` line does not trigger repeated suffix scans. Security takes precedence for ambiguous URL userinfo such as a numeric password followed by `/`.
- `subagent-handoff-files.ts`: `redactNotes` rejects non-regular files with a content-free warning, skips notes over 1 MiB, checks whether the file changed while it was read, and replaces changed content through a same-directory temporary file and rename. A failed stop leaves the agent running and does not scrub its notes; the parent handoff is not delivered on that path.
- `subagent-budget-monitor.spec.ts` adds auth punctuation, letters-only password, camelCase field, slash-bearing URL password, Basic prose, unrelated numeric prose, and a long delimiter-chain regression. The notes regression asserts the file's content on disk; it no longer treats absence from the path-only parent turn as proof of redaction. `subagent-handoff-files.spec.ts` covers atomic replacement, symlink refusal, and oversized notes with fake fixtures assembled from parts.
- Verification: `npm run verify -- -t lint,typecheck,test -p agent-sdk` ran on the final source. Lint and typecheck passed (2/2 tasks); tests had 223 passed suites, 2 skipped, and 2 failed. The only final FAILED suites were `plugin-loader.service.session-notice.spec.ts` and `plugin-loader.service.capabilities.spec.ts`, both pre-existing Windows symlink failures documented in the task instructions. All changed suites passed. Final command exit code was 1 because of those two suites. `ptah_get_diagnostics` on all five changed TypeScript files and their project siblings reported 0 errors and 0 warnings.
- An earlier combined run found the same two plugin-loader failures plus `subagent-handoff-files.spec.ts` (Windows symlink guard) and `subagent-budget-monitor.spec.ts` (Basic header and notes marker); those task-specific failures were fixed and passed in the final run. Its lint failed on one unnecessary regex escape, also fixed before the final run. Two queued attempts were cancelled before acquiring a slot to incorporate source corrections; no suite ran in those attempts.
- `session-query-executor.service.spec.ts:60` adds `redactNotes` to the no-workspace handoff-files fixture required by the updated port.

## Round 2 fixes

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:226` changes `credentialNameStrength` to require the final separated name segment to be a credential word. It keeps strong camelCase credential names but no longer treats `sortKey` as a secret field. The former `SERVICE_TOKEN_VALUE` fixture is now a preservation case under the final-segment rule; `SERVICE_TOKEN` remains a credential case.
- `subagent-budget-monitor.ts:267` adds `redactCliFlags` for `--password=`, `--token=`, `--secret=`, `--api-key` with a space or `=`, and `-p` with a space. It reads the flag from its leading dash, so assignment matching stays anchored to full names such as `max-tokens`.
- `subagent-budget-monitor.ts:275` adds `redactMarkdownLabels` for bold and italic credential labels with a colon inside or outside the formatting markers. `redactBudgetSecrets` applies both helpers before ordinary assignment redaction.
- `subagent-budget-monitor.spec.ts:345` adds exact-output cases for each CLI flag form, `**Password:**`, `*Token*:`, `__Secret__:`, and a six-digit password. Preservation cases cover `token-budget`, `token_count`, `key_count`, `password_reset_url`, `max-tokens`, `SERVICE_TOKEN_VALUE`, and `sortKey`. New credential-like fixtures use the `fake(...)` parts helper.
- Verification: `npm run verify -- -t lint,typecheck,test -p agent-sdk` ran once after these edits. Lint and typecheck passed (2/2 tasks). The test target reported 223 passed suites, 2 skipped, 2 failed; 5,569 tests passed, 5 skipped, 2 failed. The only FAILED suites were `plugin-loader.service.session-notice.spec.ts` and `plugin-loader.service.capabilities.spec.ts`, both with Windows `EPERM` on symlink creation. The redaction suite passed. The combined command exited 1 because of those two known suites. Scoped `ptah_get_diagnostics` remained unavailable after its 45-second timeout; the verifier's typecheck passed.

## Round 3 fixes

- `subagent-budget-monitor.ts`: `redactMarkdownLabels` now matches only fixed credential label words and requires a boundary before a Markdown marker. The regex cannot rescan the long identifier or underscore runs that caused R2-1. `redactCliFlags` now recognizes long flags only, including `--pass`, `--access-token`, `--auth-token`, `--refresh-token`, `--client-secret`, `--api-token`, and `--private-key`, with either `=` or a space. It leaves ordinary `-p` flags alone.
- `subagent-budget-monitor.ts`: `credentialNameStrength` recognizes uppercase env-style names whose penultimate segment is KEY, SECRET, TOKEN, or PASSWORD and whose final segment is BASE, VALUE, or PROD. It also recognizes `accessKey`; existing `secretKey` and `privateKey` support remains. `token-budget`, `max-tokens`, and `token_count` remain prose.
- `subagent-budget-monitor.spec.ts`: exact-output cases cover the compound long flags in both forms, `--pass`, `SECRET_KEY_BASE`, `SERVICE_TOKEN_VALUE`, and the camelCase key names. Preservation cases cover `mkdir -p src/lib`, `ls -p dir`, and `npm -p pkg`. A 1 MiB base64url-like line with many underscores must be processed in under one second; that case passed. New credential-like fixtures are assembled with `fake(...)`.
- Verification command: `npm run verify -- -t lint,typecheck,test -p agent-sdk`. Lint and typecheck passed (2/2 tasks). Tests: 222 suites passed, 2 skipped, 3 FAILED; 5,582 tests passed, 5 skipped, 3 failed. FAILED suites: `plugin-loader.service.session-notice.spec.ts` and `plugin-loader.service.capabilities.spec.ts` (known Windows symlink `EPERM`), plus `sdk-model-service.spec.ts` (`does not let one auth identity answer for another` exceeded the five second Jest timeout). The redaction suite passed. Combined command exit code: 1. Scoped `ptah_get_diagnostics` was unavailable after its 45-second timeout; the verifier's typecheck passed.

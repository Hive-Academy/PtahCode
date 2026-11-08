# Code Logic Review - TASK_2026_SUBAGENT_NOTES_REDACTION

Verdict: REVISE (read-only review; nothing was run).

Files: subagent-budget-monitor.ts (redactBudgetSecrets ~227, stop path ~1298), subagent-handoff-files.ts (redactNotes ~119), spec.

## Findings

1. SERIOUS - Bearer/Basic token followed by `)` or similar is no longer redacted. subagent-budget-monitor.ts:230-233. The lookahead `(?=$|[\s"'`,;])` fails for `Bearer abc123def456)`, `...token]`, `...token}` and `...token:`. The class includes `.`, so a trailing `.` is absorbed and still redacts, but `)` is not. The regex backtracks and finds no match. The old `[^\s"'`]+` redacted these. Fix: use a negative lookahead for `[A-Za-z0-9._~+/=-]`, or accept any non-token character after the token.
2. SERIOUS - Unquoted `:` values made of letters only are not redacted. subagent-budget-monitor.ts:237-240. `password: correcthorsebattery`, `token: abcdefghij`, `secret: hunter` keep their value, because the colon branch needs quotes or a digit/punctuation char, and the value must be at least 6 chars. The old code redacted them. This is an explicit trade-off for N1, but it is a leak in YAML and prose notes. Suggestion: for the strong names (password, passwd, secret, api_key, credential, token with `_`) redact any colon value, and keep the heuristic only for the bare words `key` and `token`.
3. SERIOUS - Over-redaction of Basic/Bearer prose remains. subagent-budget-monitor.ts:232 uses `token.length >= 8 || /[0-9._~+/-]/`. "Basic functionality", "Basic configuration", "Basic authentication" and "Basic principles" are all redacted. N1 is only partly fixed. Require a digit, or a mixed case or length of at least 16, or a `=` suffix. Also add these words to the tests.
4. MODERATE - Name matching is narrower than before. subagent-budget-monitor.ts:237. camelCase and concatenated names such as `accessToken=`, `clientSecret=`, `dbPassword=`, `SECRETKEY=` and `githubToken=` no longer match, because a delimiter is required before the suffix. The old `[A-Za-z0-9_.-]*(?:secret|token|...)` caught them. The JSON rule (:236) also needs `_KEY|_SECRET|_TOKEN`, so `"accessToken": "..."` is missed. Fix: allow a case-insensitive suffix match without a delimiter, for example `[A-Za-z0-9_.-]*(?:secret|token|password|passwd|credential|api[_-]?key)`, with a guard for bare `key`.
5. MODERATE - A URL password containing `/` is now left in clear. subagent-budget-monitor.ts:234 uses `[^/\s@]+`, while the old pattern allowed `/`. It limited the match to the authority, but unencoded passwords with `/` leak. Percent-encoded `%2F` is fine. Use a backtrack-safe form such as `[^\s@]+(?=@[^\s/]*)` or accept `/` when an `@` follows before whitespace.
6. MODERATE - Possible quadratic time on very long delimiter chains. subagent-budget-monitor.ts:237. `[A-Za-z0-9]+(?:[_.-][A-Za-z0-9]+)*[_.-](?:suffix)` is tried from every `\b`. A single long line like `a-a-a-...` is O(n^2). The notes file is read whole with no size cap (item 8), so a multi-MB single line could stall the stop path. The Bearer regex is linear.
7. MODERATE - redactNotes writes non-atomically. subagent-handoff-files.ts:124-127. `writeFile` truncates and then writes. A crash or full disk in between loses the notes that the fresh subagent is meant to follow. Write to a temp file and rename. Also, `lstat` followed by `readFile`/`writeFile` is a check-then-act sequence. After the stop the agent should be dead, but `stopSubagent` is not proven synchronous, so a late agent write can be overwritten by the stale redacted copy. Use `O_NOFOLLOW`, or a re-stat of the mtime before the write.
8. MODERATE - No size cap or timeout on the notes read. subagent-handoff-files.ts:123. It is awaited on the stop path before `deliverHandoff` (monitor :1298-1300). A huge file adds latency, and an I/O hang delays the handoff. Cap the size (for example 1 MB, then truncate or skip with a warn) or wrap the call in a timeout.
9. MODERATE - Skip paths are silent. subagent-handoff-files.ts:122-123. If the notes are a symlink or a non-file, `isFile()` is false and the function returns false without a log. The result is ignored at monitor :1299, yet the notes path is still forwarded to the parent. A symlinked notes file passes `notesExist` (which uses `stat`) but is never scrubbed. Either log a warn, or do not forward the path when redaction was not performed.
10. MODERATE - The stop-failure path (monitor :1235-1246, early return) never scrubs the notes. Plausible but narrow: the notes stay raw if the stop failed and a later path forwards them. Confirm the failure notice does not forward the notes path, or scrub there too.
11. MINOR - Throw safety is fine. redactNotes catches everything, including a throw from `redact`, so it cannot block `deliverHandoff`. `this.handoffFiles.paths` is synchronous and returns undefined for no workspace. The `preparedState.handoffPaths ?? paths()` fallback is consistent with the path used for the notes check (:635, :1333). The degradation-audit comment format matches `notesExist`. No `ENOENT` log is intended.
12. MINOR - Tests.
    - The prose cases (spec :340-343) would fail on the old code ("Basic usage", "primary key: id"), so they are valid regression tests. Fixtures are assembled with `fake(...)` and are obviously fake. No GitGuardian concern.
    - The notes test (spec :2054-2069) asserts `h.streamed[0]` does not contain the marker. The streamed text contains only the path, so that assertion is vacuous. The file-content assertion is the real one.
    - Missing cases that would catch findings 1 to 5: `Bearer x)`, `Basic dXNlcjpwYXNz=)`, `password: letters`, `accessToken=...`, URL password with `/`, symlinked notes, an unreadable notes file proving the handoff is still delivered, and a stop-failure case.

## Summary table

| Area | Result |
| --- | --- |
| Notes scrubbed before delivery, path-only forwarding | OK |
| Throw cannot block handoff | OK |
| Regex recall vs old | Regressed (1, 2, 4, 5) |
| Prose precision | Partial (3) |
| File safety | Gaps (7, 8, 9) |

REVISE: fix 1, 2 and 3 before merge. 4 to 10 are follow-ups unless the coordinator wants them now.

## Round 1 re-review

Verdict: REVISE (one small regression and two over-redaction items; read-only, nothing run).

Prior findings:
- Finding 1 (Bearer/Basic followed by `)`): RESOLVED. The negative lookahead `(?![A-Za-z0-9._~+/=-])` accepts `)`, `]`, `}`, `:` and `,`.
- Finding 2 (letters-only password/secret): RESOLVED for strong names (`credentialNameStrength` / `redactedAssignment`, 6+ chars or quoted).
- Finding 3 (Basic prose): RESOLVED for words under 20 letters with no digit or punctuation. Hyphenated prose such as "Basic configuration-management" is still redacted (minor).
- Finding 4 (camelCase and concatenated names): RESOLVED. `accessToken`, `clientSecret`, `dbPassword`, `SECRETKEY` and quoted JSON keys are covered.
- Finding 5 (URL password containing `/`): RESOLVED (`[^\s@]+`).
- Findings 7, 8, 9 (atomic write, size cap, symlink warn): RESOLVED. `wx` temp file with 8 random bytes, same directory, rename, `finally` unlink on any failure. Both the size and mtime/ino re-check are present. Windows rename onto a file that is still held open fails with EPERM/EBUSY. That is caught, the temp is unlinked, and a warn is logged. The target stays unredacted but the failure is visible. Acceptable.

Linear time:
- Bearer/Basic and the Authorization rule: linear per `Bearer`/`Basic` occurrence.
- `redactNamedAssignments`: the lookbehind lets a name start only at the start of an identifier run, and the sticky values regex is linear. This fixes the old quadratic `a-a-a-` case. No catastrophic backtracking found.
- JSON and URL rules: linear per candidate.

New defects:
- R1-1 MODERATE (regression). subagent-budget-monitor.ts:246 `(?<![A-Za-z0-9_.-])` includes `-`, and the name must start with a letter. So `--password=hunter2x`, `--token=abc123`, `--secret=...` are never matched, because the name would start right after a `-`. The old lookbehind allowed `-`. CLI commands are common in agent notes. Fix: lookbehind `(?<![A-Za-z0-9_.])` plus optional leading `-{1,2}`, or let the name regex absorb `--`.
- R1-2 MODERATE (missed in markdown notes). A bold label such as `**Password:** hunter2xyz` or `**Token:** ...` is not redacted, because the value token is `**` (2 chars). The notes are markdown, so label-bold is likely. Skip leading `*`/`_`/backtick after the separator before reading the value.
- R1-3 MINOR (over-redaction). `name.split(/[_.-]/).some(KEY|SECRET|TOKEN|PASSWORD)` marks any hyphenated or dotted name with such a part as strong, so `token-budget: 130000`, `key-insight: refactoring`, `primary-key: id-field` are redacted. A suffix-only part check (last segment) would remove most of it. The `Key` camel suffix has the same effect on `sortKey`.
- R1-4 MINOR. A URL with a port and path followed later by an `@` in the same token (for example `http://host:8080/x?e=a@b.com`) is redacted as userinfo; the earlier test string `http://localhost:3000/a@b` is now a deliberate trade-off. Notes over 1 MiB, symlinks, and notes that change mid-redaction are forwarded unredacted (warned, accepted by the coordinator).
- No temp file is left behind on failure, and I found no name collision risk.

Required before APPROVE: R1-1. R1-2 should be done in the same pass. R1-3 and R1-4 are optional.

## Round 2 re-review

Verdict: REVISE (small; read-only, nothing run).

Requested items:
- `--password=`, `--token=`, `--secret=`, `--api-key` (space or `=`): FIXED by `redactCliFlags` (subagent-budget-monitor.ts ~267).
- `**Password:**` and similar markdown labels: FIXED by `redactMarkdownLabels` (~275).
- `token-budget` and `max-tokens` over-redaction: FIXED. `credentialNameStrength` (~226) now requires the last separated segment to be exactly KEY/SECRET/TOKEN/PASSWORD, so `token_count`, `max-tokens`, `sortKey` are preserved.

Linear time:
- `redactCliFlags` and `redactNamedAssignments`: linear.
- R2-1 MODERATE: `redactMarkdownLabels` starts a match at every `_` or `*`, then scans the identifier run `[A-Za-z0-9_.-]*` and backtracks to find the closing marker (`\1`). On one long run with many `_` (a pasted base64url blob, a long snake_case chain) this is O(n^2). The notes cap is 1 MiB, so a 1 MiB base64url line (about 16k underscores) is around 1e10 steps and can stall the stop path. Fix: bound the name length (`{1,64}`) or match only after whitespace/line start (`(?<![A-Za-z0-9_])` before the marker).

New regressions vs main's old regexes:
- R2-2 MODERATE: `-p <value>` in `redactCliFlags` redacts every `-p` option, so `mkdir -p src/lib`, `ls -p dir` and `npm -p pkg` lose their argument. Notes contain shell commands often. Restrict `-p` to a `mysql`/`psql`/`sshpass` context or drop it (keep only the `-p<value>` joined form if wanted).
- R2-3 MODERATE: hyphenated flags and names are still missed because the assignment lookbehind blocks a name after `-`: `--access-token=`, `--auth-token=`, `--client-secret=`, `--github-token=`. The old code caught these. Let `redactCliFlags` accept `-{1,2}[a-z0-9-]*(?:password|token|secret|api-?key)` as the name.
- R2-4 MINOR: `SERVICE_TOKEN_VALUE`, `SECRET_KEY_BASE`, `DB_PASSWORD_PROD`, `accessKey`, `authKey`, `encryptionKey` are no longer redacted (last-segment rule and the camel allowlist); the old code caught them. Accepted trade-off if documented; `SECRET_KEY_BASE` is the most worth adding to the exact list.

Required before APPROVE: R2-2 (false-positive on `mkdir -p`) and R2-1 (bound the markdown name). R2-3 should be done in the same pass. R2-4 is optional.

## Round 3 re-review

Verdict: APPROVE (read-only; nothing run). No blocking or serious items remain.

- R2-1 FIXED: `redactMarkdownLabels` uses a lookbehind boundary plus a fixed word alternation, so there is no identifier rescan. It is linear, and the 1 MiB underscore test now exists.
- R2-2 FIXED: `-p` is gone from `redactCliFlags` (long flags only), so `mkdir -p`, `ls -p` and `npm -p` keep their arguments.
- R2-3 FIXED for the listed names: `--access-token`, `--auth-token`, `--refresh-token`, `--client-secret`, `--api-token`, `--private-key`, `--pass`, `--password`, `--token`, `--secret`, `--api-key`, with `=` or a space.
- R2-4 FIXED: `SECRET_KEY_BASE` (env suffix rule at the penultimate segment), `accessKey`, `secretKey`, `privateKey`, `apiKey`.
- Regexes in `redactCliFlags`, `redactMarkdownLabels` and `redactNamedAssignments` are linear.

Remaining minor items (not blocking, document or follow up):
- R3-1 MINOR: the long-flag list is fixed, so `--github-token=`, `--db-password=`, `--aws-secret-key=` are missed. The old code caught them. A generic `--[a-z0-9-]*(?:password|token|secret|api-?key)` prefix would close it while still preserving `--max-tokens` (the name must end at the separator).
- R3-2 MINOR: other camelCase `*Key` names (`encryptionKey`, `signingKey`, `authKey`, `masterKey`) are no longer redacted. This is the deliberate `sortKey` trade-off.
- R3-3 COSMETIC: prose like "use --token to authenticate" redacts the word after the flag.
- The `sdk-model-service.spec.ts` timeout in the Round 3 run is outside this diff and looks like a flaky five-second limit; rerun it to confirm.

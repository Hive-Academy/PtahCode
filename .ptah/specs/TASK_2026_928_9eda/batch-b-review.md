# Batch (b) review: antigravity usage reader

Paths are relative to `libs/backend/auth-providers/src/lib/quota/` unless noted.

**Verdict: APPROVE WITH CHANGES**

The identity gate and the time budget are sound for an `account` owner. Three majors remain: model scope match, back-off truthfulness, and the OAuth budget for other owners.

## Findings

1. **major – CLI windows may never match a selected model (item 5).**
   `readers/antigravity-cli-usage.adapter.ts:188` sets `modelScope` to the group name (for example "Gemini Models").
   `libs/shared/src/lib/utils/plan-limits/lane-state.ts:80` (`appliesToScope`) needs an exact lowercase match.
   A lane model id never equals a group display name. So a selected model sees no CLI window and the lane can never be AT LIMIT from CLI rows.
   With no selected model, `modelScopeUnresolved` is true (`lane-state.ts:~160`) and the lane stays "unknown", which is safe but useless.
   Fix: map each group to its model ids (or add a group-to-model scope resolver) before the ledger. Add a test with a real lane `modelScope`.

2. **major – Back-off is not distinct or truthful (item 3).**
   `adapter.ts:86` returns `cli-parse-failed` during back-off, the same as a fresh parse failure. The formatter text "usage response unreadable" hides the fact that no CLI call ran.
   Fix: add a reason such as `cli-backoff`, or a `retryAfter` field, and map it in the formatter.

3. **major – The OAuth read can use the budget for `cli-store` and `unknown` owners (item 2).**
   `reader.ts:113` runs `readOAuth` first. `readers/antigravity-oauth-plan-usage.reader.ts:112` allows 10 s. After that, 3 s plus 8 s can follow, so the chain can reach 21 s against the 12 s lane deadline.
   The lane signal then aborts the CLI. This case existed before, but the new 8 s CLI cap does not fix it.
   Fix: cap OAuth at about 1.5 s when the CLI can follow, or give each stage a deadline taken from one shared budget.

4. **minor – Account owner worst case is 11 s, with little margin (item 2).**
   OAuth is skipped for `account` (`reader.ts:109-112`). Discovery is capped at 3 s (`reader.ts:119`), and the CLI at 8 s (`adapter.ts:90`). The sum is 11 s plus two sync file reads.
   `powershell.exe` start on Windows can use most of the 3 s, but the abort ends it. The `execFile` abort signal kills only the direct child, so a grandchild of `agy` can survive (`adapter.ts:248-258`). `timeout` is also set, which is the same kill.
   Fix: take the CLI cap from the time left (`min(8s, deadline - elapsed)`). Optionally add `taskkill /T` on Windows.

5. **minor – Candidate loop shares one 8 s timer (item 2).**
   `adapter.ts:90-111`: one timer covers all candidates, and a timeout ends the search. This is correct. A non-timeout failure continues to the next candidate, so the total stays at or below 8 s.
   No change needed. Add a test with two failing candidates.

6. **minor – Store re-read race (item 1).**
   `reader.ts:79-80` verifies the store account before the CLI starts. The store file can change during the run (up to 8 s), and the CLI can then answer for the new account.
   Fix: read the store owner again after the CLI result and drop the rows if it changed.

7. **minor – `fresh` boolean design (item 1).**
   `provider-owner.resolver.ts:181-198`. `fresh` skips the TTL and the mtime shortcut. It then writes the result back to the cache (lines 206-211, 216-221), so a fresh read updates the shared cache with the true value. This does not poison it, and it is actually helpful.
   A failed fresh read stores `active: null` for 5 s (lines 216-221), which briefly turns an account owner into `cli-store`. This is harmless.
   Design: a boolean at the end of a 5-parameter function is hard to read. Fix: use a separate function `readActiveGeminiAccountUncached`, or an options object. Also, the changed lines are not prettier formatted (`provider-owner.resolver.ts:186,192,231-232`, `reader.ts:16,79`, `adapter.ts:86,101,118,153`). Run prettier.

8. **minor – The Zod schema is decorative (item 4).**
   `adapter.ts:153` uses `z.tuple` of four strings. This is only a length check. The real validation is the regexes and the range check, which is correct: percent 0-100 (line 169), ISO UTC only (line 29), any malformed line rejects the whole output (`adapter.ts:142`), and duplicate keys reject it.
   Gaps: (a) only tab-separated columns are accepted, so a space-aligned table gives a parse failure (safe, shown as unknown); (b) an extra column rejects the output; (c) `resetsAt` in the past is accepted (`adapter.ts:168`), so a stale 100 % used row with a past reset could stay AT LIMIT unless the ledger expires it (not verified here); (d) "remaining" semantics are assumed from the label and not validated.
   CRLF is handled (`adapter.ts:136`). New group names work because the key comes from a slug. Two group names with the same slug reject the whole output.
   Fix: use a real `z.object` per row with `.refine` for the reset time, or remove Zod. Reject a reset more than a day in the past.

9. **minor – Window key schema differs from the language server (item 5).**
   CLI keys are `other:cli-<group>-<kind>` (`adapter.ts:185`). Language server keys are `other:model-<name>` (`reader.ts:361`). Two groups with the same kind do not collide in `allowanceId` (`plan-limit-ledger.rules.ts:55-60`, key plus scope), because the slug is in the key. A source switch leaves the old windows as orphans until they go stale.
   `usedSource: 'provider-unofficial'` is correct. `resetSource` is also set.

10. **minor – Back-off start rules (item 3).**
    Starts: output that does not parse, including empty output (`adapter.ts:117`), and the buffer overflow case (`adapter.ts:100`). Both are correct. Empty output (not signed in) is also backed off for 30 min, so it cannot repeat.
    Does not start: timeout, non-zero exit, abort, `cli-unavailable`, `cli-not-found`. Abort and not-found are right. A timeout or a non-zero exit may still have sent a billable prompt, and the next read repeats it every lookup.
    Fix: start a shorter back-off (for example 5 min) after `cli-timeout` and `cli-exit-error`.
    Success clears it (`adapter.ts:114`). Partial output (2 of 4 rows) is rejected (`adapter.ts:142`). This is right, because a missing group would look like room.
    The `WeakMap` keyed on `exec` (`adapter.ts:25`) is correct in production: `defaultExec` is one module function. The back-off is per process, and it resets on restart (an unavoidable billable call per restart).

11. **minor – Formatter (item 6).**
    `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-limit.formatter.ts:268-276` has no CLI-specific branch. Unmapped reasons fall back to "reader failed" (line 293), and the table is `Partial`, so this is safe. Text comes only from constants, so no raw error or secret can reach the output.
    The doc comment for `unknownCause` (lines 262-267) now sits above `UNAVAILABLE_REASON_CAUSE`, which is misplaced. Fix: move the constant above that comment.
    `cli-unavailable` and `cli-not-found` share the text "usage reader unavailable". Acceptable.

12. **minor – Logging and privacy (item 7).**
    Production wiring passes the logger: `plan-usage.service.ts:165` calls `createAntigravityPlanUsageReader(logger, now)`, and `reader.ts:91` forwards it. So `options.logger` is defined. Logs contain only a reason code (`adapter.ts:102,118`). The fixture and the specs use no email, account id or path. Spec keys such as `account:key` are fake.
    Note: `logger.warn` runs on every non-back-off parse failure only, so it cannot flood.

13. **minor – Test gaps and standards (item 8).**
    - Specs use `as never` (`reader.spec`) instead of typed fixtures. This is weak but not `any`.
    - The time budget test (`reader.spec`, "leaves eight seconds") proves only that the CLI mock is called once. It does not prove a 12 s total, discovery with a hung language server, or the abort kill.
    - Missing: abort during the CLI run; timeout does not start a back-off; two candidates; store changes during the read; a mismatched language-server account with an account owner; a real lane model scope (see finding 1); CRLF and extra-column rows; percent 101 and negative; the formatter test for every reason value.
    - The back-off test covers success clear and the repeat, which is good.
    - Formatting: several lines exceed 80 columns and one-line objects are not prettier output. Run prettier on all changed files.
    - No `any`, `@ts-ignore` or `as unknown as` found in the changed source.

## Item answers in short

1. Identity is safe against a language-server account change (`reader.ts:75` returns unavailable) and against a stale cache (`fresh` read). One gap: the race in finding 6.
2. Account owner: 3 s + 8 s = 11 s, fits 12 s. Other owners can exceed it (finding 3).
3. See findings 2 and 10.
4. See finding 8. A parse failure always gives "unknown (reason)". No path gives a false AT LIMIT, apart from finding 8(c) on a past reset.
5. See findings 1 and 9.
6. See finding 11.
7. See finding 12.
8. See finding 13.

## Coordinator response

- Applied: findings 2, 3, 4, 6, 7, 8, 10, 11 and the tests of 13. See `batch-b-fixes.md`.
- Changed after the fix lane: the OAuth stage limit is 3 s (1.5 s is short for an HTTP request),
  and the two new `catch` blocks have the degradation-audit comment.
- Not applied: finding 1 (model group to lane model) and finding 9 (key schema of the two
  sources). They belong to the per-model limit state, a later batch.

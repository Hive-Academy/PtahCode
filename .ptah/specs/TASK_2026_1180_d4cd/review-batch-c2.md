# Review — batch c2 (logic)

Scope: uncommitted diff against HEAD in `fix/lane-usage-readers-c2`.

- `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.ts`
- The three changed specs.

The downstream paths were traced: `plan-usage.service.ts` (`read`, `settle`, `assemble`),
`plan-limit-ledger.service.ts` / `plan-limit-ledger.rules.ts`,
`libs/shared/src/lib/utils/plan-limits/window-state.ts`, `agent-limit.formatter.ts`,
`plan-tile-view.model.ts`, and `usage-source-chain.ts`.

## Verdict: CHANGES REQUIRED

Score: 5/10. The type contract is valid. The 402 regex matches the documented wording. The
specs pass. But the balance rules do not get the task rule end to end. A malformed balance
still gives AT LIMIT. A top-up after a zero-balance read cannot clear a held, persisted
exhaustion. The `credits` field never reaches a consumer. A score of 7 needs findings 1–3
fixed. A score below 5 would need a wrong verdict on the main path. The main path (balance 0
at 100%, and the 402 text) is correct.

## Checks run

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath <grok spec> <opencode-go spec>`: 2 suites, 24 tests pass.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <lane-limit-classifier spec>`: 1 suite, 48 tests pass.
- `tsc` and `eslint` were not run again. The fix report says that they pass. No finding
  depends on a type error.

## Findings

### 1. HIGH — A malformed balance still gives AT LIMIT (parse failure → false limit)

- `grok-account-plan-usage.reader.ts:162` keeps the window when `balance` is `undefined`. A
  malformed balance makes `balance` `undefined`, so a 100% window is kept.
- `libs/shared/src/lib/utils/plan-limits/window-state.ts:143-157` makes limit evidence from
  any fresh `provider-api` window at `percent >= 100` when the status is `available`. This is
  the batch-a rule "provider-api percent >= 100 classifies as `limit-reached`".
- Result: `prepaidBalance: { val: "abc" }` at 100% gives `limit-reached`, with only a
  `balance-unavailable` notice. The reader omits explicit `exhaustion`, but the classifier
  makes the same limit. The task rule says a parse failure gives unknown with a reason, never
  a false AT LIMIT. Balance is the field that decides whether the 100% window gates use
  (`cli-probe.md:243`). A failed balance parse therefore makes the gate unknown.
- The spec at `grok-account-plan-usage.reader.spec.ts` (`balance: 'invalid'` row) asserts
  only "no `exhaustion`". It does not assert the lane state. So the spec does not see this
  defect.

### 2. HIGH — A top-up cannot clear a held zero-balance exhaustion until period end

- At balance 0 and 100%, the reader adds `exhaustion: { source: 'provider-api' }`
  (`grok-account-plan-usage.reader.ts:180-182`). The window has `resetsAt` = period end.
  The ledger holds it, and `plan-limit-ledger.persistence.ts` persists it because its reset is
  ahead.
- After the user buys prepaid credit, the next read has balance > 0. The reader withholds the
  window (`:162`). `settle` records no window (`plan-usage.service.ts`, the loop over
  `reading.windows`), so nothing replaces the held entry.
- Even if the window were kept, `readingClears` (`plan-limit-ledger.rules.ts:161-170`) refuses
  to clear at `percent >= 100`. No path clears the exhaustion before `currentPeriod.end`
  (up to one month for `MONTHLY`). The snapshot carries every ledger window
  (`plan-snapshot-windows.ts`), so the lane stays AT LIMIT while the user has credit. This
  stays true after a restart.
- The explicit exhaustion adds little. Finding 1 shows that `window-state.ts` already makes a
  limit from a fresh 100% window. That implicit evidence ages out by `freshnessMs`. The explicit
  one is sticky. So the explicit evidence adds stickiness and gives almost no extra signal.
- The same stickiness applies to the 402 owner evidence (finding 5).

### 3. MEDIUM — `credits` is dropped before any consumer reads it

- The reader sets `credits` (`grok-account-plan-usage.reader.ts:196-198`). The shape matches
  `PlanLimitOwnerSnapshot.credits` (`balance?: string; hasCredits; unlimited`) in
  `libs/shared/src/lib/types/plan-limit.types.ts`.
- `PlanUsageService.assemble` (`plan-usage.service.ts:481-510`) copies `status`, `fetchedAt`,
  `source`, `readAt`, windows, evidence, `account`, `activity`, `localUsage`,
  `unavailableReason` and `statusReason`. It does not copy `credits`, `allowances`,
  `individualAllowance`, `resetCreditsAvailable` or `upsellAvailable`.
- `agent-limit.formatter.ts:397` and `plan-limit-tiles.ts:144` read `snapshot.credits`. They
  never see the Grok balance. The fix report's open point says "the reading still exposes
  credits". That is true only inside the reader. The user sees nothing.
- This gap also affects Codex credits. That part is not new. But this batch relies on
  `credits` to explain the withheld window, so the batch claim is not met.

### 4. MEDIUM — A positive balance at 100% gives an established, empty window set

- At `percent >= 100 && balance > 0`, the reading is `available`,
  `windowSetEstablished: true`, `windows: []` (`grok-account-plan-usage.reader.ts:162`,
  `:190-192`). Because of finding 3, no credits are shown either.
- The rule is correct in direction: the window does not gate use. But the snapshot claims
  a full, established window set with no window. A ledger window from an earlier read stays
  visible (for example an 80% window). Its stale percent is shown as current until it
  expires. With finding 2, an older zero-balance exhaustion stays visible.
- Withholding does not fake a limit. It can hide a correct one in one case: the balance was
  spent between two reads. Then the 402 classifier is the only signal (finding 5).
- A better model: keep the period window and mark it as non-gating. Or record a reading
  that clears the held window. Expose the balance through a field that `assemble` copies.

### 5. MEDIUM — 402 owner evidence is sticky, and the pattern name is wrong

- `lane-limit-classifier.ts:158` maps the 402 text to `quota('grok-free-usage', {})`. That
  gives `error-derived` owner evidence with no reset (spec asserts this).
- Unknown-reset owner evidence clears only on a `billing: 'plan'` success
  (`plan-limit-ledger.rules.ts`, `clearUnknownResetEvidence`) or after
  `DEFAULT_LONGEST_WINDOW_MS` = 7 days (`plan-limit-ledger.rules.ts:31`). No Grok path in
  `libs/backend` records a plan-billed success. After a top-up, the lane can stay AT LIMIT for
  up to 7 days.
- The name `grok-free-usage` and the doc comment at `lane-limit-classifier.ts:56-61`
  ("rolling 24 hours") describe the free tier. A paid-balance 402 is not free usage. Use a
  separate pattern, for example `grok-balance-exhausted`, so that logs and limit reasons
  are correct.

### 6. LOW — The 402 regex depends on a guessed prefix

- Pattern: `\b(?:HTTP|status|API error)\s*[:(]?\s*402\b[^\n]{0,160}\busage balance exhausted\b`
  (`lane-limit-classifier.ts:62-63`).
- The task folder records the wording `HTTP 402 "Grok Build usage balance exhausted"`
  (`context.md:34`, `cli-probe.md:222`). It does not record the raw lane output line. The spec
  fixture `API error (status 402 Payment Required): ...` is invented.
- False negatives: `"status":402` (JSON), `status=402`, `statusCode: 402`, `HTTP/1.1 402`,
  `402 Payment Required: ...` with no prefix, and a reversed order such as
  `usage balance exhausted (HTTP 402)`. A JSON-RPC `data` body (the ACP path in the doc
  comment) is a likely shape. It fails if it contains `"status":402`.
- False positives: low. The text must have the 402 and the exact wording on one line within
  160 characters. Lane output that echoes this source or spec (for example a Grok lane that
  reviews this file) matches. This risk applies to all classifier patterns and is not new.
- Fix: capture one real 402 line from Grok ACP and from `grok -p`, and add both as fixtures.
  Accept `[:=(\s"]*` between the key and `402`.

### 7. LOW — `prepaidBalance: null` counts as malformed

- `grok-account-plan-usage.reader.ts:146-151` tests `rawBalance === undefined`. A JSON `null`
  (a common serializer output for an absent message) fails `PrepaidBalanceSchema` and sets
  `balance-unavailable`. Absent and null should mean the same thing. The only recorded sample
  is `{ "val": 0 }` (`cli-probe.md:236`). The type and unit of a positive `val` are not
  confirmed. Protobuf JSON writes int64 as a string. A string `val` would make every positive
  read `balance-unavailable`, and then finding 1 applies.

### 8. LOW — `balance-unavailable` label text is wrong for Grok

- `balance-unavailable` is a valid `PlanLimitStatusReason`
  (`libs/shared/src/lib/types/plan-limit.types.ts:222`). It is in `FAILURE_RANK`
  (`usage-source-chain.ts:18`). Grok is not in a source chain, so `usable()` does not apply.
  `assemble` copies the reason (`plan-usage.service.ts:508`).
- The formatter uses `statusReason` only for `service-unavailable` (`agent-limit.formatter.ts:
  ~297`). So the MCP agent-limit output does not show the reason for this `available` reading.
- The dashboard shows `'Plan limits unavailable right now; showing request counts'`
  (`plan-tile-view.model.ts:126-127`). That text is Ollama-specific. For Grok, the window is
  shown and no request counts exist. The text is incorrect.

### 9. LOW — Test coverage gaps

- No spec covers `percent < 100` with balance 0 (expect no exhaustion) or `percent > 100`
  with balance 0.
- No spec covers `prepaidBalance: null`, a string `val`, or a negative `val`.
- No spec checks the lane state for the malformed and positive-balance cases (findings 1, 4).
- No spec covers a top-up after a held zero-balance exhaustion (finding 2), at ledger or
  service level.
- No spec checks that `credits` reaches the owner snapshot (finding 3).
- The OpenCode Go spec pins the 403 → `no-usage-source` mapping for `EntitlementError` and
  for other errors. It is correct and matches the reader. No source change was made there.
- The 402 classifier spec has one positive and one negative fixture. Add the shapes from
  finding 6 and a non-Grok lane negative for the 402 text.

## Rules check (requested)

| Rule | Code | Result |
| --- | --- | --- |
| Absent balance → old behavior | `:146-151`, `:162` | Correct |
| Malformed → window kept, no exhaustion, `balance-unavailable` | `:151`, `:162`, `:195` | As written. Effective lane state is AT LIMIT (finding 1) |
| Balance 0 at ≥100% → `provider-api` exhaustion | `:180-182` | Correct, but sticky after a top-up (finding 2) |
| Balance > 0 at ≥100% → window withheld | `:162` | As written. Old ledger state survives (findings 2, 4) |
| `credits` set when balance parsed | `:196-198` | Shape valid. Dropped by `assemble` (finding 3) |
| 402 regex | classifier `:62-63` | Matches the fixture. Prefix is narrow (finding 6) |

## Recommended fixes

1. Malformed balance at `percent >= 100`: withhold the window or mark it non-gating. Return
   unknown with `balance-unavailable`, not a 100% `provider-api` window that
   `window-state.ts` turns into a limit.
2. Positive balance after a held zero-balance exhaustion: clear it. For example, record a
   reading that the ledger accepts as a clear for `other:subscription` when the balance is
   > 0, or drop the explicit exhaustion and rely on the implicit fresh-100% rule.
3. Copy `credits` (and the other optional allowance fields) in `PlanUsageService.assemble`,
   or remove the claim that the reading exposes credits.
4. Give the 402 match its own pattern name and clear rule. A positive balance read must also
   clear 402 owner evidence observed before it.
5. Treat `prepaidBalance: null` as absent. Accept a numeric string `val`.
6. Use a Grok-specific label for `balance-unavailable`, or a new reason value.
7. Add the specs listed in finding 9. Add a real captured 402 line as a fixture.

## Decisions

- Severity of finding 1: HIGH. Evidence: the task rule in `context.md` and the batch-a
  rule in `usage-sources.md:75`. Reversible: yes. If the team decides that an unreadable
  balance at 100% must stay AT LIMIT, downgrade to LOW and document it.
- Finding 3 counts against this batch even though the gap is older. The batch relies on
  `credits` in its open point.

**Verdict: APPROVED**

# Logic re-review: batch c1 (codex `ordinaryUsageAllowed` gate), round 3

Scope: the uncommitted diff vs HEAD in `libs/backend/codex-runtime` and
`libs/backend/auth-providers/src/lib/quota` (11 files), the fix notes in
`batch-c1-fix2-report.md`, and the round 2 review `review-batch-c1-r2.md`. Read against
`plan-limit-ledger.service.ts` (`recordOwnerEvidence`, `clearProviderOwnerEvidence`) and the
App Server schema in `codex-protocol-methods.ts`.

Checks run (focused Jest only, logs in `.ptah/tmp/r3-*.log`):

- auth-providers: `plan-usage.service.spec.ts`, `readers/codex-plan-usage.reader.spec.ts`,
  `plan-usage.accounts.spec.ts`, `plan-limit-ledger.service.spec.ts`: 4 suites, 152/152 pass.
- codex-runtime: `codex-account-usage-client.spec.ts`: 1 suite, 38/38 pass.
- I did not run `tsc` or `eslint` myself. The fix report records both as passed.

**Score: 8/10.** N1, N2 and N3 are fixed correctly. I found no new false AT LIMIT and no stuck
owner evidence. The remaining items are minor: one display gap in the safe direction and one
test gap. They do not block. The score is not 9, because a parse failure in credits still shows
no "unknown" reason (R3-1).

## Round 2 finding status

| # | Round 2 finding | Status | Evidence |
| --- | --- | --- | --- |
| N1 | Denied gate with usable credits does not release older owner evidence | Resolved | The release flag now follows the reader decision: `result.status === 'available' && !ownerGateDenied` gives `providerOwnerClear` (`codex-plan-usage.reader.ts:169`). The service clears provider-api evidence for that reading (`plan-usage.service.ts:451-453`). Test: denied, then denied with `hasCredits: true, balance: '5'` gives `ownerEvidence` `[]` (`plan-usage.service.spec.ts`, "clears denied Codex owner evidence when credits become usable"). |
| N2 | Malformed credits counted as "no credits" | Resolved | Client sets `creditsUnparsed` for a present but unparseable credits value (`codex-account-usage-client.ts:185-188`). Reader: `noUsableCredits` starts with `!active?.creditsUnparsed` (`codex-plan-usage.reader.ts:158`), so no owner evidence. Tests: client `it.each` "distinguishes absent credits from malformed credits", reader case with `creditsUnparsed: true` (`codex-plan-usage.reader.spec.ts:379`). |
| N3 | Test gaps in the credits matrix | Resolved | Denied + `{ hasCredits: true, unlimited: false, balance: '0' }` and denied + `{ hasCredits: false, unlimited: false }` both expect owner evidence (`codex-plan-usage.reader.spec.ts:386-387`). |
| N4 | Owner decisions use windows of all buckets | Not changed (no action was required) | Both errors go in the safe direction. Unchanged at `codex-plan-usage.reader.ts:160-163`. |

## Specific checks

1. **`creditsUnparsed` does not fire on valid credits.** The condition is
   `raw?.credits != null && (!hasCredits || !unlimited || !hasCredits.success || !unlimited.success
   || (credits.success && credits.data.balance != null && !balance?.success))`
   (`codex-account-usage-client.ts:185-186`).
   - Valid `{ hasCredits: bool, unlimited: bool }` with `balance` absent or `null`: every term is
     false. No flag.
   - Valid with a decimal `balance` (for example `'12.50'`): `balance.success` is true. No flag.
   - `unlimited: true` with a valid balance: no flag. With a non-decimal balance: flag, but the
     reader already ignores credits limits when `unlimited` is true, so the only effect is "no
     owner evidence" (safe direction).
   - `null` or absent credits: no flag (protocol "no credits"). Correct.
   - Reachability: the protocol schema validates `credits` on the live response
     (`codex-protocol-methods.ts:240-249`, and `credits` is part of `rateLimits`), so a non-object
     or a non-boolean flag rejects the whole response (`service-unavailable`, which is unknown).
     The flag is reachable in production mainly for a balance string that the client `decimal`
     regex rejects (`codex-account-usage-client.ts:105`), for example a negative value, an
     exponent, or more than 6 decimals. In all of these cases the result is "no owner evidence".
2. **Clear-before-record ordering in the service.** `providerOwnerClear` needs `!ownerGateDenied`.
   `providerOwnerEvidence` needs `ownerGateDenied` (`codex-plan-usage.reader.ts:169-173`). The two
   are mutually exclusive for one reading, so the order at `plan-usage.service.ts:451-456` cannot
   change the result. The clear deletes only `ALL_MODELS` evidence with `source === 'provider-api'`
   and a strictly older `observedAt` (`plan-limit-ledger.service.ts:245-251`). Error-derived
   evidence stays (test "keeps non-provider owner evidence when the Codex gate is open"). A newer
   denied reading replaces older evidence through `supersedes` in `recordOwnerEvidence`
   (`plan-limit-ledger.service.ts:231-241`). A `stale` re-serve does not clear or record, because
   both calls are inside `reading.status === 'available'` (`plan-usage.service.ts:450`).
3. **`noUsableCredits` expression** (`codex-plan-usage.reader.ts:154-159`).
   - `creditsUnparsed` -> false (no evidence). Correct.
   - Credits-depleted reached type -> true, also with a positive balance. Correct.
   - No `codex` bucket -> false (no evidence, safe, as noted in N4).
   - `unlimited: true` -> false. Correct.
   - `hasCredits: true` with balance > 0, or a missing or non-finite balance -> false
     (usable or uncertain). Correct.
   - `hasCredits: true` with balance `0`, `hasCredits: false`, or no credits value -> true.
     Correct.
   - `ownerGateDenied` also needs `denied` and no exhausted window (`:160`). So an allowed or
     absent gate never gives owner evidence.
4. **Hard rules.** A parse failure of the gate rejects the response through the protocol schema
   (`codex-protocol-methods.ts:245`, test "rejects a malformed ordinary usage gate" expects
   `service-unavailable`). A parse failure of credits gives no owner evidence. A 7% window with a
   reached type gives no exhaustion (`toWindow` needs `atLimit`, `codex-plan-usage.reader.ts:204,220`).
   AT LIMIT comes only from an exhausted window or a denied gate with no usable credits.

## New findings

### R3-1. [minor] Unparseable credits on a denied gate show "not at limit", not "unknown"

- With `ordinaryUsageAllowed: false` and `creditsUnparsed: true`, `ownerGateDenied` is false, so
  the reading sets `providerOwnerClear` (`codex-plan-usage.reader.ts:158,169`). The service then
  clears older provider owner evidence (`plan-usage.service.ts:451-453`).
- The lane shows its windows and no AT LIMIT. No reason tells the user that the credits state is
  unknown. The rule "a parse failure gives unknown (reason)" is met only in the sense that no
  false AT LIMIT occurs. If the account really has no credits, the lane can start and then fail.
- The direction is safe (no false AT LIMIT), and a failed run feeds error-derived evidence. No
  change is required for this batch.
- Optional fix: when `denied && active?.creditsUnparsed`, do not set `providerOwnerClear` (keep
  older evidence until its reset), or surface an "unknown credits" status reason on the reading.

### R3-2. [minor] No test asserts that valid credits do not set `creditsUnparsed`

- The valid credits case asserts only `balance` (`codex-account-usage-client.spec.ts:376,392`).
  The new `it.each` covers `null`, absent and two malformed values, but no valid value.
- Fix: add `{ balance: '5', hasCredits: true, unlimited: false }` and
  `{ hasCredits: false, unlimited: true }` to the `it.each` with `creditsUnparsed` expected
  `undefined`. Also consider one reachable malformed balance, for example `'-1'`.

### R3-3. [nit] Stale doc comment

- `clearProviderOwnerEvidence` says "when a fresh gate-open reading arrives"
  (`plan-limit-ledger.service.ts:244`). After N1 the trigger is "a fresh provider reading that
  does not support owner evidence", which includes a denied gate with usable credits. Update the
  comment to match `providerOwnerClear`.

## Checked and clean

- Zod at the boundary: `ordinaryUsageAllowed` passes `z.boolean().safeParse`
  (`codex-account-usage-client.ts:199,252`), and the protocol schema validates it as
  `z.boolean().nullish()`. Credits go through `creditsFields` and the `decimal` regex.
- No `any` and no type casts. The `as const` uses are literal narrowing only.
- No logging is added on this pure mapping path, and none is needed.
- `PlanUsageLedger` now picks `recordOwnerEvidence` and `clearProviderOwnerEvidence`
  (`plan-usage.service.ts:124`). Both methods exist on `PlanLimitLedgerService`.
- `clearProviderOwnerEvidence` ignores a non-finite `observedAt` and does not emit a change when
  it deletes nothing (`plan-limit-ledger.service.ts:246-248`).
- Tests cover allowed, denied, absent and malformed gate values (client), and allowed, denied,
  denied with usable credits, denied with zero or no credits, and unparsed credits (reader and
  service).

## Decisions

- Verdict APPROVED with three non-blocking items. Options: APPROVED or CHANGES REQUESTED.
  Evidence: every remaining item goes in the safe direction (no false AT LIMIT, no stuck
  evidence), and the hard rules hold. Reversible: yes, the coordinator can still apply R3-1 to
  R3-3 before the commit.

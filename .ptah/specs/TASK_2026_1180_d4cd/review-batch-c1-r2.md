**Verdict: CHANGES REQUESTED**

# Logic re-review: batch c1 (codex `ordinaryUsageAllowed` gate), round 2

Scope: uncommitted diff in `libs/backend/codex-runtime` and
`libs/backend/auth-providers/src/lib/quota`, the fix notes in `batch-c1-fix-report.md`, and the
round 1 review `review-batch-c1.md`. Read against `plan-limit-ledger.rules.ts`
(`evidenceExpired`, `clearUnknownResetEvidence`), `usage-source-chain.ts` and the credits parse in
`codex-account-usage-client.ts`.

Checks run (focused Jest only):

- auth-providers: `plan-usage.service.spec.ts`, `plan-limit-ledger.service.spec.ts`,
  `plan-usage.accounts.spec.ts`, `readers/codex-plan-usage.reader.spec.ts`: 4 suites, 148/148 pass.
- codex-runtime: `codex-account-usage-client.spec.ts`: 1 suite, 34/34 pass.

**Score: 7/10.** All six round 1 findings are fixed. The release path runs in production and has
an end-to-end service test. One release gap remains: a denied gate whose credits become usable
does not release the older owner evidence (new Finding N1). It is bounded by the earliest window
reset in most cases, but it is unbounded (up to 7 days) when no window carries a reset. This keeps
the score out of 8. The core contract (no false AT LIMIT from a 7% flag, a parse failure, or an
allowed gate) holds, so the score is above 5-6.

## Finding status (round 1)

| # | Round 1 finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Owner evidence from a denied gate is never cleared | Resolved (one gap, see N1) | Reader sets `providerGateOpen` on available, not-denied readings (`codex-plan-usage.reader.ts:169`). Service clears at `plan-usage.service.ts:451-453`. Ledger deletes only `ALL_MODELS` + `source === 'provider-api'` + older `observedAt` (`plan-limit-ledger.service.ts:245-251`). Evidence now carries `resetsAt` = earliest future window reset (`codex-plan-usage.reader.ts:161-163,170-173`), so `evidenceExpired` (`plan-limit-ledger.rules.ts:277-284`) releases it. Test: `plan-usage.service.spec.ts:279-296` (denied, then allowed -> `ownerEvidence` is `[]`). |
| 2 | `namesWindow` is dead code | Resolved | `namesWindow` is removed (no match in the quota folder). Exhaustion needs a reached type and `atLimit` (`codex-plan-usage.reader.ts:204,220`). Tests use real enum values (`rate_limit_reached`, `workspace_member_usage_limit_reached`, `workspace_member_credits_depleted`). |
| 3 | Denied gate with an exhausted window also records owner evidence | Resolved | `ownerGateDenied` requires `!windows.some((window) => window.exhaustion)` (`codex-plan-usage.reader.ts:160`). Test "exhausts a window at 100% without owner evidence" in `codex-plan-usage.reader.spec.ts`. |
| 4 | Credits not checked | Resolved (minor gaps, see N2, N3) | `noUsableCredits` at `codex-plan-usage.reader.ts:155-159`. Credits-depleted reached types override (`:155-156`). Tests for balance `'2'`, `'unknown'`, `''`, unlimited, and depleted override. |
| 5 | Unused `quota.ordinaryUsageAllowed` | Resolved | Only the root field exists (`codex-account-usage.types.ts`, `CodexAccountUsageResult.ordinaryUsageAllowed`). |
| 6 | Header comment wrong | Resolved | Header comment now matches the behavior (`codex-plan-usage.reader.ts:15-16`). |

## Specific checks

1. **`clearProviderOwnerEvidence` runs in production for codex.** Yes. The App Server source has
   label `provider-api` (`codex-plan-usage.reader.ts:68`). `readUsageSourceChain` copies
   `result.source` onto the reading (`usage-source-chain.ts:65-66`). The rollout fallback returns
   `source: 'local-state'`, so a rollout reading cannot clear provider evidence. The direct
   `lastResult` fallback also sets `source: 'provider-api'` (`codex-plan-usage.reader.ts:102`).
   The service test drives the real reader through the service, not a stub reading, so it proves
   the production path.
2. **No new false AT LIMIT, no stuck evidence.** No new false AT LIMIT found. A stale re-serve does
   not record or clear evidence (`plan-usage.service.ts:450`, `settle` records only for
   `available`). One release gap remains: N1.
3. **Credits logic.** Unlimited -> no evidence. `hasCredits` with balance > 0 -> no evidence.
   `hasCredits` with balance `0` -> evidence. `hasCredits` with missing or unparseable balance ->
   no evidence (uncertain, safe). Credits-depleted reached type -> evidence even with a positive
   balance. Correct. Gaps: N2 (malformed credits object), N3 (missing test for balance `0`).
4. **Tests for denied -> allowed release.** Present at the service level
   (`plan-usage.service.spec.ts:279-296`) and the ledger level (precedence test at
   `plan-limit-ledger.service.spec.ts:269-280`). The test for non-provider evidence that stays is
   at `plan-usage.service.spec.ts:298-309`. No test covers denied -> denied with usable credits
   (N1).

## New findings

### N1. [major] A denied gate whose credits become usable does not release older owner evidence

- `providerGateOpen` is set only when `!denied` (`codex-plan-usage.reader.ts:169`).
- Sequence: reading A is denied with no credits -> owner evidence. The user buys credits.
  Reading B is still denied (`ordinaryUsageAllowed: false`) but has `hasCredits: true` with a
  positive balance. `ownerGateDenied` is false, so B records no evidence. `providerGateOpen` is
  also false, so B clears nothing.
- The evidence from A stays until its `resetsAt` (the earliest window reset, often hours). When no
  window has a `resetsAt`, `nextReset` is undefined, and `evidenceExpired` keeps the evidence for
  `longestWindowMs` (7 days for `openai-codex` without declared windows,
  `plan-limit-ledger.rules.ts:230`). `recordSuccess` cannot release it, because the lane is AT
  LIMIT and does not run.
- The same gap applies when a later denied reading has a window at 100%. That case is not a false
  AT LIMIT, because the window explains it, but the owner evidence can outlive the window reset.
- Fix: set the release flag from the reader's own decision, not from the raw gate. For example,
  `...(result.status === 'available' && !ownerGateDenied && { providerGateOpen: true as const })`.
  A fresh provider reading that does not support owner evidence then releases older provider
  evidence. Window exhaustion is not affected, because it is held per window. Add a service test:
  denied with no credits -> evidence. Then denied with `hasCredits: true, balance: '5'` ->
  `ownerEvidence` is `[]`. Rename the field (for example `providerOwnerClear`) if "gate open" no
  longer describes it.

### N2. [minor] A malformed credits object counts as "no credits"

- The client drops the whole `credits` object when `hasCredits` or `unlimited` is not a boolean
  (`codex-account-usage-client.ts:154-156,178-184`). The reader then sees `credits === undefined`.
  With `active` defined, `noUsableCredits` is true (`codex-plan-usage.reader.ts:158-159`).
- Result: denied gate + malformed credits -> owner evidence -> AT LIMIT. The task rule says a
  parse failure gives "unknown", not AT LIMIT. The gate denial is real, so the impact is small,
  but a lane with usable credits that the client cannot parse shows AT LIMIT.
- Fix: in the client, mark a present but unparseable credits value (for example
  `creditsUnparsed: true` on the bucket). In the reader, treat that bucket as uncertain (no owner
  evidence), as is already done for an unparseable balance. A protocol `null` or an absent value
  can stay "no credits".

### N3. [minor] Test gaps in the credits matrix

- No reader test covers denied + `hasCredits: true` + balance `'0'` (evidence expected) or
  denied + `hasCredits: false, unlimited: false` (evidence expected).
- The `'unknown'` and `''` balance cases cannot occur in production, because the client accepts
  only a decimal string (`codex-account-usage-client.ts:105,157`). They test the reader guard
  only. Keep them, but add the two reachable cases above.

### N4. [minor] Owner-level decisions use windows of all buckets

- `ownerGateDenied` checks `windows.some(...exhaustion)` and `nextReset` takes the minimum over
  the windows of all buckets (`codex-plan-usage.reader.ts:160-163`). The gate is a root-level
  field. An exhausted window in a non-`codex` bucket suppresses owner evidence. An early reset
  in another bucket shortens the evidence life.
- Both errors go in the safe direction (no false AT LIMIT, earlier release), so no change is
  required. Restrict both to the windows of `active` if the intent is the `codex` bucket only.
  Also note: with no `codex` bucket, `active` is undefined and a denied gate never gives evidence
  (`codex-plan-usage.reader.ts:158`). This is safe but silent.

## Checked and clean

- Zod at the boundary: `ordinaryUsageAllowed` is `z.unknown().optional()` in `responseFields`
  and passes `z.boolean().safeParse` (`codex-account-usage-client.ts:82,195,248`). A malformed
  value becomes absent. Absent -> `providerGateOpen`, which can release evidence but never create
  it (safe direction).
- No `any` and no casts. The `as const` uses are literal narrowing only. No logging is added on
  this pure mapping path, and none is needed.
- `clearProviderOwnerEvidence` ignores a non-finite time, keeps same-time or newer evidence, keeps
  model-scoped evidence and evidence of other sources, and calls `changed` only on a delete
  (`plan-limit-ledger.service.ts:245-251`).
- The `PlanUsageLedger` pick type now includes both owner-evidence methods
  (`plan-usage.service.ts:124`), so the service cannot call a method the ledger does not expose.
- `reachedType` on `toWindow` is set only at `atLimit` (`codex-plan-usage.reader.ts:204`), so a
  7% bucket flag cannot hold a window exhausted through `namesGate`, and `readingClears` behaves
  as in round 1.
- Evidence with `resetsAt` is no longer released by `clearUnknownResetEvidence` after a successful
  run (`plan-limit-ledger.rules.ts:212-221`). This is acceptable, because the reset and the
  gate-open release now cover it.

## Decisions

- N1 is major, not blocker. Evidence: in the normal case the evidence has a window reset (hours).
  The 7-day case needs both a denied gate and no window reset. The fix is one condition.
  Reversible: yes.
- N2 is minor. Evidence: it needs a denied gate and a malformed credits object at the same time.
  Reversible: yes.

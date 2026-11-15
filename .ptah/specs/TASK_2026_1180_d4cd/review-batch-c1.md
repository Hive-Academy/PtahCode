**Verdict: CHANGES REQUESTED**

# Logic review: batch c1 (codex `ordinaryUsageAllowed` gate)

Scope: uncommitted diff of 8 files in `libs/backend/codex-runtime` and
`libs/backend/auth-providers/src/lib/quota`, read against the ledger
(`plan-limit-ledger.service.ts`, `plan-limit-ledger.rules.ts`), the protocol schema
(`codex-protocol-methods.ts`, `protocol/codex-account.generated.ts`) and the research note
`usage-sources.md`. Check run: `codex-plan-usage.reader.spec.ts`, 28/28 pass.

Score: 4/10. The parse path is correct, but in production every denied gate becomes owner
evidence with no reset. Nothing clears it when the gate opens, so the change makes the
"stuck AT LIMIT" defect that the task is supposed to remove.

## Findings

### 1. [blocker] Owner evidence from a denied gate is never cleared by a later allowed reading

- `codex-plan-usage.reader.ts` (return block, `providerOwnerEvidence: { observedAt, source }`)
  sets no `resetsAt`.
- `plan-usage.service.ts:451-453` calls `ledger.recordOwnerEvidence` only when the reading
  carries evidence. An allowed or absent reading records nothing and removes nothing.
- `plan-limit-ledger.service.ts:231-242` (`recordOwnerEvidence`) only sets. The only paths
  that delete owner evidence are these two:
  - `prune` -> `evidenceExpired` (`plan-limit-ledger.rules.ts:277-285`). With no `resetsAt`,
    the evidence stays for `longestWindowMs`. For `openai-codex` that is the largest declared
    window, normally 7 days (`plan-limit-ledger.rules.ts:230`).
  - `recordSuccess` with `billing:'plan'` -> `clearUnknownResetEvidence`
    (`plan-limit-ledger.rules.ts:212-221`). This needs a completed lane run
    (`agent-process-manager.service.ts:3788`). But the lane is AT LIMIT, so the spawn gate
    refuses it, and no success arrives.
- Each denied poll also replaces the evidence with a newer `observedAt` (the `supersedes`
  check at `plan-limit-ledger.service.ts:237`). This moves the 7-day horizon forward.
- Result: one denied reading keeps the lane AT LIMIT for up to 7 days after codex allows use
  again. The test `plan-usage.service.spec.ts:279-289` covers only the record step, not the
  release step.
- Fix: make the gate state of the provider-api reading the source of truth. When a fresh,
  non-stale `available` reading has `ordinaryUsageAllowed !== false`, delete the owner
  evidence for `ALL_MODELS` whose `source === 'provider-api'` and whose `observedAt` is
  before the reading. For example, add `PlanUsageReading.providerGateOpen?: true` and a ledger
  method `clearProviderOwnerEvidence(owner, observedAt)`. Alternatively, set `resetsAt` on the
  evidence to the earliest `resetsAt` of the windows in the bucket, so that `evidenceExpired`
  releases it. Add a service test: denied reading, then allowed reading -> `ownerEvidence`
  is empty.

### 2. [blocker] `namesWindow` cannot match a real value, so the named-window branch is dead

- The protocol defines only these `rateLimitReachedType` values: `rate_limit_reached`,
  `workspace_owner_credits_depleted`, `workspace_member_credits_depleted`,
  `workspace_owner_usage_limit_reached`, `workspace_member_usage_limit_reached`
  (`codex-protocol-methods.ts:369-379`, `protocol/codex-account.generated.ts:30-32`).
- The result is validated before `usageResult` reads it (`codex-app-server-process.ts`,
  `validateCodexResult`). The enum has `.catch(undefined)`, so `primary`, `secondary` and
  `weekly` are dropped before they reach the client.
- `namesWindow` (`codex-plan-usage.reader.ts`, new function after `mapCodexAccountUsage`)
  matches only `primary`, `secondary` and `weekly`. It never returns true in production.
  Therefore `namedGate` is always false and `deniedWithoutNamedWindow === denied`.
- The reader tests that use `rateLimitReachedType: 'weekly'` (`codex-plan-usage.reader.spec.ts:335-356`)
  test a value that the protocol cannot send. They give false confidence in the
  "names its window" requirement.
- Fix: remove `namesWindow`. Map the real values. A gate with a window at or over 100% names
  that window (this is already done by the `atLimit` path). With no window at 100%, the
  value names a cause, not a window, so use owner evidence (see Findings 1 and 3). Rewrite
  the tests with real enum values (`rate_limit_reached`,
  `workspace_member_usage_limit_reached`). If a named-window value is expected in a future
  protocol, document it and add it to the schema first.

### 3. [major] A denied gate with an exhausted window also records owner evidence

- Because of Finding 2, `deniedWithoutNamedWindow` is true for every denied reading, also
  when a window is at 100% with `rate_limit_reached` and already carries `exhaustion`.
- The window exhaustion has a provider reset and is released by `readingClears`. The owner
  evidence has no reset and outlives the window by up to 7 days (Finding 1).
- Fix: compute `deniedWithoutNamedWindow` as `denied && !windows.some((w) => w.exhaustion)`.
  This makes the evidence owner-level only when no window explains the gate. Add a test:
  denied, primary 100% with `rate_limit_reached` -> primary exhausted and
  `providerOwnerEvidence` undefined.

### 4. [major] A denied ordinary gate blocks a lane that can still run on credits

- `ordinaryUsageAllowed` is documented as "Backend permission for ordinary included usage"
  (`protocol/codex-account.generated.ts:50-51`). Credits are a separate allowance
  (`credits: { hasCredits, unlimited, balance }`, parsed in `codex-account-usage-client.ts`
  `bucket()`, and passed by the reader as `credits` / `allowances[].credits`).
- The reader records owner evidence with no check of credits. A user with
  `credits.unlimited === true`, or `hasCredits === true` with a positive balance, can still
  run codex, but the lane shows AT LIMIT. This breaks the hard rule "AT LIMIT only when a
  gating window is really exhausted".
- The reached types `workspace_*_credits_depleted` are the signal that credits also ran out.
- Fix: do not record owner evidence when the active bucket has `credits.unlimited` or
  `credits.hasCredits` with a balance above zero, unless the reached type is
  `workspace_owner_credits_depleted` or `workspace_member_credits_depleted`. Add tests for
  denied + credits available (no evidence) and denied + credits depleted (evidence).

### 5. [minor] Unused `quota.ordinaryUsageAllowed` field

- `codex-account-usage.types.ts:55` adds `ordinaryUsageAllowed` inside `quota`. The client
  never sets it (`codex-account-usage-client.ts:236-242`), and the reader reads only the
  root field. Because `buckets` falls back to `...result.quota`, a later author can think
  that the field has a meaning per bucket.
- Fix: remove the field from `quota`.

### 6. [minor] Header comment of the reader describes behavior that does not occur

- The new header comment says that the gate "applies to its named window". By Finding 2, this
  never occurs. Update the comment when Finding 2 is fixed.

## Checked and clean

- Boundary parse: `responseFields` takes `ordinaryUsageAllowed: z.unknown().optional()`, and
  `z.boolean().safeParse` maps a malformed value (for example the string `'false'`) to
  absent (`codex-account-usage-client.ts:82,195,248`). `null` also maps to absent. A
  malformed value cannot make a false AT LIMIT. Client tests cover true, false, absent and
  malformed (`codex-account-usage-client.spec.ts:335-357`).
- No `any` and no type casts were added. The only `as const` is a literal narrowing on
  `source: 'provider-api'`. No logging was added, and none is needed on this pure mapping path.
- Allowed or absent gate: `denied` is false, so `namedGate` is false and no owner evidence is
  set. Window exhaustion still needs `rateLimitReachedType` and `usedPercent >= 100`, as
  before. The 7% bucket flag does not make an exhausted window (reader spec, "keeps ordinary
  usage allowed" cases).
- Question 3, `reachedType` on `toWindow`: the field is now set only on windows at 100% or
  more (and on the dead `namedGate` path), and `qualified` is no longer required.
  - `readingClears` (`plan-limit-ledger.rules.ts:161-173`) returns false for percent >= 100
    before it calls `namesGate`. For windows below 100%, `reachedType` is now absent, so a
    held table-reported exhaustion can clear. This is the intended batch a behavior, not a
    regression.
  - Single-bucket (legacy `rateLimits`) results now also carry `reachedType` on windows at
    100%. This adds information and does not change exhaustion.
  - The bucket-level `reachedType` is still on `allowances[]`, so the display of the cause is
    kept.
- Stale readings: `plan-usage.service.ts:450` records evidence only for `status === 'available'`.
  A stale re-served result does not record owner evidence again.
- The tests for allowed / denied / absent / malformed exist at both layers. The denied tests
  use an impossible reached type (Finding 2), and no test covers the release of the
  evidence (Finding 1) or credits (Finding 4).

## Decisions

- Severity of Finding 2 set to blocker, not minor. Evidence: with the dead branch, every
  denied reading goes to the unbounded owner-evidence path of Finding 1. Reversible: yes.

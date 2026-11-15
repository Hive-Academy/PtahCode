# Review — batch c2, round 2 (logic)

Scope: the full uncommitted diff in `fix/lane-usage-readers-c2` (11 files), the round 1
review `review-batch-c2.md`, and `batch-c2-fix2-report.md`. The downstream paths were traced
again: `plan-usage.service.ts` (`read`, `settle`, `assemble`), `plan-limit-ledger.service.ts`
(`changed`, `persist`, `prune`), `plan-limit-ledger.rules.ts` (`windowStamp`,
`carryExhaustion`), `libs/shared/.../window-state.ts` (`activeWindowExhaustion`),
`libs/shared/.../lane-state.ts` (`unknownReasons`), `agent-limit.formatter.ts`,
`plan-limit-tiles.ts`, and the classifier call site in `agent-process-manager.service.ts`.

## Verdict: CHANGES REQUIRED

Score: 6/10. Round 1 findings 1, 2, 3 and 7 are fixed. The task rule now holds on the reader
path: a malformed balance at 100% gives a lane state of unknown, not AT LIMIT. But the new
402 regex has catastrophic backtracking (finding R2-1). A Grok lane output with a long run of
whitespace after the word "status" blocks the host event loop for seconds to minutes. This
one defect blocks approval. A score of 7–8 needs R2-1 fixed. The score is not 5, because the
main limit path is now correct end to end and the specs pin it.

## Checks run

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath` on the grok reader, `plan-usage.service`, `plan-limit-ledger.service`, `plan-usage.accounts` and opencode-go reader specs: 5 suites, 144 tests pass.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` on `lane-limit-classifier.spec.ts`: 1 suite, 56 tests pass.
- A Node script that loads `GROK_BALANCE_REGEX` from the source text and times it (results in R2-1).
- `tsc` and `eslint` were not run again. The fix report says that they pass. No finding
  depends on a type error.

## Round 1 findings — status

| # | Round 1 finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Malformed balance gives AT LIMIT | Fixed | `grok-account-plan-usage.reader.ts:165` withholds the window at `percent >= 100` when `malformedBalance`. `:193` sets `windowSetEstablished: false`. `:195` sets `statusReason: 'balance-unavailable'`. `plan-usage.service.ts:450-457` removes a held provider window. `lane-state.ts:270` then gives the reason `no-windows`, so the lane is unknown. |
| 2 | Top-up cannot clear held zero-balance exhaustion | Fixed | The explicit `exhaustion` is gone. The zero-balance limit now comes only from the fresh-100% rule (`window-state.ts:143-159`), which ages out by `freshnessMs`. A positive balance removes the held window (`plan-usage.service.ts:450-457`, `plan-limit-ledger.service.ts:230-244`). Spec: `plan-usage.service.spec.ts` "clears a held Grok subscription window after a top-up". |
| 3 | `credits` dropped by `assemble` | Fixed | `plan-usage.service.ts:512-516` copies `credits`, `allowances`, `individualAllowance`, `resetCreditsAvailable`, `upsellAvailable`. Spec covers Codex and Grok. |
| 4 | Positive balance at 100% gives an established empty set | Partly fixed | The stale held window is now removed. The lane state is unknown (`no-windows`), not room, while the user has credit. The balance is now visible through `credits`. This is acceptable: it is not a false AT LIMIT. |
| 5 | 402 owner evidence is sticky, wrong pattern name | Partly fixed (rest deferred) | Name and comment fixed: `lane-limit-classifier.ts:17-20`, `:67-72`, `:105`, `:173-177`. Stickiness is deferred to the `providerOwnerClear` mechanism of open PR #1308. The deferral is reasonable, but after a top-up the lane can still stay AT LIMIT for up to 7 days. Keep it as an open follow-up. |
| 6 | 402 regex depends on a guessed prefix | Fixed, with a new defect | JSON, `=`, `statusCode`, `HTTP/1.1` and reversed order now match (`:73-76`, spec `:163-186`). The new optional quantifiers cause R2-1. `status_code: 402` and an unprefixed `402 Payment Required:` still do not match. That is acceptable. |
| 7 | `prepaidBalance: null` counts as malformed | Fixed | `:150-152` treats `null` as absent. `:33-36` accepts a nonnegative numeric string. See R2-7 for the remaining wire-shape gaps. |
| 8 | `balance-unavailable` label is wrong for Grok | Deferred | Skipped as requested. `plan-tile-view.model.ts:126-127` still shows the Ollama text. See R2-6. |
| 9 | Test coverage gaps | Mostly fixed | Reader spec now covers <100% and >100% at balance 0, null, string, negative and malformed values. Service spec covers the top-up. Still missing: a ledger-level spec for `removeProviderWindowEvidence`, a service spec for the `balance-unavailable` removal, a lane-state integration spec, and a regex time-bound spec. |

## New findings

| # | Severity | Finding | Location |
| --- | --- | --- | --- |
| R2-1 | HIGH | Catastrophic backtracking in `GROK_BALANCE_STATUS` | `lane-limit-classifier.ts:73-76` |
| R2-2 | LOW | Removal has no tombstone. An older reading that settles later restores the window | `plan-limit-ledger.service.ts:230-244`, `plan-usage.service.ts:450-460` |
| R2-3 | LOW | Provider-specific branch and hard-coded key in `settle` | `plan-usage.service.ts:451-457` |
| R2-4 | LOW | `changed()` runs once per deleted entry inside the loop. No ledger spec | `plan-limit-ledger.service.ts:238-243` |
| R2-5 | LOW | Grok balance shown without a unit. Stale readings show credits as current. Codex tiles change | `grok-account-plan-usage.reader.ts:197`, `plan-usage.service.ts:424-436`, `plan-limit-tiles.ts:140-165` |
| R2-6 | LOW | `balance-unavailable` does not reach lane-state reasons or the formatter | `lane-state.ts:269-272`, `agent-limit.formatter.ts` |
| R2-7 | LOW | Proto3 JSON can omit a zero `val`. `{}` and a bare number are malformed | `grok-account-plan-usage.reader.ts:33-36` |
| R2-8 | INFO | Probe ledger stub ignores `observedAt` and source | `scripts/agent-usage/probe-plan-usage.ts:380-387` |

### R2-1. HIGH — Catastrophic backtracking in the 402 regex

- `GROK_BALANCE_STATUS` contains `\s*[:=(]?\s*"?\s*402\b`. The three `\s*` groups are
  separated only by optional characters. On a run of whitespace after `status`, `HTTP` or
  `API error` that is not followed by `402`, the engine tries every split of the run into
  three parts. The cost grows about as n³. `\s` also matches newlines, so blank lines count.
- Measured with the real source regex (Node, one `test()` call on `"Status" + n spaces + "ok"`):

  | n spaces | Time |
  | --- | --- |
  | 500 | 345 ms |
  | 1000 | 701 ms |
  | 2000 | 5472 ms |

  A 5000-space input with the same shape took more than 90 s.
- Input: `classifyLaneFailure` gets the newest error segments and the last 16 KB of lane
  output (`agent-process-manager.service.ts:3634-3651`). The text comes from the agent, so it
  is not trusted. A padded table column "Status", a log, or a file echoed by the agent is
  enough. The call is synchronous on the host process (Electron main). The match is
  case-insensitive. The classifier tries `matchGrok` only for Grok lanes, after
  `GROK_LIMIT_REGEX` fails, on every failed exit.
- Fix: replace the three quantifiers with one bounded class, for example
  `(?:\bHTTP(?:\/\d(?:\.\d)?)?|\bAPI error|\bstatus(?:Code)?)[\s:=("]{0,6}402\b`. The same
  check took 0 ms at 2000 and at 16000 spaces. The class keeps the quote of `"status":402`.
  Run the existing positive and negative spec rows again. Add a spec row with 16 KB of
  whitespace after `status` and assert that `classifyLaneLimit` returns in under 50 ms.

### R2-2. LOW — Removal has no tombstone

- `removeProviderWindowEvidence` skips entries whose `windowStamp(entry).observedAt` is
  newer than the reading. That protects newer evidence. It is correct in that direction.
- It leaves nothing behind. If reading A (balance 0, 100%) and reading B (positive balance)
  are in flight for the same owner, and B settles first, B removes the window. Then A calls
  `recordWindowEvidence`. `prev` is `undefined`, so `supersedes` is not checked, and the 100%
  window comes back. The fresh-100% rule then gives AT LIMIT while the user has credit, until
  `freshnessMs` passes or the next read.
- The risk is low. Flights are shared per `flightKey`, and the reader stamps `observedAt` when
  the response arrives. But a second flight exists for `allowCliFallback` (`:cli` suffix).
- Fix (optional): keep a per-owner "withdrawn at" stamp for the key, and have
  `recordWindowEvidence` refuse an entry observed before it.

### R2-3. LOW — Provider-specific branch in `settle`

- `plan-usage.service.ts:451-457` tests `owner.providerId === 'grok'` and hard-codes
  `'other:subscription'`. The key is a private detail of the Grok reader
  (`grok-account-plan-usage.reader.ts:168`). If the reader changes the key, the removal stops
  and nothing fails.
- `read()` uses `normaliseOwnerProviderId(target.providerId)`. `settle` uses
  `owner.providerId`. They are the same today, but the two checks can diverge.
- The trigger is also indirect: `credits?.hasCredits || statusReason === 'balance-unavailable'`
  with `windows.length === 0`. A future Grok reading with no table and a positive balance (no
  `creditUsagePercent`) also removes the window. That is acceptable, but it is not stated.
- Recommendation: add an optional reading field, for example
  `withdrawnWindowKeys?: readonly PlanWindowKey[]`, set by the reader where it withholds the
  window. `settle` then removes those keys for any provider. This removes the provider test
  and the duplicated key.
- Removal on `balance-unavailable`: when the previous read had balance 0 at 100% (a real,
  fresh limit), a malformed read removes it and the lane becomes unknown. This agrees with
  the task rule (a parse failure gives unknown). It does not give a false room state, because
  the lane is unknown, not available. A real 402 is still caught by the classifier. Accepted.

### R2-4. LOW — `removeProviderWindowEvidence` mechanics

- Deleting from a `Map` during `for...of` is safe in JavaScript. A deleted entry that was not
  yet visited is skipped. `prune` inside `changed()` can also delete entries during the loop.
  That is also safe.
- `changed()` runs once per deleted entry. Each call prunes, serializes the whole ledger and
  notifies listeners. Today only one entry matches (`other:subscription|*`), so the cost is
  small. Set a flag in the loop and call `changed()` once after it.
- Persistence is correct: `changed()` → `persist()` writes the ledger without the entry, so the
  removal survives a restart.
- The filter uses `entry.window.usedSource`, not the exhaustion source. A provider-api window
  that carries an exhaustion from another source (for example `error-derived`, kept by
  `carryExhaustion`) is also removed. No Grok path writes such an exhaustion today. Add a
  comment, or skip entries whose `exhaustion.source !== 'provider-api'`.
- No spec in `plan-limit-ledger.service.spec.ts` covers the method: the newer-entry guard, the
  source filter, the change notification and the persisted payload.

### R2-5. LOW — Consumers of the copied fields

- The formatter (`agent-limit.formatter.ts:394-420`) and the tiles
  (`plan-limit-tiles.ts:140-165`) now show credits and allowances. This is the intended fix.
- Codex: the reader already set `allowances`, `credits`, `resetCreditsAvailable` and
  `upsellAvailable`. They are now shown for the first time. Codex cards get extra credit and
  allowance tiles and extra formatter rows. Do an Electron visual check of a Codex card.
- Grok: the reader writes `String(balance)` (`grok-account-plan-usage.reader.ts:197`). The
  unit and scale of `val` are not confirmed. Only `{ "val": 0 }` was observed. A tile can show
  "1500 remaining" with no unit, which can mislead if the value is in cents or a smaller unit.
- The stale path (`plan-usage.service.ts:424-436`) spreads the cached reading, so a stale
  snapshot shows the old balance as current. The tile does not mark it stale.

### R2-6. LOW — The `balance-unavailable` reason is not shown

- For a malformed balance at 100%, the lane state is unknown with the reason `no-windows`
  (`lane-state.ts:270`). `statusReason(limits.status)` reads the status, not
  `snapshot.statusReason`. The formatter reads `statusReason` only for
  `service-unavailable`. So the user does not see why the gate is unknown. The tile text is
  still the Ollama one (round 1 finding 8). The task rule asks for "unknown with a reason".
  The reason exists in the snapshot but does not reach the user. Keep it with the finding 8
  follow-up.

### R2-7. LOW — Wire shapes not covered by `PrepaidBalanceSchema`

- Proto3 JSON omits a field at its default value unless the server emits defaults. A zero
  balance can then arrive as `prepaidBalance: {}`. The schema needs `val`, so `{}` is
  malformed. At 100% the true limit becomes unknown. This is safe under the task rule, but it
  loses a real limit. A bare number (`prepaidBalance: 0`) is also malformed.
- The string regex `^\d+(?:\.\d+)?$` rejects `"-0"`, `".5"`, `"1e3"` and padded strings. These
  give unknown, which is safe.
- Do not change it without a captured response. Record the shape in `cli-probe.md` when a
  positive balance is observed.

### R2-8. INFO — Probe ledger stub

- The stub removes every window with the key, with no `observedAt` or source check. It is
  passed as `never`, so the type does not check it. The probe runs only the Codex path, where
  the Grok branch never fires. No change is needed.

## Recommended fixes

1. (Required) R2-1: replace `\s*[:=(]?\s*"?\s*` with one bounded class such as
   `[\s:=("]{0,6}`. Add a time-bound spec with 16 KB of whitespace.
2. R2-4: call `changed()` once after the loop. Add a ledger spec for the guard, the filter
   and persistence.
3. R2-3: replace the Grok branch with a generic reading field set by the reader.
4. Add a service spec for the `balance-unavailable` removal and a lane-state integration
   spec (malformed at 100% → unknown, balance 0 at 100% → AT LIMIT, positive → not AT LIMIT).
5. Follow-ups (not blocking): round 1 finding 5 stickiness (PR #1308), finding 8 / R2-6
   reason text, R2-2 tombstone, R2-5 balance unit, R2-7 wire shape.

## Decisions

- R2-1 severity: HIGH. Evidence: measured times above, 16 KB input bound, synchronous call
  on the host process. Reversible: yes, a one-line regex change.
- Removal on `balance-unavailable` (R2-3) is accepted as correct under the task rule.
  Options: keep the held limit, or remove it. The task rule says a parse failure gives
  unknown. Reversible: yes.
- Round 1 finding 5 deferral to PR #1308 is accepted. The batch has no positive provider-read
  path on `main` to clear error-derived owner evidence.

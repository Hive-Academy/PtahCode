# Code logic re-review 2 – TASK_2026_2280_d807

Verdict: **REVISE** (one blocker: Haiku 5.5 tier state is unstable and currently broken in the file on disk).

Paths are relative to the worktree. No source file was edited by this review.

## 1. Item table

| # | Item | Status | Evidence | Proof |
|---|------|--------|----------|-------|
| B1 | Wiring: tokens not registered / not exported | PARTLY | Exports added: `vscode-core/src/index.ts:1-5`. Tokens `LANE_SPEND_READER/LEDGER` (`di/tokens.ts:34-36`) are still not registered in Electron or CLI; deferred to 2I/2J with a comment. No `@inject` site exists, so di-lint should not fire (claim not re-run by me). | no test; acceptable only if the commit is declared "batches 2A-2D, not wired" |
| B2 | Name collision `PlanLimitLedgerService` | FIXED | `lane-spend-ledger.service.ts:16` `LaneSpendLedgerService`; no match for old name/file in `vscode-core`, `shared`, `platform-core`; `git diff --stat -- libs/backend/auth-providers` is empty | ledger spec |
| B3 | 1h cache write priced at 5m | FIXED (code) | `pricing.utils.ts` split: `oneHour` priced at `cacheCreation1hCostPerToken`, rest at 5m; absent split with creation>0 gives `partial`; subset>total makes `usageIncomplete` | `anthropic-spend-regressions.spec.ts:9-28` (not re-run: see §2c) |
| B4 | Corrupt storage disables ledger forever | FIXED | `lane-spend-ledger.service.ts:29-48,78-88` | ledger spec :86, :121, :133 |
| B5 | Rate card unverified | NOT FIXED / cannot verify | I still cannot reach the official pricing page. Fix report says seven input/output pairs plus three cache-read values were confirmed; I have not independently confirmed them. Header cites URL and date 2026-11-18. Fable 5.1/5.2 write/read, Opus 4.8, Sonnet 4.6, Haiku 4.5 write values and all output values remain unverified by me. | no test can prove it |
| 1 | Name collision | FIXED | see B2 | |
| 2 | Public exports | FIXED | `vscode-core/src/index.ts:1-5`; `shared/src/index.ts:114-116` additive type exports | tsc claimed clean |
| 3 | DI deferral | PARTLY | see B1 | |
| 4 | Cache TTL | FIXED | see B3 | |
| 5 | Corruption recovery | FIXED | see §2a | |
| 6 | Async rejection | FIXED | `recordCreditEvidence`/`clear` are `async` (`:74,:78`) | ledger spec :143 |
| 7 | Haiku tiers | **NOT FIXED on disk now** | `anthropic-rate-card.ts:25` contains `if (contextTokens <= 100_000) return null;` and line 26 reads `rates[...]` with no low tier. Spec `anthropic-spend-regressions.spec.ts:35-41` expects the low tier at 0/99,999/100,000 and **fails (3 tests failed, 28 passed)** in my run. | regression spec fails |
| 8 | Provider drift | FIXED (not re-run) | `anthropic-spend-regressions.spec.ts:49` | passes in the fix report |
| 9 | Dotted replacement | FIXED (not re-run) | spec :59-67 | |

## 2. Specific checks

**(a) Corrupt-storage repair** – `lane-spend-ledger.service.ts`
- Repair happens only inside `clear` (`enqueue(..., true)`, :87); `recordUsage`/`recordCreditEvidence` throw "unavailable" (:31). OK.
- Backup is written first (:39); if it throws, `state`/`available` are untouched and the active key is not overwritten (:41 not reached). OK (spec :133).
- Reads: `readSpend` returns `availability: 'unavailable'`, `periods/cumulative: null`, coverage `none`; no zero. OK.
- Owner-scoped clear on a corrupt store: other owners' events/owners/credits are dropped from the active key (new state is empty plus the requester's reset marker). Their data survives only in the single backup key. Acceptable for now because it was unreadable anyway and is backed up; but the backup key is a single slot, so a second corruption+repair overwrites the first backup (minor). A log line could mention that repair discarded other owners; there is none (minor).
- `readSpend` after a failed persist still returns the prior `state` (not published): OK.

**(b) 1h cache write** – split present: subset at 1h rate, remainder at 5m. Absent with creation>0 and a 1h rate: `partial`, not `full`. Subset > total: `usageIncomplete` (no negative 5m part). Zero: `full`, cost 0 only for genuinely zero usage. Correct by reading; tests exist in the regression spec (not re-run).

**(c) Haiku 5.5 tiers** – the final on-disk file is **wrong**. I read the corrected version (tier ≤100,000 gives 0.10/0.50, 0.125, 0.01, 1h 0.20) at about 17:29:21, then the file changed at 17:29:33 and now excludes ≤100,000 again. Something is concurrently rewriting `anthropic-rate-card.ts`; this is the "old exclusion restored" the fix report mentioned. The unknown-context case does remain unpriced (`null`). The spec and the card now disagree. The boundary at exactly 100,000 therefore cannot be called correct. Also note the 1h rate is computed as `input * 2`, which gives 0.20 low tier and 1.00 high tier, matching the stated values.

**(d) Rename** – no `plan-limit-ledger`, `PlanLimitLedgerService` or `plan-usage-classifier` hit under `libs/backend/vscode-core`, `libs/shared`, `libs/backend/platform-core`. The other repo hits are the existing auth-providers class and its users, which is expected. `git diff --stat -- libs/backend/auth-providers` empty. OK.

**(e) Exports** – `shared/src/index.ts`: two additive `export type` blocks only. `vscode-core/src/index.ts`: additions only, in the file's existing style; `classifyLaneUsage` is a production function; no test helper exported. Note that `TOKENS` is now also exported alongside two bare token symbols (consistent with the file's use).

**(f) New defects** – no `as any`, `as unknown as`, `: any` or `@ts-ignore` found in the new files (the grep with wildcards partly failed on Windows, so this was checked by directory for the ledger and plan-usage, and by reading the ledger service, which has none). No non-null `!`. The catch blocks log only `error.name` (no owner id). One empty-bodied `.catch(() => { /* comment */ })` at :50, which is commented and acceptable. Other points:
- Event dedupe key uses `ownerKey` inside the stored record (fine), never logged.
- Minor: `clear` mutates `owner.revision` after parse; harmless.
- The `providerReportedCost` early return in `calculateExactMessageCost` bypasses the rate card for api-key mode; confirm that is intended.

## 3. Verdict: REVISE

Blocks a commit:
1. `anthropic-rate-card.ts:25` again excludes Haiku 5.5 at ≤100,000 context tokens, and the regression spec fails (3 tests). Find and stop the concurrent editor, restore the low tier, and re-run both rate-card specs after nothing else writes the file.
2. Rate card values remain unverified by me; accept the fix report's confirmation explicitly, or have the coordinator check the official page.

Can go to a later batch:
- Registration of the spend tokens in the Electron and CLI composition roots (2I/2J).
- Single-slot corrupt backup; a log line when repair discards other owners' data.
- Unbounded event growth/retention (deferred in a code comment).
- Budget enforcement (2E).

Checks I ran: `jest` for `anthropic-spend-regressions.spec.ts` + `anthropic-rate-card.spec.ts` (1 suite failed, 3 tests failed). `jest` for `lane-spend-ledger.service.spec.ts` (1 suite, 16 tests passed). I did not run tsc or eslint; rely on the coordinator's gate for those.

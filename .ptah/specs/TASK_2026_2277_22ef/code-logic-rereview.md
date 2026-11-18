# Code logic re-review (fix round)

## Verdict
**APPROVED.** All 15 defects and all 15 coverage rows are fixed in the code. No Blocking or Serious new defects. Two Minor leftovers are listed below.

Paths are relative to `libs/backend/auth-providers/src/lib/quota/readers/` (reader dir) unless noted. Nothing was run except `node -e` regex tests.

## Specific points
1. **OAuth `invalid_grant`:** fixed. `antigravityFailure` maps `invalid-grant` and `http-rejection` to `status: 'service-unavailable'` and `statusReason: 'usage-auth-rejected'` (`antigravity-oauth-plan-usage.reader.ts:66-73`). `unsupported-auth` no longer appears in either Antigravity reader (grep). Each stage returns `ok:false` and `readUsageSourceChain` continues (`usage-source-chain.ts:72-76`), so the local stage still runs. This is asserted at `antigravity-plan-usage.reader.spec.ts:62-69` and `:431-437`. `observeAccount(null)` runs after the candidate loop when no candidate answered (`antigravity-plan-usage.reader.ts:227`), on abort (`:222`) and on the outer catch (`:230`). It is tested at `spec:438-452`.
2. **CLI adapter removal:** done. Both files are deleted (`Test-Path` false). `git grep` over the whole repository (excluding `.ptah`) finds no `antigravity-cli-usage`, `readAntigravityCliUsage` or `parseAntigravityCliUsage`. `apps/ptah-electron`, `libs/backend/cli-engine` and the `index.ts` barrels have no reference. The CLI stage still records `antigravityFailure('cli-command','source-unavailable')` when `allowCliFallback` is true (`antigravity-plan-usage.reader.ts:117-126`). The spec asserts it at `spec:29-40`, and `run` is never called with `agy`.
3. **Restored tests:** assert real behaviour. I compared 10 rows with `git show HEAD:<spec>` (rows 1, 2, 3, 4, 5, 7, 8, 9, 10, 11). The assertions are identical to HEAD (request order, `observe` called with email or `null`, model name cap, headers and body over a real loopback server, `status: 'service-unavailable'` and so on). The only change is `target`, which now carries a typed `ownerRef` instead of `as never`. Row 6 spies on `removeEventListener` as at HEAD. The OAuth rows (12-15) were checked by test name and location only.
4. **Grok reader:** an HTTP 200 body without `config` gives `available`, `windows: []` and `windowSetEstablished: true`. The `!parsed.data.config` clause is gone (`grok-account-plan-usage.reader.ts:184-186`); the test is at `grok spec:425-441`. `reject()` drops `statusReason` for `owner-not-applicable` and `custom-auth-config` (`:74-77`); the tests are at `spec:377`, `:404` and `:496`. The debug log carries only `{status, reason}` (`:78`). No key, token, email or body is logged.
5. **Gate and classifier:** `GROK_BALANCE_LEADING_REGEX` is gone (grep finds none). I extracted the gate `STRUCTURED_EXIT_ZERO_LIMIT_ERROR` from `agent-process-manager.service.ts:176` and the classifier regex, and ran both with `node -e` (gate / classifier):
   - `  "message": "API error (status 402 Payment Required): Grok Build usage balance exhausted",` gives true / true.
   - The raw JSON line and the plain `API error (...)` line give true / true.
   - Five prose false-positive lines give false / false: "the docs say 402 Payment Required...", "Payment required: please update...", "invoice #402 payment failed", "The test expects status 402 when...", "HTTP 402 payment declined by Stripe".
   - Two more negatives give false / false: `API error (status 402...): card declined` and `fix: handle 402 Payment Required: usage balance exhausted message in UI`.
   - The gate accepts nothing the classifier rejects.
6. **`owner-lifecycle.integration.spec.ts`:** the `stderr` mode (`:367-371`) emits the four real segments in order (`Error: Internal error: {` error, the `"message"` line error, `"http_status": 402` info, `}` info). It asserts `usage-limit`, one `grok-balance-exhausted` evidence entry, no `resetsAt`, and `at-limit`. Negative cases: `prose` (`:386-390`), `quoted`, `bare` and `unrelated`, all with `limited: false`.

## Defect status

| id | status | file:line |
|---|---|---|
| AG-1 `invalid_grant` gave `unsupported-auth` and skipped local | fixed | `antigravity-oauth-plan-usage.reader.ts:66-73`; `antigravity-plan-usage.reader.ts:96-116`; `spec:62-69`, `:431-437` |
| AG-2 `observeAccount(null)` lost when no candidate answers | fixed | `antigravity-plan-usage.reader.ts:222`, `:227`, `:230`; `spec:438-452` |
| AG-3 CLI adapter was dead code | fixed | files deleted; `antigravity-plan-usage.reader.ts:117-126`; no references remain |
| AG-4 unreachable `statusReason` ternary | fixed | `antigravity-plan-usage.reader.ts:133` (conditional spread) |
| AG-5 identical ternaries (`request-failed`) | fixed | `antigravity-plan-usage.reader.ts:108-109`, `:231-232`; grep clean |
| AG-6 hard-coded 10 s OAuth timeout | fixed | `antigravity-oauth-plan-usage.reader.ts:90`, `:122` |
| AG-7 `budgetUnavailable()` without failure detail | fixed | `antigravity-plan-usage.reader.ts:144` (`antigravityFailure('local-rpc','timeout')`) |
| GK-1 HTTP 200 without `config` changed mapping | fixed | `grok-account-plan-usage.reader.ts:184-186`; `grok spec:425-441` |
| GK-2 custom env / TOML gave `usage-auth-rejected` | fixed | `grok-account-plan-usage.reader.ts:74-77`, `:92-93`, `:122`; `grok spec:377`, `:496` |
| GK-3 non-`cli-store` owner gave `account-unverified` | fixed | `grok-account-plan-usage.reader.ts:88-89`, `:74-77`; `grok spec:404` |
| GK-4 gate and classifier disagreed (`LEADING` regex) | fixed | `lane-limit-classifier.ts:73-76` (regex removed); `agent-process-manager.service.ts:176`; `node -e` results above |
| GK-5 ledger test copied production condition | fixed | `plan-limit-ledger.service.spec.ts:1576-1599` now calls `clearOwnerEvidenceByPattern` on the real ledger |
| GK-6 exit-0 test used simplified text | fixed | `owner-lifecycle.integration.spec.ts:367-371`, `:386-390` |
| GK-7 import before `reflect-metadata` | fixed | `plan-limit-ledger.service.spec.ts:1` (`reflect-metadata` is first) |
| GK-8 raw stdout JSON failed the gate | fixed | `agent-process-manager.service.ts:176` (JSON alternative; `node -e` true / true); `owner-lifecycle spec:372-382` (`raw-json`, `raw-json-direct`) |

## Coverage status

| row | status | spec file:line (`antigravity-plan-usage.reader.spec.ts` unless noted) |
|---|---|---|
| 1 HTTPS then HTTP, mapping, email hidden | fixed | `:164-183` |
| 2 extension-port fallback | fixed | `:184-204` |
| 3 padded pids, ambiguous servers, no ports | fixed | `:205-246` |
| 4 model name cap, reset, logger privacy | fixed | `:247-282` |
| 5 real loopback headers and body | fixed | `:283-315` |
| 6 removes caller abort listener | fixed | `:316-325` |
| 7 quoted args, abort discovery, closed port | fixed | `:326-376` |
| 8 clears stale observation | fixed | `:377-391` |
| 9 omits model with no fraction | fixed | `:392-405` |
| 10 transport constants exact | fixed | `:406-416` |
| 11 settles once on request error | fixed | `:417-426` |
| 12 OAuth: returns before reading an aborted request | fixed | `antigravity-oauth-plan-usage.reader.spec.ts:71-87` |
| 13 OAuth: caps JSON bodies | fixed | `oauth spec:88-118`, `:188-193` |
| 14 OAuth: `fetchAvailableModels` and `groups` | fixed | `oauth spec:119-153`, `:194-203`, `:204-` |
| 15 OAuth: second endpoint after quota 403 | fixed | `oauth spec:154-186` |

## New defects

1. **Minor**, `antigravity-usage-json.parser.ts` and `antigravity-usage-json.parser.spec.ts` (and `antigravity-usage-window.ts` if only the parser uses it). After the adapter was deleted, only the parser's own spec references the parser, so it is now dead production code. Effect: dead code with a self-testing spec. Fix: delete them, or note that they are kept deliberately. This does not block.
2. **Minor**, `antigravity-plan-usage.reader.spec.ts:164-426` (restored local tests). They pass `allowCliFallback: true` and leave `readStoreOwner` at its default, which reads the real `~/.gemini` store. The CLI stage runs this read only in the failure paths with an `account` owner, and the assertions do not depend on the result. Effect: the tests are host-dependent but harmless. Fix: pass a stub `readStoreOwner` in the `reader()` helper.
3. **Minor (noise)**, `plan-limit-ledger.service.spec.ts`, `lane-limit-classifier.spec.ts` and `grok-account-plan-usage.reader.ts` carry large formatting-only hunks (prettier reflow), which makes the diff harder to review. No behaviour effect.

No Blocking, Serious or Moderate new defects.

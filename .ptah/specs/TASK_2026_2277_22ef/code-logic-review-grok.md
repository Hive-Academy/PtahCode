# Code logic review — Grok limits (read-only)

## Verdict
**REVISE — 6.5/10.** The real Grok 402 error is classified correctly in the real pipeline. The reader has one behaviour change at HTTP 200 that the task says must not exist. The new `statusReason` values are partly misleading. Two tests restate production logic or use a simplified input.

## Defects

1. **Serious — `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts:145`**
   - `if (!parsed.success || !parsed.data.config) return reject('service-unavailable','cli-parse-failed')` changes the HTTP 200 mapping.
   - At HEAD, `BillingSchema.config` is `.optional()`. A 200 body of `{}` or a body with no `config` gave `status:'available'`, `windows:[]`, `windowSetEstablished:true`. It now gives `service-unavailable`.
   - A 200 with a valid schema but no `config` is therefore no longer "available".
   - Fix: remove the `|| !parsed.data.config` clause to keep HEAD behaviour. If the change is intended, add a test and state it explicitly.

2. **Moderate — `grok-account-plan-usage.reader.ts:71` and `:96`**
   - Custom `GROK_OIDC_*` env vars and `[auth]/[endpoints]` TOML config return `reason: 'usage-auth-rejected'`.
   - No auth was rejected. The status is still `no-usage-source`, but the reason now reaches the UI (`plan-usage.service.ts:611`).
   - Fix: leave `statusReason` unset (HEAD behaviour), or use a neutral reason such as `source-not-applicable`.

3. **Moderate — `grok-account-plan-usage.reader.ts:69`**
   - A non-`cli-store` owner now returns `statusReason:'account-unverified'`.
   - `usage-source-chain.ts:12-13` ranks `account-unverified` at 0, the highest priority.
   - It also feeds the `usable()` guard at `usage-source-chain.ts:28`.
   - At HEAD there was no reason, which maps to `source-not-applicable` at rank 99.
   - If this reader is ever placed in a chain, the new reason can displace a more informative failure.
   - Fix: leave the reason unset here.

4. **Moderate — `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.ts:74-75` and `:177`**
   - `GROK_BALANCE_LEADING_REGEX` has no `m` flag. The gate `STRUCTURED_EXIT_ZERO_LIMIT_ERROR` (`agent-process-manager.service.ts:176`) has `m` and a `\s*` after `^`.
   - A segment such as `"Error: x\n402 Payment Required: Grok Build usage balance exhausted"` passes the gate. The classifier then returns null.
   - Result: `usageMatched` is true, so `stopReason` becomes `usage-limit` (`agent-process-manager.service.ts:3695`), but no ledger evidence is recorded (`limit` is null).
   - The regex is not fully dead. It matches a single-line segment that starts with the text.
   - Real Grok output never produces that single-line form. Each stderr line is its own segment (`acp-session-handle.ts:288-292`), and the real line is `"message": "API error (status 402 …`, which `GROK_BALANCE_REGEX` already covers.
   - Fix: add the `m` flag to `GROK_BALANCE_LEADING_REGEX`, or drop the regex and the matching gate alternative. The gate and the classifier must accept the same texts.

5. **Moderate — `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts:1556-1565`**
   - The `it.each([5,0,'invalid'])` test copies the clearance condition into the test body (`if (reading.status==='available' && hasCredits && requestedAt!==undefined) ledger.clear…`).
   - It does not call production code for that decision. It only verifies the reader output plus the test's own `if`.
   - If production changes the condition, the test still passes.
   - Fix: call the real production path (the service method that clears the evidence), or move the test into the service spec.

6. **Moderate — `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/owner-lifecycle.integration.spec.ts:~321-340`**
   - The exit-0 case emits one `error` segment with the simplified text `402 Payment Required: Grok Build usage balance exhausted`.
   - The real input is separate stderr-line segments, and the passing line is `"message": "API error (status 402 Payment Required): Grok Build usage balance exhausted",`.
   - The test does not cover the real form. It covers the new leading alternative, which is the one never produced by the real pipeline.
   - Fix: add a case that emits the real segments in order: `Error: Internal error: {` (error), the `"message": "API error (status 402 …` line (error), `"http_status": 402` (info), `}` (info). Assert at-limit.

7. **Minor — `plan-limit-ledger.service.spec.ts:1`**
   - The new import is placed before `import 'reflect-metadata'`, which must stay first.
   - Fix: move the import below it.

8. **Minor — `agent-process-manager.service.ts:176`**
   - The raw stdout JSON form fails the gate. Test result: `raw gate=false`, while `GROK_BALANCE_REGEX` alone matches (`true`).
   - It is not an error segment in the real ACP pipeline: ACP stdout is JSON-RPC, and stderr goes through `classifyCliStderr`.
   - It becomes a gap only if a future non-ACP path emits the JSON line as an `error` segment.
   - Fix if needed: add `|\{"type":"error","message":"(?:Internal error: \{\\n\s*\\"message\\": \\")?API error \(status 402 Payment Required\)`.
   - The classifier spec at `lane-limit-classifier.spec.ts:~176` already covers that JSON text, but only for the classifier. It never goes through the gate.

## Checked and clean

- **Check A — real pipeline.**
  - Grok runs over ACP (`grok-cli.adapter.ts:4-8`). Each stderr line becomes its own segment, trimmed (`acp-session-handle.ts:288-292`). The type is `'error'` when the line contains the word error, fail, etc. (`cli-stderr-severity.ts`).
  - Segments for the real stderr:
    - `Error: Internal error: {` — error. Gate false, classifier false. Harmless.
    - `"message": "API error (status 402 Payment Required): Grok Build usage balance exhausted",` — error. Gate **true** (`node -e`). `GROK_BALANCE_REGEX` **true**, via `\bstatus[\s:=("]{0,6}402`.
    - `"http_status": 402` and `}` — info, not collected.
  - So the real error passes both the gate and the classifier. No at-limit / reset-unknown problem was found. `describeGrokError` (`grok-acp-profile.ts:70`) has no 402 branch. Error content on a JSON-RPC failure is `errorText(error)` via `emitError` (`acp-session-handle.ts:761`), which is a different text path.
  - False positives: `fp1` (prose: "the docs say 402 Payment Required: …") — gate false, classifier false. A line that starts with `"message": "API error (status 402 Payment Required): Grok Build usage balance exhausted` matches. That would need quoted repo text in an error-typed stderr line of an exit-0 run. This is highly unlikely and acceptable.
- **Check B — reader.**
  - The HTTP 200 mapping of windows, credits and malformedBalance is unchanged from HEAD, except defect 1.
  - The 401 branch still returns `status:'unsupported-auth'`; the new `balance-auth-rejected` reason is added. 403 is still `no-usage-source`. 402 and `!ok` still map to `service-unavailable`.
  - Each rejection path has a distinct reason; where several paths share a reason, the debug log carries the status as well.
  - The debug log carries only `{status, reason}`. No key, token, email or body is logged or returned.
  - No failure maps to `available`/room.
- **Check C — callers.**
  - `createGrokAccountPlanUsageReader` is used only at `plan-usage.service.ts:78` (import) and `:242` (the changed call), plus specs. The fifth parameter is optional. `libs/backend/cli-engine` and `apps/ptah-electron` do not call it. No broken caller.
  - `Pick<Logger,'debug'>` is satisfied by `Logger`.
- **Check D — other tests.**
  - The classifier spec has the real JSON-text case and good negatives ('402', 'repository says: …').
  - The reader spec asserts the actual status/reason and the log call, with a real timeout path.
  - The owner-lifecycle exit 1 / exit 0 unstructured / exit 0 structured matrix asserts real ledger state.
- **Check E — rules.**
  - No `any`, no non-null `!`, no `console.*`.
  - The catches are `catch (error: unknown)` with `instanceof` checks. The ENOENT check now avoids the old `as` cast.
  - The Zod parse of the billing response is kept. `JSON.parse(contents)` goes through `CredentialSchema.safeParse`, which was already there.
  - The `as never` casts in specs are test-only mock casts.

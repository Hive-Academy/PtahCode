## Changes

- Codex bucket flags now attach to rate windows only at 100% or above. An unmatched reached/spend flag becomes a separately named `other:<bucket>:usage-gate` window with provider evidence; allowance metadata retains its flag.
- Fresh provider API readings at 100% now synthesize active window evidence for classification and lane reasons. Aged, stale, estimated, and passed-reset readings do not use this inference.
- Ledger rules were unchanged: their existing `namesGate` check now receives no flag on a 7% window.

## Tests

- Added Codex reader regressions for a 100% five-hour / 7% weekly split and a separate bucket gate below 100%.
- Added a ledger regression that retains a known-reset error-derived 429 after a newer 7% table read; existing table-hit clearance tests cover the provider API case.
- Added window and lane regressions for fresh 100% provider readings and named at-limit reasons.

## Check results

- Auth providers Jest: 2 suites passed, 84 tests passed.
- Shared Jest: 2 suites passed, 73 tests passed.
- Auth providers `tsc --noEmit`: passed, zero diagnostics.
- Shared `tsc --noEmit`: passed, zero diagnostics.
- ESLint changed files: 0 errors, 1 existing non-null assertion warning in `plan-limit-ledger.service.spec.ts:662`; module-boundary rule skipped because no cached ProjectGraph.
- Ptah diagnostics: initially unavailable because its TypeScript check exceeded 45 seconds; CLI TypeScript checks above passed.

## Decisions

- Decision: represent a bucket flag with no full rate window using the existing `PlanLimitWindow` `other:${string}` shape. Options were allowance metadata alone or a separate named window. The allowance has no exhaustion field and cannot produce a lane reason; the window can. Reversible within the reader.
- Decision: infer provider 100% exhaustion only when the classifier supplies a fresh available context. Existing explicit exhaustion still follows its established rule. Reversible in `activeWindowExhaustion`.
- `ordinaryUsageAllowed` is parsed in `codex-protocol-methods.ts` but is absent from `CodexAccountUsageResult` and discarded by `usageResult` in `codex-account-usage-client.ts`. It is not reachable from this reader within the write set, so only the per-window reached/spend rule was implemented.

## Coordinator change

- I removed the `other:<bucket>:usage-gate` window. It carried exhaustion for a bucket flag
  with no window at 100%, so a `workspace_owner_credits_depleted` flag with 60% and 70% windows
  made the lane AT LIMIT. Ordinary usage continues in that case (the earlier spec said
  "marks nothing"). The flag stays on the allowance with its original label. A real gate needs
  `ordinaryUsageAllowed === false`, which the codex client drops today (follow-up, batch c).
- Re-run: auth-providers reader + ledger specs, 2 suites, 84 tests passed.

## Extra reads

- `usage-sources.md` Causes 1 and 4; Codex runtime protocol/client/types; shared plan-limit types; existing reader, ledger, window-state, and lane-state specs.


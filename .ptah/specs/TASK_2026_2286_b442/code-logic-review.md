# Code Logic Review — TASK_2026_2286_b442

Review family: codex (implementer family: claude)

Score: 5/10

Verdict: REVISE

The read order, process bounds, and core dashboard states are in place. The score reflects wrong-account evidence, a possible billable background invocation, hidden recovery information, and contradictory pricing displays. The fixture confirms that the tested CLI output can be zero-turn. It does not establish that property for every executable the dashboard can launch.

## Defects

1. **Major — The first background CLI invocation can take a model turn.**  
   `libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.adapter.ts:102`  
   The adapter passes `-p /usage` to whichever `agy` resolves on PATH. If that CLI treats an unavailable or unsupported slash command as a normal prompt, the provider can already have consumed a turn before line 111 inspects the reply. The cooldown is scoped to the owner and account fingerprint and expires, so changing accounts or waiting can allow another paid attempt. Snapshot assembly opts in at `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts:334`, including push assembly. Gate automatic execution on a side-effect-free capability check or a verified command-only CLI invocation. Disable that executable version for automatic execution after a turn is detected. Keep result validation as a second layer.

2. **Major — An account switch can publish and cache another account’s quota.**  
   `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts:130`  
   The post-run check at line 140 only checks account targets. A valid CLI-store target can start while the store has no identifiable email, pick up a new sign-in during the run, and publish the new account’s windows under the old store target. For an explicit account target, the reader can reject the immediate result after a switch, but the runner has already cached the windows under the pre-run fingerprint at `libs/backend/auth-providers/src/lib/quota/readers/fallback-usage.runner.ts:107`. Switching back within 30 seconds can replay that rejected result. Require the store fingerprint to match before and after execution for all eligible owner kinds. Admit the result to the cache only after that validation, or invalidate the rejected run’s cache entry. Cover both a CLI-store transition and a rejected account read followed by a switch back.

3. **Major — CLI-only users see the wrong recovery instruction.**  
   `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts:148`  
   When both optional sources are absent, a real CLI failure such as `cli-not-found`, `cli-not-signed-in`, `cli-timeout`, or `cli-parse-failed` loses to the earlier OAuth missing-token reason. The renderer says “Not signed in to Antigravity (OAuth)” even when installing or signing in to `agy` is the relevant action. Preserve account mismatch and substantive source failures where appropriate. If earlier sources were absent and the CLI was attempted, promote its actionable reason to the snapshot DTO. Assert `statusReason` at `antigravity-plan-usage.reader.spec.ts:90` in addition to the internal `sourceFailures` array.

4. **Major — Rendered money diverges for the same amount.**  
   `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-kpi-strip.component.ts:84`  
   The raw-cost KPI and the savings display and tooltip at line 111 still use `formatUsd`. For $0.0034 of known savings they display $0.00 while the quality panel displays $0.0034. The daily chart also uses its compact axis formatter for focused-day data at `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.ts:155`, so detailed amounts such as $1.24 and $1.20 can read the same. Use `formatCostCell` for the KPI and its tooltip, preserving “Unknown” and the lower-bound prefix. Use the shared money path for detailed chart data and scope compact tick formatting to axis labels.

5. **Major — The provider bar disagrees with its stated share.**  
   `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-cost-summary.component.ts:57`  
   With two providers priced at $60 and $40, the cards show “60% of cost” and “40% of cost” beside bars filled to 100% and about 67%. On `main`, the provider summary used the share of the total for the width, which matches the binding share denominator. Derive the bar width from `row.shareOfCost` and pair a width assertion with the share text for a multi-provider fixture.

6. **Minor — A canceled owner read can leave a CLI run active or still waiting to launch.**  
   `libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.adapter.ts:106`  
   The adapter passes the subscriber signal only. The runner’s abort handler at `libs/backend/auth-providers/src/lib/quota/readers/fallback-usage.runner.ts:118` releases that waiter. Process launch and cancellation use a separate `runSignal` at lines 162–170. If the only reader cancels during temporary-directory creation, execution can start afterward and continue to the deadline. Track the lifetime of shared execution and abort the underlying run when its last consumer leaves. Preserve the flight while a live consumer still depends on it.

7. **Minor — An explicit CLI failure envelope can be treated as fresh quota.**  
   `libs/backend/auth-providers/src/lib/quota/readers/antigravity-usage-json.parser.ts:19`  
   The parser ignores the live envelope’s status. An exit-zero payload with `status: "ERROR"`, zero turns, and structurally valid `command.data.groups` is accepted as available and the DTO marks the window set established. Reject explicit failed statuses before reading buckets. Validate a nonnegative integer turn count when present, and test a contradictory envelope containing valid buckets. Preserve the agreed legacy command shape independently.

8. **Minor — Segment gaps systematically clip the last provider.**  
   `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-breakdown-table.component.ts:118`  
   In the concentration strip, the children are fixed percentages totaling at least 100% and the container adds a gap between each child, then clips overflow. A tail provider with a very small positive share can disappear. The same issue occurs on the peak day at lines 250–259 because its segment widths sum to 100%. Distribute the available width after gaps in proportion to the actual weights, or draw dividers inside the segment boxes.

9. **Minor — The chart announces a peak the data cannot establish.**  
   `libs/frontend/dashboard/src/lib/components/usage-dashboard/stacked-bar-chart.component.ts:292`  
   With $10 fully priced on Monday and wholly unpriced usage on Tuesday, the chart announces “peak Monday: $10.” The qualifier only checks whether Monday itself is partially priced. Tuesday could be the true peak. Use “highest known cost” when any day is unpriced, or omit the peak claim for partial cost data. Token mode can keep the unqualified peak.

10. **Minor — Two old parity assertions lost coverage.**  
    `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts:92` now checks that the CLI was not invoked without opt-in, but the old assertion that the store was not consulted disappeared when the enabled-path test was rewritten. Keep both by injecting a store spy in the disabled case. In `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.spec.ts:127`, separate substring checks let an incorrect value such as `115` pass even though the old “Recorded tokens: 15” assertion would fail. Assert the exact count on the value element, along with the label.

## Five logic questions

1. **How does this fail silently?** A rejected read can seed the wrong-account cache and an explicit failed CLI envelope can appear available. On the error path the user may see an OAuth instruction unrelated to the failing CLI.
2. **What user action produces unexpected behaviour?** A sign-in switch during a pending dashboard read can bind quota to the previous store target. Closing or superseding a read does not cancel an already-started CLI flight when it has no consumers.
3. **What input produces a wrong answer?** Positive sub-cent money produces conflicting displays. A multi-provider fixture exposes mismatched share bars. A partially priced range can produce an unsupported peak claim.
4. **What happens when a dependency fails, times out, or returns an invalid shape?** Nonzero exit, malformed JSON, oversized output, and runtime timeout are bounded by the runner. A classified CLI failure can be hidden by reason precedence. A missing executable still repeats PATH resolution on an uncached read, with no child process launched.
5. **What safety or lifecycle requirement is missing?** The background read needs a pre-launch guarantee that the command cannot dispatch a model prompt. Failed ownership validation also needs to prevent cache admission.

## Checked and found correct

- The cold CLI-only source remains eligible when OAuth and the language server are absent. Valid older `windows` and live `buckets` fixtures are supported, and invalid row ranges are rejected. `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts:102`, `libs/backend/auth-providers/src/lib/quota/readers/antigravity-usage-json.parser.ts:44`.
- A pull does not spawn a fresh CLI process on every snapshot. Pull snapshots and successful owner reads have 30-second caches. Refresh bypasses the outer caches, while the CLI runner still joins identical flights, permits one active run per source, caches successes for 30 seconds and backs off failures. Push assembly uses the owner and runner caches. The 10-second broadcaster bound can expire before the reader’s 11-second chain ends on a slow push. A subsequent ledger change can re-arm a push, so the push timeout should not be interpreted as process cancellation. `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts:214`, `libs/backend/rpc-handlers/src/lib/handlers/plan-limits-broadcaster.ts:46`, `libs/backend/auth-providers/src/lib/quota/readers/fallback-usage.runner.ts:84`.
- The chart retains focusable columns, arrow handlers, marker, live readout and idle prompt. The complete provider rows remain mounted in both donut modes, including zero-cost and folded providers. Cost quality has the full row and retains the focusable savings description. `libs/frontend/dashboard/src/lib/components/usage-dashboard/stacked-bar-chart.component.html:129`, `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.html:104`, `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-cost-quality.component.ts:74`.
- Day and session data are folded at narrow widths with the title values carried through. Repository coverage text and expanded worktree paths remain independent of usage facts. Plan Limits is projected outside the loading, error and empty branches and retains Details, Retry and Settings. `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-breakdown-table.component.ts:233`, `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-top-sessions.component.ts:99`, `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.html:60`.

## Verification

Static review of the 33 tracked changed files and seven untracked source and spec files against the base diff and binding parity section. `git diff main --check` passed for the tracked diff. Tests, compiler diagnostics, the CLI and Electron were not run under the read-only review scope. Actual rendered widths and installed CLI behavior outside the captured fixture remain unverified.

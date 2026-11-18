# Code logic review

Verdict: **CHANGES REQUESTED**

Score: **5/10**. Request cancellation and page composition are coherent, but comparisons can misstate incomplete data and the replacement cards discard meaningful readings. These are correctness gaps beyond the 7â€“8 band; the underlying request/grouping architecture does not warrant a 3â€“4.

Paths below are relative to `libs/frontend/dashboard/src/lib/`, unless stated otherwise.

## Findings

1. **Major â€” Requested dates do not prove data coverage.** `services/kpi-delta.ts:67` checks summary boundaries only. A wider response with `sources[].coverageStart` halfway through the previous period, or a timed-out source, still produces a comparison if any facts remain. This presents incomplete history as an equal-period change. **Fix:** check actual source coverage and comparable source availability for both periods; return null when coverage cannot support the comparison. Add a late-ledger-start fixture (metadata contract: `libs/shared/src/lib/types/rpc/rpc-analytics.types.ts:43`).

2. **Major â€” Unknown spend becomes a numeric change.** `services/kpi-delta.ts:89` converts unpriced costs to zero and `:119` compares the resulting totals. Previous spend $5 plus wholly unpriced current usage yields â€œâˆ’100%â€ beside an â€œUnknownâ€ cost; equal known subtotals with unknown costs yield a fabricated 0%. **Fix:** retain pricing completeness and return a null spend delta when either period has unknown spend. Tokens can remain comparable independently.

3. **Major â€” Refresh combines different request generations.** `services/analytics-usage.store.ts:145` retains the previous wider summary on same-scope refresh, while `:166` and `:198` publish the two responses independently. A fast main response uses the old denominator until the wider request finishes; a fast wider response changes the comparison against the old main summary. A later wider failure only then clears it. **Fix:** publish a matched pair per generation, or invalidate comparison data during refresh and expose it only after both matching responses succeed. Test both completion orders and wider failure after a successful prior load.

4. **Major â€” Details loses the data it promises to contain.** `components/plan-limits/provider-limit-card.view-model.ts:178` builds details for the primary window only; `:223` retains only the first accounting item, and `:289` never forwards remaining accounting, model usage or owner evidence. Four-window cards advertise â€œ+1 more in Details,â€ but that window is inaccessible. Active owner-only limit hits render an Unknown card with no hit explanation. Quota-plus-local-usage owners lose their local figures entirely. **Fix:** include every window, all accounting/model readings and scoped owner evidence in Details; keep active owner evidence visibly identified without inventing a window percentage. Assert the actual popover contents.

5. **Major â€” Unconfirmed readings become Available.** `components/plan-limits/provider-limit-card.view-model.ts:111` maps every remaining state with a percentage to `available`, including `not-confirmed` and `estimate-only`. `:248` also falls back to the first window when none qualifies as primary. A 100% estimated reading can therefore say Available, without an estimate marker when there is no estimated exhaustion record. **Fix:** preserve explicit unconfirmed/estimated qualifiers and derive estimation from reading provenance; keep fallback readings visibly qualified. Add fixtures without last-reset confirmation and with `usedSource: 'estimated'`.

6. **Minor â€” Absolute times escape Details.** `components/plan-limits/provider-limit-card.view-model.ts:284` copies `tile.cooldown`/`tile.statusNotice` directly. Those strings contain absolute cooldown and stale-since times (`components/provider-account-card/plan-tile-view.model.ts:105`, `plan-owner.model.ts:145`). **Fix:** generate relative notices for the card and put absolute timestamps in Details. Test cooldown and stale-owner cases, not just the exhausted reset line.

7. **Minor â€” Docs screenshot crop now includes account cards.** `components/dashboard-grid/dashboard-grid.component.html:13` projects account cards inside `ptah-usage-dashboard`. `apps/ptah-electron-e2e/src/docs-screenshots/sessions.shot.ts:45` still crops that entire component expressly to exclude account identities. **Fix:** mask plan limits for the documentation shot or crop a dedicated usage-only region. Existing usage test ids still resolve; they no longer preserve the crop's intended content boundary.

## Five logic questions

1. **Silent failure?** Hidden windows/accounting/evidence disappear without an error (finding 4).
2. **Unexpected user action?** Refresh transiently mixes comparison generations (finding 3).
3. **Wrong-answer input?** Partial history, unpriced costs and unconfirmed percentages (findings 1, 2, 5).
4. **Dependency failure?** Wider failures do not set `loadError`, and generation guards reject superseded responses (`services/analytics-usage.store.ts:197`); same-generation pairing still needs finding 3's fix.
5. **Unstated requirement?** Projection changes the existing screenshot content boundary (finding 7).

## Evidence and limits

Reviewed the store/helpers, new plan-limit components and mapper, grouping/window/accounting dependencies, toolbar, usage/page templates, KPI/trend helpers, relevant tests and screenshot consumers against both supplied redesign documents and `visual-spec.md`. UTC midnight arithmetic and exclusive-end slicing are consistent (`services/kpi-delta.ts:40`, `:70`); zero/nonfinite previous totals return null (`:104`). Grouping deduplicates owner keys and partitions them once (`components/provider-account-card/provider-account-grouping.model.ts:22`). Toolbar refresh calls both stores (`components/dashboard-grid/dashboard-toolbar.component.ts:79`); projection is unconditional across usage states (`components/usage-dashboard/usage-dashboard.component.html:61`). New components use OnPush and signal APIs; no new innerHTML binding was found.

Focused Jest run: **7 suites, 75 tests passed** (delta, analytics store, card mapper/rendering, panel, toolbar, usage dashboard). These tests omit the scenarios above. Scoped `ptah_get_diagnostics` twice returned unavailable after its 45-second limit; no typecheck pass is claimed. No build, Nx, e2e or visual verification ran. Skill loading was unavailable in this lane. Only this review file was written.


# TASK_2026_2266_a6fd — Settings > Providers lanes to the prototype

Program: TASK_2026_1177_9109 (design system epic), child D. Base: origin/main 867a8a3e8 (PR #1408).

## Defects (from the coordinator brief)

1. BUG: the Test action of a SYSTEM lane (claude, codex, ...) calls `ptahCli:testConnection`, which
   knows only Ptah CLI instances, so it reports "This instance was not found".
2. Lanes table Permission / Network cells repeat the column header as a label above the select.
3. Unequal row height: the "Unsupported combination…" note sits in the cell. "Choose a permiss…" truncates.
4. Lanes header: "Edit lane order" alone and centered. Target: "Lanes" + count, ring, "Edit order",
   "New Ptah CLI instance" in one header row.
5. Expanded lane detail has no layout. Target: one aligned `ptah-table-detail-layout` grid. Detail
   reachable at all widths.
6. Expanded detail at 600 px: tall cells, horizontal scroll, clip.
7. "Ptah CLI defaults" and "Background models": title + help at left, controls at right, `[ptahFieldGrid]`.
8. Shared `@ptah-extension/ui` components only; no native select menu on the page.

## Decision for defect 1

Frontend-only, with existing probes (no new RPC, no new injectable):

- System lane Test = `agent:detectClis` (the existing detection probe), then the row of that CLI:
  not installed → fail with a fixed sentence; installed → pass with the version when known.
- Claude lane with a named account selected → also `provider:getAccountStatus { profileId }`;
  the account must be signed in. Ambient → `provider:getAmbientClaudeStatus`.
- `ptahCli:testConnection` stays for Ptah CLI instances only.

## Lanes

- L1 (codex): defect 1 — state service + matrix `test()` logic + specs.
- L2 (claude, second login): defects 2, 3, 5, 6, 7 (Ptah CLI defaults) — lanes table, detail, default cell.
- L3 (codex): defects 4, 7 (Background models), 8 (native selects on the other Providers files).

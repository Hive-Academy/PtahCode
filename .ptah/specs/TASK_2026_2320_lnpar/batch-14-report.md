# Batch 14 report: F7 lane header confirmed model and usage timing

## Changes

- MODIFIED `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-header.component.ts`:
  the model chip shows `modelName()` = `observedModel || model` (an empty string counts as absent, as
  the old `@if (agent().model)` did). The title is `Model: <full name>`. The text sits in a
  `.ptah-badge-text` child with `max-w-[10rem] min-w-0`, so a long name gets an ellipsis
  (the account chip uses the same pattern). `data-testid="lane-model"`.
- MODIFIED `.../agent-card/cli-lane-usage-summary.component.ts`: a total figure comes first in the
  usage group (`data-testid="lane-usage-total"`, `tabular-nums`). It reads `resolveCliLaneUsage(...).tokens`
  (same source as today):
  - Known: `18.2k tok`. Tooltip: "Tokens this run, updated as the provider reports them".
  - Unknown: `- tok`. Tooltip: "Usage is unknown until the lane reports again." (design 7, Req 3.6).
  - Turn-end clock: shown when `agent().effectiveCapabilities?.usage?.timing === 'turn-end'`. It is a
    lucide `Clock` in a `role="img"` span whose `aria-label`/`title` is the statement's `reason`,
    falling back to "This CLI reports usage once, when the turn ends.". The total uses the same tooltip.
  - "partial" badge: `ptahBadge tone="warn" size="xs"`, shown when `lane().partial`.
  - 900 ms highlight: an `aria-hidden` absolute overlay (`bg-primary/30`) whose opacity animates
    from 1 to 0 (compositor only, one shot). A `linkedSignal` counts changes of the total. Each change
    re-creates the overlay through `@for (… track count)`, which restarts the fade. Nothing flashes
    on the first render. `@media (prefers-reduced-motion: reduce)` sets `animation: none`, and the
    overlay stays at opacity 0. No timers or listeners.
  - The figure is outside any `aria-live` region, so it is not announced on each tick.
  - The existing ctx/in/out/cache/cost labels are unchanged.
- MODIFIED both specs:
  - Header spec: 3 new tests. The confirmed model wins, with the full name in the title and a
    `.ptah-badge-text` child. The requested model is the fallback. No chip when no model is known.
  - Usage spec: 6 new tests and additions to the existing ones.
    - Total figure; "- tok" with its tooltip.
    - Partial badge present (warn tone) or absent.
    - Turn-end clock with the reason, the default reason, and no clock for live or no statement.
    - Highlight: none on the first value, none when the total is unchanged, and the overlay is
      re-created on each change.
    - The CSS source: 900 ms, opacity-only keyframes, reduced motion turns it off. This follows
      `agent-avatar.component.spec.ts` (`readFileSync`), because jsdom does not attach component
      styles here.

## Decisions

- **Meaning of "partial".** No turn-telemetry "partial" flag exists on `MonitoredAgent` or in the
  store. The only partial signal is `resolveCliLaneUsage().partial`: totals rebuilt from retained
  segments (`PartialUsageTotals`). So the badge keys on that signal. Its tooltip keeps the existing
  honest wording, "From retained output, may be partial", instead of design 7's "The provider sent
  incomplete usage. Showing the last good value." That design text describes a malformed-event
  signal the renderer does not receive. Reversible: change the tooltip, or the badge condition,
  once a malformed-usage flag exists.
- **Generic turn-end tooltip.** The fallback text names no CLI ("This CLI …"), because the
  statement's `reason` carries the provider wording when the backend gives it.
- **Highlight on the model chip.** The header model chip does not get the 900 ms highlight. Task
  14.1 asks for it only on the usage figure. Design 7.1 says the chip uses "the same 900 ms
  highlight". Adding it would be a second copy of the overlay. Open for the visual review to decide.

## Check results

- `npm run verify -- --related -p @ptah-extension/chat`: the first run had 1 failure, my CSS assertion
  (component styles are not in the jsdom DOM). I fixed the spec. Focused jest on the usage spec:
  10/10. Re-run of the verify command: `1 task: 1 succeeded`, exit 0 (`.ptah/tmp/w8-b14-related.log`).
  The first run reported 956/957 passing across 53 suites, and the only failure was the one fixed.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/chat`: `2 tasks: 2 succeeded`, exit 0
  (`.ptah/tmp/w8-b14-lint.log`).
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: `1 task: 1 succeeded`, exit 0.
  This was a full Nx cache hit (1/1, 6 s): the inputs were identical to an earlier run in this
  worktree, which included these files (`.ptah/tmp/w8-b14-templates.log`).

## A5 result: no double count (not a blocker)

`sdkContribution(snapshot)` (`chat-ui/.../session-usage-totals.ts:93`) reads only the parent
session's `SessionStatsEntry` (`tokenCount`, `totalCost`, `knownCost`). That entry comes from the
Claude SDK owner/ledger (parent and Task subagents) or from
`readSessionStatsRangeFromLedger`. Both ledger queries (`session-stats-repository.ts`
`getSessionModelUsage` and `getSessionUsageEventCount`) filter on `t.session_id = ?`.

CLI lane rows (`lane-completion-outcome.ts:157-166`, producer `cli-lane`) are written under the
lane's own `sessionId: info.cliSessionId ?? runId`, with the parent kept only in
`parentSessionId`. No query here reads that column. `SessionStatsEntry.cliAgents` is a list of
names, not usage. `cli-agent-runtime` does not use the SDK stats owner or the live publisher.

In the renderer, lane usage enters only through the per-lane contributions. In
`inspector-agent-rows.ts:107-126` they are keyed by `agentId` in one Map.
`session-inspector.component.ts:263-271` builds `[sdk, ...cliContributions]` filtered to
`source === 'cli'`. Each lane is therefore counted once, beside an SDK figure that excludes it.

Residual edge (not observed): a lane whose `cliSessionId` equals the parent session id would be
counted twice. That would need a lane to resume the parent's own session id.

## Open

- Design 7.2 says the SESSION section input/output figures move with lane usage. `sessionTokens`
  (`session-inspector.component.ts:240-249`) shows only SDK `snapshot.tokens`. This is not a double
  count, but those two figures exclude lanes. Outside the Batch 14 write set; the inspector was not
  edited.
- Design 7 places the figure in the lane header row. Per the plan and batch, it is in the usage
  summary card. The visual review should confirm that placement.
- The model-chip highlight (see Decisions).

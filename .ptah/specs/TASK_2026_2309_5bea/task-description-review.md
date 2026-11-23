# Gate 1 requirements review

- Artifact: task-description.md and parity-inventory.md
- Artifact revision: 3
- Author: project-manager subagent, claude family
- Reviewer: codex CLI lane
- Round: 3
- Verdict: APPROVED

## Round 1 (revision 1)

### Request traceability

Phrases are quoted from `context.md:5–10`. R1–R9 refer to the numbered requirement sections in `task-description.md`. Coverage indicates that a requirement addresses the phrase. The findings identify where its acceptance criteria are insufficient.

| Request phrase | Requirement section | Covered yes/no |
| --- | --- | --- |
| “in our stats sidebar” | Scope, R9 and Electron compatibility | Yes |
| “enhance it and elevate its details and stats with proper rganization” | R1, R3, R5, R6 and R9 | Yes |
| “rather showing duplicating informations” | R1.4 and R4 | Yes |
| “total for the whole agents and lanes” | R1 and R2, plus R9.5 for rail | Yes |
| “rather repeating the context /model tokens and others for the main agent in the first stats sections” | R1 replaces the top token and cost figures. R3 moves main-request details. R4 governs individual figures. | Yes |
| “and also in agents informations we can fix those” | R4 and R5, with R9 preserving agent interactions | Yes |
| “utilize our new components for stats, numbers, charts, bars” | R6 and accessibility requirements | Yes |
| “to intuitively show organized and clean details” | R3–R6 and R8 | Yes |

The explicit out-of-scope surfaces are separate from the requested redesign. PLAN LIMITS can retain its provider cards while AGENTS fixes its caption, even though the caption currently receives data through the limits view model. Backend scope is conditional and must leave room for a necessary data-contract change. Electron feature priority still carries scoped checks for affected shared consumers.

### Fact checks

Path keys used below are relative to the worktree.

| Key | File or directory |
| --- | --- |
| Reader | `libs/backend/agent-sdk/src/lib/session-stats/session-stats-reader.service.ts` |
| Owner | `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts` |
| Aggregator | `libs/backend/agent-sdk/src/lib/session-stats/session-usage-aggregator.ts` |
| RPC | `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts` |
| Inspector | `libs/frontend/chat/src/lib/components/organisms/session-inspector/` |
| Store | `libs/frontend/chat/src/lib/services/session-inspector/session-inspector.store.ts` |
| Stats source | `libs/frontend/chat/src/lib/services/session-stats/session-stats-source.ts` |
| View | `libs/frontend/chat-ui/src/lib/molecules/session/session-stats-view.ts` |
| Stats | `libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.ts` |
| Dock | `libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts` |

1. **4a — Confirmed for usage totals.** Reader:325–344 and :368–383 load the parent and owned SDK subagent ledgers and pass them to the aggregator, including unreadable-member coverage. Owner:1074–1111 folds restored usage and SDK run contributions into the snapshot. Owner:1254–1261 identifies Task-subagent spend in cumulative SDK model usage, and Owner:1422–1455 sums token categories from every result model. CLI lane usage is outside those totals. RPC:1755–1760 attaches separate `cliAgents` metadata to successful batch entries, so the claim should describe which **usage** the numeric fields include. View:154–156 corroborates the distinction.
2. **4b — Confirmed.** Store:139–155 supplies snapshot tokens and cost to the Orchestrator card. Inspector `inspector-agents-section.component.ts:315–323,449–470,479–500` puts that card and monitor-derived lane rows in one list and totals it. Inspector `inspector-agent-list.ts:105–129` adds every finite row figure without checking overlap. A reported subagent contribution can therefore be added twice. The screenshot establishes the displayed numbers, and the source establishes the failure mode. Neither supplies the screenshot's per-contributor provenance or its corrected arithmetic.
3. **4c — Confirmed for a resumed owner with an unknown transcript prefix. Refuted as a blanket claim about the raw field.** Owner:509–514 starts a fresh owner with a zero prefix. Owner:527–545 initializes a transcript-backed owner with an unknown prefix only when there is no existing owner, and Owner:1123–1126 emits null for that case. Historical reader results omit duration through Aggregator:298–316,447–472. The type permits both absence and null at `libs/shared/src/lib/types/rpc/rpc-session.types.ts:498–499`. View:149–152 normalizes absent, null and zero to an unavailable display. The screenshot alone cannot establish the cause of its missing duration.
4. **4d — Confirmed.** The unlabeled `list().length` appears at Inspector `inspector-agents-section.component.ts:101–107` (expression on line 105). Inspector `session-inspector.component.html:169–178` binds the CLI count input from `limits.inspectorRuns` independently of the roster-backed rows. Stats source:196–204,258–273 scopes monitor runs by session and drops the limits projection before limits load. `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/stats-limit-view-model.ts:70,145` builds and returns the run list. These projections can share monitor data while exposing different counts or availability.
5. **7 — Confirmed.** `CanvasInspectorDockComponent` directly renders the inspector three times at Dock:125 (rail), :193 (embedded in the expanded dock) and :239 (compact sheet). `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-board.component.ts:285` mounts the dock, and `libs/frontend/canvas/src/lib/orchestra-canvas.component.ts:98` mounts the board. Electron's renderer supplies the canvas through `apps/ptah-extension-webview/src/app/app.config.ts:371` and the shell renders it at `libs/frontend/chat/src/lib/components/templates/app-shell.component.html:333–336`. The Ptah references result was capped and used a text scan in the main checkout. A worktree `rg` search for the selector and component references verified these lines in `apps` and `libs`. The only other direct selector match was Inspector `session-inspector.component.spec.ts:66`, a test host.

### Parity deltas

| Inventory row | Verified current behavior |
| --- | --- |
| Estimate legend (line 44) | Stats:53–59 shows the legend for provisional snapshots. |
| Context and compactions (lines 45–47) | Stats:63–111 reads main-request context, displays compaction count and renders its meter. |
| Token budget suffix and meter (lines 49–50) | Stats:140–166 shows budget or scope text and a measured meter. Stage tones are at Stats:501–506. |
| Cost state and subtotal (line 51) | Stats:168–205 displays the amount or missing-cost state and a known subtotal when applicable. View:43–56,138–142 distinguishes missing price from other unknown costs. |
| Details disclosure and expansion (lines 53–54) | Stats:228–236,361–391,398–401,469–496 renders details, Escape handling and session-keyed expansion state. |
| Time and turns (line 55) | Stats:242–261 displays duration and turn count independently. |
| Model disclosure and breakdown (lines 56–57) | Stats:262–294,309–358 renders the toggle, per-model cost and token categories, and SDK snapshot cost total. |
| Cache tile (line 58) | Stats:295–307 renders the cache tile or its unavailable state. `inspector-cache-tile.component.ts` beside Stats has expiry, idle and estimate text at lines 100–138. |
| Caption, loading and empty state (lines 64–66) | Inspector `inspector-agents-section.component.ts:101–128` has all three. |
| Agent row and selection (lines 70,72) | Inspector `inspector-agent-row.component.ts:30–84` renders the row. Inspector `inspector-agents-section.component.ts:142–162,368–393` selects it and conditionally opens the thread. |
| Request lines and controls (lines 73–75) | Inspector `inspector-agents-section.component.ts:164–211,400–429` wires menu actions, request outputs, two steering surfaces and the error alert. |
| List disclosure and total (lines 76–77) | Inspector `inspector-agents-section.component.ts:216–239,342–353` implements disclosure, selected-row retention and accessible total text. |

The inventory omits or under-specifies these capabilities.

- SESSION details include context used and capacity, token breakdown by uncached input/output/cache read/cache creation, coverage notes, and estimate versus subscription cost explanations. The inventory describes the disclosure mechanics and the per-model panel, leaving the separate SESSION detail content implicit. View:81–135.
- AGENTS retains the selected row below the fold, normalizes selection across subagent/background transitions, and returns keyboard focus to the row when its request control closes. The six-row limit and selection entries omit these behaviors. Inspector `inspector-agents-section.component.ts:331–365,175–187,432–441` and `inspector-agent-list.ts:262–277`.
- AGENTS displays a CLI run role when available, exposes a start-time tooltip on the row and refreshes live lane timing. Inspector `inspector-agents-section.component.ts:308–320,502–519` and `inspector-agent-row.component.ts:31–39`.
- The rail also supplies metric buttons that open SESSION, accessible labels and an attention indicator. The current context metric and its limit alert need a stated disposition when main-request context moves. Inspector `session-inspector.component.html:26–56` and View:167–186.

`## Proposed Removals` lists none. Every inventoried capability has a keep or move disposition, and deduplicating placement is consistent with the request. The omissions above and the conflicting parity criteria prevent confirming that all current capabilities are protected. Record a disposition for each omission and list any intended functional removal explicitly.

### Lane-introduced constraints

| Constraint added by the author | Project-rule justification |
| --- | --- |
| Exact placement and existing presentation mechanics in R3.1, R4.4, R5.6 and R9.2–R9.4, including a context meter, Time cell, skeleton, six-row disclosure, exact strings, dotted-underlined popover in the inventory and a left selection bar in R9.1 | No project rule fixes these designs. Preserve the information, loading/empty feedback, actions, disclosure, accessibility and selected state. Let design choose the presentation. |
| About 440 px as a target, rail parity, numeric no-wrap, and mandatory tooltip plus accessible text in R5.3 and non-functional requirements | Electron-first supports evaluating the actual renderer and its presentations. No cited rule fixes 440 px or tooltips. The screenshot supports checking numeric legibility. Define supported widths and access to full values. |
| A visible per-agent proportion for every eligible agent in R5.4 | No project rule or explicit request mandates shares. This is a proposed way to use charts. If retained, require matching numerator and denominator, with defined behavior for unknown or overlapping scopes. |
| Exact markers and a legend in R1.2, explicit unknown reasons in R1.3/R4.4/R8, count labeling and source reconciliation in R5.1–R5.2, and budget scope and existing stage cues in R7 | No cited rule mandates the exact display treatments. Existing states and screenshot defects justify truthful scope, accuracy and accessibility requirements. Some states have no backend cause to display. |
| Enumerated shared components and review accounting for one-off markup, plus dark/light contrast and accessible states | The user directly requested shared stats and visualization components. No cited rule adds the full markup audit. Theme, keyboard and accessibility checks preserve existing UI behavior and can be expressed as observable outcomes. |
| Renderer-first estimate, backend changes only after architectural proof and escalation, and the specific subtraction option in Risks and Decisions | No project rule requires a frontend-only result or validates subtraction. The proposed estimate and escalation are planning choices. Electron priority and shared-host compatibility are project rules. |
| Unchanged off-sidebar behavior, scoped tests, template typecheck and Electron-only visual review | Scope preservation follows the request. The verification commands and Electron-only review follow `CLAUDE.md:8–17,47–67`, which assigns `npm run verify` to the coordinating agent. Exact test fixtures and passing named specs are lane-added verification details. |
| Retaining the session-switch animation and announcements, plus leaving PLAN LIMITS and surrounding sections intact | Preservation follows the redesign scope and parity objective. No cited rule fixes the animation or provider-card layout. |

### Findings

1. **Serious — Specify aggregation for missing and estimated inputs.** `task-description.md:82–106,240,254–258`. R2.1's “snapshot value plus the CLI lane values” is undefined for a partially priced SDK snapshot where `totalCost` is null but `knownCost` survives. It also leaves provisional estimates, token units and missing lane attribution untested. The existing owner and historical reader expressly support partial usage and pricing, and the CLI rows have their own completeness and estimate signals. Require comparable units and session ownership, one contribution per source, a known subtotal when usable, combined estimate/lower-bound states when warranted, and an unknown state when nothing is usable. Add outcomes for SDK-only, SDK plus lanes, partial SDK pricing, missing lanes, provisional updates and genuinely reported zero. Remove the suggestion that subtracting row values is already feasible. It requires reconciliation of scope, units and completeness. See Owner:1103–1126, Aggregator:293–309 and Inspector `inspector-agent-usage.ts:34–79`.
2. **Serious — Test scope and duplication instead of numeric equality.** `task-description.md:108–135,196–198` and `parity-inventory.md:56–57,88–91`. R4.1 permits a repeated aggregate with a different label, including when there are no CLI lanes and the snapshot covers the entire session. It also treats equal amounts as the test for duplication even when different metrics legitimately coincide. R3.1 requires a main-request model on every render, but the existing display can fall back to a session-wide model or first aggregate model row. Require distinctly scoped per-agent data or a truthful unavailable state. Keep the model breakdown discoverable, label the SDK-only model subtotal, and cover sessions with no lanes, a single SDK model, and missing main-request model attribution. See Stats:262–294,309–358,450–465 and Aggregator:432–459.
3. **Serious — Leave design decisions open and complete the parity contract.** `task-description.md:114–118,136–156,196–214` and `parity-inventory.md:36,53,70–77`. Replace prescriptive cells, selection bars, skeletons and popover placement with checkable outcomes. Preserve actionable behavior only where available, including conditional thread opening, the selected row below the fold, request outputs and focus return, and the detail content listed above. Document how rail context access and its limit cue survive the per-agent relocation. If shares remain mandatory, define which trustworthy row values qualify. Applying the condition to an aggregate Orchestrator row and its individual SDK rows yields overlapping shares.
4. **Moderate — Make duration acceptance independent of known turns and document actual provenance.** `task-description.md:21–23,136–137,185–194,262–267`. Cover absent, null and zero duration even when turns are also unavailable. Retain the count when known. Use a specific cause only when supported, including for Orchestrator duration, which the current row sets unconditionally to null at Inspector `inspector-agents-section.component.ts:449–474`. Resolve the open question against the mandatory unknown state in R8.
5. **Moderate — Document verified host, caption and budget boundaries.** `task-description.md:145–150,172–183,240–245` and `parity-inventory.md:19–23,64`. Record the three verified mounts. Test AGENTS while plan limits have yet to load so an unavailable projection cannot read as a measured zero. The backend uses snapshot raw/weighted tokens and snapshot cost, with known-cost lower bounds and weighted fallbacks in `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-stage.ts:69–113`. Give R7 a checkable outcome for those measures where applicable and map the current stage tones explicitly (limit → error, tighten/handoff → warning, default → gold). Resolve numeric width testing against each applicable presentation and include the moved total.
6. **Moderate — Give shared component and visual checks concrete evidence.** `task-description.md:158–170,216–226`. “Where a shared component fits” is a design choice with no minimum observable outcome. Require design to identify which displayed stats or visual encodings use the requested shared components, and verify their labels, accuracy states and legibility in both themes. Clarify that the coordinator runs the scoped verification gate and includes affected shared consumers.
7. **Minor — Correct baseline descriptions and citations.** `task-description.md:23–35` and `parity-inventory.md:46,64,77,88–90`. Use line 105 for the caption expression. Identify compaction count as a stat input sourced through Stats source:189–194. Call the current AGENTS total a row sum with possible overlap and the current Orchestrator values snapshot-scoped. Drop the conjectured corrected screenshot total.

### Decisions

Gate 1 requires revision for findings 1–3. The request is fully traceable and the excluded UI surfaces can remain outside the redesign. The next revision needs verifiable aggregation, scoped deduplication and preservation criteria that leave layout open.

This review used the supplied screenshot description and static source. Native `rg` and line-range reads verified worktree evidence where the Ptah reference search provided only a capped main-checkout scan. No application, tests, builds or verification commands were run.

## Round 2 (revision 2)

Gate 1 verdict is **REVISE**. Finding 8 prevents an independent reader from assigning a single expected value and accuracy state to the same fixture. The parity inventory now records all four previously omitted groups and declares no proposed removals.

### Round-1 finding status

| Finding | Status | Evidence in revision 2 |
| --- | --- | --- |
| 1. Aggregation contract and subtraction | Partly resolved | Requirements §1 defines units, ownership and one contribution per source. §2 requires fixtures and makes subtraction conditional on reconciliation. R1.1, R1.4 and the zero rule still conflict with other outcomes when coverage is incomplete. See finding 8. |
| 2. Scope-based deduplication and model attribution | Partly resolved | R3.2 gives the main-request model an unattributed state. R3.5 retains the SDK model breakdown for one model and for sessions without CLI lanes. R4.1–R4.3 use scope and preserve independently attributed data. The general deduplication language still needs to allow the retained SDK detail in a no-lane session. See finding 9. |
| 3. Design freedom and parity | Resolved | R3, R5.6 and R9 preserve information and behavior while leaving cells, skeletons, selection indicators and disclosure form to design. The inventory records details and request outputs, and R9.1–R9.8 cover the selection, focus, action and rail outcomes. The Decisions section makes shares optional and restricts them to appropriately scoped values. |
| 4. Independent Time display and provenance | Resolved | Context distinguishes a live null from an omitted historical duration. R8.1–R8.5 cover known and unavailable duration, whether turns are known or absent, generic and supported causes, and the Orchestrator entry. Decisions and Follow-ups reflect rows 5 and 6. Finding 12 concerns wording added in this revision. |
| 5. Host, caption, budget and widths | Partly resolved | Context and the inventory identify all three mounts. R5.3 covers limits loading, R5.4 includes the moved total, and R7 defines stage measures and tones. Non-functional requirements identifies widths by presentation. The concrete width fixtures can go to architecture. See findings 10 and 13 for remaining precision in the budget and caption checks. |
| 6. Shared components and scoped verification | Partly resolved | R6.1–R6.3 require a design map, implementation review against it and both themes in Electron. Non-functional requirements assigns scoped verification to the coordinator and includes affected consumers. The map can still pass its criteria with exceptions for every stat and encoding. See finding 11. |
| 7. Baseline descriptions and citations | Resolved | Context and the inventory use caption line 105, cite the compaction input source and the Orchestrator store, and distinguish the overlapping row sum from the snapshot. The conjectured screenshot total is gone. |

### Round-1 parity deltas

| Delta | Status | Evidence in revision 2 |
| --- | --- | --- |
| SESSION detail content | Resolved | Inventory §SESSION stats grid, “SESSION detail content,” preserves context used/capacity, uncached input, output, cache read, cache creation, coverage notes and estimate/subscription cost explanations. Context detail moves with the Orchestrator entry. |
| AGENTS selection and focus | Resolved | Inventory §AGENTS section, “Selected row kept visible,” “Selection normalised” and “Focus returns,” and R9.1–R9.4 preserve conditional opening, selected rows below the fold, selection through state changes and keyboard focus return. |
| CLI role, start time and live timing | Resolved | Inventory §AGENTS section, “CLI run role label,” “Start-time tooltip” and “Live lane timing refresh” each carry a keep decision. R9's parity requirement applies to all three. |
| Rail controls and context warning | Resolved | Inventory §Inspector frame, “Rail metric buttons” and “Rail context metric,” and R9.8 retain opening behavior, accessible labels, the attention indicator and labelled access to main-request context and its limit cue. |

The inventory lists no feature removals. The Orchestrator's repeat of snapshot totals and the overlapping AGENTS row sum are replaced as requested. Finding 9 addresses an ambiguity that could otherwise lead to dropping the expressly retained SDK detail.

### New findings

8. **Serious — Make total accuracy criteria mutually consistent.** `task-description.md:94–128,139–148` (R1 and R2). An SDK-only fixture with `totalCost: null` and a numeric `knownCost` must equal the snapshot value under R1.1 and show the numeric subtotal under R1.3. For a metric with one reported zero and another source missing, the zero rule says exact while R1.4 says lower bound. For an unreported metric across all sources, R1.4 or R2.3 can demand a lower bound while R1.6 demands unknown. Make R1.1 refer to the normalized SDK contribution and define precedence per metric: unknown when no contribution is usable, otherwise retain known amounts including zero, mark incomplete coverage as a lower bound, and preserve estimates when applicable. Exact zero requires complete comparable coverage and no estimates. Add overlapping fixtures for SDK-only partial pricing, known zero plus missing data, and all usage missing. The SDK-only partial-pricing case is supported by `libs/backend/agent-sdk/src/lib/session-stats/session-usage-aggregator.ts:290–305`.
9. **Moderate — Explicitly allow the retained SDK breakdown subtotal.** `task-description.md:173–184,340` (R3.5, R4 and Stakeholders) and `parity-inventory.md:60–61,98–103`. In a session without CLI lanes, the SDK cost subtotal in the model breakdown can cover the same population and metric as the headline. R3.5 explicitly keeps it, while the R4 definition and the stakeholder's unqualified success criterion can be read to prohibit it. Restrict the prohibition to repeated summary figures, explicitly allow the subtotal inside labelled SDK details, and ensure any snapshot-only token-category details identify that scope when lanes contribute to the headline.
10. **Moderate — Cover the weighted budget fallback explicitly.** `task-description.md:233–247` (R7.1). The umbrella requirement to match the budget stage is correct. Its summary and fixture list leave out a configured dollar budget currently measured in weighted tokens, including sticky fallback. That case is distinct from a token-only budget and partial pricing with a cost subtotal. Require a fallback fixture that checks both the weighted value and the fallback limit and label. See `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-stage.ts:74–113`.
11. **Moderate — Require observable shared-component use in the shipped UI.** `task-description.md:217–231` (R6). A map that justifies custom markup for every item can pass R6.1–R6.3 despite the explicit shared-component requirement. Require reviewers to observe actual shared stats, number, chart and bar usage where those functions occur, with specific exceptions for gaps. Leave the choice of component and metric to design.
12. **Minor — Keep Time placement open and use the qualified duration evidence.** `task-description.md:259–273,379–381` (R8 and Decisions). R8.4 reintroduces a placement decision with “next to Time.” Require independent access to known turns in the same stats section even when duration is missing. Align the note with Context: a resumed live owner with an unknown prefix emits null, and historical records can omit the value. Keep the working `--:--` decision and the user's option to confirm zeroes.
13. **Minor — Distinguish measured zero from an unloaded projection.** `task-description.md:204–208,329,351` (R5.2–R5.3, Lane-introduced constraints and Risks). R5.3 can read as disallowing an actual zero from a loaded empty roster while limits are loading. State that the unavailable limits projection cannot supply a zero, while a loaded roster may report a genuine zero. Align the constraint and risk wording with R5.2, which allows a documented difference between sources.

### Lane-introduced constraints decisions

| Constraint in revision 2 | Decision |
| --- | --- |
| Whole-session totals at the top, deduplication, agents organization and shared components | **Accept.** Tracks the explicit request. |
| Small shared Time and muted `--:--` for unknown duration | **Accept as the working decision.** The component was user-requested and the placeholder awaits the user's choice under decisions row 5. |
| Electron renderer scope and Electron-only visual review | **Accept.** The task targets this inspector and the visual review rule comes from `CLAUDE.md` §Product focus. Existing shared-host compatibility still applies. |
| Coordinator's scoped gate, template typecheck and focused lane checks | **Accept.** `CLAUDE.md` §Verification commands and §Two-level check define these responsibilities. |
| Removal of exact placement, cells, selection bar, skeleton, six-row limit, strings and popover placement | **Accept the removal.** Keep the behavioral outcomes and the separately recorded Time decision. See finding 12 for the remaining placement wording. |
| Removal of the 440 px target | **Accept the removal.** Use supported widths for each mount. |
| Numeric legibility and full-value access | **Accept.** The observed cost wrapping justifies this outcome. Fix the fixture widths in architecture. |
| Removal of mandatory per-agent shares | **Accept the removal.** Optional shares have scoped guardrails in Decisions. |
| Explain accuracy states and distinguish unknown usage from reported zero | **Accept.** The user needs truthful totals and the UI already differentiates accuracy states. Resolve their precedence in finding 8. |
| Labelled caption counts and one CLI source | **Accept labelled counts and reconciled sources.** Reject a mandatory single source, since R5.2 permits an explained difference. See finding 13. |
| Budget stage measure and existing tones | **Accept.** This preserves budget meaning and established status cues. See finding 10. |
| Design spec maps stats to shared components or gives a reason | **Accept the map.** Reasons should document individual gaps and preserve actual use of the requested shared components. See finding 11. |
| Dark/light legibility, keyboard access and Escape behavior | **Accept.** Observable checks preserve current access across presentations. |
| Architectural evidence and escalation for a backend change | **Accept as a planning decision.** The escalation path permits backend work needed for a requirement. |
| Preserve the session-switch transition, live announcements, PLAN LIMITS and surrounding sections | **Accept.** These are parity and scope decisions consistent with the request. |

### Unresolved items

- **Gate 1 blocker.** Fix finding 8 and make the expected totals and accuracy states unique for the overlapping fixtures. Findings 9–13 are below the revision threshold.
- **Architecture follow-up.** Missing numeric dock and rail widths do not block Gate 1. The current minimum is 300 px and the rail is 56 px. The expanded dock defaults are 336, 400 and 448 px by available-width tier, subject to the rendered-width clamp. Record board or available-width inputs and expected rendered widths in the visual fixtures, including the specified 360 px compact-sheet case. Use `libs/frontend/chat/src/lib/services/session-inspector/inspector-dock-width.ts:6–31,40–85` and `libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts:60,90–91,300`.
- **Pending user choice.** Treat muted `--:--` as the current unknown-duration display. Decisions row 5 allows the user to select zeroes. Row 6 leaves transcript-derived duration to a follow-up. Neither item blocks Gate 1.
- This was a static document review with targeted native line-range reads of the referenced code. Only this review file was updated. No verification command, test, build or app was run.

## Round 3 (revision 3)

Gate 1 verdict is **APPROVED**. R1 and R2 establish a single outcome per metric for each of F1–F10. The remaining wording and fixture details can be settled in architecture.

### Round-2 finding status

| Finding | Status | Evidence in revision 3 |
| --- | --- | --- |
| 8. Make total accuracy criteria mutually consistent | Resolved | R1 normalizes the SDK contribution, decides usability before applying accuracy markings, and fixes the SDK-only and missing-source cases in R1.1–R1.6. R2.2 asserts both outputs for both metrics across F1–F10 and R2.3 explicitly allows unknown when no usable amount remains. The walkthrough below confirms every expected pair. Finding 14 covers wording beyond the listed fixtures. |
| 9. Allow retained SDK breakdown subtotal | Resolved | R4 limits duplicate figures to summaries. R4.5 permits the labelled SDK model subtotal without CLI lanes, and R4.6 labels snapshot-only token-category details when lanes contribute to the headline. The Stakeholders row applies the same distinction. |
| 10. Cover the weighted budget fallback | Resolved | R7.5 specifies the weighted figure, configured fallback limit and label. It requires both a non-sticky fixture and a sticky fixture with a now-priced snapshot. |
| 11. Require observable shared-component use | Resolved | R6.3 checks actual use in the Electron UI where stats, formatted numbers, charts and meters or bars occur. Each exception requires a specific component gap. Design chooses the component-to-metric mapping. |
| 12. Keep Time placement open and qualify duration provenance | Resolved | R8.4 keeps the known turn count visible and accessible while leaving placement to design. The R8 note and Time decision distinguish a null duration for a resumed live owner with an unknown prefix from an omitted historical duration. Muted `--:--` remains the working choice pending the user's decision on zeroes. |
| 13. Distinguish measured zero from an unloaded projection | Resolved | R5.2 allows one source or an explained difference. R5.3 accepts zero from a loaded empty roster and excludes values from the unloaded limits projection. The caption constraint and risk rows use the same rule. |

### Independent check of F1–F10

For each metric I applied row 1 when no amount was usable. Otherwise I summed amounts under row 2 and applied rows 3 and 4 independently, using row 5 when neither marker applied. I read the illustrative fixtures as complete, comparable and final except where their inputs say otherwise. In F6, the estimate applies to lane cost alone.

| Fixture | Tokens from precedence | Cost from precedence |
| --- | --- | --- |
| F1 | 1,000 exact (2 + 5) | $0.50 exact (2 + 5) |
| F2 | 1,000 exact (2 + 5) | $0.30 lower bound (2 + 3, using `knownCost`) |
| F3 | 1,200 exact (2 + 5) | $0.60 exact (2 + 5) |
| F4 | 1,200 exact (2 + 5) | $0.50 lower bound (2 + 3, missing lane cost) |
| F5 | 800 estimated (2 + 4) | $0.40 estimated (2 + 4) |
| F6 | 1,200 exact (2 + 5) | $0.40 lower-bound estimate (2 + 3 + 4, partial SDK pricing and estimated lane cost) |
| F7 | 0 exact (2 + 5) | $0 exact (2 + 5) |
| F8 | 0 lower bound (2 + 3) | $0 lower bound (2 + 3) |
| F9 | No value, unknown (1) | No value, unknown (1) |
| F10 | 1,000 lower bound (2 + 3) | $0.50 lower bound (2 + 3) |

Each row produces one value and one accuracy state per metric, including the combined state for F6 and no numeric value for F9. R1.1 uses the normalized contribution, so F2 and F10 agree with the SDK-only criterion. R1.3 requires the lower-bound aspect of F6 and row 4 adds the estimate aspect. R1.4 defers to R1.6 when no amount is usable, so F9 remains unknown. R2.3 agrees with F10 and with the row-1 outcome when incomplete coverage leaves no usable amount. No other reviewed criterion contradicts these fixture outcomes.

### New findings

14. **Moderate — State the precedence boundaries explicitly for combinations beyond F1–F10.** `task-description.md:96–119,147–158,176–179` (R1 units and precedence, R1.3–R1.6 and R2.3). A provisional reported zero with a missing lane has a usable zero and triggers rows 3 and 4. The table gives a lower-bound estimate, while R1.6's abbreviated `≥ 0` can be read as requiring only the lower-bound marker. The units rule also says an incompatible source makes a total a lower bound, even when its exclusion leaves no usable value. Make row 1 explicitly terminal, apply rows 3–5 only to a usable row-2 sum, and refer to the table for the full state whenever criteria mention a lower bound. This preserves the fixture outcomes and gives architecture a check for the additional combinations.

### Unresolved items

- **Moderate, finding 14.** Clarify marker precedence for a provisional zero plus missing usage and for all amounts excluded as incompatible. In the executable fixtures, make coverage, comparability and estimate flags explicit where the illustrative rows leave them implicit.
- **Architecture, width fixtures.** Handoff assigns the concrete expanded-dock and rail values to the implementation plan. Record 300 px minimum, 336/400/448 px responsive defaults with available-width tiers and clamping, and 56 px fixed rail. Keep the 360 px compact-board case. See the round-2 width evidence.
- **Design and architecture, assigned decisions.** Design owns layout and the stat-to-component mapping. Architecture owns aggregation and data provenance, the availability of an Orchestrator-only figure, the budget-stage projection and the CLI run-count source or explained discrepancy, as assigned in Handoff.
- **Pending user choice.** Keep the muted `--:--` display until the user chooses otherwise. Transcript-derived duration remains a separate follow-up under decisions row 6.

This was a static review of the changed requirements and their revision history. Only this review file was updated. No verification command, test, build or app was run.

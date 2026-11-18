# Provider accounts and plan limits — visual specification

Electron renderer only. Recommended direction: a selected-provider spotlight, followed by other reported accounts, followed by a collapsed group without usage readings. Keep the existing glass system and all existing data/actions. This is a specification, not an implementation or a rendered visual approval.

## Evidence and current-state inventory

Paths below are repository-relative. `D/` abbreviates `libs/frontend/dashboard/src/lib/components/`; `U/` abbreviates `libs/frontend/ui/src/lib/`. Line references describe this checkout.

| Location | Current content / behavior | Hierarchy problem |
| --- | --- | --- |
| `D/dashboard-grid/dashboard-grid.component.html:1–24` | Page padding 16px, 20px section separation; bold 20px Dashboard header; provider accounts, skill selection, analytics, builders in that order. | Page title bypasses the approved page-header; account limits need their own readable hierarchy above analytics. |
| `D/provider-account-card/provider-account-card.component.ts:54–85` | Container-query grid: one column below 640px, two through 999px, three through 1399px, four from 1400px; 8px gaps; surface-1 outer section with 20px padding. | Every account gets identical area regardless of selected route, useful readings, or unavailable state. At 640px the layout already divides into two small tiles. |
| Same file `:89–153` | Heading; bordered refresh-failure paragraph; empty account surface with Refresh, tiny spinner or “Account usage unavailable”; otherwise identical tiles. | Loading/error/empty states are separate template recipes, with no shared state-panel. Selected-provider problems receive no special prominence. |
| Same file `:179–192,210–219` | Owners matching `AuthStateService.activeProviderId()` move first; snapshot order otherwise retained. Loads name the selected provider. Every tile's refresh triggers the same section-wide pull. | Sorting alone does not communicate “selected for chat.” Repeated refresh icons imply account-specific refresh that does not exist. |
| `D/provider-account-tile/provider-account-tile.component.html:1–22` | 10px horizontal/8px vertical padding; provider mark, truncated 12px name, 18px bold value, Refresh; source and age in truncated 10px text. | Identity, quota and action compete in a narrow header; plan and identity qualifier are not visibly presented; provenance is too small. |
| Same file `:24–50` | Up to three equal-width window columns; 10px labels/values; meter per numeric window; one reset line and first detail line; otherwise plain custom status text plus optional action. | Several windows appear equivalent despite a primary-window calculation. Unlike units can appear alongside each other. Status “pill” is a span rather than a shared semantic badge. Details depend on hover. |
| `D/provider-account-card/plan-tile-view.model.ts:290–310,915–1087` | Computes planBadge, primary bar, secondary accounting, evidence, cooldown and source age. Current template uses compactWindows/primaryValue, not the full bar, planBadge or secondary accounting. Up to three windows; overflow and suppressed generic weekly window are tooltip notes. | Available semantics exceed the presentation: plan, accounting, scope, secondary resets and evidence lack discoverable visible detail. |
| Same model `:474–532,990–1018` | Primary: greatest eligible normalized usage, tie by nearest reset then key. Falls back to first window for header value/reset when no primary exists. | A fallback value can look like the “most constraining” reading although it did not qualify. Relative reset is detached from its window name. |
| `libs/frontend/core/src/lib/services/plan-limits.store.ts:85–125,263–302` | Shared snapshot, loading/loadError and coarse clock; union of registered surface scopes; failed pull preserves data, initial failure installs empty snapshot. | Data freshness and transport failure must be separate from quota state; failure must never turn unknown into zero. |

Balances are contract capabilities, not a currently rendered tile metric: `libs/shared/src/lib/types/plan-limit.types.ts:263–275` supplies credits, bucket allowances and individual allowance. Historical accounting is distinct from plan quotas (`:159–188`). Do not describe these as one interchangeable “usage” value.

## Real grouping signals and limits

- **Selection:** `libs/frontend/core/src/lib/services/auth-state.service.ts:410–419` derives `activeProviderId` from persisted authentication settings: native API-key/Claude CLI methods map to `anthropic`; other methods use persisted provider ID. This is the selected chat provider, not proof of a live session or authentication success.
- **Owner identity:** `libs/shared/src/lib/types/plan-limit.types.ts:125–148` exposes opaque owner key, providerId, identityKind (`account`, `credential`, `cli-store`, `unknown`) and a generic label. An identity kind identifies the source of identity; it does not prove connectivity. Keep separate owners separate, including unknown identities.
- **Reading capability:** the same contract `:238–280` exposes status/reasons, windows, localUsage, activity, credits/allowances, evidence, source/readAt and staleSince. There is no owner-level `main`, `connected`, `authenticated`, `isLane`, or `lastUsed` field.
- **Status:** `libs/shared/src/lib/types/rpc/rpc-providers.types.ts:166–176` distinguishes available, stale, unsupported-auth/config/provider, CLI unavailable/version, service unavailable and no-usage-source. Unsupported auth can mean an API key has no subscription quota, not “signed out.”
- **Discovery:** `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-limit-owner-discovery.service.ts:8–48` combines selected route, local CLI stores, requested session owners, detected lanes and ledger evidence, deduplicated by owner key. Its internal origin is not carried in `PlanLimitOwnerSnapshot`.
- Actual enabled Ptah CLI discovery currently selects Ollama Cloud (including GLM) and Kimi Code; Claude CLI lanes require run-owner evidence (`:591–609`). Codex/local Grok/Antigravity can arrive through detection/stores. Copilot or Claude API must be shown only when returned; the request's example names are not a guaranteed catalog of connected accounts.
- `PlanLimitsSnapshot.sessionOwners` maps session ID to owner key/model scope, not a dashboard-wide primary session; `discoveryIncomplete` means detection may still find more owners (`plan-limit.types.ts:283–300`). The dashboard must not overwrite other surfaces' session/owner scope.

Use **“Selected for chat”**, **“Other provider accounts”**, and **“Without usage readings”**. Avoid the stronger “connected providers” and “not connected” unless a future contract supplies that proof. Do not hardcode Claude as main or CLI as other. Any selected provider, including Codex, GLM or Kimi, can occupy Level 1 when its matching owner is returned.

## Information architecture: three levels

Apply these rules in order, once per owner key; retain input order within each group. Never sort by changing percentages or age.

| Level | Membership | Presentation |
| --- | --- | --- |
| 1 — Selected for chat | Every returned owner whose `owner.providerId === activeProviderId()`. | Full-width featured block per owner: mark, generic name/qualifier, “Selected provider” neutral badge, plan if supplied, primary reading, reset, provenance, secondary windows/details. Multiple matches mean “Accounts for selected provider”; do not designate a primary account. |
| 2 — Other provider accounts | Non-selected owner with a reported numeric window (including retained/aged values), reported allowance/credit data, localUsage, actual activity values, or active owner limit/cooldown evidence. | Compact stacked list-row with named primary reading or accounting value; meter only when its denominator is known; explicit warning/age; expandable details. No inferred authentication badge. |
| 3 — Without usage readings | Remaining returned owners: no usable reading/accounting/evidence; reasons can include unsupported route, missing key, no source or transient failure. | One collapsed disclosure “Without usage readings (N)”. Expanded rows show provider, precise safe explanation and existing action. Unknown windows and known resets remain in details, never silently discarded. |

Level 1 wins even when its data is unavailable: keep the selected provider's explanation and action expanded. This exception prevents a collapsed group from hiding the current route's problem. Level 3 summary appends “N need attention” when it contains transient read failures; permanent lack of a quota source alone is neutral.

If no selected owner is returned, show one neutral Level 1 message, “No usage reading returned for the selected provider,” with Refresh. It is section context, not a fabricated owner or 0% tile. If discovery is incomplete, say “Provider discovery is incomplete; more accounts may appear.” Do not infer that absent providers are disconnected. Omit empty Level 2/3 groups. Preserve disclosure state by owner key during clock ticks/refresh; reset only when that owner leaves.

### Most constraining window and unlike units

1. Reuse `classifyWindow`, `usedPercent`, reset-passage rules and existing `selectPrimary` eligibility: finite normalized usage, finite reset strictly in the future, and not `reset-usage-unknown`. For amount usage, a finite positive limit is required. Highest used percentage wins; ties use nearest reset, then stable key. This compares allowance saturation, not money against requests or predicted time to exhaustion.
2. Label it **“Highest reported usage — {full window label}”**. It is not a claim that this window blocks the currently used model: the dashboard has no single current-session model scope. Display `modelScope` when supplied. Aged/unconfirmed/estimated readings retain their state qualifier; do not promote them to a fresh confirmed limit.
3. Level 1 hero value: percent = “94% used”; amount = “120 of 500 requests” (or source unit), followed by “24% of allowance” on its own line. Meter uses normalized used percentage. Do not replace a source amount with only a percentage.
4. The selected window's reset is directly below its meter: “Resets in 2h · 18 Nov, 17:00 EET” using existing locale/time utilities. Show “Reset time unknown” for missing resets. If no window qualifies, omit the hero meter and say “No comparable quota window”; list reported values individually with their states. Do not reuse the first window as a hero fallback.
5. Secondary quota windows: one stacked row per window (label/scope, value, meter if valid, reset, qualifier). Level 1 shows the first two non-primary windows in snapshot order, with “All windows (N)” disclosure for the rest. Level 2 shows only its primary summary until “Details” opens. Suppressed duplicate generic weekly windows stay accessible in All windows, marked “Reset passed · usage unknown”; never only in a title tooltip.
6. **Balances** occupy a separate “Credits / balance” group: literal supplied balance with unit when supplied, or “Credits available,” “No credits,” “Unlimited credits.” Balance strings are not necessarily currency. Do not add `$`, infer a denominator, depletion rate, or reset. Bucket labels remain attached. Individual allowance has its own group; finite `remainingPercent` may map to `100 − remainingPercent` used, explicitly labelled, without being ranked as a timed window.
7. **Historical activity** occupies a separate “Recorded activity” group. For `localUsage.requests`, show count, reported range, source and observed age; no percentage/reset. Otherwise put tokens and estimated USD cost on separate labelled lines. `activity.lifetimeTokens` is labelled lifetime activity, not remaining tokens. Per-model counts open in details. Do not total local and provider counts.
8. **Unknown** is text (“Usage unknown”), never 0%, an empty healthy bar, or an indeterminate quota animation. A window's confirmed exhaustion evidence may show “Limit reached” without a percentage. Owner-level hits stay owner-level and retain scope/source; estimates say “Estimated hit · unconfirmed.” Cooldown says “Retry after …,” separately from a plan reset.

## Exact visual contract

Apply `ptah-glass` and `ptah-glass-light` through current theme variables. `DESIGN.md` describes the marketing operator theme; do not import its amber palette into the renderer. Authoritative renderer sources are `apps/ptah-extension-webview/src/styles.css:168–180,397–420`, `U/tokens/ptah-tokens.css`, and renderer Tailwind mappings `apps/ptah-extension-webview/tailwind.config.js:79–98`. No new global design system, raw color, shadow or gradient.

| Element | Owner / exact recipe |
| --- | --- |
| Dashboard title | `ptah-page-header`, title Dashboard, backLabel Back to chat, back routes existing navigateBack. Approved `text-lg font-semibold tracking-tight` (18px/28px, 600); keep despite older 20px page-title token. |
| Accounts section heading | `ptah-section-header`, size section, level 2, heading “Provider accounts & plan limits”, headingId `provider-accounts-heading`; existing 16px/24px, 600. Refresh in actions slot: ptahButton ghost, size sm. No extra page header inside the section. |
| Level labels | `ptah-section-header` size group, level 3: 14px/20px, 600. Description/hint text 12px/16px, 400. |
| Level 1 identity / plan | `provider-mark` existing asset, decorative alongside name; name 16px/24px, 600. Identity qualifier 12px/16px. `ptahBadge` neutral for Selected provider and reported planType; omit absent plan rather than guessing. |
| Level 1 hero value | `text-2xl leading-8 font-semibold tabular-nums` = 24px/32px, 600; unit stays in accessible reading. Long amount values wrap at spaces. No forced single line. For accounting-only selected owner, reuse `ptah-stat-card size=default` in the relevant accounting group. |
| Level 2 identity / value | Extended `div[ptahListRow]`, title 14px/20px, 500; value 14px/20px, 600, tabular-nums. Metadata and reset 12px/16px. No stat-card for every row. |
| Level 3 summary / rows | Disclosure summary 14px/20px, 500; expanded titles 14px/20px, 500; explanations 12px/16px, 400. Keep text legible rather than dimming the whole group. |
| Meter | `ptah-meter`, max 100, barRole meter, marker 90; size md (8px track) in Level 1, sm (6px) in Level 2/details. Full label and valueText; hideLabel/showValue=false only when equivalent visible text immediately precedes it. |
| Meter tone | Fresh determinate reading uses auto: normal below 90%, warning at 90–<100%, error at >=100%. Existing `charts/chart-geometry.ts:43–46` implements this. Aged/estimate/unknown states use neutral styling and explicit qualifier; confirmed active hit uses err even if recorded number is below 100. Text retains real over-100 value; fill caps at 100. |
| Status | `ptah-ui-status-badge` warning label Near limit, failed label Limit reached, pending label Usage unknown/Aged/Unavailable; don't use offline for an unknown connection. For an estimate use neutral `ptahBadge` label Estimated. No status-as-button. |
| Surfaces | Outer section surface-1, `rounded-ptah-surface`, `p-ptah-surface` (16px). Featured owner surface-2 with same radius/padding; other rows transparent, 1px `--surface-border` separators. Level 3 no raised card. No new shadows; surface utilities own them. |
| Text / color | `text-base-content` for identity, values and messages; `text-base-content-muted` for provenance/reset/descriptions. Use badge and meter semantic ink owners; no opacity-based tiny text or provider-colored full backgrounds. Inherit renderer sans face; tabular figures, no new font assets. |
| Spacing | Section contents `gap-ptah-group` = 24px; heading-to-content `gap-ptah-heading` = 12px; related lines `gap-ptah-label` = 4px; inline controls `gap-ptah-controls` = 8px; window groups `gap-ptah-field` = 16px. Map to existing `--ptah-gap-*`, not arbitrary gaps. |

No new raw daisyUI component classes in consumers or shared extensions: use component APIs and semantic utilities. Existing internal classes remain owned by shared components; do not grow `tools/ui-class-audit/baseline.json`. Do not add `card-title`, `btn`, `badge`, `loading`, `alert` or `collapse` recipes in dashboard templates.

### States and interaction

| Condition | Required presentation |
| --- | --- |
| Initial load, no snapshot | Section header remains; `ptah-state-panel state=loading`, title Loading provider usage. aria-busy; no fabricated provider counts or zero values. |
| Refresh with retained snapshot | Keep readings and disclosure state; disable single section Refresh; label Refreshing. Do not replace data with a spinner grid. |
| Pull failure, retained data | `ptah-state-panel state=partial`, title Refresh failed, body Showing last observed data; existing warning treatment. Project content below. Per-reading age remains visible; no global assertion that every reading is stale. |
| First failure / empty response | state-panel error + Retry for loadError; state-panel empty + Refresh for successful empty response. Explain Usage unavailable; never claim no accounts exist. |
| Selected owner unavailable | Inline pending status-badge and safe reason, plus existing action. Preserve reported plan/account identity. No meter without values. |
| Other owner unavailable | Quiet collapsed group; precise reason per expanded row. “Go to chat” for no-open-session; “Add key” only where current action mapper supplies it. No new sign-in action or inferred destination. |
| Near / reached limit | Visible badge and numeric reading/scope; error color only for active confirmed reached state, warning at 90%. Owner evidence/cooldown visible even without primary meter. An active hit in Level 2 stays visible, never moves into Level 3. |
| Reset passed / stale / partial fields | Preserve shared classifications and field-level provenance. Replace invalidated reading with Usage unknown; retain known reset history. Read failure can coexist with retained values. |

One section Refresh routes the existing store load with `{providerId, refresh:true}`. No automatic navigation on row click. Details and quiet-group toggles are real buttons using ptahButton ghost size sm (32px target), aria-expanded/aria-controls; native hidden content is removed from tab order. They remain in place when expanded; no nested button in a button. Keep Back to chat and Add key behavior from current action routing. No search toolbar for this small owner list.

Visible provenance follows each primary reading: owner source/readAt, plus primary field-source differences when present. Missing source/age says “Source unknown” / “Observation time unknown.” Expanded window rows expose used/reset source and observation independently via existing `windowFieldSources`/`windowObservedAt`. Never use snapshot generatedAt or fetchedAt as the reading age. Source names and times wrap; absolute timestamp with timezone is visible in details, not hover-only.

### Container responsiveness

Use named inline-size container `provider-accounts` on the section host; queries measure available host width, not Electron window width. DOM and reading order remain Level 1, Level 2, Level 3 at every size. No independent scrolling inside this section.

- **Below 800px (including ~640px panel):** one column everywhere; 16px section and featured padding. Selected block stacks identity, value, meter, reset, provenance, secondary windows. Other row body stacks beneath its header and spans the width. Buttons wrap below identity. Secondary windows always one per line.
- **800–1199px (~1000px):** featured block remains full width; inside, primary quota and supporting windows/accounting use `minmax(0,2fr) minmax(0,1fr)` with 24px gap. Other rows use `minmax(0,1fr) minmax(240px,1fr) auto` for identity, reading, Details, with 16px gaps; provenance/reset below the reading. No shared baseline across unlike units.
- **1200px and above (~1400px):** same featured split; other-row identity column is 280px, reading column `minmax(0,1fr)`, actions auto. Keep other accounts a single vertical list, not four cards. Multiple selected owners stack full-width. Full-width track length expresses hierarchy without increasing font sizes.
- Below 480px or at high zoom: section padding 12px (`--ptah-space-3`), all row grids one column, names/messages wrap. No horizontal scroll or clipped values. Minimum width zero on grid children. Disclosures grow naturally; no fixed card heights.

## ASCII wireframes

Illustrative values and provider names below are sample readings, not assumed accounts. Separate lines represent separate unit groups.

```text
WIDE ~1400px
Dashboard                                      Back to chat (page-header)
+ Provider accounts & plan limits -------------------------- [Refresh] +
| Selected for chat                                                   |
| + surface-2 ------------------------------------------------------+ |
| | [mark] Claude [Selected provider] [reported plan]                 | |
| | Highest reported usage - Weekly      | Secondary windows         | |
| | 94% used [Near limit]                | Five hour: 32% used        | |
| | [===================|=--] 90% marker | [======|---------------]    | |
| | Resets in 2h · absolute local time   | Resets in 40m              | |
| | Provider API · observed 2m ago       | [All windows (N)]          | |
| +----------------------------------------------------------------+ |
| Other provider accounts                                            |
| [mark] Codex       Weekly · 61% used [===========|----]   [Details v] |
|                    Resets in 3d · CLI command · 1m ago              |
| ----------------------------------------------------------------- |
| [mark] GLM         Recorded activity: 185 requests       [Details v] |
|                    Reported range · provider API · 5m ago           |
| > Without usage readings (3) · 1 needs attention                     |
+-------------------------------------------------------------------+
Skill selection / Session analytics / Builders (existing order)

NARROW ~640px
+ Provider accounts & plan limits ---------- [Refresh] +
| Selected for chat                                    |
| +-------------------------------------------------+ |
| | [mark] Claude [Selected provider] [reported plan] | |
| | Highest reported usage - Weekly                  | |
| | 94% used [Near limit]                            | |
| | [====================|=--]                      | |
| | Resets in 2h · absolute local time               | |
| | Provider API · observed 2m ago                   | |
| | Secondary windows                               | |
| | Five hour: 32% used                              | |
| | [=======|----------------] · Resets in 40m       | |
| | [All windows (N)]                                | |
| +-------------------------------------------------+ |
| Other provider accounts                             |
| [mark] Codex                              [Details] |
| Weekly · 61% used                                   |
| [=============|------]                              |
| Resets in 3d · CLI command · observed 1m ago          |
| -------------------------------------------------- |
| [mark] GLM                                [Details] |
| Recorded activity: 185 requests                     |
| Reported range · provider API · observed 5m ago      |
| > Without usage readings (3) · 1 needs attention     |
+----------------------------------------------------+
```

## Recommendation and one alternative

**Recommended: spotlight + inline rows/disclosures.** The selected route remains visible; users scan other readings without opening a detail pane. It works at 640px and preserves safe unavailable explanations. Trade-off: expanded details increase page length; a provider can remain prominent even when it has no quota endpoint.

**Alternative: spotlight + `ptah-list-detail` for other accounts.** Useful if account counts routinely exceed ten. Current component uses a 320px list at >=768px and a back-to-list detail view below that (`U/foundation/list-detail.component.ts:10–27`); it would conceal cross-provider readings and add navigation in the narrow panel. Do not choose it without evidence of that account volume. `ptah-toolbar` is search-first and unnecessary in the recommended layout.

## Implementation outline (future work, no source changes in this deliverable)

1. Extend `U/foundation/list-row.component.ts` first: additive `[body]` projection below title/meta, plus `wrapText` input default false. With wrapText true, use normal whitespace and no truncation for title/meta; body spans the content/trailing columns beneath the header at narrow widths. Keep default layout, current/selection behavior and existing callers unchanged. Use plain static rows here (`current=false`), no ngOption/listbox role. Test old defaults and wrapping/body projection before adopting it.
2. Meter has no API gap: existing max, marker, tone, valueText, hideLabel, showValue and barRole cover the design. Supply actual normalized value without pre-clamping so over-limit accessible text survives. State-panel loading/empty/error/partial already covers section states; its current centered empty/error treatment is acceptable. Status-badge's pending + custom label covers neutral unknown states. No new status enum required.
3. Update `D/provider-account-card/provider-account-card.component.ts`: retain store injection/provider effect, shared clock and action routing; replace uniform tiles/refresh icons with section header, one Refresh, three computed groups and section state-panel. Keep generation/error handling in the store. Do not add RPC, timer, authentication or discovery work to presentational children.
4. Add `D/provider-account-card/provider-account-feature.component.{ts,html}` for Level 1; replace current `provider-account-tile` with `D/provider-account-card/provider-account-summary-row.component.{ts,html}` for Levels 2/3; share `provider-quota-window.component.{ts,html}` for labelled meter/reset/provenance. Delete the unused tile implementation once references migrate; no Legacy/V2 shim. Use existing accounting stat owner only for selected accounting groups, not for quotas plus duplicate cards.
5. Refactor `D/provider-account-card/plan-tile-view.model.ts` (currently 1088 lines, already over limit) into focused pure helpers: window selection/state, owner status/actions, accounting, and grouping. Keep the existing model path as the used composition entry, not a compatibility copy. Each file <700 lines. Expose typed `primaryWindow | null`, all secondary window records (not tooltip strings), plan/identity, per-field provenance and a discriminated accounting collection: allowance/balance/requests/tokens/cost/activity. Add `isSelectedProvider`, group and groupingReason in a dashboard-level mapper receiving activeProviderId. Do not add invented connected/authenticated fields to RPC types.
6. Preserve shared reset, unknown, stale and evidence semantics; change no backend eligibility/carry-forward rules. Remove first-window hero fallback. Restore visible plan/secondary accounting from existing data. Keep bucket identity and model scope. A field missing on older snapshots remains unknown.
7. Update `D/dashboard-grid/dashboard-grid.component.html` and component imports for page-header; preserve existing content order and navigation. All components standalone, OnPush, signal `input()`/`output()`, `inject()` where dependencies are needed; derived data via computed. Writable disclosure state remains private with methods; `@for` tracks owner/window keys, never index.
8. Update existing `provider-account-card.component.spec.ts`, `plan-tile-view.model.spec.ts`, `provider-account-tile.component.spec.ts` (move/rewrite with replacement), `dashboard-grid.layout.spec.ts`; retain scroll-owner coverage. Add meaningful grouping/row tests: selected unavailable, multiple selected owners, no selected match, unknown identity, partial data, accounting-only owner, active evidence without windows, missing source age, incomplete discovery, mixed units, tie-break, expired reset and >100% reading. Shared list-row tests cover additive API compatibility; no meter changes/tests needed unless behavior changes.
9. Future implementation validation: targeted dashboard/UI tests only and renderer template typecheck per project guidance; check UI-class ratchet without increasing baseline. Render in Electron at 640/1000/1400px in both glass themes, plus narrow zoom. Inspect hierarchy, long provider labels, multi-account identity, distinct unit groups, focus order, expanded content, 90/100 thresholds and all state-table cases. Verify text contrast >=4.5:1 and track/state cues >=3:1 against actual surfaces. No checks or rendering were run for this spec-only assignment.

## Decisions

- **Selection, not vendor or transport, determines prominence.** Options: selected provider vs fixed Claude/CLI taxonomy. Evidence: activeProviderId and exact current grouping. Chosen selected-provider match; reversible pure presentation change, no new contract.
- **Use accounts/readings language.** Options: “connected” vs “reported accounts.” Evidence: no connected/authenticated field and ledger-only owners. Chosen reported accounts; reversible copy. No inference that installed CLI equals signed in.
- **Keep selected failures expanded; quiet other empty states.** Options: collapse all unavailable vs protect selected context. Evidence: no-open-session and API-key-without-subscription states can occur on the selected route. Chosen visible selected context; all reasons/actions remain reachable. Reversible disclosure rule.
- **Preserve existing primary-window eligibility.** Options: timed-window selector vs rank every metric. Evidence: selectPrimary requires normalized usage/future reset; localUsage explicitly has no allowance/reset. Chosen timed-window selector with qualified wording; reversible presentation, no changed quota semantics.

## Open questions for the user (non-blocking)

1. Should a future version allow manually pinned providers in addition to the selected chat provider? Recommendation: defer; no pin signal exists today.
2. If “main” means the account of a specific live chat session rather than the persisted provider, which session should the dashboard follow? Recommendation: retain persisted-provider scope for this change; the contract has session mappings but no single dashboard-active session.

## Delivery limits

Only this visual-spec.md is authored. No source edits, prototype, screenshots, verification commands, commit or push. This is grounded in file inspection, not a claim of rendered visual quality. Skill files read directly because no skill-loading tool is exposed: ui-ux-designer (system investigation, layout and handoff references) and angular-frontend-patterns. Read/search used native rg and PowerShell file reads as explicitly requested; no Ptah workspace/index/browser operations. No visual assets are required; reuse provider marks and existing icons.

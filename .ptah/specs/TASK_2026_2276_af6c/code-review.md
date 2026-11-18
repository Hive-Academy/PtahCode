# Independent code review

Verdict: **APPROVE WITH FIXES** — **7/10**.

No Blocking or Major finding established. Two behavioural edge cases and obsolete mapping work remain. The normal quota, reset, accounting and selection paths support the 7–8 band; the disclosure requirement and finite-amount regression prevent a higher score. The evidence does not justify the 5–6 band's broader correctness gaps.

Paths below are relative to the worktree. `D/` means `libs/frontend/dashboard/src/lib/components/provider-account-card/`.

## Findings, ordered by severity

### Minor — Details state disappears when a retained owner changes groups

- **Evidence:** `D/provider-account-card.component.ts:114`, `:132`, `:159` render three separate Angular loops. `D/provider-account-summary-row.component.ts:35` and `D/provider-account-feature.component.ts:60` store expansion inside the child instance.
- **Trigger:** Open a windowless non-selected owner's Details while its cooldown is active. Once the clock passes `cooldown.until`, `D/provider-account-grouping.model.ts:44` moves it from Other into Without readings. A refresh that adds/removes its only reading has the same effect. Changing `activeProviderId` also changes component type.
- **Impact:** Angular destroys the old child; tracking the owner key in a different loop does not preserve it. Reopening the quiet group shows closed Details although the owner never left the snapshot. This violates visual-spec.md's instruction to preserve disclosure by owner key until departure. Existing refresh tests preserve group membership and do not cover this transition.
- **Fix:** Own expansion in the parent as state keyed by owner key, pass it to both presentations, and prune only keys absent from the snapshot. Cover cooldown expiry, reading arrival/removal and selected-provider changes.

### Minor — A finite source amount is discarded when its denominator is zero

- **Evidence:** `D/plan-window.model.ts:83`, `:122`, `:288`. `usedPercent` rejects nonpositive denominators (`libs/shared/src/lib/utils/plan-limits/window-state.ts:99`), while `formatUsed` retains finite amounts and limits (`libs/shared/src/lib/utils/plan-limits/plan-limit-format.ts:257`).
- **Trigger:** A window reports `{kind: 'amount', amount: 120, limit: 0, unit: 'requests'}` with no passed reset. The new template receives `Used: unknown`, despite a known source amount. Grouping also treats that sole numeric reading as absent at `D/provider-account-grouping.model.ts:36`.
- **Regression:** On main, `buildPlanTile`'s compactWindows mapper calls `formatUsed` independently of percentage eligibility; the deleted tile renders that value without a meter. The new mapper instead reuses windowFacts' percentage-gated text.
- **Fix:** Separate “can display source amount” from “can normalize allowance.” Keep the finite amount/source unit visible, explicitly qualify the unavailable ratio, omit the meter and primary eligibility, and count the retained numeric amount for grouping. Preserve reset-passage invalidation. Add this case to the new mapping/template tests.

### Nit — Remove the unused legacy tile representation

- **Evidence:** `D/plan-tile.types.ts:119` through `:145`; construction at `D/plan-tile-view.model.ts:82`, `:121`, `:142`, `:173`, `:266`. The new templates consume primaryWindow/secondaryWindows/accounting instead.
- **Unused legacy fields:** `headerTitle`, `readingSource`, `bar`, `primaryValue`, `primaryTone`, `compactWindows`, `shortReset`, `accessibleLabel`, `chips`, `secondary`, `statusChip`, `statusNoticeTone`, `statusNoticeTitle`, `hiddenWindowNotes`, `noUsageSource`.
- **Impact:** Every shared-clock recomputation still formats the old bars, chips, overflow tooltips and secondary metrics. Many retained tests assert this unused representation rather than what users now see.
- **Fix:** Remove these fields and their exclusive types/helpers; retain the primary selector and construct statusPill directly from primary eligibility. Migrate useful assertions to the new fields before deleting legacy-only tests. The new `fieldProvenance` field is also unconsumed (`D/plan-window.model.ts:266`); either expose its intended per-field detail or remove it separately.

## Five logic questions

1. **How does this fail silently?** A finite zero-denominator amount becomes unknown and may move into the collapsed group (second finding).
2. **What user action produces unexpected behaviour?** Opening Details followed by a refresh or provider change can discard expansion while the owner remains (first finding).
3. **What input produces a wrong answer?** The amount/zero-limit tuple above loses source information. No ordinary percent-to-amount unit mixing was found: timed saturation, literal balances and historical accounting remain separate (`D/plan-accounting.model.ts:162`, `:205`).
4. **What happens when a dependency fails?** The section retains snapshot content and shows a partial-state refresh notice (`D/provider-account-card.component.ts:84`, `:209`). Initial failure uses an error state panel. Cached owners retain stale notices and neutral aged meters (`D/plan-owner.model.ts:206`; `D/plan-window.model.ts:298`).
5. **What is missing from the requirements?** Conflicting duplicate snapshots have no explicit reconciliation rule: first key wins at `D/provider-account-grouping.model.ts:26`. Backend discovery already deduplicates, so this is residual malformed-input uncertainty, not a claimed production defect. A later conflicting duplicate's evidence would be discarded.

## Scope and checks

- Read the changed production models, components/templates, shared list-row and harness scenario, the relevant tests, visual-spec.md, task.md and root CLAUDE.md. Compared the old monolithic model and deleted tile against main. Restricted review to the dashboard hierarchy, additive row API and named harness change; `git diff main` also contains unrelated inherited changes.
- No context.md, task-description.md, implementation-plan.md or code-style-review.md exists in this task folder. The supplied behaviour and approved visual spec supplied the review contract.
- **Selection/grouping:** persisted activeProviderId is a computed dependency and a reload trigger (`D/provider-account-card.component.ts:184`, `:221`). Selected unavailable/unknown owners stay featured; numeric windows, accounting, active confirmed owner/window evidence and cooldowns keep non-selected owners in Other (`D/provider-account-grouping.model.ts:32`). Input order is retained; keys are deduplicated before rendering. Distinct unknown keys remain separate.
- **Window semantics:** classifyWindow/usedPercent/selectPrimary retain main's finite-percent, future-reset, tie-break and reset-passage rules (`D/plan-window.model.ts:197`). No first-window hero fallback remains. Reset-invalidated values have no meter; stale/unconfirmed/estimated windows use neutral tone. Secondary windows retain full labels/scope and all overflow windows remain reachable (`D/provider-account-feature.component.html:64`, `:107`). The coordinator's exhaustion-only reset fix is present at `D/plan-window.model.ts:301`.
- **Evidence/cooldown:** owner evidence retains scope, source and reset text; overflow evidence titles are rendered as text, and cooldown explicitly describes a retry delay (`D/provider-account-feature.component.html:38`; `D/provider-account-summary-row.component.html:50`; `D/plan-tile-view.model.ts:285`). Estimates do not acquire confirmed-limit tone.
- **Angular/accessibility:** OnPush and input/computed signals drive all new views. Same-group clock/refresh updates preserve child expansion. Detail IDs encode owner keys and use distinct feature/summary prefixes. Deduplication prevents duplicate row IDs within this section. Explicit display:none protects flex detail containers; the quiet container has no competing display class. Buttons are siblings of content, not nested controls. Meters have label and source valueText (`D/provider-quota-window.component.html:22`). Cross-group preservation is the exception reported above.
- **All frontend list-row callers:** the existing production caller is `libs/frontend/chat/src/lib/settings/providers/provider-catalog-modal.component.ts:63`; it supplies leading/trailing slots and leaves wrapText false. Existing host classes/current/selection attributes remain identical; default title/meta retain truncate. The new empty body wrapper is empty:hidden, and responsive rules require both wrapText and a body. The Angular Aria listbox/disabled/current test hosts in `libs/frontend/ui/src/lib/foundation/list-row.component.spec.ts:15` retain their host directives. No selection logic was added or removed. CSS layout was inspected, not rendered.
- **Harness:** `libs/frontend/webview-e2e-harness/src/lib/scenarios/plan-limits/plan-limits-visual.e2e.spec.ts:216` matches the feature/summary test IDs. DASHBOARD_SNAPSHOT contains four distinct owners (two Claude, Codex, unknown proxy); hidden quiet rows remain in DOM, so count=4 holds. The one cooldown belongs to Claude A and remains visible whether selected or Other. The exact section Refresh locator matches. The revised descendant role=status locator matches the inner partial state panel (`libs/frontend/ui/src/lib/foundation/state-panel.component.ts:10`). These are static locator checks, not an e2e execution.
- **Repository rules:** reviewed changed/new files are below 700 lines. No prohibited any/double cast/non-null assertion, ngClass/ngStyle/innerHTML or new raw daisyUI component class was found in the changed dashboard templates. Shared state-panel internals are pre-existing and outside this change.
- **Verification:** coordinator results supplied with the assignment: 79/79 + 2/2 Jest, lint/typecheck and template typecheck passed. Independently requested scoped ptah_get_diagnostics: no diagnostics in the ten requested model/component files; six sibling diagnostics were reported (one skill-selection-card spec boolean/void mismatch and five ES2020 BigInt target errors in shared files). These do not establish a regression in this change. No Jest, Nx, verify, build, serve or e2e command was run here; no rendered visual verdict is claimed.
- **Tool limits:** ptah_code_search_symbols returned zero hits with an empty index; native rg supplied the shared symbol locations. ptah_search_files returned zero task-folder hits; native listing/read supplied task documents. No skill-loading tool or host skill catalogue was exposed, so angular-frontend-patterns was unavailable to load; the explicit project Angular rules were used for this review.

## Decisions

- Review the named dashboard change rather than unrelated inherited differences against main; evidence: supplied scope and git status. Reversible review boundary.
- Keep source and task state untouched. Write only the task-requested code-review.md; no source fixes, commits, pushes or stashes.

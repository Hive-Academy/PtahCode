# Design spec review - TASK_2026_2310_rvlns

| Field | Value |
| --- | --- |
| Artifacts | `design-spec.md` (188 lines), `prototype/index.html` (242 lines) |
| Author | ui-ux-designer subagent (Claude) |
| Reviewer | document-review subagent (Claude) |
| Execution sides | Author: Claude. Reviewer: Claude. Same family, so this is **weaker evidence**. No CLI lanes in this session (decisions.md D3). |
| Reviewed revision | round 0 (initial draft); round 1 = design-spec.md revision 2 and prototype revision 2; round 2 = design-spec.md revision 3 (318 lines) and prototype revision 3 (see "Round 2" at the end) |
| Completed revise rounds | 2 (the cap) |
| Verdict | Round 0: REVISE. Round 1: REVISE. **Round 2: APPROVED** (R2-R11 closed in the spec; 4 prototype-only items are open for the user gate, listed in Round 2) |

Inputs read: `task-description.md` (revision 2, Gate 1 APPROVED), `decisions.md` D1-D8, `context.md`,
`docs/design-system/settings/README.md` ("User decisions after rev 2"), `docs/design-system/settings/visual-gate.md`,
and the source cited below. No artifact or code was edited. No nx, build or serve command was run.

## 1. Requirement trace

| Req | Requirement | Spec section | Result |
| --- | --- | --- | --- |
| 5.1 | Section lists the lanes the gateway can run, with family and limit state, plus the current pool and pins | §2 Add control (design-spec.md:66-68), pool row badges (:52-58), pin lane options, §9 (:187-188) | Traced. The spec shows only one limit state (`at-limit`), but the gateway has three (F6) |
| 5.2 | Models come from the live catalog. A "lane default" choice saves no model. An empty or unreadable catalog says so and still allows lane default | §3 copy rows (:79-81), §4 "Model catalog unreadable" (:101) | Traced. The unreadable state is scoped to the whole section, but the data is per lane (F5) |
| 5.3 | Add, remove, reorder, pin and unpin are saved exactly | Decisions row 5 (:20), §2, §4 Pins set (:99) | Traced. One Save button, as `review-settings-drawer.component.html:156-165` already has |
| 5.4 | A stale lane or model is marked unavailable, kept, and removable | Decisions row 6 (:21), §3 (:83-87), §4 Unavailable (:100) | Traced. A pin to a missing lane stays in the select as `<id> (unavailable)`. A stale model stays as `<model> (not offered)` |
| 5.5 | With an empty pool and no pins, the section says reviews follow the global agent order | §3 Empty (:75), §4 Empty (:97) | Traced (copy nuance in F8) |
| 5.6 | Keyboard alone, and every control has an accessible name | §5 (:107-136) | Traced. `ptah-select` already stops Escape while its panel is open (`rich-select.component.ts:248-251`), so the drawer's Escape handler (`review-settings-drawer.component.ts:231-235`) does not close the drawer first. The spec's claim holds |
| 3 (UI side) | Pins for triage, the 4 lenses and the verifier. The verifier avoids author families | §2 item 4 (:49), info text (:46) | Traced. The 6 roles match `LensSchema` plus triage and verifier |
| 4.1/4.3/4.4 (UI side) | Reasons: lane not listed, at limit, model not offered, pinned lane disabled | §3 (:83-86), §7 reasons (:164) | Traced |
| 4.2 / NFR | Live catalogs only, no static model list | §3 (:81), §4 (:101), prototype model ids are fixture data only | Traced. Nothing in the spec adds a model list |
| 4.7 | A run recorded after the change shows the fallback note, and every stage card shows the lane and model | §7 (:157-165) | Traced, with a gap for stage cards that run no lane (F4) |
| 4.8 | An older run accepts null lane, model and fallback, shows the family only, and renders without error | §7 (:167-171) | Traced. The per-record rule is ambiguous (F4) |
| NFR Electron first | Renderer in `apps/ptah-extension-webview`, lib `review-runs-ui` | Scope (:3-10) | Traced |

Missing items: none untraced. F4, F5 and F6 are partial-coverage gaps.

## 2. Parity deltas

- The drawer frame, Save button, `saveError` line and the existing sections do not change (design-spec.md:3-5). This matches `review-settings-drawer.component.html:1-166`. No existing `id`, `data-testid` or `aria-label` is removed, which `visual-gate.md` rule 7 requires.
- Run detail: lens cards keep "Family: x · Verifier family: y" (`review-run-detail.component.ts:62`). Pipeline cards gain lines that do not exist today (:51-55). This is additive. The same-family badge (:66) does not change.

## 3. Feasibility citations (verified)

| Spec claim | Source | Result |
| --- | --- | --- |
| `ptah-select` with `size="xs"`, `label` or `labelledBy`, no `ptah-field` | `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts:54,79,87,106`; `form-control.types.ts:2` (`'xs'\|'sm'\|'md'`); README.md:23-25,37-39 | Real. This is the compact exception the user decision allows |
| Option description line and disabled options | `rich-select.types.ts:6,9` | Real |
| Panel is not clipped by the drawer's `overflow-y-auto` | `floating-ui.service.ts:215-223` (`position: fixed`, strategy `fixed`) | Real |
| Panel "at least 200 px wide" | `rich-select.component.ts:296` sets an inline `min-width` equal to the anchor width | **Not supported** (F3) |
| Badge `appearance="outline" size="xs"`, tones neutral, accent, info, ok, warn, err | `badge/badge.types.ts:4,7,10`; `badge.directive.ts:21-23` | Real, but `tone="warn"` colours the text (F2) |
| `button[ptahButton] variant="ghost" size="xs"` | `button/button.types.ts:1-3`; `button.directive.ts:31,33` | Real. `ptahIconButton` is the better owner (F7) |
| Info popover from `ptah-field` `info` | `surfaces/field.component.ts:113-138,178`. It is built on `ptah-native-popover` (`native/popover/native-popover.component.ts:79`, exported through `lib/native`, `ui/src/index.ts:38`) | Reusable on its own (F9) |
| `surface-2`, `rounded-box`, `border-base-300`, `text-base-content-muted`, `sr-only` | `styles.css:170,399-412`; `tailwind.config.js:32`; drawer `.html:3`; run detail `.ts:51,20` | Real |
| Inline `alert` row for the lane-list error | `tools/ui-class-audit/check-ui-classes.ts:92-94` blocks the `alert` root. The drawer has no baseline entry (`baseline.json:749-761`) | **Fails the audit** (F1) |
| Skeleton line | `check-ui-classes.ts:92-105` blocks `skeleton`. `ptah-skeleton` exists (`foundation/skeleton.component.ts:12`, `aria-hidden`) | It must be `ptah-skeleton` (F1) |
| Gateway lane data | `apps/ptah-electron/src/services/review/review-lane-gateway.ts:71-73` returns `id`, `family` and `limitState` (`confirmed-room`, `at-limit`, `unknown`). It has **no label** | Architecture input (§6) |
| Narrow drawer | The drawer is `w-full max-w-xl` (`.html:3`). Drawer width below 520 px therefore means viewport width below 520 px, so a viewport breakpoint carries the pin-row switch and no container query is needed | Feasible |

Width check at 400 px. The content width is 360 px after `p-5`. A pool row is 24 px for the number, about 84 px for three xs icon buttons, and gaps, which leaves about 220 px for the name and the model select. A pin row at 2 columns leaves about 165 px per select. Both fit with ellipsis.

## 4. Proposed-constraint decisions

| Constraint in the spec | Decision | Reason |
| --- | --- | --- |
| Section placed after the numeric grid, before bot identity (:16) | Accept | It sits next to Lane cap per PR (`.html:122-132`) |
| No native select, compact `ptah-select` (:17) | Accept | README.md:16-25 |
| Reorder by buttons, no drag (:18) | Accept | Req 5.6 |
| Fixed 6 pin rows, with "Follow the pool" as the no-pin value (:19) | Accept | A closed set of roles |
| Warn and error colour never as text colour (:22, §6) | **Accept the outcome. Reject the stated evidence** (F2) | Base-content text is safe. But the measurement used daisyUI `warning` and `error`, not the state inks the badge actually uses |
| Run detail shows raw lane ids, not labels (:23) | Accept | Deleted `ptah-cli:<id>` lanes have no label |
| Pool maximum of 12 (:88) | Accept as provisional | It is the requirement's recommended default (task-description.md:253-254), which the architect still has to confirm. The UI must read the schema bound and not hard-code 12 |
| Panel at least 200 px (:180) | **Reject** (F3) | The component does not support it |
| `<fieldset [disabled]>` while saving (:104) | Accept | A native disabled fieldset disables the `ptah-select` trigger button. The focus rule at :136 covers the focused-button case |

## 5. Findings

**F1 - MAJOR - blocked DaisyUI classes.** design-spec.md:35-36 (Loading, "skeleton line") and :36 / :102 (Lane-list error, "inline `alert` row", "drawer pattern (`alert alert-error` in run detail)").
`tools/ui-class-audit` blocks the `alert` and `skeleton` roots (`check-ui-classes.ts:92-105`) in `libs/frontend/**`. The drawer file has no baseline entry (`baseline.json:749-761` lists only bot-identity, run-detail, runs-list and runs-page). The run-detail usage that the spec cites as precedent is baselined debt, not a pattern to copy, and new usage fails the ratchet (`check-ui-classes.ts:49-57`).
Impact: the implementer either fails the audit or invents a replacement.
Fix: name `ptah-alert` (`foundation/alert.component.ts:13`, `tone="error"`, `compact`, with the Retry button in the `[alertAction]` slot), or a plain `surface-2` bordered `div role="alert"` as the prototype draws it (prototype:170). Name `ptah-skeleton` (`foundation/skeleton.component.ts:12`, which is `aria-hidden`) inside a wrapper with `role="status"` and the name "Loading review lanes". For the row tint, name a static class binding such as `[class.bg-warning/10]`, which has precedent at `canvas-lane-view.component.ts:166`, instead of "warn at about 9 % mix" (:100). A `[class]` expression binding counts as `<dynamic>` in the audit.

**F2 - MAJOR - the badge tone contradicts the spec's own colour rule, and the contrast table measured the wrong tokens.** design-spec.md:33 sets `tone="warn"` for the At limit and Unavailable badges. design-spec.md:22 and :151 say warn colour is "never the text colour", and "all message and badge text uses `base-content` or `--bcm`".
`[data-ptah-badge]` sets `color: var(--_ink)` (`ptah-badge.css:18`), and `tone='warn'` sets `--_ink: var(--ptah-state-warn)` (:62). That token resolves to `--state-ink-need` (`ptah-tokens.css:277`). So the badge text is warn-coloured.
The token is the contrast-tuned state ink, though: in anubis-light it is `#8f5200`, and err is `#b4232a` (`tailwind.config.js:281-282`). My own computation, labelled an Assumption because nothing was rendered, gives about 5.2:1 and 5.5:1 on light `base-200`. Both pass. The §6 table measured daisyUI `warning: oklch(72% 0.18 55)` (`tailwind.config.js:297`) and the matching error colour, which is what `text-warning` / `text-error` use, and the prototype copies those values (prototype:11 `--warn`, `--err`). So the "FAIL" rows are correct for `text-warning`/`text-error`, but they do not describe badges or the `text-state-*` utilities, which the run detail already uses (`review-run-detail.component.ts:44` `text-state-need`).
Impact: an implementer cannot satisfy both §1 and §6 at once, and the table gives the next agent a false picture.
Fix, either of:
- (a) Recommended, because it matches the designer's intent exactly with an existing component: use `ptah-status status="warning" label="At limit"` / `label="Unavailable"` (`badge/status.component.ts:24`, INK `warning -> need` at :13). The word keeps the neutral ink, only the glyph takes the state ink, and the glyph is a diamond, so colour is never the only signal (`ptah-badge.css:65-66,118-121`).
- (b) Keep `ptahBadge tone="warn"` and correct §6 to say the badge uses the tuned state ink, which passes.

In both cases, relabel §6 to name the measured tokens (`warning`/`error`, daisyUI). Name the dot and the left border by real classes (`bg-state-need`, `bg-state-err`, `border-state-need`; `tailwind.config.js:34-35`) rather than "warn". These also clear 3:1 as non-text, so the "FAIL as sole signal" row no longer applies. Keep the base-content text choice for message lines. It is valid, and it is the more conservative option.

**F3 - MINOR - unsupported panel width.** design-spec.md:180, "the list panel is at least 200 px wide". `rich-select.component.ts:296` writes an inline `min-width` equal to the anchor width (capped at the viewport), so a consumer class cannot raise it. Remove the clause, or state it as a `ptah-select` change. That change would be outside this task's scope and is not needed, because descriptions such as "openai · at limit" fit in about 165 px.

**F4 - MINOR - the run detail rule is keyed on run age, but the UI decides per stage record.** design-spec.md:157-173.
(i) Requirement 4.7 says "every stage card" shows lane and model, but discovery, context, checks, identity and publication run no lane (`review-run-detail.component.ts:124` lists these stages).
(ii) Line 173 says the triage card shows its family "the same way", but new-run pipeline cards get only the lane line (:159, prototype:189-190 shows the family only when `old`).
Fix: state one rule per record:
- lane is not null: lane line, then the family line if wanted (decide: yes or no for triage and verification).
- lane is null and family is not null: `Family: {family}`.
- both are null: nothing.
- fallback is not null: the note.

Also say that stages that run no lane show no lane line.

**F5 - MINOR - catalog failure scope.** design-spec.md:81, :101 and §9 :187 call for a per-lane "read failed" flag, but the UI shows one section-wide note, and :101 says "No model is marked unavailable". When one lane's catalog fails and another's succeeds, the spec does not say which note shows or which rows skip the "not offered" check. Fix: show a row-level hint on the affected lanes, plus the section note only when every read failed (or say that the section note names the lanes).

**F6 - MINOR - limit state is three-valued.** design-spec.md:33,55,68. The gateway reports `confirmed-room`, `at-limit` or `unknown` (`review-lane-gateway.ts:72-73`). Requirement 5.1 asks for "limit state", and task-description Risks row 3 names unknown-limit lanes as a completion risk. The spec shows only At limit. Fix: add "limit unknown" to the option description (and optionally as a neutral row badge), or record a decision that unknown is not shown, and why.

**F7 - MINOR - icon-only buttons.** design-spec.md:32,56 use `button[ptahButton]` with `aria-label`. The library's icon-only owner is `button[ptahIconButton]` with a required `label` that becomes both the accessible name and the tooltip (`button/icon-button.directive.ts:27,44,63-65`, a dev-mode error when it is empty). Fix: name `ptahIconButton` (`variant="ghost" size="xs"`) and the icons to use. The prototype uses text glyphs ↑ ↓ ✕ (prototype:146).

**F8 - MINOR - copy for an empty pool with pins.** design-spec.md:77-78. With pins set and an empty pool, "Roles without a pin follow the pool" and the option "Follow the pool" point at an empty pool, while unpinned roles actually follow the global agent order (task-description req 2.1). Fix: extend the pin hint, for example "Roles without a pin follow the pool, or the global agent order when the pool is empty." The option label can stay.

**F9 - MINOR - info popover reuse.** design-spec.md:34 leaves it open whether the field info popover "can stand alone". It can: `ptah-field` builds it from `ptah-native-popover` with a trigger button and a `role="dialog"` content panel (`field.component.ts:113-138`), and `ptah-native-popover` is exported (`native-popover.component.ts:79`, `index.ts:38`). Fix: name `ptah-native-popover` with the same trigger and panel markup, and drop the `role="note"` toggle fallback (prototype:168-169). This is also listed as an architecture input.

## 6. Architecture inputs (not design defects)

These are needs the designer listed (design-spec.md:34, :187-188). None makes the design infeasible.

1. Gateway lane list for the UI: `id`, **label**, `family`, `limitState`. `ReviewLaneCapability` carries no label today (`review-lane-gateway.ts:71-73`). The label must come from the system CLI rows and Ptah CLI agent names (`PtahCliEntry.name`, :21).
2. Per-lane model list from the live catalogs (`agent:listCliModels`, `LaneModelListing`), with a per-lane read-failed flag (see F5). No static fallback.
3. Pool and pins in the drawer draft. The drawer emits `changed: Partial<OperatorSettings>` (`review-settings-drawer.component.ts:56`), but pool and pins are stored outside `settings_json` while travelling through the same RPCs (decisions.md D5). The architect defines the draft type that carries them.
4. The section save error "the pool has a duplicate entry" (design-spec.md:90) needs either a client-side check before save or a server validation code that the store maps to this section. The architect chooses which.
5. The pool maximum (12, provisional) is exposed from the schema, so the UI does not hard-code it.
6. Lane-list and model-list loading and retry are separate from the drawer's settings `loadState` (`.html:32-41`). The store needs its own state and a retry action for the lane list (design-spec.md:82, :102-103).

## 7. Other checks

- Real components and tokens: apart from F1 (`alert`, `skeleton`), F2 (badge tone) and F3 (panel width), every named component, input and class exists (§3).
- No static model lists: confirmed. Prototype model ids are fixture data in the throwaway HTML only (prototype:95-100).
- Plain copy: the copy is short, concrete, and says what happens ("Reviews skip it and say so."). F8 is the only copy issue.
- Visual gate: the later visual review should apply `visual-gate.md` rule 9 (each changed control type in the empty, focus and with-value states, plus one open `ptah-select` menu) and rule 7 (parity of `id`, `data-testid` and `aria-label`). This is recorded for the visual-review phase. It is not a spec defect.
- Pre-existing `text-error` save line at 3.19:1 on light (design-spec.md:151): correctly left out of scope and flagged.

## 8. Unresolved items

- F1-F9 are open for round 1. No scope, removal, security, privacy, licensing, money or public-compatibility question was raised. Nothing needs escalating to the user.
- The contrast values in F2 are computed, not rendered (Assumption). The visual-review phase confirms them in Electron with the light theme.

## Verdict

**REVISE** - round 0. Fix F1 and F2, which are required. F3-F9 are small edits. Recheck as revision 1 in this same record.

---

# Round 1 - design-spec.md revision 2, prototype revision 2

Reviewed: `design-spec.md` (291 lines, revisions 1 and 2), `prototype/index.html` (295 lines), `prototype/README.md`, `parity-inventory.md` (40 capability rows plus the identifier table), decisions.md D9-D12, `screenshots/before-*.png`, and the orchestrator's rendered prototype screenshots `screenshots/proto-*.png` (Edge, 1440 px). Same-family review (Claude on Claude), so this is weaker evidence. No artifact or code was edited, and no nx, build or serve command was run.

## R0. Round 0 findings - closure

| Finding | Where addressed (design-spec.md) | Closed |
| --- | --- | --- |
| F1 `alert` / `skeleton` classes | §4.1 :145-146, :150; tint `[class.bg-warning/10]` :139 | Yes |
| F2 badge tone, contrast tokens | `ptah-status status="warning"` :32, :143; §5 measures `--state-ink-*` :225-236 | Yes (but see R5: only the anubis themes) |
| F3 200 px panel | :260 "as wide as their trigger" | Yes |
| F4 per-record run-detail rule | §6 table :242-247; no-lane stages :246; triage family :244 | Yes |
| F5 per-lane model read failure | :155, :174-175, :194 | Yes |
| F6 three limit states | :144, :164, :191 | Yes |
| F7 `ptahIconButton` | :141, :81 | Yes |
| F8 pin hint, empty pool | :157 | Yes |
| F9 `ptah-native-popover` info | :133. Escape is stopped by the popover host (`native-popover.component.ts:504-509`), so it does not close the drawer first | Yes |

## R1. Requirement trace and parity check (revision 2)

Requirements 5.1-5.6, 4.7 and 4.8 still trace to the same sections (now §4 and §6). Parity was checked row by row against `parity-inventory.md:84-124`:

- **Kept:** open, close by the X button and by Escape, focus trap (native, `native-drawer.component.ts:312-335`), title focus on open (spec :23, :71), focus restore (native `:343-348`), modal semantics, title and subtitle, loading, error with Retry, repositories (list, empty, add with validation, remove, polling, dry-run rule, per-repository pause, bot hint, fork footnote moved to the section description), attestor, maintainers, the 4 number fields, plaintext warning, Save token, replace-token confirm, Verify, Remove connection confirm, identity and credential errors, global pause with the resume confirm, the 4 confirm dialogs, save error, Save with "Saving…", the draft flow.
- **Removed with approval:** "Effective repository configuration" (D10).
- **Changed against a decision:** Minimum severity (R2).
- **Copy lost:** bot identity status lines (R3).
- **Identifiers:**
  - `review-settings-title` (:63), `review-attestor` / `review-maintainers` (:109), `review-add-repository` (:105), `review-bot-token` (:124), the 4 dialog ids and `<id>-description` (:74), "Close review settings" (:21, :63), "Remove {owner}/{name}" (:102, :217) and the `ptahToggle` switch (:129) are all kept.
  - The dialog name "Review settings" is kept through `ariaLabel` (:49, :75). The native panel renders it as `aria-label` (`native-drawer.component.ts:89`), which satisfies `getByRole('dialog', { name: 'Review settings' })` (`wave1.spec.ts:36,95`). The old `aria-labelledby` attribute becomes `aria-label` with the same name. I accept that; the name is what the e2e test and assistive tech read.
  - The `role="alert"` rows need care: see R6.

## Findings (round 1)

**R2 - MAJOR - Minimum severity contradicts D12.** design-spec.md:26, :35-44 and §3.3 :114 specify a `ptah-select` bound to a new operator setting. The prototype renders a "Minor" dropdown (prototype:220; orchestrator observation (a); `proto-dark-pool.png`, Review thresholds). D12 (decisions.md:16) decided on an honest read-only note, "Set in the repository review config.", **instead of** the unbound "Minor" text, with no new operator setting in this PR.
Impact: the spec asks for a schema, storage and policy change outside Gate 1 scope, and its own fallback (:43, "Minimum severity: Minor") still shows the unbound literal that D12 removes.
Fix: replace the Decisions row, the open item and §3.3 with the D12 row: a label "Minimum severity" plus the `text-xs text-base-content-muted` note "Set in the repository review config.", with no value and no select. Remove the select from the prototype. Note for the architect: `review-settings-drawer.component.spec.ts:50` expects the text "Minor" and must change with D12. The unused `minimumSeverity` input (`drawer.ts:52`) can go.

**R3 - MAJOR - bot identity status copy loses two states.** §3.4 (:119) says "Content and rules unchanged", but :123 turns the status into `ptah-status online "Connected as {login}"` / `offline "Not connected"`. Today there are three states (`review-bot-identity.component.ts:19-36`):
- connected: "Connected as {login}", plus "Reported scopes … | Connected … | Verified …"
- token without identity: "Bot identity unavailable. Verify connection."
- no token: "No bot connected. Live publication is unavailable."

The field label also switches between "Connect bot token" and "Replace bot token" (:38-40), and Remove connection shows only with a token (:67). The spec drops the two non-connected texts and does not mention the label switch.
Fix: keep all three texts verbatim, using `ptah-status` `online` / `warning` / `offline` with a short word, and the sentence in a `text-sm` line beside or under it. `ptah-status` text is `nowrap` with ellipsis (`ptah-badge.css:89-93`), so it cannot hold a long sentence. Keep the label switch, the "Remove connection only with a token" rule, the "Save token disabled while saving" rule (:55), and the full connected / scopes / verified line.

**R4 - MAJOR - confirm dialogs: glass translucency and top-layer mechanics are not specified.**
(i) The dialog panel is `<section class="surface-1 …" role="dialog">` (`review-confirm-dialog.component.ts:9`). Glass turns `.surface-1` into the translucent `--glass-scrim-text` plane, and `role="dialog"` is not excluded (`styles.css:3733-3737`). Moving the dialog to the top layer (:24, :74) does not change that, so the confirm dialogs keep exactly the see-through defect D9 reports for the drawer. The spec's card rule (:25) covers only cards *inside* the drawer.
(ii) `popover="manual"` on the dialog root (`fixed inset-0 z-[60] … bg-black/60`, :8) needs the user-agent `[popover]` box reset (width, height, margin, border, padding, background, overflow), as `native-drawer.component.ts:137-152` does. Without it the overlay renders as a centred, bordered, fit-content box.
Fix: specify an opaque panel (`bg-base-100 border border-base-300 rounded-box shadow-2xl`, no `.surface-1`) and the popover reset, or reuse an existing top-layer dialog owner from `@ptah-extension/ui` if the architect finds one. Keep `dialogId`, `<id>-description`, the h2 focus, the Escape `stopPropagation` (:43) and the focus return (:36-41).
The ordering claim itself is sound. A popover shown later paints above an earlier one, and the drawer's Escape and Tab handling is bound to its panel only (`native-drawer.component.ts:92,279-291`), so a sibling dialog is not pulled back by the trap.

**R5 - MAJOR - themes: the gold primary and the glass themes are missing.** Orchestrator observation (b). The before screenshot (`before-drawer-dark-1440.png`) shows gold "Save token" and "Save review settings". That gold is the `ptah-glass` theme's primary `#e4b94a` (`tailwind.config.js:317-319`). `anubis` primary is `#2563eb` (`:173`), which is what the prototype copied (prototype:33).
- The spec keeps `ptahButton variant="primary"` for Save review settings (:65), the same variant as today (`review-settings-drawer.component.html:156-160`) and as the connection drawer (`connection-detail-drawer.component.ts:139`). So in the app the button stays gold in `ptah-glass`. Requirement met; only the prototype shows the wrong look.
- Real gap: §5 and §7 (:225-236, :261) measure and specify only `anubis` and `anubis-light`, while the user's theme and the e2e visual-parity capture run `ptah-glass` with glass on (`wave1.spec.ts:29-37`, `${theme}-glass`).

Fix:
- Add `ptah-glass` and `ptah-glass-light` to §5. The new pairs are `--bcm` (`:335`), the state inks (`:335-339`, `:380-384`) and base-content on `base-100` and `base-200`.
- Add both themes to §7.
- Note that the prototype's primary colour is anubis-only.
- Record "Save token" moving from `primary` to `outline` (:125; today `review-bot-identity.component.ts:54` is primary) as a deliberate visible change for the Gate 1.7 before/after. One primary per view is a defensible rule; I accept it if it is recorded.

**R6 - MINOR - `role="alert"` parity depends on the `live` input.** `ptah-alert` renders no role unless `live` is `polite` (status) or `assertive` (alert) (`alert.component.ts:64-69`). The spec sets `live="assertive"` for the footer save error (:65) and the lane-list error (:145), but not for the plaintext warning (:122) or the identity and credential errors (:125). Those are `role="alert"` today (parity-inventory.md:146).
Fix: state `live="assertive"` on each. Also state the footer save error as `@if (saveError())`. "empty:hidden" (:65) does not hide a `ptah-alert`: its inner `div.alert` is never empty, so an always-rendered alert would show an empty box.

**R7 - MINOR - the Review lanes divider is lost behind the `fieldset`.** Orchestrator observation (c). The prototype separates sections with `.sec+.sec` (prototype:26), and the Review lanes section sits inside a `fieldset` (:182, kept by spec §4.4 :197). The sibling rule therefore does not match, and the section sits flush under "Lane cap per PR" (`proto-dark-pins-lanes.png`).
Fix: spec :64 should state that the divider (`border-t border-base-300 pt-5`) goes on each section element explicitly, or on the `fieldset` when it wraps a section, and never through a sibling selector. Fix the prototype the same way.

**R8 - MINOR - repository error text contrast.** §3.1 (:105) keeps the repository error as today's `text-sm text-error` line (`review-repositories-editor.component.ts:87`), which is 3.19:1 on light per §5's own reference row. Round 0 accepted that as out of scope, but revision 2 redesigns the whole drawer.
Fix: use the same pattern as the other error lines (base-content text with a `bg-state-err` square, or `ptah-alert tone="error" compact live="assertive"`). The same applies to the identity and credential error lines (`review-bot-identity.component.ts:77-84`), which R6 already moves to `ptah-alert`.

**R9 - MINOR - the e2e pixel baseline will change.** `wave1.spec.ts:36-39` captures `review-settings-before-{dark,light}-glass.png` with `maxDiffPixels: 0`. The redesign changes every pixel of that dialog, and the pointer park point at x=300 (`:33`) assumed the old backdrop.
Fix: §8 should list "regenerate the visual-parity baseline for `review-settings-before` and confirm the park point still lands on the backdrop". Visual-gate rule 4 also wants the prototype screen stored under `docs/design-system/settings/prototype/screens/`, if this drawer falls under the Settings gate.

**R10 - MINOR - prototype fidelity.**
- The prototype's Minimum severity select has no visible label (R2 removes it anyway).
- `prototype/README.md` says "No screenshots are included", but `screenshots/proto-*.png` now exist.

Fix: update the README line.

**R11 - MINOR - the spec duplicates focus and Escape handling.** The native drawer restores focus to the element focused before opening (`native-drawer.component.ts:247-250,343-351`) and owns the Tab trap and Escape (`:279-335`). The old drawer has its own `returnFocus`, `onKeydown` trap and Escape (`drawer.ts:218-257`).
Fix: say that the drawer component drops its own trap, Escape handler and `returnFocus`, and leaves them to the native drawer. Otherwise two handlers run; both target the same element, so the effect is harmless but redundant. The parity rows (inventory :88-90) are met by the native component.

**R12 - Note, not a defect - initial focus flicker.** The native drawer first focuses its first focusable element, the X button (`native-drawer.component.ts:304-309`), then emits `opened`, and the spec moves focus to the title (:23, :50). A screen reader can announce "Close review settings" before the title. Acceptable. An alternative, if the architect prefers, is a `ptah-native-drawer` input for the initial focus target. That would be a shared-lib change and is not required.

## Escape, focus and glass summary

- Escape order: an open `ptah-select` list (`rich-select.component.ts:248-251`) or the info popover (`native-popover.component.ts:504-509`) closes first. Then the drawer panel closes (`native-drawer.component.ts:280-285`, `closeOnEscape` default true). A confirm dialog handles its own Escape (`review-confirm-dialog.component.ts:43`), and as a sibling it is never seen by the drawer. Sane.
- Backdrop: `closeOnBackdrop=false` (:22) is supported (`native-drawer.component.ts:226-227,270-273`). Accepted for a long form.
- Glass: the drawer panel is opaque `bg-base-100` (`native-drawer.component.ts:85`). Inner cards use `bg-base-200`, which no glass rule rewrites for plain blocks. The rewrites at `styles.css:4021-4039` apply only to inputs, selects and `.btn`. The remaining translucency risk is the confirm dialog (R4).
- Real components and icons: `ptah-native-drawer` and its inputs are real (`native-drawer.component.ts:206-236`), and so are `ptahIconButton`, `ptah-status`, `ptah-alert`, `ptah-skeleton` and `ptah-native-popover` (round 0 §3). `lucide-angular` with `[img]` is the pattern the native drawer itself uses (`:47,110`). The icon names in §2 are standard Lucide exports. Assumption: the implementer confirms each against the installed `lucide-angular` version with a typecheck.

## Proposed-constraint decisions (round 1 additions)

| Constraint | Decision |
| --- | --- |
| Native drawer shell, top layer (D11) | Accept |
| Own X button "Close review settings", native close off | Accept (identifier parity) |
| `closeOnBackdrop=false` | Accept |
| Initial focus on the title | Accept (R12 note) |
| Confirm dialogs as top-layer siblings | Accept the placement. The panel surface and popover reset are required (R4) |
| Cards `bg-base-200`, no `.surface-*` | Accept |
| Minimum severity as a select with a new operator field | **Reject** (D12, R2) |
| Save token demoted to `outline` | Accept if recorded as a visible change (R5) |
| Section order and icons | Accept |

## Unresolved items after round 1

- R2-R11 are open for round 2. R2-R5 are required.
- No new user decision is needed: D12 already settles R2. R3 restores existing copy, R4 and R5 are within D9/D11 scope, and no removal is proposed beyond D10.
- The contrast values remain computed, not rendered (Assumption). The visual review confirms them in Electron in `ptah-glass`, `ptah-glass-light`, `anubis` and `anubis-light`, with glass on and off.

## Round 1 verdict

**REVISE.** F1-F9 are closed. Revision 2 still contradicts D12 (R2), drops bot status copy (R3), leaves the confirm dialogs translucent in glass with no popover reset (R4), and omits the user's actual themes (R5). R6-R11 are small edits. Recheck as round 2 in this record.

---

# Round 2 (final allowed round) - design-spec.md revision 3, prototype revision 3

Reviewed:
- `design-spec.md` (318 lines, "Revision 3" changelog :305-318)
- `prototype/index.html` and `prototype/README.md`
- the rendered screenshots `screenshots/proto-<theme>-<state>-{top,lanes,bot}.png` (Edge, 4 themes, 9 states, `ptah-glass` default). Inspected directly: `proto-ptah-glass-pins-lanes.png`, `proto-ptah-glass-pins-bot.png`.

Scope: R2-R11 and regressions only. This is a same-family review (Claude on Claude), so it is weaker evidence. Nothing was edited and no nx, build or serve command was run.

## R2-R11 closure

| Finding | Where addressed | Closed |
| --- | --- | --- |
| R2 Minimum severity (D12) | Decisions row :25; §3.3 (label plus "Set in the repository review config.", no value, no control, unused input removed); handoff 9.8 for `drawer.spec:50`; prototype :228; screenshot `proto-ptah-glass-pins-lanes.png` shows the note | Yes |
| R3 bot identity copy and rules | §3.4: the three states verbatim, matching `review-bot-identity.component.ts:19-36`; Connect/Replace label; Remove connection only with a token; Save token disabled while saving; status word kept short because `ptah-status` text is nowrap. `ptah-status` values `online`, `warning` and `offline` exist (`status.component.ts:5-15`) | Yes |
| R4 confirm dialogs | §1 behaviour: popover reset as `native-drawer.component.ts:137-152`; opaque `bg-base-100 border border-base-300 rounded-box shadow-2xl`, not `.surface-1`; ids, description, focus and Escape kept; handoff 9.1 | Yes |
| R5 themes | §5 measures all four themes, plus primary-button text (9.88 and 6.16); §7 lists all four; prototype defaults to `ptah-glass`, and Save renders gold (`proto-ptah-glass-pins-*.png`); §8 item 3 records Save token moving from primary to outline | Yes (see note N3) |
| R6 `live="assertive"` and footer `@if` | §1 footer; §2 alerts line; §3.4 | Yes |
| R7 section dividers | Spec §1 Body: a divider on each section element, or on the `fieldset` that wraps one, and never a sibling selector | Yes in the spec. **The prototype regressed** (P1) |
| R8 repository error contrast | §3.1: base-content text with a `bg-state-err` square, `role="alert"` | Yes |
| R9 e2e baseline | Handoff 9.9 | Yes |
| R10 README | The "no screenshots" claim is removed | Partly. The README now says the screenshots "show revision 2; regenerate them", but they were regenerated (P4) |
| R11 duplicate focus and Escape handling | §1 behaviour and handoff 9.1: the drawer keeps only the title-focus call on `opened` | Yes |

R12 is recorded as handoff 9.12. No action was required.

## Regression check

The spec has no regressions. Requirements 5.1-5.6, 4.7 and 4.8, the parity identifiers and the dialog name "Review settings" trace to the same places as in round 1. Run detail §6 is unchanged.

The prototype has four open items. None of them changes the spec, but each is visible at the Gate 1.7 before/after:

- **P1, divider regression after Review lanes.** The prototype still has `.sec+.sec` (prototype:28), with an override at :36. The Review lanes divider now renders, but the next section follows the `fieldset`, so "GitHub bot identity" sits flush under the Pins card, and "Publication" sits flush under the bot actions with no divider or gap (`proto-ptah-glass-pins-bot.png`). This is the same defect the user reported as (c), now one section lower. The spec rule (§1 Body) is correct, so the implementation will be right. The prototype just doesn't show it.
- **P2, Verify connection hidden without a token.** Prototype :236 shows Verify connection only when `st.bot !== 'none'`. The spec (§3.4) and today's code (`review-bot-identity.component.ts:60-66`) always show it.
- **P3, glyph for "Not connected".** Prototype :214 renders "Not connected" with the idle ring. The spec says `ptah-status status="offline"`, which maps to the `err` ink with a square glyph (`status.component.ts:12`).
- **P4, stale README line.** `prototype/README.md` says the screenshots show revision 2.

Note N3, spec, minor: §8 "Visible changes" does not list Verify connection moving from `ghost` (today, `review-bot-identity.component.ts:62`) to `outline` (§3.4). Add it to the before/after list.

## Escape, focus and glass

These are unchanged from the round 1 summary, and revision 3 now states them explicitly (§1). Escape goes to the open list, popover or dialog first, then the drawer. The trap and focus restore belong to the native drawer. The panel and the confirm dialogs are opaque, so glass cannot make them translucent.

## Open items for the user gate (Gate 1.7)

The design spec is approved. These items stay open after the final review round. None of them needs a decision. They are fixes before or at the gate.

1. Prototype P1: add the divider and gap above "GitHub bot identity" and "Publication", then re-shoot `proto-*-bot.png`. Without it, the before/after shows the same flush-section look the user objected to.
2. Prototype P2: keep Verify connection visible in the no-token state.
3. Prototype P3: use the `offline` (square, error ink) glyph for "Not connected".
4. Prototype P4 and spec N3: fix the README screenshot line, and add "Verify connection: ghost to outline" to spec §8.
5. Carried for the visual review: the contrast values are computed, not rendered. Confirm them in Electron for `ptah-glass`, `ptah-glass-light`, `anubis` and `anubis-light`, with glass on and off.

## Round 2 verdict

**APPROVED.** The design spec (revision 3) closes R2-R11. It covers requirements 5.1-5.6, 4.7 and 4.8 and every parity capability and identifier (except the D10 removal), and it follows D12. The handoff to the architect is feasible. The four prototype items (P1-P4) and the one-line spec addition (N3) do not change the design, but they are listed above for the user gate. P1 should be fixed before the gate screenshots are shown.

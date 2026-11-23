# Design spec - TASK_2026_2307_1d64 (items 4, 5, 6, 7, 10)

Design system applied: the existing Ptah tokens (`libs/frontend/ui/src/lib/tokens/ptah-tokens.css`), the
themes `ptah-glass` (dark, default) and `ptah-glass-light` (`apps/ptah-extension-webview/tailwind.config.js`),
and `docs/design-system/settings/` (rev 2). This spec adds no token and changes no token value. Paths below are relative to the worktree. Prototype: `prototype/index.html`.
Source tags: `[project-rule]` is a rule that exists today; `[lane-proposed]` needs Gate 1.7 approval;
`[user-requested]` is a change the user or orchestrator asked for (including the user-approved catalog modal removal
and "show all connected providers as currently"). A rule appears in a table row or heading with its tag; an untagged
value traces to its named source.

## 1. Current-state evidence

- Main agent (item 7), `libs/frontend/chat/src/lib/settings/providers/main-agent-section.component.ts:44-128`:
  head row = dot + "Main agent" + "Active" badge + scope badges + spacer + route badge; body = a three-row
  description list; the "Change main agent" primary button (gold in `ptah-glass`) sits inside the Provider row.
  Two badges can both read "Needs attention" (`:68`, `:72-73`).
- Catalog modal and wizard (item 4), `provider-setup-wizard.component.ts:430-512`: step 1 already has the search,
  the radio list, a no-match + Clear search and the Custom endpoint radio. No unconfigured filter, no Sign in,
  no load error, no disabled state.
- Discard (item 5): inline block at `provider-setup-wizard.component.ts:385-419`.
- API key (item 6): text button under the field, 4 copies at `:677`, `:857`, `:916`, `:975`.
- Nav (item 10): `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts:49-50`
  (connector), `:90-100` (item), `:165-166` (parent edge), `:196-200` (state mark); footer
  `libs/frontend/chat/src/lib/settings/settings.component.html:41-56`.
- Nav width: Settings uses `navMode="navigation"` (`settings.component.html:2-3`), whose column is
  `--ptah-settings-nav-column-w` 14.5rem at 640px and above (`settings-layout.component.ts:25-36`,
  `ptah-tokens.css:514-515`). The 13rem token (`--ptah-settings-nav-w`) belongs to tabs mode, which the gallery
  samples use; it is NOT touched. The earlier "Context Management clips at 13rem" measurement used the wrong width and
  is withdrawn. Whether the label clips at 14.5rem was not reproduced here (no Electron run); the implementation
  visual review checks it, and if it clips the fix is item padding/gap inside the navigation-mode item, not a width.

## 2. Surface A - Main agent (item 7)

Recommendation: one summary tile. The head row keeps identity and scope; the tile carries the three facts;
the status is one badge.

### Layout and hierarchy

```
[dot] Main agent  [scope badges...]                              [ Change v ]   head row
+--------------------------------------------------------------------------+
| (mark) Provider name                    [v Operational]                  |   line 1
|        [Model claude-sonnet-4-5] [Effort High]                           |   line 2
+--------------------------------------------------------------------------+
```

- Head row: dot (`bg-success` / `bg-warning` / `bg-base-content-muted`, 8px, as today `MA:58-62`), h2 "Main agent"
  (`--ptah-text-section-title-*`), projected D16 scope badges (unchanged, `[main-agent-badges]` slot), spacer,
  "Change" button.
- Tile: `border var(--ptah-border-color)`, radius `--ptah-space-4` (inner of the card radius `--ptah-radius-surface`),
  fill: the existing `bg-surface-1` token (the prototype approximates it with `color-mix(bc 4%, base-200)`),
  1px `border-surface-border`. Padding `--ptah-space-3` /
  `--ptah-space-4`. Gap between lines `--ptah-space-2`.
- Line 1: `ptah-provider-mark` (2rem) + provider name (`--ptah-text-group-title-*`, weight 600, `break-words`)
  + the merged status badge. Wraps as a unit on narrow widths.
- Line 2: two quiet chips (`ptahBadge`, neutral, size sm; key in `text-base-content-muted`, value in
  `text-base-content`). Model value is mono (`--ptah-font-mono`) when `main().modelIsId`. Effort value is the
  existing `main().effort`. Indent = mark width + `--ptah-space-3` so chips align under the name (drop the indent
  below 480px container width).
- "Change": `ptahButton variant="ghost"` (a verified existing variant), label "Change", chevron icon, keeps
  `aria-label="Change main agent: provider, model and effort"` when a route exists (it contains the visible word, so
  WCAG 2.5.3 holds), `aria-haspopup="dialog"`, `aria-expanded`, `data-testid="routing-node-action"`. The page already has
  the one primary action ("Connect provider"), so Change is a ghost `[lane-proposed]` (one primary per surface is the project rule; the placement, label and
  variant of Change are the proposal).
  The popover anchor stays at the block's bottom-left (`MA:119`), unchanged.

### Merged status badge `[lane-proposed]`

One badge replaces the old assignment badge and the route badge. It keeps every fact of both:
text from the existing route `status()` plus the assignment fact "Not set" (Blocking 3 / removal 1). The producer hook
`routing-node-status` is KEPT on the merged badge as an attribute carrying the assignment value
(`data-assignment="active|attention|not-set"`); the route text hook `main-agent-route-status` stays. Test migration:
`main-agent-section.component.spec.ts:88-90,118,121` assert the new badge text/attribute; the Electron visual selector
`settings-visual.e2e.spec.ts:954,995-996` keeps working because the testid still measures the badge row.

| Route state | Badge text (visible and accessible) | Tone (token) | Icon |
| --- | --- | --- | --- |
| Operational | Operational | ok: `--state-ink-done` on done 8% tint | check |
| Needs attention (readiness false) | Needs attention (neutral; the readiness boolean does not prove a credential failure) | warn: `--state-ink-need` on need 8% tint | triangle |
| No provider / "Not set" | Not set | idle: `--bcm` on bc 8% | 8px ring |
| Checking / loading | Checking... | idle | 8px dot |

"Not set" is therefore visibly and accessibly distinct from Operational and Needs attention. The icon is a second cue
beside colour (WCAG 1.4.1). A redundant sr-only "Active" is not added.

### Live region (one, stable) `[project-rule]` `MA:15-18,63-88,140-155`

The route-status live region (`role="status"`) is always in the DOM and is the same element through loading,
unresolved/empty and error; only its text changes: loading -> "Checking...", empty -> "Not set", ready -> the badge text,
error -> the alert text replaces it (the `role="alert"` Retry alert carries the announcement; the status node is emptied
at that moment so nothing is announced twice). Named scope slots (`[main-agent-badges]`, under-block error/review slot
`MA:116`, `PS:177-196`) and hooks (`routing-node-retry`, `routing-node-action`) are retained.

### States

| State | Head | Body |
| --- | --- | --- |
| Operational | dot `bg-success`, Change | tile, ok badge |
| Needs attention | dot `bg-warning`, Change | tile edge `--state-ink-need` at 45%, warn badge, hint under the chips: "This provider may need attention. Use Change to pick another provider or check its connection." (neutral: no claim of a failed credential) |
| Checking | dot muted | tile with idle badge; chips shown |
| Loading | dot muted, `aria-busy="true"` on the block | tile with `ptah-skeleton` for name, badge and chips; Change stays enabled (parity with `MA:79`); live region says "Checking..." |
| Route unavailable (error) | dot `bg-warning` | `ptah-alert tone="warning" [compact]="true"` with `live` for its internal announcement (no extra `role`), "Main-agent route unavailable." + Retry in the `alertAction` slot (`routing-node-retry`, `state.refreshRoute()`); Change stays |
| No provider | dot muted | dashed tile: mark "?" + "No main agent yet" + "Choose a provider to start the main agent."; button visible label "Choose provider" and its accessible name also contains "Choose provider" (e.g. `aria-label="Choose provider for the main agent"`); same handler |

### Responsive

- Wide (>= 1100px container): head row on one line, tile full width of the card.
- Medium (720px): identical; chips wrap if the model id is long (`overflow-wrap:anywhere`).
- Narrow (400px, prototype `A-main-agent-narrow-dark.png`): the head row wraps, Change drops under the title,
  the badge drops under the name, chips lose the indent. No horizontal scroll.

### Parity

Provider, Model, Effort values (same test ids `routing-main-provider`, `routing-main-model`, `routing-node-footer`);
route status; assignment fact (merged, see above); scope badges; Retry; loading skeleton; the reassign popover trigger;
main field deep links (`PS:1170-1178`) and field-specific focus. Dropped: only the inline chevron after the provider
name (moved to the head button). Spec files to update: `main-agent-section.component.spec.ts:72-90,126-132`,
`providers-settings.component.spec.ts:2085-2088`.

## 3. Surface B - Connect provider flow (item 4)

User decision (2026-11-22) `[user-requested]`: the page "Connections" cards are unchanged; wizard step 1 always shows
every provider, connected ones included, as the catalog did. No collapsed group, no disclosure.

### Entry and gating `[project-rule]`

"Connect provider" (`data-testid="connect-provider"`) and the `more-providers` deep link call `openWizard('')` and land
on step 1. The existing page-level gate stays (`PS:862-867,1409-1418`): `canStartSetup()` is false during a cold load, a
failed connections read or scopes read, or a save in progress.

- Gated states live AT THE PAGE ENTRY with the existing page states and copy: loading "Loading the provider catalog..."
  and failure "The provider catalog could not be loaded." (`PS:920-926`); connections failure "Providers could not be
  loaded. Your saved settings have not changed." + existing "Retry providers" (`PS:372-400`); scope failure with
  "Retry setting sources" (`PS:178-194`).
- While gated, "Connect provider" uses `aria-disabled="true"` (stays focusable) with `aria-describedby` pointing to the
  specific existing reason text above (not a generic sentence). The activation handler and `openWizard` both return
  early when `canStartSetup()` is false, so click, Enter, Space and the `more-providers` deep link all do nothing but
  land on the same page state (the deep link scrolls/focuses the reason). There is no read-only drawer.
- Recovery: Retry providers -> state refresh -> `canStartSetup()` true -> the button drops `aria-disabled`; focus stays
  on Retry (or the button when Retry disappears).
- Inside an already-open drawer only a LATER refresh failure appears: `ptah-alert tone="warning" [compact]="true"`
  `live`, "Connected providers could not be refreshed. The list may be out of date." with Retry in `alertAction`
  (`state.refreshConnections()`); the list stays usable. Focus is not moved by the alert; if Retry removes the alert
  while focused, focus goes to the search field.
- Closing returns focus to the invoking control (`PS:1412,1503`); a deep-link entry returns to the Connect provider
  button.

### Step 1 layout (top to bottom)

1. Step label + h3 "Provider" (existing `wizard-step-heading`).
2. Search `ptah-field` (existing floating label `[project-rule]`). Search matches provider name AND id, as the catalog
   did (`CM`), case-insensitively.
3. Optional refresh-failure alert (see above); a stable `role="status"` live node (always in the DOM) announces
   "Checking connected providers..." while loading.
4. ONE fieldset/native radio group "Choose a provider" `[user-requested]`: unconfigured providers first, then connected
   providers, each connected row with an ok "Connected" badge (icon + text, not colour only). Row = radio +
   `ptah-provider-mark` + name + `authSummaryFor` summary + the provider description + a "Default models available"
   hint where the catalog showed it (parity `CM:64-67,136-138`). For sign-in providers (not connected rows) a trailing
   "Sign in" `ptahButton variant="ghost" size="xs"` outside the `<label>` (no nested interactive).
5. Custom endpoint row (existing radio, `wizard-provider-custom-option`), always last, in the SAME radio group, with
   the catalog's explanation "OpenAI- or Anthropic-compatible self-hosted endpoint" as its description.

### Data contract: classification of each row

Row universe = the wizard's existing registry universe (static provider registry + Claude API, `WZ:1626-1641`), plus
the Custom row. The page passes an input `connectedProviderIds` (ids with a saved, working connection, derived from the
same data that drives the Connections cards). Classification per row:

| Row source | Group | Badge |
| --- | --- | --- |
| In registry, id in `connectedProviderIds` | connected (after the unconfigured rows) | Connected |
| In registry, id not in `connectedProviderIds` (includes a retained-but-unconfigured card) | unconfigured (first) | none |
| Runtime/custom provider present only on the page side | not listed by id; reachable through the Custom endpoint row | none |
| Registry provider only on the wizard side | unconfigured | none |
| Claude accounts (`PS:884-909` exceptions) | follow `connectedProviderIds`; the selected provider is never hidden | Connected only if in the set |

An unconfigured retained card never shows "Connected". When the connections read has failed or is unresolved, no row
gets a badge and all rows are in one group (alert above). Order inside each group: registry order.

### Sign in shortcut (end to end)

The typed output carries the CLICKED row's id: `externalActionRequested({ providerId: row.id, action: 'sign-in' })`
(today `WZ:2191-2193` uses the selected provider; changed so a click on another row does not sign in the wrong one).
On click the page does what the catalog did (`PS:1527-1530`): closes the wizard, then dispatches the external sign-in
and hands focus to the sign-in UI; if that UI does not take focus, focus returns to the Connect provider button. It is
guarded by `canStartSetup()`: when setup is gated the handler returns early (the drawer cannot be open then, except
after a later refresh failure, where the shortcut stays allowed because saves are not in progress).

### Keyboard order (real DOM order)

Initial focus: the step heading (existing `WZ:1987-2007`), unchanged; Tab -> search field -> the radio group -> Sign in
buttons and Retry/Clear search in DOM order -> footer (Back/Cancel/Next). Because it is one native radio group, Tab
enters the group once (on the selected radio, or the first when none is selected, also when Custom is selected) and the
arrow keys move across all radios, connected and Custom included. Shift+Tab reverses; with no selection it lands on the
first radio. After filtering, focus stays in the search field; if a focused row disappears it moves to the search field.
Sign in buttons are separate Tab stops in row order (after the group), not a second list after each radio. The close X
precedes the heading in drawer order (`ND:304-309`).

### Loading skeleton

While connections are loading, step 1 shows four row skeletons (`ptah-skeleton`: mark circle + two text lines) in the
fieldset, `aria-hidden`, and the live node says "Checking connected providers..." (parity `CM:54-58`).

### States (prototype B)

default (unconfigured first, connected after with badge), search (name/id match), loading (skeleton rows), refresh-
failure (alert + all rows, no badges), no-match (existing text + Clear search), connect-disabled (page entry reason; the
drawer cannot open).

### Widths

The drawer is `w-full max-w-2xl` (`WZ:295-299`) `[project-rule]`; the prototype frame is only a mock. At 400px it is
full width; rows wrap the summary text (`break-all` kept for long ids). The Sign in button never shrinks (`flex: none`).

### Parity

All catalog capabilities survive: search, reset, count (page hint), unconfigured list, connected list (as before, now in
the same list), description and "Default models available", Sign in with its exit behaviour, Custom endpoint with its
explanation, loading skeleton, error + Retry, disabled gating, no matches, Escape/close/focus return, `@defer` removal.
Visual replacement `[user-requested]` (comes with the approved modal removal): catalog avatar initials and per-provider
tone are replaced by `ptah-provider-mark`; providers with no brand asset get a fallback mark (a neutral initials/server
glyph in `ptah-provider-mark`'s fallback). Custom endpoint stays unpreselected (open question 4 closed: keep the blank
entry and the existing Custom radio).

## 4. Surface C - Discard confirmation (item 5)

`ptah-native-modal size="sm"` over the drawer, precedent
`providers/accounts/account-detail-view.component.ts:310-322`.

- Header (`modal-header`): h3 "Discard this setup?" (`--ptah-text-section-title-*`, id `wizard-discard-heading`,
  `ariaLabelledby`).
- Body: "Your credential, verification, and model choices are not saved. Nothing was written to disk." (existing
  copy), body ink `--bcm`.
- Footer (`modal-footer`), right aligned, gap `--ptah-space-2`: "Keep editing" (`variant="ghost"`, first, default
  focus), "Discard" (`variant="danger"`, last). Keep the test ids `wizard-discard-review` etc. on the new nodes.
- Open: when `requestWizardClose()` finds a draft (existing logic, busy guard and probe cancel unchanged).
- Escape and Tab use the native modal contract (`NM:240-273`): it stops the keydown on Escape, preserves native cancel,
  emits a void `closed` and wraps Tab. Bind `(closed)="onKeepEditing()"`; do NOT call `stopPropagation()` in a consumer
  handler (it would run too late). Remove the discard focus effect's dependency on `_closeReview()` and its heading
  branch (`WZ:1987-2007`) so Keep editing cannot schedule a heading focus. Escape, X, Cancel and backdrop are all Keep
  editing. Discard keeps today's `onDiscard` (resets the draft, closes the drawer) and returns focus to the wizard's
  original opener (Connect provider for this entry).
- Focus: "Keep editing" is first and receives initial focus. Keep editing returns focus to the actual invoker or the last
  drawer control (native `<dialog>` restores the pre-`showModal()` element), with the nearest connected drawer control
  as fallback when the DOM changed or a backdrop click left no focus owner.
- Layout: plain (non-shell) mode, `size="sm"` = `max-w-sm`; the viewport-minus-2rem cap belongs only to shell mode
  (`NM:67-98,218-227`) and is not claimed here. Buttons wrap into a column only if needed.
- Tests: Escape pressed twice, X, Cancel, backdrop, Tab and Shift+Tab wrap, dirty vs clean close, focus restoration.
- Contrast: modal surface `--b3` (base-300), copy `--bcm`; see section 7.
- Parity: inventory B rows (entry, busy guard, probe cancel, dirty condition, copy, Keep editing, Discard).
  The inline block and the `closeReview` branch of the focus effect (`WZ:1987-2008`) go away.

## 5. Surface D - API key field (item 6)

- Control: `<button ptahFieldTrailing type="button" ptahIconButton label="Show API key" [selected]="showApiKey()">`
  inside `ptah-field` (`IB:27-57,64-71`: the directive supplies the accessible name, tooltip, square footprint and
  `aria-pressed`). Lucide `Eye` (hidden) / `EyeOff` (visible). Name is FIXED "Show API key"; no changing label, no
  manual `aria-pressed`/`aria-label`/`title`. The field slot applies its own icon size/ink
  (`ptah-field.css:431-446`, `field.component.ts:112`). Size: default `xs` density; if a 24px target is required use
  the compact density (default and compact xs differ, `ptah-button.css:51-57,130-137,154-174`) and verify the
  rendered target and focus ring in Electron.
- Behaviour: click toggles the input between `password` and `text` (existing `toggleKeyVisibility()`, `showApiKey`
  reset in `onDiscard`). `autocomplete="off"`, `spellcheck="false"` kept. Do not use the field's built-in `revealable`.
  Tab order: input -> toggle; Enter and Space activate; focus stays on the button in all four copies.
- Colours: icon and ring from the directive and field tokens; the focus ring uses `--ptah-focus-ring-*`.
- Copies: API key, token, gateway key, custom endpoint key (`WZ:677`, `:857`, `:916`, `:975`); identical markup.
  Extract nothing; four edits.
- Parity: inventory row for key visibility (text -> icon). Spec at `provider-setup-wizard.component.spec.ts:477-482`
  already asserts the pressed state (kept). There is no recorded key-visibility inventory row.
- Accessibility: a fixed name with a pressed state is the ARIA toggle pattern ("Show API key, pressed"). The user asked
  for a trailing icon `[user-requested]` (`context.md:22-23`); the name/state pattern is a decision (see Decisions).

## 6. Surface E - Settings sidebar (item 10)

Settings uses `navMode="navigation"` at 14.5rem (`--ptah-settings-nav-column-w`). NO token or width change: the
13rem -> 14rem proposal is removed (that token belongs to tabs mode). Everything below is class-level styling of the
navigation-mode item, connector, state mark and footer.

| Part | Today | Proposed `[lane-proposed]` | Source |
| --- | --- | --- | --- |
| Nav width | 14.5rem (navigation mode) | unchanged. If "Context Management" clips at 14.5rem, fix inside the item (padding/gap); otherwise nothing | `ptah-tokens.css:514-515` |
| Item padding | pl .875rem, pr .625rem | unchanged (the earlier .75/.5 proposal is dropped; it was tied to the 14rem width) | `:526-527` |
| Active item | 3px primary inset edge + 15% primary fill | unchanged | `NAV_CLASS` `:90-100` |
| Parent of the active child | text ink + 2px strong inset edge (`:165-166`) | text ink only; no second rail. One rail marks the current page | `:165-166` |
| Child item | indent 1.25rem, same height and weight as parent | height `--ptah-control-h-sm` (2rem), weight 400, label indent = child indent | `:49-50` |
| Connector | vertical at `left` .3rem, width .5rem | `left` 0, width .625rem so the vertical sits under the parent icon centre and ends .625rem before the label | `--ptah-settings-nav-connector-left` / `-w` (existing tokens, new values scoped to the navigation-mode class, not a global token change) |
| Status dot | 12px solid, after a flex-1 label, no fixed slot | fixed 1rem slot holding an 8px glyph with a 2px ring at 28% of the state ink; same x on every row | `ptah-tokens.css:294` |
| Dot label | `title` on the aria-hidden span, sr-only description | keep the sr-only description; move `title="Membership needs attention"` to the button | `settings-layout.component.ts:196-200` |
| Row rhythm | list gap 2px, py 1rem | unchanged | tokens `:521-524` |
| Footer container | border-top, `p` .75rem, gap .5rem | border-top, padding `--ptah-space-3` x `--ptah-settings-nav-px`, gap `--ptah-space-3` | `settings.component.html:41` |
| Workspace / App | compact description list, term column 5.5rem | two-column grid, terms `--bcm` caption, values `--bc` right aligned, truncated with the full path in `title` | `--ptah-text-caption-*` |
| Local note | one paragraph + icon | shield icon + bold "Runs 100% locally" then hint "Credentials go straight from this machine to your provider. No proxies, no Ptah servers." Icon keeps `role="img" aria-label="Local"` | `settings.component.html:51-55` |
| Custom endpoint note | dot + long paragraph | same structure: warn dot + bold "Custom endpoint", then the original full sentence unchanged | `:41-49` |

Below 640px container width the existing layout turns the list into a horizontal strip, hides the child connector
and the footer is not shown; the prototype reproduces that and nothing else changes.
Specs to touch: `settings.component.spec.ts:290-296`, the settings-layout spec (`data-in-section`,
`settings-layout-state-mark-text`), the Electron settings visual e2e.

## 7. Accessibility and measured contrast

Criterion: WCAG 2.2 AA (text 4.5:1, UI components and graphics 3:1, 1.4.1 use of colour, 2.5.8 target size,
2.4.7 focus visible); the project states no other standard. Measured with a script (sRGB, relative luminance; oklch
converted) over the literal theme values of `ptah-glass` (base-100 #17191d, base-200 #202329, base-300 #2a2e35) and
`ptah-glass-light` (#f7f3fd, #eee8f8, #e2daf1). Tints are composited over base-200.

| Pair | Dark | Light | Need |
| --- | --- | --- | --- |
| base-content on base-200 | 14.05 | 14.05 | 4.5 |
| muted (`--bcm`) on base-200 | 11.70 | 5.93 | 4.5 |
| muted on base-300 (modal) | 10.13 | 5.25 | 4.5 |
| muted on base-100 (nav) | 13.07 | 6.49 | 4.5 |
| muted on chip fill (bc 8%) | 9.33 | 5.08 | 4.5 |
| base-content on chip fill | 11.21 | 12.04 | 4.5 |
| ok ink on ok 8% tint | 7.99 | 5.39 | 4.5 |
| warn ink on warn 8% tint | 7.43 | 4.66 | 4.5 |
| err ink on err 8% tint | 6.51 | 5.54 | 4.5 |
| danger button rest: error-content on error fill (`--ptah-btn-danger-fg` on `--ptah-btn-danger-bg`, TOK:129-143; #2a0505 on #ff6b6b / #ffffff on #cf3a3a) | 6.74 | 4.86 | 4.5 |
| primary-content on primary (Next / primary) | 9.88 | 6.16 | 4.5 |
| base-content on active nav fill (primary 15% on base-100) | 11.57 | 12.42 | 4.5 |
| primary (focus ring, active edge) on base-200 | 8.50 | 5.44 | 3 |
| warn dot on base-100 only (not the row's own surface or selected fill) | 9.77 | 5.69 | 3 |

Finding: a 12% warn tint measured 4.41:1 in the light theme (fails), so the badge tints are 8% (4.66). The earlier
prototype Discard pair (error ink on a 14% error tint over base-300) is about 5.00 dark and 4.47 light, so it FAILS in
light; it is withdrawn. Discard uses the real danger variant, whose rest pair is measured above (6.74 / 4.86); its
hover and active fills mix toward `--ptah-btn-danger-shade` and are NOT measured here.

Decorative-border exception: the 1px strong border (bc 22%) on base-200 measures 1.96 (dark) and 1.57 (light), and the
child connector 1.94 / 1.58. These edges carry no information a control needs, so 1.4.11 does not apply; every control
keeps its own edge from `--ptah-control-edge` and a focus ring.

Pending Electron verification (not claimed): warn dot on the row's real surface and on the selected-row fill, the Eye
button target and focus ring (glass compositing changes ratios), active/nav/control boundaries, danger hover/active, and
the connected "Connected" badge pair in both themes. Everything above the "Pending" line is measured only for the pairs
in the table.

Keyboard: Step 1 and the discard modal order are specified in section 3 (real DOM order, one radio group) and
section 4 (native modal Tab wrap). Motion: skeleton shimmer is disabled by `prefers-reduced-motion`.

## 8. Copy

| Where | Text |
| --- | --- |
| A head button | "Change" (aria-label "Change main agent: provider, model and effort"); empty state "Choose provider" |
| A attention hint | "This provider may need attention. Use Change to pick another provider or check its connection." |
| A badge | Operational / Needs attention / Not set / Checking... |
| A empty | "No main agent yet" / "Choose a provider to start the main agent." |
| B row | badge "Connected"; hint "Default models available"; Custom description "OpenAI- or Anthropic-compatible self-hosted endpoint" |
| B sign in | "Sign in" (name "Sign in to <provider>") |
| B refresh error (open drawer) | "Connected providers could not be refreshed. The list may be out of date." + "Retry" |
| B loading | "Checking connected providers..." |
| B disabled reason | the existing page copy for the active gate (PS:920-926, PS:372-400 "Retry providers", PS:178-194 "Retry setting sources") |
| C | title "Discard this setup?"; body unchanged; "Keep editing", "Discard" |
| D | "Show API key" (fixed) |
| E | "Runs 100% locally" + "Credentials go straight from this machine to your provider. No proxies, no Ptah servers." |

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Merge the two badges, keep "Not set" and the `routing-node-status` hook | keep both; merge and drop "Not set" | Review Blocking 3 / answer 1; `MA:68` | yes |
| "Change" is ghost | primary; ghost | page header holds the one primary | yes |
| Show all connected providers in one radio group, unconfigured first `[user-requested]` | collapsed disclosure; separate groups | user 2026-11-22 | yes |
| Page-level gate kept; no read-only drawer `[user-requested]` | gate; read-only drawer | orchestrator Blocking 1 decision | yes |
| `aria-disabled` Connect with the specific existing reason | native `disabled` | reason stays reachable; handler guards activation | yes |
| No nav width/token change `[user-requested]` | 14rem token; keep | review Blocking 2 | yes |
| Fixed "Show API key" + `[selected]` | changing name | review answer 2, `IB:27-57` | yes |
| 8% state tints on badges | 12% | 12% fails 4.5 in light (4.41) | yes |
| Danger variant for Discard | tinted ink | tinted pair fails light (4.47) | yes |

## Open questions

All closed. 1: keep the assignment fact (merged badge). 2: fixed "Show API key" with pressed state. 3: reuse the existing
page read-state messages as the reason. 4: keep the blank entry and the existing Custom radio.

## 9. Implementation handoff

| Surface | Files | Work |
| --- | --- | --- |
| A | `providers/main-agent-section.component.ts`, `providers-settings.component.ts` (badge slot only) | New tile template, head button, merged badge with `routing-node-status` kept, one stable live region (section 2); update specs and the Electron selector `settings-visual.e2e.spec.ts:954,995-996` if changed |
| B | `providers/provider-setup-wizard.component.ts`, `providers-settings.component.ts`, delete `provider-catalog-modal.component.ts` + spec | Inputs `connectedProviderIds` and refresh status, output `retryConnectionsRequested`, `externalActionRequested` with the clicked row id; one radio group, descriptions, skeleton, Custom explanation; page button `aria-disabled` + guards (section 3); update specs and e2e rows in `root-causes-surfaces.md` |
| C | `providers/provider-setup-wizard.component.ts` | `ptah-native-modal size="sm"` with `(closed)="onKeepEditing()"`; no consumer `stopPropagation`; remove the inline block, `_closeReview()` effect dependency and its heading branch |
| D | `providers/provider-setup-wizard.component.ts` (4 copies) | `ptahIconButton` `label="Show API key"` `[selected]="showApiKey()"` trailing icon per section 5; register Eye / EyeOff |
| E | `libs/frontend/ui/.../settings-layout.component.ts`, `chat/.../settings.component.html` | Section 6; no token change; Electron visual review light and dark, narrow and wide |

Verification after implementation (not run here): `typecheck-templates` for `ptah-extension-webview`, scoped
tests for `chat` and `ui`, Electron screenshots in dark and light at 720px and 1280px content widths.

## Revision 1

| Finding | Resolved in |
| --- | --- |
| Blocking 1 setup gate | section 3 "Entry and gating" |
| Blocking 2 nav width | sections 1, 6, 9; Decisions (13 -> 14rem removed) |
| Blocking 3 removals | section 2 merged badge and live region; section 3 rows, skeleton, Custom explanation, Sign in, parity; Decisions |
| Serious 1 data contract, row action | section 3 "Data contract" and "Sign in shortcut" |
| Serious 2 Escape/Tab | section 4 |
| Serious 3 keyboard order | section 3 "Keyboard order" |
| Serious 4 toggle | section 5; section 9 D |
| Serious 5 contrast | section 7 |
| Serious 6 Main agent semantics | section 2 live region and states |
| Minor 1 drawer width, alert API | section 3 "Widths"; section 2 states |
| Minor 2 prototype/evidence | prototype B, D, E updated; README "Not rendered" |
| Minor 3 tags, wording | header legend; section 5 accessibility; section 6; Decisions |
| Open questions 1-4 | "Open questions" (closed) |

## Revision 2 — binding resolutions (orchestrator, after Re-review 1)

These resolutions supersede any conflicting text above. Tags: `[U]` user-requested, `[P]` project-rule,
`[L]` lane-proposed design choice.

1. **Gate reasons and recovery (Re-review finding 1).** `[P]` The page gate `canStartSetup()` is
   unchanged. `[L]` While it is false, "Connect provider" stays focusable with `aria-disabled="true"`
   and `aria-describedby` on one reason line. Precedence, first match wins: connections failed
   (existing "Providers could not be loaded. Your saved settings have not changed." + existing
   "Retry providers") → connections loading (existing "Loading the provider catalog…") → scopes
   failed (existing scope-failure copy and its existing retry) → scopes pending ("Loading settings…")
   → save in progress ("Wait for the current save to finish."). A gated click or a gated
   `more-providers` deep link moves focus to the "Connect provider" button and opens nothing; the
   next activation after the gate clears opens the wizard at step 1. Cold loading is a page state
   only. Inside an open drawer, a refresh shows the row skeleton while pending and a compact alert
   with Retry on failure; Retry goes skeleton → ready.
2. **Row universe, "Connected" and the shortcut (finding 2).** Step 1 rows = the wizard's existing
   universe (`getAllAnthropicProviders()` incl. user-defined entries, plus Claude API, plus Custom
   endpoint). `[U]` Connected providers are always visible. A row shows the "Connected" badge only
   when the Connections page shows a card for that provider with a connected/active status — the
   same predicate the card status uses, never the raw `configured` flag. `[L]` The row "Sign in"
   shortcut is a NEW, separate wizard output (`signInShortcut`, payload = the clicked row's
   provider id); the existing step 2 `'sign-in'` action is unchanged and keeps the wizard open. The
   shortcut is disabled only while a save is in progress; the parent handles it exactly as the
   catalog row did (`providers-settings.component.ts:1527-1530`): close the wizard, hand focus to
   the sign-in UI.
3. **Step 1 DOM and Tab order (finding 3).** `[L]` Search → Clear search (when shown) → alert Retry
   (when shown) → ONE native radio group; each sign-in row has its "Sign in" button inside the row,
   after its radio, in DOM order → inputs revealed by Custom endpoint → footer (Back, Cancel,
   Continue). Native radio-group behaviour is kept (one Tab stop, arrows move; reverse Tab may land
   on the last radio when none is checked). When Retry or filtering removes the focused control,
   focus moves to the search input.
4. **Main agent states (finding 4).** One stable status node (`data-testid="routing-node-status"`)
   renders on line 1 of the tile in every state. Pending: skeleton tile, node text "Checking…"
   (`aria-busy` on the skeleton body, not on the node). Ready with provider: tile with chips, node
   "Operational" or the neutral "Needs attention". Ready, unresolved: empty tile, node "Not set",
   button with accessible name "Choose provider". Error: `ptah-alert` in the tile, node empty.
   Keep the popover stacking treatment (`main-agent-section.component.ts:47,52`). Update the visual
   e2e assertions (`settings-visual.e2e.spec.ts:945-964`, `:995-996`) to the new position and row
   markup.
5. **API key toggle (finding 5).** `ptahIconButton size="xs"` at default density, fixed
   `label="Show API key"`, `[selected]="showApiKey()"`.
6. **Alert live values (finding 6).** Main agent error alert and page load-failure alert:
   `live="assertive"`. In-drawer refresh-failure alert: `live="polite"`. The alert is the only
   announcement source while the status node is empty.
7. **Tags and nav slot (finding 7).** The gate is `[P]`; the aria-disabled treatment, deep-link
   focus and the single fieldset are `[L]`; always-visible connected providers are `[U]`; surfaces
   A–E map to `context.md` items 7, 4, 5, 6, 10. Every nav row reserves the 1rem trailing status
   slot so labels align; labels keep the existing truncation. The "Extract nothing" line and the
   reference to a key-visibility inventory row are withdrawn.

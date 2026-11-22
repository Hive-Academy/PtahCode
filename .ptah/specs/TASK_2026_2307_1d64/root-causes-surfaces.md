# Root causes and surfaces - TASK_2026_2307_1d64 (items 4, 5, 6, 7, 10)

Successor deliverable for the smaller scope. Items 1, 2, 3, 8, 9 are in the predecessor handoff
(`/home/amun/ptah-extension/.ptah/subagent-handoffs/toolu_013MS9sJWXhMsqG5LhrB4R1W.md`), not here.
Paths are relative to the worktree
`/home/amun/ptah-extension/.claude-worktrees/fix-settings-providers-polish-c6e14c260bd3`.
`P` = `libs/frontend/chat/src/lib/settings/providers`, `PS` = `P/providers-settings.component.ts`,
`CM` = `P/provider-catalog-modal.component.ts`, `WZ` = `P/provider-setup-wizard.component.ts`,
`MA` = `P/main-agent-section.component.ts`. Capability-level parity is in `parity-inventory.md`.
No source was edited; no nx, verify, build or test was run.

## Item 4 - Connect provider opens a catalog modal that only redirects to the wizard

- Responsible: `PS:336-342` (`(click)="openCatalog()"` on `data-testid="connect-provider"`),
  `PS:1181-1189` (`more-providers` deep link: "lands on the catalog modal"), `PS:482-496` (mount),
  `PS:1515-1530` (`openCatalog`, `chooseCatalog`, `catalogSignIn`), `PS:753`, `PS:848`, imports `PS:51`, `PS:118`.
- Current behaviour: the modal (`CM:29-104`) lists `catalog()` (`PS:904-909`, unconfigured only) with
  per-row "Connect" (`providerChosen` -> `chooseCatalog(id)` -> `openWizard(id)`), "Sign in" for
  oauth/cli (`signInRequested` -> `externalAction(id,'sign-in')`), and a "Custom endpoint gateway ->
  Configure" footer (`customChosen` -> `chooseCatalog('')`, nothing preselected).
  Wizard step 1 already has a search (`WZ:436-446`), the provider radio list (`WZ:448-486`, from
  `getAllAnthropicProviders()` plus Claude API, `WZ:1626-1641`), no-match + Clear search (`WZ:466-484`)
  and a "Custom endpoint" radio with fields (`WZ:488-512+`).
- Gaps the wizard does not cover today (each is `move` in the inventory, never dropped):
  1. Unconfigured-only filter: the wizard lists ALL providers. Decide: feed `catalog()` ids as a new
     wizard input, or keep configured ones selectable (re-setup). Verified: no such input exists in the
     input list `WZ:1423-1473`.
  2. Sign-in shortcut: step 1 has none; sign-in is on step 2 (`WZ:713`, `WZ:750`, `WZ:803`). The wizard
     output `externalActionRequested` (`WZ:1465`) is already wired by the page (`PS:~611`), so a
     step-1 shortcut needs no new page plumbing.
  3. Connections read error + Retry (`CM:47-53`, `PS:911-918`): the page hint `catalogHint()`
     (`PS:920-935`) already says "could not be loaded"; Retry must stay reachable there.
  4. `canSetUp` gating moves to the "Connect provider" button itself (`openWizard` returns silently
     when `!canStartSetup()`, `PS:1410`).
- Smallest correct change: the button and the `more-providers` deep link call `openWizard('')`;
  delete `ptah-provider-catalog-modal`, `catalogOpen`, `catalogOpener`, `openCatalog`, `chooseCatalog`,
  `catalogSignIn`, the import, the `@defer` block, and the component file + its spec. Cover gaps 1-4
  per the design decision. Keep `catalog()`/`catalogStatus()`/`catalogHint()` (used by the hint badge
  `PS:285-318`). Focus return already works: `openWizard` captures `activeElement` (`PS:1412`), which
  is now the button.
- Specs / e2e asserting the old behaviour:
  - `P/provider-catalog-modal.component.spec.ts` (11 cases) - delete with the component.
  - `P/providers-settings.component.spec.ts:343` (`'ptah-provider-catalog-modal dialog'`), `:1485-1493`
    (click `connect-provider` then `provider-catalog-search`), `:1573-1578`, `:1678-1690`
    ("the more-providers route ... opens the catalog modal"), `:1721`.
  - `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-reachability.table.ts:264`
    (Custom endpoint gateway Configure deep link) and `:1396-1399` (`provider-catalog-search`,
    `provider-catalog-empty`).
  - `apps/ptah-electron-e2e/src/design-preview/settings-providers-gate.shot.ts`: no hit for
    `provider-catalog*`/`connect-provider`/`more-providers` (Assumption: grep it for the text
    "Search providers" / "Connect a provider" before closing the item).

## Item 5 - "Discard this setup?" is an inline block at the top of the drawer body

- Responsible: `WZ:385-419` (block inside `data-testid="wizard-body"`), `requestWizardClose`
  `WZ:2410-2422`, `onKeepEditing` `WZ:2425-2427`, `onDiscard` `WZ:2429-2434`, focus effect
  `WZ:1987-2008` (focuses `closeReviewHeading`).
- Current behaviour, quoted: `@if (closeReview()) { <div class="rounded-md border border-base-300
  bg-base-100 p-3" data-testid="wizard-discard-review"> ... Discard this setup? ...` with buttons
  "Keep editing" (`ptahButton`) and "Discard" (`ptahButton variant="ghost"`). Triggers: drawer
  `(closed)="requestWizardClose()"` (`WZ:299`, which the drawer raises for X, backdrop and Escape,
  `libs/frontend/ui/src/lib/native/drawer/native-drawer.component.ts:18-19`) and the footer Cancel
  (`WZ:1368-1371`). Dirty condition `hasUserDraft` `WZ:1904-1913`.
- Primitive to reuse: `NativeModalComponent` (`ptah-native-modal`,
  `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts:103`; inputs `isOpen`,
  `ariaLabelledby` `:176`, `size` `:179`, output `closed` `:188` for Escape/backdrop; slots
  `modal-header`, `modal-footer`). The direct precedent for a confirm dialog over a drawer is
  `P/accounts/account-detail-view.component.ts:310-322` (Remove account: `size="sm"`, `modal-header`
  h3, body, `modal-footer` Cancel + `variant="danger"` confirm). The wizard already imports it
  indirectly via `@ptah-extension/ui` (`WZ:46`, add `NativeModalComponent` to the import list).
  Not chosen: `ptah-inline-confirm` (`libs/frontend/ui/src/lib/patterns/inline-confirm/inline-confirm.component.ts:18`,
  inline is what the user rejects) and `ptah-confirmation-dialog`
  (`libs/frontend/chat/src/lib/components/molecules/confirmation-dialog.component.ts:35`, a chat molecule).
- Smallest correct change: replace the inline block with `<ptah-native-modal [isOpen]="closeReview()"
  size="sm" ariaLabelledby="wizard-discard-heading" (closed)="onKeepEditing()">`, same copy, "Keep editing"
  + "Discard" (`variant="danger"` per the precedent) in `modal-footer`; keep every `data-testid`. Drop the
  `closeReview` branch of the focus effect (`showModal()` focuses the first control and returns focus
  on close).
- Assumptions the implementer must check:
  - The drawer is a manual top-layer popover (`native-drawer.component.ts:135`, `:293`); a `showModal()`
    dialog opened later stacks above it and makes it inert. Escape inside the dialog fires `cancel`
    and also bubbles a `keydown` to the drawer panel (`native-drawer.component.ts:92`,
    `onPanelKeydown`) because the modal sits in the panel's DOM subtree. Confirm that Escape does not
    re-enter `requestWizardClose()` (it would only re-set `_closeReview` to true, but it must not close
    the drawer). The account-detail-view precedent has the same nesting, so check its behaviour.
  - Which control gets initial focus: put "Keep editing" first (non-destructive).
- Specs / e2e asserting the old behaviour (test ids stay; only DOM placement and focus change):
  `P/provider-setup-wizard.component.spec.ts:1037-1038`, `:1383-1413` (heading text `:1394`, keep `:1398`);
  `settings-reachability.table.ts:97-115`; `settings-providers.e2e.spec.ts:147`. Any spec that asserts focus
  on `wizard-discard-heading` must change to the dialog's first button. jsdom has no `showModal`; check how
  `account-detail-view` specs stub it.

## Item 6 - "Show API key" is a text button under the input

- Responsible: `WZ:677-686`, `WZ:857-866`, `WZ:916-925`, `WZ:975-983` (four copies, all
  `data-testid="wizard-key-visibility"`, `(click)="toggleKeyVisibility()"`, `[attr.aria-pressed]="showApiKey()"`).
- Current behaviour, quoted: `<button type="button" ptahButton variant="ghost" class="mt-1"
  [attr.aria-pressed]="showApiKey()" (click)="toggleKeyVisibility()" data-testid="wizard-key-visibility">
  {{ showApiKey() ? 'Hide API key' : 'Show API key' }}</button>`, placed after `</ptah-field>`.
- Input wrapper: `ptah-field` (`libs/frontend/ui/src/lib/surfaces/field.component.ts:62`) has a
  `[ptahFieldTrailing]` slot inside `.ptah-field__box` (`:112`) and a built-in `revealable()` action
  (`:96-110`, own `revealed()` state, `aria-label` "Show/Hide <label>"). Precedent for an icon button:
  `P/connection-drawer/credentials-tab.component.ts:349-352` (`ptahIconButton size="xs"`, Eye/EyeOff,
  `aria-pressed`) - but it is absolutely positioned (`absolute right-1 top-1`) over the field rather than
  using the slot. Existing `ptahFieldTrailing` users: `ptah-ai/lane-guards-settings.component.ts:125`,
  `license/license-status-card.component.ts:277`.
- Smallest correct change: move each button into the field as `<button ptahFieldTrailing type="button"
  ptahIconButton size="xs" [label]="showApiKey() ? 'Hide API key' : 'Show API key'" [attr.aria-pressed]=...
  (click)="toggleKeyVisibility()" data-testid="wizard-key-visibility">` with an Eye/EyeOff lucide icon.
  Keep the wizard's own `showApiKey` state (it is reset in `onDiscard` `WZ:2431`), so `revealable` is not
  used. Assumption: `ptahIconButton` accepts `size="xs"` and `label` (verified only by the credentials-tab
  usage, not by opening the directive).
- Specs: `P/provider-setup-wizard.component.spec.ts:477-482` (finds the button by test id, checks
  `aria-pressed`; text assertions, if any, move to `aria-label`).

## Item 7 - Main agent section presentation

- Responsible: `MA:44-128` (template), `main` computed `MA:139-157`; host `PS:155-246`.
- Current behaviour: head row = status dot (`MA:58-62`) + "Main agent" h2 (`MA:63`) + status badge
  "Active/Needs attention/Not set" (`MA:68`) + projected D16 scope badges (`MA:69`, `PS:164-174`) + spacer
  + route status badge "Operational/Needs attention/Route unavailable/Checking..." (`MA:72-73`). Body = a
  `ptah-description-list` with Provider (+ the "Change main agent" primary button with a chevron inline after
  the name, `MA:94-97`, `MA:120-127`), Model (mono for a model id, `MA:98-100`), Effort (`MA:101-103`).
  Loading/error/empty states each re-render the same button (`MA:79`, `MA:87`, `MA:108`). Two badges that
  can both say "Needs attention" sit in one row (`MA:68` and `MA:72`) - a redundancy worth removing.
- Smallest correct change: not a defect; a design decision (flow lists item 7 for design). Candidate
  recommendation for the designer: merge the two status badges into one (route status already implies
  Active), move "Change main agent" to the head row end (secondary/ghost or primary), and render
  Provider / Model / Effort as one compact summary row (provider mark + name, model, effort chip) that is
  itself the popover trigger. Keep every test id or update the specs below.
- Specs: `P/main-agent-section.component.spec.ts:72-90`, `:126-132`;
  `P/providers-settings.component.spec.ts:2085-2088`; layout note in `settings-visual.e2e.spec.ts:1017`
  (Assumption: path under `apps/ptah-electron-e2e`; locate by name).

## Item 10 - Settings left navigation polish

- Responsible: nav model `libs/frontend/chat/src/lib/settings/settings.component.ts:176-205`
  (`settingsTabs`: Providers, Context Management, Decision matrix `parent: 'orchestration'` (Electron only),
  Advanced with `stateMark` warn "Membership needs attention", Search & Voice); rendering
  `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts`: child connector
  `NAVIGATION_CHILD_CLASS` `:49-50` (indent `--ptah-settings-nav-child-indent`, `before:` connector),
  `NAV_CLASS` `:90-100` (item height `--ptah-settings-nav-navigation-item-h`, muted text, active
  `inset_3px` edge), in-section parent `shadow-[inset_2px_0_0_var(--ptah-border-color-strong)]` `:165-166`,
  status dot `:196-200` (`size-[var(--ptah-icon-xs)] rounded-full bg-current`, after the label), footer
  slot `:214` + `navFooterClass` `:334-336` (`mt-auto shrink-0`). Footer content
  `libs/frontend/chat/src/lib/settings/settings.component.html:41-56` (compact description list
  Workspace/App rows `contextRows()` `settings.component.ts:246`, then "Runs 100% locally..." copy with a
  security icon, or the custom-endpoint warning with `ptah-status appearance="dot"`). Header `:14-21`.
  The Decision matrix page is at `settings.component.html:117` (`@if (activeSettingsTab() === 'matrix' && isElectron)`).
- Current behaviour: the parent "Context Management" gets a 2px strong edge while the child is active and
  the child gets the 3px active edge plus a connector; the status dot is `icon-xs` (12px) and sits at the far
  right after a `flex-1` label; the footer stacks the description list and a long security paragraph.
- Smallest correct change: a design decision (in the design phase list). Likely touch points are the
  tokens above (`--ptah-settings-nav-*`) and `NAVIGATION_CHILD_CLASS` / the stateMark span in the ui lib,
  plus the footer markup in `settings.component.html:41-56`. A change in the ui lib affects every
  `navMode="navigation"` user (Assumption: grep `navMode="navigation"` - only Settings found here).
- Specs: `libs/frontend/chat/src/lib/settings/settings.component.spec.ts:290-296` (matrix child routing),
  the settings-layout spec under `libs/frontend/ui/src/lib/patterns/settings-layout/` (Assumption: assert
  `data-in-section`, `settings-layout-state-mark-text`), and the Electron settings visual e2e.

## File ownership map

| File | Items |
| --- | --- |
| `P/providers-settings.component.ts` | 4 (also hosts 7 at `PS:155-246`; edits for 7 only if design changes the projected slots) |
| `P/providers-settings.component.spec.ts` | 4, 7 |
| `P/provider-catalog-modal.component.ts` + `.spec.ts` | 4 (delete) |
| `P/provider-setup-wizard.component.ts` | 4 (gaps 1-2, if chosen), 5, 6 - one owner, sequential |
| `P/provider-setup-wizard.component.spec.ts` | 4, 5, 6 |
| `P/main-agent-section.component.ts` + `.spec.ts` | 7 |
| `libs/frontend/chat/src/lib/settings/settings.component.html` / `.ts` / `.spec.ts` | 10 |
| `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts` (+ spec) | 10 |
| `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-reachability.table.ts` | 4, 5 |
| `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-providers.e2e.spec.ts` | 5 |
| `apps/ptah-electron-e2e/src/design-preview/settings-providers-gate.shot.ts` | 4, 7 (check only) |
| Read-only references: `ui/.../native/modal/native-modal.component.ts`, `ui/.../native/drawer/native-drawer.component.ts`, `ui/.../surfaces/field.component.ts`, `P/accounts/account-detail-view.component.ts`, `P/connection-drawer/credentials-tab.component.ts` | 5, 6 |

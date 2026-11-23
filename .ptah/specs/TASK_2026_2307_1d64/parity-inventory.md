# Parity inventory - TASK_2026_2307_1d64 (items 4, 5, 7)

Scope: the capabilities of the Connect provider catalog modal (item 4, removal approved by the user in
`context.md` item 4), the wizard step 1 list that replaces it, the inline "Discard this setup?" block
(item 5) and the Main agent section (item 7). Traced from the current source only; no replacement is
designed here.

Paths are relative to the worktree
`/home/amun/ptah-extension/.claude-worktrees/fix-settings-providers-polish-c6e14c260bd3`.
`P` = `libs/frontend/chat/src/lib/settings/providers`. `PS` = `P/providers-settings.component.ts`.
`CM` = `P/provider-catalog-modal.component.ts`. `WZ` = `P/provider-setup-wizard.component.ts`.
`MA` = `P/main-agent-section.component.ts`.

## A. Catalog modal (item 4) and its callers

Callers that open the modal (grep of `ptah-provider-catalog-modal`, `catalogOpen`, `openCatalog`, the
modal outputs, outside specs): only two. (1) The "Connect provider" header button, `PS:336-342`
(`(click)="openCatalog()"`, `data-testid="connect-provider"`, `data-focus="more-providers"`). (2) The
`more-providers` focus deep link, `PS:1181-1189` (`untracked(() => this.openCatalog())`). The modal is
mounted once at `PS:482-496`.

| Capability | Where today (file:line) | Backing RPC/API or state method | Decision | New location | Test that proves it |
| --- | --- | --- | --- | --- | --- |
| "Connect provider" button opens the catalog | `PS:336-342`, `openCatalog()` `PS:1515-1519` | `catalogOpen` signal `PS:753` (no RPC) | move | Same button calls `openWizard('')` (wizard with nothing preselected) | `P/providers-settings.component.spec.ts:1485` (clicks `connect-provider`, then `provider-catalog-search`) - must change |
| `more-providers` deep link focuses "Connect provider" and opens the catalog | `PS:1181-1189` | focus target input; `openCatalog()` | move | Deep link focuses the button and opens the wizard step 1 | `P/providers-settings.component.spec.ts:1678-1690`, `:1573-1578`; e2e `settings-reachability.table.ts:1396-1399` - must change |
| Search providers (by name or id, case-insensitive) | `CM:34-38`, `rows` `CM:128-139` | local `query` signal | keep (already covered) | Wizard step 1 search `WZ:436-446`, `providerOptions` `WZ:1626-1641` (same name/id match) | `provider-catalog-modal.component.spec.ts` (11 `it`); wizard search covered in `provider-setup-wizard.component.spec.ts` (Assumption: implementer confirms the search case by grep `wizard-provider-search`) |
| Search resets on every opening | effect `CM:141-144` | local | keep (already covered) | Wizard is re-instanced per session (`wizardSession` `PS:758`, `PS:584-586`); `resetDraft` clears `_search` `WZ:2440-2445` | `provider-catalog-modal.component.spec.ts`; none for wizard instance reset |
| "N in catalog" placeholder and "Available in catalog (N unconfigured)" count | `CM:36`, `CM:60-62` | `catalog()` `PS:904-909` (connections minus configured) | move | The page-level "N available in catalog" hint badge `PS:285-318` already shows the count and names; the wizard step 1 needs no count. Proposed: keep the page hint as the one count | `provider-catalog-modal.component.spec.ts`; page hint `catalog-hint` in `providers-settings.component.spec.ts` (grep `catalog-hint`) |
| List shows only UNCONFIGURED providers | `catalog()` `PS:904-909` passed as `[providers]` `PS:486` | `ProvidersSettingsStateService.connections()` | move (gap) | Wizard lists ALL registry providers (`getAllAnthropicProviders()` `WZ:1628`) plus Claude API. Proposed: wizard input (e.g. `excludeProviderIds` or `catalogIds`) fed from `catalog()`, OR an explicit decision that configured providers stay selectable (re-setup). Design decides | `provider-catalog-modal.component.spec.ts`; none in wizard |
| Row detail: modality label, registry description, "Default models available" | `MODALITY` `CM:8-10`, `detail` `CM:135-136` | `getAnthropicProvider(id).description`, `entry.defaultsResolvable` | move (partial gap) | Wizard row summary is `authSummaryFor(entry)` `WZ:1636`; it has no "Default models available" flag. Proposed: add the flag to `WizardProviderOption.summary` if design keeps it | `provider-catalog-modal.component.spec.ts` |
| Row avatar (initials + tone) | `CM:132-134` (`connectionInitials`, `connectionAvatarTone`) | `provider-connection-card.state` | remove-proposed (superseded) | Wizard rows render `ptah-provider-mark` `WZ:458` (brand mark, richer) | none needed |
| "Connect" per row: closes modal, opens wizard preselected | `CM:74-75` -> `chooseCatalog(id)` `PS:1521-1526` -> `openWizard(id)` `PS:1409-1418` | `openWizard` | keep (already covered) | Choosing a radio in step 1 (`onSelectProvider` `WZ:452-456`) | `providers-settings.component.spec.ts` (grep `chooseCatalog`/`providerChosen`); wizard selection specs |
| "Connect" disabled while setup cannot start | `[disabled]="!canSetUp()"` `CM:74`, `canStartSetup()` `PS:488` | `canStartSetup` | move | `openWizard` already returns early when `!canStartSetup()` `PS:1410`; the button itself needs `[disabled]="!canStartSetup()"` or a reason. Proposed: disable "Connect provider" with the same reason | `provider-catalog-modal.component.spec.ts` |
| "Sign in" per row for oauth/cli providers (skips the wizard) | `CM:70-72`, `signIn` `CM:137`; `catalogSignIn` `PS:1527-1530` -> `externalAction(id,'sign-in')` `PS:1505-1510` | `ProvidersSettingsStateService.performExternalAuth(providerId,'sign-in')` | move (gap) | Wizard step 1 has NO sign-in shortcut; sign-in lives on step 2 (`WZ:713` "Sign in with X CLI instead", `WZ:750` "Sign in with X", `WZ:803`). Proposed: keep sign-in reachable through step 2 (one extra click: choose radio, Next) - or a secondary "Sign in" action on the selected oauth/cli row in step 1 (emits `externalActionRequested` `WZ:1465`, already wired `PS:612-614`) | `provider-catalog-modal.component.spec.ts`; `providers-settings.component.spec.ts` (grep `signInRequested`) |
| "Custom endpoint gateway -> Configure" | `CM:90-101` -> `chooseCatalog('')` `PS:490` | `openWizard('')` | move (covered differently) | Wizard step 1 "Custom endpoint" radio `WZ:488-506` + fields `WZ:512+`. Gap: today Configure opens the wizard with NOTHING preselected (`PS:1520` comment), not on the custom radio; a direct "custom" deep link would need `deepLinkProviderId` support for the custom selection (Assumption: check how `deepLinkProviderId` `WZ:1423` maps; `_selection.set({kind:'custom'})` only at `WZ:1939` from `initialSetup`) | e2e `settings-reachability.table.ts:264` (Configure deep link lands on the provider step) - must change |
| Failed connections read shown as error with Retry (never empty list) | `CM:47-53`, `catalogStatus()` `PS:911-918`, `(retryRequested)="state.refreshConnections()"` `PS:492` | `ProvidersSettingsStateService.refreshConnections()` | move (gap) | Wizard step 1 has no load/error state (static registry). Only custom entries come from `provider:listCustomEntries`. Proposed: page-level error already exists via `catalogHint()` `PS:920-935`; keep Retry there, or add an error/Retry row in step 1 | `provider-catalog-modal.component.spec.ts` |
| Loading skeleton | `CM:54-58` | `catalogStatus()==='loading'` | remove-proposed (not needed) | Wizard list is synchronous from the registry | none |
| No matches -> "No matching providers." + Clear search | `CM:80-84` | local | keep (already covered) | `WZ:466-484` (`wizard-provider-no-match`, `wizard-clear-search`) | wizard spec (grep `wizard-clear-search`) |
| Close button, Escape, focus trap | `CM:39-43`, `NativeModalComponent` `CM:29` | native `<dialog>` | keep (already covered) | Wizard drawer close/Esc/backdrop -> `requestWizardClose()` `WZ:296-299`, `WZ:2409-2422` | wizard spec `:1383-1413` |
| Focus returns to "Connect provider" after the flow | `catalogOpener` `PS:848`, `PS:1517`, `PS:1525` | DOM focus | keep (already covered) | `openWizard` stores `returnFocus = activeElement` `PS:1412`; `closeWizard` refocuses `PS:1503`. With direct open, the opener IS the button | `providers-settings.component.spec.ts:1721` - must change |
| `@defer (on immediate)` bundle split of the modal | `PS:482-483` | build | remove | Modal and its import `PS:51`, `PS:118` deleted | none |

## B. Wizard inline "Discard this setup?" (item 5)

| Capability | Where today (file:line) | Backing RPC/API or state method | Decision | New location | Test that proves it |
| --- | --- | --- | --- | --- | --- |
| Close request entry (drawer X, backdrop, Escape, Cancel button) | drawer `(closed)` `WZ:299`; Cancel `WZ:1368-1371`; `requestWizardClose` `WZ:2410-2422` | local | keep | unchanged | `provider-setup-wizard.component.spec.ts:1383-1413` |
| Busy guard: ignore close while committing | `WZ:2411` (`commitBusy()`) | `commitState` input | keep | unchanged | wizard spec (grep `commitBusy`) |
| Close during probe cancels the probe first | `WZ:2412-2417` | `onCancelProbe()` -> `cancelDraftVerification` | keep | unchanged | wizard spec |
| Dirty condition | `hasUserDraft` `WZ:1904-1913` (selection, key draft, base URL touched, custom name, probe state, tiers) | local signals | keep | unchanged | wizard spec `:1037`, `:1383` |
| Show confirmation | `_closeReview.set(true)` `WZ:2419`; inline block `WZ:385-419` | local | move | `ptah-native-modal` `size="sm"` over the drawer (precedent `P/accounts/account-detail-view.component.ts:310-322`) | wizard spec `:1394` heading text - must change selectors only |
| Copy: heading + "Your credential, verification, and model choices are not saved. Nothing was written to disk." | `WZ:396-400` | - | keep | Modal header/body | wizard spec `:1394` |
| Keep editing (closes review, stays) | `WZ:402-409`, `onKeepEditing` `WZ:2425-2427` | local | keep | Modal Cancel/Keep editing; also the modal's own `(closed)` (Esc/backdrop on the dialog) = Keep editing | wizard spec `:1398-1399` |
| Discard (clears key draft, hides key, emits closed) | `WZ:410-417`, `onDiscard` `WZ:2429-2434` | `closed` output -> `closeWizard()` `PS:1490-1503` (cancelVerification, announce, refocus) | keep | Modal primary/danger action | wizard spec `:1038`, `:1413`; e2e `settings-providers.e2e.spec.ts:147`, `settings-reachability.table.ts:97-115` |
| Focus moves to the review heading when shown | effect `WZ:1987-2008` (`closeReviewHeading`) | DOM | move | `showModal()` focuses the first focusable control; heading focus no longer needed. Focus back to the drawer on Keep editing is the native dialog's return-focus | wizard spec (grep `closeReviewHeading`) |
| Reset of review on step/selection changes | `WZ:2465` (`_closeReview.set(false)`) | local | keep | unchanged | wizard spec |

## C. Main agent section (item 7)

| Capability | Where today (file:line) | Backing RPC/API or state method | Decision | New location | Test that proves it |
| --- | --- | --- | --- | --- | --- |
| Status dot (success / warning / neutral) | `MA:58-62` | `main().tone` from `state.route()` `MA:147` | keep | design decides | `main-agent-section.component.spec.ts` |
| "Main agent" heading (h2, `#main-agent-heading`) | `MA:63-64` | - | keep | design decides | spec |
| Status badge "Active" / "Needs attention" / "Not set" | `MA:68`, `MA:153` | `state.route()` | keep | design decides | spec `:88-90` |
| Projected D16 scope badges (`ptah-main-agent-scope-badges`, clear override) | slot `MA:69`; host `PS:164-174` | `mainScopeFields()`, `reviewClear()` `PS:1538` | keep | design decides | `providers-settings.component.spec.ts` (grep `main-scope-badges`) |
| Route status badge "Operational" / "Needs attention" / "Route unavailable" / "Checking..." (`role=status`) | `MA:72-73`, `routeStatus` `MA:15-19` | `state.route()` | keep | design decides | spec `:72-76` |
| Loading skeleton + change button | `MA:77-80` | `route.status` | keep | design decides | spec |
| Route error alert + Retry | `MA:81-88` | `state.refreshRoute()` | keep | design decides | spec |
| Provider value (connection name, else id) | `MA:94-97`, `MA:148-150` | `state.route().data.driverProviderId`, `state.connections()` | keep | design decides | spec `:80` |
| Model value (id in mono, "<tier> tier", or "Default (chosen by Claude)") | `MA:98-100`, `MA:144-145` | `route.data.resolvedModel` | keep | design decides | spec `:81-82` |
| Effort value ("Provider default", "...") | `MA:101-103`, `MA:146` | `state.effort()` | keep | design decides | spec |
| Empty state "Choose a provider to start the main agent." + button | `MA:105-110` | - | keep | design decides | spec |
| "Change main agent" primary button with chevron, one instance | `MA:120-127`, output `MA:135` | `reassignRequested` -> `openMainPopover()` `PS:156`, `PS:1532-1534` | keep | design decides | spec `:126-132`; `providers-settings.component.spec.ts:2085-2088`; layout note `settings-visual.e2e.spec.ts:1017` |
| Reassign popover anchored at bottom-left | slot `MA:114`; host `PS:157-163` (`[open]`, `[initialFocus]`, `(accountSignInRequested)`) | `mainPopover` signal | keep | design decides | popover spec |
| `main-*` deep links open the popover on a field | `PS:1170-1178` | focus target | keep | unchanged | providers-settings spec |
| Other read errors + clear review under the block | default slot `MA:116`; host `PS:177-196+` | `mainReadErrors()`, `clearKey()` | keep | design decides | providers-settings spec |
| z-index lift while a popover is open | `MA:47`, `MA:52` | CSS `has-[[role=dialog]]` | keep | unchanged | none |

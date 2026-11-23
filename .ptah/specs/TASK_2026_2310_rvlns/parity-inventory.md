# Parity inventory - Reviews settings drawer (TASK_2026_2310_rvlns, D9)

Scope: the OLD drawer as it exists in the worktree before any design change.
Source read: `libs/frontend/review-runs-ui/src/lib/components/` (drawer ts/html/spec, repositories editor,
bot identity, confirm dialog, page, page header), `review-runs.store.ts`, `review-rpc.handlers.ts`,
`apps/ptah-extension-webview/src/styles.css`, `electron-shell.component.ts`, `native-drawer.component.ts`,
`connection-detail-drawer.component.ts`, `apps/ptah-electron-e2e/src/visual-parity/wave1.spec.ts`.
Paths below are relative to the worktree root `D:\projects\PtahCode\.claude-worktrees\review-lane-pool`.
Abbreviations: `drawer.ts` / `drawer.html` = `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.{ts,html}`;
`drawer.spec` = its spec; `store` = `libs/frontend/review-runs-ui/src/lib/review-runs.store.ts`;
`store.spec` = `review-runs.store.spec.ts`; `handlers` = `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts`.
"New location" is TBD before design: this pass does not design the replacement.

## Root causes of the reported defects

The screenshot (`screenshots/before-drawer-dark-narrow.png`) is taken with glass on (blurred navbar pill,
translucent panes). All three causes below are glass-mode causes; non-glass is an assumption (see end).

1. **Title and Close hidden behind the navbar.**
   - The drawer is a plain in-DOM overlay: `<div class="fixed inset-0 z-50 bg-black/60">` with an
     `<aside ... absolute inset-y-0 right-0>` (`drawer.html:1-3`). Its `z-50` is only meaningful inside
     its nearest stacking context.
   - In workspace mode the Reviews route renders inside the centre pane
     `<div #configurationSurfaceHost data-glass-surface="chrome" ...>` (`libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:519-528`).
   - Every glass surface role isolates: `:where([data-glass-surface]) { position: relative; isolation: isolate; }`
     (`apps/ptah-extension-webview/src/styles.css:3152`, repeated for chrome/bar at `:3162-3169`). So the drawer's
     z-50 is trapped inside the centre pane's stacking context.
   - The navbar is `data-glass-surface="bar"` (`electron-shell.component.ts:221-226`) and is lifted to
     `z-index: 30` in glass (`styles.css:3287`). The centre pane has no z-index, so the whole navbar paints
     above the drawer's top 40 px: the `h2#review-settings-title` and the Close button (`drawer.html:9-31`) sit
     under it.
   - The stylesheet already knows this trap: it lifts a hosting surface only for `.popover-panel` /
     `.suggestions-panel` (`styles.css:3289-3302`) and for open daisyUI `.modal` (`styles.css:3304-3313`, z-40).
     The review drawer is neither, so no lift applies.
   - The confirm dialogs have the same in-DOM pattern (`review-confirm-dialog.component.ts:8`, `fixed inset-0 z-[60]`)
     and are rendered as children of the same drawer root (`drawer.html:169-210`), so they inherit the same trap.
2. **Background "not properly settled" (see-through panel).**
   - The panel uses `.surface-1` (`drawer.html:3`). In glass, `.surface-1` is turned into an in-page reading
     plane: `:root[data-glass='on'] :is(.surface-1, .surface-2):not([data-glass-surface], [role='menu'], .dropdown-content, .modal-box, .navbar)`
     gets `background-color: var(--glass-scrim-text)` (`styles.css:3733-3737`). `role="dialog"` is not in the
     exclusion list. `--glass-scrim-text` is a translucent b1, e.g. `oklch(var(--b1) / 0.5)` (`styles.css:2899`),
     `/0.62` (`:2937`). The page header, filters and "No review runs yet" show through the panel in the screenshot.
   - The comment at `styles.css:3731-3732` states the intent: floating surfaces must use `.surface-3` or role
     attributes; `.surface-1` is for in-page blocks. The drawer used the wrong surface class.
   - The `bg-black/60` backdrop (`drawer.html:1`) is clipped to the same isolated pane context, so it never dims
     the navbar or side rails (visible in the screenshot: navbar and WORKSPACES/GIT rails undimmed).
3. **No icons.** Close is a text ghost button (`drawer.html:22-30`); Remove / Add repository
   (`review-repositories-editor.component.ts:22-31`, `:78-84`), Save token / Verify / Remove connection
   (`review-bot-identity.component.ts:52-74`) are text only. `review-runs-ui` has no `lucide-angular` import
   anywhere (grep of `libs/frontend/review-runs-ui/src`: zero hits), while `lucide-angular` is a workspace
   dependency (`package.json:131`).
4. **Inconsistent controls** (D9 "Minimum severity renders as bare text"): `drawer.html:84-87` renders a heading
   plus `<p>{{ minimumSeverity() }}</p>` while its siblings are `ptah-field` inputs (`drawer.html:88-132`).
   `minimumSeverity` is an input defaulting to `'Minor'` (`drawer.ts:52`) and the page never binds it
   (`review-runs-page.component.ts:250-262`), so it is always the literal default.

**Comparison - a drawer that renders correctly.** `ptah-connection-detail-drawer` wraps its content in
`ptah-native-drawer` (`libs/frontend/chat/src/lib/settings/providers/connection-detail-drawer.component.ts:66-67`,
imported from `@ptah-extension/ui` at `:4`; exported via `libs/frontend/ui/src/lib/native/index.ts:47`).
`NativeDrawerComponent`:
- renders its root with `popover="manual"` and calls `showPopover()` (`libs/frontend/ui/src/lib/native/drawer/native-drawer.component.ts:70-75`, `:293-302`).
  The top layer escapes every isolated ancestor, so the navbar cannot paint over it (comment `:135-136`).
- uses an opaque `bg-base-100` panel (`:85`), not `.surface-1`, so the glass `.surface-1` scrim rule does not apply.
- dims with `bg-black/60 backdrop-blur-[2px]` over the full viewport (`:77`), closes on backdrop click (`:270-273`).
- provides a pinned header with a Lucide `X` icon close button `aria-label="Close panel"` (`:94-112`, `:47`),
  scrollable body (`:115-120`) and a pinned footer slot (`:122-124`).
- owns focus trap, Escape and focus restore (`:244-261`, `:279-348`).

Differences that matter for parity if the redesign adopts it (record, not decide):
- Accessible name: native drawer uses `aria-label` (`:89`); the old drawer uses `aria-labelledby="review-settings-title"`
  (`drawer.html:6`). The e2e gate finds the dialog by name "Review settings" (`apps/ptah-electron-e2e/src/visual-parity/wave1.spec.ts:36`, `:95`).
- Close button name: native is "Close panel" (`:105`); old is "Close review settings" (`drawer.html:26`).
- Initial focus: native focuses the first focusable (`:304-310`); old focuses `#review-settings-title` (`drawer.ts:218-225`).
- Escape: native stops propagation (`:283`); old does not (`drawer.ts:229-235`), the confirm dialog does
  (`review-confirm-dialog.component.ts:43`).
- Native backdrop click closes; the old drawer has no backdrop-click close.
- Confirm dialogs (`review-confirm-dialog.component.ts:8`) are not top-layer; inside a top-layer drawer they would
  paint under it unless they also move to the top layer or render inside the panel.

## Capability inventory

| Capability | Where today (file:line) | Backing RPC/API | Decision | New location | Test |
| --- | --- | --- | --- | --- | --- |
| Open drawer from header "Review settings" button | `review-page-header.component.ts:62-68`, `:83`; page `review-runs-page.component.ts:62`, `:282-285` | `review:getSettings` via `store.loadSettings()` (`store:328-345`; handler `handlers:358`) | keep | TBD before design | e2e `apps/ptah-electron-e2e/src/visual-parity/wave1.spec.ts:94-95`; no unit test of the open path (missing) |
| Settings also loaded on page init | `review-runs-page.component.ts:286-289` | `review:getSettings` | keep | TBD | missing unit coverage |
| Parent-owned visibility (`settingsOpen` signal, `@if`) | `review-runs-page.component.ts:249-263`, `:279` | N/A (UI state) | keep | TBD | missing |
| Close via Close button | `drawer.html:22-30`; `closed` output `drawer.ts:54`; page `review-runs-page.component.ts:261` | N/A | keep | TBD | missing (only Escape is tested) |
| Close via Escape | `drawer.ts:229-235` | N/A | keep | TBD | `drawer.spec:54-59` |
| Focus trap (Tab / Shift+Tab cycle) | `drawer.ts:236-256` | N/A | keep | TBD | missing |
| Initial focus to title, restore focus on destroy | `drawer.ts:218-228`, title `tabindex="-1"` `drawer.html:11-15` | N/A | keep | TBD | missing |
| Modal dialog semantics (`role=dialog`, `aria-modal`, labelled by title) | `drawer.html:2-8` | N/A | keep | TBD | `drawer.spec:55` (queries `[role="dialog"]`); e2e name lookup `wave1.spec.ts:36`, `:95` |
| Title + subtitle "Settings apply to the next run." | `drawer.html:10-21` | N/A | keep | TBD | e2e by name only |
| Loading state panel | `drawer.html:32-33`; `loadState` input `drawer.ts:53`; bound `review-runs-page.component.ts:257` | `store.settingsState` (`store:85`, set `:329`, `:340`) | keep | TBD | missing |
| Error state with Retry | `drawer.html:34-41`; `retry` output `drawer.ts:55`; page `:260` -> `store.loadSettings()` | `review:getSettings` | keep | TBD | missing |
| Repositories list (owner/name per card) | `review-repositories-editor.component.ts:11-21` | draft from `review:getSettings` | keep | TBD | `drawer.spec:185-269`; `review-repositories-editor.component.spec.ts:5` |
| Empty repositories text "No repositories added." | `review-repositories-editor.component.ts:61-65` | N/A | keep | TBD | `drawer.spec:221-223` |
| Add repository with owner/name validation + duplicate check | editor `:66-90`; logic `drawer.ts:61-100` | draft only (`store.updateDraft` `store:415-417`), persisted by Save | keep | TBD | `drawer.spec:224-255` |
| Remove repository | editor `:22-31`; `drawer.ts:101-107` | draft only | keep | TBD | `drawer.spec:265-268` |
| Enable review polling per repository | editor `:33-40`; `drawer.ts:108-111` | draft only | keep | TBD | missing direct test |
| Dry-run toggle; leaving dry-run requires token + bot + confirmation | editor `:41-51`; `drawer.ts:112-134` | draft; `store.liveAttested` (`store:77`) feeds attestation in `review:updateSettings` (`store:453-466`) | keep | TBD | `drawer.spec:256-264` (disabled without bot); `drawer.spec:122-181`; `review-repositories-editor.component.spec.ts:5` |
| Per-repository publication pause (immediate RPC) | editor `:52-54`; `drawer.ts:147-151` | `review:setPublicationPause` with repo (`store:484-495`; handler `handlers:429`) | keep | TBD | `store.spec:787` |
| "Connect a bot token to enable live publication." hint | editor `:55-59` | N/A | keep | TBD | missing |
| Fork PR / CodeRabbit footnote | editor `:91-94` | N/A | keep | TBD | missing |
| Attestor login field | `drawer.html:57-68`; `drawer.ts:207-210` | `store.attestorLogin` (`store:78`) -> attestation `who` (`store:456-459`) | keep | TBD | missing |
| Maintainer logins (comma separated) | `drawer.html:69-81`; `drawer.ts:198-206` | draft `maintainerLogins` -> `review:updateSettings` | keep | TBD | missing |
| Minimum severity display (always "Minor", read-only text) | `drawer.html:84-87`; `drawer.ts:52`; not bound by page `review-runs-page.component.ts:250-262` | none (no setting backs it) | keep (D9 asks for a consistent control; no evidence to remove) | TBD | `drawer.spec:50` |
| Poll interval (1-1440) | `drawer.html:88-98`; `drawer.ts:211-217` | draft `pollMinutes` | keep | TBD | missing |
| Max inline comments (0-100) | `drawer.html:99-109` | draft `maxNewInline` | keep | TBD | missing |
| Confidence floor (0-1, step 0.01) | `drawer.html:110-121` | draft `confidenceFloor` | keep | TBD | missing |
| Lane cap per PR (1-6) | `drawer.html:122-132` | draft `laneCapPerPr` | keep | TBD | missing |
| Bot identity: plaintext storage warning | `review-bot-identity.component.ts:13-18` | `tokenStorage` from `review:getSettings` (`store:339`) | keep | TBD | missing |
| Bot identity: connected as / scopes / connected / verified | bot identity `:19-38` | `review:getBotIdentity` (`store:346-356`; handler `handlers:182`) | keep | TBD | missing |
| Save bot token (password field cleared after submit) | bot identity `:39-59`; `drawer.ts:179-197` | `review:setBotToken` (`store:365-384`; handler `handlers:252`) | keep | TBD | `drawer.spec:61-109`; `store.spec:862` |
| Replace token requires confirmation, then re-attest live repo | `drawer.ts:171-197`; dialog `drawer.html:201-210`, `:180-190` | `review:setBotToken` | keep | TBD | `drawer.spec:122-181` (re-attest path) |
| Verify connection | bot identity `:60-66` | `review:getBotIdentity` | keep | TBD | missing |
| Remove connection with confirmation | bot identity `:67-75`; `drawer.ts:167-170`; dialog `drawer.html:191-200` | `review:clearBotToken` (`store:385-399`; handler `handlers:260`) | keep | TBD | missing |
| Identity / credential error alerts | bot identity `:77-84` | `store.botIdentityError`, `store.credentialState` | keep | TBD | missing |
| Global "Pause all publication" toggle (pause immediate; resume needs confirmation) | `drawer.html:137-146`; `drawer.ts:152-166`; dialog `drawer.html:169-179` | `review:setPublicationPause` (`store:484`) | keep | TBD | `drawer.spec:110-120`; `store.spec:710`, `:747`, `:802` |
| Confirm dialogs (resume, live-enable, remove-token, replace-token) with permission acknowledgement | `drawer.html:169-210`; `review-confirm-dialog.component.ts:1-50` | N/A | keep | TBD | `review-confirm-dialog.component.spec.ts:5`; `drawer.spec:118-120`, `:173-175` |
| "Effective repository configuration" section (static "unavailable" text, no data) | `drawer.html:147-152` | none | keep (flag: placeholder with no backing data; a removal would be remove-proposed and needs user approval) | TBD | missing |
| Save error alert | `drawer.html:153-155` | `store.settingsSaveError` (`store:84`, set `:431-445`, `:472-476`) | keep | TBD | `store.spec:902-` ("blocks live saves without a bot") |
| Save button with "Saving..." busy state | `drawer.html:156-165`; `save` output `drawer.ts:57`; page `:259` | `review:updateSettings` (`store:428-480`; handler `handlers:369`) | keep | TBD | `store.spec:841`, `:862` |
| Draft edits flow to store (`changed` -> `updateDraft`) | `drawer.ts:56`; page `review-runs-page.component.ts:258` | `store.updateDraft` (`store:415-417`) | keep | TBD | `drawer.spec:218-239` |
| Unused inputs `repository`, `settings` | declared `drawer.ts:46-47`, bound `review-runs-page.component.ts:251-252`, never read in `drawer.html` | N/A | keep (dead inputs, not a capability; cleanup is a design decision) | TBD | N/A |

No row is `remove-proposed`. The "Effective repository configuration" placeholder is the only candidate; flag it to
the user before the design drops or replaces it.

## Identifiers the settings visual gate must keep

Drawer root has **no `data-testid`** today. Identifiers present:

| Kind | Value | Where |
| --- | --- | --- |
| `id` | `review-settings-title` (also `aria-labelledby` target, focus target) | `drawer.html:12`, `:6`; `drawer.ts:223` |
| `id` | `review-attestor` | `drawer.html:62` |
| `id` | `review-maintainers` | `drawer.html:74` |
| `id` | `review-add-repository` | `review-repositories-editor.component.ts:71` |
| `id` | `review-bot-token` (queried by code) | `review-bot-identity.component.ts:45`; `drawer.ts:175`; `drawer.spec:104`, `:167` |
| `id` (dialogId) | `review-resume-confirm`, `review-live-enable-confirm`, `review-remove-token-confirm`, `review-replace-token-confirm` | `drawer.html:171`, `:182`, `:193`, `:203` |
| `id` (derived) | `<dialogId>-description` for each confirm dialog | `review-confirm-dialog.component.ts:10`, `:13` |
| `aria-label` | `Close review settings` | `drawer.html:26` |
| `aria-label` | `Remove {owner}/{name}` (per repository) | `review-repositories-editor.component.ts:25-27` |
| `aria-labelledby` | `review-settings-title` (dialog accessible name "Review settings") | `drawer.html:6`; e2e `wave1.spec.ts:36`, `:95` |
| `role` | `dialog` + `aria-modal="true"` on the panel | `drawer.html:4-5`; `drawer.spec:55` |
| `role` | `alert` on save error, repository error, identity/credential errors, plaintext warning | `drawer.html:154`; editor `:87`; bot identity `:14`, `:78`, `:81` |
| `role` | `switch` (from `ptahToggle`) on the global pause input, found by the spec | `drawer.html:140-141`; `drawer.spec:110-114` |
| Trigger | header button accessible name "Review settings" | `review-page-header.component.ts:62-68`; e2e `wave1.spec.ts:94` |

## Assumptions

- Non-glass rendering: `[data-glass-surface]` still isolates without glass (`styles.css:3152`), but the bar's
  `z-index: 30` is glass-only (`:3287`) and the navbar precedes the body in DOM, so the overlap is expected to be
  glass-only. Check: screenshot the drawer in Electron with glass off.
- No-folder mode renders the route in `<div data-shell-surface>` without `data-glass-surface`
  (`electron-shell.component.ts:495-497`); whether the navbar overlaps there was not traced. Check in Electron.

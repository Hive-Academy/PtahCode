# Phase 2 report, lane A (B2.1, B2.2, B2.6, glass card rule) - TASK_2026_2285_304a

Status: all four items are done. All focused checks of the write set pass. No visual check was made (the lane
rules forbid build, serve and dev targets; the coordinator does the visual review in Electron).

Paths: `CH/` = `libs/frontend/chat/src/lib/settings/`.

## Files changed (14)

| File | Batch |
|---|---|
| `CH/settings.component.ts`, `CH/settings.component.html`, `CH/settings.component.spec.ts` | B2.1 |
| `CH/advanced-settings.component.ts`, `CH/advanced-settings.component.spec.ts` | B2.1 (+ `rowLayout="aligned"` of B2.6) |
| `CH/license/license-status-card.component.ts`, `.spec.ts` | B2.2 |
| `CH/pro-features/mcp-port-config.component.ts`, `CH/pro-features/vscode-lm-config.component.ts` | B2.6 |
| `CH/advanced/codex-sandbox-setting.component.ts`, `.spec.ts` | B2.6 |
| `CH/advanced/advanced-settings-group.component.ts`, `.spec.ts` | B2.6 |
| `apps/ptah-extension-webview/src/styles.css` | CSS rule (decision 33) |

## B2.1 Shell and page container

What changed:
- `settings.component.ts`: `settingsTabs` is a `computed`. The `pro-features` entry gets
  `stateMark: { tone: 'warn', label: 'Membership needs attention' }` while `ChatStore.licenseStatus()?.reason` is set.
  The 2 readers (`activeTabTitle`, `settingsTabIndex`) call `settingsTabs()`. NEW `activeTabIcon` computed. NEW
  `SetupIcon`, `PlayIcon`, `RefreshIcon`. The scoped rule `:host-context([data-glass='on']) [data-glass-surface='content']
  { padding: 1.25rem }` is deleted.
- `settings.component.html`: `[tabs]="settingsTabs()"`, `[icon]="activeTabIcon()"`, `.settings-page` gets
  `[scrollbar-gutter:stable_both-edges]`, the Advanced panel has `gap-[var(--ptah-gap-section)]` always, the Setup
  `style="padding: 0"` is deleted, the Setup form section has an icon, and the 2 Setup buttons have `Play` / `RefreshCw`
  icons with their labels. F34: the Back button sets `[--ptah-control-px:var(--ptah-settings-nav-px)]`, so its inline
  padding equals the `px-[var(--ptah-settings-nav-px)]` of the `h2` title (the `h2` tag stays).
- `advanced-settings.component.ts`: `[data-advanced-sections]` gets `gap-[var(--ptah-gap-section)]` and the F38 cap.
  The `styles` block is deleted. Export has `Download` + "Export settings", Import has `Upload` + "Import settings"
  (aria-label = visible label). Fine-tuning form section has `[icon]="SlidersIcon"`.

Acceptance:
| Item | How it is met |
|---|---|
| 2.1 `settingsTabs` computed + state mark (F36, F40) | Code above. Tests "F36: ..." (2) in `settings.component.spec.ts`: mark with `title` and `aria-label`, and the mark goes when the reason clears |
| 2.1 page icon (F35) | Test "F35/F37: shows the icon of the open page before the title ..." |
| 2.1 F37 scrollbar gutter | Same test (class on `.settings-page`) |
| 2.1 F34 | Test "F34: Back and the nav title share the nav inset" |
| 2.1 F8 (html) | Test "Setup (A-32) > is a card with the shared inset ..." asserts the panel gap class |
| 2.1 F2 | Same test: Setup has no `style` attribute. The scoped rule is deleted |
| 2.1 Setup A-32, test ids kept | `settings-setup`, `settings-run-onboarding-again`, `settings-check-claude-code`, `settings-back`, `settings-tabs` are unchanged. Tests "Run onboarding again opens onboarding; Check Claude Code opens the install check (Electron)" and "Check Claude Code is Electron-only" |
| 2.2 F8 | Test "F8/F38: separates the sections by one gap ..." |
| 2.2 F18 | Test "F18: Export and Import are icon + label buttons whose aria-label equals the visible label". The old aria-label tests pass unchanged |
| 2.2 F38 | Same F8/F38 test (class). See Decisions D-2 |
| 2.2 Fine-tuning icon, keep list | Test "gives the Fine-tuning section its icon and asks its groups for the aligned row layout". `exportSettings`, `requestImport`, `cancelImport`, `importSettings`, `import-confirm`, `advanced-overview`, `modelChanged`, `@defer (on viewport)` are not changed |
| No horizontal scroll at 800x600 with nav; sections gap 2rem with glass off | NOT verified by this lane: visual check for the coordinator |

## B2.2 Membership & data

What changed in `license-status-card.component.ts`:
- `ptah-form-section` gets `[icon]="KeyIcon"` (`KeyIcon` is now `KeyRound`).
- Aside: plan badge (`Layers` Community / `Sparkles` Builder) and state badge (`CircleCheck` Active / `TriangleAlert`
  Needs attention / `CircleAlert` Inactive). The `Plan` and `State` description items are removed (M-8). The plan
  description text (80 characters or less) stays, under the badges. The `Account` item stays.
- Fields are `ptah-setting-row` rows with `controlAlign="end" edgePadding="trim"`, in one container
  (`data-testid="membership-rows"`):
  - Community: "Membership key" (`membership-key-row`), "Settings backup" (`membership-backup-row`), "Ptah Builders"
    (`membership-builders-row`).
  - Member: "Membership" with "Manage Membership" (`membership-manage-row`), "Settings backup".
  - Signed in (member or community with an account, as today): "Log out" (`membership-logout-row`), with the same
    `logout-button`. The inline confirm stays below the rows.
- M-9: the alert is removed. Its body copy is the hint of the "Membership key" row (`id="membership-key-hint"`) when
  `isCommunity() && licenseReason()`. The one trigger `membership-key-trigger` ("Enter membership key", `KeyRound`) has
  `aria-describedby="membership-key-hint"` and `aria-haspopup="dialog"`.
- The popover content block (dialog role, show/hide, format check, Enter, `submitLicenseKey`, `w-80`, header with `X`)
  is unchanged, only indented. No handler changed.
- `[membership-actions]` is projected into the "Settings backup" row. `[membership-notices]` follows the rows.

Agreement with B2.1: `advanced-settings.component.ts` still projects one `[membership-actions]` element (Export,
Import, import confirm). Test "projects the [membership-actions] content into the "Settings backup" row" proves the slot.
`ADV.spec` "M5: ..." passes unchanged.

Acceptance:
| Item | How it is met |
|---|---|
| A-4 badges in the aside | Tests "shows the community card ..." (badges are in `form-section-aside`, no `dt`), "shows the Needs Attention badge ...", NEW "shows the Inactive state badge ..." |
| A-5 Account | Tests "shows the member card ..." and "shows account facts without an avatar row" |
| A-6 (NEW test) | "A-6: Manage Membership opens the membership page through ptah.openPricing" |
| A-7 popover | Tests F3, malformed key, `license:setKey`, never persists, visibility toggle pass unchanged |
| A-8 (NEW test) | "A-8: Explore Ptah Builders and Create account each run their command; Create account is the only primary" |
| A-9 log out | The 5 log-out tests pass unchanged |
| A-10 / M-9 (NEW test, replaces `LIC.spec:190`) | "M-9: shows the key-not-active copy verbatim as the row hint, with one key action that opens the popover" |
| Overview report | Tests at `:293`, `:304` (old numbers) pass unchanged |

Test ids removed: `membership-key-alert`, `membership-key-alert-action` (the alert, as planned).
Test ids added: `membership-badges`, `membership-plan-badge`, `membership-state-badge`, `membership-plan-description`,
`membership-rows`, the 5 row ids, `membership-manage`, `membership-explore`, `membership-create-account`.

Copy changes (spec "Control rule", sentence case): "Enter Membership Key" -> "Enter membership key" (trigger only; the
popover title is unchanged), "Create Account" -> "Create account", "Needs Attention" -> "Needs attention".

## B2.6 Other sections

- `mcp-port-config.component.ts`: `[icon]="PlugIcon"` on the form section.
- `vscode-lm-config.component.ts`: `[icon]="CpuIcon"` on the form section. The `lucide-angular` `CpuIcon` of the
  provider header row is deleted. The sr-only `h2#vscode-lm-heading`, badges, `vscode-lm-set-default`,
  `vscode-lm-model-select` and `modelChanged` are not changed.
- `codex-sandbox-setting.component.ts`: the header `div` is replaced by `<ptah-form-section [level]="3" wide
  heading="Codex sandbox" [icon]="ShieldCheckIcon">` around the body. The outer `<section>` keeps `data-glass-surface`,
  `data-testid` and `aria-labelledby="codex-sandbox-heading"`. A sr-only `span#codex-sandbox-heading` is inside the
  form section. The scope paragraph (`id` and test id unchanged) is the first visible body element and is not passed
  as `description`. The loading/error/radios/confirm/effective blocks are not changed. The `styles` block is deleted.
- `advanced-settings-group.component.ts`: NEW input `rowLayout` (`'default' | 'aligned'`, default `'default'`). Each
  switch row binds `controlAlign` and `edgePadding` from it. The padding copy in `styles` is deleted. No icon.
- `advanced-settings.component.ts`: `rowLayout="aligned"` on the Fine-tuning call site only.

Acceptance:
| Item | How it is met |
|---|---|
| 2.8 Codex | NEW test "uses the shared form section: the icon and the heading in the aside, the scope note first in the body" (heading, icon, `#codex-sandbox-heading` unique, scope id, `aria-describedby`) |
| 2.8 group `rowLayout` | NEW tests "rowLayout > default renders today's rows ..." and "'aligned' puts each switch at the right edge and trims the row padding" |
| The 4 specs pass | `mcp-port-config`, `vscode-lm-config`, `codex-sandbox-setting`, `advanced-settings-group` pass (the first 2 unchanged) |
| Codex drawer and Context Management rows render as today | Default `rowLayout` gives the same classes (test). NOT verified visually |

## CSS rule (decision 33)

- Added in `apps/ptah-extension-webview/src/styles.css`, directly after the
  `:root[data-glass='on'] [data-glass-surface='content']` rule, with the comment
  `/* TASK_2026_2285_304a: one card inset for every content card of the Settings page. */`. The rule text is the given text.
- Per-component copies removed in the write set: `settings.component.ts` (scoped rule) and `settings.component.html`
  (`style="padding: 0"`), `codex-sandbox-setting.component.ts`, `advanced-settings-group.component.ts`.
  `license-status-card`, `vscode-lm-config`, `mcp-port-config` and `advanced-settings.component.ts` had no copy.
- Stacked padding: each card of the write set has the class `[[data-glass=on]_&>section]:py-0` on its
  `ptah-form-section`. With glass on, the inner `<section>` of the form section has no block padding, so the card inset
  (1.25rem) is the only inset. With glass off, the form section keeps its `py-[var(--ptah-gap-group)]`. Cards: Setup,
  Membership & data, MCP & Browser, VS Code language model, Fine-tuning, Codex sandbox.
- The 3 voice-card exceptions are not touched.

## Checks (all run from the worktree root)

| Command | Exit |
|---|---|
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath` + the 7 specs (settings, advanced-settings, license-status-card, mcp-port-config, vscode-lm-config, codex-sandbox-setting, advanced-settings-group) | 0 (7 suites, 215 tests) |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | 0 |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` | 2 (384 errors, 0 in the write set) |
| `npx eslint` + the 13 changed `chat` files | 0 |

`tsconfig.spec.json` errors: none is in a file of this lane. One is in a file that another lane changed:
`CH/pro-features/system-prompt-drawer.component.spec.ts(594,33): error TS2322: Type 'void' is not assignable to type
'undefined'`. The other 383 are in files that `git status` shows as not changed (for example
`components/atoms/resize-handle.component.spec.ts`, `settings/providers/providers-settings.component.spec.ts`), so they
were there before Phase 2. I did not fix them. Logs: `.ptah/tmp/lane-a-*.log`.

Not run (rules): `npm run verify`, `nx`, `typecheck-templates`, build, serve. `tsc` does not compile the templates. The
Jest JIT compile of the 7 specs is the only template check of this lane. `mcp-port-config.spec` and
`vscode-lm-config.spec` are not in the write set, so the 2 new icons there have no new assertion.

## Deviations from the plan

1. F38 is a Tailwind container class on `[data-advanced-sections]`, not a rule in the component `styles` (D-2).
2. The state badge of the aside is a `ptahBadge` with a lucide icon. `ptah-status` is not used there (D-3).
3. The key-not-active hint uses the condition of today (`isCommunity() && licenseReason()`), not `licenseReason()`
   alone (D-4).
4. The plan description text stays (the plan removes the `Plan` item) (D-5).
5. The Setup section icon is `SlidersHorizontal` (D-6).
6. `ChatStore` is a new dependency of `SettingsComponent` (as the plan says). The 9 `TestBed` configurations of
   `settings.component.spec.ts` now provide a `ChatStore` fake.

## Not done

- No visual check (see the next section).
- The group's own form section (`advanced-settings-group.component.ts`, `headingStyle="section"`, Context Management)
  still has stacked padding with glass on: card inset 1.25rem + form section block padding 1.5rem. It is the same as
  before this task (the deleted component rule gave the same 1.25rem). The plan says that these call sites do not
  change, so I did not add the `py-0` class there. Fix if wanted: add `class="[[data-glass=on]_&>section]:py-0"` on that
  `ptah-form-section` when `contentSurface()` is true.

## Visual checks for the coordinator (Electron, glass on and off, dark and light)

1. Each card of the Advanced page has one inset of 1.25rem on all sides with glass on (no stacked block padding):
   Setup, Membership & data, MCP & Browser, Fine-tuning. VS Code language model shows only with the `vscode-lm` provider.
2. Sections have a 2rem gap with glass off. The instrument band keeps `mb-[var(--ptah-gap-heading)]`, so the distance
   from the band to the first card is gap + margin, with and without glass (with glass it is as before).
3. 800x600 with nav: no horizontal scroll (`scrollbar-gutter: stable both-edges` adds a gutter on both sides).
4. Left nav: the Back button text and the "Settings" title start at the same x.
5. Page header: icon before the title on each of the pages. Advanced nav item: warn dot with tooltip when the license
   has a reason.
6. Membership rows: controls at the right edge, the first row has no top padding, the last row has no divider. The
   key popover opens from the row and has the viewport cap. The "Settings backup" row holds the import confirm without
   a layout jump (the confirm is wider than the 2 buttons).
7. Fine-tuning, open one group: with `rowLayout="aligned"` each `ptah-setting-row` is the only child of its wrapper
   `div`, so `edgePadding="trim"` removes the top and bottom padding of every row (the wrapper keeps
   `py-[var(--ptah-gap-controls)]`). Check that the row density is acceptable.
8. Codex connection drawer (Providers > Codex > Credentials): the Codex sandbox card now has the form-section header
   (icon + `h3`, stacked aside in the narrow drawer). With glass off the form section adds 1.5rem block padding that
   was not there before. The `codex-agents` group card keeps its 1.25rem inset from the global rule (the drawer is
   inside `.settings-page`).
9. Search & Voice: the 3 voice cards keep `padding: 0 1.25rem`. Their component rule and the new global rule have the
   same specificity (0,4,0), so the component rule wins only because Angular adds component styles after `styles.css`
   (review finding Minor 3, decision 33 kept the rule text).

## Decisions

| # | Decision | Options | Evidence | Reversible |
|---|---|---|---|---|
| D-1 | Remove stacked padding with the class `[[data-glass=on]_&>section]:py-0` on each `ptah-form-section` of a card in the write set | (a) this class; (b) change `form-section.component.ts` (outside the write set); (c) `::ng-deep` rules per component | The inner `<section>` of the form section has `py-[var(--ptah-gap-group)]` (`form-section.component.ts:54`). The class has specificity 0,2,1 and wins over the utility (0,1,0). The same variant form is in use (`settings.component.html:132` before this change, `[&>*]:relative`). The other lanes can use the same class for their cards | yes |
| D-2 | F38 as the class `[@container(min-width:1400px)]:[--ptah-settings-content-max-w:56rem]` | (a) class; (b) `@container` rule in component `styles` (plan text) | Same CSS result and same container (`ptah-settings-layout` host). The `styles` block was deleted for F8, the class form is in use in the repository (`[@container(min-width:640px)]:hidden`), and a class can be asserted in Jest | yes |
| D-3 | State badge = `ptahBadge` (outline, tone ok / warn / neutral) + lucide icon + word in `text-base-content` | (a) this; (b) lucide icon + `ptah-status` (plan text) | `ptah-status` always draws its own state glyph (`status.component.ts:36`), so (b) shows 2 marks. The prototype shows a badge with one icon (`prototype/index.html:420`). The spec contrast rule: the word uses `base-content`, only the icon and the border carry the ink | yes |
| D-4 | Key-not-active hint when `isCommunity() && licenseReason()` | (a) condition of today; (b) `licenseReason()` alone (plan text) | The alert of today has this condition (`reason` is only `'expired' \| 'no_license'`, `rpc-misc.types.ts:313`). Both options are equal for a community license. (a) keeps today's result for other tiers | yes |
| D-5 | Keep the plan description text under the aside badges | (a) keep; (b) remove with the `Plan` item | Parity A-5 lists "Plan description". Approved removals are only R-1..R-3. `LIC.spec` "shows the member card ..." asserts the text | yes |
| D-6 | Setup section icon `SlidersHorizontal` | (a) `SlidersHorizontal`; (b) `Play` | Spec icon map: "others" = `SlidersHorizontal`. `Play` / `RefreshCw` are the icons of the 2 buttons | yes |
| D-7 | No "Not active" status badge in the "Membership key" row. The alert title "Membership Key Not Active" is not shown | (a) hint only; (b) hint + status badge with the title | Spec: "No duplicate status or key action". The aside badge says "Needs attention" and the prototype row has label + hint only. The alert was `live="assertive"`. The hint is not a live region | yes |
| D-8 | Log out is a row "Log out" for each signed-in user | (a) row; (b) button below the rows as today | Plan 2.3 lists Log out with the member rows. Today the button shows when `userEmail()` is set, so the row uses the same condition | yes |

## Proposed Removals

None.

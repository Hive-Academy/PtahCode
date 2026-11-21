# Implementation plan: Settings redesign (TASK_2026_2285_304a)

Source of truth: `design-spec.md` (approved), `decisions.md` rows 6-29, `parity-inventory.md` (row ids P-*, U-*, A-*, M-*, R-*),
`ui-review-providers.md` (P1-P33), `ui-review-advanced.md` (F1-F41), `prototype/index.html`.

Path prefixes: `UI/` = `libs/frontend/ui/src/lib/`, `CH/` = `libs/frontend/chat/src/lib/settings/`, `PA/` = `CH/ptah-ai/`,
`PR/` = `CH/providers/`, `WV/` = `apps/ptah-extension-webview/`. All paths are relative to the worktree root
`/home/amun/ptah-extension/.claude-worktrees/settings-ui-polish`. NEW marks a file or symbol that does not exist today.

Nx projects (from `project.json`): `@ptah-extension/ui` (`libs/frontend/ui`), `@ptah-extension/chat` (`libs/frontend/chat`),
`@ptah-extension/git-ui`, `@ptah-extension/marketplace`, `@ptah-extension/webview-e2e-harness`, `ptah-extension-webview`
(`apps/ptah-extension-webview`), `ptah-electron-e2e` (`apps/ptah-electron-e2e`).

Skills: the brief names `angular-frontend-patterns` and `nx-workspace-architect`. The host skill catalogue lists neither, so
neither was loaded. The plan follows the repository's own Angular patterns (standalone components, signal `input()` /
`output()`, OnPush, `@if`/`@for`, `lucide-angular` icon constants) as read in the files below.

## Scope and phases

Three phases. Each phase is one pull request and leaves the Electron app working.

| Phase | Pull request | Projects | Why this cut |
|---|---|---|---|
| 1. Shared primitives | `feat(ui): modal shell, popover cap, section icon, row action slot` | ui, webview (styles.css), chat + git-ui + marketplace (opt-out attributes only) | Phase 2 and 3 depend on these APIs. Every new API is opt-in, or default-on with an opt-out that callers with their own height cap set in the same PR, so the rest of the app does not change |
| 2. Advanced page + Claude Code tools & skills | `fix(chat): advanced settings layout, icons, tools groups` | chat (one project) | Independent of Lanes. Smaller risk, ships first |
| 3. Providers > Lanes + modals | `fix(chat): lanes grouped table, add-more strip, reorder` | chat, webview-e2e-harness, ptah-electron-e2e (test ids only) | The largest change. It needs Phase 1 (modal shell, popover cap, setting-row slot is not used here) |

Changes to the suggested split, with reasons:
1. The provider modals (Add/Edit Ptah CLI instance, tier mapping, catalog) move to the first batch of Phase 3, not Phase 1.
   They are Providers files in `@ptah-extension/chat`. Phase 1 stays limited to the `ui` library and the opt-out attributes.
2. The card inset rule is scoped to `.settings-page` (the settings scroll container, `CH/settings.component.html:1`), not
   global. 39 non-spec files use `data-glass-surface="content"`, 26 of them outside Settings (marketplace, command-center,
   onboarding). A global padding rule would change those pages. See `## Decisions` D-2.
3. `--ptah-surface-pad` is NOT deleted. The spec says it is unused (`design-spec.md:24`), but 32 files use it
   (for example `UI/patterns/settings-layout/settings-layout.component.ts:243`, `libs/frontend/thoth-shell/...:109`,
   `libs/frontend/workspace-indexing/...html:12`). See D-3.
4. `form-section [wide]` already exists (`UI/patterns/form-section/form-section.component.ts` input `wide`, class
   `WIDE_CLASS` sets `--ptah-form-section-fields-max-w` to `--ptah-settings-content-max-w`). Phase 1 adds only `icon`.
   Most Advanced sections already pass `[wide]="true"` (license card :106, agent behaviour :136, claude builtins :84,
   MCP :93, VS Code LM :42). Phase 2 adds `wide` only to Output style (F7).
5. `settings-layout` already has `stateMark` (`settings-layout.component.ts:63-67,195-200`). Phase 1 adds only the page
   header `icon` and the `title` on the mark (F40). Phase 2 binds `stateMark` (F36).
6. Phase 3 does a behaviour-preserving split of the Lanes table first (B3.2). No file is above 16,000 tokens (largest
   source: `PA/cli-orchestration-matrix.component.ts` ~7,100 tokens, `PA/lanes-table.component.html` ~5,800 tokens),
   so the split is for batch size, not for the token limit.

---

## Phase 1: Shared primitives

### Components

#### 1.1 Tokens — `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` (spec "Tokens and primitives used")
- Add 3 tokens, one line each, in the `:root` block near `--ptah-card-padding-lg` (line 420):
  `--ptah-popover-max-h: min(28rem, calc(100dvh - 2rem));`
  `--ptah-modal-max-h: calc(100dvh - 2rem);`
  `--ptah-lane-row-h: 3.5rem;`
- Keep `--ptah-surface-pad` (line 28) (D-3). Keep `--ptah-card-padding-lg: 1.25rem` (line 420), reused as the card inset.

#### 1.2 Card inset rule — `apps/ptah-extension-webview/src/styles.css` (F1, F2)
- Add one rule after the `content` glass rule (~line 3238):
  `:root[data-glass='on'] .settings-page [data-glass-surface='content'] { padding: var(--ptah-card-padding-lg); }`
- Only with glass on, as today. The per-component copies in Settings stay until the batch that already edits that
  file removes them (Phase 2 and 3). Copies with a different value (`padding: 0 1.25rem` in
  `PA/voice-config.component.ts:169`, `PA/go-vet-consent-config.component.ts:264`, `PA/voice-elevenlabs-summary.component.ts:42`)
  stay unchanged: component styles load after `styles.css` and have equal specificity (0,4,0), so they still win.

#### 1.3 Popover viewport cap — `UI/native/shared/floating-ui.service.ts`, `UI/native/popover/native-popover.component.ts` (decision 22; P5-P7, F10, F16)
- `FloatingUIOptions` gains NEW field:
  ```ts
  /** Cap the panel height to the free space on the chosen side (floating-ui `size()`). @default false */
  capHeight?: boolean;
  ```
  When `capHeight` is `true`, `position()` builds the middleware as
  `offset → flip({ boundary, fallbackStrategy: 'bestFit' }) → shift(...) → size({ padding: 8, apply })`, where
  `apply({ availableHeight, elements })` writes
  `elements.floating.style.maxHeight = \`min(var(--ptah-popover-max-h), ${Math.max(128, Math.floor(availableHeight))}px)\``
  (128 px = 8rem minimum, spec "Popover cap implementation"). When `capHeight` is `false` or absent, the middleware list is
  byte-identical to today (`floating-ui.service.ts` `position()` middleware array), so `native-dropdown` and
  `native-autocomplete` do not change (they do not pass the field).
- `NativePopoverComponent` gains NEW input:
  ```ts
  /** Cap the panel to the viewport (max-height, max-width, inner scroll). Opt out for content with its own scroll cap. @default true */
  readonly capToViewport = input<boolean>(true);
  ```
  `positionPanel()` passes `capHeight: this.capToViewport()`. The panel `div#floatingRef` gets
  `[class.ptah-popover-capped]="capToViewport()"`; component style:
  `.ptah-popover-capped { max-width: calc(100vw - 1rem); overflow-y: auto; overscroll-behavior: contain; }`.
  The full-viewport layer `.ptah-popover-layer` (`max-height: none`, line ~131) does not change: it is the top-layer shell,
  not the panel. (The spec text "the mode at line ~131 passes `false`" refers to this rule; no caller mode exists there.
  See D-4.)
- Keep every existing input and output: `isOpen`, `placement`, `anchor`, `offset`, `hasBackdrop`, `backdropClass`,
  `keepInViewport`, `opened`, `closed`, `backdropClicked`, method `reposition()`.
- `revealUnpositioned()` fallback (positioning failed or timed out) also sets `max-height: var(--ptah-popover-max-h)` when
  `capToViewport()` is true, so a failed compute never leaves an uncapped panel.

#### 1.4 Modal shell — `UI/native/modal/native-modal.component.ts` (P1-P4, spec "Modal shell")
- NEW type and input:
  ```ts
  export type NativeModalLayout = 'plain' | 'shell';
  /** 'shell': fixed header and footer, scrolling body, viewport height cap. @default 'plain' */
  readonly layout = input<NativeModalLayout>('plain');
  ```
- Template: the three `ng-content` slots are wrapped in three `div`s. With `plain` each wrapper has `display: contents`
  (class `ptah-modal-part`), so today's callers render the same box. With `shell`:
  - box: `flex flex-col overflow-hidden p-0 max-h-[var(--ptah-modal-max-h)] max-w-[calc(100vw-2rem)]` (plus the size class),
  - header wrapper: `shrink-0 border-b border-base-300 px-5 py-3 empty:hidden`,
  - body wrapper: `min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4` with a scroll shadow
    (CSS `background: linear-gradient(...) local, linear-gradient(...) scroll` top and bottom, no JS),
  - footer wrapper: `shrink-0 border-t border-base-300 px-5 py-3 empty:hidden`.
- The size map stays (`sm` `max-w-sm` 24rem, `md` `max-w-lg` 32rem, `lg` `max-w-2xl` 42rem already match the spec).
- Keep: `isOpen`, `ariaLabel`, `ariaLabelledby`, `size`, `closed`, `showModal()`/`close()`, Esc `cancel` forwarding,
  Tab wrap on `.modal-box` (the `FOCUSABLE` query still runs on the box; the wrappers are inside it), backdrop close,
  `ngOnDestroy` close, `dialog.modal:not([open]) { display:none }`.
- The Close `X` stays in each caller's header (callers own their header content today).

#### 1.5 Drawer close icon — `UI/native/drawer/native-drawer.component.ts` (F13)
- Replace the `×` text glyph (line ~105) with `<lucide-angular [img]="XIcon" class="size-4" aria-hidden="true" />` and add
  `ptahTooltip` text "Close panel". Keep `data-testid="native-drawer-close"`, `aria-label="Close panel"`, input `showCloseButton`
  (line ~213), `closeOnEscape`, `closeOnBackdrop`, output `closed`.

#### 1.6 Form section icon — `UI/patterns/form-section/form-section.component.ts` (F22)
- NEW input: `readonly icon = input<LucideIconData | null>(null);` (import `LucideAngularModule, type LucideIconData` from
  `lucide-angular`, as `settings-layout.component.ts:15` does).
- Render `<lucide-angular [img]="icon" class="size-[var(--ptah-icon-md)] shrink-0 text-base-content-muted" aria-hidden="true" />`
  before the heading, inside a NEW `flex items-center gap-[var(--ptah-gap-inline)]` wrapper around the `@switch (level())`
  block. With no icon, the markup is the same as today apart from the wrapper.
- Keep inputs `heading`, `description`, `level`, `divider`, `disabled`, `error`, `wide`, method `focusHeading()`, slots
  `[aside]`, default, `[footer]`, test ids `form-section`, `form-section-aside`, `form-section-body`, `form-section-fields`,
  `form-section-description`, `form-section-error`.

#### 1.7 Setting row — `UI/patterns/setting-row/setting-row.component.ts` (F3, F4, F9; spec "Row pattern")
- NEW content slot `[action]`: a fixed `size-8 inline-flex items-center justify-center empty:hidden` box rendered before
  the default slot inside `[data-ptah-setting-control]`, so toggles share the right edge. An empty slot renders nothing,
  so today's callers do not change.
- The two layout changes are opt-in (decision 29). NEW inputs, defaults = today's rendering:
  ```ts
  /** 'end': the control column is `justify-end` (controls share the right edge, F4). @default 'start' (today) */
  readonly controlAlign = input<'start' | 'end'>('start');
  /** 'trim': a first row has no top padding and a last row has no bottom padding (F3). @default 'all' (today) */
  readonly edgePadding = input<'all' | 'trim'>('all');
  ```
  `controlAlign() === 'end'` adds `justify-end` to `[data-ptah-setting-control]`; `edgePadding() === 'trim'` adds
  `first:[&>div]:pt-0 last:[&>div]:pb-0` to the host class (host binding `[class]` merged with the static class).
- NEW input `readonly hintElementId = input<string | null>(null);`; `hintId` becomes
  `computed(() => this.hintElementId() ?? \`${this.controlId() || this.fallbackId}-hint\`)`. This lets callers move a hint
  from the `[status]` slot to `hint` and keep their existing `aria-describedby` ids (Agent behaviour specs query
  `#agent-behaviour-prompt-note` etc., `agent-behaviour-section.component.spec.ts:216,360,419,430,433,495`).
- The host keeps `last:border-b-0`. Only the Phase 2 callers set `controlAlign="end"` and `edgePadding="trim"`
  (B2.2 license card, B2.3 agent behaviour, B2.6 advanced settings group). The double divider in callers is removed in Phase 2.
- Keep inputs `label`, `hint`, `controlId`, `disabled`, `disabledReason`, `density`, slots `[status]`, `[meta]`, default,
  test id `setting-row`, ids `titleId`/`reasonId`.

#### 1.8 Settings layout — `UI/patterns/settings-layout/settings-layout.component.ts` (F35, F37, F40)
- NEW input `readonly icon = input<LucideIconData | null>(null);` rendered before the page `h1`/`h2`
  (`size-[var(--ptah-icon-lg)] shrink-0 text-base-content-muted`, `aria-hidden`).
- F40: the `stateMark` span (line ~196) gets `[attr.title]="mark.label"`.
- F37 (single padding owner): in `navigation` mode the frame `p-[var(--ptah-page-gutter)]` below 640px moves to the main
  column, so the main column (`data-testid="settings-layout-main"`, line ~214) is the only padding owner at every width.
  The scroll container `.settings-page` (in chat) gets `scrollbar-gutter: stable both-edges` in Phase 2 (B2.1).
- Keep inputs `tabs`, `selected`, `title`, `description`, `titleLevel`, `navLabel`, `navMode`, `navTestId`, output
  `selectedChange`, type `PtahSettingsTab` (fields unchanged), slots `[nav-header]`, `[nav-footer]`, `[actions]`,
  `[header-band]`, default, all `settings-layout-*` test ids.

#### 1.9 Popover opt-out callers (keep today's behaviour where the content has its own scroll cap)
Each gets `[capToViewport]="false"` on its `<ptah-native-popover>`:
| File | Own cap today |
|---|---|
| `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts` | `max-h-[min(34rem,70dvh)]` |
| `PR/main-agent-reassign-popover.component.html` (line 5 popover) | `capPopoverHeight` (`PR/popover-height-cap.ts`) |
| `PR/decision-model-row.component.html` (line ~47 popover) | `capPopoverHeight` |
| `libs/frontend/git-ui/src/lib/review-canvas/draft-comments-bar.component.ts` | `max-h-48` |
| `libs/frontend/marketplace/src/lib/harness/harness-health-badge.component.ts` | `max-h-[26rem]` |
The Settings popovers inside `PA/`, `PA/../license`, `output-style/`, `pro-features/`, `advanced/` keep the default (cap on),
as the spec requires (model popover, install popover, membership key, catalog hint `PR/providers-settings.component.ts:278-306`).
`chat-input.component.ts` keeps the default: its `max-h-[calc(8lh+1rem)]` (`:298`) is on the composer textarea, not on the
popover; the popover (`:353-381`) is a short `w-44 p-1` attach menu (review Minor 2).
Dependency check: `size` is exported by the installed `@floating-ui/dom` 1.8.0
(`node_modules/@floating-ui/dom/dist/floating-ui.dom.d.ts:336` `export declare const size`, main checkout `node_modules`).

### Blast radius

| Changed symbol | Callers outside `CH/` | What each caller needs |
|---|---|---|
| `NativeModalComponent` (new `layout`, default `'plain'`) | `libs/frontend/tasks-ui/.../task-create-dialog.component.ts`, `libs/frontend/skill-synthesis-ui/.../quarantined-agents-panel.component.ts`, `.../clones/reconcile-guard.ts`, `libs/frontend/onboarding/.../stack-skill-consent.component.html`, `UI/patterns/editable-section/editable-section.component.ts`; inside `CH/`: `PR/accounts/account-detail-view.component.ts` (stays `plain`) | Nothing. `plain` wrappers use `display: contents`, so the box keeps its children as direct flex/grid items. Only the 3 Settings modals opt in (Phase 3) |
| `NativePopoverComponent` (new `capToViewport`, default `true`) | 15 files outside Settings: canvas `canvas-rail-card.component.ts` (2), `orchestra-canvas.component.ts`, marketplace `harness-health-badge`, `removal-lock-badge`, dashboard `provider-limit-card`, chat-ui `deny-message-popover`, chat `app-shell.component.html`, `session-filter-bar`, `chat-input`, `send-to-messaging`, `mcp-status-chip`, ui `surfaces/field.component.ts:114` (field info popover: every `ptah-field` with `info` gets the cap, harmless for short text), git-ui `comparison-bar`, `draft-comments-bar`. Not a caller: `UI/overlays/popover/popover.component.ts` (a CDK overlay, `selector: 'ptah-popover'`, it names the native popover only in a comment) | Callers without an own height cap get the cap: a panel taller than `min(28rem, viewport-2rem)` now scrolls inside instead of being cut by the window. This is the intended fix (F10). The 5 callers with an own cap opt out (1.9), so they render as today. `overflow-y: auto` also clips paint outside the panel box (for example `shadow-lg` of a projected card): B1.2 acceptance checks this |
| `FloatingUIService.position()` (new option `capHeight`) | `native-dropdown`, `native-autocomplete`, `native-popover` (all in `UI/native/`), `UI/form-controls/rich-select/rich-select.component.ts`, `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-tabs.component.ts`, `libs/frontend/chat/src/lib/components/file-suggestions/unified-suggestions-dropdown.component.ts`, `libs/frontend/command-center/src/lib/components/command-overlay.component.ts`, `.../command-overlay-positioner.ts` | Nothing: the option is absent, so the middleware is unchanged |
| `NativeDrawerComponent` close glyph | marketplace `installed-skills-page`, `provider-list-view.component.html`, `connectors-page.component.html`; skill-synthesis-ui `clone-detail-drawer`, `enhance-preview-drawer`; tasks-ui `task-maintenance-dialog`; cron-scheduler-ui `cron-job-form`, `cron-job-detail-drawer` | Nothing: test id and aria-label stay. The glyph becomes the lucide `X` |
| `PtahFormSectionComponent` (new `icon`) | `UI/patterns/settings-layout/settings-layout.component.ts`, `WV/src/app/ui-gallery/gallery-patterns-family.component.ts` | Nothing (optional input) |
| `PtahSettingRowComponent` (`[action]` slot, `hintElementId`, opt-in `controlAlign`, opt-in `edgePadding`) | Outside `CH/`: `libs/frontend/cron-scheduler-ui/.../cron-job-form.component.ts`, `WV/src/app/ui-gallery/gallery-settings-controls.component.ts`. Inside `CH/`, edited in Phase 2: `advanced/advanced-settings-group`, `pro-features/agent-behaviour-section`, `license/license-status-card`. Inside `CH/`, untouched: `PA/go-vet-consent-config.component.ts`, `PA/host-routing-setting.component.ts`, `PA/lane-rotation-setting.component.ts`, `PA/local-stt-panel.component.ts`, `PA/local-tts-panel.component.ts`, `PA/session-budget-settings.component.ts`, `PA/voice-config.component.ts`, `PA/web-search-config.component.ts` | Unchanged by default: every new input defaults to today's rendering and the empty `[action]` slot renders nothing. Only the 3 Phase 2 callers opt in (decision 29) |
| `PtahSettingsLayoutComponent` (`icon`, mark `title`, padding owner) | `WV/src/app/ui-gallery/gallery-patterns-family.component.ts` | Nothing (optional input). The padding move keeps the same total inset below 640px |
| `ptah-tokens.css` (+3 tokens) | all | Nothing (additive). `UI/tokens/ptah-tokens.spec.ts` may list tokens: update it |
| `styles.css` scoped rule | Settings pages only (`.settings-page`) | Settings content cards with glass on get 1.25rem on every side. The 14 Settings components that already set 1.25rem see no change |

Other hosts: the VS Code webview uses the same `ptah-extension-webview` renderer build, so it compiles with the same code.
No VS Code or TUI feature work is planned.

### Tests

Existing specs to update (Phase 1):
- `UI/native/shared/floating-ui.service.spec.ts` (465 lines): add tests. No existing test should break (default unchanged).
- `UI/native/popover/native-popover.component.spec.ts` (711 lines): tests that assert the exact options passed to a
  mocked `FloatingUIService.position` will now see `capHeight: true`. Update those `toHaveBeenCalledWith` objects
  (search `position` / `shiftCrossAxis` in the spec).
- `UI/native/modal/native-modal.component.spec.ts` (357 lines): add the shell tests below.
- `UI/native/drawer/native-drawer.component.spec.ts`: a test that reads the `×` text breaks. Assert the `svg` instead.
- `UI/patterns/setting-row/setting-row.component.spec.ts`, `UI/patterns/form-section/form-section.component.spec.ts`,
  `UI/patterns/settings-layout/settings-layout.component.spec.ts`: class-string assertions may break; update them.
- `UI/tokens/ptah-tokens.spec.ts`: add the 3 tokens if it lists token names.
- Opt-out callers: `session-filter-bar.component.spec.ts`, `draft-comments-bar.component.spec.ts`,
  `harness-health-badge.component.spec.ts`, `PR/main-agent-reassign-popover.component.spec.ts`,
  `PR/decision-model-row.component.spec.ts`: no change expected. Run them to prove it.

No test id changes in Phase 1.

New tests:
| Test | File |
|---|---|
| `capHeight: true` adds `size()` and `flip` with `fallbackStrategy: 'bestFit'`; `apply` writes `min(var(--ptah-popover-max-h), Npx)` with N >= 128 | `floating-ui.service.spec.ts` |
| no `capHeight` keeps the 3-item middleware list (regression for dropdown/autocomplete) | `floating-ui.service.spec.ts` |
| popover passes `capHeight: true` by default and `false` with `[capToViewport]="false"`; panel has `ptah-popover-capped` only when on | `native-popover.component.spec.ts` |
| modal `layout="shell"`: box has the cap class, body wrapper scrolls, header/footer wrappers have borders; Tab wrap still cycles first↔last control across header, body and footer | `native-modal.component.spec.ts` |
| modal `layout` default: wrappers are `display: contents` (computed style or class) | `native-modal.component.spec.ts` |
| drawer close renders an `svg` icon, keeps `aria-label="Close panel"` and emits `closed` | `native-drawer.component.spec.ts` |
| form-section renders the icon before the heading only when `icon` is set | `form-section.component.spec.ts` |
| setting-row `[action]` slot renders before the control; `hintElementId` sets the hint `id`; empty action slot is hidden | `setting-row.component.spec.ts` |
| setting-row defaults: no `justify-end`, no first/last padding trim (today's classes); `controlAlign="end"` adds `justify-end`; `edgePadding="trim"` adds the first/last rule | `setting-row.component.spec.ts` |
| settings-layout renders the header icon; the state mark has `title` equal to its label | `settings-layout.component.spec.ts` |

### Batches

Checks below are run from the worktree root. Lanes do not run `npm run verify` or `nx`.

#### B1.1 Tokens and card inset rule
- Write set (3 files, 2 projects `@ptah-extension/ui`, `ptah-extension-webview`):
  `libs/frontend/ui/src/lib/tokens/ptah-tokens.css`, `libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts`,
  `apps/ptah-extension-webview/src/styles.css`.
- Read set: `ptah-tokens.css:20-35,410-430,495-535`; `styles.css:3220-3250`; `CH/settings.component.ts:150-158`.
- Depends on: none.
- Acceptance: 3 tokens exist with the values of 1.1; `--ptah-surface-pad` and `--ptah-card-padding-lg` unchanged; the
  scoped rule exists once; no other rule in `styles.css` changes.
- Checks:
  `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts`
  `npx eslint libs/frontend/ui/src/lib/tokens/ptah-tokens.spec.ts`

#### B1.2 Popover cap
- Write set (4 files, `@ptah-extension/ui`): `UI/native/shared/floating-ui.service.ts`, `UI/native/shared/floating-ui.service.spec.ts`,
  `UI/native/popover/native-popover.component.ts`, `UI/native/popover/native-popover.component.spec.ts`.
- Read set: `floating-ui.service.ts:1-252`; `native-popover.component.ts:80-160,190-220,355-410`; `ui-review-advanced.md` row F10.
- Depends on: B1.1 (token `--ptah-popover-max-h`).
- Acceptance: 1.3 contract; with `capToViewport=false` the computed middleware equals today's; at 800x600 a 40rem tall
  test panel gets `max-height` <= viewport - 16px and scrolls. Clipping check (`overflow-y: auto` clips paint outside the
  panel box): the coordinator opens in Electron the New Session popover (`app-shell.component.html:258-262`, projected card
  with `shadow-lg`), the canvas rail card popovers (`canvas-rail-card.component.ts`) and the send-to-messaging picker; if a
  shadow or ring is cut, move it inside the panel padding or give that caller `[capToViewport]="false"`.
- Checks:
  `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/native/shared/floating-ui.service.spec.ts libs/frontend/ui/src/lib/native/popover/native-popover.component.spec.ts`
  `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json`
  `npx eslint libs/frontend/ui/src/lib/native/shared/floating-ui.service.ts libs/frontend/ui/src/lib/native/shared/floating-ui.service.spec.ts libs/frontend/ui/src/lib/native/popover/native-popover.component.ts libs/frontend/ui/src/lib/native/popover/native-popover.component.spec.ts`

#### B1.3 Modal shell and drawer icon
- Write set (4 files, `@ptah-extension/ui`): `UI/native/modal/native-modal.component.ts`, `.../native-modal.component.spec.ts`,
  `UI/native/drawer/native-drawer.component.ts`, `.../native-drawer.component.spec.ts`.
- Read set: `native-modal.component.ts:1-220`; `native-drawer.component.ts:80-120,205-230`; `UI/button/tooltip.directive.ts:1-40`.
- Depends on: B1.1 (token `--ptah-modal-max-h`).
- Acceptance: 1.4 and 1.5 contracts; the 5 non-Settings modal callers render unchanged (visual check of
  `task-create-dialog` in Electron by the coordinator).
- Checks: `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts libs/frontend/ui/src/lib/native/drawer/native-drawer.component.spec.ts`;
  `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json`; `npx eslint <the 4 files>`.

#### B1.4 Patterns: form-section, setting-row, settings-layout
- Write set (6 files, `@ptah-extension/ui`): `UI/patterns/form-section/form-section.component.ts` + `.spec.ts`,
  `UI/patterns/setting-row/setting-row.component.ts` + `.spec.ts`, `UI/patterns/settings-layout/settings-layout.component.ts` + `.spec.ts`.
- Read set: `form-section.component.ts:1-157`; `setting-row.component.ts:1-71`; `settings-layout.component.ts:28-70,130-256`;
  `ui-review-advanced.md` rows F3, F4, F9, F22, F35, F37, F40.
- Depends on: none.
- Acceptance: 1.6-1.8 contracts; with default inputs a `ptah-setting-row` renders the same DOM classes as today
  (a spec asserts it), so the 8 untouched Settings callers and `cron-job-form` do not change.
- Checks: `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/patterns/form-section/form-section.component.spec.ts libs/frontend/ui/src/lib/patterns/setting-row/setting-row.component.spec.ts libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts`;
  `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json`; `npx eslint <the 6 files>`.

#### B1.5 Popover opt-outs (chat, git-ui)
- Write set (4 files, 2 projects `@ptah-extension/chat`, `@ptah-extension/git-ui`): `session-filter-bar.component.ts`,
  `PR/main-agent-reassign-popover.component.html`, `PR/decision-model-row.component.html`,
  `libs/frontend/git-ui/src/lib/review-canvas/draft-comments-bar.component.ts`.
- Read set: the `<ptah-native-popover` element of each file (grep).
- Depends on: B1.2.
- Acceptance: each element has `[capToViewport]="false"`; nothing else changes.
- Checks: `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.spec.ts libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.spec.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.spec.ts`;
  `npx jest --config libs/frontend/git-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/git-ui/src/lib/review-canvas/draft-comments-bar.component.spec.ts`;
  `npx eslint <the 2 .ts files>`.

#### B1.6 Popover opt-out (marketplace)
- Write set (1 file, `@ptah-extension/marketplace`): `libs/frontend/marketplace/src/lib/harness/harness-health-badge.component.ts`.
- Depends on: B1.2. Acceptance and checks as B1.5 (`libs/frontend/marketplace/jest.config.ts`, its spec).

Typecheck rule (decision 29), checked for every Phase 1 batch: each batch only adds optional inputs, options or slots;
no batch removes or renames an API, so `tsc` and the template typecheck stay green after each batch in any order
that respects the stated dependencies.

Coordinator gate for Phase 1: `npm run verify -- -p @ptah-extension/ui,@ptah-extension/chat,@ptah-extension/git-ui,@ptah-extension/marketplace,ptah-extension-webview`
and `npm run verify -- -t typecheck-templates -p ptah-extension-webview`.

---

## Phase 2: Advanced page and Claude Code tools & skills

All files are in `@ptah-extension/chat`. Depends on Phase 1 (merged to `main` first). Spec sections: "Advanced",
"Claude Code tools & skills", "Section pattern", "Row pattern", "Control rule", "Icon map", "Unchanged capabilities (keep)".

### Components

#### 2.1 Settings shell — `CH/settings.component.ts`, `CH/settings.component.html` (F2, F8, F34, F35, F36, F37, F40; A-32, A-33)
- `settingsTabs` (line 169) becomes `readonly settingsTabs = computed(() => [...])`. The `pro-features` entry gets
  `stateMark: { tone: 'warn', label: 'Membership needs attention' }` when `inject(ChatStore).licenseStatus()?.reason` is set
  (same source as `license-status-card.component.ts:460`). Update the 2 readers (`:200`, `:225`) and the template binding
  `[tabs]="settingsTabs()"`.
- NEW `readonly activeTabIcon = computed(() => this.settingsTabs().find(t => t.id === this.selectedSettingsTab())?.icon ?? null)`;
  template `[icon]="activeTabIcon()"` on `ptah-settings-layout` (Phase 1 input).
- `.settings-page` (html:1) gets `[scrollbar-gutter:stable_both-edges]` (F37). Nav title `h2` (html:18) keeps its tag (F39 keep).
  F34: the Back button and the title use the same inset `--ptah-settings-nav-px` (html:13-18).
- F8: html:132 class `[[data-glass=on]_&]:gap-[var(--ptah-gap-section)]` becomes `gap-[var(--ptah-gap-section)]`.
- F2: delete `style="padding: 0"` (html:146) and the scoped rule `settings.component.ts:154-157` (the global scoped rule
  of B1.1 now gives the inset). The Setup section (A-32) adopts `icon` (`Play`/`RefreshCw` labelled buttons per
  "Unchanged capabilities"): `Run onboarding again` gets `Play`, `Check Claude Code` gets `RefreshCw`. Keep test ids
  `settings-setup`, `settings-run-onboarding-again`, `settings-check-claude-code`, `settings-back`, `settings-tabs`.

#### 2.2 Advanced page container — `CH/advanced-settings.component.ts` (F8, F18, F38; A-1, A-2, A-3)
- F8: the `[data-advanced-sections]` div (line ~98) gets `gap-[var(--ptah-gap-section)]`; delete the style block
  `:host-context([data-glass='on']) [data-advanced-sections]` (lines ~212-217).
- F18: Export button gets `Download` icon + label "Export settings"; Import gets `Upload` + "Import settings" (lines ~132-154).
  Keep the aria-labels equal to the visible labels (`ADV.spec:296` asserts "keeps the Export settings aria-label").
- F38: one container rule on `[data-advanced-sections]`:
  `@container (min-width: 1400px) { [data-advanced-sections] { --ptah-settings-content-max-w: 56rem; } }` (the wide
  fields column reads this variable through `WIDE_CLASS`). The host must be a size container: it is inside
  `ptah-settings-layout` main (`[container-type:inline-size]` host), so the rule uses that container.
- Fine-tuning section (A-30): `<section data-glass-surface="content" data-testid="fine-tuning-section">` keeps its markup;
  its `ptah-form-section` gets `[icon]="SlidersIcon"`.
- Keep: `exportSettings` (:271-285), `requestImport`/`cancelImport` (:288-302), `importSettings` (:310-357), import inline
  confirm (A-3, test id `import-confirm`), overview band (A-1, `advanced-overview`), output `modelChanged`, `@defer (on viewport)`
  bodies of Fine-tuning (`fine-tuning-*` ids).

#### 2.3 Membership & data — `CH/license/license-status-card.component.ts` (F5, F6, F11, F23, F25; A-4..A-10, M-8, M-9)
- `ptah-form-section` (line 102) gets `[icon]="KeyIcon"`. Aside (`[aside]` slot): plan badge (`Layers` Community /
  `Sparkles` Builder) and state badge (`CircleCheck` active / `TriangleAlert` needs attention / `CircleAlert` inactive),
  with `ptah-status` kept for the text. The `Plan` and `State` description-list items (lines ~135-150) are removed (M-8);
  the `Account` item (name, email; A-5) stays.
- Fields: 3 `ptah-setting-row` rows, each with `controlAlign="end" edgePadding="trim"` (decision 29) (non-premium): "Membership key" (hint = the former "Membership Key Not Active"
  alert copy when `licenseReason()` is set, else the normal hint; control = the single `KeyRound` "Enter membership key"
  trigger of the existing popover, `data-testid="membership-key-trigger"`), "Settings backup" (projects the
  `[membership-actions]` content of `advanced-settings.component.ts` — Export / Import / import confirm), "Ptah Builders"
  (ghost "Explore Ptah Builders" + the one primary "Create account").
  Premium: Account rows + "Manage Membership" (`ExternalLink`, `openPricing` :607-610, A-6) + Log out (`LogOut`, inline
  confirm, A-9) + "Settings backup" row. No "Enter membership key" row in the premium state, as today.
- M-9: the alert "Re-enter Membership Key" (lines 343-371) is removed; its copy moves to the row hint and its action is the
  same trigger. The popover (A-7, lines 170-300) keeps: `role="dialog"`, show/hide, format check, Enter submits,
  `submitLicenseKey` (:526-560), drafts dropped on close, `w-80`, header with `X`. It now gets the Phase 1 cap by default.
- Keep handlers `:505-524` (open/close), `:562-600` (log out), overview report (`LIC.spec:293,:304`).
- Test ids that change: none removed apart from the alert's container. Spec `LIC.spec:190` "shows the key-not-active alert
  with verbatim copy and opens the popover from it" is rewritten to assert the same verbatim copy in the row hint and
  the popover opening from `membership-key-trigger`.

#### 2.4 Agent behaviour — `CH/pro-features/agent-behaviour-section.component.ts` (F3, F4, F9, F19; A-11..A-16)
- `ptah-form-section` (line 132) gets `[icon]="BotIcon"`.
- Each of the 4 rows (lines 160, 212, 253, 286): set `controlAlign="end" edgePadding="trim"` (decision 29); remove the row class
  `[border-bottom:...] last:[border-bottom:0]` (F3); move the note from the `[status]` span to `hint`, with
  `hintElementId="agent-behaviour-<row>-note"` so the ids stay (`agent-behaviour-prompt-note`, `-ultracode-note`,
  `-workflows-note`, `-effort-note`) (F9; Phase 1 input); remove `truncate`/`basis-full`.
- Control column: drop the `w-56 justify-start` wrapper for toggles; put "System prompt details" (`PanelRightOpen`,
  `ptahIconButton`, label "System prompt details", `drawerOpen.set(true)` :200, A-13) and the Ultracode `Info` popover
  trigger (A-14, `ultracodeInfoOpen` :246) in the `[action]` slot; the toggle is the default slot. The effort select stays
  `w-56` (A-16, disabled while Ultracode is on, :312).
- Keep: `onPromptModeChange` :445, `onUltracodeChange` :485, `writeUltracode` :590, `onWorkflowsChange` :473,
  `selectEffort` :458, load error + Retry (A-11, :140-157), sr-only status (`agent-behaviour-prompt-status`).

#### 2.5 Output style — `CH/output-style/output-style-config.component.ts`, `output-style-list.component.ts` (F7, F20, F21; A-18, A-19, A-34, A-35)
- Config (lines 64-81): the hand-built `<section>` header becomes `<section data-glass-surface="content" data-testid="output-style-card">`
  wrapping `<ptah-form-section [level]="2" heading="Output style" [wide]="true" [icon]="PaletteIcon">`. "New style" moves to the
  aside `[aside]` slot, `variant="secondary"`, `Plus` + label (F21). Keep `#newStyleButton`, `data-testid="output-style-new-button"`,
  `aria-label="Create new output style"`, `onCreate` (:76-81), focus return (`OSC.spec:283`), `@defer (when view() === 'editor')`.
  Keep `id="output-style-heading"`: pass it through (the form-section heading has its own id) — the section uses
  `aria-labelledby` = the form-section `headingId`; check `OSC.spec` for `#output-style-heading` and update the query if present.
- List (line 216 Preview, 238-262 Edit/Delete): built-in "Preview" becomes icon-only `Eye` `ptahIconButton` label
  "Preview {name}"; user styles keep `Pencil` "Edit {name}" and `Trash2` "Delete {name}" icon-only, same size. Keep the
  radiogroup, same-selection guard, shadowed rows, delete inline confirm (Esc returns focus), help popover, invalid files +
  rewrite (A-18). Notices and parity section (A-34, A-35) do not change in this task (no batch writes them).

#### 2.6 Output style editor — `CH/output-style/output-style-editor.component.ts`, `output-style-instructions-field.component.ts` (F14, F15; A-20)
- Editor, position: move the discard, conflict and stale-file confirms from before the form (lines 144-210) to after the
  closing `</form>` (:325), inside the drawer body `div` and before the projected `drawer-footer` (:328). Strip classes:
  `sticky bottom-0 z-[var(--ptah-z-raised)] border-t bg-surface-2 p-3`. Each confirm keeps `role="alertdialog"`, its
  `aria-label`, its local `(keydown.escape)` handler (`keepEditing($event)` :147, `dismissConflict($event)` :159, :171),
  `#safeChoice` and the focus effect (:497-502). ADD `aria-modal="false"` (the attribute does not exist today).
- Editor, parity (A-20): keep the test ids `output-style-discard-confirm`, `output-style-discard-button`,
  `output-style-conflict-dialog`, `output-style-stale-dialog`, `output-style-stale-discard-reload`,
  `output-style-stale-overwrite`, `output-style-stale-reload`, and every variant with its actions: discard (Discard changes /
  Keep editing); conflict (Replace it / Keep both); stale with `fresh === null` (Close only, :172-180); stale with
  `confirmingReload` (Discard and reload / Back, :181-190); stale default (Overwrite / Reload / Cancel, :191-206).
- Editor, NEW confirm-state guards (no guard exists today: the footer :329-351 has none and `submit` :549-556 checks only
  validation):
  ```ts
  protected readonly confirmOpen = computed(
    () => this.confirmingDiscard() || this.conflict() !== null || this.stale() !== null,
  );
  ```
  - Save (`output-style-save-button`) and Cancel (`output-style-cancel-button`) get `[disabled]="confirmOpen()"`.
  - `submit()` returns immediately after `event?.preventDefault()` when `confirmOpen()` is true. This covers Enter in a form
    field and the `form="output-style-editor-form"` submit. `confirmOverwrite()` and `overwriteStale()` call `persist`
    directly, so the confirm actions still save.
  - `requestClose()` (:505-518): the first branch becomes `if (this.confirmOpen())` → focus `#safeChoice` and return. Esc on
    the drawer, the backdrop and the header close button then keep an open conflict or stale prompt (today a dirty draft
    replaces it with the discard prompt). The user answers the open prompt first. This is the one intended behaviour change.
- Instructions field (lines 86, 101-109): textarea `min-h-32 max-h-[50dvh] resize-y [field-sizing:content]`; preview
  `max-h-[min(16rem,40dvh)] overflow-y-auto`.

#### 2.7 System prompt drawer — `CH/pro-features/system-prompt-drawer.component.ts` (F12, F24, F41; A-17)
- Footer (lines 323-325) `px-5 py-3`; error, status and metadata boxes `p-3`; preview box `max-h-[min(24rem,50dvh)]`.
- F41: replace the 8 mojibake sequences (`â€”` → `—`, `â€¦` → `…`): template lines 168, 192, 248, 293, 347, 373, the doc
  comment at :69 and the live subtitle string at :477 (`grep -n 'â€'` lists the 8).
- F24: `FileText` (NEW `FileTextIcon`) only on the empty-state icon binding at :309. The header (:103) and the preview
  control (:273) keep `SparklesIcon`.
- Keep every handler: `loadStatus` :515, regenerate :537-571, `checkRegenerate` :573, download :598, preview, close.

#### 2.8 Other sections — `CH/pro-features/mcp-port-config.component.ts`, `CH/pro-features/vscode-lm-config.component.ts`, `CH/advanced/codex-sandbox-setting.component.ts`, `CH/advanced/advanced-settings-group.component.ts` (F1, F22; A-21, A-29, A-30, A-31)
- MCP & Browser: `[icon]="PlugIcon"` on its `ptah-form-section` (`mcp-port-config.component.ts:89`).
- VS Code LM: `[icon]="CpuIcon"` on the `ptah-form-section` (:41) and delete the `lucide-angular` `CpuIcon` of the provider
  header row (:52; the icon exists today, it only moves). Keep the sr-only `h2#vscode-lm-heading` with the provider name,
  the badges, `vscode-lm-set-default`, `vscode-lm-model-select` and `modelChanged` (:53-101, :144).
- Codex sandbox: the component has no `ptah-form-section` today (local `h3` + scope paragraph, :122-136; `imports` :113).
  Replace the header `div` (:122-136) with `<ptah-form-section [level]="3" wide heading="Codex sandbox"
  [icon]="ShieldCheckIcon">` around the rest of the body; add `PtahFormSectionComponent` to `imports` and `ShieldCheck`.
  The outer `<section>` keeps `data-glass-surface`, `data-testid="codex-sandbox-setting"` and
  `aria-labelledby="codex-sandbox-heading"`; a `<span class="sr-only" id="codex-sandbox-heading">Codex sandbox</span>`
  inside the form section keeps that id (same pattern as `advanced-settings-group.component.ts:180`). The scope paragraph
  stays the first child of the body with `id="codex-sandbox-scope"` and its test id (the radios use it in
  `aria-describedby`, :168; spec :116). It is not passed as `description`. Lines 138-291 (loading/error, radios, confirm,
  effective-policy panel) do not change.
- Advanced settings group: no icon. Its `ptah-form-section` (:179) renders only for `headingStyle="section"`, which is
  Context Management (`PA/orchestration-settings.component.ts:81-88`), a page outside this task. Fine-tuning passes
  `headingStyle="hidden"` (`advanced-settings.component.ts:193-197`); its visible Sliders icon is on the parent form
  section (2.2).
- Row opt-in, gated: the group also renders in the Codex drawer (`PR/connection-drawer/codex-agent-behavior.component.ts:14`)
  and in Context Management. NEW input `readonly rowLayout = input<'default' | 'aligned'>('default');`. Each
  `ptah-setting-row` binds `[controlAlign]="rowLayout() === 'aligned' ? 'end' : 'start'"` and
  `[edgePadding]="rowLayout() === 'aligned' ? 'trim' : 'all'"`. Only the Fine-tuning call site
  (`advanced-settings.component.ts:193`) sets `rowLayout="aligned"` (decision 29). The other 3 call sites do not change.
- Delete the per-component copies `:host-context([data-glass='on']) [data-glass-surface='content'] { padding: 1.25rem; }`
  at `codex-sandbox-setting.component.ts:301-303` and `advanced-settings-group.component.ts:381-383` (B1.1 rule covers them).
  `advanced-settings-group.component.ts:113` keeps `[attr.data-glass-surface]="contentSurface() ? 'content' : null"`.
- MCP (`mcp-port-config.component.ts:89`): the section has no padding copy; it gains the inset from B1.1.
- No behaviour change: port input, Save/Undo, caller access, namespaces, localhost confirm (A-21); Set as Default, model
  select (A-29); disclosures, `@defer (on viewport)`, toggles, number rows (A-30); sandbox radios, full-access confirm (A-31).

#### 2.9 Claude Code tools & skills — `CH/pro-features/claude-builtins-config.component.ts` + NEW `claude-builtins-group.component.ts` + NEW `claude-builtins-row.component.ts` (F26-F33; A-22..A-28; decision 9)
- NEW `CH/pro-features/claude-builtins-row.component.ts`, selector `ptah-claude-builtins-row` (F31, one row for tools and skills):
  ```ts
  export type BuiltinKind = 'tool' | 'skill';           // NEW export here; B2.8 deletes the local copy at config :58 and imports it
  readonly kind = input.required<BuiltinKind>();
  readonly itemId = input.required<string>();
  readonly name = input.required<string>();
  readonly description = input<string | null>(null);
  readonly tokens = input.required<string>();          // pre-formatted by the parent's cost()
  readonly on = input.required<boolean>();
  readonly disabled = input(false);
  readonly blockedReason = input<string | null>(null); // "ReportFindings is off" chip, aria-describedby
  readonly toggled = output<Event>();
  ```
  Markup: `<input type="checkbox" ptahToggle role="switch">` (F32: a switch, still a checkbox element so `.checked` and the
  `change` event stay), `data-testid` = `settings-toggle-claude-<kind>-<id>` (kept), name `font-medium truncate`, token chip
  `shrink-0`, warn chip with `data-testid="claude-skill-dependency-<id>"` (kept), one-line description with `title`.
  Ids for `aria-labelledby` are derived from `kind` + `itemId` (F29 fix).
- NEW `CH/pro-features/claude-builtins-group.component.ts`, selector `ptah-claude-builtins-group`:
  ```ts
  export type BuiltinGroupId = 'tools' | 'terminal' | 'synced';
  readonly groupId = input.required<BuiltinGroupId>();
  readonly heading = input.required<string>();
  readonly icon = input.required<LucideIconData>();
  readonly badge = input<string | null>(null);          // "Hidden by default" on synced
  readonly onCount = input.required<number>();
  readonly total = input.required<number>();
  readonly tokens = input.required<string>();
  readonly expanded = input.required<boolean>();
  readonly switchState = input.required<'on' | 'off' | 'mixed'>();
  readonly switchLabel = input.required<string>();      // "Turn on all X" / "... N shown"
  readonly busy = input(false);                          // aria-disabled="true", clicks ignored
  readonly expandedChange = output<boolean>();
  readonly groupToggled = output<boolean>();             // the requested new state
  ```
  Header: disclosure `button` (`aria-expanded`, `aria-controls`, Enter/Space), badge, "n/N on · ~tokens", group switch
  (`role="switch"`, `aria-checked` true/false/mixed). Body: default content slot (the rows), two columns at container
  >= 704px (`[@container(min-width:704px)]:grid-cols-2`), no `overflow-x-auto` (F30).
- Config component changes:
  - Section: `ptah-form-section [level]="2" [wide]="true" [icon]="WrenchIcon"`; remove the sr-only `h2` and
    `aria-labelledby="claude-tools-heading"` (F29). One `ptah-alert tone="info"` replaces the 4 explanation blocks (F28) and
    keeps the "applies to new sessions" text with `data-testid="claude-tools-applies-note"` (A-26).
  - Sticky summary bar at the top of the fields column (F27):
    `sticky top-0 z-[var(--ptah-z-raised)]` — valid because F37 (B1.4 + B2.1) lands first. Content: `Zap` "Saved per turn
    ~N tokens" (keep `data-testid="claude-tools-savings"` and `aria-live="polite"`, A-25), "x of N on", filter input (`Search`
    icon, `X` clear, NEW `data-testid="claude-tools-filter"`, `claude-tools-filter-clear`).
  - NEW state: `filter = signal('')`, `expanded = signal<Record<BuiltinGroupId, boolean>>({ tools: true, terminal: false, synced: false })`,
    `groupProgress = signal<{ done: number; total: number } | null>(null)`; computeds `visibleTools`, `visibleTerminal`,
    `visibleSynced` (case-insensitive match on name and description), `groupSwitchState(group)`. A non-empty filter expands
    groups with matches and hides groups with none; no match shows "No match" + Clear (`Inbox`).
  - NEW method `async toggleGroup(group: BuiltinGroupId, on: boolean): Promise<void>` (decision 9, A-28): ids = visible rows
    of the group whose state differs from `on`. One `this.feedback.saveGeneric({ label, write, undo })` call:
    `write` runs the existing private `saveItem(kind, id, on)` (`agent:setClaudeBuiltin`) for each id in sequence, updates
    `groupProgress` ("Saving i of n", in a `role="status"` live region), and returns `{ ok: true }` or
    `{ ok: false, message: '<k> of <n> changes were not saved.' }`; `undo` runs `saveItem(kind, id, !on)` in sequence for
    the ids that saved. Failed rows keep their old state because `saveItem` already re-reads the stored lists on failure.
    The `saving()` guard (`feedback.saving`) refuses a second toggle while the group runs (as `toggle` does today).
    `label` = `"<group heading> (<n> turned <on|off>)"`, so the success toast reads "Saved Built-in tools (6 turned on)." (D-8).
  - States (A-22, A-26, A-27): loading skeleton = 3 group headers + 4 rows, `aria-busy="true"`, keep
    `data-testid="claude-tools-skeleton-row"`; load error = `ptah-alert` error + Retry (`RotateCcw`), `role="alert"`, no
    switch shown, keep `claude-tools-load-error`, `claude-tools-load-retry`; unverified policy = separate error alert +
    Retry, rows read-only; synced empty = `Inbox` + text, keep `claude-tools-synced-empty`.
  - Keep: `toggle(kind, id, event, name)` :376-401 unchanged (single toggle with Undo, focus kept after a failed write via
    `keepFocus` :454-464), `load` :348, `read`, `apply`, `cost` :353, `skillName` :366, `isDependencyBlocked` :371,
    `hiddenTokens`, `savingsLabel`, overview report (`CB.spec:623`).

### Blast radius

Phase 2 changes no exported symbol outside `CH/`. `AgentOrchestrationConfigComponent` (exported from `CH/index.ts:11`) is
not touched in Phase 2. `BuiltinKind` becomes exported from the NEW row file; it was a file-local type.
`settingsTabs` changes from an array to a `computed`: its only readers are `settings.component.ts:200,225` and
`settings.component.html`; `settings.component.spec.ts` must call `settingsTabs()` if it reads it (grep shows no use).

### Tests

Existing specs that break and how to update them:
| Spec | Expected break | Update |
|---|---|---|
| `CH/settings.component.spec.ts` | assertions on the Setup `style="padding: 0"` or tab list shape | assert the icon and the state mark instead |
| `CH/advanced-settings.component.spec.ts` (`ADV.spec`) | `:296` aria-label stays; button text now includes an icon | use `textContent.trim()` |
| `CH/license/license-status-card.component.spec.ts` (`LIC.spec`) | `:190` alert test; `:146`,`:165`,`:182` badge tests that read the Plan/State `dl` items | move assertions to the aside badges and the row hint |
| `CH/pro-features/agent-behaviour-section.component.spec.ts` (`AB.spec`) | ids stay (hintElementId); `:653` Details button query by text "Details" | query `[aria-label="System prompt details"]` |
| `CH/output-style/output-style-config.component.spec.ts` (`OSC.spec`) | header markup, `#output-style-heading` | query the form-section heading |
| `CH/output-style/output-style-list.component.spec.ts` (`OSL.spec`) | Preview button text | query by aria-label "Preview {name}" |
| `CH/output-style/output-style-editor.component.spec.ts` (`OSE.spec`) | none: `:438`, `:545`, `:578-594` query by test id and check focus; there is no DOM-order assertion | keep the ids and focus assertions; add: confirm renders after the form; `aria-modal="false"`; Save and Cancel are disabled for each of the 3 confirms; `submit()` writes nothing while a confirm is open; Esc on the drawer keeps an open conflict or stale prompt; stale `Back` returns to the 3-button variant |
| `CH/pro-features/system-prompt-drawer.component.spec.ts` (`SPD.spec`) | none (the spec has no `â€` match) | add: the loading subtitle is "Loading system prompt…" and the empty status value is "—" |
| `CH/pro-features/claude-builtins-config.component.spec.ts` (`CB.spec`) | group headings (`h3` per group), the sr-only `h2`, checkbox class queries; toggle ids stay | query group headers by `button[aria-expanded]`; open a collapsed group before querying its rows |
| `CH/pro-features/mcp-port-config.component.spec.ts`, `CH/pro-features/vscode-lm-config.component.spec.ts` | none expected (icon only; VS Code LM icon moves to the heading) | run them; fix a failing icon query in B2.6 |
| `CH/advanced/codex-sandbox-setting.component.spec.ts` | a query on the local `h3` if one exists; `:116` scope text stays | query the form-section heading; assert `#codex-sandbox-heading` and `codex-sandbox-scope` still resolve |
| `CH/advanced/advanced-settings-group.component.spec.ts` | none (default `rowLayout`) | add: default renders today's row classes; `rowLayout="aligned"` sets `justify-end` |

Test ids that change in Phase 2: removed — the key-not-active alert container (if it had a test id; `LIC.spec:190` targets it
by copy). NEW — `claude-tools-filter`, `claude-tools-filter-clear`, `claude-tools-group-<groupId>`,
`claude-tools-group-switch-<groupId>`, `claude-tools-group-progress`. All other ids listed in 2.1-2.9 stay.

New tests (each batch adds the tests for the code it changes; rows with `none today` in the parity inventory get a test):
| Capability | New test | Spec file |
|---|---|---|
| A-6 Manage Membership (`none today`) | premium state: the button runs `command:execute` `ptah.openPricing` | `LIC.spec` |
| A-8 Explore / Create account (count only today) | each button runs its command; "Create account" is the only primary | `LIC.spec` |
| M-9 one key action | non-premium with `licenseReason`: exactly one "Enter membership key" control; hint shows the verbatim alert copy | `LIC.spec` |
| A-14 Ultracode info popover (`none today`) | the `[action]` slot Info button opens and closes the popover; Esc returns focus | `AB.spec` |
| A-19 New style click (`none today`) | click opens the editor; disabled while saving | `OSC.spec` |
| F36 state mark | Advanced nav item shows the mark with `title` when `licenseStatus().reason` is set | `CH/settings.component.spec.ts` |
| A-32 Setup buttons (`not verified`) | Run onboarding again / Check Claude Code call their handlers; Check is Electron-only | `CH/settings.component.spec.ts` |
| A-28 group switch (`none (new)`) | runs `agent:setClaudeBuiltin` once per differing visible id, in order; one toast; "Saving i of n" status; partial failure toast "k of n ..." and failed rows keep their state; switch is `aria-disabled` while saving and ignores clicks | `CB.spec` |
| A-28 filter | filter hides non-matching rows and empty groups, auto-expands matches, "No match" + Clear restores; group switch label "... N shown" acts on visible rows only | `CB.spec` |
| F31/F32 row | NEW `claude-builtins-row.component.spec.ts`: role switch, `aria-labelledby` resolves to the name, dependency chip `aria-describedby`, emits `toggled` | NEW spec |
| group header | NEW `claude-builtins-group.component.spec.ts`: Enter/Space toggles `aria-expanded`; `aria-checked="mixed"`; `busy` sets `aria-disabled` and drops clicks | NEW spec |

### Batches

All write sets are in `@ptah-extension/chat`. Every batch with a template change needs the coordinator run
`npm run verify -- -t typecheck-templates -p ptah-extension-webview`. Typecheck command for lanes:
`npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`. Jest config: `libs/frontend/chat/jest.config.ts`.

| Batch | Write set (files) | Read set | Depends on | Acceptance |
|---|---|---|---|---|
| B2.1 Shell and page container | `CH/settings.component.ts`, `CH/settings.component.html`, `CH/settings.component.spec.ts`, `CH/advanced-settings.component.ts`, `CH/advanced-settings.component.spec.ts` (5) | `settings.component.ts:140-230`, `settings.component.html:1-60,125-170`, `advanced-settings.component.ts:90-160,205-300`, `UI/patterns/settings-layout/settings-layout.component.ts:130-256` | Phase 1 | 2.1 + 2.2; no horizontal scroll at 800x600 with nav; Advanced sections gap 2rem with glass off |
| B2.2 Membership & data | `CH/license/license-status-card.component.ts`, `CH/license/license-status-card.component.spec.ts` (2) | `license-status-card.component.ts:95-400,455-620`; `advanced-settings.component.ts:110-160` | B2.1 (the `[membership-actions]` content moves into the "Settings backup" row; both files must agree) | 2.3; A-4..A-10 tests pass; new A-6, A-8, M-9 tests |
| B2.3 Agent behaviour | `CH/pro-features/agent-behaviour-section.component.ts`, `.spec.ts` (2) | `agent-behaviour-section.component.ts:120-330,440-597` | Phase 1 | 2.4; toggles share one right edge; last row has no divider |
| B2.4 Output style card and list | `CH/output-style/output-style-config.component.ts`, `.spec.ts`, `CH/output-style/output-style-list.component.ts`, `.spec.ts` (4) | `output-style-config.component.ts:55-130`, `output-style-list.component.ts:100-330` | Phase 1 | 2.5; new A-19 test |
| B2.5 Output style editor and system prompt drawer | `CH/output-style/output-style-editor.component.ts`, `.spec.ts`, `CH/output-style/output-style-instructions-field.component.ts`, `CH/pro-features/system-prompt-drawer.component.ts`, `.spec.ts` (5) | `output-style-editor.component.ts:90-355,495-560`, `OSE.spec:429-605`, `output-style-instructions-field.component.ts:80-115`, `system-prompt-drawer.component.ts:60-480` | Phase 1 | 2.6 + 2.7; the 2.6 guard tests pass; the dialog test ids and focus assertions are unchanged; `grep -c 'â€' system-prompt-drawer.component.ts` is 0 |
| B2.6 Other sections | `CH/pro-features/mcp-port-config.component.ts`, `CH/pro-features/vscode-lm-config.component.ts`, `CH/advanced/codex-sandbox-setting.component.ts`, `.spec.ts`, `CH/advanced/advanced-settings-group.component.ts`, `.spec.ts`, `CH/advanced-settings.component.ts` (only `rowLayout="aligned"` at :193) (7) | each file: the header markup and the `styles` block; `codex-sandbox-setting.component.ts:108-140`; `advanced-settings-group.component.ts:166-190,225-330` | B2.1 (shares `advanced-settings.component.ts`) | 2.8; the 4 specs pass; the Codex drawer and Context Management rows render as today |
| B2.7 Tools row and group components | NEW `CH/pro-features/claude-builtins-row.component.ts`, NEW `.spec.ts`, NEW `CH/pro-features/claude-builtins-group.component.ts`, NEW `.spec.ts` (4) | `claude-builtins-config.component.ts:55-280` | Phase 1 | 2.9 row and group contracts |
| B2.8 Tools config | `CH/pro-features/claude-builtins-config.component.ts`, `.spec.ts` (2) | `claude-builtins-config.component.ts:1-466`, B2.7 files | B2.1 (F37 sticky), B2.7 | 2.9 config; A-22..A-28 tests; sticky bar stays visible while the page scrolls |

Typecheck rule (decision 29), checked per Phase 2 batch: B2.1-B2.6 change only their own components and use only Phase 1
APIs (additive). B2.7 adds new files and does not touch the config, so `BuiltinKind` exists twice (local in the config,
exported from the row) until B2.8, which removes the local one in the same batch that starts to import the row. No Phase 2
batch removes an API that another file uses, so `tsc` and the template typecheck stay green after each batch.
Order: B2.1 → B2.2; B2.6 after B2.1 (it sets `rowLayout` in `advanced-settings.component.ts`); B2.3, B2.4, B2.5, B2.7 in
any order after Phase 1; B2.8 after B2.1 and B2.7. B2.6 adds the group input `rowLayout` and its one caller in the same batch.

Focused checks per batch (replace `<specs>` and `<files>` with the batch write set):
`npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`
`npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` (library code only: `tsconfig.lib.json:11` excludes `*.spec.ts`)
`npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` (spec files; Jest uses `isolatedModules`, so it does not report type errors)
`npx eslint <files>`

Coordinator gate for Phase 2: `npm run verify -- -p @ptah-extension/chat` and
`npm run verify -- -t typecheck-templates -p ptah-extension-webview`. Visual review in Electron at 800x600 (with nav),
1600x900, dark and light.

---

## Phase 3: Providers > Lanes and modals

Projects: `@ptah-extension/chat` (all components), `@ptah-extension/webview-e2e-harness` and `ptah-electron-e2e` (test ids
only, B3.12). Depends on Phase 1. Spec sections: "Providers > Lanes", "Modals", "Merged controls", "Proposed Removals".
Write path stays: `ProvidersSettingsStateService.saveSettings` through `SettingsSaveFeedbackService.save` →
`ptahCli:create|update|delete`, `agent:setConfig`, `provider:setModelTier`/`clearModelTier` (parity header). No new RPC
(decision 9).

### Components

#### 3.1 Modals on the shell — `PR/add-cli-instance-modal.component.html`, `PR/cli-tier-mapping-modal.component.html`, `PR/provider-catalog-modal.component.ts` (P1-P4; P-62, P-63, P-64)
- Each `<ptah-native-modal>` gets `layout="shell"`.
- Remove the negative-margin chrome: add-cli header `-mx-6 -mt-6 mb-4` (html:9) and footer `-mx-6 -mb-6 mt-5` (html:240);
  tier header (html:9) and footer (html:186) the same; catalog header `-mx-6 -mt-6 ... px-3 py-2.5` (ts:30) and body
  `-mx-3 max-h-[50vh]` (ts:42). The shell wrappers now give the padding, borders and the scroll.
- Header: icon + `h2` + Close (`ptahIconButton`, `X`, label "Close"). Footer: hint left, Cancel (ghost) + one primary right.
  The catalog modal has no footer today; it keeps none.
- Keep all contracts: add-cli `[open]`, `[editing]`, `(created)`, `(closed)`, `submit` :358, saves :385/:426, focus return
  through the matrix `closeAdd` :428 (P-62); tier `[open]`, `[target]`, `(closed)`, `loadModels` :215, `onPick` :233,
  `applyManual` :243, `retryMappings` :250, `useInherited` :264, `saveTier` :269 (P-63); catalog `[open]`, `(closed)`,
  search, test ids `provider-catalog-modal`, `provider-catalog-body` (P-64). The catalog hint popover (P-65,
  `PR/providers-settings.component.ts:278-306`) gets the Phase 1 cap with no edit.

#### 3.2 Behaviour-preserving split — `PA/lanes-table.component.html`, `.ts`, `.css`, NEW `PA/lane-model-effort-cell.component.ts`
- Move the `<ng-template #modelEffort>` (html:261-366, used in the row and in the detail) into NEW
  `ptah-lane-model-effort-cell`:
  ```ts
  readonly row = input.required<LaneTableRow>();
  readonly place = input.required<'cell' | 'detail'>();        // same union as the table's `openCell.place` (:157-161, :303-330)
  readonly openField = input<'model' | 'effort' | null>(null); // the table's isOpen(row, field, place)
  readonly interactive = input(true);
  readonly canWrite = input(true);
  readonly busy = input(false);
  readonly toggled = output<'model' | 'effort'>();
  readonly closed = output<void>();
  ```
  The table keeps `openCell` and the one-popover rule (P-36..P-39). Keep test ids `cli-matrix-model`, `lanes-effort-na`
  and every id inside the template.
- Remove the `(installGuideRequested)` binding on `ptah-lane-row-identity` (html:95-99). Its link is `display:none` today
  (`lanes-table.component.css:165-170`), so nothing visible changes; this frees B3.5 to delete the output (R-3, M-4).
- Spec migration in the same batch (specs are callers):
  - `lanes-table.component.spec.ts:93-99` and `lanes-table.visual.component.spec.ts:88-94`: the `overrideComponent` that
    swaps `CliModelEffortPopoverComponent` for the stub now targets `LaneModelEffortCellComponent` (the popover import
    moves there). The stub assertions (table `:272`, visual `:183`) then pass again.
  - `lanes-table.visual.component.spec.ts:569` "keeps recovery actions beside status and tier counts in details": lines
    601-606 click the hidden identity link and expect `installGuide`. Change the click target to the status-cell
    "Install guide" button (`install`, :578), which still calls `recover(row)` and emits `installGuide`. Lines 589-598
    (the link exists in the identity cell) stay until B3.5.
- No other change. Every other test passes unchanged.

#### 3.3 Reorder drag logic — NEW `PA/lane-order-drag.ts`, `PA/lane-order-list.component.ts` (decisions 14, 18; P-8, P-21)
- Move the drag and move logic of `lane-order-list.component.ts` (`moveUp`, `moveDown`, `startDrag`, `dragOver`, `drop`,
  `endDrag`, `settled`, `request`, `dropIndex`, `announcement`; lines ~170-263) into NEW plain class:
  ```ts
  export type LaneOrderDirection = 'up' | 'down';                 // moved unchanged from lane-order-list :27
  export interface LaneOrderMove { readonly order: string[]; readonly movedId: string; readonly direction: LaneOrderDirection }
  export class LaneOrderDrag {
    readonly dropIndex: Signal<number | null>;
    readonly announcement: Signal<string>;                     // "Codex moved to position 2"
    constructor(options: {
      ids: () => readonly string[];
      name: (id: string) => string;
      canReorder: () => boolean;
      move: (move: LaneOrderMove) => void;
    });
    moveUp(index: number): void; moveDown(index: number): void;
    startDrag(event: DragEvent, index: number): void; dragOver(event: DragEvent, index: number): void;
    drop(event: DragEvent): void; endDrag(): void;
    settled(id: string, direction: LaneOrderDirection, focus: (id: string, direction: LaneOrderDirection) => void): void;
  }
  ```
- `lane-order-list.component.ts` delegates to `LaneOrderDrag` (same template, same `policy-order-*` ids) and re-exports
  BOTH move types until B3.10: `export type { LaneOrderDirection, LaneOrderMove } from './lane-order-drag';`. Its callers
  import `LaneOrderMove` from the list file (`agent-orchestration-config.component.ts:26-30`,
  `lane-order-list.component.spec.ts:2-6`), so both keep compiling and the spec passes unchanged.

#### 3.4 Header controls extracted from the policy bar — NEW `PA/lanes-max-concurrent.component.ts`, NEW `PA/lanes-redetect-button.component.ts` (P-6, P-9, M-3)
- `ptah-lanes-max-concurrent`: the labelled number input (range 1-100, `input-sm w-20`, `Layers` icon, label
  "Max concurrent") and the handler moved from `agent-orchestration-config.component.ts:296-327` (`saveMaxConcurrent` →
  `state.saveSettings({ orchestration: { maxConcurrentAgents } })` with Undo → `agent:setConfig`). Keep test id
  `policy-max-concurrent-input`. No inputs; injects `ProvidersSettingsStateService`, `SettingsSaveFeedbackService`.
- `ptah-lanes-redetect-button`: icon-only `RefreshCw` `ptahIconButton` label "Re-detect CLIs", `Loader2` while busy,
  handler moved from `agent-orchestration-config.component.ts:329-345` (`state.redetectClis()` → `agent:detectClis`,
  announces "CLI agents re-detected." or the DETECT_FAILED alert). Input `readonly testId = input('policy-redetect')`.
  Used in the CLI group header (id `policy-redetect`) and in the Add more strip header (id `lanes-strip-redetect`).
- Until B3.10, `agent-orchestration-config` still renders its own copies; B3.10 deletes them.

#### 3.5 Row cells — `PA/lane-row-identity.component.ts`, `PA/lanes-table-status.component.ts`, `PA/cli-lane-default-cell.component.ts` (P17-P20, P27-P31; P-22..P-26, P-33..P-35, P-59)
- Identity: always two lines (line 2 = `versionLabel` for CLI, provider for Ptah, `--` when empty, P18, decision 7), also
  when collapsed; kind badge variants with COLOURED TEXT (decisions 16, 26; `design-spec.md:90`), outline style:
  `kind-cli` = text `info`, border `info/50`; `kind-ptah` = text in the warm gold accent, border at 55%. Gold token: the
  existing daisyUI `secondary` ("Pharaoh's Gold", `WV/tailwind.config.js:178` dark `#d4af37`; `:256` light
  `oklch(58% 0.132 75)`), the same token as the Ptah row accent bar (P24, 3.7). Each theme needs a text shade with
  contrast >= 4.5:1 on the card surface. Dark: `text-info` and `text-secondary` (prototype `#60a5fa` / `#d4af37`). Light:
  if `secondary` or `info` measures below 4.5:1 (the prototype uses `#8a6500` / `#1d4ed8`, darker than the theme values),
  use NEW variables `--ptah-kind-ptah-ink` / `--ptah-kind-cli-ink` (default = the theme token, light theme = the darker
  shade). They are defined in the component styles of `lane-row-identity.component.ts` (scoped to this badge, no global
  token), so B3.5 stays inside its write set. Never fall back to one colour for both kinds. Below 640px a status icon beside the name. Delete the hidden install
  link (:177-190) and the output `installGuideRequested` (R-3, U-3). Keep `ptah-provider-mark` and `ptah-lane-default-warning`.
- Status: icon + text (`CircleCheck` / `KeyRound` / `CircleDashed` / `CircleAlert` / `Loader2`), text `base-content`, icon
  carries the state colour (spec contrast rule). Keep `cli-matrix-runtime-status`, `cli-matrix-key-status`, the sr-only test
  text. `ptah-lane-default-warning` (:84-107) becomes a focusable `Info` `ptahIconButton` with tooltip and sr-only reason
  (P31, P-25). Delete the unused outputs `installGuide`/`signIn` (:59-60; not bound anywhere).
- Default cell: the reset control becomes icon-only `RotateCcw` with the value in the tooltip (P15, P16, P-59) in the
  `compact` and `reset` layouts. NEW layout value `'inline'` is NOT added (D-10). Today the template hides the saved reset
  when `layout === 'compact'` and `showCaption` is false (:230). Decouple it with a NEW input, default = today:
  `readonly resetVisibility = input<'auto' | 'always'>('auto');` — `'auto'` keeps the condition of :230; `'always'` shows
  the reset whenever `saved()` is set. The Ptah group header (3.7) sets `resetVisibility="always"`. Keep `requestReset`
  :612-622, yolo confirm :638-646, the required inputs `cli` and `name` (:422-423), outputs `selected`, `resetRequested`.

#### 3.6 Expanded detail — `PA/lanes-table-detail.component.html`, `.ts`, `.css`, `PA/cli-provider-card-popovers.component.ts` (decision 13, 19, 20, 23; P12-P14, P21; P-42..P-57, P-66)
- Two-column `dl` `grid-cols-[9rem_1fr]`. Left (not in the row). CLI: Provider (the row's line 2 shows the version, so
  Provider is not a repeat), Account (Claude, `ptah-claude-lane-account-cell`,
  P-44), Executable, Native behavior as inline text with a one-line clamp + More/Less (P13, P-43); Copilot: a labelled
  switch row "Auto-approve" that renders the existing `ptah-copilot-auto-approve-toggle` (decision 19, P-66; its write and
  Undo do not change). Ptah: Key status (`cli-matrix-key-status`), Tier models "n of 3 set" / "loading" + one line per
  tier (`cli-matrix-tier-summary`, P-45). The Ptah detail shows no Provider fact: the Ptah row's line 2 is the provider,
  so decision 13 forbids it here (today `lanes-table-detail.component.html:68-96` shows Provider for instances; delete it).
  Version is not in any detail (CLI line 2 shows it).
- Right: capability facts inline, icon + label + value (`MessageSquare` Messaging, `ShieldCheck` Permission modes,
  `Globe` Network, `Plug` MCP, `Gauge` Limit; P12, P-48), then `ptah-disclosure` "All capabilities" with
  `ptah-cli-capability-detail` (system) or the instance capability groups (P-50, P-53, decision 20). The disclosure host
  carries `data-lane-capabilities`; the detail sets its `[open]` model to true when `openKind() === 'capabilities'`.
  Delete `toggleChip`, `openChip`, the chips, the permission popover, the `infoKinds` field (:97-101) and its `@for` loop
  (html:160-201). In place of the loop render ONE install-only popover branch, `@if (!system.installed)`, with the same
  trigger (`data-popover-kind="install"`, "Install guide"), `[isOpen]="isOpen('install')"`,
  `(click)="kindToggled.emit('install')"` and `ptah-cli-provider-card-popovers kind="install"`. It stays for good: a
  keyless Cursor row is `installed: false` (`cli-matrix-rows.ts:363-366`) and keeps its install guide (U-5, U-6).
  Compatibility route until B3.7b removes the kebab "All capabilities": the kebab still calls
  `showDetail(row, 'capabilities')`, which now opens the inline disclosure; B3.6 changes the one selector in the matrix
  `showCapabilities` (:358-361) to `#lane-detail-<id> [data-lane-capabilities] button`. Keep `cli-provider-facts`,
  `cli-capability-summary`. The Install regression tests `lanes-table-detail.component.spec.ts:254-276` stay unchanged.
- Footer `border-t`: left Test + result (`role=status`, `cli-matrix-test-result`, "Running…" / "Not run yet", P-49);
  right: Credentials (Cursor, the existing popover, trigger keeps `data-popover-kind="credentials"`, focus to the key
  field, P-51), Install guide (only a row with `installed: false`, see above), Codex settings (Codex, P-52), Edit tiers
  (Ptah, P-54), then a NEW content slot `[footer-actions]` for the table-owned actions (Edit, Delete, Reset).
  A detail with nothing extra renders one compact facts row + footer.
- Inputs/outputs: keep `row`, `testResult`, `testing`, `busy`, `guides`, `codexSettings`, `tiers`, `test`, `openKind`,
  `kindToggled`, `popoverClosed`, `redetect` with today's declared types in every batch. Keep the `laneFacts` slot
  (collapsed Permission / Network / Model, P-46, P-47). No detail input or output is deleted in Phase 3: `redetect` and
  the install popover serve the keyless Cursor row.
- B3.11b (after B3.7b and B3.8): in `cli-provider-card-popovers` the type `CliProviderInfoKind` narrows to `'install'`
  (delete the `info` / `capabilities` / `permission` branches and the heading map entries, :49), and the Close button
  becomes `X` icon-only (P8). Keep the install command `<code select-all>`, note, Re-detect →
  `redetectRequested(row.id)` (U-6). The declared types `CliProviderInfoKind | 'credentials'` in the detail (:77, :91,
  :102) and in the table (`infoOpen`, `showDetail`, `infoIsOpen`, `toggleInfo`, :180-215; `[openKind]` html:413-415) keep
  their text and resolve to `'install' | 'credentials'`. This compiles because the last wide writers are already gone:
  `infoKinds` and the `'info'` / `'permission'` literals in B3.6, `showDetail(row, 'capabilities')` in B3.7b. B3.11b
  checks this with `grep -n "'capabilities'\|'info'\|'permission'" PA/lanes-table*.{ts,html} PA/lanes-add-more-strip*`
  (zero hits outside comments) before the edit.
  Callers of `ptah-cli-provider-card-popovers`: the detail (install branch) and the strip (B3.8).

#### 3.7 Lanes table — `PA/lanes-table.component.html`, `.ts`, `.css`, `PA/cli-provider-grid.component.ts` (decisions 6, 7, 16, 17, 18, 23; P18-P26, P29-P33; P-10..P-41, P-58..P-60)
- Rows (membership, order, count). The matrix builds the sets in B3.7b (3.9); the table renders what it gets:
  | Set | Membership | Order | Count |
  |---|---|---|---|
  | CLI agents group | system rows with `installed: true`, then recovery rows: system rows with `installed: false` and `status.kind === 'needs-key'` (today only keyless Cursor, `cli-matrix-rows.ts:363-366`) | installed rows by global `order` (numbers, decision 6); recovery rows after them in detection order, no number (`aria-hidden` dash, as today html:78-79) | group header count = rows in the group |
  | Ptah CLI instances group | instance rows | global `order` | group header count = rows in the group |
  | Add more strip (3.8) | system rows with `installed: false` and `status.kind === 'not-installed'` | detection order (`rows().uninstalled` order) | strip header shows its own count; the strip does not render when the set is empty |
  Card badge (P-1): total = table rows = installed + recovery = sum of the two group counts; "x of y enabled" uses the same
  y; `enabled` counts installed enabled rows (`cli-orchestration-matrix.component.ts:296-299`, unchanged). Strip CLIs are
  not counted.
- Recovery row (keyless Cursor; design-spec "Cursor (needs key) stays in table", P17, P-26, P-51): muted row; identity
  line 2 = "Sign in" link; Status `KeyRound` + "Needs API key"; Permission, Network, Model, the On switch and kebab Test
  stay disabled as today (html:156, :220, :241, :381); kebab Sign in; the expander opens the detail with Credentials and
  Install guide in the footer. "Sign in" (link and kebab) calls `recover(row)` → `showDetail(row, 'credentials')` +
  `signIn` → matrix `signInLane` (:368-372, selector `[data-popover-kind="credentials"]`, unchanged). `recover` loses its
  `not-installed` branch.
- One `<table>` with `colgroup`: Order w-16, Lane, Permission, Network, Model, Status, On w-16, kebab w-10, expander w-10.
  Two `<tbody>`: CLI agents and Ptah CLI instances. Group header rows (`colspan` = visible column count, recomputed from
  `table.collapsed()` and `modelColumn()` as today at html:406-409):
  - CLI agents: `Terminal` + name + count + `<ptah-lanes-redetect-button />` (id `policy-redetect`).
  - Ptah CLI instances (`lanes-group-ptah`): `Boxes` + name + count; when `ptahDefaults()` is set, the defaults cell
    (binding below; P-58, P-59) and one `Plus` "Add Ptah CLI instance" button (id `cli-matrix-add`,
    emits `addRequested('header')`). Empty group: one row "No Ptah CLI instance yet." (id `cli-matrix-no-instances`) with
    the primary Add (`addRequested('empty')`, P-60).
  - Group gap (decisions 17, 26; `design-spec.md:90`): `padding-top: 1.75rem` on the cells of the second group header
    row, in addition to its hairline `border-top`. No spacer row (and no `lanes-group-gap` id).
  - Ptah rows: 2px inset on the first cell in the gold `secondary` token (P24; same token as `kind-ptah`).
- Row (height `--ptah-lane-row-h`): identity, Permission/Network (`ptah-cli-lane-default-cell` per CLI row, P-33, P-34;
  Ptah rows show the inherited value with `Link2` + "(default)", P20, P-35), Model (`ptah-lane-model-effort-cell`, title =
  full model id), Status, On toggle (P-40), kebab, expander (P-41). Kebab (`ptah-table-row-actions`, icon per item):
  Test (`Play`, id `cli-matrix-test-<id>` for instances, P-28); Sign in (`LogIn`, row with `status.kind === 'needs-key'`,
  `recover` → `signIn`, P-26; the instance "Sign in" of `lanes-table.component.spec.ts:839` stays). Remove kebab Details
  (R-3, M-5), All capabilities (M-6, decision 23), Tiers / Edit / Delete (now in the detail footer only; ids
  `cli-matrix-tiers-<id>`, `cli-matrix-edit-<id>`, `cli-matrix-delete-<id>` move to the footer buttons). The status-cell
  "Install guide" button goes (no `not-installed` row is in the table).
- Detail row: the table projects into `[footer-actions]`: Edit (`Pencil`), Delete (`Trash2`, inline confirm
  `pendingDelete` + `LanesTableDeleteFocus`, P-32, P-57), Reset (`RotateCcw`, `lanes-detail-reset-default`, P-55).
- Reorder mode (`orderMode()` true, decisions 14 and 18), lands in B3.7a: one flat `<tbody>` in global order; group
  headers and gap hidden (they arrive in B3.7b); Order cell = `GripVertical` drag handle (`draggable`,
  `aria-roledescription="sortable"`, id `policy-order-grip-<id>`) + `ChevronUp`/`ChevronDown` buttons (ids
  `policy-order-up-<id>`, `policy-order-down-<id>`, `aria-disabled` at the ends, label "Move X up/down"); drop indicator
  `policy-order-drop-indicator`; live region `policy-order-live`. Logic: one `LaneOrderDrag` instance (B3.3) with
  `ids` = the ids of the numbered rows in display order and `move` = `reordered.emit`. Recovery rows stay after the
  numbered rows with the dash and no handle or buttons (today's rule for unpositioned rows,
  `lanes-table.component.spec.ts:727,:742`). After a move, focus stays on the same button of the moved row.
  Decision 26: entering Reorder mode closes an expanded detail (`detailRowId.set(null)`, open popovers close); lanes that
  are not enabled stay in the flat list at their order position (muted row, still movable).
- Reorder write (B3.7a; producer and consumer in one batch, so the controls always persist). `reordered` carries the
  displayed numbered ids only. The matrix must not write that list directly: `preferred-agent-order-save.ts:12-16` writes
  exactly its argument, and the saved order also holds ids that the table does not number (keyless Cursor, strip CLIs;
  `cli-orchestration-matrix.writes.spec.ts:508-539` pins the full payload). `move-preferred-agent-order.ts` keeps its
  slot-preserving logic in a NEW function that works for drag (any distance) and for up/down:
  ```ts
  /** Put the displayed ids, in their new order, into the slots that displayed ids hold in the full saved order.
   *  Every other index keeps its id. A displayed id that is not saved is appended first (as today, :11).
   *  null = the result equals `saved` (nothing to write). */
  export function applyDisplayedAgentOrder(saved: readonly string[], displayed: readonly string[]): string[] | null;
  ```
  Slot of an id = its first index in the full order (same rule as `indexOf` at :12-13). Example (the writes spec): saved
  `[codex, cursor, antigravity, glm-1, copilot]`, displayed after the move `[antigravity, codex, glm-1, copilot, opencode]`
  → `[antigravity, cursor, codex, glm-1, copilot, opencode]`. For a neighbour swap the result equals that of
  `movePreferredAgentOrder`, which B3.7a deletes with `moveLane` (the matrix :1, :342 is its only caller); its 4 spec
  cases are ported to the new function.
  Matrix: `protected async reorderLanes(move: LaneOrderMove): Promise<void>` — return when `!state.reviewContext()` or
  `busy()`; `saved = state.orchestration().data?.preferredAgentOrder` (array or `[]`);
  `order = applyDisplayedAgentOrder(saved, move.order)`; return when null; `savePreferredAgentOrder(state, feedback, order)`
  (Undo unchanged).
- States: loading = `Loader2` + 3 skeleton rows of `--ptah-lane-row-h`, `aria-busy="true"`; error = `TriangleAlert`,
  message, Retry (`RotateCcw`), `role="alert"`; empty = `Inbox`, "No lanes available"; partial error row above the groups
  (P-10, `role="alert"`, Retry). Narrow widths: < 950px hide Permission and Network (`ptahCollapsible`, unchanged); < 640px
  hide Model, Status and the kind badge (existing `modelColumn` ResizeObserver, P-18).
- Inputs (LanesTableComponent and the pass-through `CliProviderGridComponent`):
  keep `rows`, `defaults`, `orderMode`, `busy`, `canWrite`, `busyRows`, `testingRows`, `testResults`, `loading`, `error`, `guides`;
  NEW in B3.7b `readonly ptahDefaults = input<{ readonly manifest: CliAdapterManifest; readonly saved: CliLaneDefaults['ptah-cli'] } | null>(null);`
- Outputs: keep `toggled`, `test`, `edit`, `delete`, `signIn`, `retry`, `redetect`, `codexSettings`, `tiers`,
  `defaultSelected`, `defaultResetRequested`, and the method `closeGuide(rowId)` (the keyless Cursor detail still has the
  install guide and its Re-detect). B3.7a: NEW `reordered = output<LaneOrderMove>()` replaces `moved` in the table, in the
  grid and in the matrix binding (`(moved)="moveLane(...)"` → `(reordered)="reorderLanes($event)"`). B3.7b: NEW
  `addRequested = output<'header' | 'empty'>()`, NEW `ptahDefaultSelected = output<NonNullable<CliLaneDefaults['ptah-cli']>>()`,
  NEW `ptahDefaultResetRequested = output<void>()`; delete `capabilities` and `installGuide` from the table, the grid and
  the matrix bindings (:173-174) with the matrix methods `showCapabilities` and `showInstallGuide` (:358-367). Each
  removal lands with its producer, its pass-through, its consumer and its specs in one batch, so the grid keeps no dead
  compatibility output.
- Ptah group defaults binding (B3.7b; carries over `cli-shared-defaults.component.ts:35-45`, `name` is required):
  ```html
  <ptah-cli-lane-default-cell cli="ptah-cli" name="Ptah CLI" layout="compact" [showCaption]="false"
    resetVisibility="always" [manifest]="defaults.manifest" [saved]="defaults.saved"
    [disabled]="busy() || !canWrite()"
    (selected)="ptahDefaultSelected.emit($event)" (resetRequested)="ptahDefaultResetRequested.emit()" />
  ```
  (`defaults` = `ptahDefaults()` through `@if (...; as defaults)`). The group header has the test id `lanes-group-ptah`
  and the defaults wrapper `lanes-ptah-defaults` (hooks for the specs and for B3.12).
- B3.7a deletes `moveRow` and the table `PtahTableOrderButtonsComponent` use (and the spec import
  `lanes-table.component.spec.ts:11`). B3.7b deletes the `.css` rules for the removed hidden link (:165-170) and for the
  removed kebab items.

#### 3.8 Add more strip — NEW `PA/lanes-add-more-strip.component.ts` (decisions 8, 20; P22; U-2..U-8, U-10, U-14)
```ts
selector: 'ptah-lanes-add-more-strip'
readonly rows = input.required<readonly SystemCliMatrixRow[]>(); // same type as `CliMatrixRows.uninstalled` (cli-matrix-rows.ts:169-175)
readonly guides = input.required<Readonly<Partial<Record<CliType, { readonly command: string | null; readonly note: string }>>>>();
readonly busy = input(false);
readonly redetect = output<string>();      // row id, from the install popover (U-6)
closeGuide(rowId: string): void;           // closes the popover of that card when it is open (U-7)
```
- Rows: only `status.kind === 'not-installed'` (3.7 table). A keyless Cursor is not in the strip. `SystemCliMatrixRow`
  is the type that `ptah-cli-provider-card-popovers` requires for `row` (`cli-provider-card-popovers.component.ts:42`),
  so the binding needs no narrowing.
- Header "Add more CLI agents" (`PackagePlus`) + count + `<ptah-lanes-redetect-button testId="lanes-strip-redetect" />`.
- Grid `grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]`. Card (id `cli-provider-card-<id>`, kept for e2e): monogram
  tile, name, `CircleDashed` "Not installed", `BookOpen` "Install" (id `lanes-strip-install-<id>`) → `ptah-native-popover`
  (cap on) with `ptah-cli-provider-card-popovers kind="install"`; `ptah-disclosure` "Details" (Provider, Native behavior,
  `ptah-cli-capability-detail`; U-8, U-10, U-14, read-only).
- Focus: the strip owns the open state (`openId = signal<string | null>(null)`) and the focus. No `installGuide` output
  and no matrix focus call: the matrix `showInstallGuide` selector `#lane-detail-<id> [data-popover-kind="install"]`
  (:363-367) does not match a strip card, and B3.7b deletes that method. Open: the popover takes focus (native popover
  behaviour). Close without re-detect: focus returns to `lanes-strip-install-<id>`.
- U-7: after a successful re-detect the CLI leaves the strip; the matrix `redetectFromGuide` (:496-513) keeps its focus
  transfer to `[data-testid="cli-provider-card-<id>"] input[type="checkbox"]` (the new table row). If the CLI is still
  missing, the popover stays open and the page toast gives the reason (as today).
- Hidden while Reorder mode is on. Built in B3.8 as a standalone component; first bound in B3.7b.

#### 3.9 Matrix and section header — `PA/cli-orchestration-matrix.component.ts`, `PA/lanes-section-header.component.ts` (P-1..P-16, P-58..P-63, M-1, M-2)
- Header: `Route` + "Lanes" + count badge + "x of y enabled" (`lanes-enabled-count`) + NEW content slot `[controls]`
  (the matrix projects `<ptah-lanes-max-concurrent />`) + Reorder toggle (`ArrowUpDown` "Reorder" / `Check` "Done",
  `aria-pressed`, id `lanes-order-edit`, M-1). Description line kept (P-2). Delete the header "New Ptah CLI instance"
  button and output `addRequested` (M-2; id `lanes-header-add-instance` removed).
  Inputs: keep `total`, `enabled`, `editing`, `disabled`; output `editRequested` kept.
- Row sets (B3.7b; 3.7 table). Replace `tableRows` (:288-295):
  ```ts
  protected readonly recoveryRows = computed(() => this.rows().uninstalled.filter((row) => row.status.kind === 'needs-key'));
  protected readonly stripRows = computed(() => this.rows().uninstalled.filter((row) => row.status.kind === 'not-installed'));
  protected readonly tableRows = computed((): readonly LaneTableRow[] => [
    ...this.rows().installed.map((row, index) => ({ ...row, order: index + 1 })),
    ...this.recoveryRows().map((row) => ({ ...row, order: undefined })),
  ]);
  ```
  `laneCounts` (:296-299) keeps its text: `total = tableRows().length` (installed + recovery), `enabled` unchanged (P-1).
- Order line (P-7): `<ptah-agent-orchestration-config />` stays under the header (chips + "+N"), hidden in Reorder mode.
- Table binding: B3.7a `(reordered)="reorderLanes($event)"` (3.7). B3.7b: `[rows]="tableRows()"`; NEW `[ptahDefaults]`
  from `ptahManifest()` (:385-390) and `state.orchestration().data?.cliLaneDefaults?.['ptah-cli']`;
  `(addRequested)="openAdd($event)"`; `(ptahDefaultSelected)="savePtahDefault($event)"`;
  `(ptahDefaultResetRequested)="resetPtahDefault()"` (:633-644; write and Undo unchanged, P-59). The Ptah group shows its
  empty row when it has no instance row and the table is not loading (the table derives this; no extra input).
- Strip binding (B3.7b): `<ptah-lanes-add-more-strip [rows]="stripRows()" [guides]="CLI_INSTALL_GUIDES"
  [busy]="guideDetecting()" (redetect)="redetectFromGuide($event)" />` + `viewChild(LanesAddMoreStripComponent)`.
  `redetectFromGuide` (:496-513) keeps its checks and messages; on success it calls `closeGuide(rowId)` on the grid
  (Cursor detail guide) and on the strip, then the focus transfer of :509-512.
- B3.7b deletes: the `ptah-cli-shared-defaults` and `ptah-cli-instances` elements and imports (R-2, merged control 9;
  they would repeat `cli-matrix-add` and the defaults), `showCapabilities`, `showInstallGuide`. B3.7a deletes `moveLane`.
  Empty text (P-13) becomes "No CLI agent installed yet. Use Add more below." (id `cli-matrix-empty` kept, condition
  `tableRows().length === 0` kept); "Loading CLI agents…" (P-14), `[read-states]` slot (P-15) and `aria-busy` (P-16) kept.
- B3.9: the header changes above, `<ptah-lanes-max-concurrent />` in `[controls]`, the header `(addRequested)` binding
  removed, the card inset. `ptah-lanes-max-concurrent` uses its own input id `lanes-max-concurrent` (not
  `agent-max-concurrent`, which the policy bar keeps until B3.10), so no DOM `id` exists twice.
- Card inset: delete `:host-context([data-glass='on']) [data-testid='settings-cli-matrix'] { padding: 1.25rem }`; add
  `@container (max-width: 639px) { [data-testid='settings-cli-matrix'] { padding: 0.75rem; } }` (spec: 0.75rem at 800px).
- Keep: `openAdd` :412 + `addOrigin` focus return, `openEdit` :418, `closeAdd` :428, `onCreated` :438-456 (Test of the new
  instance), `openTiers` :459, `closeTiers` :471-483, `toggle` :586-625, `test`, `signInLane` :368, `editTiers` :373,
  `selectTableDefault`, `resetTableDefault`, `retryLanes`, both modals.

#### 3.10 Policy bar cleanup — `PA/agent-orchestration-config.component.html`, `.ts`; delete `PA/lane-order-list.component.ts` (R-3; P-8)
- Remove the Max concurrent field (moved, 3.4), the Re-detect button and public `redetectClis()` (moved, 3.4), the pencil
  popover (html:100-164, `toggleOrder`, `closeOrder`, `focusOrderTitle`, `orderList` viewChild, `savePreferredOrder`).
  Keep the chips strip `policy-order`, chips `policy-order-chip-<id>`, `+N` `policy-order-more`, the measuring copy, empty
  text `policy-order-empty`, `orchestration-policy-bar`. Class and selector stay (barrel `CH/index.ts:11`).
- Step 1 (decision 28), before any delete: `grep -rn "LaneOrderListComponent\|ptah-lane-order-list\|lane-order-list" libs apps --include=*.ts --include=*.html`
  (this covers the e2e harness and `apps/ptah-electron-e2e`). Today it lists `agent-orchestration-config.component.{ts,html}`
  and `lane-order-list.component{,.spec}.ts`; after the policy bar edit of this batch only the two files to delete may remain.
  Any other hit stops the delete and is reported.
- Delete `lane-order-list.component.ts` and its spec: no caller is left; `LaneOrderMove` / `LaneOrderDirection` live in
  `lane-order-drag.ts`.

#### 3.11 Dead components — delete `PA/ptah-cli-instances.component.{ts,html,spec.ts}`, `PA/cli-shared-defaults.component.{ts,spec.ts}` (R-2)
- Step 1 (decision 28), before any delete: `grep -rn "PtahCliInstancesComponent\|ptah-cli-instances\|CliSharedDefaultsComponent\|ptah-cli-shared-defaults\|shared-defaults-heading" libs apps --include=*.ts --include=*.html`.
  Today it lists the 5 files to delete, `cli-orchestration-matrix.component{,.spec}.ts` (changed in B3.7b) and
  `apps/ptah-electron-e2e/src/design-preview/settings-providers-gate.shot.ts:360,426,552` (changed in B3.12). After B3.7b and
  B3.12 only the 5 files to delete may remain; any other hit stops the delete and is reported.
- No caller is left after B3.7b and B3.12. Neither is exported from `CH/index.ts`. Port the 2 live behaviours first (B3.7b tests):
  instances empty state + Add (`ptah-cli-instances.component.spec.ts`), shared defaults "shows inherited scope ... forwards a
  safe selection" (`cli-shared-defaults.component.spec.ts:26`).

#### 3.12 E2E test ids — `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/{settings-reachability.table.ts, settings-cli-matrix.entries.ts, settings-visual.e2e.spec.ts, settings-orchestration.e2e.spec.ts}`, `apps/ptah-electron-e2e/src/design-preview/settings-providers-gate.shot.ts`
- Verified (grep): all 5 files exist. Uses today: `settings-reachability.table.ts` `policy-order-edit` 1, `policy-order-popover` 1,
  `cli-provider-card-codex` 2; `settings-cli-matrix.entries.ts` `cli-matrix-add` 5, `cli-matrix-no-instances` 1,
  `cli-provider-card-pi` 1; `settings-visual.e2e.spec.ts` `policy-order-edit` 2, `policy-order-popover` 2,
  `cli-provider-card-{codex 6, cursor 3, pi 2, antigravity 1}`, `cli-matrix-add` 1; `settings-orchestration.e2e.spec.ts`
  `policy-order-edit` 1, `policy-order-popover` 1, `cli-provider-card-{codex 1, cursor 4}`, `cli-matrix-add` 1;
  `settings-providers-gate.shot.ts` selector `ptah-cli-shared-defaults [role="combobox"]` (:360) and
  `#shared-defaults-heading` (:426, :552) → the Ptah group header defaults. `apps/ptah-electron-e2e/src/docs-screenshots/workspace-settings.shot.ts`
  uses only `policy-redetect`, which keeps its name: no edit.
- Id changes: replace `policy-order-edit` / `policy-order-popover` with `lanes-order-edit` and the table Reorder mode ids.
  Ids `cli-matrix-add`, `cli-matrix-no-instances`, `policy-redetect`, `cli-provider-card-<id>`, `cli-matrix-row-<id>`,
  `cli-matrix-tiers-<id>`, `cli-matrix-edit-<id>`, `cli-matrix-test-<id>` keep their names. Steps that open Tiers/Edit
  from the kebab expand the row first. `cli-provider-card-pi` (not installed) is a strip card; `cli-provider-card-cursor`
  (keyless) stays a table row.
- Behaviour changes (an id swap alone leaves these assertions wrong):
  | File:line | Today | Replace with |
  |---|---|---|
  | `settings-visual.e2e.spec.ts:322-325` | `policy-order-edit` has `aria-label` "N. … Edit order" | `lanes-order-edit` has `aria-pressed="false"` and the name "Reorder" |
  | `settings-visual.e2e.spec.ts:793-832` | trigger inside the policy bar; popover `li button` targets >= 24px; popover on screen and on top; Escape closes; focus returns | click `lanes-order-edit`; the flat list shows (no `lanes-group-cli` / `lanes-group-ptah`, no `lanes-strip`); each `policy-order-up-/down-/grip-<id>` target >= 24px; one move down, then focus is on the same button of the moved row; click "Done"; the groups return and `lanes-order-edit` has focus; capture name kept |
  | `settings-visual.e2e.spec.ts:459-494` | permission popover of Codex; Copilot popover with `copilot-auto-approve` | expanded Codex detail shows the inline "Permission modes" fact (no `cli-provider-popover-content`); expanded Copilot detail has `copilot-auto-approve` enabled inline; `noOverflow` on `#lane-detail-copilot`; captures kept |
  | `settings-cli-matrix.entries.ts:947-983` | Pi row: Model disabled, kebab Test disabled, switch disabled, table detail install popover | Pi is a card in `lanes-strip`: "Not installed", no Model / Test / switch; `lanes-strip-install-pi` opens the install popover (command + Re-detect); the "Details" disclosure opens. Cursor stays a table row before the strip (the document-position check stays) with its fixture status text |
  | `settings-reachability.table.ts:853-860` | `policyBar(page).getByRole('button', { name: 'Re-detect CLI agents' })` | `page.getByTestId('policy-redetect')` (CLI group header; name "Re-detect CLIs") |
  | `settings-reachability.table.ts:925,1039` | `#agent-max-concurrent` | `[data-testid="policy-max-concurrent-input"]` (both queries) |
  | `settings-providers-gate.shot.ts:355-360` | `settings-cli-matrix [role="combobox"]` `.last()` and `ptah-cli-shared-defaults [role="combobox"]` | row controls: `[data-testid^="cli-provider-card-"] [role="combobox"]`; shared controls: `[data-testid="lanes-ptah-defaults"] [role="combobox"]` |
  | `settings-providers-gate.shot.ts:426,552` | `#shared-defaults-heading` | `[data-testid="lanes-group-ptah"]` |

### Blast radius

| Changed symbol | Callers | What each caller needs |
|---|---|---|
| `NativeModalComponent layout="shell"` | the 3 Settings modals only | B3.1 |
| `AgentOrchestrationConfigComponent` (exported, `CH/index.ts:11`) | matrix template; `webview-e2e-harness/.../settings.fixtures.ts:20` (comment only) | loses `redetectClis()` (no external caller; `settings.component.ts:382` calls `providersState.redetectClis()` directly) |
| `LanesTableComponent` / `CliProviderGridComponent` outputs `moved` → `reordered` | matrix template (:169); specs `lanes-table.component.spec.ts:678,:708`, `cli-orchestration-matrix.writes.spec.ts:481,:522` | B3.7a changes all of them |
| `LanesTableComponent` / `CliProviderGridComponent` outputs `capabilities`, `installGuide` | matrix template (:173-174); specs `lanes-table.component.spec.ts:509,:777`, `lanes-table.visual.component.spec.ts:602` | B3.7b changes all of them |
| `movePreferredAgentOrder` → `applyDisplayedAgentOrder` | matrix `:1,:342`; `move-preferred-agent-order.spec.ts` | B3.7a |
| `LaneRowIdentityComponent.installGuideRequested` | `lanes-table.component.html:95-99`; visual spec `:590-606` (through the link) | binding and spec click in B3.2; output and link assertions in B3.5 |
| `LanesTableDetailComponent` | `lanes-table.component.html:411-425`; `lanes-table-detail.component.spec.ts` | no input or output is deleted (`redetect` stays for keyless Cursor) |
| `CliProviderInfoKind` (narrowed to `'install'`) | `lanes-table.component.ts:180-215`, `lanes-table-detail.component.ts:77,91,102`, strip (`'install'` only) | B3.11b; the declared types keep their text (3.6) |
| `CliLaneDefaultCellComponent` NEW `resetVisibility` | `lanes-table` rows (default `'auto'`), `cli-shared-defaults` (deleted in B3.11a) | none (default = today) |
| `CliLaneDefaultCellComponent` reset glyph | `lanes-table`, `cli-shared-defaults` (deleted in B3.11) | none |
| Test ids | `webview-e2e-harness`, `ptah-electron-e2e` | B3.12 |

Not affected: `PR/providers-settings.component.ts` (renders the matrix; its inputs `hostReadStates`, output
`codexSettingsRequested` stay), VS Code and TUI hosts (no Lanes code), `platform-cli` / `cli-engine` (no change).

### Tests

Existing specs that break and how to update them:
| Spec | Break | Update |
|---|---|---|
| `PR/add-cli-instance-modal.component.spec.ts`, `PR/cli-tier-mapping-modal.component.spec.ts`, `PR/provider-catalog-modal.component.spec.ts` | class assertions on header/footer/body (`max-h-[50vh]`) | assert `layout="shell"` and the body scroll wrapper |
| `PA/lanes-table.component.spec.ts` (895 lines) | `:93-99` popover override (B3.2); `:11`, `:673,:703,:727,:742` order buttons and `moved` (B3.7a) → Reorder flat mode with `policy-order-up/down-<id>` and `reordered`; `:501` kebab edit/delete/capabilities (`capabilities` output, B3.7b), `:543,:573,:609,:635` delete via kebab → via the detail footer (B3.7b); `:774` not-installed row with `installGuide` (:777) → a keyless Cursor recovery row: muted, dash, disabled switch, "Sign in" emits `signIn` (B3.7b); `:181,:200` detail quiet actions (B3.6); `:229` collapsed; `:807,:857` identity/status (B3.5); `:839` instance Sign in stays | rewrite per 3.7 in the batch named; keep test names where the capability survives |
| `PA/lanes-table.visual.component.spec.ts` (712 lines) | `:88-94` popover override (B3.2); `:569` lines 601-606 (B3.2), lines 589-598 (B3.5), the status-cell "Install guide" part and `installGuide` at :602 (B3.7b); `:126` detail actions (B3.6); `:199` compact subtitles hidden (now always two lines, B3.5); `:314,:330` rows with `installed: false` keep their disabled controls (recovery row) | `:199` inverts; `:569` ends as: recovery row "Sign in" beside status + tier counts in details; `:314,:330` keep their assertions with a keyless Cursor fixture |
| `PA/lanes-table-detail.component.spec.ts` | `:145` chip popovers → inline facts; info popovers; `:303,:322` capabilities popover → `[data-lane-capabilities]` disclosure; `:307` instance capabilities popover → disclosure; `:207-245` credentials and `:254-276` install guide + Re-detect stay | rewrite per 3.6 in B3.6 |
| `PA/cli-orchestration-matrix.component.spec.ts` | `:407` permission popover + Info button (B3.6) → inline facts and no `ptah-cli-provider-card-popovers` for Info; `:390` rows in the table and `ptah-cli-instances` (:404) (B3.7b) → table ids = installed + `cli-provider-card-cursor`, strip ids = `cli-provider-card-pi` (fixture), no `ptah-cli-instances`; `:434-455` Claude account + Cursor credentials stay; `:458` instances card add modal → Add from the Ptah group header (B3.7b); `:531` install guide + Re-detect → through the strip card (B3.7b); `:340,:359` kebab Test, `:477`, `:496` stay | update in the batch named |
| `PA/cli-orchestration-matrix.writes.spec.ts` | `:481,:522` `table().moved.emit({ row, direction })` → `table().reordered.emit({ order, movedId, direction })` with the displayed order; the expected full payloads (:483-497, :524-538) stay byte-equal (B3.7a); `:577` tiers from kebab → detail footer (B3.7b); `:604` `table().redetect.emit('pi')` → `'cursor'` for the table and a strip `redetect` emit for `pi` (B3.7b) | rewrite the trigger, keep the write assertions |
| `PA/agent-orchestration-config.component.spec.ts` (931 lines) | `:292,:311,:358` Max concurrent, `:767,:779` Re-detect, `:407,:443,:532,:679` pencil popover and drag | move `:292,:311,:358` to `lanes-max-concurrent.component.spec.ts`, `:767,:779` to `lanes-redetect-button.component.spec.ts`; `:443` up/down and `:532` drag to the lanes-table Reorder tests; `:679` Escape focus return is deleted with the popover (R-3) |
| `PA/lanes-section-header.component.spec.ts` | `:18,:30` header buttons (Add removed) | assert Reorder label/icon/`aria-pressed`, `[controls]` slot |
| `PA/cli-lane-default-cell.component.spec.ts` | `:387,:368` reset text button | query by aria-label; tooltip shows the value |
| `PA/lane-order-list.component.spec.ts` | deleted in B3.10 | tests ported to `lane-order-drag.spec.ts` (B3.3) and the lanes-table Reorder tests (B3.7a) |
| `PA/ptah-cli-instances.component.spec.ts`, `PA/cli-shared-defaults.component.spec.ts` | deleted in B3.11a | live behaviours ported in B3.7b |

Test ids that change in Phase 3:
- Removed: `lanes-header-add-instance` (M-2), `policy-order-edit`, `policy-order-popover` (R-3), `cli-provider-popover-content`
  for kinds other than install (decision 13).
- Moved, same name: `policy-max-concurrent-input` (to `ptah-lanes-max-concurrent`), `policy-redetect` (CLI group header),
  `policy-order-grip-/up-/down-<id>`, `policy-order-drop-indicator`, `policy-order-live` (table Reorder mode),
  `cli-matrix-tiers-/edit-/delete-<id>` (detail footer), `cli-matrix-add`, `cli-matrix-no-instances` (Ptah group),
  `cli-provider-card-<id>` (table for installed, strip for not installed).
- NEW: `lanes-strip`, `lanes-strip-install-<id>`, `lanes-strip-redetect`, `lanes-group-cli`, `lanes-group-ptah`,
  `lanes-skeleton-row`. (No `lanes-group-gap`: the gap is padding on the second group header, decision 26.)

New tests (`none today` / `not verified` rows that the change touches):
| Capability | New test | Spec |
|---|---|---|
| P-1, P-3 count and ring | badge counts installed lanes only; "x of y enabled" uses the same y | `lanes-section-header.component.spec.ts` + matrix spec |
| P-13 empty text | text points to the strip | matrix spec |
| P-20 global order over 2 groups | numbers run across both tbody groups (2 and 6 can be Ptah rows) | `lanes-table.component.spec.ts` |
| P-21 cross-group move | a move in Reorder mode across the former group boundary writes the whole new order once | `lanes-table.component.spec.ts`, writes spec |
| P-25 row mark (`none today`) | the `Info` button is focusable, has tooltip and sr-only reason | NEW `lanes-table-status.component.spec.ts` |
| P-22 two lines | line 2 shows version / provider / `--`; kind badge class per kind | NEW `lane-row-identity.component.spec.ts` |
| P-35/P20 inherited value | Ptah row shows inherited value + "(default)" | `lanes-table.component.spec.ts` |
| P-58, P-59 group defaults | defaults render only with a manifest; select emits `ptahDefaultSelected`; reset is icon-only | `lanes-table.component.spec.ts` |
| P-60, M-2 one Add | exactly one Add control; origins `header` and `empty` | `lanes-table.component.spec.ts` + matrix spec |
| P-66 Copilot switch | Copilot detail shows the labelled switch; flip writes `copilotAutoApprove` with Undo | `lanes-table-detail.component.spec.ts` |
| decision 13 | detail repeats none of: model/effort, permission, network, enabled, version, provider line | `lanes-table-detail.component.spec.ts` |
| decision 20 | "All capabilities" disclosure renders groups inline; no popover | `lanes-table-detail.component.spec.ts` |
| decision 23 | kebab = Test (+ Sign in when a key is needed) only | `lanes-table.component.spec.ts` |
| U-2..U-8, U-10, U-14 strip (`none`) | strip lists only not-installed system CLIs; Install opens the capped popover with command and Re-detect; Details disclosure; U-7 focus after re-detect | NEW `lanes-add-more-strip.component.spec.ts` |
| decisions 14, 18 Reorder | flat list hides groups and strip; grip drag and up/down write the order; `aria-disabled` at ends; focus stays; live text "X moved to position N" | `lanes-table.component.spec.ts`, NEW `lane-order-drag.spec.ts` |
| decision 26 Reorder: detail closes | with a row expanded, turning Reorder on closes the detail (`detailRowId` null, no `lane-detail-<id>` content) | `lanes-table.component.spec.ts` |
| decision 26 Reorder: not-enabled lanes stay | a lane with `enabled: false` is in the flat list at its order position and can be moved | `lanes-table.component.spec.ts` |
| decisions 16, 26 kind badges | `kind-cli` and `kind-ptah` classes differ; text colour is not `base-content` | NEW `lane-row-identity.component.spec.ts` |
| decision 17, 26 group gap | the second group header row has `padding-top: 1.75rem` (class or computed style); no spacer row | `lanes-table.component.spec.ts` |
| decision 13 Ptah detail | an instance detail shows no Provider fact | `lanes-table-detail.component.spec.ts` |
| states | loading skeleton `aria-busy`; error `role=alert` + Retry; partial error row | `lanes-table.visual.component.spec.ts` |
| P-62/P-63 modals (`not verified`) | shell layout: body scrolls at 600px height, footer stays visible; focus returns to origin | modal specs |
| Reorder write keeps hidden ids | `applyDisplayedAgentOrder`: neighbour swap, drag over 2+ positions, unsaved displayed id appended, duplicate saved id, unchanged order → null; a saved id that is not displayed keeps its index | `move-preferred-agent-order.spec.ts` (B3.7a) |
| Reorder write end to end | drag and up/down both write the full order with the keyless Cursor and strip ids in their slots; Undo restores it | `cli-orchestration-matrix.writes.spec.ts` (B3.7a) |
| Keyless Cursor recovery row (P-26, P-51, U-5, U-6) | the row is in the CLI group after the numbered rows, has no number, shows "Sign in"; Sign in opens the detail with Credentials focused; the detail footer has Install guide and its Re-detect emits; the row is not in the strip | `lanes-table.component.spec.ts`, matrix spec (B3.7b) |
| Counts | card badge = installed + recovery rows; group counts sum to it; strip CLIs are not counted | matrix spec (B3.7b) |
| P-59 group reset | with a saved Ptah default the group header shows the reset (`resetVisibility="always"`); click emits `ptahDefaultResetRequested`; the matrix write and its Undo run | `cli-lane-default-cell.component.spec.ts` (B3.5b), `lanes-table.component.spec.ts`, writes spec (B3.7b) |

### Batches

Jest config `libs/frontend/chat/jest.config.ts`; typecheck `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`.
Every batch with a template change also needs the coordinator run of `typecheck-templates`.

| Batch | Write set (project) | Read set | Depends on | Acceptance |
|---|---|---|---|---|
| B3.1 Modals | `PR/add-cli-instance-modal.component.html`, `PR/add-cli-instance-modal.component.spec.ts`, `PR/cli-tier-mapping-modal.component.html`, `PR/cli-tier-mapping-modal.component.spec.ts`, `PR/provider-catalog-modal.component.ts`, `PR/provider-catalog-modal.component.spec.ts` (6, chat) | each html:1-20 and footer lines (240-261 / 185-202); catalog ts:25-100; `UI/native/modal/native-modal.component.ts` | Phase 1 | 3.1; at 800x600 every modal fits, the body scrolls, the footer is visible |
| B3.2 Table split | `PA/lanes-table.component.html`, `.ts`, `.css`, NEW `PA/lane-model-effort-cell.component.ts`, `PA/lanes-table.component.spec.ts` (only the override `:93-99`), `PA/lanes-table.visual.component.spec.ts` (only the override `:88-94` and `:601-606`) (6, chat) | `lanes-table.component.html:255-370,90-100`, `.ts:150-162,300-348`; the 3 spec ranges | none | 3.2; the two table specs and `cli-model-effort-popover.component.spec.ts` pass |
| B3.3 Drag logic | NEW `PA/lane-order-drag.ts`, NEW `PA/lane-order-drag.spec.ts`, `PA/lane-order-list.component.ts` (3, chat) | `lane-order-list.component.ts:1-263`, its spec | none | 3.3; both move types re-exported; `lane-order-list.component.spec.ts` and `agent-orchestration-config.component.spec.ts` pass unchanged |
| B3.4 Header controls | NEW `PA/lanes-max-concurrent.component.ts` + `.spec.ts`, NEW `PA/lanes-redetect-button.component.ts` + `.spec.ts` (4, chat) | `agent-orchestration-config.component.html:12-30,172-200`, `.ts:290-345`, spec `:292-400,:760-800` | none | 3.4; ported tests pass |
| B3.5 Row cells | `PA/lane-row-identity.component.ts`, NEW `PA/lane-row-identity.component.spec.ts`, `PA/lanes-table-status.component.ts`, NEW `PA/lanes-table-status.component.spec.ts`, `PA/lanes-table.component.spec.ts` (only `:807,:857`), `PA/lanes-table.visual.component.spec.ts` (only `:199` and `:589-598`) (6, chat) | identity `:140-202`, status `:1-107`; the spec tests named | B3.2 | 3.5 identity and status; kind badge text contrast >= 4.5:1 both themes (measured by the visual reviewer) |
| B3.5b Default cell | `PA/cli-lane-default-cell.component.ts`, `PA/cli-lane-default-cell.component.spec.ts` (2, chat) | default cell `:200-270,:420-450,:600-647` | none | 3.5 default cell; `:368,:387` reset tests query by aria-label; `resetVisibility` default = today, `'always'` shows the reset without a caption |
| B3.6 Detail | `PA/lanes-table-detail.component.html`, `.ts`, `.css`, `.spec.ts`, `PA/lanes-table.component.spec.ts` (only `:181,:200`), `PA/lanes-table.visual.component.spec.ts` (only `:126`), `PA/cli-orchestration-matrix.component.ts` (only the `showCapabilities` selector `:358-361`), `PA/cli-orchestration-matrix.component.spec.ts` (only `:407`) (8, chat) | detail html `:1-310`, ts `:1-113`; `copilot-auto-approve-toggle.component.ts:60-130`; `cli-capability-detail.component.ts`; `UI/patterns/disclosure/disclosure.component.ts:80-90` | B3.5 (shares 2 spec files) | 3.6; detail inputs/outputs and `CliProviderInfoKind` unchanged; kebab "All capabilities" opens the disclosure; `:254-276` pass unchanged |
| B3.7a Reorder mode and write | `PA/lanes-table.component.html`, `.ts`, `.css` (Order cell and flat mode only), `PA/lanes-table.component.spec.ts` (`:11`, `:660-772`), `PA/cli-provider-grid.component.ts`, `PA/cli-orchestration-matrix.component.ts` (`(reordered)`, `reorderLanes`, delete `moveLane`), `PA/cli-orchestration-matrix.writes.spec.ts` (`:469,:508`), `PA/move-preferred-agent-order.ts`, `.spec.ts` (9, chat) | `lanes-table.component.html:70-92`, `.ts:225-280`; `lane-order-drag.ts`; matrix `:165-170,:335-349`; `preferred-agent-order-save.ts` | B3.3, B3.6 (shares files) | 3.7 Reorder bullets; drag and up/down persist in this batch; the writes spec payloads are byte-equal to today |
| B3.8 Strip | NEW `PA/lanes-add-more-strip.component.ts`, NEW `PA/lanes-add-more-strip.component.spec.ts` (2, chat) | `cli-provider-card-popovers.component.ts`; `cli-matrix-rows.ts:95-110,169-175`; matrix `:51-89,:496-513` | B3.4 | 3.8; `rows` is `readonly SystemCliMatrixRow[]`; not bound yet |
| B3.7b Groups, rows and strip binding | `PA/lanes-table.component.html`, `.ts`, `.css`, `PA/lanes-table.component.spec.ts`, `PA/lanes-table.visual.component.spec.ts`, `PA/cli-provider-grid.component.ts`, `PA/cli-orchestration-matrix.component.ts`, `PA/cli-orchestration-matrix.component.spec.ts`, `PA/cli-orchestration-matrix.writes.spec.ts` (`:577,:604`) (9, chat) | B3.2-B3.8 outputs; `ptah-cli-instances.component.html:1-61`; `cli-shared-defaults.component.ts:20-72`; prototype `index.html:600-690`; specs by `grep -n "it("` ranges | B3.5, B3.5b, B3.6, B3.7a, B3.8 | 3.7 + the B3.7b parts of 3.9; at 800x600 with nav `scrollWidth == clientWidth`; rows exactly 3.5rem; keyless Cursor row with Sign in, Credentials and Install guide; not-installed CLIs in the strip; all 5 specs green |
| B3.9 Section header | `PA/lanes-section-header.component.ts`, `PA/lanes-section-header.component.spec.ts`, `PA/cli-orchestration-matrix.component.ts`, `PA/cli-orchestration-matrix.component.spec.ts` (4, chat) | matrix `:120-160,:296-300`; header `:1-103` | B3.4, B3.7b | 3.9 header; header `addRequested` deleted with its matrix binding and the spec subscription (`lanes-section-header.component.spec.ts:35`); Lanes card has no second card under it |
| B3.10 Policy bar cleanup | `PA/agent-orchestration-config.component.html`, `.ts`, `.spec.ts`, delete `PA/lane-order-list.component.ts`, delete `PA/lane-order-list.component.spec.ts` (5, chat) | html `:1-201`, ts `:60-360` | B3.7a, B3.7b, B3.9 | step 1 and 3.10 |
| B3.12 E2E ids and steps | `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-reachability.table.ts`, `settings-cli-matrix.entries.ts`, `settings-visual.e2e.spec.ts`, `settings-orchestration.e2e.spec.ts`, `apps/ptah-electron-e2e/src/design-preview/settings-providers-gate.shot.ts` (5; `@ptah-extension/webview-e2e-harness`, `ptah-electron-e2e`) | the id list and the behaviour table of 3.12 | B3.9, B3.10 | every id, selector and role query in the 5 files exists in the templates; each row of the 3.12 behaviour table is applied |
| B3.11a Dead components | delete `PA/ptah-cli-instances.component.ts`, `.html`, `.spec.ts`, `PA/cli-shared-defaults.component.ts`, `.spec.ts` (5, chat) | none | B3.7b, B3.12 | step 1 and 3.11 |
| B3.11b Popover kind narrowing | `PA/cli-provider-card-popovers.component.ts` (+ its spec if one exists) (1-2, chat) | 3.6 last bullet; the grep named there | B3.7b, B3.8 | `CliProviderInfoKind` is `'install'`; the table and detail files need no edit and both `tsc` commands pass |

Focused checks per batch (lanes run only these):
- chat batches: `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`;
  `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` (library code only; `tsconfig.lib.json:11` excludes
  `*.spec.ts`); `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` (spec files; Jest runs with
  `isolatedModules` and does not report type errors); `npx eslint <changed files>`.
- `<specs>` = the specs of the write set plus every spec that mounts a changed component. For B3.2, B3.5, B3.6, B3.7a,
  B3.7b, B3.9 and B3.11b that is always these 5: `lanes-table.component.spec.ts`, `lanes-table.visual.component.spec.ts`,
  `lanes-table-detail.component.spec.ts`, `cli-orchestration-matrix.component.spec.ts`,
  `cli-orchestration-matrix.writes.spec.ts` (all in `libs/frontend/chat/src/lib/settings/ptah-ai/`). A test of these 5
  that fails after the batch is fixed in the batch; if its file is not in the write set, the lane stops and reports it.
- B3.10 and B3.11a also run `agent-orchestration-config.component.spec.ts` with the 5.
- B3.12: `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json`; `npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.json`; `npx eslint <changed files>`.

Batch order and typecheck rule (decision 29, round 2 rulings). Run Phase 3 batches in this order. After each batch the
library `tsc`, the spec `tsc` and the template typecheck are green: a batch that removes or renames an output, input,
import or selector also changes every production caller and every spec that references it.
1. B3.1 (independent, any time).
2. B3.2 → B3.3 → B3.4 → B3.5 → B3.5b → B3.6 → B3.7a → B3.8 → B3.7b → B3.9 → B3.10 → B3.12 → B3.11a → B3.11b.
   (B3.3, B3.4, B3.5b and B3.8 have no file overlap with their neighbours and may run in parallel where their dependencies allow.)
Dependency of each batch: B3.2 none; B3.3 none; B3.4 none; B3.5 ← B3.2; B3.5b none; B3.6 ← B3.5; B3.7a ← B3.3, B3.6;
B3.8 ← B3.4; B3.7b ← B3.5, B3.5b, B3.6, B3.7a, B3.8; B3.9 ← B3.4, B3.7b; B3.10 ← B3.7a, B3.7b, B3.9; B3.12 ← B3.9, B3.10;
B3.11a ← B3.7b, B3.12; B3.11b ← B3.7b, B3.8.
API removals, with every caller (production and spec) in the same batch:
| Removed or renamed API | Callers | Batch |
|---|---|---|
| `lanes-table` import of `CliModelEffortPopoverComponent` (moves to the new cell) | spec overrides `lanes-table.component.spec.ts:93-99`, `lanes-table.visual.component.spec.ts:88-94` | B3.2 |
| `(installGuideRequested)` binding | `lanes-table.component.html:95-99`; `lanes-table.visual.component.spec.ts:601-606` | B3.2 |
| `LaneRowIdentityComponent.installGuideRequested` + hidden link | none after B3.2; link assertions `lanes-table.visual.component.spec.ts:589-598` | B3.5 |
| `LanesTableStatusComponent.installGuide` / `signIn` | none (not bound; no spec reference) | B3.5 |
| detail `infoKinds`, chips, info / permission / capabilities popovers | `lanes-table-detail.component.spec.ts:145,:303,:307,:322`; `cli-orchestration-matrix.component.spec.ts:407`; matrix `showCapabilities` selector | B3.6 |
| `moved` (table, grid), `moveLane`, `movePreferredAgentOrder`, `PtahTableOrderButtonsComponent` use | matrix `:169`; `lanes-table.component.spec.ts:11,:678-685,:708`; `cli-orchestration-matrix.writes.spec.ts:481,:522`; `move-preferred-agent-order.spec.ts` | B3.7a |
| `capabilities`, `installGuide` (table, grid), `showCapabilities`, `showInstallGuide` | matrix `:173-174`; `lanes-table.component.spec.ts:509,:777`; `lanes-table.visual.component.spec.ts:602` | B3.7b |
| `ptah-cli-shared-defaults`, `ptah-cli-instances` elements in the matrix | `cli-orchestration-matrix.component.spec.ts:404` | B3.7b (files deleted in B3.11a) |
| `LanesSectionHeaderComponent.addRequested` | matrix template; `lanes-section-header.component.spec.ts:35` | B3.9 |
| `AgentOrchestrationConfigComponent.redetectClis()`, Max concurrent, pencil popover | none outside the component (`settings.component.ts:382` uses `providersState.redetectClis()`); its own spec | B3.10 |
| `LaneOrderListComponent` and its re-exports of the move types | `agent-orchestration-config` (ts :26-30, html :156); its spec | B3.10 |
| `PtahCliInstancesComponent`, `CliSharedDefaultsComponent` | their own specs; gate shot selector (B3.12) | B3.11a |
| `CliProviderInfoKind` kinds other than `'install'` | none after B3.6 and B3.7b (grep in 3.6) | B3.11b |
Kept on purpose (not removed): table / grid `redetect` and `closeGuide`, detail `redetect`, `openKind`, `kindToggled`
(keyless Cursor install guide and credentials).
Red spec windows: none. No batch leaves a TypeScript error or a failing test in a spec. There is no B3.7v: the visual
spec changes are in B3.2, B3.5, B3.6 and B3.7b with the code that causes them.
Capability windows: none. Reorder persists in every batch (B3.7a changes producer and consumer together). Not-installed
CLIs stay table rows until B3.7b, which moves them to the strip in one batch. The keyless Cursor row never leaves the table.
Duplicate-id window: from B3.7b to B3.10 the matrix renders `policy-redetect` twice (CLI group header and the old policy bar
button), and from B3.9 to B3.10 `policy-max-concurrent-input` twice (header and policy bar). These are test ids only; the
DOM `id` values differ (`lanes-max-concurrent` / `agent-max-concurrent`). Only
`agent-orchestration-config.component.spec.ts` queries these ids (grep of `PA/*.spec.ts`), and it mounts that component
alone, so no spec is ambiguous. B3.10 removes the old copies; the Phase 3 PR contains both batches.

Coordinator gate for Phase 3: `npm run verify -- -p @ptah-extension/chat,@ptah-extension/webview-e2e-harness,ptah-electron-e2e`
and `npm run verify -- -t typecheck-templates -p ptah-extension-webview`. Visual review in Electron at 800x600 (nav),
1600x900, dark and light, `?modal=1` equivalents (each modal open).

---

## Risks

| Risk | Where | Mitigation |
|---|---|---|
| Default-on popover cap changes popovers outside Settings | 15 non-Settings callers | 5 callers with an own height cap opt out (B1.5, B1.6); the others only gain a scroll when taller than the viewport. Clipping check in B1.2 acceptance: New Session popover, canvas rail card popovers, send-to-messaging picker |
| Global padding rule would change other pages | 26 non-Settings `data-glass-surface="content"` files | rule scoped to `.settings-page` (D-2) |
| Large template rewrite | `PA/lanes-table.component.html` (577 lines, ~5,800 tokens) + 2 specs (~16,400 tokens together) | behaviour-preserving split first (B3.2); detail, cells and strip land in their own batches; after the split only B3.7a (Order cell, Reorder mode) and B3.7b (groups, rows) edit the table |
| Spec size for one lane | `lanes-table.component.spec.ts` (895 lines), `agent-orchestration-config.component.spec.ts` (931 lines) | lanes read them by line range (`grep -n "it("` first); no whole-file read above 300 lines |
| Drag regression | drag exists only in the pencil popover today (parity addendum P-8) | logic moved, not rewritten (B3.3), with the popover still in place until B3.10 |
| Transient duplicate test ids B3.7b-B3.10 | Re-detect (`policy-redetect`) from B3.7b, Max concurrent (`policy-max-concurrent-input`) from B3.9 render twice | see "Duplicate-id window" under Phase 3 Batches; B3.10 is in the same PR |
| Size of B3.7a and B3.7b (9 files each) | table, grid, matrix and their specs change together | required by the round 2 ruling (specs are callers; producer and consumer in one batch). B3.7a touches only the Order cell and the write path; lanes read specs by `grep -n "it("` ranges |
| Reorder write drops saved ids that the table does not number | keyless Cursor, strip CLIs | `applyDisplayedAgentOrder` keeps their slots (3.7); the writes spec payloads stay byte-equal |
| E2E ids | harness and electron e2e use removed ids | B3.12 in the same PR; most ids keep their names |
| Contrast of `kind-cli`/`kind-ptah` and light status inks | spec contrast table "measure at implementation" | `kind-cli` text `info`, `kind-ptah` text gold `secondary`, per-theme shade >= 4.5:1 (decision 26); B3.5 adds the scoped `--ptah-kind-*-ink` variables only if a light shade fails; the visual reviewer measures with the real oklch tokens. Status text (row status, Test result) stays `base-content` |
| Sticky summary offset | Claude tools bar needs F37 | B2.8 depends on B2.1 and Phase 1 B1.4 |
| `setting-row` layout change for its 10 callers outside Phase 2 | `cron-job-form`, gallery, 8 `PA/` Settings files | opt-in inputs with today's defaults (decision 29); B1.4 spec asserts the default classes |

## Out of scope

- VS Code extension host and TUI hosts: no feature work. Shared-lib changes must only keep them compiling.
- Backend and RPC: no new RPC, no contract change (decision 9). The group switch uses `agent:setClaudeBuiltin` per id.
- Settings pages other than Providers > Lanes, Advanced and Claude Code tools & skills. Their per-component
  `padding: 1.25rem` copies (`PA/host-routing-setting`, `PA/decision-matrix-page`, `PA/lane-guards-settings`,
  `PA/web-search-config`, `PA/subagent-cache-ttl-setting`, `PA/lane-rotation-setting`, `PA/session-budget-settings`,
  `PR/agents-routing-settings`) stay; they are now redundant with the B1.1 rule and can go in a follow-up.
- Deleting `--ptah-surface-pad` (32 users, D-3).
- `native-dropdown`, `native-autocomplete` (decision 22).
- New tokens beyond the 3 in the spec.
- `platform-cli` and `cli-engine` libraries: no change.

## Decisions

| # | Decision | Options | Evidence | Reversible |
|---|---|---|---|---|
| D-1 | Modal shell is opt-in (`layout="shell"`, default `plain`) | changed default / opt-in | 5 non-Settings modal callers with their own header/footer layout (`task-create-dialog`, `quarantined-agents-panel`, `reconcile-guard`, `stack-skill-consent`, `editable-section`) | yes |
| D-2 | Card inset rule scoped to `.settings-page` | global `[data-glass-surface=content]` / scoped | 26 non-Settings files use the attribute; unlayered global padding overrides their utilities | yes |
| D-3 | Keep `--ptah-surface-pad` | delete (spec) / keep | 32 files use it, incl. `settings-layout.component.ts:243` | yes |
| D-4 | The cap applies to the panel `#floatingRef`, not the layer | panel / layer | `.ptah-popover-layer` is the full-viewport top-layer shell (`native-popover.component.ts:120-140`) | yes |
| D-5 | 5 popover callers with an own height cap opt out (`chat-input` keeps the cap: its cap is on the textarea) | cap all / opt out | own `max-h` in their content (grep in 1.9); double scroll otherwise | yes |
| D-6 | `setting-row` gains `hintElementId` | change ids in callers / keep ids | `AB.spec` queries `#agent-behaviour-*-note` (6 places) | yes |
| D-7 | Claude tools switches stay `<input type="checkbox" ptahToggle role="switch">` | button switch / checkbox switch | `CB.spec` reads `.checked` and `change` events; F32 is a visual and role fix | yes |
| D-8 | Group switch uses one `saveGeneric` call whose write loops the per-id RPC | announce-only toast / saveGeneric | `SettingsSaveFeedbackService.saveGeneric` gives the saving guard, one toast and Undo; success text "Saved <group> (<n> turned on)." | yes |
| D-9 | Reorder mode reuses the drag logic of `lane-order-list` as a plain class in the table; `lane-order-list` is deleted after the move | render `ptah-lane-order-list` / reuse logic in table rows | prototype renders table rows in Reorder mode (`prototype/index.html:626,676`); spec allows either | yes |
| D-10 | Ptah group defaults use the existing `compact` layout of `ptah-cli-lane-default-cell` | NEW layout / existing | `layout` input already has `'compact' | 'wide' | 'card' | 'reset'` (`cli-lane-default-cell.component.ts:428`) | yes |
| D-11 | Max concurrent and Re-detect become their own components | keep in policy bar / extract | they move to two different places (card header, CLI group header + strip); the policy bar keeps only the order line | yes |
| D-12 | Kebab Tiers/Edit/Delete ids move to the detail footer with the same names | new ids / same | e2e uses `cli-matrix-tiers-`, `cli-matrix-edit-` (harness); decision 23 | yes |
| D-13 | Not-installed card keeps id `cli-provider-card-<id>` | new id / same | e2e uses `cli-provider-card-pi`, `-codex`, `-cursor` | yes |
| D-14 | Modals move to Phase 3, Phase 1 stays in the `ui` lib | Phase 1 / Phase 3 | they are Providers files; Phase 1 PR stays a primitives PR | yes |
| D-15 | `setting-row` layout changes are opt-in inputs `controlAlign` / `edgePadding` with today's defaults | default-on + visual checks / opt-in | decision 29; 10 callers outside Phase 2 (review Serious 2) | yes |
| D-16 | An API is deleted or renamed only in a batch that also changes every production caller and every spec that references it | accept red windows / keep dead compatibility outputs / same batch | decision 29; round 2 rulings; review 2 Blocking 1-2 | yes |
| D-19 | Keyless Cursor (`needs-key`, `installed: false`) is a recovery row in the CLI group; only `not-installed` CLIs go to the strip | filter on `!installed` / split by status | `cli-matrix-rows.ts:363-366`; `design-spec.md` "Cursor (needs key) stays in table"; P-26, P-51 | yes |
| D-20 | The detail keeps its install popover and `redetect` for a row with `installed: false` | delete (round 1 plan) / keep | a keyless Cursor shows "Install guide" in its detail today (`lanes-table-detail.component.html:161`, guide `cli-orchestration-matrix.component.ts:65`); not in R-1..R-3 | yes |
| D-21 | Reorder writes go through `applyDisplayedAgentOrder` (slot-preserving merge) | write the displayed ids / merge | `preferred-agent-order-save.ts:12-16`, `move-preferred-agent-order.ts:1-16`, writes spec `:508-539` | yes |
| D-22 | Card badge total = table rows (installed + recovery) | installed only / table rows | parity P-1 note ("table rows only, or all lanes"); group counts then sum to the badge | yes |
| D-23 | Output style editor: an open confirm blocks Save, Cancel, `submit()` and `requestClose()` | visual move only / real guards | `output-style-editor.component.ts:329-351,505-518,549-556` have no guard today | yes |
| D-17 | `kind-ptah` gold = existing daisyUI `secondary`; light-theme ink fallback is a component-scoped variable, not a new global token | new global token / existing + scoped fallback | `WV/tailwind.config.js:178,256`; spec limits new tokens to 3 | yes |
| D-18 | Group gap is padding on the second group header, not a spacer row | spacer row / padding | `design-spec.md:90`, decision 26 | yes |

## Clarifications Needed

None. The inputs settle every point. Two spec statements were corrected from the code (D-3 `--ptah-surface-pad` is in use;
D-4 there is no popover mode at line ~131); both corrections keep the approved behaviour.

## Revision log

Round 1 (review `implementation-plan-review.md`, coordinator answers `decisions.md` rows 26-29):

| Review item | Plan section changed |
|---|---|
| Serious 1: header rows | header line 3 (rows 6-29) |
| Serious 1: kind badges coloured text, gold token | 3.5 identity bullet; Risks (contrast row); Phase 3 Tests (decisions 16, 26); D-17 |
| Serious 1: group gap 1.75rem | 3.7 group headers; Phase 3 test ids (no `lanes-group-gap`); Phase 3 Tests; D-18 |
| Serious 1: Reorder closes detail, not-enabled lanes stay | 3.7 Reorder mode; Phase 3 Tests (2 rows) |
| Serious 2: setting-row opt-in | 1.7 (NEW `controlAlign`, `edgePadding`); Phase 1 Blast radius row (13 callers, "unchanged by default"); Phase 1 Tests; B1.4 acceptance; 2.3, 2.4, 2.8 set the inputs; Risks; D-15 |
| Serious 3: typecheck green per batch | 3.6 (old detail API kept), 3.7 (grid keeps old outputs, table filters rows), Phase 3 Batches (B3.5 split into B3.5/B3.5b, B3.6 write set, B3.7/B3.7v, B3.9 includes the grid, NEW B3.11b, order list, API-removal table, red window); Phase 1 and Phase 2 typecheck notes (B2.7/B2.8 `BuiltinKind`); D-16 |
| Minor 1 `showCloseButton` | 1.5 |
| Minor 2 chat-input opt-out | 1.9 (row removed, reason stated), B1.5 (4 files), Phase 1 Tests, Risks, D-5 |
| Minor 3 FloatingUIService callers | Phase 1 Blast radius |
| Minor 4 popover callers | Phase 1 Blast radius (`overlays/popover` is not a caller; `field.component.ts:114` is) |
| Minor 5 account-detail-view modal | Phase 1 Blast radius |
| Minor 6 overflow clipping | Phase 1 Blast radius; B1.2 acceptance |
| Minor 7 guessed modal spec query | Phase 1 Tests (sentence deleted) |
| Minor 8 output-style notices / parity | 2.5 (sentence changed: no change in this task) |
| Minor 9 duplicate `policy-redetect` | Phase 3 Batches "Duplicate-id window"; Risks |
| Minor 10 B3.10/B3.11 spec list | Phase 3 focused checks text |
| Minor 11 zero-reference grep first | 3.10, 3.11 step 1 (incl. `apps`, selectors, e2e); B3.10, B3.11a acceptance |
| Minor 12 batch size | NEW B3.7v (visual spec), B3.5b (default cell) |
| Not checked (a) `size` export | 1.9 note (`@floating-ui/dom` 1.8.0, `floating-ui.dom.d.ts:336`) |
| Not checked (b) e2e files and ids | 3.12 (verified list); B3.12 write set corrected (`settings-providers-gate.shot.ts` in, `workspace-settings.shot.ts` out) |
| Not checked (c) zero-reference state | 3.10, 3.11 step 1 (current hits listed) |
| Not checked (d) Ptah detail line 2 | 3.6 (no Provider fact in the Ptah detail; CLI Provider is not line 2) |


Round 2 (review `implementation-plan-review-2.md`, coordinator rulings of round 2). Every finding was checked against the
code at its cited file:line. Phase 1 sections and B1.x were not edited.

| Review item | Verdict | Plan section changed |
|---|---|---|
| Blocking 1: writes spec calls `moved.emit` / `redetect.emit` (`:481,:522,:604`) | confirmed | 3.7 (Reorder write, outputs); NEW B3.7a owns `:481,:522` with the producer and the matrix; `redetect` stays (D-20), `:604` updated in B3.7b; focused checks name the library `tsc` and the spec `tsc` separately; API-removal table lists spec callers |
| Blocking 2: visual spec subscribes to `installGuide` (`:602`) | confirmed | B3.7v removed; `:601-606` in B3.2, `:589-598` in B3.5, `:602` in B3.7b; "Red spec windows: none" |
| Serious: identity test red from B3.2; matrix spec `:390,:531` stale | confirmed | 3.2 spec migration bullet; B3.7b write set has both matrix specs; B3.8 moved before B3.7b so the strip binds in the batch that moves the rows |
| Serious: 2.6 confirm semantics | confirmed (`aria-modal` absent; no guard at `:329-351,:549-556`; `requestClose` `:505-518`) | 2.6 rewritten (position, parity list, `confirmOpen` guards); Phase 2 Tests (`OSE.spec`); B2.5; D-23 |
| Serious: 2.6 "active-rename Reload-only case" | not found: `:172-204` holds 3 stale variants (Close only `:172-180`; Discard and reload / Back `:181-190`; Overwrite / Reload / Cancel `:191-206`). The plan keeps these 3 with every action | 2.6 parity bullet |
| Serious: 2.8 Codex section has no form section | confirmed (`codex-sandbox-setting.component.ts:113,:122-136`) | 2.8 Codex bullet; Phase 2 Tests; B2.6 write set (+ spec) |
| Serious: Cursor sign-in disappears | confirmed (`cli-matrix-rows.ts:363-366`, `:505`) | 3.7 rows table + recovery row; 3.8 membership; 3.9 `recoveryRows` / `stripRows` / `tableRows`; 3.6 install branch and footer; Tests; D-19, D-20, D-22 |
| Serious: Reorder write path | confirmed (`move-preferred-agent-order.ts:1-16`, `preferred-agent-order-save.ts:12-16`, writes spec `:508-539`) | 3.7 Reorder write (`applyDisplayedAgentOrder`, `reorderLanes`); NEW B3.7a; 3.3 re-exports both move types; Tests; Risks; D-21 |
| Serious: popover overrides (`:93-99`, `:88-94`); matrix `:407` | confirmed | 3.2 spec migration; B3.2 and B3.6 write sets |
| Serious: strip input type; B3.11b narrowing | confirmed (`cli-provider-card-popovers.component.ts:42`; `lanes-table-detail.component.ts:97-101`) | 3.8 `readonly SystemCliMatrixRow[]`; 3.6 (`infoKinds` deleted in B3.6; declared types keep their text; grep gate); B3.11b reduced to the popovers file |
| Serious: Ptah group defaults bindings | confirmed (`name` required `:423`; reset hidden `:230`) | 3.5 default cell (`resetVisibility`); 3.7 binding snippet; B3.5b acceptance; Tests (P-59) |
| Serious: install focus selector | confirmed (`cli-orchestration-matrix.component.ts:363-367`) | 3.8 Focus bullet (strip owns focus; `showInstallGuide` deleted in B3.7b); 3.9 keeps `:509-512` |
| Serious: e2e behaviour beyond id renames | confirmed at each cited line | 3.12 behaviour table; 3.9 (`lanes-max-concurrent` id); 3.7 hooks `lanes-group-ptah`, `lanes-ptah-defaults`; B3.12 acceptance |
| Serious: legacy Capabilities action | confirmed (`lanes-table-detail.component.html:160-201`; matrix `:358-361`) | 3.6 (install-only branch, `[data-lane-capabilities]` route, `:254-276` kept); B3.6 write set (+ matrix selector) |
| Minor: mojibake locations, spec prediction, `FileText` scope | confirmed (`:69,:477`; spec has 0 matches; Sparkles at `:103,:273,:309`) | 2.7; Phase 2 Tests (`SPD.spec`); B2.5 acceptance |
| Minor: editor tests and placement | confirmed (`OSE.spec:438,:578-594`; form closes at `:325`) | 2.6 position bullet; Phase 2 Tests |
| Minor: shared group path | confirmed (`advanced-settings-group.component.ts:170-185`; 3 other call sites) | 2.8 (no icon at `:179`; NEW `rowLayout` input set only by Fine-tuning); B2.6 (+ `advanced-settings.component.ts`, depends on B2.1) |
| Minor: `:348` anchor; `place` union | confirmed (`:348` is the Effort test; `openCell.place` is `'cell' \| 'detail'`) | 3.2 snippet (`'cell' \| 'detail'`); B3.6 cites `:181,:200` |
| Minor: VS Code LM icon | confirmed (`vscode-lm-config.component.ts:52`) | 2.8 VS Code LM bullet |

# UI/UX review: Settings > Advanced and the Settings shell (Electron)

Method: code and screenshot review only (evidence 1, 3, 4). Nothing was built or run.
Paths below are relative to `libs/frontend/` unless a full path is shown.
Short names: `CHAT` = `chat/src/lib/settings`, `UI` = `ui/src/lib`.

## Summary

- Root cause of the padding defect: every Advanced section sets `data-glass-surface="content"` (a fill and radius, no padding) around `ptah-form-section`, which has only `py`. The 1.25rem inset exists only in per-component styles that the Advanced sections do not have (F1).
- Row dividers and the right column bleed for the same reason; rows also keep a divider on the last row because of a footer div after the content (F2, F3).
- Overflow risk is in the popovers (no max-height, no size middleware) and in the system-prompt drawer (borderless inner boxes, unpadded footer, fixed `max-h-96`). The drawers themselves are viewport-bound with an internal scroll (F10-F13).
- Buttons and icons: Export, Import, Details, Preview and New style should be icon plus short label or icon-only with the existing tooltip. Lucide is the only icon library (52 imports). Section headers have no icons (F14-F22).
- "Claude Code tools & skills" needs collapsible groups, a filter, group toggles and a sticky token summary. The round checkboxes are a theme-radius effect; use switches (F23-F28). Shell findings: F29-F34.

## Findings

Severity: Blocking / Serious / Moderate / Minor.

### Alignment and padding (defect 1)

| # | Sev | Cat | file:line | What is wrong | Exact fix |
|---|-----|-----|-----------|---------------|-----------|
| F1 | Blocking | alignment | `CHAT/license/license-status-card.component.ts:108`, `CHAT/pro-features/agent-behaviour-section.component.ts:127`, `CHAT/pro-features/claude-builtins-config.component.ts:88`, `CHAT/output-style/output-style-config.component.ts:67`, `CHAT/pro-features/mcp-port-config.component.ts:89`, `CHAT/pro-features/vscode-lm-config.component.ts:47`, `CHAT/advanced-settings.component.ts:167`; `UI/patterns/form-section/form-section.component.ts:53` | The glass surface gives a fill, radius and shadow but no padding. `ptah-form-section` pads only top and bottom (`py-[var(--ptah-gap-group)]`). Title column, right column, alert and dividers touch the card edge. The 1.25rem padding exists only in `CHAT/advanced/advanced-settings-group.component.ts:381-383`, `CHAT/advanced/codex-sandbox-setting.component.ts:301` and the `ptah-ai/*` components, and Angular emulated encapsulation scopes each rule to its own template. | Move the inset into one place. Preferred: give `ptah-form-section` a `surface` input (or host style) that adds `px-[var(--ptah-surface-pad-x)]`, with the token set to `1.25rem` in `ptah-tokens.css` (`--ptah-surface-pad` is 1rem today and fits no consumer). Put the padding on the `[data-glass-surface=content]` element in the global glass block (`apps/ptah-extension-webview/src/styles.css:3238`) as `padding: var(--ptah-card-pad)`, then delete the 14 per-component copies. Never leave a surface without padding. |
| F2 | Serious | alignment | `CHAT/settings.component.html:146`, `CHAT/settings.component.ts:154-157` | The Setup card (`data-glass-surface="content"`) is documented as "same inset as theirs" but has `style="padding: 0"`. The scoped rule at `settings.component.ts:155` would give it 1.25rem and the inline style cancels it. Setup and the other cards therefore differ. | Delete the inline `style="padding: 0"` and the scoped rule in `settings.component.ts:154-157` once F1 lands in the global rule. |
| F3 | Serious | alignment | `UI/patterns/setting-row/setting-row.component.ts:20`; `CHAT/pro-features/agent-behaviour-section.component.ts:160,212,253,286` | The row host already has `border-b ... last:border-b-0`. Each row adds a second `[border-bottom...] last:[border-bottom:0]`. `last:` never matches, because the last child of the fields column is the `[footer]` wrapper div (`form-section.component.ts:99`). So the last row ("Chat reasoning effort", screenshot 3, y~640) keeps a divider that runs to the card edge. | Remove the duplicate class from the 4 rows. In `form-section.component.ts:99` render the footer wrapper only when content exists: `@if` is not possible for projection, so use `[&>[data-ptah-pattern=setting-row]:last-of-type]:border-b-0` on the fields container (line 92) or wrap rows in `<div class="divide-y divide-[var(--ptah-border-color)]">` and drop per-row borders. |
| F4 | Serious | alignment | `CHAT/pro-features/agent-behaviour-section.component.ts:183,228,273,308` | Control column is `w-56` with `justify-start` for toggles and a `w-56` select. Toggle, Details and info icon sit at the left of a 14rem box, the select fills it. Controls do not share one right edge or one left edge (screenshot 3: toggles x=1290, info icon x=1345, select 1290-1512). The extra icons (Details, Info) make the toggle rows differ from the toggle-only row. | Use one control cell `flex w-56 items-center justify-end gap-[var(--ptah-gap-controls)]` for all four rows. Toggle is the last element at the right edge. Row actions (Details, Info) go before the toggle, in a fixed `size-8` slot, so toggles align. Select keeps `w-56`. |
| F5 | Serious | alignment | `CHAT/license/license-status-card.component.ts:112-134,135-157` | The aside badges ("Community", "Needs Attention") repeat the Plan and State rows in the description list under them (screenshot 3 shows both). The same fact appears twice in one card. | Keep the status in one place. Recommended: aside shows only the badge pair, and the description list keeps Account only (plus Plan if no badge). Or drop the aside and keep Plan and State. |
| F6 | Moderate | alignment | `CHAT/license/license-status-card.component.ts:158-337,343-371` | Buttons, then the alert, then the profile confirm stack inside the fields column with `gap-field` but the alert is a full-width banner with a `Re-enter Membership Key` button that repeats the key button above it (line 170-192). One key action appears twice, with a different label. | Keep the alert and use it as the only "enter key" call to action while the alert is shown: hide the toolbar's `Enter Membership Key` when `isCommunity() && licenseReason()` (line 343 condition), or make the alert action the primary. Keep one label: "Enter membership key". |
| F7 | Moderate | alignment | `CHAT/output-style/output-style-config.component.ts:64-70` | This card is hand-built (`<section>` with `py` and `border-b`) instead of `ptah-form-section`. Its header is a full-width row (title left, New style right) and the content uses the whole width, while the other cards use the 15rem aside + fields columns. Screenshot 3: the Output style card has a different layout and no left or right padding. | Use `ptah-form-section` with `[wide]="true"` for the shell, and put the "New style" icon button in the header action position of the card (see section pattern below). The card grid then lines up with the other cards. |
| F8 | Moderate | alignment | `CHAT/advanced-settings.component.ts:98-100,212-217`; `CHAT/settings.component.html:132` | Section gap is applied twice and only with glass on (`[[data-glass=on]_&]:gap...` in the html, `:host-context([data-glass='on']) ... gap` in the component). Without glass sections touch each other, separated only by a divider. | One rule: `gap-[var(--ptah-gap-section)]` on the `[data-advanced-sections]` div (line 99), remove the html class and the style block. |
| F9 | Minor | alignment | `CHAT/pro-features/agent-behaviour-section.component.ts:161-165` (and 213-217, 254-258, 287-291) | The row hint is a `status` slot span with `basis-full truncate`. The hint is cut with an ellipsis at narrow widths and then exists only in the `title`. Descriptions are the explanation of the setting, not decoration. | Use `setting-row` `hint` input (it wraps) and remove the truncation. Keep the `aria-describedby` target id the same (`hintId()`). |

### Modals, drawers and popovers (defect 2)

| # | Sev | Cat | file:line | What is wrong | Exact fix |
|---|-----|-----|-----------|---------------|-----------|
| F10 | Serious | overflow | `UI/native/popover/native-popover.component.ts:105-110`, `UI/native/shared/floating-ui.service.ts:163-175` | Every popover panel (membership key, Preview, Ultracode info, help) has `p-2`, no `max-height`, no `overflow-auto`, and positioning uses only `offset`, `flip` and `shift`. There is no `size()` middleware. When the content is taller than the space on either side of the trigger, the panel is cut by the window. | Add `size({ padding: 8, apply({ availableHeight, elements }) { elements.floating.style.maxHeight = `${Math.max(160, availableHeight)}px` } })` to the middleware list, and add `overflow-y-auto overscroll-contain` plus `max-w-[calc(100vw-1rem)]` to the panel at line 107. |
| F11 | Serious | overflow | `CHAT/license/license-status-card.component.ts:197` | The membership key entry is a popover (`role="dialog"`) with `w-80 max-w-[calc(100vw-2rem)]` and no max-height. The field, help text, error and Activate button stack; with the error line on a short window the Activate button can fall under the window edge. | Add `max-h-[calc(100dvh-2rem)] overflow-y-auto` on the content div (line 197). F10 makes this automatic. Consider a small modal (see F36 decision) because a credential entry fits a centred dialog better than a floating panel. |
| F12 | Serious | overflow | `CHAT/pro-features/system-prompt-drawer.component.ts:323-325,128-131,154-158,196,297` | Drawer body scrolls (`UI/native/drawer/native-drawer.component.ts:111`), so the drawer itself is safe. Inside it: the footer has `border-t` but no padding, the error, status and metadata boxes have a border and no padding (text touches the border), and the preview box is `max-h-96` (24rem) inside the scrolling body. On a 600px window the drawer chrome, the body and the 24rem box scroll twice. The footer row (Regenerate, Download, Close) has no `flex-wrap` and overflows below ~360px width. | Footer: `px-4 py-3 flex flex-wrap`. Alert and status boxes: add `p-[var(--ptah-gap-controls)]` and `border-base-300`. Preview: `max-h-[min(24rem,50dvh)]`. Drop the text "Close" button (line 385-393): the drawer already has a close icon (F13). |
| F13 | Moderate | a11y | `UI/native/drawer/native-drawer.component.ts:98-106` | Drawer close is a `btn btn-ghost btn-square` with a text `×` glyph (`text-base`), while the page uses lucide `X` elsewhere (`license-status-card.component.ts:220`). The `label` "Close panel" is fine, but there is no tooltip and the glyph is not the icon library. | Replace with `<button ptahIconButton label="Close panel"><lucide-angular [img]="XIcon" .../></button>` (`ptahIconButton` gives the tooltip and aria-label). |
| F14 | Serious | overflow | `CHAT/output-style/output-style-editor.component.ts:144-208` | The discard, conflict and stale-file confirms are `role="alertdialog"` blocks rendered at the top of the scrolling drawer body, above the form. A user who scrolled to the instructions field and clicked Cancel gets the confirm out of view; focus moves to `#safeChoice` which scrolls it in, but Save/Cancel in the footer stay active and the page behind looks unchanged. They also have no `aria-modal` and no max-height. | Render the confirm in the drawer footer slot (replace the buttons while open), or call `scrollIntoView({block:'nearest'})` and make the block `sticky top-0 z-[var(--ptah-z-raised)] bg-base-100`. Use `ptah-inline-confirm` (already used for import and log out) for consistency. |
| F15 | Moderate | overflow | `CHAT/output-style/output-style-instructions-field.component.ts:86,101-109` | The preview region is `max-h-64 overflow-y-auto` and the textarea is `rows="5"`. Neither is related to the viewport. In a drawer on a short window the instructions textarea and preview together exceed the visible body; the body scroll saves it, but the textarea cannot grow and the preview shows a nested scrollbar. | Textarea: `min-h-32 max-h-[50dvh] resize-y field-sizing-content`. Preview: `max-h-[min(16rem,40dvh)]`. |
| F16 | Moderate | overflow | `CHAT/output-style/output-style-list.component.ts:217`, `CHAT/pro-features/agent-behaviour-section.component.ts:244-249`, `CHAT/advanced/advanced-settings-group.component.ts:151-153` | Help popovers use `max-w-xs`/`max-w-sm` and `keepInViewport`, so width is bounded. Height is not (F10). | Covered by the F10 fix. Add `max-h-[min(20rem,60dvh)] overflow-y-auto` where text can grow. |
| F17 | Minor | overflow | `UI/native/drawer/native-drawer.component.ts:70,82,208`; `CHAT/pro-features/system-prompt-drawer.component.ts:92`; `CHAT/output-style/output-style-editor.component.ts:100` | Both drawers: `fixed inset-0` layer, panel `h-full` (viewport-bound), body `overflow-y-auto`, `w-full max-w-lg`. This is correct. The only gap: `max-w-lg` (32rem) of a wide drawer is narrow for a prompt preview. | Keep. Optionally `w-full max-w-[min(40rem,100vw)]` for the prompt drawer so the markdown preview has room. |

### Buttons and icons (defect 3)

Icon library: `lucide-angular` only (52 imports, no other icon package found in `CHAT/`). Icons already imported in settings: `Download, Eye, EyeOff, Pencil, Trash2, Plus, Info, Key, Palette, Sparkles, ShieldCheck, Plug, Layers, SlidersHorizontal, TableProperties, AudioLines, Clock, RotateCw, RefreshCw, Bot, Mic, AlertCircle, AlertTriangle, ExternalLink, LogOut, UserPlus, Check, ChevronRight/Down/Up, Ellipsis, GripVertical, X`. `ptahIconButton` takes a required `label` that becomes the tooltip and the aria-label (`UI/button/icon-button.directive.ts:36,44`). Names not imported yet but standard lucide: `Upload`, `Wrench`, `Search`, `ListFilter`, `Terminal`, `Database`, `Gauge`, `Brain`, `Workflow`. Check each against the installed lucide-angular version before use (no `node_modules` in this worktree to confirm).

| # | Sev | Cat | file:line | What is wrong | Exact fix |
|---|-----|-----|-----------|---------------|-----------|
| F18 | Moderate | buttons | `CHAT/advanced-settings.component.ts:132-154` | "Export settings" and "Import settings" are text-only secondary buttons with no icon. They are a pair of related actions. | Icon plus label, both visible: `Download` + "Export settings", `Upload` + "Import settings". Keep `aria-label` text equal to the visible label (remove the redundant `aria-label`, it adds nothing and breaks voice control only if different). |
| F19 | Moderate | buttons | `CHAT/pro-features/agent-behaviour-section.component.ts:194-208` | "Details" is a ghost text button with a chevron. It opens a drawer; chevron says "expand". | Icon-only `ptahIconButton` label "System prompt details" with `PanelRightOpen` (or `Eye`), size sm, placed in the F4 action slot. A one-word label next to a toggle adds clutter, the tooltip is enough. |
| F20 | Moderate | buttons | `CHAT/output-style/output-style-list.component.ts:216` | "Preview" on built-in cards is a ghost text button (screenshot 3) in the same line as Edit/Delete icon buttons used on user styles (Edit/Delete show icon plus text only when allowed, lines 238-262). Inconsistent: built-ins get a word, user styles get icons. | Icon-only `Eye` with label "Preview {name}" for built-ins, `Pencil` "Edit {name}" and `Trash2` "Delete {name}" for user styles. Same size `xs`, same slot, right-aligned in the card footer. Remove the `@if (style.editable) { Edit }` text. |
| F21 | Minor | buttons | `CHAT/output-style/output-style-config.component.ts:76-81` | "New style" is a primary button with `Plus`. It is the only primary action on the card and is fine with a label, but it competes with the page primary "Create Account". | Keep icon plus label, change to `variant="secondary"`. |
| F22 | Moderate | icons | `UI/patterns/form-section/form-section.component.ts:59-71` | Section titles have no icon. Nav items have icons, section headers do not. | Add an optional `icon` input (`LucideIconData`) rendered `size-[var(--ptah-icon-md)] text-base-content-muted` before the `h2/h3`. Icons: Membership & data `Key` (or `ShieldCheck`), Agent behaviour `Bot`, Output style `Palette`, MCP & Browser `Plug`, Claude Code tools & skills `Wrench`, VS Code language model `Cpu`, Fine-tuning `SlidersHorizontal`, Setup `RefreshCw`. |
| F23 | Moderate | icons | `CHAT/license/license-status-card.component.ts:112-134,144-150` | Statuses are plain text with a diamond ("Needs Attention", "Active", "Inactive"). Plan has no icon. | Keep `ptah-status` but pair it with an icon: `Check` (active), `AlertTriangle` (needs attention), `X` or `AlertCircle` (inactive). Plan badge: `Sparkles` for Builder (exists), `Layers` or none for Community. |
| F24 | Minor | icons | Empty and state surfaces: `CHAT/pro-features/claude-builtins-config.component.ts:230-237`, `CHAT/output-style/output-style-list.component.ts:119-121`, `CHAT/pro-features/system-prompt-drawer.component.ts:305-318` | Empty states: claude.ai skills empty box (text only, no icon), output-style loading text, system-prompt empty state uses `Sparkles` 8x8, which is also the icon of "View Generated Prompt" (line 272), "Explore Ptah Builders" and the Builder badge. | Synced skills empty: `CloudOff` or `Package` icon above text. Prompt empty: `FileText`. Reserve `Sparkles` for membership only. Prompt preview toggle: `Eye`/`EyeOff` (both already imported elsewhere). |
| F25 | Minor | buttons | `CHAT/license/license-status-card.component.ts:301-316` | "Explore Ptah Builders" (ghost) next to "Create Account" (primary) plus "Enter Membership Key" (secondary): three calls to action in one row for the Community state. | Keep Create Account as the only primary; make Explore an icon-less `link` variant or move it to the aside. |

### "Claude Code tools & skills" (defect 4)

| # | Sev | Cat | file:line | What is wrong | Exact fix |
|---|-----|-----|-----------|---------------|-----------|
| F26 | Serious | structure | `CHAT/pro-features/claude-builtins-config.component.ts:123-279` | One flat page with three groups (6 tools, N terminal skills, M synced skills), each with `h3`, one explanation paragraph, a row per item with a border and 48px minimum height (`min-h-12`, line 136) and a description line per skill. All groups open, no search, no group count, no bulk action. Screenshot 4 shows ~17 rows before the third group. | Use the structure in "Proposed structure": three `ptah-disclosure` groups (`UI/patterns/disclosure`), header with count, token subtotal and group switch; filter field above; two-column dense rows (`grid-cols-1 @min-[44rem]:grid-cols-2`) with a `Switch` and name, description as `title` and a one-line `text-[length:var(--ptah-text-hint-size)] truncate` secondary text. |
| F27 | Serious | structure | `...claude-builtins-config.component.ts:93-96,341` | The savings summary lives in the aside column and scrolls away with the card. The state ("Saved per turn 7,600 tokens") is the main feedback of this card. | Make it a sticky summary bar at the top of the fields column: `sticky top-0 z-[var(--ptah-z-raised)] bg-surface-1/90 backdrop-blur`, showing "Saved per turn ~7,600 tokens", "n of N on" and the max possible. Keep `aria-live="polite"` and `data-testid="claude-tools-savings"`. |
| F28 | Moderate | structure | `...claude-builtins-config.component.ts:100-107,124-130,165-168,224-229` | Four explanation blocks (info note, three group paragraphs) before any control. The info note is a hand-built bordered div duplicating `ptah-alert` tone `info`. Group titles carry "(off by default)" / "(hidden by default)" text. | Replace the note with `ptah-alert tone="info"` of one line, or fold it into the description (aside). Move group paragraphs to a `title`/info popover; put "off by default" in the group header as a badge `Off by default`. |
| F29 | Moderate | a11y | `...claude-builtins-config.component.ts:98,89` | The component renders `aria-labelledby="claude-tools-heading"` on `ptah-form-section` and an extra `sr-only` `h2` with the same text while `ptah-form-section` already renders its own heading (`h3`, id `...-title`). Two headings with the same name for one section. | Remove the `sr-only h2` and `aria-labelledby`; set `[level]="2"` on the form section like the other cards (`agent-behaviour-section.component.ts:136`). |
| F30 | Moderate | alignment | `...claude-builtins-config.component.ts:131,169,239` | Each list is wrapped in `overflow-x-auto`: at narrow width a horizontal scrollbar can appear inside a vertically scrolling page, and the token badge is the part that disappears. | Remove the wrappers; use `min-w-0` + `truncate` on the label and a `shrink-0` badge. |
| F31 | Moderate | alignment | `...claude-builtins-config.component.ts:136-147 vs 174-191` | Tool rows use `ptah-setting-row` (checkbox placed in the `status` slot with `-order-1`, badge in `meta`), skill rows use a hand-built 3-col grid. Row height, checkbox x-position and badge position differ between the groups (screenshot 4: tool rows 49px, skill rows 58px). | One row component for all three groups. Check the "Proposed structure" row; do not use `ptah-setting-row` for these (its title/hint/control model has no place for a leading control). |
| F32 | Moderate | a11y | `...claude-builtins-config.component.ts:139` + `UI/form-controls/checkbox.directive.ts:12`, `UI/form-controls/ptah-form-controls.css:163-185` | Why they look like radio buttons: the directive is `checkbox checkbox-primary checkbox-xs` (DaisyUI). DaisyUI's checkbox radius is `var(--rounded-selector)` (theme variable). `ptah-form-controls.css` sets border, checked colour and focus only (lines 163-185), no radius, so the radius comes from the active theme; the screenshot shows fully round unchecked boxes with no check glyph until checked (and the glass rule `styles.css:3404-3408` only changes border and fill). Unchecked state is an empty circle = the radio affordance. Not confirmed per theme; verified only from the screenshot and the CSS above. | These rows are on/off settings. Use `ptahToggle` (as Agent behaviour does) for every row: label left, switch right, fixed `w-9`. If checkboxes must stay: add `rounded-[var(--ptah-radius-checkbox,0.25rem)]` to the `.checkbox[data-ptah-control]` rule in `ptah-form-controls.css` so the shape is square in every theme. |
| F33 | Minor | a11y | `...claude-builtins-config.component.ts:231-237` | The empty state is a dashed box with `text-xs`; centred bold + muted text. Fine, but no icon (F24). | Add icon; keep text. |

### Settings shell (defect 5)

| # | Sev | Cat | file:line | What is wrong | Exact fix |
|---|-----|-----|-----------|---------------|-----------|
| F34 | Moderate | alignment | `CHAT/settings.component.html:18,39`; `UI/patterns/settings-layout/settings-layout.component.ts:92` ; tokens `ptah-tokens.css:518,522` | Left-nav text alignment: "Settings" title has `px-.75rem`, the footer has `p-.75rem`, and the nav items start their label at `item-pl .875rem` plus the nav padding `.75rem` (1.625rem) with an icon first. The title text, the item icons and the footer text start at three different x values. | Define one inset: `--ptah-settings-nav-px: .75rem` for the container, and make the header `h2` and footer use `px-[var(--ptah-settings-nav-item-pl)]` so the title aligns with the item icons. |
| F35 | Moderate | icons | `UI/patterns/settings-layout/settings-layout.component.ts:218-240` | The page header has title and description only. The nav items carry icons (`settings.component.ts:170-183`) but the page `h1` does not, so the icon disappears after navigation. | Add `icon = input<LucideIconData | null>(null)` to the layout, render it in the header before the title (`size-[var(--ptah-icon-lg)]`), and bind `activeTabIcon()` in `settings.component.html:9`. |
| F36 | Moderate | icons | `CHAT/settings.component.ts:169-184`, layout `stateMark` at `settings-layout.component.ts:62-67,195-200` | The layout supports a `stateMark` dot per nav item but `settingsTabs` never sets it, so a problem is invisible from other tabs. Advanced has "Needs Attention" membership and the overview store already carries tones (`advanced-overview.store.ts`). | Add `stateMark: { tone: 'warn', label: 'Membership needs attention' }` for the Advanced item when `licenseReason()` is set (via `ChatStore.licenseStatus()` which the settings page already reads through `AuthStateService`). |
| F37 | Moderate | alignment | `CHAT/settings.component.html:1`; `UI/patterns/settings-layout/settings-layout.component.ts:36-38,137,214-215` | Scroll and padding: the one scroll container is `.settings-page h-full overflow-y-auto [container-type:size]`. The layout frame is `p-[gutter]` below 640px and `p-0` at 640+, while the main column adds `p-[gutter]` back at 640+ (line 215) and caps at `--ptah-settings-content-max-w: 96rem`. The nav is `sticky top-0` with `height: 100cqh` and `border-r`. Net effect: the nav is flush to the left window edge, the content has the gutter, the right side has the gutter, but the scrollbar sits at the window edge, so the glass cards (screenshot 3 left x=24, right 1513 vs scrollbar x=1562) look asymmetrical (24px left, ~49px right incl. scrollbar). | `scrollbar-gutter: stable both-edges` on `.settings-page`; keep one gutter source (the main column), drop the frame's `p-gutter` below 640 by moving it to the main column too. |
| F38 | Minor | structure | `UI/patterns/settings-layout/settings-layout.component.ts:214,243` | Content width `96rem` (1536px) with fields column `36rem` max for non-`wide` sections and `wide` for most Advanced sections. On a 1600px window `wide` sections stretch labels and controls 1100px apart (screenshot 3: "System prompt mode" label at x=297, toggle at x=1290). The eye has to travel the full width to match a label to its control. | Cap Advanced rows: set `--ptah-settings-content-max-w` to `64rem` for this tab, or cap the fields column of rows (`max-w-[48rem]`) and keep only the Output style card grid and the tools list `wide`. |
| F39 | Minor | a11y | `CHAT/settings.component.html:13-18` | There are two headings for the page: the nav `h2` "Settings" and the page `h1` (tab title). The mobile strip hides the nav header (`[@container(min-width:640px)]:hidden`) so the Back control becomes an icon button without the text. Fine, but the nav `h2` is the first heading and the order h2 > h1 is out of order. | Make the nav title a `<p>` or `aria-hidden` text label; the `h1` is the page title. |
| F40 | Minor | a11y | `UI/patterns/settings-layout/settings-layout.component.ts:196` | The `stateMark` is `role="img"` with `aria-label`, fine, but it has no visible text, only a dot and a count. | Keep; add `title` equal to the label. |

### Misc encoding / consistency

| # | Sev | Cat | file:line | What is wrong | Exact fix |
|---|-----|-----|-----------|---------------|-----------|
| F41 | Serious | a11y | `CHAT/pro-features/system-prompt-drawer.component.ts:168,192,248,293,347,373` | Mojibake in the source: `'â€”'`, `statusâ€¦`, `guidanceâ€¦`, `contentâ€¦`, `Generatingâ€¦`, `Downloadingâ€¦`. The user sees broken characters for the elapsed time dash, the loading messages and the button labels. | Replace by `—` and `…` as UTF-8 (or `&mdash;`, `&hellip;`). Check the file's encoding is UTF-8 without a second conversion. |

## Proposed structure

### Standard Advanced section and row

Tokens: gutter `--ptah-page-gutter` 1.5rem; card padding `1.25rem` (new `--ptah-card-pad`); aside column `--ptah-form-section-aside-w` 15rem; gap between columns `--ptah-gap-section` 2rem; row padding `py-ptah-field` (1rem); control column fixed `w-56` for select/inputs and `w-auto` for switches, always right-aligned.

```
+-- section card [data-glass-surface=content]  p-5 (1.25rem all sides) ------------------+
|  +-- aside (15rem) -------+   +-- fields (min-w-0, flex-1, max-w 48rem unless wide) --+ |
|  | [icon] Section title   |   | row  label + hint (wraps)            [action][ctrl]  | |
|  | muted description      |   |------------------------------------------ divider --| |
|  | [status badge]         |   | row  label + hint                    [action][ctrl]  | |
|  +------------------------+   | row  label + hint                    [ctrl w-56   ]  | |
|                               | (last row: no divider)                               | |
|                               | banner / alert: full column width, same radius       | |
|                               +------------------------------------------------------+ |
+------------------------------------------------------------------------------------+
  section gap: --ptah-gap-section (2rem), identical with and without glass

Row:  grid [minmax(0,1fr) auto]  gap-x 1.5rem  items-center  py 1rem
      left : label (font-medium) / hint (muted, wraps, never truncated)
      right: flex justify-end gap-2 -> [info/details icon-button size-8][control]
             the toggle is always the right-most element; select is w-56
Header action (e.g. New style, Export/Import): top right of the fields column,
      icon + label (secondary) or icon-only with tooltip.
```

### "Claude Code tools & skills" (new layout)

Data the component has now (`claude-builtins-config.component.ts:305-327`): `tools()` (id, description, approxTokens), `terminalSkills()` and `syncedSkills()` (id, name?, description, approxTokens, needsTool?), `enabledTools()`, `enabledSkills()`, `loadState()`, `hiddenTokens()`, `savingsLabel()`, helpers `isToolOn`, `isSkillOn`, `isDependencyBlocked`, `skillName`, `cost`, `toggle(kind,id,event,name)` (one atomic RPC per id).

Needs additionally (all derivable, no new RPC): `query` signal and `filtered*` computeds, per-group `onCount`/`total`/`tokenSubtotal` computeds, `expanded` signal per group, a `toggleGroup(kind, ids, on)` that loops `toggle` serially (the save is serialised by `saving()`, so a group switch must queue the calls or use a new batch RPC; see Clarifications).

```
+-- Claude Code tools & skills  [icon Wrench]  Turn off tools you do not use. -----------+
| (i) Changes apply to new sessions. Applies to all workspaces.          (one line alert)|
| +-- sticky summary -------------------------------------------------------------------+|
| | Saved per turn  ~7,600 tokens        6 of 17 tools on      [ Filter...   (search) ] ||
| +---------------------------------------------------------------------------------- -+|
| v Built-in tools   [Off by default] 0/6 on  ~3,000 tokens      [All on][All off]       |
|   +-----------------------------------+ +-----------------------------------+          |
|   | [switch] Workflow        ~2,000   | | [switch] ReportFindings    ~850   |          |
|   | [switch] PushNotification   ~10   | | [switch] DesignSync         ~10   |          |
|   | [switch] EnterWorktree      ~10   | | [switch] ExitWorktree       ~10   |          |
|   +-----------------------------------+ +-----------------------------------+          |
| > Terminal-only skills  [Off by default] 0/11 on  ~1,900 tokens   [All on][All off]    |
| > Synced from claude.ai [Hidden by default] 0/0   (empty: icon + one line)             |
+--------------------------------------------------------------------------------------+

Row (dense): [switch] name (font-medium, truncate)  .. token chip  [needs: Workflow]
             description: one line, truncate, full text in title tooltip
             dependency-blocked skill: warn chip "Workflow is off" + aria-describedby
Wide (>= 44rem container): two columns. Narrow: one column.
Collapsed groups show only the header; the first group with an enabled item opens by default.
```

## Modal inventory

Reachable from Settings > Advanced. File dialogs for Export/Import are host (OS) dialogs and are not Angular overlays.

| Component | File | max-height? | scroll area? | can overflow? | fix |
|---|---|---|---|---|---|
| System prompt drawer (`ptah-native-drawer`) | `CHAT/pro-features/system-prompt-drawer.component.ts:90`, `UI/native/drawer/native-drawer.component.ts:70-111` | Yes: `fixed inset-0` + panel `h-full` (viewport) | Yes: body `overflow-y-auto` (line 111) | Width no (`w-full max-w-lg`). Height: footer row unpadded and non-wrapping, preview `max-h-96` nested in body scroll (double scroll on short windows) | F12, F13, F17 |
| Output style editor drawer | `CHAT/output-style/output-style-editor.component.ts:98`, same drawer | Yes (viewport) | Yes (drawer body) | Inline `alertdialog` confirms at the top of the scroll body can be out of view; textarea `rows=5` and preview `max-h-64` not viewport based | F14, F15 |
| Output style preview (built-in) popover | `CHAT/output-style/output-style-list.component.ts:215-222` | No | No | Yes: `max-w-xs` only; flip/shift, no size middleware | F10, F16, F20 |
| Output style help popover | `CHAT/output-style/output-style-list.component.ts:312-324` | No | No | Yes (same) | F10, F16 |
| Output style notices popovers (missing / collision / fallback) | `CHAT/output-style/output-style-notices.component.ts:68,104,127` | No | No | Yes (same) | F10 |
| Parity section help popover | `CHAT/output-style/output-style-parity-section.component.ts:97` | No | No | Yes (same) | F10 |
| Membership key popover (`role=dialog`) | `CHAT/license/license-status-card.component.ts:170-300`, panel at `:197` | No (`w-80 max-w-[calc(100vw-2rem)]` width only) | No | Yes: height unbounded, error message grows it | F10, F11 |
| Ultracode info popover | `CHAT/pro-features/agent-behaviour-section.component.ts:239-250` | No | No | Yes (`max-w-sm`, no height) | F10 |
| MCP help popovers | `CHAT/pro-features/mcp-port-config.component.ts:193,231` | No | No | Yes (same) | F10 |
| Fine-tuning setting help popover | `CHAT/advanced/advanced-settings-group.component.ts:144-156` | No | No | Yes (`max-w-xs`) | F10 |
| Import confirm (inline) | `CHAT/advanced-settings.component.ts:114-130` | n/a (inline, not an overlay) | n/a | No; wraps in the action row | none |
| Log-out confirm (inline) | `CHAT/license/license-status-card.component.ts:375-389` | n/a | n/a | No | none |
| Delete style confirm (inline `alertdialog`) | `CHAT/output-style/output-style-list.component.ts:268-275` | n/a | n/a | No | none |
| Toast (`SettingsToastComponent`) | `CHAT/feedback/settings-toast.component.ts:135` | not reviewed | not reviewed | not reviewed | out of scope; only its `overlay` surface seen |

## Capabilities to preserve

| Capability | file:line |
|---|---|
| Overview instrument band (section summaries) | `CHAT/advanced-settings.component.ts:102-107` |
| Export settings (Electron `settings:export`, VS Code command) | `CHAT/advanced-settings.component.ts:132-142,271-285` |
| Import settings with inline confirm, busy state, focus return, toast results | `CHAT/advanced-settings.component.ts:113-131,143-154,288-357` |
| Membership: plan and state, badges, account (name, email) | `CHAT/license/license-status-card.component.ts:112-157` |
| Manage Membership (premium) | `CHAT/license/license-status-card.component.ts:160-168` |
| Enter Membership Key popover (show/hide, format check, verify, activate) | `CHAT/license/license-status-card.component.ts:170-300` |
| Explore Ptah Builders, Create Account | `CHAT/license/license-status-card.component.ts:301-316` |
| Log out with inline confirm | `CHAT/license/license-status-card.component.ts:318-336,374-389` |
| Membership Key Not Active alert with Re-enter key | `CHAT/license/license-status-card.component.ts:343-371` |
| Load errors with Retry (agent behaviour) | `CHAT/pro-features/agent-behaviour-section.component.ts:141-157` |
| System prompt mode toggle and note, status (sr-only) | `CHAT/pro-features/agent-behaviour-section.component.ts:160-211` |
| System prompt Details (open drawer) | `CHAT/pro-features/agent-behaviour-section.component.ts:194-208` |
| Ultracode toggle, info popover, X-High pin | `CHAT/pro-features/agent-behaviour-section.component.ts:212-252` |
| Dynamic workflows toggle | `CHAT/pro-features/agent-behaviour-section.component.ts:253-285` |
| Chat reasoning effort select (disabled while Ultracode is on) | `CHAT/pro-features/agent-behaviour-section.component.ts:286-326` |
| System prompt drawer: status, retry, regenerate with confirm, progress, check again, download, preview, empty state, close | `CHAT/pro-features/system-prompt-drawer.component.ts:127-393` |
| Output style list: activate (radio), preview built-ins, edit, delete with confirm, copy to project, invalid files and open, collision / fallback / parity notices, help | `CHAT/output-style/output-style-list.component.ts:117-324`; `CHAT/output-style/output-style-notices.component.ts`; `CHAT/output-style/output-style-parity-section.component.ts` |
| New style | `CHAT/output-style/output-style-config.component.ts:76-81` |
| Output style editor: name, description, tier (where to save), instructions + keep coding instructions, conflict / stale / discard flows, save and cancel | `CHAT/output-style/output-style-editor.component.ts:122-352` |
| MCP port and caller/localhost info | `CHAT/pro-features/mcp-port-config.component.ts:89-235` |
| Claude Code tools: toggle each tool with token cost | `CHAT/pro-features/claude-builtins-config.component.ts:134-148` |
| Terminal skills with description, dependency note, dependency-blocked state | `CHAT/pro-features/claude-builtins-config.component.ts:172-206` |
| Synced skills and their empty state | `CHAT/pro-features/claude-builtins-config.component.ts:230-264` |
| Saved per turn token summary (`aria-live`) | `CHAT/pro-features/claude-builtins-config.component.ts:93-96,341` |
| Applies-to-new-sessions note, load/unverified error with Retry | `CHAT/pro-features/claude-builtins-config.component.ts:100-121` |
| Undo and focus keeping on toggle failure | `CHAT/pro-features/claude-builtins-config.component.ts:376-401,454-464` |
| VS Code LM section (not for Electron redesign work but must keep rendering) | `CHAT/pro-features/vscode-lm-config.component.ts:44-70` |
| Fine-tuning disclosures (memory upkeep, scheduled jobs, workspace harness) with lazy `@defer` | `CHAT/advanced-settings.component.ts:165-209` |
| Setup: Run onboarding again, Check Claude Code | `CHAT/settings.component.html:156-161` |
| Shell: back to chat (nav and narrow strip), tabs with deep links, custom-endpoint warning and security note, workspace context | `CHAT/settings.component.html:13-54` |

## Decisions

- D1: Fix padding once, globally: one card padding on the glass content surface, and a `px` on the form-section for the non-glass case. Do not re-add per-component `:host-context` rules.
- D2: On/off settings are switches (`ptahToggle`), not checkboxes. Radios stay only for "choose one" (output-style activation, tier).
- D3: Icon-only (with `ptahIconButton` tooltip and `aria-label`) for secondary row actions (Details, Preview, Edit, Delete, Info, Close). Icon plus label for card-level actions (Export, Import, Enter key, New style). Text only for confirm choices in inline confirms.
- D4: Keep Lucide as the one icon library. No new package.
- D5: Do not touch the VS Code or TUI hosts. `vscode-lm-config` is only checked so its padding follows F1.
- D6: Popover height is a library fix (F10), not a per-popover class.

## Clarifications Needed

- C1: Electron minimum window size (width and height). F10-F12, F37-F38 pick `dvh` caps without it; a real minimum would let us tighten them.
- C2: Should "All on / All off" for a group save as one batch? Today each toggle is one atomic RPC (`agent:setClaudeBuiltin` per id, serialised by `saving()`); a group switch of 11 skills means 11 saves and 11 toasts. A batch RPC or a single summarised toast is needed.
- C3: Membership key entry: keep the popover (F11) or move it to a small modal dialog? Not decided here.
- C4: The checkbox radius cause (F32) is inferred from the CSS and the screenshot, not from a rendered check on each theme. A render under one light and one dark theme would confirm it.

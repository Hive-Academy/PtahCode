# Bots phase 1: design spec (TASK_2026_2274_eb79)

Status: proposal for user design approval (decision 5 of `bots-definition.md`). No UI code is written
before approval. Host: Electron renderer (`apps/ptah-extension-webview`), Angular 22, Tailwind 3.4 +
daisyUI 4, components from `libs/frontend/ui`. Themes `ptah-glass` (dark) and `ptah-glass-light`.

| Item | Value |
| --- | --- |
| Design of record | `prototype/bots.html` (one self-contained file, no network). If this text and the prototype disagree, the prototype wins for layout, spacing and copy. |
| Prototype controls | Theme (dark, light), width (1280, 900), state (empty, loading, load error, populated, form pristine, new bot, dirty, errors, saving, saved, revision conflict, save error, disabled bot, archived bot, delete dialog). Query parameters: `?state=<id>&theme=light&w=900&clean=1`. |
| Screenshots | `prototype/bots-list-dark-1280.png`, `bots-form-dark-1280.png`, `bots-form-light-1280.png`, `bots-form-dark-900.png`; extra: `bots-errors-dark-1280.png`, `bots-delete-dark-1280.png`. Captured headless with the Ptah browser tools from the prototype file. |
| Inputs | `bots-definition.md` (Goal, Non-goals, Proposed model, Phase 1, Selected options), `docs/design-system/settings/` (rev 2 "Flight deck" and the user decisions after rev 2), `libs/frontend/ui/src/lib/**`, `libs/frontend/ui/src/lib/tokens/ptah-tokens.css`, `apps/ptah-extension-webview/tailwind.config.js`, `apps/ptah-extension-webview/src/styles.css`. |

## Concept

"Roster": one page that lists the saved bots at the left and edits the selected bot at the right.
The page follows the Settings "Flight deck" grammar: sections sit on the page, not in cards. Each
form group is a `ptah-form-section` with an aside (title and one line) and a fields column. Gold
marks only the one primary action, the selected row rail, the selected tile and focus. A calm
info note at the top says that bots cannot start yet. Triggers show as "Not available yet", so
nothing is hidden and nothing pretends to run.

## Entry point

The title bar of `electron-shell.component.ts` holds the surface tabs Chat, Voice, Apps, Tasks,
Machines, Reviews, Analytics and Setup. Settings opens from the global actions as a configuration
surface with its own left nav (Providers, Context management, Advanced, Search and voice).

| Option | Description | For | Against |
| --- | --- | --- | --- |
| **A. Title bar tab "Bots" (recommended)** | New tab after Tasks, route `/bots`, `canMatch: [electronOnlySurface]`, lucide `Bot` icon, lazy `loadComponent` from a new feature lib. | A bot is a persistent identity. Phase 2b adds "Talk to bot", sessions, history and pending approvals. These are not settings. The tab is the place where these later features also live. | One more tab in a strip of 8. At narrow window widths the strip scrolls (it already has `overflow-x-auto`). |
| B. Settings page "Bots" | New entry in the Settings nav after "Search and voice". | No title bar change. Settings already has the form grammar. | Phase 2b must move the surface again when bots get conversations. Settings pages are for app configuration, not for items that the user talks to. |

Recommendation: option A. It is listed under "Proposed changes to existing surfaces".

## Layout per width

Shell: the page is the routed content under the title bar. It uses `ptah-list-detail` for the
two panes and the layout tokens below. All widths are container widths of the page root
(`container-type: inline-size`).

```
+-------------------------------------------------------------------------------+
| Bots                                                             [New bot]    |
| Saved bots: instructions, model, skills, memory and approval rules.           |
| [i] Bots cannot start yet. You can create and edit bots now. ...              |
| +------------------+ +------------------------------------------------------+ |
| | [Search] [Scope] | | Release notes writer  (Enabled) Revision 4  [x] Enabled [⋯]|
| | [ ] Show archived| |------------------------------------------------------| |
| | > Release notes  | | Identity     | Name / Description / Available in      | |
| |   Dependency w.  | | Instructions | textarea                               | |
| |   Review buddy   | | Model        | Provider | Model | Effort              | |
| |                  | | Skills       | chips + Add skills                     | |
| | [Import: later]  | | Memory       | 3 radio tiles                          | |
| +------------------+ | Tools        | chips + Add a tool id                  | |
|                      | Approvals    | Permission level, allowed, denied      | |
|                      | Triggers     | 3 rows "Not available yet"             | |
|                      | [Revision 4 · saved 2 h ago]   [Discard changes] [Save]| |
|                      +------------------------------------------------------+ |
+-------------------------------------------------------------------------------+
```

| Width | Layout |
| --- | --- |
| 1280 | Page gutter `--ptah-page-gutter` (1.5rem). List pane 20rem, sticky at `--ptah-space-4` from the top. Detail pane fills the rest (about 860 px), separated by a 1 px `--surface-border` hairline and `--ptah-space-4` padding. Form sections: aside 12rem, fields column max 36rem, gap `--ptah-space-6`. |
| 900 | Single pane (split below a 960 px container width). With no selection, the list shows at full width. With a selection, the editor shows at full width with a "← Bots" ghost button before the title. Form sections keep two columns (the content column is about 850 px). |
| below 760 | Form sections stack (aside above fields). The Model row becomes Provider and Model in one row, Effort below. Not in the gate widths, but the prototype shows it when the width is reduced. |

Height: the editor scrolls in the page. `ptah-form-actions` is sticky at the bottom of the detail
pane, with `elevation-2` (the only shadow on the page besides the menu and the dialog).

## Component map

### Existing `libs/frontend/ui` components

| Block | Component | Notes |
| --- | --- | --- |
| Page header | `ptah-page-header` (`title`, `description`) | The primary action "New bot" goes in its action slot as `button[ptahButton]` primary. |
| "Bots cannot start yet" note | `ptah-alert` `tone="info"` `compact` | Not dismissible in phase 1. `live="off"`. |
| Two panes | `ptah-list-detail` (`selectedId`, `backLabel="Bots"`, `back`) | Single pane at 900. |
| List toolbar | `ptah-toolbar` with `ptah-field` + `input[ptahInput]` (search) and `ptah-select` `size="sm"` `label="Scope filter"` (All scopes, This workspace, User) | Compact controls, no floating label (Settings rule for compact controls). |
| Show archived | `input[type=checkbox][ptahCheckbox]` | Label "Show archived (N)". |
| Bot row | `div[ptahListRow]` (or `button[ptahInboxRow]` if the row is one button) | Name, `ptah-status`, description (one line, ellipsis), `span[ptahBadge]` scope, provider and model (model in mono), `ptah-relative-time` for the last edit. |
| Row status | `ptah-status` (`ok` "Enabled", `idle` "Disabled", `idle` "Archived") | Status is never a button. |
| Loading list | `ptah-skeleton` (3 row skeletons) | Counts and badges are hidden while the list loads. |
| Load error | `ptah-alert` `tone="error"` `compact` with one `[alertAction]` "Retry" | |
| Empty page, no selection | `ptah-state-panel` | Empty: one action "New bot". No selection: no action. |
| Editor header | `ptah-section-header` or a header row with `ptah-status`, revision text, `input[ptahToggle]` "Enabled", `button[ptahIconButton]` "More actions" + `ptah-native-dropdown` | Menu: Rename, Disable/Enable, Archive, separator, Delete…. Archived bot: Restore, separator, Delete…. |
| Form groups | `ptah-form-section` | Same aside width in all groups. |
| Name, description, tool id | `ptah-field` + `input[ptahInput]` | Floating label at rest when empty (user decision after Settings rev 2). |
| Instructions | `ptah-field` + `textarea[ptahTextarea]` | Character count in the hint line at the right. |
| Scope, memory | `ptah-surface-tile` in a radio group | One tile is always selected. |
| Provider and model | `ptah-provider-model-picker` (`provider`, `model`, `label="Model"`, `requiresToolUse`) | Uses the runtime catalog. |
| Effort | `ptah-field label="Effort"` + `ptah-select` | Options: Default, low, medium, high (the list comes from the provider; Default stores no value). |
| Permission level | `ptah-field label="Permission level"` + `ptah-select` | Labels come from the existing `PermissionLevel` display names (`libs/shared/src/lib/types/model-autopilot.types.ts`): ask (default), plan, auto-edit, yolo. |
| Workspace memory root | `ptah-field` + `ptah-select` | Shows only when "Workspace memory" is selected. |
| Trigger rows | `ptah-setting-row` with `ptah-status` `idle` "Not available yet" | No control in the row. |
| Save bar | `ptah-form-actions` `sticky` (`dirty`, `saving`, `dirtyText`) | Discard changes (ghost) and Save or Create bot (primary). |
| Conflict, save error | `ptah-alert` `tone="error"` with `[alertAction]` buttons, under the editor header | `live="assertive"` for the conflict. |
| Delete dialog | `ptah-native-modal` (`ariaLabelledby`, `size="md"`) | Contains `ptah-surface-tile` radio group and two segmented Keep/Delete choices. |
| Tooltip on revision | `[ptahTooltip]` | "Current saved revision". |

### New components (proposed, in the new feature lib)

| Component | Function | Why a new one |
| --- | --- | --- |
| `bots-page` | Route component: header, note, list-detail. | Feature page. |
| `bot-list-row` | Content of one row (composition of the existing parts). | Feature content. |
| `bot-editor` | The form and its state machine (pristine, dirty, invalid, saving, saved, conflict, save error, archived read-only). | Feature form. |
| `bot-skills-picker` | Chips of selected skills plus "Add skills" that opens `ptah-native-popover` with a search field and a `ptahCheckbox` list of installed skills. | No shared multi-select of skills exists. |
| `tool-id-chip-input` | Chip list plus `ptah-field` (or `ptah-autocomplete`) that adds canonical tool ids. Used three times (required, allowed, denied). | No chip-input exists in `libs/frontend/ui`. Candidate to move to `ui` later if a second feature needs it. |
| `bot-delete-dialog` | Archive or delete, with memory and run history retain/purge choices. | Feature dialog. |
| `segmented-choice` (Keep/Delete) | Two-option radio group in a pill. | Not found in `libs/frontend/ui` (`ptah-native-tab-group` is for tabs, not for a value). Alternative without a new component: two `ptah-surface-tile` per row. |

## States

### List

| State | What shows |
| --- | --- |
| Loading | Toolbar (search disabled), 3 skeleton rows. Detail: nothing. `aria-busy="true"` on the list. |
| Load error | `ptah-alert` error "Could not load bots" / "The bot store did not answer." with "Retry". "New bot" stays available. |
| Empty | No list pane. `ptah-state-panel`: "No bots yet" / "A bot keeps a name, instructions, a model, skills, memory and approval rules in one place. Create one to get started." Action "New bot" (the header button is hidden, so one primary action stays). |
| Populated, no selection (1280) | List, and a dashed `ptah-state-panel` "Select a bot" / "Pick a bot in the list to edit it, or create a new one." |
| Disabled bot | Row status `idle` "Disabled". Editor note `ptah-alert` idle: "This bot is disabled" / "You can still edit it. A disabled bot will not start from any trigger." |
| Archived bot | Hidden by default. "Show archived (N)" shows it, with status "Archived" and muted name. Editor is read-only (dashed field boxes), note "This bot is archived" / "It keeps its memory and history. Restore it to edit it." with "Restore". No save bar. |

### Form

| State | Save bar text | Buttons | Other |
| --- | --- | --- | --- |
| Pristine | "Revision 4 · saved 2 h ago" | Discard changes (disabled), Save (disabled) | |
| New bot | "Not saved yet" | Cancel, Create bot | Row "New bot" / "Not saved" at the top of the list. Focus moves to Name. |
| Dirty | "Unsaved changes" | Discard changes, Save | Leaving the bot or the page with changes opens `ptah-inline-confirm`: "Discard unsaved changes?" Discard / Keep editing. |
| Validation errors | "Fix 2 fields before you save." (error ink, `role="alert"`) | Cancel or Discard, Save / Create bot | Focus moves to the first invalid field. Each field shows its message in the hint line. |
| Saving | "Saving…" (`role="status"`) | Both disabled, Save shows a spinner (`aria-busy`) | Fields are read-only while the save runs (lane constraint 6). |
| Saved | "Saved as revision 5." (success ink, `role="status"`) | Both disabled | The header revision changes to "Revision 5". The row "Edited just now". |
| Revision conflict | "Not saved: a newer revision exists." | Discard changes, Save (disabled) | Alert under the header: "A newer revision exists" / "Revision 5 was saved after you opened revision 4. Your changes are not saved yet. Revision 5 changed: Instructions, Model." Actions: "Compare with revision 5", "Save mine as revision 6", "Discard mine and load revision 5". |
| Save error | "Not saved." | Discard changes, Save | Alert: "Could not save" / "The bot store did not answer. Your changes are still here." Action "Retry save". |

Conflict flow:

1. "Compare with revision 5" opens a read-only `ptah-native-drawer` that lists each changed field: the value in revision 5 and your value.
2. "Save mine as revision 6" writes your full form as the next revision, based on revision 5. The bar then shows "Saved as revision 6."
3. "Discard mine and load revision 5" replaces the form with revision 5 and goes to pristine.

### Validation rules shown in the form

| Field | Message |
| --- | --- |
| Name empty | "Enter a name." |
| Instructions empty | "Enter instructions." (lane constraint 3) |
| Model missing or not in the catalog | "Pick a model that is available." |
| Workspace memory root not equal to the workspace of a workspace-scoped bot | "Use the workspace of this bot: `<root>`." |
| User-scoped bot with workspace memory and no root | "Pick the workspace for this memory." |
| Tool id unknown | "Ptah does not know this tool id." The chip is kept and flagged (unresolved requirements stay visible, as the definition requires). |
| Tool in allowed and denied | Not an error. Both chips show a warning mark and the hint "Bash is in both lists. Deny wins, so Bash is denied." |

## Delete dialog (decision 6)

Title "Remove “<name>”?". Body "Archive hides the bot and keeps everything. You can restore it later."

1. Radio tiles: "Archive" (default, "Recommended. Keeps memory and run history.") and "Delete permanently" ("Removes the bot. Choose what to keep below.").
2. With "Delete permanently", a group "What to keep" shows two independent choices (four combinations):
   - Bot memory: Keep (default) / Delete. Hint "Private memory of this bot. Shared workspace memory is never deleted."
   - Run history: Keep (default) / Delete. Hint "Records of past runs and the revisions they used." In phase 1 the hint adds "No runs yet."
   - Note: "Chat sessions stay in your session history in all cases. Kept memory stays private to the removed bot."
3. Buttons: Cancel (ghost) and "Archive bot" (primary) or "Delete bot" (danger).
4. If the editor has unsaved changes, the dialog adds the line "Unsaved changes are lost."

## Phase 1 limits in the UI

- No "Start", "Run" or "Talk to bot" control exists in phase 1, also not as a disabled button. The info note and the Triggers group explain that starting comes later.
- Triggers group: "Start by hand" ("Comes with bot sessions in a later update."), "Schedule" and "Message from Slack, Discord or Telegram" ("Comes in a later update."), each with `ptah-status` idle "Not available yet".
- No designer conversion entry.
- Import of legacy saved custom definitions: one dashed placeholder at the bottom of the list, "Import saved custom agents" with the badge "Preview later". It does nothing in this design. See open decision 3.

## Copy

| Place | Text |
| --- | --- |
| Tab | Bots |
| Page title / description | Bots / Saved bots: instructions, model, skills, memory and approval rules. |
| Note | Bots cannot start yet / You can create and edit bots now. Starting a bot, and triggers such as schedules and messages, come in later updates. |
| Section asides | Identity: Name, purpose and where the bot is available. · Instructions: What the bot does and how. Sent at the start of each session. · Model: The provider and model that run the bot. · Skills: Installed skills the bot loads. · Memory: What the bot remembers between sessions. · Tools: Tools the bot needs. A run is refused if one is missing. · Approvals: When the bot must ask you first. Deny wins over allow. · Triggers: How a bot starts. Not available yet. |
| Scope tiles | This workspace / Only in `<workspace>` · All my workspaces / Each run picks one workspace. |
| Memory tiles | Private to this bot / Only this bot reads and writes it. · No memory / Each session starts fresh. · Workspace memory / Shared with other sessions in one workspace. |
| Skills empty | No skills selected. The bot finds matching installed skills when it runs. |
| Model hint | Uses the account that Ptah selects for this provider. Effort is optional. |
| Tool field hint | Type a tool id and press Enter. Ptah checks it against the installed tools. |
| Enabled toggle | Enabled (screen reader description: "Applies at once. Does not save other edits.") |

## Accessibility

- Focus order: title bar tabs → "New bot" → note (not focusable) → search → scope filter → Show archived → rows → editor header (back at 900, Enabled toggle, More actions) → form fields in reading order → save bar (Discard, Save).
- The list is a `ul` with an `aria-label="Bots"`. Each row is one button with `aria-current="true"` when selected. Its accessible name is "<name>, <enabled|disabled|archived>, <scope> scope, <provider> <model>, <last edit>".
- Every field has a visible label (floating label of `ptah-field`), and `aria-describedby` points at the hint or error. Invalid fields get `aria-invalid="true"`.
- Error announcement: the save bar message "Fix N fields before you save." is in an assertive live region, then focus moves to the first invalid field. Save success and "Saving…" use a polite status region. The conflict alert uses `live="assertive"`.
- Radio tiles use `role="radiogroup"` and `role="radio"` with roving tab index and arrow keys. The Enabled control is `role="switch"` (`input[ptahToggle]`).
- Chips: each remove button has the name "Remove <kind> <id>". The "in both lists" mark is a text hint linked with `aria-describedby`, not color only.
- Menu and dialog: `ptah-native-dropdown` and `ptah-native-modal` trap focus, close on Escape, and return focus to the opener. The dialog opens with focus on the selected radio tile.
- Motion: only the spinner and the skeleton pulse. Both stop with `prefers-reduced-motion`.

### Contrast (WCAG 2 ratio, computed from the theme hex values)

| Pair | Dark (`ptah-glass`) | Light (`ptah-glass-light`) |
| --- | ---: | ---: |
| `base-content` on `base-100` | 15.71 | 15.39 |
| Muted text (`--bcm`) on `base-100` | 13.07 | 6.09 |
| Muted text on `--surface-2` (selected row, chips) | 11.70 | 5.56 |
| `primary-content` on `primary` (Save, New bot) | 9.88 | 6.16 |
| Error ink (`--state-ink-err`) on `base-100` (field errors, bar message) | 8.43 | 6.90 |
| Success ink on `--surface-2` (status "Enabled") | 9.49 | 6.06 |
| Idle ink on `--surface-2` (status "Disabled", "Not available yet") | 11.70 | 5.56 |
| Warning ink on `base-100` (both-lists mark) | 9.77 | 5.69 |
| `error-content` on `error` (Delete bot) | 6.74 | 4.86 |
| `primary` rail and selected tile edge on `base-100` (non-text, needs 3) | 9.50 | 5.96 |

All text pairs pass AA (4.5). The light danger button (4.86) is the lowest pair.

## Proposed changes to existing surfaces

1. `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts`: add a "Bots" tab (lucide `Bot` icon) after "Tasks" in the title bar tab strip. Nothing is removed and no tab moves except that Machines, Reviews, Analytics and Setup shift one place to the right.
2. `apps/ptah-extension-webview/src/app/app.routes.ts`: add the route `bots` with `canMatch: [electronOnlySurface]` and `SURFACE_ACTIVE`, and add `'bots'` to the view type in `libs/frontend/core/src/lib/services/app-state.service.ts`.
3. No change to Settings, Tasks, Machines or the Setup hub.

## Lane-introduced constraints

1. The surface name is "Bots" and the creation button is "New bot". The definition names the surface but no copy.
2. Phase 1 shows no disabled Start or Run button. The notice and the Triggers group carry the message.
3. Instructions are required to save. The definition types `instructions` as a string and does not state that it may be empty.
4. The Enabled toggle applies at once through `bots:set-enabled` and does not save other pending edits. Whether it writes a new revision is for the implementation plan.
5. Archived bots are hidden by default and are read-only until restored. The definition names archive but not its view.
6. Fields are read-only while a save is in progress.
7. A conflict offers three paths: compare, save mine as the next revision, discard mine. The definition requires "revision-conflict errors" but not the resolution.
8. A tool in the allowed and the denied list is a warning, not a validation error, because deny wins.
9. Memory and run history default to "Keep" in the hard-delete choices.
10. The list shows "Edited <relative time>" from `updatedAt`. No author is shown, because the record has no author field.
11. The list is sorted by name. Search matches name and description. The scope filter has All scopes, This workspace and User.

## Open decisions for the user

1. **Entry point.** Options: A, title bar tab "Bots" (recommended); B, a Settings page. Evidence: section "Entry point".
2. **Enabled control in phase 1.** Options: show the Enabled toggle now, with the hint that it has no effect until bots can start (recommended, because acceptance asks to "disable" a bot in phase 1); hide it until phase 2b.
3. **Import of saved custom agents.** Options: keep the dashed placeholder "Preview later" in the list (recommended); show nothing in phase 1; design a real import preview now as a separate screen. The backend import preview exists in phase 1, the UI flow is not designed here.
4. **User-scoped bots in the list.** Options: show user-scoped bots in every workspace with the "User" badge (recommended); show them only behind the scope filter.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Use list-detail, not a table plus a separate edit page | table + route; list-detail | Phase 1 acceptance edits, renames and disables in one flow. `ptah-list-detail` already handles the single pane at narrow widths. | Yes |
| Follow the Settings rev 2 grammar | new look; Settings grammar | `docs/design-system/settings/settings-design-spec.md` sections 1 and 2, and the user decisions in `docs/design-system/settings/README.md`. | Yes |
| Use `ptah-provider-model-picker` for the runtime | two plain selects; the shared picker | The picker exists in `libs/frontend/ui/src/lib/native/provider-model-picker/`. | Yes |
| Floating labels and the designed `ptah-select` menu | stacked labels; native select | User decision of 2026-11-17 in `docs/design-system/settings/README.md`. | No (user rule) |

# Settings forms prototype checks

Rendered `settings-forms.html` with `ptah_browser_navigate` at 1440 × 900, headless, using its in-workspace `file://` URL. Glass mode was on. The page has 12 sections per theme and 64 state cells per theme. Visual inspection of the full-page screenshots found no overlapping cells, clipped inline panels, or unreadable text. The live search panel initially appeared while closed; this was fixed before the final screenshots.

| check | method | result (dark) | result (light) |
|---|---|---|---|
| Render and full-page screenshot | `ptah_browser_navigate` and `ptah_browser_screenshot` | Pass; `dark.jpg` | Pass; `light.jpg` |
| Both themes side by side | `ptah_browser_screenshot` and visual inspection | Pass; dark board in `both.jpg` | Pass; light board in `both.jpg` |
| Sections and state cells | DOM count and named section inspection | 12 sections, 64 cells | 12 sections, 64 cells |
| Horizontal overflow at 1440 px | `document.documentElement.scrollWidth <= innerWidth` in all three view modes | 1425 <= 1440 | 1425 <= 1440 |
| Inline panel clipping | DOM panel bounds against containing state cell; screenshot inspection | 0 clipped | 0 clipped |
| Label contrast | Canvas sRGB conversion of computed text and composited ancestor background | 13.06:1 | 6.49:1 |
| Hint contrast | Same computed contrast method | 12.47:1 | 6.23:1 |
| Error contrast | Same computed contrast method | 6.05:1 | 6.64:1 |
| Warning contrast | Same computed contrast method | 8.23:1 | 5.01:1 |
| Option contrast | Same computed contrast method, normal / active | 13.49:1 / 9.88:1 | 15.35:1 / 6.16:1 |
| Focus ring | Forced `.is-focus` states and screenshot inspection | Visible white ring and outer primary halo | Visible dark ring and outer primary halo |
| Keyboard demo | Dispatch `ArrowDown` twice, `Enter`, input query, `Enter`; inspect `aria-activedescendant` and selected values | First and second option IDs changed; selected `Full access`; query filtered to one result and selected `Claude Haiku 4.5` | Same shared script and markup; visual control present |
| JavaScript / console errors | Navigation plus browser evaluation of theme and keyboard actions | 0 observed during checks | 0 observed during checks |
| Duplicate IDs | DOM ID scan | 0 | 0 |

Screenshots:

- `D:\projects\ptah-extension\.claude-worktrees\feat-settings-form-controls-de47d90e7197\.ptah\specs\TASK_2026_919_8ffc\prototype\screens\dark.jpg`
- `D:\projects\ptah-extension\.claude-worktrees\feat-settings-form-controls-de47d90e7197\.ptah\specs\TASK_2026_919_8ffc\prototype\screens\light.jpg`
- `D:\projects\ptah-extension\.claude-worktrees\feat-settings-form-controls-de47d90e7197\.ptah\specs\TASK_2026_919_8ffc\prototype\screens\both.jpg`

Polished source files copied from:

- `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts`
- `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-search-field.component.ts`
- `libs/frontend/ui/src/lib/native/autocomplete/native-autocomplete.component.ts`
- `libs/frontend/ui/src/lib/native/option/native-option.component.ts`
- `libs/frontend/ui/src/lib/native/dropdown/native-dropdown.component.ts`
- `libs/frontend/setup-wizard/src/lib/components/generation-model-picker.component.ts`
- `libs/frontend/ui/src/lib/extracted/setup-field/`
- `libs/frontend/chat/src/lib/components/file-suggestions/unified-suggestions-dropdown.component.ts`

Theme and glass tokens were transcribed from `apps/ptah-extension-webview/tailwind.config.js` and `apps/ptah-extension-webview/src/styles.css`. Current Settings examples were read from `elevenlabs-panel.component.ts`, `mcp-port-config.component.ts`, `agent-behaviour-section.component.ts`, `session-budget-settings.component.ts`, `host-routing-setting.component.ts`, `local-stt-panel.component.ts`, and `cli-model-effort-popover.component.ts` in the requested Settings folders.

## Decisions

- **Native fallback for short lists.** Options: custom listbox or native select. Evidence: the polished provider picker retains its native select for a compact fixed list, so the prototype shows both a skinned native fallback and a custom grouped listbox.
- **One proposed switch.** Options: existing `toggle-sm toggle-primary` and `toggle-xs toggle-success`. Evidence: current Settings use both; the proposed row consistently uses `toggle-sm toggle-primary`.
- **Contrast safe semantic text in light glass.** Options: direct theme warning/error fills or text mixed toward base content. Evidence: the theme's exact `#f59a3a` warning and `#cf3a3a` error tokens are retained for borders; text uses a theme derived mix that passes 4.5:1 on the visible surface.
- **Inline open panels.** Options: popover layering or inline panel blocks. Evidence: all states need to remain simultaneously visible in a full-page screenshot, so open panels use the polished `surface-3` and panel classes inline.
- **Skill availability.** No invocable UI skill was exposed through this lane's CLI skill mechanism; the Ptah harness skill inventory returned zero local skills. Source files and browser checks provided the design reference.

## Coordinator checks (2026-11-10)

The coordinating session rendered the file again with `ptah_browser_navigate` (headless,
1440 x 900) and examined the screenshots.

| check | method | result |
|---|---|---|
| Lost glyphs | Screenshot showed "?" for the chevron, the check mark, the search icon, the ellipsis and the key mask. Replaced them with inline SVG icons and HTML entities. `document.body.innerText` has no "?" after the fix. | Fixed, pass |
| External resources | `document.querySelectorAll('link[href],script[src],img[src]')` | 0 |
| Sections | `h2` list per theme | 13 (Try it, 11 control sections, Before / after) |
| Horizontal overflow | `scrollWidth` 1425 <= `innerWidth` 1440 in both, dark and light modes | Pass |
| Duplicate IDs | DOM ID scan | 0 |
| Keyboard demo (select) | `ArrowDown` twice, `Enter`: `aria-activedescendant` moved from `demo-select-1-dark` to `demo-select-2-dark`, value changed from "Read-only (recommended)" to "Full access", `aria-expanded` returned to `false` | Pass |
| JavaScript errors | `error` listener during the keyboard and theme actions | 0 |
| Visual inspection | Full-page screenshots `screens/both.jpg`, `screens/dark.jpg`, `screens/light.jpg`, and the Select section at full scale | No clipped panel, no overlap, focus ring visible in both themes |

Not checked: Electron. The task brief forbids Electron screenshots in this phase.

# Visual QA — TASK_2026_894 (Electron)

Run: Electron dev app from the worktree (`launch.js --remote-debugging-port=9333`), Playwright over CDP
(`qa/qa.cjs`, `qa/scroll-shot.cjs`). Viewport set by emulation. Themes switched on `<html>` only
(no setting saved). No setting was saved during the QA.

## Round 1 (build from HEAD 51fec6936)

### Provider card grid (`cli-provider-grid`, 6 installed cards)

| Viewport | Grid width | Cards in first row | Card sizes | Scroll in card | Clipped |
| --- | --- | --- | --- | --- | --- |
| 1600x1000 | 1162 | 3 | 377x548 | none | none |
| 1200x1000 | 762 | 2 | 373x548 | none | none |
| 900x1000 | 478 | 1 | 478x548 | none | none |

Max 3 in a row, identical width and height at each width: PASS.

### Defects found

| # | Severity | Screen | Defect | Fix |
| --- | --- | --- | --- | --- |
| V1 | Blocking | CLI provider cards | Lane-default cell used `layout="compact"` (4.75rem). Captions wrapped into a narrow column; on the Codex card the Permission/Network content overlapped "Codex settings" and "Test" (`grid-anubis-1600.png`, `grid-anubis-light-1600.png`). The slot had `min-h-0`, so it shrank and overflowed. The old `clipped` check missed it. | New `card` layout (full width, Permission and Network side by side, `select-xs`); slot `shrink-0`. Added an `overlap` check to `qa.cjs`. |
| V2 | Serious | Codex card | Text "same setting as Codex sandbox in Orchestration" pointed to the old place (Batch 5 moved it). | "Same setting as Codex sandbox in Providers › OpenAI Codex › Credentials." |
| V3 | Serious | Codex drawer › Credentials › Agent behavior | "Codex web search" help text squeezed to ~130px: the settings grid used viewport breakpoints (`xl:grid-cols-3`) inside a ~480px drawer. | `advanced-settings-group` grid uses container queries (2 cols ≥ 36rem, 3 cols ≥ 56rem of the group's own width). |
| V4 | Moderate | Context Management › Capability matrix | Family rows showed raw lowercase IDs (`codex`, `z-ai`) and looked like plain text, with no expand indicator; "n=6Details" had no space; task headers lowercase. | Friendly family name (`names.executor`), chevron + model count badge, tinted group row, cell meta row with `gap-1.5`, `capitalize` headers. |
| V5 | Minor | CLI provider cards | Top row `h-8` (32px) held a 40px "Enabled" label (overflow). | Row `h-10 shrink-0`. |
| V6 | Minor | CLI matrix | "Uninstalled CLI agents (2)" disclosure had no expand indicator. | CSS `::before` chevron, rotates on `aria-expanded` (text content unchanged for the e2e assertion). |

### Passed checks

- Context Management: no "Codex agents" group, no Codex sandbox, no Codex budget keys.
- Rotate close executors: friendly text ("No recent picks yet" in this profile; no raw IDs).
- Ptah CLI shared defaults card: two columns at 1600px, not squeezed.
- Ptah CLI instance cards (Glm, kimi code): layout correct, tiers shown as slots.
- "Codex settings" on the Codex card opens the OpenAI Codex drawer on the Credentials tab, with Agent behavior and Codex sandbox.
- Full-access confirm `<dialog>` is closed (`open=false`, DaisyUI `modal` hidden) — its text in `innerText` is not visible.

## Round 2 (after fixes)

Renderer rebuilt with the V1–V6 fixes (`qa-build-2.log`).

| Viewport | Cards in first row | Card sizes | Scroll | Clipped | Overlap |
| --- | --- | --- | --- | --- | --- |
| 1600x1000 | 3 | 377x548 | none | none | none |
| 1200x1000 | 2 | 373x548 | none | none | none |
| 900x1000 | 1 | 478x548 | none | none | none |
| 520x1000 | 1 | 310x548 | none | none | none |

520px is below the Electron window `minWidth` of 800 (`apps/ptah-electron/src/windows/main-window.ts:52`).
At that width the fixed workspace sidebar cuts off the pane. This is out of scope.

| # | Result | Evidence |
| --- | --- | --- |
| V1 | PASS: Permission and Network side by side, no overlap with "Codex settings" | `r2-grid-anubis-light-1600.png`, `r2-grid-anubis-1600.png` |
| V2 | PASS: note points to Providers › OpenAI Codex › Credentials | `r2-codex-drawer-glass.png` (card behind the drawer) |
| V3 | PASS: "Codex web search" field is 429px wide (was ~130px) | `r2-codex-drawer-glass.png` |
| V4 | PASS: friendly family names, chevron, model count badge, `n=` spacing, capitalized headers | `r2-capability-glass-1600.png` |
| V5 | PASS: no overlap in the top row | `measure` overlap = none |
| V6 | PASS: `::before` content `›`, rotates 90° when `aria-expanded="true"` | `focus.cjs` output |

### New defect found in round 2

| # | Severity | Screen | Defect | Fix |
| --- | --- | --- | --- | --- |
| V7 | Serious | CLI provider cards, shared defaults card | The closed full-access `<dialog class="modal">` kept `display: grid` with `opacity: 0` (DaisyUI). Its hidden "Cancel" and "Confirm" buttons were in the tab order of every card. | `dialog.modal:not([open]) { display: none; }` in `cli-lane-default-cell` styles. Confirmed live by injecting the rule: Shift+Tab from "Test" goes "Codex settings" → "Codex network default" → "Codex permission default". |

### Focus

All focused controls in the Codex card show a 2px solid outline (`r2-focus-glass-1600.png`).

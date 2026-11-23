# Stats sidebar redesign - interactive prototype (TASK_2026_2309_5bea)

## Open it

Open `prototype/index.html` in any browser (no build, no network). Use the control bar at the top (the bar is test harness only, not product UI) or URL params so every screenshot is reproducible:

`index.html?w=400&theme=dark&fx=lanes&open=1&more=0&sel=s2&steer=1`

| Param | Values |
| --- | --- |
| `w` | `300`, `336`, `360`, `400`, `448`, `rail` (56 px) |
| `theme` | `dark` (anubis), `light` (anubis-light) |
| `fx` | `f1`, `f2`, `lanes`, `f8`, `f9`, `live`, `unknown`, `loading`, `empty`, `error` |
| `open` | `1` opens the Session "Details" disclosure |
| `more` | `1` shows all agent rows (Show fewer), `0` collapsed |
| `sel` | selected row id: `orch`, `s1`.. `s7`, `l1`, `l2` (ids that exist in the fixture) |
| `steer` | `1` shows the steer-error `role=alert` in the selected detail |

Behaviour to try: click a row (aria-current, 3 px gold inset bar, detail with request lines and Actions menu); Actions > Steer shows the error alert; Show N more / Show fewer (aria-expanded, selected row stays visible when collapsed); Details disclosure and Actions menu close on Escape and return focus; Tab shows the 2 px focus outline.

## Fixtures and what they prove

| `fx` | Shows | Proves |
| --- | --- | --- |
| `f1` | 1,000 tokens / $0.50 exact, no markers, no legend line | F1; no marker when exact |
| `f2` | `≥ $0.30` + "Lower bound: partial pricing"; one row cost `Unknown` | F2 |
| `lanes` | 25,912,340 tokens (size step-down at >9 chars), `≥ ~$17.54`, SDK vs CLI-lane meters (`~9%`), budget meter, 10 rows, Orchestrator entry, estimated lane cost | F6/F4-like mix, scope line, share rules, Show N more |
| `f8` | `≥ 0` / `≥ $0`, lane row Unknown | F8 (known zero + missing source is not 0 exact) |
| `f9` | `Unknown` / `Unknown`, "Not priced", no meters, no share | F9 (unknown never shown as 0) |
| `live` | `~800` / `~$0.40` Estimate, running timer, Orchestrator context 86% with "Near limit" cue; rail shows the cue | F5, limit cue not colour only |
| `unknown` | Session and row time `--:--` with title "Duration not recorded" | resumed session, R8.5 |
| `loading` / `empty` / `error` | skeleton rows + "Loading agents…"; empty copy; error alert + Retry; plan limits keep rendering | R5.3 independence |

F3, F7 and F10 are variants of the same widgets (exact with lane; exact zero; partial coverage `≥`) and are not separate fixtures.

## Screenshots (`screenshots/`, headless Chromium, PNG)

| File | What was checked |
| --- | --- |
| `lanes-400-dark.png` | Hierarchy Session > Agents > Plan limits; two tiles; legend; meters in gold (not near-limit orange) except the budget meter (Tighten = warn); Details open with full precision; selected row + steer alert; collapsed list keeps selected row visible |
| `lanes-400-light.png` | Same in anubis-light; track edge visible; status text readable |
| `lanes-300-dark.png` | 300 px minimum: tiles stack to one column, no number wraps, long agent name truncates with title, all rows open |
| `rail-dark.png` | 56 px rail: Tokens, Cost, Context ring with "!" cue and attention dot; no overlap after fix |
| `unknown-duration-400-dark.png` | `--:--` in session and rows, rows never show 0 |
| `f9-all-missing-400-dark.png` | `Unknown` text instead of 0, "Not priced", no meters |

Defects found in screenshots and fixed: share meters were turning orange at 91% (auto near-limit tone); now forced gold so orange means a limit only; budget meter name truncated at 300 px (now wraps); rail attention dot overlapped the "Context" label (moved). Known prototype limitation: Details model and category lines are static stand-ins in every fixture (F9 shows models that a real F9 would not have); the spec, not the prototype, defines that content.

## Rules

`project-rule` (source in brackets):
- Electron-first host, renderer visuals only [CLAUDE.md Product focus].
- Real tokens: anubis / anubis-light values [apps/ptah-extension-webview/tailwind.config.js, libs/frontend/ui/src/lib/tokens/ptah-tokens.css].
- Unknown is never 0; accuracy markers `~`, `≥`, `≥ ~`; width 300 px minimum, 336/400/448 docks, 56 px rail [task-description.md R1-R9, F1-F10].
- Agents parity: live-first ordering, Orchestrator entry, selection with aria-current, actions menu, steer-error alert, aria-expanded list toggle, Total row moves to Session [parity-inventory.md].
- Plan limits unchanged and independent.

`lane-proposed` (need approval at Gate 1.7):
- Per-scope share meters ("Where it came from") and per-row share meters (open question: keep or drop rows).
- Marker glyph choice and the legend line text.
- Two-column tiles at content width >= 280 px.
- Value size step-down above 9 characters.
- Rail values <= 7 characters, "!" cue glyph beside the ring.
- Selection style: 3 px inset bar plus at most 3% fill (8% fill fails status-ink contrast, measured by the predecessor).
- Status ink text kept on surface-2, never surface-3.

## Component map

Each element carries `data-component`: `ptah-stat` (tile / plain), `ptah-meter`, `ptah-ring`, `ptah-countdown`, `ptah-timer`, `ptah-disclosure`, `ptah-surface-section`, plus prototype-only labels `ptah-agent-row`, `ptah-agent-detail`, `ptah-rail`. Gaps: no stacked bar (one meter per scope), `ptah-stat` has no hidden-label mode, `ptah-timer` takes start/end not a duration. The prototype imitates the look in plain CSS; it does not import the Angular components.

# Prototype: Review lanes (TASK_2026_2310_rvlns)

Open `index.html` in a browser. It is one self-contained file (inline CSS and JS, no network).

- Toolbar at the top: **State** switches the section state (empty, pool, pins, unavailable
  entries, model catalog unreadable for one lane or for all lanes, lane list unreadable,
  loading, saving error). **Theme** switches ptah-glass (default, gold primary), ptah-glass-light, anubis and anubis-light.
  **Pre-change run** shows the run detail for a run with no lane, model or fallback data.
- Frames: the whole drawer (header, six sections, pinned footer) at 576 px and at 400 px on a dimmed page, then run detail at 576 px and at 400 px. Icons are inline SVG stand-ins for Lucide.
- Pool buttons (Up, Down, Remove) and the dropdowns work by keyboard. Focus follows the rules
  in `design-spec.md` section 5. A hidden live region announces each change.

## Lane-introduced constraints

none

## Notes

- The dropdown is a simplified imitation of `ptah-select`; the app uses the real component.
- Colours are copied from `tailwind.config.js` (ptah-glass, ptah-glass-light, anubis, anubis-light). The warning glyph uses
  the tuned state ink (`--state-ink-need`) and the word stays neutral, as `ptah-status` does.
- Model ids and lane names are fixture data. The app reads them from live catalogs.
- Screenshots of revision 3 (all four themes, every state) are in `../screenshots/` as `proto-<theme>-<state>-{top,lanes,bot}.png`; `before-*.png` show the drawer before this task.

# Prototype screenshot audit

All screenshots use a viewport height of 800px. Main captures use `?theme=dark|light&state=main`; empty and error captures use `?theme=dark&state=empty|error` at 1280px. Every screenshot is a full-page PNG. The table covers each page, width, and theme in the main state. The empty and error states were also audited before capture.

| Page | Width | Theme | ≥12px text | No uppercase transform | Option rows ≥40px | No horizontal overflow | State badge ink |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| reviews-a | 1280 | dark | Pass | Pass | Pass | Pass | Pass |
| reviews-b | 1280 | dark | Pass | Pass | Pass | Pass | Pass |
| machines-a | 1280 | dark | Pass | Pass | Pass | Pass | Pass |
| machines-b | 1280 | dark | Pass | Pass | Pass | Pass | Pass |
| reviews-a | 1280 | light | Pass | Pass | Pass | Pass | Pass |
| reviews-b | 1280 | light | Pass | Pass | Pass | Pass | Pass |
| machines-a | 1280 | light | Pass | Pass | Pass | Pass | Pass |
| machines-b | 1280 | light | Pass | Pass | Pass | Pass | Pass |
| reviews-a | 400 | dark | Pass | Pass | Pass | Pass | Pass |
| reviews-b | 400 | dark | Pass | Pass | Pass | Pass | Pass |
| machines-a | 400 | dark | Pass | Pass | Pass | Pass | Pass |
| machines-b | 400 | dark | Pass | Pass | Pass | Pass | Pass |
| reviews-a | 400 | light | Pass | Pass | Pass | Pass | Pass |
| reviews-b | 400 | light | Pass | Pass | Pass | Pass | Pass |
| machines-a | 400 | light | Pass | Pass | Pass | Pass | Pass |
| machines-b | 400 | light | Pass | Pass | Pass | Pass | Pass |

Data table rows are exempt from the 40px option-row check. The browser audit inspected visible text nodes, visible option rows, document width, and computed badge colors against their `--state-ink-*` variables. No failures remain in the captured states.

## Fixes

- Mapped the DaisyUI 4 `--p`, `--pc`, `--s`, `--sc`, `--a`, `--ac`, `--n`, `--nc`, `--b1`, `--b2`, `--b3`, `--bc`, `--in`, `--su`, `--wa`, and `--er` variables for both themes, and removed the blue primary-button override. Light primary buttons now render teal.
- Raised badge state-ink specificity; the publishing and completed chips and Critical, Major, and Minor findings use their mapped inks. Nitpick is a borderless ghost badge with muted text.
- Made publishing status switch between done and need ink when Pause/Resume is clicked.
- Swapped Reviews detail actions: dry run is primary and live rerun is outlined. Repository modes now use state badges.
- Applied the Machines state map: connected filled dot, reconnecting run ring, offline idle hollow circle, and version mismatch need triangle. Allow once is primary; Deny is outlined. The unpaired err dashed marker is available in `tokens.css` but is not shown in the four-machine sample.

## Captures

24 PNG files: 16 main captures at 1280px and 400px in dark and light themes, plus 8 dark 1280px empty and error captures. All 24 are nonempty. No build, test, lint, e2e, serve, dev, or git command was run.

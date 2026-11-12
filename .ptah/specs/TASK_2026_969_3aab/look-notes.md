# Form control look notes

The temporary repro is `.ptah/tmp/form-controls.html`. It loads renderer CSS compiled from `styles.css` with the project Tailwind config. The screenshots are `.ptah/tmp/ptah-glass-after.png` and `.ptah/tmp/ptah-glass-light-after.png`. The original stylesheet was changed before the first browser capture, so there is no trustworthy before screenshot. The cause statements below use the original source rules and the after computed styles.

## Defects

1. **Workspace name focus.** The global glass `.input:focus` and `:focus-visible` rules add an inner outline and shadow. The family rule also adds an outline. The field box and rail add two more marks. `ptah-field.css` now gives the field box the keyboard outline and removes the nested outline and shadow. The rail is reserved for error and busy. In the dark repro the focused box has a 2 px outline. Its input has `outline-style: none` and `box-shadow: none`. In Electron, tab to Workspace name and inspect the edge and both inside corners.
2. **Search sessions.** WebKit supplies a native search cancel button beside the field clear button. `ptah-form-controls.css` hides the native cancel and decoration controls for family search inputs and all search inputs in a field body. The field reset also removes the inner borders that made vertical lines near the slots. In Electron, enter a query. Check that one clear action appears and that the icon and action have no divider lines.
3. **Provider and Region.** `.ptah-field__body` is flex, but the rich select host had content width. `ptah-select.css` now grows the host and moves the chevron to the far end. In a floating field the trigger pads the top for the label (1.25 rem top, 0.375 rem bottom), so the chevron sat about 7 px below the box center. A negative top margin on the chevron (pad-bottom minus pad-top) moves it to the box center, the same line as the clear action and a native select chevron. The trigger in the repro is 582 px wide inside a 608 px field box. In Electron, compare Provider, Region and standalone Sort order. Check label height, chevron position and vertical alignment.
4. **Model panel.** Global focus styles draw an outline and halo on the search input. `ptah-select.css` removes them from the panel search and marks its row with the focus color. `ptah-field.css` keeps the trigger focus on the outer field box only. In Electron, open Model and tab to search. Check the trigger, search row and bottom edge.
5. **Fields gallery.** `ptahFieldControl` adds DaisyUI classes but no `data-ptah-control`, so the old field reset missed it. `ptah-field.css` now resets native input, select and textarea inside the field body regardless of directive. The repro shows a 582 px control inside a 608 px box, 20 px top padding for input and select, 28 px for textarea, and textarea `resize: none`. In Electron, check Review name, Repository and Instructions for one box and separate label and value lines.

## Focus contrast

From the headless Chromium screenshots, the solid 2 px outline is 15.84:1 against the adjacent dark glass background (ring RGB 242,242,241; background 23,24,28) and 7.20:1 against the glass light background (ring RGB 110,74,0; background 246,242,252). Both exceed 3:1. The screenshot samples are outside the translucent field box, where the outline is drawn.

## Decisions

- Use the box outline as the single field focus mark. The rail still indicates error or busy. Evidence: the field owner already draws the box and the rail; drawing both on focus creates two indicators. Reversible: yes.
- Keep `ptahFieldControl` public selectors and classes. Scope the reset to `.ptah-field__body` so controls outside a field retain their existing look. Reversible: yes.


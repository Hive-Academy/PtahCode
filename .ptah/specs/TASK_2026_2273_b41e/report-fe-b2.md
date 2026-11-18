# FE-B2 report

## Items

- **3 — Done.** The five stats render through `ptah-instrument-band`. Its segment contract now carries optional test IDs and a title so the existing IDs and code-index tooltip remain on rendered elements.
- **4 — Done.** Search uses a compact floating `ptah-field`; tier and scope use `ptah-select` with the existing change outputs.
- **5 — Done.** Timeline text and date controls use floating `ptah-field`; danger-zone mode uses `ptah-select`. Corpus build dialog already used floating `ptah-field` for every text and number control and has no dropdown, so it needed no edit.

## Files changed

- `libs/frontend/ui/src/lib/patterns/instrument-band/instrument-band.component.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/memory-stats-strip.component.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/memory-stats-strip.component.spec.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/memory-search-bar.component.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/timeline-filters.component.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/memory-danger-zone.component.ts`
- `.ptah/specs/TASK_2026_2273_b41e/report-fe-b2.md`

## Parity

Before editing, `rg -n 'data-testid=|\bid=|aria-label='` listed the attribute values in each affected component. Compared the 36 baseline records in `parity-attributes-before.txt` for the five item files against their final source: **missing values: none**. The six stats test IDs and statistics label moved from literal template attributes to instrument-band segment inputs; the stats spec confirms the IDs and label on rendered elements. Other affected attribute values remain literal template attributes. Corpus dialog was unchanged.

## Checks

- `npx prettier --write` on all six changed source/spec files: exit 0.
- `npx ngc --noEmit --project libs/frontend/memory-curator-ui/tsconfig.lib.json`: exit 0; one NG8107 warning in untouched `diagnostics/db-health-panel.component.ts`.
- `npx jest --config libs/frontend/memory-curator-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath` with stats-strip, timeline-filters, and corpus-build-dialog specs: exit 0, 3 suites and 8 tests passed.
- `npx eslint` on all six changed source/spec files: exit 0.
- `ptah_get_diagnostics` scoped to five changed component files: unavailable twice because its TypeScript check remained running past 45 seconds; `ngc` completed successfully.

## Decisions

- Added optional `testId`, `valueTestId`, and `title` properties to instrument-band segments. This preserves rendered stats IDs and tooltip without DOM mutation or duplicate hidden elements. Reversible by removing these fields if the primitive later gains a content template.
- Kept the timeline type chips and corpus type chips because they are multi-select controls; converting them to a single-value select would change behavior. Corpus text fields already met the floating-label requirement.
- The Angular skill loader was not available in this CLI lane. Component inputs, outputs, and examples were read directly from source.

## Proposed Removals

None.

## Electron visual review notes

Browser and Electron visual review were excluded from this lane. In Electron, check five stats segments at narrow and wide widths, floating search/timeline labels, select overlays, danger-zone mode selection, and corpus dialog field alignment.

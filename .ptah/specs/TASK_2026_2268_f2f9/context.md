# TASK_2026_2268_f2f9 — Settings > Search & Voice to the prototype

Child of epic TASK_2026_1177_9109. Branch `feat/settings-search-voice-page`.

## Goal

Make Settings > Search & Voice match `docs/design-system/settings/prototype/screens/search-*.jpg`
(rev 1) at 1824, 1168 and 784 px, dark and light, with the shared `@ptah-extension/ui` controls.

## Decisions

- Instrument band: `SearchVoiceSummaryStore` (provided by the tab shell). Each section reports its
  own segment; a section that is not on the page does not show a segment.
- Web search: one card per provider in a card grid (3 columns from a 720 px content container).
  The key editor is inline in the open card (one editor at a time, same state and hooks as the
  old popover). Provider summary and free tier move into an info popover.
- Voice: two `ptah-setting-row` rows with `ptah-select` (labelledBy the row title). Option test
  hooks are marker spans in the select icon template. After a failed write the component puts
  the stored provider back into the select (the `[value]` binding does not change).
- ElevenLabs: new summary section on the page (key presence and voice name only, never a key).
- go vet: long text moves into a "What runs" popover.
- Drawer panels: native selects replaced by `ptah-select` in floating `ptah-field`.
- Shared fix (coordinator decision): `ptah-setting-row` and `ptah-description-list` split at the
  `row-split` container variant (26rem, Tailwind config of the renderer) instead of 640 px.
- e2e harness: native select calls replaced by `richTrigger` / `richOption` / `pickRichOption`.

## Evidence

Gate shots: `docs/design-system/settings/gate/<pr>/` (captured into `gate/search-voice/` first)
by `apps/ptah-electron-e2e/src/design-preview/settings-search-voice.shot.ts`.

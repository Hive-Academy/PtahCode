# Batch 4 lane B: badge adoption

## Files

| File | Result | Reason / mapping |
| --- | --- | --- |
| `setup-plugins/mcp-directory-browser.component.ts` | Adopted all three | Config type and secret use neutral sm; Global only uses warn outline xs. |
| `setup-plugins/plugin-catalog-panel.component.ts` | Adopted | Plugin ID uses neutral xs. Its spec now queries `[data-ptah-badge]`. |
| `setup-plugins/skill-sh-browser.component.ts` | Adopted | Scope uses outline sm; global is warn and workspace is neutral. |
| `tool-execution/tool-call-header.component.ts` | Adopted two, left one raw | Generic chips and failed use neutral sm. Chip text uses `ptah-badge-text` for truncation. The Ptah chip retains its custom gold light/dark background, gold border and gold text; replacing it with a supplied directive tone would change that look. |
| `turn-recap/turn-summary-files.component.ts` | Adopted | Conflicted uses neutral sm. `ptah-file-status-badge` remains its separate status component per design exception. |

## Verification

- `npm run verify -- -t lint -p @ptah-extension/chat-ui`: passed (1 task).
- Ptah scoped TypeScript diagnostics: no errors in the five changed components. It reported 18 errors in existing sibling files, including `skill-sh-browser.component.spec.ts:116`.
- `git diff --check`: passed.
- Rendered `.ptah/specs/TASK_2026_957_fda3/batch4-lane-b-preview.html` with the badge family CSS and inspected `.ptah/screenshots/batch4-lane-b-preview.png`. Against `family-3-look.md`: neutral and warning tones, xs/sm heights, outline scope/locked badges, and chip ellipsis appeared as intended. This static preview does not verify the assembled Electron page.

No commit or push.

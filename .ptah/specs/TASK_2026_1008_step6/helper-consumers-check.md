# Helper consumers check

Method: `ptah_lsp_references` was not called. A word-boundary search of the workspace (Grep, `*.ts, *.tsx, *.html, *.js, *.mjs`) replaced it. Both names are unique in the workspace.

## normalizeText

- Defined at `rich-select-list.ts:8`.
- Used only in `rich-select-list.ts` (lines 18, 20, 91, 95).
- No spec import. No import in other files. No re-export.
- Verdict: **SAFE to remove `export`.**

## matchesQuery

- Defined at `rich-select-list.ts:17`. Used internally at line 41.
- **External consumer: spec file.** `rich-select-list.spec.ts:1` imports it. The spec calls it at lines 21-24.
- No import in other lib files. No re-export.
  - `libs/frontend/ui/src/lib/form-controls/index.ts` does not export `rich-select-list`.
  - `rich-select.component.ts` imports only `ActiveMove`, `buildGroups`, `flatItems`, `moveActive`, `typeAheadIndex`.
- Verdict: **DO NOT remove `export` now.** The spec needs it.

## Options for matchesQuery

1. Keep the `export`.
2. Remove the `export` and change the spec lines 21-24 to test through `buildGroups`. Then the spec still passes.

## Summary

| Function | Remove export? |
| --- | --- |
| normalizeText | Yes |
| matchesQuery | No, unless you change the spec |

No code was changed.

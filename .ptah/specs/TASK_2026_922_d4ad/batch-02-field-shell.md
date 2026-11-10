# Batch 02: Search and Voice field shell audit

The Search and Voice tab has 15 inventoried controls. None matches the exact DOM anatomy of `div[ptahSettingsField]`; no adoption was made.

## Row decisions

Paths in this table are under `libs/frontend/chat/src/lib/settings/ptah-ai/`.

| Inventory | Component file | Adopted | Exact DOM difference |
|---|---|---|---|
| B21 | `web-search-config.component.ts` | No | Checkbox sits in a table `<td>`; provider text is a separate `<div class="font-bold text-base-content">`, not a shell label; no `<id>-help` paragraph. |
| B22 | `web-search-config.component.ts` | No | Popover label class is `block text-xs font-semibold text-base-content`, versus `text-sm font-medium text-base-content`; hint `<p>` has no `web-search-api-key-<provider>-help` ID and contains a link; host is `<div content class="p-3 w-72 space-y-2 text-left">`. |
| B23 | `web-search-config.component.ts` | No | Horizontal `<div class="mt-3 flex items-center gap-3 text-xs">`; label class is `font-bold text-base-content whitespace-nowrap`; after the range are two `<span>` elements, not a help paragraph. |
| B24 | `go-vet-consent-config.component.ts` | No | Horizontal table row: text label class is `font-medium whitespace-nowrap text-base-content`; control is nested in a second `<label>`; no help paragraph. |
| B25 | `voice-config.component.ts` | No | Provider picker is a `<ptah-native-popover>` in a table `<td>`; its row name is `<th scope="row" class="font-bold text-base-content">`, not a label; no help paragraph. |
| B26 | `elevenlabs-panel.component.ts` | No | API key uses `<th scope="row" class="w-24 align-top font-medium text-base-content">`, not a label; hint class is `mt-1 text-xs text-base-content-muted` and has `data-testid="elevenlabs-key-hint"`; control and hint are in a table `<td>`. |
| B27 | `elevenlabs-panel.component.ts` | No | Voice ID input has `aria-label="ElevenLabs voice ID"` and no associated `<label>`; it sits in a conditional error branch in a table `<td>`, without a help paragraph for this input. |
| B28 | `elevenlabs-panel.component.ts` | No | Select uses `aria-label="Voice"`; row label is `<th scope="row" class="w-24 align-top font-medium text-base-content">`; no help paragraph. |
| B29 | `elevenlabs-panel.component.ts` | No | Repeated select's row label is `<th scope="row" class="w-24 align-top font-medium text-base-content">`, not `<label>`; no help paragraph. |
| B30 | `local-stt-panel.component.ts` | No | Source selector is `div[role=radiogroup]` in a table `<td>`; row title is a `<th>` with class `w-24 align-top font-medium text-base-content`; no help paragraph. |
| B31 | `local-stt-panel.component.ts` | No | Whisper select uses `aria-label="Whisper model"` and a table `<th>` with class `w-24 align-top font-medium text-base-content`; no help paragraph. |
| B32 | `local-stt-panel.component.ts` | No | Custom input uses `aria-label="Custom model id or folder"` and a table `<th>` rather than a label; conditional validation hint has class `mt-1 flex items-center gap-1 text-[10px] text-base-content` and an icon, not the shell help paragraph. |
| B33 | `local-tts-panel.component.ts` | No | Source selector is `div[role=radiogroup]` in a table `<td>`; row title is a `<th>` with class `w-24 align-top font-medium text-base-content`; no help paragraph. |
| B34 | `local-tts-panel.component.ts` | No | Custom input uses `aria-label="Custom model id or folder"` and a table `<th>` rather than a label; conditional validation hint has class `mt-1 flex items-center gap-1 text-[10px] text-base-content` and an icon, not the shell help paragraph. |
| B35 | `local-tts-panel.component.ts` | No | Voice select uses `aria-label="Voice"` and a table `<th>` with class `w-24 align-top font-medium text-base-content`; no help paragraph. |

## Files changed

- `.ptah/specs/TASK_2026_922_d4ad/batch-02-field-shell.md` only.

## Verification

No `npm run verify` command was run: there were no eligible rows, component changes, or baseline snapshots. The baseline-before-adoption and unchanged-after-adoption comparison is inapplicable. The audit compared the shell template against the inventory and the seven tab component templates. No source or spec change was made.

## Decisions

- Applied the exact shell anatomy rule to all 15 inventoried controls, including conditional and repeated rows.
- Adopted no rows because every row differs in tag, class, element order, help ID, or host structure. No shell variant or markup change was introduced.
- Added no spec snapshots because the instruction limits baseline snapshots to rows intended for adoption.

## Clarifications Needed

None.

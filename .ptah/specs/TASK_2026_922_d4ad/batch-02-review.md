Verdict: APPROVE

Shell reference: `settings-field.component.ts:14-21` (label `text-sm font-medium text-base-content`, `<id>-help` paragraph, optional error paragraph).
Paths below are under `libs/frontend/chat/src/lib/settings/ptah-ai/`.

| Row | Result | Evidence |
|---|---|---|
| B21 | CONFIRMED | `web-search-config.component.ts:162-172` checkbox in `<td>`, provider text in `<div class="font-bold text-base-content">`; `<p>` at :173 has no id. |
| B22 | CONFIRMED | `web-search-config.component.ts:210-231` host `<div content class="p-3 w-72 space-y-2 text-left">`, label `block text-xs font-semibold` (:211), hint `<p>` (:227) has no id and holds a link. |
| B23 | CONFIRMED | `web-search-config.component.ts:284-292` flex row, label `font-bold ... whitespace-nowrap`, two `<span>` after the range, no help `<p>`. |
| B24 | CONFIRMED | `go-vet-consent-config.component.ts:149-176` label class `font-medium whitespace-nowrap text-base-content` (:153), control in a nested `<label>` (:176). |
| B25 | CONFIRMED | `voice-config.component.ts:134-136` `<th scope="row" class="font-bold text-base-content">` then `<ptah-native-popover>`. |
| B26 | CONFIRMED | `elevenlabs-panel.component.ts:228` `<th ... w-24 align-top font-medium ...>`; hint :296-300 class `mt-1 text-xs text-base-content-muted`, `data-testid`, in `<td>`. Note: this hint has `id="elevenlabs-key-help"`, so the id pattern differs (not the shell id). |
| B27 | CONFIRMED | `elevenlabs-panel.component.ts:385-388` `aria-label="ElevenLabs voice ID"`, inside the `voicesError` branch (:352), no label. |
| B28 | CONFIRMED | `elevenlabs-panel.component.ts:409-411` `aria-label="Voice"`, row `<th>` at :331-333. |
| B29 | CONFIRMED | `elevenlabs-panel.component.ts:434-441` `<th>` with row label, select with `[attr.aria-label]`. |
| B30 | CONFIRMED | `local-stt-panel.component.ts:79` `<th ... w-24 align-top font-medium ...>`, `role="radiogroup"` at :85. |
| B31 | CONFIRMED | `local-stt-panel.component.ts:109` `<th>`, `aria-label="Whisper model"` at :116. |
| B32 | CONFIRMED | `local-stt-panel.component.ts:149` `aria-label="Custom model id or folder"`; hint class `mt-1 flex items-center gap-1 text-[10px] text-base-content` at :176. |
| B33 | CONFIRMED | `local-tts-panel.component.ts:102` `<th>`, `role="radiogroup"` at :108. |
| B34 | CONFIRMED | `local-tts-panel.component.ts:133-144` `<th>`, `aria-label` at :144; hint class at :171. |
| B35 | CONFIRMED | `local-tts-panel.component.ts:192` `<th>`, `aria-label="Voice"` at :206. |

## Missing controls

None. The tab host `libs/frontend/chat/src/lib/settings/search-voice-settings.component.ts:20-24` composes only `ptah-web-search-config`, `ptah-voice-config` and `ptah-go-vet-consent-config`. `ptah-elevenlabs-panel`, `ptah-local-stt-panel` and `ptah-local-tts-panel` come through `voice-details-drawer.component.ts:65-99`. The inventory (`settings-forms-inventory.md:122-136`, :185) lists exactly 15 rows B21 to B35 for this tab. No MCP port field exists in this tab. Other inputs in these templates are buttons, not form fields (for example the voice-config popover radio items at `voice-config.component.ts:148`, which the inventory counts as part of B25).

## Rows that match the shell

None. Every row uses a `<th>`, a different label class, a horizontal layout, or an `aria-label` with no `<label>`. No row has a `<p id="<id>-help">` with class `text-xs text-base-content-muted` in the shell order.

## Corrections to the audit text

Optional, not blocking:
- B26: add that the hint paragraph has `id="elevenlabs-key-help"` (:297), so the "no id" wording for other rows does not apply here. The class difference (`mt-1`) already makes the row ineligible.
- B24: "no help paragraph" is accurate for the shell sense; the row uses `aria-describedby="go-vet-consent-status"` (:190) instead.

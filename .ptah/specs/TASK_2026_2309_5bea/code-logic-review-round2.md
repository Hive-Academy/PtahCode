# Code Logic Review, round 2 - TASK_2026_2309_5bea (commit 503d0041b)

Verdict: REVISE (no blocking findings; 1 serious, 3 moderate, 1 minor)
Scope: read-only; no tests run. Paths below are relative to `libs/frontend/chat/src/lib/components/organisms/session-inspector/` (SI) unless noted.

## 1. Earlier findings

| Finding | Status | Evidence |
| --- | --- | --- |
| F1 orchestrator marks | Fixed | `chat-ui/.../orchestrator-usage.ts:35-54` keeps the snapshot's flags; the override in `SI/inspector-agent-rows.ts` is removed. |
| F2 stale SDK total | PARTIAL | Totals now use the filtered `projection.snapshot()` (`SI/session-inspector.component.ts:263`). `sessionTokens` still reads the unfiltered `this.stats()?.snapshot` (see S1). |
| F3 lane losing ownership | Fixed | Retention is `!active.has(id)` (`SI/inspector-agent-rows.ts:112-114`); removed lanes without value add a cause (`:130-137`). |
| F4 duplicate causes | Fixed | `restored lane` cause only when `value === null` (`:67-72`). |
| F5 cents | Fixed (not traced in depth; `session-usage-format.spec.ts` gained a case). |
| Digest 1 regex | Fixed | `task-digest-rules.ts` has no `\s*` left in the progress/status patterns (`grep '\\s'` shows only `[ \t]`-style patterns). |
| Digest 2 severity counts | PARTIAL | Table rows and `###` finding headings are handled (`task-digest-rules.ts:157-196`). See M3 for the remaining shape. |
| Digest 3 unavailable progress | Accepted | Required skipped/failed sources add the `reads` reason (`task-digest.service.ts:262-266`); `progress` stays absent but `truncated` is set. |
| Digest 4 invalid carrier | Fixed per D1-fix report; `tasks-rpc.handlers.ts` change is 3 lines, not traced further. |
| Digest 5 empty first-failure list | Fixed | `handleDigestFailure` falls back to `tasks:listFolderEntries` (`session-task-reader.ts:463-473`, `:476-494`) and re-checks `isCurrent` after the await. |

## 2. `counted` field (backend + renderer)

Correct on every path I traced (`task-digest.service.ts:73-132`):
- Starts `false` for every directory (`:75`).
- Budget skip (`:83-86`): stays `false`, `truncated=true`, reason `nested`.
- Failed listing (`:90-95`): stays `false`, `stable=false`, so the digest is not cached.
- Partial listing (`count < entries.length`, `:103-104`): `counted=true`, `truncated=true`, so the UI shows `≥N`.
- Depth-2 failure or skip: parent keeps `counted=true` with `truncated=true` (lower bound). Correct.
- Cache: `directories` is part of `signature` (`:225`), and a cached digest is returned only when `stable`. A warm digest cannot carry a stale `counted`.
- Renderer: `hasFolderCount` returns `counted !== false && files != null` (`inspector-task-section.component.ts:1200`). An uncounted folder renders `not counted` (`:757`), not `0`. The aggregate (`:1189-1198`) excludes uncounted folders and prefixes `≥`. For new payloads an uncounted folder is always `truncated`, so the aggregate is a lower bound, never an exact total. Correct.
- Legacy payloads without `counted` are treated as counted (spec decision, accepted).

## 3. D3 TASK section

Folders are not listed as files: documents come only from `digest.documents` filtered by `openable` (`:120`), and folders render as non-button lines. OK.
Stale async results: `openDocument` and `previewDocument` revalidate `key`/`link` identity after the await and use a sequence for previews (`session-task-reader.ts:292`, `:309`, `:331-338`, `:362`). A tab or task change resets preview, error and result (`:198-211`) and a read in flight is requeued through `dirty` (`:446-451`). Digest error with no held documents falls back to `data.documents` (`documentGroups`, `:1121-1129`). I found no path that opens the wrong document.

### Findings

**S1 (Serious). `sessionTokens` still shows the previous session's input/output split.**
- `SI/session-inspector.component.ts:243`: `this.stats()?.snapshot?.tokens` is the unfiltered `tab.sessionStats` (the F2 cause). The projection filter is `stats.sessionId === sessionId()` (`SI/inspector-agent-rows.ts:98-101`). It feeds the agents section (`session-inspector.component.html:212`), so after a session switch in a tab the agents section shows session A's uncached input/output next to session B's totals.
- Fix: `const tokens = this.projection.snapshot()?.tokens;` (move the computed below the `projection` field, or read lazily). Add a spec next to "waits for matching SDK usage after a session switch".

**M1 (Moderate). Documents that cannot be opened vanish without an explanation.**
- `groupTaskDocuments` drops every `!openable` document (`inspector-task-section.component.ts:120`, e.g. markdown over 1 MiB, `task-digest-rules.ts:106-107`) and drops `readable === false` entries that are not primary chips (`:147`). The Documents count (`:1185`) excludes them too. Design spec line 46 allows a disabled `unreadable` chip only for primary documents; the batch acceptance says "every entry opens or explains why not".
- Fix: add one muted line in the Documents panel, `N documents cannot be opened`, with N = `documents.length - (primary + other)` restricted to markdown files; or render the `other` unreadable entries as disabled rows with `unreadable`.

**M2 (Moderate). `handleDigestFailure` writes the result without re-checking after a successful path with held documents.** When `held.documents.length > 0` there is no await, so this is safe. When it awaits (`session-task-reader.ts:466`) the `isCurrent` check is present. No defect; noted for completeness, no action.

**M3 (Moderate, by inspection, not run). Review severity counts for bold-paragraph findings.**
- `task-digest-rules.ts:192-196`: under `### Serious` (no parent) a finding written as `**F1. Title**` is not counted, while its `- File:` / `- Scenario:` bullets match `^ ?(?:\d+\.|[-*])[ \t]+` and count as items. This repository's own `code-logic-review.md` uses that shape, so it would show 0 for the findings and 1 per bullet where the section has bullets.
- Fix: count bullets as items only when the line looks like a finding title (`**`-bold or numbered), or add a spec fixture for this shape and decide the intended count. Not blocking: extraction is labelled and bounded.

**m1 (Minor). `folderFiles` branch `counted.length < folders.length && !lowerBound` (`:1192`) is dead for current payloads** (uncounted implies truncated). It is only reachable for hand-built data. Harmless.

## 4. Visual-fix numbers (V1, V2)

No invented, estimated or duplicated numbers found. V1 changes labels and layout only and keeps the provider's own percent and reset values (`provider-lane-limit-tile.component.ts`). V2 moves the SDK subtotal and category totals into screen-reader text and keeps one subtotal for two or more models; V7 merges the "unreported" legend only when counts are equal and keeps per-metric counts otherwise. The unconfirmed `?` mark is kept with a title.

## Verdict

REVISE for S1 (one-line fix plus a spec). M1 is worth fixing in the same pass; M3 may be deferred with a note.
Confidence: MEDIUM-HIGH (static trace; no tests or Electron run; M3 not proven by execution).

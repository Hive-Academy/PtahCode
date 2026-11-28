# Code Logic Review — TASK_2026_2336_7019

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 6/10 |
| Assessment | NEEDS_REVISION |
| Blocking issues | 0 |
| Serious issues | 3 |
| Moderate issues | 4 |
| Failure modes found | 6 |

Scope: all of `libs/shared/src/lib/local-command/**`, both backend diffs, and the frontend diffs (surface-layout, surface-node, stat, progress, chart, ptah-ui block and message-text, execution-node). Not run: focused jest, visual check. Chart template tail and `chart-geometry` were only skimmed.

## Five logic questions

1. Silent failure: usage detection is loose (`usage-output.parser.ts` WINDOW_LINE, ~L19, and the note branch ~L127). Unmatched lines inside a window are dropped without a trace. Other commands' output can be replaced by a card.
2. Unexpected user action: `ptah-ui-message-text.component.ts:63` and `execution-node.component.ts:192`. Prose moved to `markdown` parts only; other `<markdown>` consumers are unchanged.
3. Wrong answer from input: any output with a free line such as `Last updated` plus other text. It parses as a usage window with no data. `renderUsagePtahUi` still emits the notes (`itemCount > 0`) under "Claude usage". The remaining lines are lost.
4. Dependency failure: the formatter catches everything and returns the raw text (`format-local-command-output.ts`). Replay returns null for unchanged output. Both are OK.
5. Missing: the text history reader (`session-history-reader.service.ts` ~851/1049) does not show the new replay cards. No test covers `formatLocalCommandOutput` against other commands' real stdout.

## Serious issues

1. False-positive `/usage` detection rewrites other commands' output. `usage-output.parser.ts` ~L19, ~L127; `usage-output.render.ts` ~L90.
   - `Last\s+\S+` with zero counts matches e.g. `Last updated`.
   - That makes `windows.length > 0`, so a "report" exists.
   - Free text becomes `note info` lines and any other line is dropped.
   - Fix: require at least one limit line, or a window with a request or session count. Return null when nothing structured was parsed.
2. `surface-node.component.ts:114` host `flex min-w-0 flex-col`, and the `.dp-row-item` rule at `surface-layout.component.ts` (SURFACE_FLOW_STYLES).
   - `.dp-row-item` is `flex: 1 1 14rem; min-width: min(100%, 14rem)`.
   - This applies to every child of every horizontal stack on every surface.
   - Buttons, badges, avatars and icons in a row each become at least 14rem wide and stretch.
   - The column-flex host also stretches inline children (buttons, badges) to full host width. They were content-sized before.
   - Fix: apply the equal-width treatment only to card/stat/progress/chart children. Alternatively use `align-items: flex-start` for non-block kinds. Visually verify a button row.
3. The replay card has no timestamp when the record lacks one. `session-replay.service.ts` ~L284: `Date.now()` is the fallback. It is non-deterministic and orders the card after the whole transcript if events are sorted by timestamp. Fix: use the previous event's timestamp.

## Moderate and minor

- `session-replay.service.ts` ~L174: a plain user record whose text is only `<local-command-stdout>…` is now converted. This is intended for `/usage` and `/context`. Other commands are untouched (null), which is verified by reading.
- Replay ids are `cmd_<uuid>` and live ids are `cmd_<generated>`. Parity holds for content only, which is acceptable. A live-to-replay dedup keyed on the id will not match.
- `dashboard-stat.component.ts`: when there are no details, `aria-controls` is gone and the details div is hidden. This is OK. Nested children still count through `children`.
- Chart value labels and category labels are SVG text and are not marked `aria-hidden`. Screen readers will read the data twice, because the table view also exists. Minor.
- `ptah-ui-block.component.ts` fallback `<markdown>` now has prose. This is OK, and it is the only other renderer of that block.
- Privacy: memory file paths are never read (`context-output.parser.ts` `readMemoryFiles`). The tool and skill names shown are non-path. OK.
- Escaping: `\`, `|` and `$` are escaped in every position, and `decodeText` and `parseCells` accept all three. The 8192-byte and 200-line limits are enforced by `fitsPtahUiLimits`, which falls back to raw text. Component-count (200) is not checked directly, but it is bounded by the row caps (10, 12 and 8 per table) except for the unbounded number of usage windows. Those fall back through the line limit.

## Verdict

NEEDS_REVISION, confidence MEDIUM. The backend live/replay parity and the privacy and escaping rules look correct. Fix the usage false positive and the row/host layout regression, and add a negative test with non-usage command output.

# Re-review: TASK_2026_930_4e06

Verdict: **REVISE**

Reason: three existing assertions in `session-tools.spec.ts` fail against the new result text. Source code is correct. Two minor points are also listed.

## Checks that pass

1. Long brief: `child-setting-router.service.ts:18` slices the brief to 8,000 characters in a zod transform. It never throws. OK.
3. Deadline: the timer starts at `:85`, before `request()` calls `openCaller()` (`:95`). A late rejection goes to `pending.catch` (`:151`). `finally` clears the timer (`:164`). The `timedOut` promise only rejects when the timer fires, and `Promise.race` then handles it. No unhandled promise found.
6. Log: `session-spawner.service.ts:442` logs only `errorMessage(error)` from the router and admission path. No secrets found.
7. One helper: `childSettingSources` (`session-spawner.port.ts:111`) is used by the UI payload (`session-spawner.service.ts:1495`) and by `formatChild` (`session-tool-handlers.ts:137`). The record, snapshot and payload carry the same fields.
9. DI: `chat/di.ts:142` binds the token only when the lane-routing token exists (recursive check). The two new tests in `di.spec.ts:44` match this. The required-token guards are not changed.
Union coverage: `CHILD_SETTING_SOURCE_LABELS` (`compact-session-card.component.ts:70`) is a `Record<ChildSettingSource, string>` with all four members. `isChildSettingSource` in `tab-persistence.ts:203` is a validator. I found no other exhaustive switch or map.
Spawner spec: mock shapes match `IChildChatSessionHost` (`listChildModels`, `resolveChildModel`). `listUiDescriptors` exists (`session-spawner.service.ts:889`). The cases use `await`. I found no fake timers in these specs. The router spec restores real timers (`:57`).

## Findings

### F1 (High): three assertions in `session-tools.spec.ts` fail in CI

`formatChild` now prints `model X (source); effort Y (source)` (`session-tool-handlers.ts:142`). The `CHILD` fixture sets `modelSource: 'default'` and `effortSource: 'default'` (`session-tools.spec.ts:312`). These assertions still use the old text:

- `session-tools.spec.ts:456`: `toContain('model default; effort default')` in the start test.
- `session-tools.spec.ts:585`: `toContain('model opus; effort low')`.
- `session-tools.spec.ts:586`: `toContain('model default; effort default')`.

The real text is `model default (default); effort default (default)`, and `model opus (default); effort low (default)`. The substring does not match, so the tests fail.

Fix: change the three strings to the new text. For line 585 use `'model opus (default); effort low (default)'`. Or set `modelSource: 'pin'` and `effortSource: 'pin'` in that child and expect `(pin)`. These specs could not run locally, so the fix round did not see this failure.

### F2 (Low): `strength()` misses small and large tiers

`child-setting-rule.ts:12-23`. The token lists do not include `nano` (for example `gpt-5-nano`) or `max` and `ultra`. A `nano` model ranks as middle tier, so a cheap-model brief can pick a larger model than needed. Fix: add `nano` to the small list. Add `max` and `ultra` to the strong list if such IDs exist in the catalog.

Checked and correct: `gemini-2.5-pro` is strong, `gemini-*-flash` and `*-flash-lite` are small, `gpt-4o-mini` and `codex-mini` are small, `claude-sonnet-*` is middle, and `claude-3-5-haiku` is small. A `gemini` ID is not read as `mini`. Version digits split the tokens.

### F3 (Low): unrelated prettier changes

The diff includes format-only edits outside the task. Examples: `session-spawner.port.ts` (`SessionChildSuccessionCause`, `succeed(...)`), `session-tool-handlers.ts` (effort check), `di.spec.ts:333`, and `session-tools.spec.ts` (many lines). They add noise to the review but do not change behavior. Fix: revert them, or accept them knowingly.

## Not verified

- The new cases in `session-spawner.service.spec.ts`, `di.spec.ts` and `chat-session-agent-child.spec.ts` did not run. I found no error in the shapes or strings I read. `chat-session-agent-child.spec.ts:332` was not read in detail.

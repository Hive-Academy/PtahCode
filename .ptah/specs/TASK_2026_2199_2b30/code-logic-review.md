# Code Logic Review — `TASK_2026_2199_2b30`

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 7/10 |
| Assessment | CHANGES NEEDED |
| Blocking / serious / moderate | 0 / 1 / 0 |
| Failure modes found | 1 |

The parser fix addresses the reported raw-tag failure. The remaining serious issue is that the compact card conceals failed report delivery. This is a 7 rather than 5–6 because the envelope parses and the failure count survives in expanded details; it is not 9–10 because a likely failure path looks successful at a glance.

## Five logic questions

1. **How does this fail silently?** `parseLaneCompletion` drops every `Next:` line (`libs/frontend/chat/src/lib/components/molecules/lane-event/lane-event-row.presentation.ts:90-93`), including the failed-report recovery instruction emitted at `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts:1282`.
2. **What user action produces unexpected behaviour?** Viewing a completed lane with one failed report shows the `Completed` chip (`lane-event-row.presentation.ts:121-127`) and a sent-report count (`lane-event-row.presentation.ts:134-139`); the failed count appears only after expanding the card (`lane-event-row.component.html:93-124`).
3. **What input data produces a wrong answer?** A stored envelope with `reportsFailed="1"` failed the former lowercase-only attribute expression; the new `[a-zA-Z-]+` expression accepts it (`libs/shared/src/lib/utils/lane-envelope.ts:45-46,65-67`). Current producers escape quotes and angle brackets in values (`lane-completion-notifier.service.ts:108-113`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-envelope.ts:7-13`).
4. **What happens when a dependency fails?** If report delivery fails, the notifier writes `Report delivery: 0 sent; 1 failed.` and `Next: ...` (`lane-completion-notifier.service.ts:1276-1282`); parsing retains the former as an extra line but discards the latter (`lane-event-row.presentation.ts:90-95`).
5. **What is missing from the stated requirement?** Restoring the card also needs a visible failed-report cue. The body parser currently preserves `Tool calls`, `Task folder`, `MCP attachment`, and `Report delivery` in `extra` (`lane-event-row.presentation.ts:58-95`), rendered only in expanded details (`lane-event-row.component.html:93-124`).

## Findings

### Serious — Failed report delivery looks like a successful completion

- **Trigger:** A lane finishes with `reportsFailed > 0` but a delivered verdict (`lane-completion-notifier.service.ts:1276-1282`; the changed spec covers this at `lane-completion-notifier.service.spec.ts:1272-1277`).
- **Impact:** The collapsed card says `Completed` and reports only the sent count (`lane-event-row.presentation.ts:121-139`). On expansion, `Report delivery: ... failed` is visible as an extra line, but the producer's `Next: ... inspect the lane output and deliverable` is discarded (`lane-event-row.presentation.ts:90-93`; `lane-event-row.component.html:124`). A user can miss a failed report attempt and lose the prescribed recovery step.
- **Suggested change:** Retain `Next:` when it describes failed reports, and surface a warning or failed-report count on the collapsed card when the body says `Report delivery: ...; N failed.` for `N > 0`. Add a frontend presentation test using the real completion body.

## Data flow and scope

1. `buildLaneCompletionEnvelope` writes a well-formed completion tag with escaped values and fixed lowercase or hyphenated names (`libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-envelope.ts:68-80,113`). `completionEnvelope` adds `report-delivery` and `reports-failed` (`lane-completion-notifier.service.ts:1269-1293`).
2. Session-child completions use `agent-id`, `agent`, `cli`, `status`, `verdict`, and `turn` (`lane-completion-notifier.service.ts:277-284,318-320`). Report producers use `agent-id`, `agent`, and `cli` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.ts:618-631,748-756`). No runtime producer found in `libs/backend` or `apps` uses digits or underscores in attribute names. Attribute order is immaterial because parsing builds a map (`libs/shared/src/lib/utils/lane-envelope.ts:80-85,127-134`). `>` and newlines inside a quoted value are accepted by `[^\"]*`; producers escape `"` (`lane-completion-notifier.service.ts:108-113`).
3. `parseLaneEnvelope` requires a full message, the matching closing tag, and `agent-id`, `agent`, `cli` (`libs/shared/src/lib/utils/lane-envelope.ts:45-46,124-144`). `groupLaneEvents` calls it only for inbound peer messages and creates a row after a successful parse (`libs/frontend/chat/src/lib/components/organisms/transcript/transcript-lane-events.ts:48-87`). The expanded template renders `extra` lines (`lane-event-row.component.html:124`).
4. No text consumer of either `reportsFailed` or `reports-failed` was found in `libs/backend/agent-sdk` history replay or Codex adapter, `protocol-dispatcher`, `apps`, or `libs/frontend`. History replay uses `parseLaneEnvelope` (`libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.ts:323-335`), which does not expose either attribute (`libs/shared/src/lib/utils/lane-envelope.ts:127-144`). The rename therefore has no identified reader to break.

## Edge cases and verification

The wider name class admits mixed-case unknown attributes while still requiring a whole, valid envelope and a peer origin in the chat path (`lane-envelope.ts:45-46,124-144`; `transcript-lane-events.ts:48-55`). It does not create a material new user-text or backtracking risk: the expression adds case alternatives only, and the body remains bounded by the matching closing tag. Digits and underscores in *names* still fail, but none of the inspected runtime producers emits them. Quoted `"` is escaped by producers; unescaped quotes remain invalid as intended. The shared spec covers a stored camelCase envelope (`libs/shared/src/lib/utils/lane-envelope.spec.ts:110-116`), and the notifier spec checks the new attribute and parseability (`lane-completion-notifier.service.spec.ts:1272-1277`). No tests were run here as the coordinator is running the gate. Scoped `ptah_get_diagnostics` was unavailable while its TypeScript check was still running; it reported both changed source files unchecked.

## Decisions

- **Decision:** Keep the parser's mixed-case compatibility. Options were accepting legacy camelCase or only normalizing new producer output. The stored-transcript spec (`lane-envelope.spec.ts:110-116`) and full-message guard (`lane-envelope.ts:45-46`) support compatibility; this is reversible.
- **Skill availability:** No skill-loading tool was listed for this lane, so no optional skill was loaded. Repository instruction files matching `AGENTS.md` were not found.

## Verdict

**CHANGES NEEDED** (high confidence): the parsing bug is fixed, but the failed-report warning needs to survive and be visible on the compact Electron card.

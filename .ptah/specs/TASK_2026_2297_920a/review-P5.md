# P5 review (HEAD~2..HEAD) - code logic

Score: 6/10. Verdict: NEEDS_REVISION (0 blocking, 1 serious, 3 moderate, 2 minor).
Scope read: the full diff, `tracked-agent.ts` admission helpers, `agent-process-manager.service.ts`
(publishLaneNotice, applyLaneGuard, clear sites), `agent-events.ts`, the store, the card chip, the
parser, `formatAgentActionNotice`, the banner and `session-budget-actions.service.ts`. No tests were run.

## Serious

### S1. The chip never clears while the lane keeps running (stale card state)
- Backend clears admission without any event: `agent-process-manager.service.ts:3615` (inactivity
  cleared as soon as output resumes), `lane-budget-telemetry.ts:79/142` (budget release when the
  limit is raised or the ledger drops), and `:3253` (repeat). Each call to
  `clearLaneAdmission` only rewrites `tracked.info.actionNotice` (`tracked-agent.ts:193`). The only
  new push is `agent:action-notice` at `agent-process-manager.service.ts:656`, which fires on
  announce only. The comment at `agent-events.ts:362` itself says "no spawn or exit event follows it".
- Scenario: a lane goes quiet, gets "Handoff requested" (inactivity), then produces output. The
  backend drops the notice, the renderer keeps `actionNotice` and shows "Handoff requested" until
  the turn exits. The same applies to "Paused · still running" after the user raises the budget:
  the lane is running again but the card still says paused. The store comment
  (`agent-monitor.store.ts` `carriedActionNotice`) promises "payload is authoritative", but no
  payload arrives in these cases.
- Fix: emit a clear event (e.g. `agent:action-notice` with a `cleared`/`current: null` form, or
  re-broadcast `agent-monitor:spawned`-style info) from `setLaneAdmission`/`clearLaneAdmission`
  callers when `info.actionNotice` changes to undefined or to a lower phase. The store needs a
  matching `onAgentActionNoticeCleared`, and the parser a case for it. There is no test for this
  path; the store spec only tests clearing via a new spawn payload.

## Moderate

### M1. Fallback chip text is addressed to the agent, not the user
- `agent-card-header.component.ts` `laneActionNoticeView` calls
  `formatAgentActionNotice(notice, { id })` with no `audience`. For a card built from a spawn or
  exit payload (`actionNoticeText` undefined, which `carriedActionNotice` also forces whenever
  the notice differs), `paused` gives `formatBudgetCeilingDeny` ("Use only the permitted handoff
  tools, then return normally", `agent-action.types.ts:357-358`) and `asked-handoff` gives "Finish
  the current step and return your progress ..." (`:198`). The title and sr-only text then speak to
  the model. Pass `audience: 'parent'` (and handle the no-tool-gate variant, which only the host
  text knows). The chip spec checks only `toContain('Ptah budget monitor')`, so it does not
  catch this.
- Related: a notice that reaches the card before `agent:spawned` (lane still `starting`) is
  dropped by `onAgentActionNotice` (unknown id). That is covered by `info.actionNotice` in the
  spawn payload, but then without the host text, which hits this fallback.

### M2. Missed caller of the renamed label
- `libs/frontend/chat/src/lib/settings/ptah-ai/context-overview.store.ts:188` still renders
  `value: \`Stop at ${stopAt}\`` for the same setting, and its specs assert it
  (`orchestration-settings.component.spec.ts:211,264`: "Stop at 8", "Stop at 20"). This contradicts
  "Repeat-call handoff at" and the "Pause, never kill" rule. Change to "Handoff at N" and update both specs.

### M3. Banner copy is inaccurate for some failed states
- `session-budget-format.ts` `AUTO_HANDOFF_EXHAUSTED_NOTICE` says "could not queue the session
  handoff" for every `state === 'failed'`. `session-auto-handoff-coordinator.service.ts:553` fails
  after the command was delivered and no record appeared (status `absent`), and `:480` fails after a
  10 minute compaction wait. In those cases the ask may have been sent, so "could not queue" is
  wrong, and a Retry will send a duplicate command. Use neutral copy ("the session handoff did not
  complete") or distinguish by `entry.attempts`/`queued`.

## Minor

- m1. `session-handoff-prompts.ts:19` `SESSION_WRAP_UP_PROMPT` still opens with "This session has
  used {used} tokens", unattributed, while the `/session-handoff` command is now attributed.
  Inconsistent for the same ask; the `session-budget-actions.service.spec.ts:265/288` asserts remain on the old text.
- m2. Chip a11y (`agent-card-header.component.ts` ~159-166): the full sentence is in `title` and in
  sr-only text, so assistive tech may read it twice, and the title is unreachable by keyboard on a
  `truncate` span. Prefer one `aria-label` or a tooltip/button, and drop `title` or mark it
  `aria-hidden` for the sr-only copy. Also a stray double blank line at `session-handoff-prompts.ts:43`.

## Checked and found sound

- Notice for a missing card is a safe no-op (`onAgentActionNotice`). Chip is gated on
  `running`/`starting` and excludes `ended`, so an exited or completed lane shows no chip, and
  `completed` cards that keep `actionNotice` are harmless. A continuation spawn replaces the
  notice from backend `info`, and stale spawn/exit events are filtered by `turnSeq`
  (`agent-monitor.store.ts` ~1543, 1893).
- Text is rendered only via interpolation and `title`, so no XSS. The parser validates shapes
  but not the enums for `actor`/`reason`/`nextStep`; unknown reasons fall through to a generic
  sentence, which is harmless (and `text` is host-trusted).
- Order in `publishLaneNotice` (text computed before emit, `info` is the latest) is correct.
- `agent-events.spec.ts` really exercises broadcast and error logging.
- Docs, settings label and info text no longer say "stops"; `laneGuardStopText`'s "Stopped: repeated
  the same tool call" is only for legacy `repeat-call` stops from older builds, as documented.
- Out of scope per the brief: the predecessor-close part of batch 19.

# Code Logic Review — `TASK_2026_lane_double_wake`

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 4/10 |
| Assessment | NEEDS_REVISION |
| Blocking issues | 2 |
| Serious issues | 2 |
| Moderate issues | 1 |
| Failure modes found | 5 |

The ordinary report path remains immediate. The held report path has a real deadline timer, but completion and report settlement are not atomic across the notifier, store and drainer. The score is below the sound 7–8 band because common transient send failures can recreate the exact duplicate wake this change targets; it is above the foundational 1–2 band because persistence, replay and timer scaffolding are present.

## Five logic questions

### 1. How does this fail silently?

At the body cap, the notifier can persist `coalescedReportKey` with a completion body that omits the report (`lane-completion-notifier.service.ts:431-437,493-497`); delivery then marks the held report delivered (`parent-envelope-store.service.ts:238-242`). A linked completion in `outcome-unknown` leaves the report pending until expiry and can send it even if the completion reached the parent (`parent-delivery-drainer.service.ts:216-235`).

### 2. What user action produces unexpected behaviour?

A lane sending `final: true` immediately before exiting can wake the parent twice if completion enqueue or delivery has a transient failure (`lane-completion-notifier.service.ts:505-509,674-701`). The first wake is the released report; the later one is the completion still carrying that report.

### 3. What input data produces a wrong answer?

A completion close to 1,048,476 characters with `reportsDelivered` crossing a digit boundary fits the first size check but can fail the second rendering, leaving a false link (`lane-completion-notifier.service.ts:431-437,493-497`; `agent-report-coalescer.ts:15-20`).

### 4. What happens when a dependency fails?

On a `not-accepted` send failure, completion becomes `blocked-retryable` (`parent-delivery-drainer.service.ts:297-310`); `settleEnqueue` reports neither delivered nor pending (`lane-completion-notifier.service.ts:696-701`), so the notifier releases its report even though the completion remains queued (`lane-completion-notifier.service.ts:507-509`). Storage failure after the outbox checkpoint has the same release/replay conflict (`lane-completion-notifier.service.ts:503-512,688-692`).

### 5. What is missing that the requirements never mentioned?

An invariant tying the report's standalone eligibility to whether a completion *contains* that report and may still be delivered. The current drainer only suppresses a report for pending/sending/blocked or delivered completion states, omitting `outcome-unknown` (`parent-delivery-drainer.service.ts:216-231`).

## Failure modes

### Linked body omitted at size boundary

- Trigger: Adding one to `reportsDelivered` increases the completion envelope length beyond the cap.
- Symptom: Parent receives a completion without the closing report; report is marked delivered and never sent standalone.
- Evidence: `lane-completion-notifier.service.ts:431-437,493-497`; `parent-envelope-store.service.ts:238-242`.
- Current handling: The second attach uses `?? this.completionEnvelope(signal, info)` while retaining `coalescedReportKey`.
- Recommendation: Render the exact final body once, check its size, and set the link only if that exact body contains the report.

### Transient completion send produces two turns

- Trigger: Completion send is rejected as not accepted, then retries successfully.
- Symptom: Standalone final report wakes parent, followed by linked completion containing the same report.
- Evidence: `lane-completion-notifier.service.ts:507-509,696-701`; `parent-delivery-drainer.service.ts:297-310`.
- Current handling: Every non-pending, non-delivered result releases the held report, including `blocked-retryable`.
- Recommendation: Keep the report held while a linked completion remains retryable, or remove the report and link from that completion before releasing it.

### Completion crosses deadline during preparation

- Trigger: `heldFinalReport` selects a report just before its deadline; body read/checkpoint delays completion enqueue until after the deadline.
- Symptom: Timer drains standalone report first; completion later attaches the stale selected body and wakes parent again.
- Evidence: `agent-report-coalescer.ts:6-11`; `lane-completion-notifier.service.ts:422-425,503-505`; `parent-delivery-drainer.service.ts:213-235,313-343`.
- Current handling: The selection and completion enqueue are separate operations; no revalidation of report state occurs at enqueue.
- Recommendation: Atomically reserve/link only a still-pending report when persisting completion, or atomically choose standalone delivery.

### Unknown completion outcome permits second turn

- Trigger: Adapter accepts a linked completion but throws ambiguously, or host restarts while it is `sending`.
- Symptom: Parent may already have the completion; after 120 seconds its linked report is sent standalone.
- Evidence: `parent-envelope-store.service.ts:575-580`; `parent-delivery-drainer.service.ts:216-235,258-269,297-310`.
- Current handling: `outcome-unknown` is omitted from linked states that suppress report delivery.
- Recommendation: Preserve the link as an unresolved delivery outcome; require explicit reconciliation or manual duplicate-risk confirmation before sending either body again.

### Offline parent delays deadline delivery

- Trigger: Parent remains inactive after the 120-second hold expires.
- Symptom: The report is durable but not delivered until activity resumes; a permanently inactive parent never receives it.
- Evidence: `parent-delivery-drainer.service.ts:205-212,313-318`; `parent-envelope-store.service.ts:295-307`.
- Current handling: The offline mark retains the final deadline but the scheduler excludes `parent-offline`; activity registration restarts draining (`parent-delivery-drainer.service.ts:53-55`).
- Recommendation: Document 120 seconds as a hold deadline, not an unconditional delivery SLA; retain a visible pending state until parent activity resumes.

## Blocking issues

### False link can permanently lose a report

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts:493-497`
- Scenario: The first attachment fits, but the envelope with incremented `reportsDelivered` does not; fallback body excludes the report while the link remains.
- Impact: The parent never sees a report that is marked delivered.
- Fix: Construct and size-check the final persisted body before assigning `coalescedReportKey`; if it does not fit, clear the link and release the report.

### Retryable completion sends duplicate wake

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts:507-509`
- Scenario: A linked completion enters `blocked-retryable` after a transient send refusal; the notifier releases the report, then the completion retries.
- Impact: A successful lane produces two parent turns.
- Fix: Base release on the durable completion's actual state and body; do not release while a linked completion may still send. Test rejected-send then successful retry.

## Serious issues

### Deadline race between selection and enqueue

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts:422-425,503-505`
- Scenario: Selected held report expires while completion is being prepared.
- Impact: Report and completion can both be delivered with the same report body.
- Fix: Perform selection, state check and link creation in one serialized store operation; re-render against the result.

### Ambiguous completion outcome does not guard linked report

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-delivery/parent-delivery-drainer.service.ts:216-231`
- Scenario: A linked completion is `outcome-unknown` after an ambiguous send or restart.
- Impact: The report can become a second wake after the deadline.
- Fix: Treat `outcome-unknown` as unresolved and require explicit reconciliation before standalone release.

## Moderate and minor issues

- Moderate — `parent-delivery-drainer.service.ts:205-212,313-318`: a held report for an inactive parent has no timer scheduled while offline. This is acceptable for a durable queue but the 120-second wording must not imply timely delivery to an inactive parent.
- Minor — `.claude/skills/tribunal/references/council.md:38`: round-two panel guidance says the lane answers with `ptah_agent_report`. This is a specific mid-run exchange and remains consistent with conditional reporting. `.claude/skills/orchestration/references/checkpoints.md:84` likewise concerns a decision; no unconditional final-report mandate was found in the requested paths.

## Data flow

1. MCP input parses optional `final` (`agent-tool.dispatcher.ts:117-121,786-795`) — OK.
2. Router persists a final report with `nextRetryAt = now + 120000` and returns pending (`agent-report-router.service.ts:373-396`) — OK for a held report.
3. Drainer schedules the deadline on drain, startup and retry (`parent-delivery-drainer.service.ts:191-197,233-235,313-343`) — OK while parent is active; offline resumes on activity.
4. Notifier selects report, renders completion, checkpoints and enqueues (`lane-completion-notifier.service.ts:422-505`) — size and deadline races.
5. Drainer sends completion and store settles linked report (`parent-delivery-drainer.service.ts:258-283`; `parent-envelope-store.service.ts:229-245`) — correct only when link matches body and no standalone send won first.
6. Restore converts interrupted sends to `outcome-unknown` and reconciles delivered links (`parent-envelope-store.service.ts:575-593`) — delivered case covered; unknown case remains ambiguous.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| One wake for successful CLI lane | PARTIAL | Transient failure and deadline races duplicate. |
| Final hold with 120-second deadline | PARTIAL | Timer exists; offline sessions wait for activity. |
| No lost held report | PARTIAL | Size boundary can falsely settle report. |
| Truthful count, note and pending result | PARTIAL | Callback follows confirmed delivery, but false completion link makes count/note false. |
| Session-child route and completion verdicts | COMPLETE | `deliverFromSessionChild` is selected before CLI `final` handling (`agent-report-router.service.ts:283-289`); notifier session-child path starts at `lane-completion-notifier.service.ts:704-721`. No changed review reader path observed. |
| Persisted record compatibility | COMPLETE | New fields are optional (`parent-envelope.schema.ts:34-35,96`); old records still parse. |
| Parent/child guidance | COMPLETE | Agent-lanes §6/§7, contract, adapter and core prompt now make final reporting conditional. |
| Strict TS hygiene | COMPLETE | No new `any`, `as unknown as`, `console.*` or empty catches found in changed production paths reviewed. |

Implicit requirements not addressed: atomic ownership of a held report between standalone send and linked completion.

## Edge cases

| Case | Handled | Concern |
| --- | --- | --- |
| Process never exits | YES | Timer releases report if parent active. |
| Completion refused/failed | PARTIAL | Release can race with retryable linked completion. |
| Envelope too large | PARTIAL | General oversize releases; count-width boundary loses report. |
| Host restart | PARTIAL | Delivered link reconciles; unknown completion can duplicate. |
| Outbox replay | PARTIAL | Link is preserved (`lane-completion-replay.ts:20-35`), but release can race with replay. |
| Parent inactive | PARTIAL | Durable pending until activity, potentially indefinitely. |

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: A retryable completion can still wake the parent after its embedded report has been sent standalone.
- What a robust implementation would add: atomic report ownership and link validation, exact-body size checking, and tests for send refusal, deadline crossing, restart with unknown completion, and count-width boundary.

VERDICT: REVISE

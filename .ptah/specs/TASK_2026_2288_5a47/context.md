# TASK_2026_2288_5a47 — context

Evidence and causes: see `investigation-report.md` in this folder.

User decision (2026-11-20): implement all fixes A, B, C, D, E.

## Delivery

One pull request on branch `fix/handoff-successor-early-stop`, one commit per fix.
The child-session contract allows commits on this branch only, so a split into
two pull requests (A+B, then C+D+E) on two branches is not possible here.

## Decisions

- **A (watchdog vs SDK retry).** Both mechanisms, because one alone does not close the race:
  1. Ptah sets `CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS` (150 s) in the unnamed SDK env, unless
     the user set it. The SDK first wait then ends, and `system/api_retry` arrives, before
     the 180 s watchdog. A named-account run has a certified env that carries only `'1'`
     policy keys, so it keeps the SDK default.
  2. The watchdog treats `system/api_retry` as accounted activity and arms one window that
     covers `retry_delay_ms + no_response.retry_wait_ms` plus a margin, capped.
  `NO_ACTIVITY_TIMEOUT_MS` stays 180 s: other code and texts depend on it.
- **B.** Drop or relabel the SDK `<synthetic>` `No response requested.` placeholder in the
  live stream and in history.
- **C.** Retry once for an unattended session (handoff successor, child) after a watchdog
  stop; the retry prompt has a non-human origin.
- **D.** Log and record a stop cause for "Interrupt & send"; label it distinctly.
- **E.** Record budget-monitor subagent stops and label them as Ptah budget stops.

## Batches

| Batch | Fixes | Projects | State |
|---|---|---|---|
| 1 | A | agent-sdk | in progress |
| 2 | B, D, E | agent-sdk, frontend chat (disjoint files) | planned |
| 3 | C | rpc-handlers, cli-agent-runtime | planned |

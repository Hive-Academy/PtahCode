# Implementation report

## Causes (failing tests first)

- A. An idle owner parent made the child route refuse the report. Fixed on `main` by PR #1463
  (durable parent inbox, TASK_2026_2297 P3) while this PR was in review. Not changed here.
- B. A child that ended and was resumed in a new tab reported with the new tab id. The
  registry knew only the old tab id and the SDK id, so the report was `unattributed-caller`.

## Changes (after the merge with `main`)

- `agent-report-router.service.ts`: `findSessionChild` maps an unknown tab id to its SDK
  session id through the session lifecycle (`SDK_SESSION_LIFECYCLE_MANAGER`, optional). An SDK
  id inferred from the worktree path never attributes a report. The `unattributed-caller`
  detail names the causes (not a child, record lost at a host restart, record pruned).
- `session-child.registry.ts`: `sdkSessionIdInferred` mark; `bindSdkSessionId(..., { inferred })`;
  the child's own session-id event clears it.
- `session-spawner.service.ts`: the cwd binding is marked inferred; the snapshot strips the mark.
- Tests: resumed tab, resumed last child of a two-hop child chain with a two-hop parent chain,
  inferred binding refused then confirmed, unattributed detail, lifecycle read failure.

## Review

The earlier in-memory hold design had a codex review (REVISE 4/10, fixed, re-reviewed). That
design was dropped at the merge (decision 16). The remaining lookup and trust rule were
part of that review (finding 2: fixed).

## Follow-ups

- TASK_2026_580: durable parent-child link across a host restart.

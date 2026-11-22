# Implementation report

## Causes (failing tests first)

- A. An idle owner parent (SDK stream ended after its turn) made `isSessionActive` false, and
  the child route refused the report (`parent-session-not-active`) without holding it.
- B. A child that ended and was resumed in a new tab reported with the new tab id. The
  registry knew only the old tab id and the SDK id (`unattributed-caller`).

17 new router tests failed on the old code. The registry held-report tests were written after
the registry change.

## Changes

- `session-child.registry.ts`: held reports on the record (limit 5), an index of records with
  held reports, prune and clear keep such records, rollback moves them back, and an
  `sdkSessionIdInferred` mark for cwd-inferred SDK bindings.
- `agent-report-router.service.ts`: caller lookup through the session lifecycle (tab id to SDK
  id), hold for an inactive owner, flush on any activity for every waiting child through the
  lineage, per-child serialization, owner check before each send, fixed failure text,
  `dispose()`.
- `session-spawner.service.ts`: snapshot strips the new fields; the cwd binding is marked inferred.
- Contract text, agent-lanes skill, docs and the MCP formatter (`**Detail:**`) describe the hold.

## Review

codex code-logic review: REVISE 4/10. Findings 1, 2, 3, 5, 6, 7, 8, 9, 11 fixed with tests;
10 partly; 4 deferred. See `decisions.md` rows 8-14.

## Follow-ups

- TASK_2026_580: durable parent-child link across a host restart.
- SDK peer send: identity check against a displaced session record (agent-sdk).
- Call `AgentReportRouter.dispose()` from Electron and CLI shutdown.

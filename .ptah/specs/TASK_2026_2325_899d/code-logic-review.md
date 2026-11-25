# P1 code-logic review — TASK_2026_2325_899d (backend phase)

Review family: claude (CLI lanes, ambient account; D32). Implementer families: codex, antigravity,
kimi, Ollama Code. Different family for every reviewed file.
Slices: A `code-logic-review-p1-A.md` (6846fb05), B `code-logic-review-p1-B.md` (07500e0e),
C `code-logic-review-p1-C.md` (8c178573). Reviewed head: e02b089d6 (C saw the delete group in the
working tree).

## Verdict (initial review): REVISE — A 7/10, B 7/10, C 7/10

3 Major, 15 Minor. Revise cap: 2 rounds (round 1 started 2026-11-25 ~13:25Z).

## Coordinator triage (D33)

| ID | Sev | Location | Decision | Fix lane |
| --- | --- | --- | --- | --- |
| A1 | Major | agent-sdk `sdk-query-runner.service.ts:504-508` provider from hostname heuristic | accept: carry snapshot providerId | F1 |
| A2 | Minor | platform-core `file-settings-manager.ts:314-318` watcher throw after commit | accept: isolate watchers | F3 |
| A3 | Minor | platform-core `file-settings-manager.ts:290-308` setMany vs later set() | accept as doc comment only | F3 |
| A4 | Minor | shared `skill-document.ts:30-33` no `\` escape | accept: escape `\` first, spec | F3 |
| A5 | Minor | auth-providers `workspace-provider-profile-resolver.ts:642` proxy acquire on read | investigate; fix only if no reuse | F3 |
| B1 | Major | lane-routing `skill-ranking-caller.service.ts:207-233,376-378` System One reported failed/invalid-output | accept: reasonless pick = unresolved, not rejection | F2 |
| B2 | Minor | lane-routing `skill-ranking-caller.service.ts:376-378` items without evidence dispatched | accept: filter before dispatch | F2 |
| B3 | Minor | lane-routing `skill-ranking-caller.service.ts:285-287` deprecated regex | dispute: plan req 3.4 specifies `/\bdeprecated\b/i` on the description | - |
| B4 | Minor | agent-generation `enhanced-prompts.service.ts:396-401` dead chat-pair route | accept: remove if no caller | F2 |
| B5 | Minor | agent-generation `content-generation.service.ts:388-392` silent non-Setup path | accept: warn log | F2 |
| C1 | Major | rpc-handlers `setup-rpc.handlers.ts:408-409` throw after commit | accept: return receipt with non-throwing state | F4 |
| C2 | Minor | rpc-handlers `skill-recommendation.service.ts:647-653` backstop labels Decision skipped | accept: label failed | F4 |
| C3 | Minor | rpc-handlers `harness-llm-runner.service.ts:216-223` pre-submit abort = timed-out | accept | F1 |
| C4 | Minor | rpc-handlers `skill-draft-generation.service.ts:183` control chars | accept (with A4) | F4 |
| C5 | Minor | rpc-handlers `skill-judge.service.ts:300` equal slugs | defer to P2: renderer detects a used slug and asks first | P2 |
| C6 | Minor | rpc-handlers `setup-rpc.handlers.ts:152` buildReasons count | accept: `.max(10)` | F4 |
| C7 | Minor | rpc-handlers `setup-rpc.handlers.ts:178-188` message lacks provider | accept | F4 |
| C-lint | - | `setup-rpc.handlers.ts` 2 eslint warnings | accept (earlier code / file already over limit); future enhancement: split handler | - |

## Revise round 1

Fix commits: 13fcde258 (A1, C3, judge spec follows A1), a441db2ad (B1, B2, B4, B5), ac0edd9d7
(A2, A3, A4), a953fc030 (C1, C2, C4, C6, C7). A5: no change, proxy pool reuses one live entry per
workspace and provider (F3 report). Scoped checks passed for every touched project.
Re-review lanes (claude, fresh with handoff brief): A 543857c7, B 1bbd61d1, C ec24a40a.
Result: A APPROVED 8/10, B APPROVED 8/10, C APPROVED 8/10. All accepted findings Closed; B3 disputed
and accepted by the reviewer; C5 deferred to P2.

## Final verdict (P1): APPROVED

Non-blocking Nits (future enhancements, not task defects):
- A: non-isolated `resolveForPath` fallback keeps the hostname provider guess
  (`auth-providers workspace-llm-resolver.ts:129-137`); Setup always passes the snapshot id.
- A: `ReactiveSettingsStore.writeGlobalBatch` emits without listener isolation
  (`settings-core reactive-settings-store.ts:116-118`); no `setup.*` listener exists.
- C: post-commit fallback state for a cleared pair has an empty provider.
- C: `\\` escape decoding: closed by coordinator, skill discovery uses gray-matter (js-yaml decodes
  double-quoted escapes), e.g. `agent-sdk claude-skill-name-discovery.ts:43`.
- Earlier: `listValidRuns` masks read errors (D30); split `setup-rpc.handlers.ts` (max-lines);
  reason-bearing System One protocol (D26).


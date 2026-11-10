# Code review - head 1a19198e56b89551ecd795497dc49b452b37dfd9

Reviewer: Claude Sonnet 5.5 (claude family)
Implementer family: codex
Review family note: Every non-Claude review lane (antigravity, Glm, kimi, grok) is at its usage limit; the implementer was the codex family, so a different family (Claude) reviews. Static read only: no build, test or verify command was run.

## Verdict

APPROVED

## Round 1 defects

| # | State | Evidence |
|---|-------|----------|
| 1 README stale "three" | closed | `README.md:83` now states no limit by default and `ptah.agentSessions.maxConcurrent` (0 to 50, default 0). A repo-wide search found no other source, docs or skill text with a limit of 3 or 5 live children. |
| 2 docs `effort`, refusal codes | closed | `agent-sessions.md` has the `effort` row, an expanded `model` row, and `invalid-effort`, `invalid-model`, `model-catalog-unavailable` in the refusal list. |
| 3 tests | closed | New spawner tests: slot release after `invalid-model` and after a thrown catalog error (a `maxConcurrent: 1` reservation is reusable afterwards, and `provisioner.create` is not called), empty task reported before any catalog call, no catalog call and no model/effort when omitted. A successor model/effort test is absent; this is not a blocker, because the code path is three plain spread/copy lines (`session-spawner.service.ts:~1607-1608, ~1620, ~1652`), the start-path pass-through is tested, and the risk is a dropped field, not a logic branch. Recommended as a follow-up. |
| 4 description wording | closed | `session-tools.ts`: "wait briefly in that tab" and "No permission, path or parent argument" restored. |
| 5 validation order | closed | In `provisionAndStart` the order is now: task/branch empty checks, planned path and deliverable checks, then the model validation, then `provisioner.create`. |

## Requirement trace

| # | Result | Evidence |
|---|--------|----------|
| 1 effort path | PASS | Handler `session-tool-handlers.ts:403-421` -> schema `effort: z.enum(EFFORT_LEVELS)` -> spawner `host.startChildSession({... effort})` -> adapter `effort: input.effort` -> `chat-session.service.ts:1419` `options: {model?, effort?}`, the same `options.effort` a normal chat uses (`:1664`). One shared `EFFORT_LEVELS` constant. |
| 2 refusals | PASS | `invalid-effort` with accepted list in the handler (`session-tool-handlers.ts:407-415`, `minimal` rejected). `invalid-model` lists accepted IDs (first 30); `model-catalog-unavailable` for a named account, missing catalog service, empty catalog or thrown error (`chat-session.service.ts:1320-1350`, spawner catch). No substitution: the resolved id must be in the catalog. Omitted model -> `resolveChildModel` not called (new test). |
| 3 validate before provision / slot | PASS | The moved block (`session-spawner.service.ts:~343-378`) contains only returns through `refuseStart`; the `provisioner.create` call follows it. The slot reserved in `guardStart` is released in `start()`'s `finally` (`:262-267`) on every refusal and throw, and a test covers refusal and a throw. No new leak. |
| 4 record, successor, output | PASS | Record and runtime carry model/effort; the successor copies both and relaunches with them; `formatChild` prints `model X; effort Y` or `default` for start and status. |
| 5 description | PASS | Old instructions kept (the two wording gaps are restored) plus model/effort guidance and the defaults sentence. |
| 6 limit 0 | PASS | `reserveSlot` skips the check when `max <= 0` (`session-child.registry.ts:108-110`); the cap-reached text is reachable only for positive values; settings read non-number -> 0, floor, clamp 0..50, negative -> 0 (`session-child-settings.ts:37-42,118-123`); tests present. |
| 7 budget | PASS | `tool-result-budget.ts`: 32 KiB tail + fixed 8000-char held allowance; overflow is cut and spooled to `.ptah/tmp/mcp-out/`, not lost. |
| 8 docs consistent | PASS | README, both skill copies, the docs page and the landing line agree. |
| C project rules | PASS | No `any`, `@ts-ignore`, `as unknown as` or `console.*` in added lines; Logger injected; public aliases only; `session-handoff.service.ts` and `session-handoff-closer.ts` untouched by the three review commits. Tests cover validation, pass-through, status output, 0/positive/wrong type/clamp and budget. The coordinator's scoped verify (6 of 6 targets) passed. |

## Defects

1. **minor (non-blocking)** - No test that a successor child inherits model and effort (`session-spawner.service.ts` succession path). Add one when the succession harness is next touched.
2. **minor (non-blocking, accepted gap)** - A named account cannot choose a child model (`model-catalog-unavailable`), and the ambient catalog may differ from a workspace provider profile catalog. Both refuse explicitly and never substitute, so they are handled safely.

No regression found in the correction commit.

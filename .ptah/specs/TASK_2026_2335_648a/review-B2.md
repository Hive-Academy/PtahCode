# B2 Code Logic Review

Verdict: REVISE

## Preserve list

| Item | Kept where | OK/missing |
|---|---|---|
| Prefer `ptah_*` tools; use generated substitution table | `ptah-core-prompt.ts:27-31`; table rendered by `renderCoreSubstitutionBlock()` | OK |
| Deferred tools load with ToolSearch | `ptah-core-prompt.ts:29` | OK |
| Symbol lookups use Ptah before Grep | Generated substitution table at `ptah-core-prompt.ts:31` (source: shared `TOOL_SUBSTITUTIONS`); prompt also says not to use Grep because a Ptah tool is deferred at line 29 | OK |
| Search memory when user refers to past work | `ptah-core-prompt.ts:39-40` | OK |
| Use `execute_code` only without a first-class tool; memory purge only by explicit request and report deletion count | `ptah-core-prompt.ts:33-37` | OK |
| Verification scope, forbidden broad targets, small output | `ptah-core-prompt.ts:42-48` | OK |
| Lane spawn, completion signal, read, deliverables, verdicts, timeout resume | `ptah-core-prompt.ts:59, 76-85`; mechanics and detailed contract in shipped `agent-lanes` skill | OK |
| Subagent isolation and worktree only for parallel writer conflicts | `ptah-core-prompt.ts:85`; `agent-lanes` skill §§2-3 | OK |
| Name teammates | `ptah-core-prompt.ts:85` | OK |
| AskUserQuestion defaults to deciding, with stated conditions | `ptah-core-prompt.ts:89-96` | OK |
| Permission denials are deliberate | `ptah-core-prompt.ts:98-100` | OK |
| Never propose changes to unread code | `ptah-core-prompt.ts:100-101` | OK |
| Orchestration is default, with exceptions | `ptah-core-prompt.ts:103-105` | OK |
| Follow a Routing system reminder | `ptah-core-prompt.ts:107`; orchestration skill also covers it | OK |
| Git authorization follows workspace instructions | `ptah-core-prompt.ts:109-111` | OK |
| Markdown rendering note | `ptah-core-prompt.ts:113-115` | OK |

## Defects

1. **P2 — The prompt spec retains assertions for removed instructions and will fail.** In `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.spec.ts:30-32`, the test still requires the literal “call once after edits, not on every step”; it is absent from the new core prompt and the shipped orchestration/agent-lanes skills. This is within the test's declared load-bearing efficiency rules, so the trim either dropped an intended instruction or failed to update its guard. Reconcile the behavior with the audit, then restore the guidance or change the assertion to the intended retained wording. Check all remaining prompt-string assertions when doing so.

## Checks run

- Read the task context and B2 lane report. `task-description.md` and `implementation-plan.md` are absent from the task folder.
- Inspected `git diff HEAD` for the four named files. The core prompt is host-neutral (“desktop app or editor extension”); no Electron-host contradiction was found.
- Read the new prompt, updated prompt spec, orchestration skill, lane-assignment reference, and agent-lanes skill against the preserve list above.
- Searched `libs/` for prompt-specific spec assertions: only `ptah-core-prompt.spec.ts` asserts the prompt contents; the stale assertion is cited above.
- Confirmed `.claude/skills/orchestration/` and `plugins/ptah-core/skills/orchestration/` contain the same files with identical SHA-256 hashes.
- No tests or build/check targets run (review-only scope).

## Coordinator response (2026-11-28)

Disputed: the phrase "call once after edits, not on every step" is not removed. It is rendered
into the prompt from the substitution table row of `ptah_get_diagnostics`
(`libs/shared/src/lib/tool-guidance/tool-substitutions.ts:128`, unchanged), which the trimmed
prompt still embeds via `PTAH_MCP_SUBSTITUTION_SECTION` (asserted by the same spec). No change.
The coordinator inner loop runs `ptah-core-prompt.spec.ts` to confirm.

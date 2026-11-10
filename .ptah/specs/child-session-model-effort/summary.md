# Child session model and effort - summary

Status: IN REVIEW. Code is committed (3 commits) and reviewed. Task folder:
`.ptah/specs/TASK_2026_915_2621`.

Reviewed code head: `1a19198e56b89551ecd795497dc49b452b37dfd9` (branch
`feat/child-session-model-effort`). A later commit that adds only the task files is not a code
commit.

## Findings of step 1 (state before the change)

Source: codex lane report (`TASK_2026_915_2621/implementation-report.md`). Line numbers refer to
`main` before commit `d27858fe0`. The coordinator read the diff, but did not confirm each line
number independently.

| Question                 | Answer                                                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is `model` applied?      | Yes. Tool args -> spawner launch input (`session-spawner.service.ts:377-432`) -> `child-chat-session-host.adapter.ts:83-108` -> `ChatSessionService.startAgentChildSession` (`chat-session.service.ts:1328-1368`) -> launch options (`chat-session.service.ts:1594-1613`).                           |
| Is `model` validated?    | No. `session-tool-args.schema.ts:37-60` accepted each non-empty string of max 200 characters. No catalog check at the tool boundary.                                                                                                                                                              |
| Unknown ID behaviour     | Not refused consistently. The profile resolver can substitute a different model (`chat-runtime-profile.service.ts:120-159`). `sdk-query-options-builder.ts:1957-2036` examines a cached third-party catalog only; it skips first-party models and a missing cache.                                  |
| Accepted IDs             | Runtime dependent (account and provider). Catalog and resolver: `sdk-model-service.ts:678-709` (`getSupportedModels`), `947-975` (`getNativeClaudeModels`), `1452-1469` (`resolveModelId`, tier aliases `opus` / `sonnet` / `haiku`).                                                              |
| Is `model` persisted?    | No. The child record comes from the snapshot (`session-child.registry.ts:33-42`), which had no model and no effort.                                                                                                                                                                               |
| Handoff / resume         | A live succession copied the transient runtime model (`session-spawner.service.ts:1577-1624`). After a runtime loss the record could not restore it.                                                                                                                                              |
| Effort of a chat session | `EffortLevel` = low, medium, high, xhigh, max (`libs/shared/src/lib/types/ai-provider.types.ts:156`), given as an optional launch option. CLI lanes accept 6 names (`agent-spawn-args.schema.ts:96`, `lane-spawn-policy.ts:328-442`); the chat SDK cannot represent `minimal`.                       |

## Design

### Commit 1 `d27858fe0` - model and effort

- `EFFORT_LEVELS` is the one shared constant; `EffortLevel` and the tool schema derive from it.
- `ptah_session_start` takes optional `effort`. Path: tool handler -> `SessionSpawnerService` ->
  `IChildChatSessionHost` -> `ChatSessionService.startAgentChildSession` -> chat launch options
  (the same options path a normal chat session uses).
- New port method `IChildChatSessionHost.resolveChildModel`, implemented by
  `ChatSessionService.resolveAgentChildModel`. It runs before the worktree is provisioned.
  No new DI registration and no new RPC method, thus the guard specs did not change.
- Refusal codes: `invalid-effort` (with the accepted list), `invalid-model` (with a maximum of 30
  accepted IDs and a remainder count), `model-catalog-unavailable` (with the reason).
- `minimal` is refused for child sessions. A silent change to `low` was rejected.
- The child snapshot and record keep the resolved model and the effort. A successor reuses them.
  The start result and `ptah_session_status` show both; an omitted value shows as `default`.
- The tool description has the guidance: smaller model or lower effort for coordination, Git or
  CI; a strong model for unknown causes, security or architecture; omit both for the defaults.

### Commit 2 `ba45033b2` - limit of live child sessions (scope addition from the user)

- `agentSessions.maxConcurrent`: 0 = no limit, default 0 (was 3), range 0..50 (was 1..5).
  A wrong type gives 0. A negative value clamps to 0.
- `SessionChildRegistry.reserveSlot` does not refuse when the limit is 0. A positive value keeps
  the host-wide count and the `cap-reached` refusal text.
- `tool-result-budget.ts`: the `ptah_session_read` budget uses a fixed allowance for held
  completions (`DEFAULT_TOOL_RESULT_BUDGET_CHARS`), not a value derived from the limit.
- No manifest or settings schema declares the key; only the docs page
  `apps/ptah-docs/src/content/docs/agents/agent-sessions.md`, the `agent-lanes` skill (2 copies)
  and one landing text stated the limit. All were updated, with the memory safety note in the docs.

### Commit 3 `1a19198e5` - corrections for the first review

- `README.md:83` no longer states a limit of three child sessions.
- Docs page: `effort` row, more detail in the `model` row, the three new refusal codes.
- Tool description: "in that tab" and "path" restored (984-character budget kept).
- The model validation now runs after the task, branch and path checks, and before provisioning.
- New spawner tests: slot release after `invalid-model` and after a thrown catalog error, empty
  task reported before a catalog call, no catalog call when `model` is omitted.

## Known gaps

- No test proves that a successor child keeps model and effort. The reviewer accepted this as a
  follow-up (three plain copy lines).

- A parent on a named account cannot select the model of a child: the start is refused with
  `model-catalog-unavailable`. The catalog of a named account needs
  `ProviderAccountService.admitClaudeRoute`, which takes a lease. A read-only catalog path is a
  follow-up task. `effort` stays accepted, and a start without `model` is unchanged.
- The ambient catalog can be different from the catalog of a workspace provider profile when a
  different provider owns the global authentication environment.
- `session-handoff.service.ts` and `session-handoff-closer.ts` were not edited (out of scope).

## Changed files

- `libs/shared/src/lib/types/ai-provider.types.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/`: `session-tool-args.schema.ts`,
  `session-tool-handlers.ts`, `session-tools.ts`, `session-tools.spec.ts`, `tool-result-budget.ts`,
  `tool-result-budget.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/session-children/`: `child-chat-session-host.port.ts`,
  `session-spawner.port.ts`, `session-spawner.service.ts`, `session-spawner.service.spec.ts`,
  `session-child-settings.ts`, `session-child-settings.spec.ts`, `session-child.registry.ts`,
  `session-child.registry.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/`: `chat-session.service.ts`,
  `child-chat-session-host.adapter.ts`, `child-chat-session-host.adapter.spec.ts`,
  `chat-session-agent-child.spec.ts`
- `libs/web/landing/src/lib/sections/multi-vendor/multi-vendor-section.component.ts`
- `apps/ptah-docs/src/content/docs/agents/agent-sessions.md`
- `.claude/skills/agent-lanes/SKILL.md`, `plugins/ptah-core/skills/agent-lanes/SKILL.md`

## Verification results (coordinator runs, on the content of head `ba45033b2`)

- `npm run verify -- -p @ptah-extension/shared,@ptah-extension/vscode-lm-tools,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,web-landing`
  - Lint and typecheck: 10 of 10 targets passed.
  - Test: 3 of 5 passed. 2 failed in specs that this task does not touch:
    `http-server.handler.spec.ts` (port 49890 collision) and `mcp-directory-rpc.handlers.spec.ts`
    (2 tests on install scope files).
- `npm run verify -- -t test -p @ptah-extension/vscode-lm-tools,@ptah-extension/rpc-handlers`
  (second run): 2 of 2 passed. The 2 failures did not occur again.
- `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/cli-agent-runtime`
  (third run, content of head `1a19198e5`, no cache): lint, typecheck and test, 6 of 6 targets
  passed, exit code 0.
- Environment note: the worktree had no `node_modules`; a junction to the main checkout
  `node_modules` was added (git-ignored), as the other worktrees have.

## Lanes

- Implementation: 3 codex lanes (each stopped on the 3,000,000 weighted-token budget after it
  wrote its report). Reports: `implementation-report.md`, `-2.md`, `-3.md` in the task folder.
- Review: the antigravity lane failed (quota), and the Glm, kimi and grok lanes were at their
  limits. A Claude `code-logic-reviewer` subagent did the review (a different family from the
  codex implementer). Round 1 on `ba45033b2`: CHANGES REQUESTED (5 defects). Round 2 on
  `1a19198e5`: APPROVED. Record: `code-review-head.md` in the task folder.

## Review and PR

- Review verdict: APPROVED for head `1a19198e56b89551ecd795497dc49b452b37dfd9` (static review).
- PR number: 1047 (https://github.com/Hive-Academy/PtahCode/pull/1047), against `main`.
- CI state: started at the push of `1a19198e5`. The report to the parent session and the pull
  request page give the current state.

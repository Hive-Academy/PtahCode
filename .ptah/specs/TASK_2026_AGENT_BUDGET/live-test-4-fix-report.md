# Live test round 4 fix report

## Root cause and protocol evidence

`codex-context.ts:406-432` previously linked an unknown child only after `thread/started` or a parent spawn item had identified it. Round 4 delivered `thread/status/changed` first, then `turn/started`, usage, and completion, without `thread/started` (sanitized log 64174-64201). The context buffered child events and never admitted the terminal, so the budget observer received no child charge. The vendored schema names `Thread.parentThreadId` at `protocol/codex-app-server-protocol.schema.json:21301-21306`, but that field is unavailable in the observed notification order. The parent spawn item contract identifies `receiverThreadIds` and `senderThreadId` at `:22856-22865`, and its type is `collabAgentToolCall` at `:22883-22889`.

## Fix

An unknown non-root thread ID on the context connection is linked to the context root on its first notification. A later parent spawn item confirms its tool correlation; a spawn item arriving first also establishes the correlation. The early event buffer remains bounded. Each newly linked child emits one `Codex child linked` info line with parent and child IDs. The debug line records only method and sorted parameter field names. Admitted child usage and terminal events carry parent-thread attribution, which lets `CodexChildBudgetTap` settle once on the terminal; the usage notification supplies accepted counters and the observed model. The existing policy evaluates the child's reported context occupancy against `handoffContextTokens`.

The Codex CLI lane prepends its queued warning to the next turn input and now logs `agent-budget-warning` when it injects that warning, without logging input text.

## Specs and verification

`codex-context.spec.ts` replays the round 4 method order with interleaved parent activity, checks two children, verifies parent spawn confirmation after and before the first child notification, and checks one decision per child terminal with observed model. Existing buffer-limit coverage remains. The CLI adapter spec covers queued warning injection into the next turn.

Focused `npm run verify -- -t test -p codex-runtime -- --testPathPatterns=codex-context.spec.ts` passed. Final `npm run verify -- -p shared,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli` passed all 14 lint/typecheck tasks and 16 of 17 test tasks. The sole failing task was `platform-core:test`, with exactly the two permitted known failures `control-endpoint.spec.ts` and `kernel-session-driver-lock.spec.ts`. Scoped `ptah_get_diagnostics` after the final source edit reported zero errors and warnings. `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0 with no FAIL result; its existing unsuppressed-site count was 216. `agent-process-manager.service.ts` was not edited.

## Decisions

- An unknown thread on this context belongs to its root until a parent spawn item provides a more specific parent. This follows the task coordinator's decision and the context's single-root ownership; reversible.
- The stable warning identifier is `agent-budget-warning`; the queued warning has no existing generated ID. Reversible.

## Remaining gaps

No live Ptah Dev run was performed. Runtime behavior of the installed Codex app server still needs a live check, including whether it emits a parent spawn item and the resulting advisory near-limit decision.

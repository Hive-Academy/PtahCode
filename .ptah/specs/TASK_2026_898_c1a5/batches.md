# Batches — TASK_2026_898_c1a5

All batches are **PENDING**. Paths are repository-relative; every listed spec belongs to the same batch as its implementation. Phase A must ship before Phase B. Commands are for executors; no verification was run here. Project names below match their `project.json` names.

## Plan validation

- Ptah AST confirmed `SessionHandoffService.guardAndStart` (196–315), `onCallerTurnFlushed` (567–573), `armCallerStop` (575–580), `stopCaller` (595–616), and SDK binding (628–651). It confirmed `TabManagerService.closeTab` (1490–1593), `closeTabAcrossWorkspaces` (1614–1634), and `TaskEndTransitionDetector.reconcileStartup` (203–212). The plan's cited ranges are real, with harmless one-line offsets. The cited dispatcher, skill trigger, Electron composition, session RPC, auto closer, and all four Electron guard files exist.
- Correction: `cli-agent-runtime/src/lib/di/registration.ts` is absent; the existing file is `di/register.ts`. `task-end-hook/ports/pr-status.port.ts` exists and is modified, not created. New `close-out/`, `platform-electron/src/git/`, and `platform-cli/src/git/` directories must be created with their new files. `task-rpc.handlers.ts` is new; `session-rpc.handlers.ts` exists.
- The existing `session-handoff.service.spec.ts`, `tab-close-session-end.integration.spec.ts`, `dispose-evaluate.step.spec.ts`, `task-end-run-worker.spec.ts`, and `skill-trigger.service.spec.ts` are assigned with code. New specs below have existing parent directories except new Git adapters.
- The plan names `protocol-dispatcher.ts` and `rpc.types.ts` in both phases. For strict file-disjoint ownership, A3 owns them once and creates a lifecycle-tool registration seam; B8 plugs new tools through it. Phase B's optional UI RPC is omitted because no UI caller is identified. If that seam cannot work without reopening A3 files, B8 must report the conflict before editing.
- AC3's ordinary Done-row sentence is superseded by binding decision 9: exact manual-close behavior, with lineage retained and no special archive/delete/filter. Decision 8 gates automatic cleanup behind default-off opt-in plus clean and merged checks. Decision 11 retains Stop/boot memory curation while removing automatic skill harvest.

## Phase A — acknowledgement and close

| Batch / status | Files owned (≤6; paths abbreviated by common prefix) | Depends on | AC | Executor | Scoped verify |
| --- | --- | --- | --- | --- | --- |
| **A1 COMPLETE** (6fb263df8) | `libs/backend/cli-agent-runtime/src/lib/session-children/{session-handoff.service.ts,session-handoff.port.ts,session-handoff-ack.store.ts (new),session-handoff.service.spec.ts,session-handoff-ack.store.spec.ts (new)}`. Durable pair/path, delayed stop, retry checkpoint. | — | 1,2,4 | backend-developer | `npm run verify -- -p @ptah-extension/cli-agent-runtime` |
| **A2 COMPLETE** (6fb263df8) | `libs/backend/cli-agent-runtime/src/lib/di/{tokens.ts,register.ts,register.ptah-cli-registry.smoke.spec.ts}`; `libs/backend/cli-agent-runtime/src/lib/session-children/index.ts`. Register/export ack service. | A1 | 1,2,4 | backend-developer | `npm run verify -- -p @ptah-extension/cli-agent-runtime` |
| **A3 COMPLETE** (scope widened by decision 13; codex lane 70b15c03 + orchestrator spec fixes) | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/{protocol-dispatcher.ts,session-handoff-ack.tool.ts (new),session-handoff-ack.tool.spec.ts (new)}`; `libs/shared/src/lib/types/rpc.types.ts`; `libs/backend/rpc-handlers/src/lib/handlers/{session-rpc.handlers.ts,session-rpc.handlers.spec.ts}`. Validated caller/pair/path and exact-close bridge. | A2 | 2,4 | backend-developer | `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/shared,@ptah-extension/rpc-handlers` |
| **A4 COMPLETE** (decision 14; codex lane 6726c53c, orchestrator verify) | `libs/frontend/chat-state/src/lib/{tab-manager.service.ts,tab-manager.cross-workspace.spec.ts}`; `libs/frontend/chat/src/lib/services/{auto-handoff-source-closer.service.ts,auto-handoff-source-closer.service.spec.ts (new),tab-close-session-end.integration.spec.ts}`. Await ordinary close and execution stop for exact binding. | A3 | 2,3,4 | frontend-developer | `npm run verify -- -p @ptah-extension/chat-state,@ptah-extension/chat` |
| **A5 PENDING** | `apps/ptah-electron/src/di/{container.smoke.spec.ts,expected-resolvable.ts,rpc-surface.spec.ts,surface-composition.spec.ts}`. Guard service/RPC composition. | A3,A4 | 2,3 | backend-developer | `npm run verify -- -p ptah-electron` |
| **A6 PENDING** | `.claude/skills/session-handoff/SKILL.md`; `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts` (new). Document exact-file read, adopted work, ack/retry/fallback; test partial/restart/idempotent close. | A1–A5 | 1,3,4 | backend-developer | `npm run verify -- -p @ptah-extension/cli-agent-runtime` |

**Parallel:** A batches are sequential because their integration boundaries depend on the preceding batch. A6 closes Phase A.

## Phase B — task lifecycle and close-out

| Batch / status | Files owned (≤6; paths abbreviated by common prefix) | Depends on | AC | Executor | Scoped verify |
| --- | --- | --- | --- | --- | --- |
| **B1 PENDING** | `libs/backend/task-end-hook/src/lib/ports/{pr-status.port.ts,git-cleanup.port.ts (new)}`; `config/{task-end-hook-config.ts,task-end-hook-config.spec.ts}`; `di/tokens.ts`. Typed boundaries, default-off opt-in. | A6 | 5,6,9 | backend-developer | `npm run verify -- -p @ptah-extension/task-end-hook` |
| **B2 PENDING** | `libs/backend/task-end-hook/src/lib/persistence/{task-end-store.interface.ts,sqlite-task-end.store.ts,sqlite-task-end.store.spec.ts}`; `close-out/{task-close-out.service.ts,task-close-out.service.spec.ts}` (both new). One durable task/PR run and independent step retries. | B1 | 7,9,10 | backend-developer | `npm run verify -- -p @ptah-extension/task-end-hook` |
| **B3 PENDING** | `libs/backend/task-end-hook/src/lib/close-out/{task-pr-reconciler.service.ts,task-pr-reconciler.service.spec.ts}` (new); `trigger/{task-end-transition-detector.ts,task-end-transition-detector.spec.ts}`. PR confirmation, bounded polling/backoff, status-line-only transition, closed-unmerged result. | B1,B2 | 5,6 | backend-developer | `npm run verify -- -p @ptah-extension/task-end-hook` |
| **B4 PENDING** | `libs/backend/task-end-hook/src/lib/worker/{task-end-run-worker.ts,task-end-run-worker.spec.ts}`; `steps/{dispose-evaluate.step.ts,dispose-evaluate.step.spec.ts}`. Gate harvest on merge/explicit request; separate cleanup evaluation and removal. | B2,B3 | 7,8,9 | backend-developer | `npm run verify -- -p @ptah-extension/task-end-hook` |
| **B5 PENDING** | `libs/backend/platform-electron/src/git/{task-cleanup.adapter.ts,task-cleanup.adapter.spec.ts}` (new); `libs/backend/platform-electron/src/registration.ts`; `libs/backend/platform-cli/src/git/{task-cleanup.adapter.ts,task-cleanup.adapter.spec.ts}` (new); `libs/backend/platform-cli/src/registration.ts`. Non-force clean/merged guarded cleanup and partial retry. | B1 | 9 | devops-engineer | `npm run verify -- -p @ptah-extension/platform-electron,@ptah-extension/platform-cli` |
| **B6 PENDING** | `libs/backend/task-end-hook/src/lib/di/register.ts`; `libs/backend/task-end-hook/src/index.ts`; `apps/ptah-electron/src/di/task-end-hook-composition.ts`; `apps/ptah-electron/src/activation/{task-end-hook.activation.ts,task-end-hook.activation.spec.ts}`. Host PR reconciliation, merge enqueue, cleanup port, boot gate. | B3–B5 | 5,6,7,8,9 | backend-developer | `npm run verify -- -p @ptah-extension/task-end-hook,ptah-electron` |
| **B7 PENDING** | `libs/backend/skill-synthesis/src/lib/triggers/{skill-trigger.service.ts,skill-trigger.service.spec.ts}`; `libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts`; `libs/backend/cli-engine/src/lib/container.ts`; `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`; `libs/backend/cli-engine/src/lib/surface-composition.spec.ts`. Remove Stop harvest, keep telemetry/explicit harvest and verify CLI wiring. | B4 | 8 | backend-developer | `npm run verify -- -p @ptah-extension/skill-synthesis,@ptah-extension/cli-engine` |
| **B8 PENDING** | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/{task-close-out.tools.ts,task-close-out.tools.spec.ts,task-cleanup-completed.tool.ts,task-cleanup-completed.tool.spec.ts}` (new). Via A3 seam, validated start/status and common manual cleanup result. | A3,B6 | 7,10 | backend-developer | `npm run verify -- -p @ptah-extension/vscode-lm-tools` |
| **B9 PENDING** | `.claude/skills/orchestration/SKILL.md`; `.claude/skills/orchestration/references/{task-tracking.md,git-standards.md}`; `CLAUDE.md`. PR/review/merge steps, explicit close-out and manual hook, opt-in authorization/pending result. | B3,B6,B8 | 5–10 | devops-engineer | `npm run verify -- -p @ptah-extension/task-end-hook` |

**Parallel:** B2 and B5 can run after B1. B7 and B6 can run once their dependencies finish. B7 and B8 can run in parallel after B6. B9 may run alongside B7 after B8. Every parallel pair is file-disjoint.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Journal → PR reconciliation → worker → host wiring order. | Host-first; journal-first. | Approved phase ordering and durable retry requirement. | Yes |
| Manual-close behavior for predecessor; no special session-list change. | Archive/delete/filter; ordinary close. | Binding decision 9. | Yes |
| Default-off opt-in cleanup, clean and merged checks. | Per-task; opt-in; unconditional. | Binding decision 8. | Yes before removal |
| Keep Stop/boot memory curation; remove automatic skill harvest. | Remove both; retain both; harvest only. | Binding decision 11. | Yes |
| Single owner for shared dispatcher/RPC files, no optional B UI RPC. | Reopen in B; own in A. | File-disjoint rule; B UI RPC conditional with no UI caller. | Yes |

### Next action:

Run **A1** with backend-developer, then A2. Do not begin Phase B until Phase A is accepted.

# Code Style Review — TASK_2026_886_cae4, Phase 1

## Verdict

**REVISE — 8/10.** One serious structure issue; no blocking, moderate, or minor findings. This is a style verdict for Batches 1–10 only. The store implementation and DI registration are assigned to later batches (batches.md:78,100).

## Findings

1. **Serious — split the disposal collector by responsibility.** `libs/backend/task-end-hook/src/lib/dispose/disposal-input.collector.ts:191` defines a class that spans candidate discovery (`:205`), worktree and git probes (`:418`, `:688`), task-carrier scanning (`:443`), activity queries (`:494`), and PR lookup (`:669`). The same file also implements filesystem carrier reads (`:823`), path resolution (`:922`), and ignored-file walking (`:979`). At 1,045 lines, a change to one probe requires navigating several independent boundary rules, and the helpers have no focused unit boundary for their own tests. Keep `DisposalInputCollector` as the orchestrator, and move the carrier/path and ignored-file read logic into focused local modules with typed results. Preserve its existing port-based dependency direction.

## Decisions

- **Accept the session-link port boundary.** `libs/backend/task-end-hook/src/lib/ports/session-link.port.ts:14` carries the worktree-name query without importing session-organization; `libs/backend/session-organization/src/index.ts:41` exports the host adapter's function. This follows D2. Options were a direct library import or port delegation; the latter avoids pulling agent-sdk through session-organization and is reversible.
- **Accept the duplicated run-reader token for this phase.** `libs/backend/task-end-hook/src/lib/di/tokens.ts:52` and `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:264` use the same `Symbol.for` key. The nearby `MEMORY_WRITER_TOKEN` at `ptah-api-builder.service.ts:254` establishes the same cross-library pattern; a direct task-end-hook import would reverse the intended dependency. The duplication has a synchronization cost, but is a deliberate, reversible boundary choice.
- **Do not flag future registration or store work.** `libs/backend/task-end-hook/src/lib/di/tokens.ts:34` names classes registered by the later `registerTaskEndHook`; D4 and D26 in `batches.md:78,100` assign registration to Batch 15. The interface at `libs/backend/task-end-hook/src/lib/persistence/task-end-store.interface.ts:131` is intentionally ahead of its implementation under D3 (`batches.md:77`).

## Verification

Read `/var/tmp/b886/phase1-files.txt`, the Phase 1 diff, `implementation-plan.md`, and `batches.md` decisions D1–D27. Inspected the new shared vocabulary (`libs/shared/src/lib/types/task-end-hook.types.ts:23,181,312,359,452`), its barrel export, task-end-hook ports, DI tokens, store interface, config, disposal and step structure, the task-writer settle signal (`libs/backend/task-specs/src/lib/task-writer.service.ts:245-319`), migration 0072 (`libs/backend/persistence-sqlite/src/lib/migrations/0072_task_end_hook.ts:6`), session-organization export, and the optional `endHook` read block (`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.ts:724-742`). Compared port and token naming with task-specs, memory-curator, skill-synthesis, and session-organization. The shared outcome union uses literal states and reasons (`task-end-hook.types.ts:181-305`); no new `any`, suppression, session-organization import, or agent-sdk import appeared in the library source. The library barrel contains the Batch 2–3 exports only (`libs/backend/task-end-hook/src/index.ts:6-44`), consistent with D4.

No git, Nx, npm, build, or test command was run for this read-only review. Ptah workspace and AST tools were used for structure; native reads were used for the supplied diff and targeted source lines.

## Round 1

Reviewer: codex (implementer family: claude). Full text: phase-1-round-1-review.md.

Verdict: APPROVED
Score: 8/10

- S1: RESOLVED — the collector imports the extracted helpers
  (`dispose/disposal-input.collector.ts:56-65`) and now has 809 lines. The helpers
  `candidate-path.resolver.ts`, `ignored-files.walker.ts`, `task-spec.reader.ts` and
  `fs-probe.ts` have focused implementations and specs.
- New defects: none.

# Context — TASK_2026_2312_c3ef

Make the workspace code index correct and cheap.

- Coordinator: child session `index-audit-and-fix` (parent orchestrator relays user approval).
- Worktree: `/home/amun/ptah-extension/.claude-worktrees/fix-index-scope-and-reuse-18b88e63630e`,
  branch `fix/index-scope-and-reuse`, base `main` at `467a1ddb6`.
- Part A: audit (`index-audit.md`) and plan (`implementation-plan.md`). HARD STOP for approval.
- Part B: fixes, only after the parent relays approval.
- Part C (nav-tool follow-ups) belongs to another child session on another branch. Not here.

## Gate 0.1 (CLI lanes)

- Preference source: parent brief. Lanes with room at start: codex, Ollama Code. kimi code at limit.
- Mode: `enabled`. Approval mode for document gates: `user` (the parent brief requires explicit
  approval of the plan before implementation; this overrides `lane-review` auto-pass).
- Cross-side document review of the plan: one codex lane (read-only review).

## Measurement method (A5)

A temporary, uncommitted Jest harness (`index-measure.local.spec.ts`, now kept at
`.ptah/tmp/index-measure/harness/`, outside the source tree; raw JSON beside it) ran the real
`WorkspaceIndexerService` discovery chain, the real `CodeSymbolIndexer` and real tree-sitter WASM
over this worktree, with an in-memory counting sink. No SQLite file, no embedder, no app instance,
no write to the real HOME. The main checkout got a read-only discovery walk only.

# Context — Thoth Memory graph (phase 2 of TASK_2026_2271_7a3e)

Program: `TASK_2026_2271_7a3e` (Thoth Memory and Skills redesign). This task is phase 2.

## Design of record (approved by the user, 2026-11-18)

The design docs are in pull request #1427 (branch `feat/thoth-panels-design`). Until that pull
request merges, read them in the phase 1 worktree:

- `<main-checkout>/.claude-worktrees/thoth-panels-design/docs/design-system/thoth/README.md`
- `.../thoth-design-spec.md` (section 12 = feature-parity tables; this is the parity inventory)
- `.../thoth-apply-plan.md` (section "Phase 2": `memory:graph` contract and file plan)
- `.../prototype/thoth-prototype.html` and `.../prototype/screens/*.jpg`

## User decisions (do not ask again)

1. Memory main view is a graph. A List view and an inspector stay.
2. Edges: semantic (sqlite-vec) + same subject + same session, from a new RPC `memory:graph`.
   State for vec off: no semantic edges, with a message.
3. Renderer: Sigma.js + graphology, loaded lazily.
4. Dropdowns are `ptah-select`. Text fields are `ptah-field` with a floating label.
5. One pull request for Memory + `memory:graph`. Skills is phase 3.

## Scope

In: `memory:graph` RPC (shared types, memory-curator service, search worker, rpc handler and
schema), Memory panel in `libs/frontend/memory-curator-ui` (graph, filter rail, inspector, List,
Timeline, Boards, Code index, Health views on `@ptah-extension/ui`), new dependencies
`sigma`, `graphology`, `graphology-layout-forceatlas2`.

Out: Skills panel, Messaging, Schedules, thoth-shell structure, VS Code and TUI hosts (only
compatibility changes).

## Gate 0.1 (2026-11-18)

- Preference source: none stored (memory search returned no execution preference).
- Lane mode: `enabled`. Approval mode: `lane-review`.
- Spawnable lanes: `codex` (cli, confirmed room, weekly 71%), `antigravity` and `grok`
  (installed, limit unknown). `copilot` and `claude` are disabled. `Ollama Code` and `kimi code`
  are at their limit. `cursor`, `opencode`, `pi` are not installed.
- Gate 1.7 (design): approved by the user. Gate 1 (requirements): covered by the approved
  design spec and the user decisions above.

## Phases

| Phase | Kind | Executor | State |
| --- | --- | --- | --- |
| A | architecture (two plan files) | orchestrator | done |
| B | document-review (Gate 2) | codex lane | done: REVISE, revision 1 applied (8 defects) |
| C | batch + implement | backend-developer, frontend-developer | not started |
| D | review, tests, visual-review | reviewers | not started |
| E | completion, PR | orchestrator | not started |

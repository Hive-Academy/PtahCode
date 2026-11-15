# Step 1 real task (plan item 11)

| Field | Value |
|---|---|
| Task | Add one regression spec for the retired explicit-role routing path in `lane-routing` `phase-plan.ts` (`candidatesFor`). |
| Phase kind | `implement` |
| Executor | codex CLI lane (non-subagent), agent `b7931c90-99c0-4458-b927-a9daeae9a9a8` |
| Deliverable | `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts` (new case near :53), report `step-1-real-task-lane.md` |
| Lane verdict | `delivered`, exit 0 |
| Review | Coordinator (other family) read the diff: approved. No production change. |
| Focused checks | Jest 1 suite, 17 tests pass. ESLint pass. Scoped gate: see the PR test plan. |
| Outcome row | `ptah_outcome_report` deliverables (taskKind `implement`, routingSource `not-routed`) and review `approved`, both `recorded: applied`, run `b7931c90-…:2026-11-15T07:57:29.693Z`. |

## Route evidence

- Branch behavior: the new spec runs the real `candidatesFor` pipeline. A retired role
  (`backend-developer`, `Frontend-Developer`, ` devops-engineer `) yields only the phase-kind
  candidate. An active role (`code-logic-reviewer`) keeps its explicit candidate.
- Electron and CLI use the same `lane-routing` library, so the spec covers both routes.
- Live host before the merge: `ptah_route_decide` (gate-0.1) on the installed host runs `main`
  code. It still lists `subagent:backend-developer` as a candidate for an `implement` phase with
  role `backend-developer`. This is the expected "before" state.
- Open: run the same `ptah_route_decide` call on Electron and through the CLI after the merge and a
  release build. Expect no `subagent:backend-developer` candidate. A build is not part of this step.

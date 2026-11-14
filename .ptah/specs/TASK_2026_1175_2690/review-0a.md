# PR 0a review (codex, independent)

Reviewer: codex lane (read-only sandbox). The sandbox refused the file write, so the coordinator
copied the final answer of the lane here. Diff: `803b7bd8b..d3cbe63ac`.

**Verdict: request changes. Score: 82/100.**

| Severity | File:line | Finding | Proposed fix |
| --- | --- | --- | --- |
| Major | `libs/backend/skill-synthesis/src/lib/skill-task-grade.store.ts:293` | The legacy query excludes a role grade when any phase grade has the same task and attribution key. If that phase grade belongs to a different phase, the role grade disappears from its alias phase scorecard. The test covers only matching phases. | Exclude the role grade only when the phase grade slug matches the alias phase of the role. Add a test with different phase slugs on the same task and attribution key. |
| Minor | `libs/frontend/skill-synthesis-ui/src/lib/services/clone-bulk-rebase.service.ts:28` | A service imports `isRoleAgentClone` from a component directory. The service then depends on presentation code. | Move the predicate to a neutral helper, or use the shared alias function in the service. |

Confirmed by the reviewer: the migration uses static SQL, is version 75 and leaves existing grade
keys `NULL`. The recorder persists `phaseKind`. The clone body mutation RPCs have the retired-role
guard. The bulk view and service skip role agents, and the backend refuses calls marked `bulk`.
`ROLE_RETIRED` is upper snake case. No `any`, `as unknown as` or `ts-ignore` in the changed
implementation files.

Not checked by the reviewer: builds, tests, `nx`, the rendered UI, and indirect clone writers
outside the reviewed RPC handlers.

## Coordinator disposition

| Finding | Disposition | Reason |
| --- | --- | --- |
| Major | Disputed, no logic change. A test and a comment pin the rule | The role grade and the phase grade with the same key `run:<id>` come from the same lane row (`skill-task-grade.store.ts` lane and phase attribution queries). The phase grade has the real phase kind of that run. The run counts one time, under its real phase. To count it again under the alias phase gives one lane row two grades in the phase scorecards. New test: "counts a run under its real phase when the role alias names another phase" |
| Minor | Fixed | `isRoleAgentClone` moved to `libs/frontend/skill-synthesis-ui/src/lib/role-agent-clone.ts`. The gating module re-exports it. The service imports the neutral file |

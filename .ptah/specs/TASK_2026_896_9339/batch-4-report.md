# Batch B4/R4 contract text correction

Finding 8 is resolved in the six skill passages and the `ptah_route_decide` tool description.
This round changed contract text and its description assertion only.

| Files | Corrected contract |
| --- | --- |
| Both `agent-lanes/SKILL.md` copies | System CLI rows other than `claude` use `lane-default` unless the decision chose an exact ID from that CLI's live list (`source: model`). Deterministic ranking uses `lane-default`. Pass a concrete row model as spawn `model`; omit it for `lane-default`. |
| Both `orchestration/references/lane-assignment.md` copies | The same row and spawn rule, with unavailable rows described as null. |
| Both `orchestration/references/team-leader-modes.md` copies | The same row and spawn rule for post-decomposition routing. |
| All six skill passages | For ptah-cli and `cli: "claude"`, pass row `tier` as `modelTier` and do not pass row `model`. Pass row `effort` as spawn `effort` when present; it overrides the per-CLI reasoning-effort setting for that call. A user-pinned lane/model wins. Never invent a model ID. For a system CLI, resolution remains request `model` -> `agentOrchestration.<cli>Model` setting -> native CLI default. |
| `route-tools.ts`, `route-tools.spec.ts` | The description excludes `claude` from the system CLI model rule, includes the ptah-cli/Claude tier rule, and has an updated assertion. |

The changed lines match between each pair of skill copies. `git diff --check` passed for the eight edited source files.

## Verification

Ran `npm run verify -- -p @ptah-extension/vscode-lm-tools` once, in the foreground.
It waited for a verification slot, then lint and typecheck passed (2/2 tasks).
The test target exited 1: 44 suites failed only with `Could not locate module marked
mapped as ...`, the known worktree module-mapping limit. Another 63 suites and all
1,251 executed tests passed. `route-tools.spec.ts` was among the passed suites: it is
absent from the failure list in the test log. No retry, install, or broader check was run.

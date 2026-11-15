# Test report

Run from the worktree root with `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath ...`.

| Spec | Result |
| --- | --- |
| `libs/backend/agent-sdk/.../codex-chat-adapter.spec.ts` and `routing-agent-adapter.spec.ts` | PASS, 2 suites, 165 tests (includes 3 new D13 tests) |
| `libs/backend/cli-agent-runtime/.../session-spawner.service.spec.ts` | **NOT EXECUTED**: environment failure |

## Spawner spec blocker
The suite fails to load: jest cannot locate `<worktree>/node_modules/marked/lib/marked.umd.js`. The worktree's `node_modules` lacks `marked`, and the module is pulled in through `agent-sdk` -> `tool-output-reducers`. This is unrelated to the change. I did not alter the jest config or the environment.

## Substitute evidence
- A first run type-checked the spec through ts-jest and found a read-only `sdkSessionId` assignment. I fixed it to use `registry.bindSdkSessionId`.
- `ptah_get_diagnostics` on the service, spec and port files reports 0 errors.
- Run the spawner spec once `marked` is installed in the worktree, or from the main checkout, to confirm that the existing stop and grace tests still pass with the new harness behaviour.

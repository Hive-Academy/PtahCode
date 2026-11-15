# D24 fix

Modified files:
- `libs/shared/src/lib/types/cli-lane-defaults.types.ts`
- `libs/shared/src/lib/types/cli-lane-defaults.types.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.spec.ts`
- `FIXED_D24.md`

The built-in permission search now starts with `plan`. Tests cover the shared default, the backend resolver expectation, and spawn environment resolution with no saved lane-policy row or requested permission. The spawn environment test verifies effective `plan` and native `plan` mode.

Verification:
- Shared focused Jest: passed, 3 tests.
- Backend spawn-environment focused Jest: passed, 68 tests. A temporary junction to the repository's existing `node_modules` was needed for Jest's `marked` mapping; it was removed afterward.
- `npx tsc --noEmit --project libs/shared/tsconfig.json`: passed.
- Electron UI: not verified. The edited source was not rebuilt or reloaded into the running Electron host; the task prohibited build/serve targets. The focused spawn-environment test verifies the Electron-shared policy path before launch.

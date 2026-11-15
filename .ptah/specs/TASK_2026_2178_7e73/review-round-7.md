VERDICT: APPROVE

Reviewer: Claude Sonnet 5.5 (Antigravity). Read-only review of the 5 uncommitted files.

Verification: I ran the 5 changed or related specs with the focused jest command. That covered cli-lane-policy-resolver, permission-routing, spawn-model, off-thread-spawn and agent-process-manager. Result: 5 suites passed, 307 tests passed. The only console noise was an existing `[Pricing]` warning. I did not run eslint or tsc.

## Answers

1. **Do the test changes match D24 without weakening enforcement? Yes.**
   - `ptah-cli-registry-permission-routing.spec.ts:191-205` replaces the two yolo-default tests with one plan-default test.
     - It asserts `permissionMode: 'plan'` and `allowDangerouslySkipPermissions: false`.
     - It asserts `bypassPermissions` is not used. This is a stronger and correct negative check.
   - The `permission: 'yolo'` additions in spawn-model and off-thread-spawn only keep unrelated stderr/resume tests on their old path. They are explicit, not defaults.
   - The task-text suffix expectations in `agent-process-manager.service.spec.ts` are the real plan instruction. They use the exported `LANE_PLAN_MODE_INSTRUCTION`, not a hardcoded string.
   - Real adapters that support plan, so production spawns do not throw:
     - claude-cli (`claude-cli.adapter.ts:108`)
     - codex (`codex-app-server-lane.adapter.ts:194`, plan = read-only, network deny)
     - antigravity (`antigravity-cli.adapter.ts:450`)
     - copilot-sdk (`copilot-sdk.adapter.ts:221`)
     - opencode (`opencode-cli.adapter.ts:378`)
     - Ptah CLI (spreads `PTAH_CLI_PERMISSION_CAPABILITIES`; the plan-default spec passes against it)

2. **Is the fixture default reasonable? Is the fail-closed path covered? Yes to both.**
   - `testing/manifest.fixture.ts:26-28` defaults to supported plan with `networkModes: ['allow']`. It still accepts an override through `permissionModes`.
   - `cli-lane-policy-resolver.spec.ts:185-196` ("fails closed when adapter does not support plan") covers the fail-closed throw.
     - It asserts `UNSUPPORTED_LANE_POLICY` and the message "does not support plan".
   - Lines 79-104 cover the parent-plan cap and the unsupported-plan manifest.

3. **Did any test lose meaningful coverage? No.**
   - The deleted "keeps main behavior" test asserted the old yolo semantics, so it was obsolete.
   - Its `canUseTool` and `createCallback` negative assertions were dropped. In plan mode they are largely moot.

## Findings

- **[Info / production behavior, not a test defect]** Adapters whose manifest marks plan unsupported now throw `UNSUPPORTED_LANE_POLICY` when spawned with no explicit permission and no saved row.
  - Affected adapters: cursor (`cursor-cli.adapter.ts:291`), grok (`grok-cli.adapter.ts:193`), pi (`pi-cli.adapter.ts:270`), and the `cli-detection.service.ts:53-58` placeholder.
  - This is the intended D24 fail-closed behavior. Users must pick an explicit permission or save a lane default. Make sure the PR description or release notes call it out. A spec asserting this fail-closed result at spawn level for one of these adapters would be a nice-to-have.
- **[Low]** `messaging/__fixtures__/agent-message-harness.ts:36` still has `permissionModes: {}`. Any spec that spawns through it with no permission would hit the fail-closed throw. The 5 specs I ran pass, and CI failures were only in the files changed. Consider giving it a supported plan for consistency.
- **[Low / style]** In `agent-process-manager.service.spec.ts` (the `expect(task.endsWith(...${PLAN_SUFFIX}))` lines) and in the `spawnAgent(..., { permission: 'yolo' })` calls in spawn-model and off-thread-spawn, several lines exceed 80 columns. Run prettier on these files, because a format check may fail in CI.

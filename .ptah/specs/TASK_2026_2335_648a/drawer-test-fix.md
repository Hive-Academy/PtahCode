# System prompt drawer test fix

The integration test searched the settings fixture root for “Check again” at `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts:952` before the fix. The drawer delegates its content to `NativeDrawerComponent`, which opens the template through Angular CDK Dialog at `libs/frontend/ui/src/lib/native/drawer/native-drawer.component.ts:156`. CDK mounts the dialog in an overlay outside the fixture root. A temporary probe immediately after the existing settle found the enabled button in the document while the fixture-root lookup still returned null. The three status reads used the same workspace, and the button's presence confirms the drawer had accepted the host's running status. The drawer-reopen case passes because it asserts the mounted settings row without querying the overlay.

The test now queries the named “System prompt details” dialog at `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts:951` and verifies that “Check again” is enabled before simulating host completion. It then clicks the button and checks that the mounted row refreshes. The production status code and existing wording edits were preserved.

## Checks

- Before the fix, `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts -t 'refreshes the mounted row'` exited 1. Generation completion failed with a null button, drawer reopen passed, and 45 tests were skipped.
- After the fix, `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.spec.ts` exited 0. Both full suites passed with 77 tests and zero snapshots in 10.069 s.
- `npx eslint libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts` exited 0 with no output.
- `git diff --check -- libs/frontend/chat/src/lib/settings/pro-features/` exited 0 with no whitespace errors.

Verification exercised the Angular dialog integration in Jest. No Electron visual session was run because the change only affects the test.

# Test report — TASK_2026_2329_dd5d

## Scoped verification

Each Nx command ran through `npm run verify` inside the task worktree. Project names below omit the `@ptah-extension/` prefix for brevity.

| Scope | Result | Evidence |
| --- | --- | --- |
| shared, agent-generation, agent-sdk, cli-agent-runtime, lane-routing, rpc-handlers, setup-wizard, chat-ui, onboarding, Electron and webview | Applicable lint and typecheck targets passed across the two runs | `.ptah/tmp/verify-lint-tc.log`, `.ptah/tmp/verify-audit-recheck.log` |
| Degradation audit and UI class audit | Passed after the initial banner class-binding correction | `.ptah/tmp/verify-audit-recheck.log` |
| shared, agent-generation, agent-sdk, cli-agent-runtime, lane-routing, setup-wizard, chat-ui, onboarding and webview | All nine project test targets passed | `.ptah/tmp/verify-tests-2.log` |
| rpc-handlers | 276 suites passed and one suite failed. 7,182 tests passed, one failed and three skipped. | `.ptah/tmp/verify-tests-2.log` |
| rpc-handlers focused session notice rerun | Nine tests passed and one failed with the same host-dependent root mismatch | `.ptah/tmp/verify-rpc-session-notice-final.log` |
| Electron initial run | Ten prerequisites passed. Jest reported 119 suites passed, one failed and one skipped. 2,045 tests passed, eight failed and eight skipped. | `.ptah/tmp/verify-electron-final.log` and the Nx terminal output referenced there |
| Electron retry with Xvfb | Passed. All ten prerequisites and 120 suites passed. 2,053 tests passed, eight tests and one suite skipped. | `.ptah/tmp/verify-electron-xvfb-final.log` |
| Final banner spec | Focused test target passed. It asserts the exact border classes and Running, Stopping and Interrupted states, including the View and Resume actions. | `.ptah/tmp/verify-banner-focused-final.log` |
| Final banner CSS and UI class audit | Both passed. Tailwind generated both `border-color` declarations from the final component source and renderer config. | `.ptah/tmp/verify-banner-css-final.log`, `.ptah/tmp/verify-banner-ui-class-final.log` |
| Final onboarding and renderer lint and typecheck, plus Angular template compilation | All five tasks passed, including `ptah-extension-webview:typecheck-templates` | `.ptah/tmp/verify-banner-types-final.log` |

## Environment findings

- The unchanged `plugin-rpc.handlers.session-notice.spec.ts` fixture uses an absolute project path below `/tmp`. With `/tmp/.ptah` present, the lookup chooses `/tmp` where the assertion expects `/tmp/ptah-plugin-notice-project`. The focused rerun reproduced the assertion at line 130. The previous task recorded this in [decision D27](../TASK_2026_2325_899d/decisions.md).
- All eight first-run Electron failures came from `shell-csp.spec.ts` and shared the setup error `spawn xvfb-run ENOENT`. A verified Xvfb package was extracted into the ignored worktree scratch directory. Its virtual display smoke check passed and all shell CSP assertions passed on the full retry with that binary on `PATH`.
- The passing Electron run logged two late SQLite requires from DI test teardown and a force-exited Jest worker. Both late require stacks point to session-usage reconciliation. The command returned exit code 0.

The scoped test run used fixtures and mocks for model outcomes and analysis lifecycle transitions. Live provider calls and interactive dark/light screenshots are outside the captured evidence.

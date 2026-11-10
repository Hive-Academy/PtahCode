## Verification

- Initial command: `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools,web-landing > .ptah/specs/TASK_2026_915_2621/verify-output-3.log 2>&1`
- Running target test for 3 projects.
- Initial lint: 3 passed, 0 failed. Typecheck: 3 passed, 0 failed. Test: 2 passed, 1 failed (`vscode-lm-tools` MCP description exceeded its 984-character budget by 15). Shortened the description.
- Final command: `npm run verify -- -p @ptah-extension/vscode-lm-tools > .ptah/specs/TASK_2026_915_2621/verify-output-3.log 2>&1`
- Running target test for 1 project.
- Final lint: 1 passed, 0 failed. Typecheck: 1 passed, 0 failed. Test: 1 passed, 0 failed. Final log exit code 0.
- Across changed projects after the fix: lint 3 passed, 0 failed; typecheck 3 passed, 0 failed; test 3 passed, 0 failed. The initial cli-agent-runtime and web-landing test results remained valid because the fix touched only vscode-lm-tools.
- `ptah_get_diagnostics` did not complete within its 45-second window; scoped verify typecheck passed.

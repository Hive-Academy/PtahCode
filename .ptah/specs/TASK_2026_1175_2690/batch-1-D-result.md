# Batch D result

## Files changed

- `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts`: removed the three retired role icons. `roleIconFor` now returns `Bot` for these old slugs.
- `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.spec.ts`: added one fallback assertion for each old slug.
- `apps/ptah-docs/src/content/docs/agents/built-in-agents.md` and `agents/index.mdx`: list 11 active agents and explain the `implement` phase. The catalog keeps the old slugs only as legacy mapping examples.
- `apps/ptah-docs/src/content/docs/setup/setup-wizard.md`: replaced old generated-file examples.
- `apps/ptah-docs/src/content/docs/templates/creating-templates.md`, `templates/index.md`, and `templates/template-storage.md`: replaced retired template examples and removed the active Building row.

## Checks

| Command | Exit | Result |
| --- | ---: | --- |
| `npx jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.spec.ts` | 1 | Jest stopped before tests ran. esbuild child process failed with `spawn EPERM`. |
| `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.lib.json` | 0 | Passed. |
| `npx eslint libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.spec.ts` | 0 | Passed. Nx module-boundary rule reported no cached ProjectGraph and was skipped. |
| `npx ts-node --transpile-only tools/role-census/check-role-census.ts` | 1 | Census stopped at child `git ls-files`: `git ls-files failed: undefined`. Direct `git ls-files` worked. |

## Open issues

- Rerun focused Jest and read-only census where Node can start child processes. No test assertion or census result is available from this lane.
- No UI screenshot was captured. This batch changes a glyph mapping but no Angular template. Running build, serve, or dev to render the app is outside this batch's allowed checks.
- A progress report to the parent was rejected with `parent-inbox-full`. This file contains the handoff.

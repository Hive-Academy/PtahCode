# Final fix round 2 report

## Items

- F1 done: `skill-recommendation.service.ts` limits searches to 25 keywords and four concurrent calls. It logs one debug line for a cut and processes results in keyword order.
- F3 and F7 done: `setup-rpc.handlers.ts` checks each install name before install or name logging. Invalid names get a fixed error.
- F5 done: `setup-rpc.handlers.ts` treats a non-object package as empty and reads dependency keys only from plain objects.
- F4 done: `skill-consent.service.ts` refuses packages above 500 files or 10 MB with a fixed user error.
- F6b done: `agent-generation` `di/tokens.ts` and `di/register.ts` match `main` for the four unused tokens and log names. Search found no external import from `agent-generation`.
- F8 done: `team-builder-skill-consent.component.html` explains hooks or executable files when a flagged skill has no listed scripts.
- Q5 done: `team-builder-start.page.ts` and `.html` show launch completion and reset it on a new launch or Back. The TypeScript file has 486 lines.
- CI item 8 done: `project-guidance.service.ts`, `skill-consent.service.ts`, and `team-builder-start.page.ts` document five intended fallbacks with accepted degradation audit markers.

## Tests and checks

- `npx jest` backend focused set: first run failed on TS4111 in `setup-rpc.handlers.ts`; fixed the index access. Second run: 4 suites and 94 tests passed, one old test failed because it expected an Nx match beyond the new 25-keyword cap. Updated that test. Service spec rerun passed: 10 tests.
- `npx jest` frontend team-builder set: pass, 4 suites and 24 tests.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`: pass.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.spec.json`: pass.
- `npx eslint <changed files>`: exit 0, 25 warnings and no errors. The warnings include existing max-lines and explicit accessibility warnings.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` filtered to the affected directories: exit 0. `rpc-handlers: 1 ok (baseline 1)`; no frontend/onboarding violation reported.
- Token uniqueness Jest spec: pass, 1 suite and 3 tests.
- Second ESLint check for the three files with audit markers: exit 0, 23 warnings and no errors.
- Browser opened the consent template file and a screenshot was inspected. It displayed raw Angular control flow, so it cannot prove the running app layout. The Angular component tests rendered the requested text in the DOM. No design reference was supplied.
- `git diff --check`: pass.
- `git diff main --` for the two agent-generation DI files: empty diff.

## Other changes

The worktree has changes outside this lane's write set, including task metadata, a harness-sync spec, and webview e2e scenario files from concurrent work. I did not edit or revert them. No blocker remains. The running app layout was not checked because the brief forbids build and serve commands.

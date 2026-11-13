# B8 fix 3 report

## Items

| Item | Result | File and evidence |
| --- | --- | --- |
| A1 | Done | `team-builder-skill.store.ts`, `team-builder-start.page.ts`, `team-builder-skill-review.component.html`: saved and showed `ownerDecisionPrompt`. |
| A2 | Done | Store and review component: two labeled radio choices in one fieldset; no default; reset clears the choice. |
| A3 | Done | Start page and review component: weak-practice facts require a choice before Continue or Skip; an inline alert explains the block. |
| A4 | Done | `team-builder-guidance-brief.ts`: pure text function appends grouped facts, decision, and three rules after the unchanged intent. Its spec checks the 2 KB guidance limit. |
| A5 | Done | Start page: lists workspace analyses, loads the newest, sends its project type and framework line from `project-profile`; shows a limited-guidance note when none exists. The host guidance type accepts only project type and frameworks. |
| A6 | Done | Review component maps `do_not_copy` to “Do not copy.” |
| C | Done | Start and review templates: review actions are disabled during install; launch shows only Back, which calls `back()`; consent uses its existing busy lock. |
| E | Done | Start, review, and guidance brief specs cover decision blocking, launch text, no analysis, busy actions, and Back. |
| F1 | Not necessary | `register-shared-rpc-handlers.ts`: `TOKENS` and `Logger` are still used at lines 180 and 218. No edit. |
| F2 | Not necessary | `di/register.ts`: no blank line before the final brace of `registerSkillServices`. No edit. |

## Checks

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath` with all four `team-builder-*.spec.ts` in `proposal`: first run had 2 failures in 17 tests; fixed both. Second run: 4 suites passed, 17 tests passed.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`: passed, exit 0, no diagnostics.
- `npx eslint` on the nine changed frontend files (start page TS, HTML, spec; skill store; review component TS, HTML, spec; guidance brief TS, spec): exit 0, 0 errors, 68 accessibility modifier warnings in three existing classes.
- `ptah_get_diagnostics`: unavailable; TypeScript check exceeded its 45 second tool window. The direct scoped TypeScript command passed.
- Angular template input and output names were checked against the component classes. A rendered screenshot was not available without a prohibited serve or build command.

## Decisions and limits

- The saved analysis RPC returns phase text. The page reads a `Frameworks:` line from `project-profile`; if absent, it sends an empty framework list. This is reversible.
- A concurrent change to `team-builder-guidance-brief.ts` and its spec appeared during this lane. It was retained and the size test was fixed. No unexpected file was reverted.
- The `angular-frontend-patterns` skill was read from `.claude/skills/angular-frontend-patterns/SKILL.md`; the Ptah skill search returned no installed result.

## Changed files

- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`, `.html`, `.spec.ts`: stored analysis, owner decision gate, launch intent, busy navigation, and cases.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill.store.ts`: owner decision and guidance state with reset.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.ts`, `.html`, `.spec.ts`: prompt, labeled radios, inline message, disabled actions, and cases.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.ts`, `.html`, `.spec.ts`: consent busy controls from fix 2, retained.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-guidance-brief.ts`, `.spec.ts`: pure launch brief with per-label size cap and tests.
- This report. No backend file was changed because both requested cleanup defects were absent.

## Decisions

- The saved analysis RPC exposes project type in metadata and phase text in the load response. The page extracts a `Frameworks:` line from the project profile. The guidance contract accepts only `projectType` and `frameworks`; optional analysis fields cannot be sent through its current type.
- Each guidance label has a 500-byte text allowance, keeping the appended block below 2 KB while preserving all three label headings and the user's original intent.
- F1: `TOKENS` and `Logger` remain used in `register-shared-rpc-handlers.ts`; removing them would break typecheck. F2: `registerSkillServices` already has no blank line before its closing brace.

## Verification

- `npm run verify -- -t lint,typecheck,test -p @ptah-extension/onboarding 2>&1 | Select-Object -Last 40`: exit 0 on final run; final header `NX 1 task: 1 succeeded` (test target). The filtered Nx output did not expose full Jest counts. Earlier focused Jest result: 4 suites and 17 tests passed, as recorded above.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview 2>&1 | Select-Object -Last 20`: exit 0; header `NX 1 task: 1 succeeded`.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/rpc-handlers 2>&1 | Select-Object -Last 30`: exit 0; header `NX 2 tasks: 2 succeeded, 2 cached`.
- The brief's literal `| tail -40` failed with exit 1 because `tail` is unavailable in PowerShell; the runs above use the PowerShell equivalent, with no other verify flags.
- `ptah_get_diagnostics` was requested for the two edited TypeScript source files but timed out after 45 seconds; the scoped verify run passed.
- Opened the review HTML file with `ptah_browser_navigate` and inspected a screenshot. It showed the fieldset, legend and both radio labels in the raw template. Angular directives were not evaluated, so rendered Electron styling was not verified. The template typecheck passed.

## Unexpected

- Other lanes' uncommitted files, including `libs/backend/harness-sync/src/lib/targets/copy-engine.skill-markdown.spec.ts`, remained untouched.
- The verify output included Jest ES module warnings for unrelated project configuration files.

## Blockers

- No functional blocker in the allowed frontend write set. F1 and F2 were already correct on inspection. A rendered Electron visual check remains unavailable under the prohibition on starting or building the app.

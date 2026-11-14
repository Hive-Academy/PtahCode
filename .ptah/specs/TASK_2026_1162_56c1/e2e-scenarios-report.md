# Team builder e2e scenarios

## Changes

- Updated the wide and narrow start and chat scenarios to use **Review skills**, wait for the review stage, and use **Skip skills** to launch chat.
- Added the wide and narrow `team-builder-skill-review` screenshot scenario for every capture theme. It waits for two recommendations and project guidance before `shoot`.
- Added local answers for `wizard:list-analyses`, `wizard:load-analysis`, `wizard:recommend-skills`, `wizard:get-project-guidance`, and `wizard:search-skills`. The list is empty, so the load answer is available but is not requested in this flow. Two skills have evidence. All guidance facts use `follow`.
- `shoot` writes PNG and axe JSON files to its output directory at run time. It does not compare against committed image baselines. No image files were created by hand.

## Locator check

I read each locator against its template twice. Line numbers refer to the current templates.

| Locator | Template match |
| --- | --- |
| `getByTestId('team-builder-start')` | `team-builder-start.page.html:4` |
| `getByRole('textbox', { name: 'What should the team do?' })` | `team-builder-start.page.html:39-54` |
| `getByRole('button', { name: 'Review skills' })` | `team-builder-start.page.html:70-77` |
| `getByRole('heading', { name: 'Skills and project guidance' })` | `team-builder-skill-review.component.html:3-5` |
| `getByRole('checkbox', { name: 'Select TypeScript review' })` | `team-builder-skill-review.component.html:32-37`; fixture name is `TypeScript review` |
| `getByRole('checkbox', { name: 'Select Release checks' })` | `team-builder-skill-review.component.html:32-37`; fixture name is `Release checks` |
| `getByRole('heading', { name: 'Project guidance' })` | `team-builder-skill-review.component.html:114-116` |
| `getByRole('button', { name: 'Skip skills' })` | `team-builder-skill-review.component.html:181-188` |
| `getByTestId('onboarding-shell')` | Existing post-launch absence check; the shell is removed after chat navigation. |
| `getByText(/^Create a backend TypeScript review and release team\./)` | `team-builder-guidance-brief.ts:33`: the launch text starts with the unchanged intent and may add guidance. |

## Verification

- `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.spec.json`: **exit 1**. The final run reports seven errors in other harness files: five `TS1343` `import.meta` module errors, one `TS2345` in `settings/preferences.e2e.spec.ts`, and one `TS2339` in `settings/settings-visual.e2e.spec.ts`. It reports no errors in the two changed files.
- `npx eslint libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal-visual.e2e.spec.ts libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal.fixtures.ts`: **exit 0**, no output.
- Ptah diagnostics for the two changed files: unavailable after its 45-second timeout. The requested TypeScript command above completed.

## Open risks

- CI must run the scenarios. The prohibited Playwright and e2e commands were not run.
- The harness TypeScript project has the seven unrelated errors listed above. They block a clean typecheck result.
- Other lanes had existing changes in task metadata, backend files, and onboarding files when this work began. I did not edit or revert them.
- An invocable CLI skill mechanism was not available in this session. I checked the tool list; it exposed a skill inventory search, but no skill invocation tool.

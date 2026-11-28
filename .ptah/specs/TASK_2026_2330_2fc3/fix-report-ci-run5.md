# CI run 5 consent dialog regression fix

The focused onboarding spec passed all 46 tests with the branch’s inline modal and all 46 tests with the CDK modal from `origin/main` at `8995919a61`.

## Change

The page spec queries the document for a dialog labelled by `skill-consent-title`. It requires the dialog to be absent or closed and inert at intent, open at consent, and closed and inert or detached after Install. It always clicks the enabled button labelled “Install 1 skill and continue.” A missing dialog, missing or disabled button, or lingering open dialog fails with bounded diagnostics. The fixture is destroyed in `finally`, which also closes any remaining CDK overlay owned by the modal.

The spec still checks that Back and Cancel are enabled and outside inert ancestors and that Cancel has focus. It dispatches a cancelable Enter keydown, checks that the event was not prevented, and clicks Cancel to model the default activation jsdom omits. After the pending install resolves, it requires the run to remain cancelled and the page to return to intent. [Updated spec](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts#L352)

## Checks

| Check | Result |
| --- | --- |
| Focused Jest with the branch’s inline modal | 46 passed, 0 failed. [Log](../../tmp/ci-run5-inline-jest.log) |
| Same focused Jest command with main’s CDK modal | 46 passed, 0 failed. [Log](../../tmp/ci-run5-portal-jest.log) |
| Onboarding spec TypeScript project | Exit 2 with 17 existing diagnostics in other files. The output matched the run 4 baseline byte for byte. [Log](../../tmp/ci-run5-tsc.log) [Baseline](../../tmp/ci4-focused-tsc.log) |
| Scoped Ptah diagnostics | Zero diagnostics in the edited spec. |
| ESLint on the edited spec | Exit 0. [Log](../../tmp/ci-run5-eslint.log) |
| Working tree checks | `git diff --check` passed. `git diff -- libs/frontend/ui` was empty and the inline modal matched its branch HEAD bytes. |

Both Jest runs used `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`.

## Decisions

I used a disposable workspace copy for the portal run. The exact main modal imports overlay helpers absent from the branch, so I copied both files from `origin/main` into the disposable workspace. A live swap would have required temporarily replacing both files. The copy was removed after the run, and the working tree retained the branch versions. This validates the main modal in the branch’s focused spec without running a full PR merge or CI shard.

`ptah_search_files` returned no task documents. A scoped native file listing located the task folder, and `ptah_read_symbol` read the CI review. A host skill loader was unavailable for this lane.

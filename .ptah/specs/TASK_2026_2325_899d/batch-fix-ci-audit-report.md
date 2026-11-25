# D46 degradation audit

PR #1514 had 11 unsuppressed findings across six named source files. Site line numbers are from the local pre-edit audit. Evidence line numbers refer to the edited worktree.

| Site (file:line) | Fix type | Reason | Evidence (file:line) |
| --- | --- | --- | --- |
| workspace-provider-profile-resolver.ts:773 | `reported` marker | Copilot credential check or restore failure becomes a typed Setup sign-in issue. | workspace-provider-profile-resolver.ts:636–638 returns `not-signed-in`. |
| workspace-provider-profile-resolver.ts:786 | `reported` marker | Kimi credential check failure becomes a typed Setup sign-in issue. | workspace-provider-profile-resolver.ts:636–638 returns `not-signed-in`. |
| workspace-provider-profile-resolver.ts:798 | `reported` marker | OpenRouter credential check failure becomes a typed Setup sign-in issue. | workspace-provider-profile-resolver.ts:636–638 returns `not-signed-in`. |
| skill-json-extract.ts:39 | `optional-capability` marker | Text extraction can skip an invalid JSON fence and try other candidates. | skill-json-extract.ts:6–12 continues scanning. When extraction ultimately yields null, skill-draft-generation.service.ts:177–179 and skill-judge.service.ts:623–625 report `invalid-output`. |
| skill-recommendation.service.ts:507 | `reported` marker | After the deadline, an outstanding search already has a typed timeout. Earlier failures already set a typed reason and log a warning. | skill-recommendation.service.ts:510–521 and :541–550 record the failure. skill-recommendation.service.ts:443–445 returns it in `registryFailure`. |
| reactive-settings-store.ts:103 | `reported` marker | The immediate handler prevents a premature unhandled rejection while the original write failure still reaches the batch caller. | reactive-settings-store.ts:112 awaits the original backend promise and :125 passes the rejection to the caller. |
| reactive-settings-store.ts:109 | `reported` marker | The queue can advance after a failed earlier batch, whose caller already receives its rejection. | reactive-settings-store.ts:123–125 stores the step and awaits it in the originating call. |
| analyze-skills.page.ts:633 | `reported` marker | The active request shows fallback Setup model guidance. | analyze-skills.page.ts:637 applies the block and :240 and :275 render its message. |
| analyze-workspace.page.ts:76 | `optional-capability` marker | Workspace analysis works when the host Settings navigation service is unavailable. | analyze-workspace.page.ts:679 guards host view observation and :774 guards host Settings navigation. |
| analyze-workspace.page.ts:759 | `reported` marker | A Setup model read failure sets the signal for a retry alert. | analyze-workspace.page.ts:763 sets `setupReadFailed` and :280–300 renders the alert and retry button. |
| analyze-workspace.page.ts:841 | `reported` marker | A saved analyses load failure sets the signal for a retry alert. | analyze-workspace.page.ts:845 sets `savedError` and :475–484 renders the alert and retry button. |

## Audit totals

| Directory | Before | After |
| --- | ---: | ---: |
| libs/backend/auth-providers | 3 | 0 |
| libs/backend/rpc-handlers | 2 | 0 |
| libs/backend/settings-core | 2 | 0 |
| libs/frontend/onboarding | 4 | 0 |

The audit prints directory rows only for directories with findings or a baseline entry. All four directories disappeared from the post-edit output, which ended with `degradation-audit: TOTAL 0 unsuppressed site(s)`.

## Checks

- Pre-edit audit reproduced the 11 CI findings at the supplied line numbers and exited 1.
- Post-edit `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` scanned 4,744 files and exited 0.
- `npx tsc --noEmit --project <directory>/tsconfig.lib.json` exited 0 for all four directories in the table.
- `npx eslint <six changed files>` exited 0 with no errors and three `max-lines` warnings. The files already exceeded the 700-line limit before the edit. ESLint reported 901 lines in `workspace-provider-profile-resolver.ts`, 1,096 in `analyze-skills.page.ts`, and 937 in `analyze-workspace.page.ts`.
- Scoped `ptah_get_diagnostics` reached its 45-second response limit on both attempts. The four passing native TypeScript checks covered all six changed files.
- Focused Jest was conditional on adding logging. This patch adds only markers.

## Decisions

- Used the six explicitly enumerated source paths. The scope text referred to seven files, and the local audit confirmed that all 11 findings map to the six listed paths.
- Used nine `reported` markers and two `optional-capability` markers. Existing typed outcomes, alerts and fallbacks in the table support those choices. Adding logs would duplicate reporting or add noise to expected fallback paths. Each change is a reversible comment.

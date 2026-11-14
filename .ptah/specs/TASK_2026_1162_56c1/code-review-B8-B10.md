# B8-B10 frontend review

Verdict: Blocker
Score: 64

The review covers the AI team builder skill flow on disk. Five of eight checks pass. Three checks fail. The fails are Serious. The page can show the previous workspace lists, and an install failure does not name the failed skill. The page does not ask the owner decision.

Skill: loaded `.claude/skills/angular-frontend-patterns/SKILL.md` and `references/effects-patterns.md`. Applied the signal, standalone, OnPush, and smart/dumb rules to the review. No `ui-ux-designer` skill was used. This task is a review.

## Acceptance

| Item | Result | Evidence |
| --- | --- | --- |
| 1. Stack recommendations first | Pass | Review calls `wizard:recommend-skills`, then `wizard:get-project-guidance` (`team-builder-start.page.ts` 133-155). Search runs only after the Search button (`team-builder-skill-review.component.html` 61-85, `team-builder-start.page.ts` 166-194). The recommended block is above search (`team-builder-skill-review.component.html` 18-59). The host still reads `package.json` dependencies for recommendations (`setup-rpc.handlers.ts` 1019-1050). The page always sends `{ projectType: 'unknown', frameworks: [] }` (`team-builder-start.page.ts` 79-82). |
| 2. Guidance labels and owner decision | Fail | The template prints `fact.category` and `fact.label` (`team-builder-skill-review.component.html` 114-124). The label type is `follow`, `tolerate`, or `do_not_copy` (`rpc.types.ts` 34-38). The section is hidden when the fact list is empty. Guidance uses only the analysis argument (`setup-rpc.handlers.ts` 1074-1087). That argument is the empty stub, so this route gets no stack facts. The response field `ownerDecisionPrompt` (`rpc.types.ts` 62-65) is never read. The page has no control for "match the repository" or "raise the standard". The answer is not stored and is not sent. |
| 3. Preview, consent, hash | Pass | Continue loads `wizard:preview-skills-for-consent` and opens consent only when every selected id returns a content hash (`team-builder-start.page.ts` 197-228). Approval starts as an empty set (line 227). A script skill needs its own checkbox (`team-builder-skill-consent.component.html` 53-66). The install button stays disabled until every script skill is approved (line 83). `install()` returns when a script skill is not approved (`team-builder-start.page.ts` 249-253). Consent records send `skillName`, `contentHash`, and `consentDate` (lines 261-271). |
| 4. Install failure | Fail | On `success: false` the page throws the fixed text "Some skills could not be installed." (`team-builder-start.page.ts` 279-281). The error text adds installed names only when `installed` is not empty (lines 286-289). It does not read a failed skill name. The shared result type has `success` and `installed` only (`rpc.types.ts` 83-86). The host return also carries `failedSkill` and `reason` (`setup-rpc.handlers.ts` 1344-1367). The page drops both. The page does not call `launchChat()` on that failure. It sets the stage back to `review`. |
| 5. Stale state | Fail | Request versions, a 300 ms search timer, destroy, and double-click guards are present (`team-builder-start.page.ts` 74-76, 101-106, 166-194, 244-254). A workspace change clears stage, selection, preview, and approval (lines 84-100). It does not clear recommendations, search results, guidance facts, or installed names (store lines 19-24). Search results stay on screen during the next load because the search block is outside the loading branch (`team-builder-skill-review.component.html` 13-17 and 61-112). A failed guidance call does not clear old facts (`team-builder-start.page.ts` 154-155). A later error can print the old installed names (lines 286-289). Stage, loading, and `starting()` do return to a usable value on Back, destroy, workspace change, and install or launch failure. |
| 6. Angular rules | Pass | The page and both children are standalone and OnPush. The page uses `inject()`. The children use `input()` and `output()`. State is signals. No `@Input`, `@Output`, `NgModule`, or `[innerHTML]`. RPC calls use `ClaudeRpcService` only. Controls use `libs/frontend/ui` primitives. The constructor has no parameters (`team-builder-start.page.ts` 84). `message()` returns `Error.message` with no redaction (lines 332-334). |
| 7. Write set | Pass | Frontend edits and new files are under `libs/frontend/onboarding/src/lib/proposal/`. `git status --short` has no path under `apps/ptah-extension-webview/`. `tools/ui-class-audit/baseline.json` is not in the status. The worktree also has other dirty files (backend handlers, one Electron spec, and task notes). Those files are outside this frontend write set. |
| 8. Accessibility | Pass | Consent uses `ptah-native-modal` with `ariaLabelledby="skill-consent-title"` (`team-builder-skill-consent.component.html` 1-4). The modal is a native `dialog` with a tab trap (`native-modal.component.ts` 74-80, 182-203). The page stores focus before preview and restores it on cancel and on install failure (`team-builder-start.page.ts` 199-201, 241, 290). Fields and checkboxes have labels or `aria-label`. Actions are buttons. |

## Findings

### Serious — The page does not ask the owner decision

Phase 3 requires labeled facts and one owner decision: match the repository, or raise the standard (`.ptah/specs/TASK_2026_977_0876/task-description.md` 178-180 and 193). The review template can show a fact label, but this page requests guidance with an empty analysis, so the fact list stays empty. The page ignores `ownerDecisionPrompt`. There is no question and no saved answer.

### Serious — The page does not name the failed skill

Acceptance item 4 requires the failed skill name and the installed names. The host returns `failedSkill` and `reason`. The page shows a generic sentence. It appends installed names only when that list is not empty. A total failure shows no skill name. Chat does not start after this failure.

### Serious — A workspace change keeps the previous lists

The workspace effect drops the in-flight request and resets the stage. It leaves recommendations, search results, guidance facts, and installed names in the store. The next review can show the previous search hits at once. If the new guidance call fails, the old facts remain. If a new install throws before `installed` is replaced, the error can list skills from the previous workspace.

### Minor — Error text is the raw error message

`message()` shows `Error.message` in the alert. The template uses text binding, not `innerHTML`. There is no redaction step.

### Minor — Escape during install closes the dialog early

While `starting()` is true, `closeConsent()` ignores the close request (`team-builder-start.page.ts` 237-238). The modal cancel handler does not call `preventDefault()` (`native-modal.component.ts` 170-171). Escape can close the native dialog while the stage stays `installing` until the install call ends.

### Minor — The workspace effect writes signals

The effect at `team-builder-start.page.ts` 85-99 writes several signals. The Angular skill says to avoid signal writes inside an effect. Angular 22 allows the write. Search uses a 300 ms timer after submit, not a debounced observable.

## Tests

`npm run verify -- -t test -p @ptah-extension/onboarding` waited in the verify slot queue. It did not print `Running target test for 1 projects`. The command was stopped while it was still queued.

Fallback, because the Nx target did not start:

`npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts`

Result: 3 suites passed, 7 tests passed, exit code 0. Time about 144 s. These specs do not cover the owner decision, the failed skill name, or a workspace change.

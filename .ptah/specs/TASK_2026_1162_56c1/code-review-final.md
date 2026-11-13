# Final full-diff review: Setup, skills by tech stack (TASK_2026_1162_56c1)

Score: **82/100**. Verdict: **Pass with notes**.

Method: I read the code and the diff (`full-src.diff`). I did not run tests, nx or the host. I did not render the UI. No skill tool was used. Line numbers: page and service files are file lines. `setup-rpc.handlers.ts` and `skill-recommendation.service.ts` lines marked "diff" are lines of `.ptah/tmp/full-src.diff`.

## Q1. Fix round 1 (S1, S2, M1-M9)

| Item | Status | Evidence |
| --- | --- | --- |
| S1 | Corrected | `project-guidance.service.ts:136-143` (`lstat`, `isFile`, 1 MB limit before `readFile`); used at `:94` and `:117`. |
| S2 | Corrected | `project-guidance.service.ts:20-21,31,34,40,75` (sanitizer, 80-char name cap, backticks removed); `team-builder-guidance-brief.ts:3,40`. The brief uses `fact.fact` only, not evidence. |
| M1 | Corrected | `team-builder-start.page.ts:429` (`this.intent().trim()`). |
| M2 | Corrected | `team-builder-start.page.ts:211-216` (assignment after the stale check). |
| M3 | **Not corrected, not reported** | `team-builder-start.page.ts:416-419` rebuilds the record from fresh probes. The fix report has no M3 line. See F2. |
| M4 | Corrected | `team-builder-start.page.ts:395-401` (stage back to `review` when `fromInstall`). |
| M5 | Corrected, but see Q5 | `team-builder-start.page.ts:399,407` (stage stays `launching`; no return to `review` after success). |
| M6 | Corrected | `project-guidance.service.ts:97-98`. |
| M7 | Corrected | `project-guidance.service.ts:114` (exact `tsconfig.json` first); `:89` (no `pyproject.toml`). |
| M8 | Corrected | `team-builder-start.page.ts:137-138`. |
| M9 | Corrected | `team-builder-guidance-brief.ts:30-33,43-50` (order Do not copy, Tolerate, Follow; ` (more omitted)` marker). |

## Q2. End to end

Flow: `submit` -> `loadReview` -> `wizard:list-analyses` / `load-analysis` -> `wizard:recommend-skills` -> `wizard:get-project-guidance` -> (page search) `wizard:search-skills` -> `reviewSelection` -> `wizard:preview-skills-for-consent` -> `install` -> `wizard:install-skills-with-consent` -> `launchChat` (second `get-project-guidance` with `ownerDecision`) -> `launcher.launchTeamBuilder`.

- Types: page request and response use match `rpc.types.ts` (`WizardRecommendSkillsParams`, `...GetProjectGuidanceParams` with `ownerDecision`, `WizardSkillConsentPreview`, `WizardInstallSkillsWithConsentResponse`). The page reads `skills`, `facts`, `ownerDecisionPrompt`, `recordPath`, `installed`, `success`, `failedSkill`, `reason`. All exist.
- Gap: the page sends `{projectType, frameworks}` only. Zod schema `ProjectAnalysisZodSchema` accepts it (handler spec covers it).
- `consentRecords` sent by the page: `{skillName, contentHash, consentDate}`. The schema matches. The host ignores `consentDate` and writes its own. Good.
- Registration: the five methods are in the `SetupRpcHandlers` method list. Both hosts call `registerSharedRpcHandlers` (`phase-4-handlers.ts:129` for Electron, `cli-engine/src/lib/container.ts:934`), which calls `registerSkillServices`. The Electron and `cli-engine` `rpc-surface.spec.ts` list all five methods. `rpc-allowlist.spec.ts` lists the preview method (the other four were not checked there).
- Not verified: that `SkillsShApiClient` resolves from the `cli-engine` container. The `@inject(SkillsShApiClient)` is a class token. The Electron smoke spec covers Electron only.

## Q3. Consent

- A script skill cannot install without approval of the exact staged bytes. The host hashes the staged directory before the copy (`skills-sh-source-root.service.ts` diff 1507, `verifyStaged`; handler diff 575-602). If a record is sent, its hash must equal the staged hash, else the install stops. If no record is sent, the host needs a stored consent for the same name and hash. `hasScripts` fails closed. A second install of a changed package needs new consent.
- The page cannot send a hash that the host does not check. A record for a non-script skill is also checked.
- Limit (accepted): a caller that can reach the RPC can call preview, read the hash, and send it as "consent". The host cannot see a click. This is the same trust level as the page itself.
- Gap (F3): the install handler does not check the 3-part `owner/repo/skill` name that preview checks.

## Q4. Untrusted input

| Sink | Result |
| --- | --- |
| Skill slug and path in preview staging | Safe. Regex per part, first char not `.` (handler diff 491-500); realpath checks (diff 446-449, 527-536). |
| Skill slug in install | `install()` runs the schema and `rejectUnsafeInstallRequest`. Safe. Name parts beyond 3 are ignored (F3). |
| File names in preview | Shown by interpolation only. Safe. |
| Skill name, description, evidence, fact, `failedSkill`, `reason` in templates | Interpolation only; no `innerHTML`, no URL binding. Safe. |
| Guidance record write | Path is fixed `.ptah/project-guidance.md`. Text is sanitized. Safe. |
| Launch intent | Facts are fixed text, sanitized, no evidence. Safe. Names do not reach it. |
| Logs | `Failed to install skill ${skillName}` logs a raw name before validation (handler diff 611-614). Max 255 chars, but it can hold control characters. Low (F7). |

No path traversal found.

## Q5. State `launching`

Exits:
- Back (`back()`, `page.ts:470-479`): aborts a pending launch, sets stage `intent`, goes to `/onboarding`. Correct. The store is page-scoped and `onDestroy` resets it.
- Launch error: stage `review` plus a fixed error (`:440-443`). Correct.
- Cancel error: returns with stage unchanged (`:439`). Only Back, destroy or a workspace change cause it, and each resets the stage. Correct.
- Workspace change: effect resets the store (`:87-100`). Correct.
- Success: the chat tab opens, the page does not navigate, and the text still says "Launching chat…". That is wrong after success. `status.md:16` already records this as open.

Smallest correction: add one `launched` signal set after `launchTeamBuilder` resolves (`page.ts:427`). In `page.html:89` show "Chat opened. Use Back to leave this page." when it is true. Reset it in `launchChat` start and in `back()`.

## Q6. Removal

None. The branch changes 41 files (the list has 42 names). I compared the branch diff to the merge base. Removed lines in specs and `rpc.types.ts` are only Prettier line breaks (gitWindow entries, `rpc-allowlist.spec.ts`, `skills-sh-source-root.service.spec.ts`, `skills-sh-rpc.handlers.spec.ts`). The `skillsSh:install` body moved into `install()` with the same logic. No export, RPC method or test is deleted or disabled.

## Q7. Out of scope

- Prettier reflow of unrelated lines: `rpc.types.ts` gitWindow block, `rpc-allowlist.spec.ts`, `rpc-surface.spec.ts` (both), `skills-sh-source-root.service.spec.ts`, `skills-sh-rpc.handlers.spec.ts`. About 100 changed lines with no skills meaning. See F6.
- Moving `skillsSh:install` into a public `install()` is in scope (the consent flow reuses it). It is a large diff but not extra behavior.

## Findings

### Blocker

None.

### Medium

**F1. Unbounded serial skills.sh searches.** `skill-recommendation.service.ts:57-62` (diff 1380-1383) and handler diff 339-354. Scenario: a monorepo `package.json` with 400 dependencies makes 400 sequential network searches in one RPC. The page stays on "loading" for minutes, and Skip stays locked (`review.component.html:184`). Correction: search only the first N keywords (for example 25), or run them with a small concurrency limit, and log the cut.

**F2. M3 not corrected and not reported.** `team-builder-start.page.ts:416-419`. Scenario: the owner sees facts at review time. The record written at launch is rebuilt from new probes. If a file changed in between, the record and the brief disagree. Correction: add the decision "record is rebuilt at launch" to `decisions.md`, or send the shown facts. Also add M3 to the fix report.

**F3. Install does not check the 3-part name.** Handler diff 569-573. Preview checks `owner/repo/skill` (diff 491-500); install only splits. Scenario: `a/b/c/d` installs `a/b` skill `c` but is recorded and shown as `a/b/c/d`; a 2-part name fails with a generic message. No bypass found (consent is keyed by the full name). Correction: reuse the `stageConsentSkill` name check at the start of the loop.

### Low

**F4. Sync file work in the Electron main process.** `skill-consent.service.ts:144-157,82-94,159-170` use `readdirSync` and `readFileSync` over a whole package, up to 200 skills in preview. Scenario: a large package freezes the main process. Correction: cap file count and total bytes (for example 500 files, 10 MB) and refuse above it.

**F5. Recommend handler does not guard parsed `package.json`.** Handler diff 334-345. `JSON.parse('null')` makes `packageJson.dependencies` throw `TypeError`; a string `dependencies` gives character keys. Correction: apply the same object check as `project-guidance.service.ts:98`.

**F6. Prettier churn and stale token copies.** (a) Reflowed lines listed in Q7. (b) `agent-generation/src/lib/di/tokens.ts` (diff 63-93) and `register.ts` (diff 37-51) add four skill tokens and add their names to the "registered" log list, while the comment says they moved to `rpc-handlers` and the services are not registered there. The log is false. Correction: revert the `agent-generation` token and log additions; keep the `rpc-handlers` tokens.

**F7. Log line with unvalidated name.** See Q4. Correction: log the name after the 3-part check, or strip control characters.

**F8. Script list can be empty while a skill is flagged.** `consent.component.html:29,31`. `hasScripts` also catches shebang files, install hooks and frontmatter hooks, but `scriptFiles` uses extensions only. The user sees "Contains scripts" with no script list. The approval is still required, so this is safe. Correction: add a line "Also contains hooks or executable files. Review all files."

## Not a defect

- Root for guidance and record comes from the host; no client path.
- Atomic record write with unique temp file and cleanup; no raw error text to the client.
- Record failure does not stop the launch and shows a fixed note.
- `hasScripts` fails closed; symlinks in a package make the hash throw.
- Consent hash is checked on the staged bytes before the copy; the old slug and metadata stay when verification rejects (spec in `skills-sh-source-root.service.spec.ts`).
- The page keeps stage `launching` after success on purpose (M5); only its text is wrong (Q5).
- `result.data.reason` shown to the user is `RpcUserError` text or fixed text.
- Symlink assertion was skipped on this Windows host (`EPERM`); the code path (`lstat`) is correct by reading.

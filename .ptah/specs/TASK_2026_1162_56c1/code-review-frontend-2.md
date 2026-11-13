# Code logic review — frontend batch 2 — `TASK_2026_1162_56c1`

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 56/100 |
| Verdict | Blocker |
| Assessment | NEEDS_REVISION |
| Blocking issues | 1 |
| Serious issues | 1 |
| Minor issues | 2 |
| Failure modes | 4 |
| Confidence | High for the page paths. The host path is from handler and schema source. This lane did not execute the host. |

The earlier review items for a failed skill name, a workspace reset, raw RPC error text, and an install stage guard are fixed in the page. The score stays in the real-gap band. A weak repository still does not have to answer the owner decision, because the guidance call never receives the fields that produce `tolerate` or `do_not_copy`. That separates this score from a sound 70. The consent hash path, the stage lock, and the reset of the lists are present. That separates it from a foundation failure under 40.

No skill-loading tool is available in this lane. No skill was loaded. `ptah_get_diagnostics` was called twice on the changed page files. Both calls returned unavailable: the TypeScript check was still running after 45 seconds. Template bindings were checked by reading the component classes and the templates.

## Checks

| Item | Result | Evidence |
| --- | --- | --- |
| a. Earlier findings | Pass | Owner choice: `team-builder-skill.store.ts:26` and `team-builder-skill-review.component.html:136-162`. Failed skill name: `team-builder-start.page.ts:364-372`. Workspace reset of the lists: `team-builder-skill.store.ts:32-49` called from `team-builder-start.page.ts:93`. Stale responses return on version and root: `team-builder-start.page.ts:146-149`, `243-246`, `349-352`. RPC text without `errorCode` stays on the fixed string: `team-builder-start.page.ts:441-445`. Install close is ignored while `starting()`: `team-builder-start.page.ts:314-315`. The workspace effect reads `workspaceRoot` only, so its signal writes do not schedule the effect again: `team-builder-start.page.ts:86-98`. |
| b. Owner decision | Fail | With facts already stored, Continue and Skip call `blockForOwnerDecision()` (`team-builder-start.page.ts:265`, `390`, `436-439`). There is no default (`team-builder-skill.store.ts:26`). `reset()` clears the choice (`team-builder-skill.store.ts:45`). A completed launch sends the choice and the facts (`team-builder-start.page.ts:403-408`). The intent string stays the prefix (`team-builder-guidance-brief.ts:28`). Each label line stops at 500 bytes (`team-builder-guidance-brief.ts:22-26`), so the added block stays under 2 KB. Skip stays enabled while facts are cleared for the load (`team-builder-skill-review.component.html:180-186`, `team-builder-start.page.ts:136`, `389-392`). |
| c. Analysis input | Pass | The page calls `wizard:list-analyses`, sorts by `savedAt`, and loads that file through `ClaudeRpcService` (`team-builder-start.page.ts:145-156`). A missing, empty, or unmatched `Frameworks:` line yields `[]` (`team-builder-start.page.ts:164-175`). A workspace change bumps `requestVersion` and `reset()` before a late response can write (`team-builder-start.page.ts:88-93`, `146-149`). |
| d. Untrusted text | Pass | Skill names, descriptions, file names, facts, and errors are interpolations. A search of the `team-builder-*` proposal files found no `[innerHTML]` and no `bypassSecurityTrust`. Fact text is copied into the launch intent (`team-builder-guidance-brief.ts:17-28`). Risk: Medium. A small mitigation is below. |
| e. Consent | Pass | Records use `item.contentHash` from the preview (`team-builder-start.page.ts:338-344`). `install()` returns when a script skill is not in `approvedIds` (`team-builder-start.page.ts:326-330`). The install button stays disabled until `allApproved()` (`team-builder-skill-consent.component.html:83`, `team-builder-skill-consent.component.ts:30-36`). `closeConsent()` sends no RPC (`team-builder-start.page.ts:314-318`). |
| f. Page lock | Pass | `installing` and `launching` set `starting()` (`team-builder-start.page.ts:65-68`). Review actions use `busy` and `inert` while installing (`team-builder-start.page.html:90-102`, `team-builder-skill-review.component.html:170-192`). Continue sets `loading` before the preview await (`team-builder-start.page.ts:276-279`). `back()` returns during `installing` and aborts a launch (`team-builder-start.page.ts:448-453`). |
| g. Angular | Pass | The page and both children are standalone and `OnPush`. Children use `input()` and `output()`. RPC goes through `ClaudeRpcService` only. The same file search found no `any`, no `@ts-ignore`, and no `console`. Template input and output names match the classes. |
| h. Tests | Fail | The specs cover the steady decision gate, the launch text, a failed skill name, a workspace clear of four lists, a fixed RPC error, and a close during install. They do not prove the gaps below. |
| i. Phase 3 acceptance | Fail | This batch does not write labeled facts. It does not add an RPC method. The decision and the facts are appended to the launch intent only. On the payload this page sends, the host does not label weak practices, so the page does not ask the owner decision for that repository. |

## Five logic questions

### 1. How does this fail silently?

The page sends `{ projectType, frameworks }` (`team-builder-start.page.ts:168-176`). `WizardGetProjectGuidanceParamsSchema` parses that object with `ProjectAnalysisZodSchema` (`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts:41-43`). The schema fills `codeConventions` with indent 2, spaces, and single quotes, `architecturePatterns` with `[]`, and `existingIssues.errorCount` with 0 (`libs/backend/agent-generation/src/lib/services/wizard/analysis-schema.ts:201`, `208-232`, `308-331`, `332-360`). `getGuidance` then adds a follow fact, "Match the detected code style", with evidence "Detected from sampled files" (`libs/backend/rpc-handlers/src/lib/skills-sh/services/project-guidance.service.ts:57-64`). `tolerate` and `do_not_copy` are produced only from pattern confidence and `errorCount` (`project-guidance.service.ts:39-45`, `67-74`). The page shows those follow facts as project guidance (`team-builder-skill-review.component.html:114-129`). The owner gate stays closed because every label is `follow` (`team-builder-start.page.ts:75-77`).

### 2. What user action produces unexpected behaviour?

Skip during "Finding recommended skills". `loadReview` clears facts first (`team-builder-start.page.ts:136`). Skip is disabled only when `busy()` is true (`team-builder-skill-review.component.html:180-186`). `busy` is `starting()`, which is `installing` or `launching` (`team-builder-start.page.html:102`). `launchChat()` does not read `loading()` (`team-builder-start.page.ts:389-392`). It also increments `requestVersion`, so the guidance response is dropped (`team-builder-start.page.ts:207-210`, `393`). The chat starts with an empty fact list. A choice saved from an older load can ride along, because `loadReview` does not clear `ownerDecision`.

Escape during install closes the native dialog. The modal forwards `cancel` and does not call `preventDefault` (`libs/frontend/ui/src/lib/native/modal/native-modal.component.ts:170-171`, `185-187`). `closeConsent()` returns while `starting()` is true, so `isOpen` stays true and the effect does not open the dialog again. The install call continues. The page shows "Installing skills..." and Back does nothing until the call ends (`team-builder-start.page.ts:448-449`, `team-builder-start.page.html:90-93`). A second install does not start.

### 3. What input data produces a wrong answer?

A stored profile whose weak practices live in architecture text or issue counts. The page reads one `Frameworks:` line from `phaseContents['project-profile']` (`team-builder-start.page.ts:164-175`). The other phase text is ignored. The host then treats the missing objects as a healthy default analysis. Long facts are cut at 500 bytes per label (`team-builder-guidance-brief.ts:22-26`). The first bytes of each label still appear. A later fact in the same label can be cut off. The added block measured for two 5,000-character facts is 1,221 bytes.

### 4. What happens when a dependency fails?

A thrown install error uses the fixed sentence and returns to `review` (`team-builder-start.page.ts:378-384`). A `success: false` body names `failedSkill` and shows `reason` (`team-builder-start.page.ts:364-372`). The host sets `reason` to the `RpcUserError` message or to "Skill install failed." (`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:1301-1307`). If the selection save throws after some skills were installed, the handler throws (`setup-rpc.handlers.ts:1311-1325`). The page then has no installed names to show. A guidance failure clears facts and sets "Could not load project guidance." (`team-builder-start.page.ts:215-217`). A list or load failure keeps the empty analysis and sets a limited-guidance note (`team-builder-start.page.ts:177-188`).

### 5. What is missing that the requirements never mentioned?

Cancel of an install that is already on the wire. The stage lock is intentional. The launch intent has no boundary that tells the team builder to treat facts as data.

## Findings

### Blocker — The guidance payload cannot describe a weak repository

- File: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:168-176` and `libs/backend/rpc-handlers/src/lib/skills-sh/services/project-guidance.service.ts:39-74`
- Scenario: The user reviews skills after a stored analysis. The page sends project type and framework names only.
- Impact: The host fills a default code style and reports it as detected. It does not emit `tolerate` or `do_not_copy`. The owner question is on screen and is not required. Phase 3, "asks for the owner decision", does not happen for this repository.
- Fix: Send the structured fields the guidance service reads (`architecturePatterns`, `existingIssues`, `codeConventions`), or stop calling guidance with a partial object that the schema completes with defaults. The shared call type today is only `projectType` and `frameworks` (`libs/shared/src/lib/types/rpc.types.ts:22-25`, `59-61`). Widening that type was outside this batch. The behaviour is still wrong.

### Serious — Skip during load launches with no current facts

- File: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:136` and `:389-392`; `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.html:180-186`
- Scenario: The user clicks "Skip skills" while recommended skills are still loading.
- Impact: Facts were cleared at the start of the load, so the owner gate is open. The chat starts. The guidance response is ignored.
- Fix: Disable Skip until `loading()` is false, and make `launchChat()` return while `loading()` is true.

### Minor — Escape hides the consent dialog during install

- File: `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts:170-171`; `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:314-315`
- Scenario: The user presses Escape after Install.
- Impact: The dialog closes. The request continues. The user cannot press Back until the call ends. The review controls stay inert, so a second install does not start.
- Fix: Call `preventDefault` on the dialog `cancel` event while `busy` is true, or reopen the dialog when `isOpen` is still true.

### Minor — Fact text is instruction text in the team-builder chat

- File: `libs/frontend/onboarding/src/lib/proposal/team-builder-guidance-brief.ts:17-28`
- Scenario: A framework line or a fact contains "ignore the rules below" or similar text.
- Impact: Risk Medium. The text is placed in the same user intent the team builder follows. Skill descriptions are not copied into that intent. DOM insertion of the same strings is text binding.
- Fix: Put the three rules in a channel the fact text cannot override, and wrap the fact lines as quoted data.

## Failure modes

### Default analysis looks like a real detection

- Trigger: Any guidance call with only project type and frameworks.
- Symptom: A follow fact says the code style was detected from sampled files.
- Evidence: `project-guidance.service.ts:57-64` after schema defaults in `analysis-schema.ts:332-360`.
- Current handling: The page renders `fact.fact` and `fact.evidence`.
- Recommendation: Do not send a partial analysis through a schema that invents conventions.

### Skip wins the race against guidance

- Trigger: Skip while `loading()` is true.
- Symptom: Launch intent has no current facts. The owner alert does not appear.
- Evidence: `team-builder-start.page.ts:136`, `:389-393`.
- Current handling: Continue is disabled while `loading()` is true. Skip is not.
- Recommendation: Keep Skip on the same lock as Continue.

### Escape during install

- Trigger: Escape after the stage is `installing`.
- Symptom: Consent UI is gone until the RPC settles.
- Evidence: `native-modal.component.ts:170-171`, `team-builder-start.page.ts:314-315`.
- Current handling: Stage stays `installing`. A second `install()` returns.
- Recommendation: Keep the dialog open for the request.

### Fact text steers the chat

- Trigger: Untrusted analysis text inside `fact.fact`.
- Symptom: The team builder receives that text after the user intent.
- Evidence: `team-builder-guidance-brief.ts:17-28`.
- Current handling: The three rules are appended after the facts. Each label is cut at 500 bytes.
- Recommendation: Treat the block as data.

## Data flow

1. Submit sets stage `review` and starts `loadReview`. OK.
2. The page clears lists and facts, then lists and loads the newest analysis. OK for stale writes. Gap: the loaded body is reduced to project type and one frameworks line.
3. Recommend and guidance run with that object. Gap: host defaults become follow facts.
4. The user chooses skills. Continue previews hashes and opens consent. OK.
5. Install sends script records with the preview hash. OK. A thrown save error after a partial install becomes a generic alert. Gap.
6. Launch appends the brief. Gap when Skip runs before step 3 finishes.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Owner decision before Continue and Skip for `tolerate` or `do_not_copy` | PARTIAL | True only after facts are already in the store. |
| Choice and facts in `launchTeamBuilder` | PARTIAL | True for a finished load. The payload rarely contains weak facts. |
| Guidance block under 2 KB, intent first | COMPLETE | 500 bytes per label. Measured added block: 1,221 bytes for two long facts. |
| Consent hash, script approval, cancel sends nothing | COMPLETE | Page source. Specs do not assert the record body. |
| Lock during `installing` and `launching` | COMPLETE | Skip during `loading` is a separate hole. |
| Phase 3 writes labeled facts and asks the owner | MISSING | No file write. The ask does not run for the real payload. |

Implicit requirements not addressed: a boundary so fact text cannot act as instructions.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Missing or bad `Frameworks:` line | YES | Match failure leaves `[]` | A literal "(not detected)" would be sent as a name |
| Workspace change during a request | YES | Version, root, and `reset()` | Spec does not release a late response |
| Script skill without a checkbox | YES | `install()` returns | Spec uses `hasScripts: false` |
| Double click Continue | YES | `loading` is set before the await | No spec clicks twice |
| Back during install | YES | `back()` returns | No spec calls `back()` in that stage |
| Back during launch | YES | Abort and navigate | Spec covers cancel |
| Many long facts | YES | 500 bytes per label | Later facts in one label are cut |

## Tests

Command:

`npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-guidance-brief.spec.ts`

Result: exit 0. 4 suites passed, 17 tests passed. Jest time 96.179 s. There is no `team-builder-skill.store.spec.ts`.

The specs do not prove:

- Skip while `loading()` is true.
- `reset()` clears `ownerDecision`.
- A late RPC after a workspace change does not refill the lists.
- `install()` sends `contentHash` and refuses a script skill. The consent spec checks `allApproved()` and text binding only.
- Cancel before install performs no RPC.
- `back()` during `installing`.

## Decisions

- The partial guidance payload is a blocker in this review. The batch was told not to edit `libs/shared`. The host still completes the missing objects and the page shows the result. Options were: pass the UI and record a contract limit, or block because a weak repository never has to answer. The handler and schema are the evidence. A later batch can widen the payload. This is reversible.
- `result.data.reason` on `success: false` is allowed on the page. The host writes an `RpcUserError` message or "Skill install failed." It is not the raw `Error.message` path that `rpcMessage` already blocks.

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: A repository with weak practices gets default follow facts, and the owner decision is optional.
- What a robust implementation would add: a guidance payload that preserves pattern and issue data, a Skip lock until that call finishes, and a dialog that stays open for the whole install.

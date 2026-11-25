# Task description review

Author — project-manager subagent, Claude family, in-process.  
Reviewer — Codex, CLI lane.  
Reviewed revision — round 0. Completed revise rounds — 0.

Review basis — exact request and observations in `context.md`, supplied project rules, and the corresponding worktree source. The review is static. Ptah workspace analysis, path search and AST were used for orientation. Native numbered source reads supplied exact line and template evidence. No runtime checks were run.

## Requirement-to-section trace

| Requirement of record | Draft coverage | Assessment |
| --- | --- | --- |
| Working normal-model call when the decision model is unavailable (`context.md:5-6`, `:49-50`) | §1, especially AC 1.1–1.4 and 1.7. §4 covers degradation. | Present but weakened by scope wording that permits merely reporting failure and a stage-order question that would make the fallback optional. The success check must exercise the production-facing runner contract and yield a reasoned verdict. Findings 1 and 2. |
| User-selectable setup provider and model in Settings **or** setup (`context.md:7-8`, `:51-54`) | §2 AC 2.1–2.7. | Present. The draft mandates both placements and generation/guidance without resolving its own questions. Provider precedence, run identity and persistence still need checkable outcomes. Finding 3. |
| AI judge decides which skills to install and which to build, with reasons (`context.md:8-14`, `:55-57`) | §3 AC 3.1–3.7, §4 for unavailable judging, §5 for downstream creation. | Present. Current ranking cannot supply full verdicts. Judgment inputs, valid candidate identity, partial output and grouping need explicit treatment. Findings 1, 2 and 4. |

## Acceptance criteria review

| Criteria | Independently checkable coverage and gaps |
| --- | --- |
| 1.1, 1.2 | Decision dependency absent, timeout and invalid output are named. Specify that a valid normal-model response becomes the visible judge result and that both supported output representations satisfy the same validation. |
| 1.3, 1.4 | Timeout and invalid-output cases are named. 1.3 leaves the return body unspecified and omits ordinary provider rejection or missing runner. Verify cancellation or settlement and fallback metadata. |
| 1.5, 1.6, 1.7 | Stage and reason are observable. The proposed fake-runner checks omit decision success/partial, decision timeout or invalid followed by success, and an ordinary normal-provider failure. Add representative coverage of the actual result adapter so a fake cannot mask the defect. |
| 2.1, 2.2 | Control and effective value are observable once the surface is decided. Make the criterion correspond to that decision. |
| 2.3, 2.4, 2.5 | Configured and unset cases can be asserted against actual provider/model calls. Add a choice distinct from the workspace/chat value and define the stage(s), resumed run behavior and what the pill displays when the ranking method or model differs. |
| 2.6, 2.7 | Unavailable credentials/model are named. Cover partial or stale settings and a provider failure after the run starts. Define relationship to §4 and decide storage scope before asserting a restart result. |
| 3.1, 3.2, 3.4 | Normal three-way verdicts, visible reasons and deprecated candidates can be checked with fixtures. Add stable item/candidate identity, evidence-aware judgment and invalid output checks. A named free-text skill is insufficient to resolve the install target. |
| 3.3, 3.5, 3.6, 3.7 | Default selection, mass drafting and omissions are observable. Assertions conflict with fallback or removal gates. Grouped builds and partial answers need an explicit result and selection rule. |
| 4.1, 4.2, 4.3 | Model-only degradation is testable with a healthy registry. The two preselection alternatives produce different expected outcomes. Also exercise registry-only and combined dependency failures and retained recovery actions. |
| 5.1–5.5 | Covers editable draft, explicit write, write failure, skipping and drafting outage. Add evidence-grounded content and invalid/empty draft or invalid edit checks, including no write for invalid input. Resolve whether generation and template removal are approved. |
| 6.1, 6.2 | Existing-team-builder behavior can be checked using the named specs. The inventory lacks a complete proof map and omits some existing behaviors. |
| 6.3, 6.4 | Display and approval gates are observable. Define mixed provenance and stage reasons in the UI. Treat proposed removals as open in dependent criteria until the user has decided them. |

## Parity deltas

Source reviewed includes `analyze/analyze-skills.page.ts`, the shared review, pick card, coverage strip, selection rail, unmatched list and consent components, their coverage/store helpers, and the draft component. Paths in this section and the citation table are relative to `libs/frontend/onboarding/src/lib/` unless otherwise stated.

| Existing capability or proposed change | Review result |
| --- | --- |
| Coverage overflow and keyboard focus | Inventory line 22 omits six loading chips, the overflow affordance with focus on the first newly shown chip, and distinct item identity for equal names of different kinds. See `proposal/stack-coverage-strip.component.html:13`, `:68` and `proposal/stack-coverage-strip.component.ts:35`, `:44`, `:60`. |
| Recommendation and search feedback | Inventory lines 21 and 26 omit keeping the previous grid visible during rerun and the empty recommendation panel's focus-search action. Line 31 should name the submitted query, explicit no-other-results state and loading feedback. See `proposal/stack-skill-review.component.html:135`, `:154`, `:164`, `:199`, `:226` and `proposal/stack-skill-review.component.ts:128`. |
| Card metadata and already-installed skills | Inventory line 27 omits description, canonical source/key metadata, installed badge and intentional reinstall. See `proposal/skill-pick-card.component.html:24`, `:33`, `:45`, `:93`. |
| Consent inspection and recovery | Inventory lines 43–45 omit the visible per-skill hash, script/all-file lists and hook/executable notice. Also record the retryable preview error that preserves selection and the separate action-error presentation. See `proposal/stack-skill-consent.component.html:25`, `:31`, `:42`, `:47`, `analyze/analyze-skills.page.ts:348` and `proposal/stack-skill-review.component.html:101`. |
| Guidance navigation recovery | Inventory lines 46–47 describe the happy path only. A failed navigation after install exposes Continue without reinstalling. Retry reuses the existing tab, and stale failures are ignored. See `analyze/analyze-skills.page.ts:395`, `:426`, `:431`, `:447`. |
| Registry facts and manual selection | Lines 26, 33–34 conflate registry match status with judge verdict and can hide cards that line 61 says remain selectable. Current unmatched status is a successful search with zero candidates, distinct from a failed search or a rejected hit (`skill-recommendation.service.ts:293`). Preserve the fact, per-item search on degradation and access to rejected candidates, and specify how score-based sorting and manual access work alongside judge ordering. |
| Pre-select all | Explicitly OPEN at `parity-inventory.md:59`. Valid install verdicts supply a proposed default. When there are no verdicts, default selection remains a separate choice. |
| Automatic per-unmatched-item forms | Explicitly OPEN at `parity-inventory.md:62`. Build verdicts replace automatic shell generation on a successful judge call. Manual authoring for an item with no verdict or during an outage remains unresolved. |
| Fixed-template draft content | Explicitly OPEN at `parity-inventory.md:66`. A judge verdict classifies a build and does not itself generate a draft. Draft generation is a separate dependency, and the current seeded name, description and evidence scaffold still has value when drafting fails. Make this separate open decision visible in the primary artifact. |

## Citation checks

The table records the checks performed and each mismatch found. `TD` means `task-description.md`. `PI` means `parity-inventory.md`.

| Artifact line | Source line checked | Result |
| --- | --- | --- |
| TD 6, PI 4 | `onboarding.routes.ts:71` | Matches skills route. |
| TD 8–10 | `skill-ranking-caller.service.ts:36`, `:47–71` and `routing-constants.ts:117` | Match timeout and single-choice candidate questions. |
| TD 11–13, 211 | `skill-ranking.service.ts:26`, `:140–189` and `harness-llm-runner.service.ts:163` | Match deadline, no-tool two-turn normal call and structured-output read. Runner return at line 173 confirms the missing text result. |
| TD 14, 16–17 | `skill-ranking-caller.service.ts:130–133` and `skill-ranking.service.ts:102` | Match diagnostic sites. The latter interpolates the method, and a caller returning null for unavailable or invalid can reach the same message. |
| TD 15–16 | `skill-ranking.service.ts:80–91` | Partial. This establishes heuristic labeling and preserves candidate order. The source of ordering is `skill-recommendation.service.ts:199–216`, which prefers described candidates before comparing score. Correct the implication that it uses install count alone. |
| TD 20–25 | `wizard-rpc.service.ts:344–352`, `:145–210`, `wizard-generation-binding.ts:388–417` and `workspace-llm-resolver.ts:70–84` | Match existing model requests and resolver defaults. |
| TD 27–30 | `provider-consumer-rows.ts:19–37`, `provider-consumer-assignments.component.ts:85–103`, `ready/ready-settings-step.page.ts:65–67`, `:166`, `shell/onboarding-run-pill.service.ts:4–23` | Match role declarations, Settings heading, embedded settings and read-only pill. |
| TD 33, PI 29, 59 | `analyze/analyze-skills.page.ts:250–257` | Matches preselecting all recommendation IDs. |
| TD 36, PI 35, 63 | `proposal/unmatched-stack-list.component.html:29–31` | Matches automatic framework/pattern form. |
| TD 37, PI 36, 66 | `analyze/project-skill-draft.component.ts:101–103` | Wrong in all three places. File ends at line 67. Current defaults are at 43–45. |
| TD 68–70 | `multi-phase-prompts.ts:159`, `stack-summary.extractor.ts:41–43` | Match prompt and cap. Clarify that the extractor discards the entire incoming structured block when the combined deduped count exceeds 30. |
| TD 93, 207, PI 18 | `analyze/analyze-skills.page.ts:241–245` | Matches 75-second client RPC timeout. |
| TD 179, PI 39 | `analyze/project-skill-draft.component.ts:109–124` | Wrong in both places. RPC, created path and preserved-error handling are at 51–65. |
| PI 19 | `analyze/analyze-skills.page.ts:182–228` | Page citation matches. RPC column is incomplete. `getResumableRun` is the run lookup at line 198. `analysis-step.store.ts:152–162` uses `loadAnalysis` for saved analysis. |
| PI 21–22 | `proposal/stack-skill-review.component.ts:124`, `:128–130` and `proposal/stack-coverage-strip.component.ts:28–82` | Match loading/filter claims. Templates and focus behavior need the parity details above. |
| PI 26 | `proposal/stack-skill-review.component.html:199–264`, `proposal/stack-skill-review.component.ts:143–153` | Match current score sort and empty/filter states. The proposed new-location text is inconsistent with this preserved behavior. |
| PI 27 | `proposal/skill-pick-card.component.ts:31–37`, `:48–63` | Partial. Inputs, install count and URL computation start match. HTTPS validation is at line 66, link rendering at `proposal/skill-pick-card.component.html:76–91`. |
| PI 30, 32 | `proposal/stack-skill.store.ts:171–180`, `:94–107`, `proposal/stack-skill-review.component.ts:159–171` | Match approval reset and selected-name retention. The “none today” test claim is wrong. See `analyze/analyze-skills.page.spec.ts:416`, `:648`. |
| PI 37–38 | `analyze/project-skill-draft.component.ts:72–73`, `:74–76` | Both ranges are wrong. Destination/heading at 14–15, editable fields at 16–18. |
| PI 42–44 | `analyze/analyze-skills.page.ts:315–354`, `:356–418`, `proposal/stack-skill.store.ts:58–68` | Match preview checks, scope of the install and partial failure handlers, and script count. |
| PI 52 | `skill-ranking.service.ts:190–198` | Matches an aggregate ranking method. Add `skill-recommendation.service.ts:305–310` for the externally returned field and preserve the per-card result where applicable. |
| PI 53 | `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-analyze.fixtures.ts:130` | Fixture exists. “The fixture's own scenario” does not specify a test or assertion for the skills fixture. Name an allowed check that exercises the behavior. |

## Proposed-constraint decisions

| Requirement or constraint | Tag | Review decision |
| --- | --- | --- |
| Normal-model fallback works, user chooses setup provider and model in one allowed surface, reasoned install/build decisions | `user-requested` | Keep as binding outcomes. |
| Electron first, shared host compatibility, no unrelated host work, explicit user removal approval and scoped verification | `project-rule` | Keep. See `context.md:59–68`, `:76–77`, and the supplied project guidance. |
| Two surfaces, specific Background Models placement, mandatory generation/guidance integration (`task-description.md:55–56`, `:113–119`) | `lane-proposed` | Reject as binding before the open scope/placement decision. Analysis, ranking and judging are covered by `context.md:51–54`. |
| Persist the choice, preserve current default when unset, report the effective route and unavailable configured providers (`task-description.md:120–127`) | `lane-proposed` | Supported by making the option usable and preserving existing behavior. Global/workspace storage, pill placement and run locking require a definite design decision. |
| Decision stage optional or normal-only judging (`task-description.md:242–243`) | `lane-proposed` | Reject normal-only as a substitute for the requested fallback. The architect can choose how the decision stage participates while preserving the fallback trigger and result. |
| Distinct failure reasons, production boundary coverage and a result inside the existing 75-second timeout (`task-description.md:87–104`, `:206–207`) | `lane-proposed` | Supported by the observed failure and current client contract. Reject fixed log severity, exact message strings and a specific fake-runner implementation as hard requirements. Retain checkable diagnostic categories and test scenarios. |
| One verdict per item, one-line reasons, rejected-candidate reason disclosure, deprecated handling and pattern grouping (`task-description.md:137–152`) | `lane-proposed` | Reasoned verdicts and preventing deprecation-driven bad defaults are supported by the user report. Treat line length, disclosure design and grouping as design choices. Reject mandatory grouping or exclusive per-item cardinality where they constrain the requested decisions or contradict each other. |
| Preselection only for install verdicts, no unmatched forms without a build verdict, exact-name preselection on outage (`task-description.md:142–150`, `:163–164`) | `lane-proposed` | Reject as settled behavior ahead of the removal gate. Exact-name matching has no support as an applicability guarantee and conflicts with install-only defaults. |
| AI drafting on a build verdict, editable content, explicit Create, and a manual route on draft failure (`task-description.md:175–185`) | `lane-proposed` | Explicit Create and editability preserve parity. Grounded drafting is a plausible response to empty shells. Reject automatic AI drafting and discarding the seeded template as binding before the separate decision. Retain a verifiable useful-build outcome. |
| No-tool judge and draft calls, unchanged registry/consent boundaries, and extractor follow-up (`task-description.md:68–75`, `:210–211`) | `lane-proposed` | Existing tool-free ranking and approval boundary support preserving that posture. If drafting is accepted, supplied evidence can support tool-free drafting. Extraction is a documented scope boundary. Tracking the defect is a follow-up, with no obligation to land it in this task. |
| Visible judging provenance and usable degraded flow (`task-description.md:59–61`, `:160–166`, `:199–200`) | `lane-proposed` | Supported by observed silent degradation. Preserve registry/search errors and require accurate provenance. Exact copy and UI placement are design choices. |

## Numbered findings

1. **Define the successful fallback contract and preserve the trigger.** `task-description.md:54`, `:81–104`, `:242–243`. Require an unavailable decision model followed by a valid ordinary call to produce the same reasoned verdict contract consumed by the UI. A production-facing acceptance scenario must exercise text-only output because the current runner exposes only structured output (`harness-llm-runner.service.ts:94–98`, `:162–173`). Current pending logic also skips zero- and one-candidate items (`skill-ranking.service.ts:92–97`). Include those cases in judging and preserve the fallback behavior under the stage-order decision. **Impact:** the observed heuristic-only failure can survive fake-runner tests or a redesign that bypasses fallback.
2. **Specify invalid, partial and failed dependency handling end to end.** `task-description.md:91–104`, `:137–152`, `:160–166`, `:199–200`. Require the judge to use detected stack facts and eligible registry candidates. Specify treatment of unknown or ambiguous candidate IDs, duplicate/omitted verdicts, missing reasons and partially valid results. State what gets retried by the normal model, how an ordinary model error or absent runner degrades, and what the UI does when the registry itself fails. Method and surfaced reasons must remain accurate for mixed results. Current aggregate provenance prefers decision-model whenever any item used it (`skill-ranking.service.ts:190–198`). **Impact:** unverified skills can be preselected, and readers cannot tell whether valid partial judgments are recoverable or reported accurately.
3. **Resolve or condition the setup routing scope.** `task-description.md:55–56`, `:113–127`, `:234–238`, `:246–247`. Bind one user-accessible placement and requested setup consumers, with other surfaces and consumers conditional on the open decision. Define route precedence against the explicit decision-model path, chat overrides and unset settings, plus persistence, accepted/resumed run behavior and errors for invalid pairs or later provider failure. Check provider and model at the actual call boundary with a distinct configured pair. **Impact:** a picker can appear to work while a stage still uses the active provider/chat model or displays an inaccurate route.
4. **Reconcile verdict rules and the removal gate.** `task-description.md:137–152`, `:163–164`, `:175–185`, `:201–202`, `:239–241`. Condition preselection changes, draft-form removal and fixed-template replacement on the three OPEN decisions. Resolve grouped builds versus per-item results, exact-name versus install-only preselection, and how to create a useful skill without losing manual authoring when judgment or drafting fails. Verify evidence-grounded content, invalid/empty drafts, explicit creation and edit retention on failure. **Impact:** the draft currently authorizes changes before user approval and permits mutually inconsistent implementations.
5. **Complete the parity inventory and its proof map.** `parity-inventory.md:19–48`, `:53`, `:59–68` and `task-description.md:194–195`. Incorporate the parity deltas above. Preserve no-match as a registry fact and keep manual access to recommended and rejected candidates. Point to actual assertions or identify gaps that require scoped coverage, including the existing retained-results tests. **Impact:** a passing gate could conceal lost keyboard affordances, informed consent, reinstall, recovery, or manual skill choices.
6. **Correct source pointers and qualify baseline claims.** `task-description.md:15–16`, `:37`, `:179` and `parity-inventory.md:19`, `:27`, `:36–39`, `:66`. Apply the citation corrections above, including all references to draft lines beyond the actual file. **Impact:** the implementation handoff can send the next lane to nonexistent code or misstate the current fallback behavior.
7. **Keep implementation tactics out of mandatory acceptance.** `task-description.md:97–104`, `:137–148`. Keep observable stage/reason distinctions and tests of production behavior. Move unsupported exact logging levels, test-double choice, presentation length, grouping and disclosure mechanics to design proposals where appropriate. **Impact:** implementation can comply with these prescriptions while leaving the user-facing failure unresolved.

## Unresolved items

- User gate — placement, generation/guidance scope, and all three proposed removals. The inventory records all three as OPEN. This review makes no removal decision.
- Architecture — configured route precedence, storage scope, mixed or partial model output, degradation defaults, and the call deadline within the end-to-end budget. Regroup these under the binding outcomes after findings are addressed.
- Recheck a revised artifact and inventory through the orchestrator. Round 0 establishes document findings only.

Verdict: REVISE

## Round 1

Author — project-manager subagent, Claude family, in-process.  
Reviewer — Codex, CLI lane.  
Reviewed revision — round 1. Completed revise rounds — 1 of 2.

Reviewed the revised requirements, their revision log (`task-description.md:355–382`), the updated inventory, and `decisions.md:7–9`. D3, D4 and D5 settle placement, setup scope and all three removals. The criteria implementing those decisions are binding. The round 0 removal questions are closed.

| Round 0 finding | Status | Round 1 evidence |
| --- | --- | --- |
| 1. Successful fallback contract and trigger | Resolved | `task-description.md:74–75`, `:103–124`, `:137–140` require the decision stage, cover zero and one candidate, and verify reasoned text-only verdicts through the production result path. |
| 2. Invalid, partial and failed dependencies | Partly resolved | `task-description.md:114–116`, `:129–140`, `:189–206`, `:217–241`, `:279–281` now define stable IDs, failure categories, retry, mixed provenance and registry outages. The interaction between the new cases still needs an explicit combined result. If the decision stage judges some items and the normal provider then fails, 1.6 says to return the registry result while 3.5 says to keep valid verdicts and 4.1 describes a response for when neither stage produces a verdict. State that valid decision verdicts and their defaults survive, and specify what the remaining items display. Clarify that 3.6's omitted-item display applies after fallback has been attempted under 1.2. |
| 3. Setup routing scope | Partly resolved | `decisions.md:7–8` and `task-description.md:149–179` establish the user-approved scope, distinct-pair call-boundary verification, unset path, stale settings, run/resume reporting, and persistence. However, `:155–161` requires the configured pair for generation and guidance, while `:330–333` permits an architect to give a later per-tab override precedence. Say which rule governs and make the open question consistent with it. Storage scope can be named in architecture as 2.10 requires. |
| 4. Verdict rules and removal gate | Resolved | `decisions.md:9`, `task-description.md:192–195`, `:207–211`, `:231–232`, `:250–264`, and `parity-inventory.md:72–87` establish the approved replacements, allow grouped and combined decisions, keep on-demand drafting, and cover explicit creation and draft failure. |
| 5. Parity and proof map | Partly resolved | `parity-inventory.md:16–18`, `:25–39`, `:44–48`, `:57–63` capture the earlier omissions and distinguish existing proof from tests still owed. `task-description.md:273–275` binds parity at landing. The ordinary test gaps have an acceptable handoff, with the fixture exception in new finding 8. |
| 6. Source pointers and baseline claims | Resolved | `task-description.md:12–24`, `:42–44`, `:91–94`, `:254–258` and `parity-inventory.md:23`, `:37`, `:50–54`, `:69`, `:84` correct the round 0 source pointers and fallback ordering explanation. The new candidate-history claim is addressed separately in finding 9. |
| 7. Implementation tactics in acceptance | Partly resolved | `task-description.md:120–124`, `:196–197`, `:315–326` leave test-double choice, reason length, disclosure and grouping to design. `:133–136` still excludes debug diagnostics as a binding criterion. User-visible stage and reason distinguish the failure, and `:319` already proposes a log level. Move the diagnostic-level condition into that proposal or cite a governing project rule. |

### Parity test handoff

The declared GAP and confirm rows generally describe observable behavior and identify the component or test suite. The tests phase can map each to an existing assertion or add a scoped assertion where coverage is missing. Requirement 6.1 makes this a landing condition. Examples already present include the retained grid and focus-search action (`proposal/team-builder-skill-review.component.spec.ts:250`, `:278`), equal-name filter identity (`proposal/stack-coverage-strip.component.spec.ts:85`), and navigation recovery (`analyze/analyze-skills.page.spec.ts:530`, `:671`). These can be confirmed in the tests phase. The GAP or confirm label alone does not block the requirements gate.

### New numbered findings

8. **Give the fixture row an executable proof condition.** `parity-inventory.md:70`, `task-description.md:273–275`. The revised row labels behavioral proof a GAP until the user requests E2E, while 6.1 requires a scoped behavioral test for every kept GAP. A harness typecheck establishes compile compatibility and cannot prove behavior. Identify a scoped fixture-contract assertion that can run under the existing limits, or classify fixture compatibility separately and map skills behavior to the relevant scoped specs. **Impact:** the current handoff makes the stated parity gate depend on an unscheduled E2E authorization.
9. **Correct the baseline for rejected-candidate access.** `parity-inventory.md:47`, `task-description.md:215–216`. Remove the new claim that every candidate is a selectable card today. `skill-recommendation.service.ts:250–292` emits the best distinct recommendation per item or extends the existing card's evidence, leaving other collected candidates out of the returned recommendation list. Keep 3.10 as the new judge-era manual access requirement. **Impact:** a tester relying on supposed existing parity could miss that rejected candidates need new reachability and selection coverage.

Open for the next revision — partial-degradation semantics, per-tab precedence, diagnostic severity, and findings 8–9. No runtime checks were run.

Verdict: REVISE

## Round 2

Author — project-manager subagent, Claude family, in-process.  
Reviewer — Codex, CLI lane.  
Reviewed revision — round 2. Completed revise rounds — 2 of 2.

Reviewed the round 2 revision log (`task-description.md:391–409`), the changed requirements and inventory, and binding decision D6 (`decisions.md:10`).

| Open item from round 1 | Status | Round 2 evidence |
| --- | --- | --- |
| 2. Partial-degradation semantics | Resolved | `task-description.md:116–118`, `:131–144`, `:205–215`, `:237–240` define retry before showing “not judged,” retain valid decisions and their install defaults, and include a test for partial decision success followed by normal-model failure. The fully degraded notice applies when no verdict survives. |
| 3. Per-tab precedence | Partly resolved | `task-description.md:66–67`, `:159–166`, `:339–344` close the per-tab question and test precedence for a configured Setup pair. The unset path in `:167–169` conflicts with the new binding decision. See finding 10. |
| 7. Diagnostic severity | Resolved | `task-description.md:138–139` requires stage and reason category in the result. `:325–330` makes the log level a design proposal. The stakeholder table at `:313` still describes the proposed diagnostics as an expectation. |
| 8. Fixture proof | Partly resolved | `parity-inventory.md:70–71` separates compatibility from behavior and routes behavioral proof to scoped specs, removing the E2E dependency. The proposed typecheck needs a contract-typed fixture entry to establish compatibility. See finding 11. |
| 9. Rejected-candidate baseline | Resolved | `task-description.md:222–225` and `parity-inventory.md:47` correctly identify manual access as new behavior and assign new coverage. The source at `skill-recommendation.service.ts:250–292` supports the corrected baseline. |

### New numbered findings

10. **Apply D6 when the Setup pair is unset.** `decisions.md:10`, `task-description.md:66–67`, `:163–169`. The revision binds D6 but keeps `tab.overrideModel ?? currentModel()` as the generation and guidance route when Setup is unset. D6 excludes chat-tab overrides for setup operations without a configured-pair condition. Specify the unset model source without per-tab overrides and add the unset case to the precedence check. **Impact:** generation and guidance could still route through a chat-tab model in the default configuration.
11. **Tie the fixture typecheck to the RPC result contract.** `parity-inventory.md:70`, `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-analyze.fixtures.ts:130–159`. The revised proof is a harness typecheck, but the fixture currently places the recommendation payload in a `Record<string, unknown>`. That check accepts a payload missing required judge fields. Require the fixture's recommendation response to be checked against the shared RPC result type, or name a scoped contract assertion. The behavioral proof stays with the scoped specs in inventory line 71. **Impact:** the proposed compatibility check can pass while the fixture sends a stale response.

### Items still open after the final revision

- Finding 3, narrowed to finding 10 — unset Setup routing must follow D6.
- Finding 8, narrowed to finding 11 — fixture compatibility needs a check that exercises the response contract.

The two remaining items go to the orchestrator for gate escalation. Static review only. No runtime checks were run.

Verdict: REVISE

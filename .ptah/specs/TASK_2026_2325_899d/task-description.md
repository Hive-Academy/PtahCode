# Requirements - TASK_2026_2325_899d

Gate 1: APPROVED by the user on 2026-11-24 after review round 2 (findings 10 and 11 decided as D7 and D8).

## Context

The onboarding setup wizard (Electron renderer, route `analyze/skills`,
`libs/frontend/onboarding/src/lib/onboarding.routes.ts:71`) recommends skills for the detected
project stack. Today the backend ranks registry candidates in two stages. A decision model runs
first with a hard 3 s deadline (`libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:36`,
`routing-constants.ts:117`) and picks one candidate per item without being able to say "none
apply" (:47-71). A normal model call (`session-model`) runs as the fallback
(`libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts:140-189`) with a
15 s deadline (:26), 2 turns and no explicit model. Both stages only consider items with more
than one candidate (`skill-ranking.service.ts:92-97`). The runner returns only structured output
(`libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.ts:94-98`, `:162-173`),
so a text-only answer is lost. In the observed run both stages failed: the decision model gave
"No valid ranking answers" (`skill-ranking-caller.service.ts:130-133`), and the fallback timed
out with `hasStructuredOutput: false`. Ranking was then labelled `heuristic`
(`skill-ranking.service.ts:80-91`) and kept the candidate collection order, which puts
candidates with a description first and then sorts by score
(`skill-recommendation.service.ts:199-216`; score is `100 + log10(1 + installs)`, :199). Every
ranking log is `debug`; the "Invalid ... output" line (`skill-ranking.service.ts:102`) is the
same message for an unavailable and an invalid stage. The aggregate method prefers
`decision-model` whenever any item used it (:190-198). The UI does not show `rankedBy`
(returned at `skill-recommendation.service.ts:309`).

The provider and model setup uses are not a user choice. Analysis sends the chat model
picker's current model (`libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:344-352`),
generation and guidance send `tab.overrideModel ?? currentModel()` (:145-210, backend
`wizard-generation-binding.ts:388-417` defaults to the sonnet tier), and ranking sends no model
and resolves to the workspace `selectedModel` or `'default'`
(`libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.ts:77-84`). The provider is
always the workspace's active provider (:70-71). Settings has a "Background models" area with
roles `memory-curator`, `enhancement` and `decision`
(`libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts:19-37`,
`provider-consumer-assignments.component.ts:85-103`), but no setup role. Onboarding embeds the
providers settings at `ready/settings` (`ready-settings-step.page.ts:65-67`, :166) and shows a
read-only provider/model pill (`shell/onboarding-run-pill.service.ts:4-23`).

The recommendation list itself is not reasoned. The page pre-selected all 22 recommendations
(`analyze-skills.page.ts:250-257`), including inapplicable and deprecated skills (an n8n skill
for JavaScript, Salesforce skills for Mermaid and Jest, two Angular skills marked DEPRECATED).
Each unmatched `framework` or `pattern` item renders a draft form
(`proposal/unmatched-stack-list.component.html:29-31`) whose content is a fixed template
(`analyze/project-skill-draft.component.ts:43-45`), so a scratch workspace with 20 patterns
showed 20 empty skill shells. The user asked for three outcomes (`context.md`): the normal-model
fallback must actually work, the setup provider and model must be a user option in settings or
setup, and an AI judge must decide what to install and what to build, with reasons. The user
has since decided placement, scope and the three removals (`decisions.md` D3, D4, D5).

## Classification

- Type: FEATURE — adds a user setting, a judging capability and new verdict UI, beyond fixing
  the failed fallback.
- Estimate: L — the carrier's estimate; it spans backend ranking, provider/model resolution
  for four setup stages, two settings surfaces, and the shared skill review component that the
  team builder also uses.
- Priority: not defined here.

## Decided

- Setup option location: both. Settings "Background models" owns the value as a "Setup" row;
  the onboarding analyze page shows the current value and links to that setting
  (`decisions.md` D3, user, 2026-11-24).
- Setup option scope: one setup role governs onboarding analysis, skill ranking and judging,
  agent generation and guidance (`decisions.md` D4, user, 2026-11-24).
- Setup precedence: for those setup operations the Setup role governs; a chat-tab model
  override does not apply to them (`decisions.md` D6, orchestrator, from D4).
- Unset Setup pair: every setup operation, including agent generation and guidance, uses the
  workspace's active provider and its selected model; a chat-tab model override never applies
  to setup operations, set or unset (`decisions.md` D7, user, 2026-11-24).
- Fixture compatibility: the onboarding analyze fixture's recommendation response is typed
  against the shared RPC result type, so the harness typecheck fails when a judge field is
  missing (`decisions.md` D8, user, 2026-11-24).
- Removals approved: pre-select all (replaced by install-verdict pre-selection), one automatic
  draft form per unmatched item (replaced by build verdicts), fixed-template draft content
  (replaced by generated skill content) (`decisions.md` D5, user, 2026-11-24).

## Scope

In scope:

- Making the normal-model fallback for skill judging produce a reasoned result when the
  decision model cannot.
- A "Setup" provider and model role in Settings "Background models", shown and linked from
  the onboarding analyze page, applied to analysis, judging, generation and guidance (D3, D4).
- An AI judge that decides, from the detected stack and the registry candidates, which skills
  to install and which to build, with a reason for each decision and for each rejected
  candidate.
- A usable skills step when no model can judge, or when the registry fails.
- Turning build verdicts into real skills the user creates on purpose, with generated content
  and a manual route when generation fails.
- Showing which method produced the recommendations, and the fallback reasons, in the UI.
- Parity for every capability of the current skills review step, per `parity-inventory.md`.

Out of scope:

- TUI and VS Code host feature work — `project-rule` (CLAUDE.md "Product focus: Electron
  first"); shared contract changes only for compatibility.
- Changing how the architecture phase extracts stack items (`multi-phase-prompts.ts:159`; the
  extractor discards the whole incoming phase block when the combined deduped count exceeds 30,
  `stack-summary.extractor.ts:41-43`) — a separate extraction defect; record it as a follow-up
  task, with no obligation to land it here. The judge must cope with the list it is given.
- The skills.sh registry search itself and the install/consent pipeline — kept as is; only
  what feeds into and is pre-selected by them changes.
- Background-model roles other than setup (`memory-curator`, `enhancement`, `decision`) —
  unchanged.
- The chat model picker's behaviour outside setup — unchanged.

## Requirements

### 1. Normal-model fallback works

Requirement: the skill judging service — when the decision model cannot produce a usable
answer — runs a normal model call that finishes and returns reasoned verdicts, so the user does
not silently receive registry order.

Acceptance criteria:

1. When the decision model is configured and available, the system shall use it as a stage of
   judging (how it participates is the architect's choice); it shall not be removed in favour
   of normal-only judging.
2. When the decision model is not configured, unavailable, times out, returns invalid output, or
   returns valid verdicts for only some items, the system shall run the normal model call for
   every item that lacks a valid verdict, including items with zero or one registry candidate.
3. When the normal model returns a valid answer, the recommendation result shall carry that
   call's verdicts and reasons as the judge result shown to the user, whether the answer arrived
   as structured output or as text only; both forms shall pass the same validation.
4. When the provider stream of the production runner path ends with a valid text-only answer
   and no structured output (the observed failure), the recommendation result shall contain
   normal-model verdicts, not registry order. This shall be proven by a test that exercises the
   production result path, so that a test double returning parsed objects cannot mask the
   defect.
5. When the normal model call does not finish within its own deadline, the system shall stop
   waiting for it, no later output of that call shall change the returned result, and the
   recommendation request shall return before the client's 75 s request timeout
   (`analyze-skills.page.ts:241-245`) expires.
6. When the normal model returns unreadable or invalid output, fails with a provider error, or
   no runner is available, the system shall return one combined result: every valid verdict the
   decision stage already produced is kept, with its reason and its install pre-selection
   (3.7); every item still without a valid verdict shows as "not judged" with its registry
   status and registry candidates (3.9), and the result names the failed stage and its category
   (`unavailable`, `timed out`, `invalid output`, `provider error`). Only when no item has a
   valid verdict does requirement 4.1 apply.
7. When a recommendation result is returned, it shall state the method that produced each
   item's verdict and, when a stage was skipped or failed, that stage and its reason category.
8. Automated tests shall cover: decision stage succeeds; decision stage partial, normal call
   fills the rest; decision unavailable, then normal success; decision timeout, then normal
   success; decision invalid, then normal success; normal call text-only answer; normal call
   timeout; normal call invalid output; normal call provider error; decision stage partial,
   then normal call fails (combined result of 1.6).

### 2. Setup provider and model as a user option (D3, D4)

Requirement: as a user running setup, I want to choose which provider and model setup uses, so
that analysis, skill judging, generation and guidance run on a model I trust and pay for.

Acceptance criteria:

1. When the user opens Settings, providers, "Background models", the system shall show a
   "Setup" row that lets the user choose a provider and a model, beside the existing roles.
2. When the user is on the onboarding analyze page before analysis starts, the system shall
   show the effective setup provider and model (or that the default applies) and a link that
   opens the Settings "Setup" row; after a change there, the analyze page shall show the new
   value without a restart.
3. When a setup provider and model are set, onboarding analysis, the normal-model judging
   stage, agent generation and guidance shall each send their model call to that provider and
   model. This shall be proven at the call boundary with a pair that differs from the
   workspace's active provider, the chat picker's model and a chat tab's `overrideModel`.
4. When a setup provider and model are set, they shall govern those four setup operations; the
   chat picker's model, a chat tab's `overrideModel` and the workspace `selectedModel` shall not
   apply to them (`decisions.md` D6, from D4). The decision-model stage shall keep using the
   existing `decision` role.
5. When no setup provider and model are set, all four setup operations (analysis, the
   normal-model judging stage, agent generation and guidance) shall use the workspace's active
   provider and its selected model (`decisions.md` D7); a chat tab's `overrideModel` and the
   chat picker's model shall not apply. This shall be proven at the call boundary for each of
   the four operations with a chat-tab `overrideModel` and a chat-picker model that both differ
   from the workspace's selected model.
6. When a skills-step request or a setup run starts, the system shall use the setup value in
   effect at that moment; a change during the run shall not alter calls already started. The
   result and the run pill shall show the provider and model actually used; when stages of one
   run used different pairs, the result shall report each stage's pair.
7. When a resumed run reaches the skills step, the judge call shall use the setup value in
   effect when the skills request starts, and shall report that pair as in 2.6.
8. When the chosen provider is not signed in, or the chosen model is no longer offered, or only
   one of provider and model is stored, the system shall show an error naming the provider and
   the missing or stale part, and shall not start the affected stage with a different pair
   unless the user acts.
9. When the provider fails after a stage has started, analysis, generation and guidance shall
   show their existing error states naming the provider, and judging shall degrade per
   requirement 1.6 and requirement 4.
10. When the user changes the setup value, it shall persist across app restarts in the storage
    scope that the implementation plan states (global or per workspace); the plan shall name it.

### 3. AI judge verdicts

Requirement: as a user on the skills step, I want each detected stack item judged against the
project evidence and the registry candidates, with a reason, so that I install only applicable
skills and build only skills worth building.

Acceptance criteria:

1. When recommendations load with a working model, the judge shall decide from the detected
   stack items (name, kind, evidence) and the registry candidates found for that run; every
   install verdict shall name a candidate from that set by its stable identity.
2. When verdicts are shown, each detected stack item shall have an outcome of install (naming
   one or more candidates), build, both install and build, "no skill needed", or "not judged",
   each with a reason. One install candidate or one build proposal may cover several items;
   each covered item shall show which decision covers it.
3. When the judge rejects a registry candidate (not applicable, deprecated, a different
   product), the user shall be able to see that rejection's reason.
4. When a candidate's description marks it deprecated, the system shall not give it an install
   verdict.
5. When judge output names an unknown or ambiguous candidate, gives an item more than one
   conflicting outcome, or lacks a reason, the system shall discard that item's verdict, keep
   the other valid verdicts, and pass the item to the normal model call (requirement 1.2) if the
   decision stage produced it; if the normal stage produced it, or the normal call fails, the
   item shall show as "not judged" per requirement 1.6.
6. When an item still has no valid verdict after the normal call of requirement 1.2 was
   attempted (omitted, discarded, or the call failed), the system shall show that item as "not
   judged" with its registry status and candidates, rather than drop it. An item omitted by the
   decision stage alone shall not show as "not judged" before that attempt.
7. When recommendations load, the system shall pre-select only candidates with a valid install
   verdict; no other candidate shall be pre-selected (D5).
8. When a stack item has no build verdict, the system shall not render a draft form for it
   automatically (D5); the user shall still be able to open a project skill draft for any
   detected item on request.
9. When an item's registry status is shown, the system shall keep it separate from the verdict:
   matched, no match (successful search with zero candidates,
   `skill-recommendation.service.ts:293-296`), or search failed.
10. When the judge has rejected a candidate or given it no verdict, that candidate shall be
    reachable and selectable by hand. This is new behaviour: today the result carries only the
    best distinct recommendation per item and drops the other collected candidates
    (`skill-recommendation.service.ts:250-292`), so it needs new test coverage.
11. When results mix methods (some items by the decision model, some by the normal model, some
    not judged), the displayed method shall describe that mix accurately, not only the first
    method found.

### 4. Skills step without a judge, or without the registry

Requirement: the skills step — when no model can judge, or the registry fails — stays usable and
says so.

Acceptance criteria:

1. When no item has a valid verdict from either stage and the registry search succeeded (for
   partial verdicts see requirement 1.6), the system shall
   show the registry results with a visible notice that AI review is unavailable, plus the
   stage reasons from requirement 1.7.
2. When no item has a valid install verdict, the system shall pre-select nothing (follows from
   3.7 and D5).
3. When the judge is unavailable, search, per-item search, selection, consent, install, skip,
   re-run and Back shall work as they do today.
4. When the registry search fails for an item, that item shall show its search-failure reason
   (existing alert) and shall get no install verdict; any build or "no skill needed" verdict for
   it shall say it was made without registry candidates.
5. When the whole recommendation request fails, the existing load-error panel and Back shall
   appear as today.
6. When both the registry and the models fail, the user shall see both the search-failure and
   the AI-unavailable information, and re-run, per-item search and Back shall remain available.

### 5. Build verdicts become real skills

Requirement: as a user, I want to turn a build verdict into a real project skill with useful
content, so that I get skills, not empty shells.

Acceptance criteria:

1. When a build verdict is shown, the system shall offer to create that skill with content
   generated from the project evidence of the items it covers and the judge's reason (D5); the
   user can review and edit name, description and content before creating.
2. When generated content is shown, it shall contain the project evidence of each covered item.
3. When the user clicks Create, and only then, the system shall write the skill through
   `harness:create-skill` (`analyze/project-skill-draft.component.ts:51-65`) or its equivalent
   and show the created path.
4. When the name gives an empty slug or the content is blank, Create shall be unavailable and
   no skill shall be written (today `project-skill-draft.component.ts:21`, :52).
5. When creation fails, the system shall show the error and keep the user's edits.
6. When the user creates none of the build skills, the system shall let them continue with no
   skill created and no error.
7. When content generation fails, returns empty output, or no model is available, the system
   shall say so and still open an editable draft that contains the item's name and project
   evidence, so the user can write the content by hand and create it.

### 6. Parity and observability

Requirement: existing users of the skills review UI — the onboarding skills step and the team
builder — keep every capability, and the recommendation method is visible.

Acceptance criteria:

1. When this task lands, every capability listed in `parity-inventory.md` with decision `keep`
   or `move` shall work, proven by the test named there; rows marked GAP shall gain a scoped
   test that asserts the behaviour. The e2e run is not part of this gate; fixture compatibility
   is proven by the harness typecheck against a fixture whose recommendation response is typed
   with the shared RPC result type, so a missing judge field fails that typecheck
   (`decisions.md` D8).
2. When the team builder start page (`team-builder-start.page.ts`) uses the shared review
   component (`proposal/stack-skill-review.component.ts`), its guidance facts, owner decision
   and selection behaviour shall be unchanged, and its existing specs shall pass.
3. When recommendations are shown, the system shall display which method produced them (AI
   judge by the decision model, AI judge by the normal model, mixed, or registry order) and the
   fallback reasons per requirement 1.7.
4. When a capability is removed, it shall be one of the three `remove-approved` rows in
   `parity-inventory.md` (D5); no other capability shall be removed.

## Non-functional requirements

- Performance: the recommendation request shall complete, or return with fallback reasons,
  within the client's existing 75 s request timeout (`analyze-skills.page.ts:241-245`).
- Compatibility: `project-rule` (CLAUDE.md "Product focus: Electron first") — Electron is the
  verified host; the VS Code and TUI hosts shall still compile and keep their current behaviour
  where they share the RPC contracts.
- Security: the judge and content-generation calls shall keep the current no-tool-access
  posture of the ranking call (`toolAccess: 'none'`, `skill-ranking.service.ts:140-189`); skill
  writes stay behind the explicit Create action and installs behind the existing consent step.

## Stakeholders

| Stakeholder | What they need from this change | How they will judge it |
| ----------- | ------------------------------- | ---------------------- |
| User running onboarding setup | Only applicable skills offered, and a few worthwhile build suggestions | Pre-selected list contains no inapplicable or deprecated skill; no wall of empty drafts |
| User who pays for model usage | Control over which provider/model setup spends on | "Setup" row in Settings; analyze page and run pill show what was used |
| Team builder users | No regression in the shared review component | Team builder flow and specs unchanged |
| Maintainers debugging setup | To see why judging fell back | Stage and reason category in the result and in non-debug diagnostics |

## Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Judge call on a large stack (30 items, many candidates) exceeds the 75 s client timeout | MEDIUM | HIGH | Architect sets the stage deadlines and request size inside the 75 s budget in the plan; tester covers the timeout path (req. 1.5) |
| Fallback tests pass against a test double while the production text-only path still fails | MEDIUM | HIGH | Senior tester adds the production-path test of req. 1.4; reviewer rejects a fallback test that bypasses the result path |
| Shared review component change breaks the team builder | MEDIUM | HIGH | Senior tester runs the team-builder review and consent specs in the gate (req. 6.2) |
| Existing users who relied on the chat picker or a tab override for analysis, generation or guidance get the workspace's selected model instead (D7) | MEDIUM | MEDIUM | Analyze page shows the effective pair before the run (req. 2.2); reviewer checks the unset-path call-boundary test (req. 2.5) |
| Model cost grows per setup run (observed 0.74 USD for one failed ranking) | MEDIUM | MEDIUM | Architect reports the expected model calls per run in the plan; the Setup role controls the model |

## Design proposals (non-binding)

These came from round 0 and remain suggestions for the architect, not acceptance criteria.

- Log stage failures at `warn`, with one message per stage and category, so a maintainer can
  tell stage and category apart without enabling debug logging.
- Cover the fallback with both a fake-runner unit test and a fixture driving the real result
  adapter.
- Keep each verdict reason to one line; show rejected-candidate reasons behind a disclosure.
- Group generic `pattern` items into one build proposal, or mark them "no skill needed".
- Order the recommendation list by verdict, keeping score order inside each group.
- Store the Setup role the same way the existing background-model roles are stored.
- Generate build content with a tool-free model call from the evidence already supplied.

## Open questions

- Storage scope of the Setup role, global or per workspace (req. 2.10). Recommended: same as
  the existing background-model roles. Answer: architect.
- Deadline split between the decision stage, the normal stage and content generation within
  the 75 s budget. Answer: architect.

## Decisions

| Decision | Options | Evidence | Reversible |
| -------- | ------- | -------- | ---------- |
| With no valid install verdict, pre-select nothing (req. 4.2) | nothing; exact-name matches | D5 replaces pre-select-all with install-verdict pre-selection; the review found no support for exact-name matching as an applicability guarantee | Yes |
| The decision-model stage keeps the `decision` role; the Setup role governs the normal stage (req. 2.4) | Setup role for both stages; `decision` role for the decision stage | The decision role exists for that model (`provider-consumer-rows.ts:18-36`); D4 lists the stages the Setup role governs | Yes |
| An item may have install and build outcomes, and one decision may cover several items (req. 3.2) | exclusive one outcome per item; grouping mandated | The review rejected exclusive cardinality and mandatory grouping; finding 4 asks to resolve grouped builds versus per-item results | Yes |
| Manual drafting stays available on request for any item and when generation fails (req. 3.8, 5.7) | remove manual route with the automatic forms | D5 removes automatic forms and template content only; the parity rule keeps every other capability | Yes |

## Handoff

- Next specialist: software-architect
- Why: the facts and user decisions are known; the open question is the shape — how the judge
  and fallback replace the two-stage ranker, how the Setup role threads through four stages,
  and how the shared review component changes without breaking the team builder.

## Revision log

Round 1 (reviewer: Codex CLI lane, `task-description-review.md`; user decisions D3-D5):

1. Finding 1 — §1 rewritten: decision stage kept (1.1), items with zero or one candidate included
   (1.2), one verdict contract for structured and text-only answers (1.3), production-path
   text-only test (1.4), wider scenario list (1.8); scope bullet no longer allows "report why";
   the "decision model optional" open question removed.
2. Finding 2 — judge inputs and stable candidate identity (3.1), invalid/partial handling and
   retry (3.5), mixed provenance (3.11, 6.3), provider error and missing runner (1.6), registry
   failure and combined failure (4.4-4.6).
3. Finding 3 — §2 made binding for D3 and D4 (2.1-2.3), precedence (2.4), unset (2.5), run and
   resume identity (2.6, 2.7), partial or stale settings (2.8), provider failure after start
   (2.9), storage scope named by the plan (2.10); placement and scope moved to "Decided".
4. Finding 4 — removals bound per D5 (3.7, 3.8, 5.1); grouped builds versus per-item results
   resolved (3.2, Decisions); exact-name pre-selection dropped (4.2); manual drafting kept on
   request and on generation failure (3.8, 5.7); evidence-grounded content (5.2), invalid draft
   (5.4), explicit Create (5.3).
5. Finding 5 — `parity-inventory.md` gains the review's parity deltas, the registry-fact row,
   manual access to rejected candidates and a proof map with GAP marks; 6.1 requires tests for
   GAP rows.
6. Finding 6 — citations fixed in Context (ordering source `skill-recommendation.service.ts:199-216`,
   draft template `:43-45`, runner `:94-98`/`:162-173`, pending filter `:92-97`, aggregate
   `:190-198`), Out of scope (extractor `:41-43` behaviour), 5.3 (`:51-65`); inventory pointers
   fixed (see its rows).
7. Finding 7 — log level, test-double choice, reason length, disclosure, grouping, ordering and
   storage moved to "Design proposals (non-binding)"; observable stage/category and production
   tests kept in 1.4, 1.7 and 1.8.

Round 2 (reviewer: Codex CLI lane, `task-description-review.md` "Round 1"; orchestrator
decision D6):

- A (finding 2) — 1.6 now defines one combined result: valid decision-stage verdicts and their
  install pre-selection survive a failed normal call; remaining items show "not judged" with
  registry status and candidates. 3.5 and 3.6 point to 1.6, and 3.6 applies only after the 1.2
  fallback was attempted. 4.1 applies only when no item has a valid verdict. 1.8 adds the
  "decision partial, then normal fails" scenario.
- B (finding 3) — 2.3 and 2.4 bind D6: the Setup role governs the four setup operations and a
  chat-tab `overrideModel` does not apply; D6 added to "Decided"; the per-tab open question
  removed. Storage scope stays with the architect (2.10).
- C (finding 7) — the "without enabling debug logging" condition moved from 1.7 to the log-level
  item in "Design proposals (non-binding)".
- D (finding 8) — `parity-inventory.md` fixture row split: fixture compatibility proven by the
  harness typecheck; skills-step behaviour mapped to scoped Jest specs, so 6.1 does not depend
  on an e2e run.
- E (finding 9) — 3.10 marked as new behaviour, citing `skill-recommendation.service.ts:250-292`
  (only the best distinct recommendation per item is returned); the inventory row no longer
  claims every candidate is a selectable card today and owes new test coverage.

User decisions after round 2 (not a review round):

- D7 (finding 10) — 2.5 rewritten: with no Setup pair, all four setup operations use the
  workspace's active provider and its selected model; `tab.overrideModel ?? currentModel()` is
  no longer the unset route; the unset case gained a call-boundary check; D7 added to
  "Decided"; the generation/guidance risk row updated.
- D8 (finding 11) — 6.1 and the `parity-inventory.md` fixture row now require the analyze
  fixture's recommendation response to be typed with the shared RPC result type, so the harness
  typecheck fails on a missing judge field; D8 added to "Decided".
- Gate 1 status line added at the top.

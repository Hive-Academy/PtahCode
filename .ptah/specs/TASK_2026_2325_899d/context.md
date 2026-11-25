# Context — TASK_2026_2325_899d

## User request (requirement of record, 2026-11-24)

> this needs proper agentic and higher level thinking , so first things first , i remember we
> agree that if the decision model is not available we should be using a normal model call,
> secondly the provider and model used for setup should be available as an option and make sure
> its in our settings or setup page, lastly for the recommendations we need to have an ai judge to
> truely check what skills we need to install and what we need to build and reason about the list
> properly

Earlier report from the user, same session: in the setup wizard (onboarding), the skills
recommendation step offered a couple of good skills, then offered to create an empty shell for
many meaningless skills.

## Observed in the Electron dev app (main at d0af65d2f, 2026-11-24)

Evidence files: main checkout `.ptah/tmp/observe/` (`app.log`, `05-skills.png`, `06-unmatched.png`).

1. Empty shells. The architecture phase prompt asks for up to 30 `pattern` items
   (`libs/backend/agent-generation/src/lib/services/wizard/multi-phase-prompts.ts:159`).
   `SkillRecommendationService.recommendAnalysis`
   (`libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts:129`)
   searches skills.sh with each item name as one keyword. A pattern name does not match, so the
   item goes to `unmatchedItems`. `unmatched-stack-list.component.html:29` renders a
   `ptah-project-skill-draft` form for each unmatched `framework` or `pattern` item. The form
   content is a fixed template (`libs/frontend/onboarding/src/lib/analyze/project-skill-draft.component.ts`).
   A scratch workspace with 8 stack items and 20 patterns showed 20 draft forms.
2. Side effect. When the project profile already has 30 items, the extractor drops all pattern
   items of the next phase (`stack-summary.extractor.ts:41`), so large projects show no forms.
3. Ranking failed on every run:
   - Decision model: `[SkillRankingCaller] No valid ranking answers`, then
     `[SkillRanking] Invalid decision-model output`
     (`libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:131`).
   - A fallback to a normal model call ALREADY EXISTS (`session-model`,
     `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts`, the
     `runner.run({ operation: 'generate-skills', ... })` block). It did not work:
     `Session model unavailable: Error: Skill ranking timed out`. The query used model `default`,
     ran 2 turns, cost 0.74 USD, wrote 1697 output tokens, and returned
     `hasStructuredOutput: false`; then `Could not parse result text as JSON`.
   - Result: `rankedBy: heuristic` (install count). The RPC took 26 s.
4. Recommendation quality. With heuristic order, the page recommended and pre-selected skills
   that are not applicable: `n8n Code Javascript` for JavaScript, a Salesforce diagram skill for
   Mermaid, `Baoyu Electron Extract` for Electron, two Angular skills whose descriptions say
   DEPRECATED, a Salesforce LWC skill for Jest. All 22 recommendations were selected by default.

## The three requested outcomes

1. When the decision model is not available, a normal model call must do the work. Today the
   fallback exists and fails (deadline, no structured output). It must work.
2. The provider and model that setup (onboarding analysis, ranking, judge) uses must be a user
   option in the settings page or the setup page. Existing settings code for model assignments:
   `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts`,
   `decision-model-row.*`.
3. An AI judge must examine the detected stack and the registry candidates, then decide which
   skills to install and which to build, with a reason for each decision. It replaces the
   one-form-per-unmatched-item behavior.

## Repository rules for all agents

- Work only in the worktree `/home/amun/ptah-extension/.claude-worktrees/skill-judge`.
- Electron first. The renderer is `apps/ptah-extension-webview`. No feature work for the TUI or
  VS Code hosts; only compatibility changes for shared contracts.
- Subagents and CLI lanes do not run `npm run verify` or `nx`. Focused checks only:
  `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
  `npx tsc --noEmit --project <tsconfig>`, `npx eslint <changed files>`. Never run `build`,
  `serve`, `dev`, `e2e` or workspace-wide checks. The coordinator runs the gate.
- Only the coordinator commits and pushes.

## Gate 0.1

- Preference source: none found in memory (`preference unknown`); default `enabled`.
- `ptah_route_decide` timed out (pre-flight skipped, gate-0.1 call failed); rule tables apply.
- Lanes with confirmed room: `codex`, `Ollama Code`. `claude`, `grok`, `antigravity` unknown.
  `kimi code` at limit.
- Approval mode: `lane-review` for document Gates 1 and 2. Gate 1.7 (design) and any removal go
  to the user.

## Lane limits (this run)

- 2026-11-25 ~11:50Z: kimi code (`pc-7594dcab-a859-41a0-8e8b-e8df5dba7d25`, family kimi-code) AT LIMIT
  (usage limit hit, window unknown, reset unknown). Seen on resume of G-Skills-Draft-And-Fs (its lane
  371af650 left a skeleton report). Skip kimi for the rest of this run; re-check only at the next
  Gate 0.1 or on user request. Fallback for kimi batches: codex / antigravity, then Ollama Code.
- 2026-11-25 11:57Z: ptah_agent_list shows the kimi 5-hour window at 100%, reset 2026-11-25 15:43 UTC.
  Re-check kimi at the P2 start (after 15:43Z).

- 2026-11-25 13:13Z: grok (cli grok) is not signed in (auth, not a limit). Skip it this run.

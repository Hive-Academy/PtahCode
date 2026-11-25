# G-Fixtures report (wave W2)

## Files changed

- `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-analyze.fixtures.ts`
  - Added a type-only import from `@ptah-extension/shared` (`ModelPair`,
    `SkillJudgeResult`, `SkillShEntry`, `StackSummaryItem`,
    `WizardGetSetupModelResult`, `WizardRecommendAnalysisSkillsResult`,
    `WizardSetSetupModelResult`). Type-only, per the harness rule that a value
    import of `@ptah-extension/shared` breaks the ESM bridge
    (`marketplace.fixtures.ts:23` precedent).
  - New module constants: `SETUP_PAIR` (`anthropic` / `claude-sonnet-4-5`),
    three `StackSummaryItem`s, `NEST_BLUEPRINT_SKILL`, `SKILL_JUDGE_RESULT`.
  - `wizard:recommend-analysis-skills` now applies
    `satisfies WizardRecommendAnalysisSkillsResult` directly to the value and
    includes `analysisPair`, a `judge`, one ranked `skills` row, the detected
    stack items and a `searchFailures` entry (`summarySource: 'structured'`).
  - New typed responses `wizard:get-setup-model`
    (`satisfies WizardGetSetupModelResult`, state `set` with `SETUP_PAIR`) and
    `wizard:set-setup-model` (`satisfies WizardSetSetupModelResult`
    `{ committed, state, commitSeq: 1 }`), registered as plain fixture-map
    entries exactly like the neighbouring `wizard:*` keys; overrides still win
    because `...overrides` spreads last.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts`
  - `settingsGetResolver` now lists the Setup keys `setup.provider` and
    `setup.model` in the same if-branch style as `skills.enhancement.*`. Both
    answer the registered default `''` (Unset state). Without the branches the
    fall-through returned the `ptahCliAgents` value for these keys.

## Judge fixture shape (plan requirements)

- Dual-verdict item: `item-nestjs` has one `install` outcome (decision stage)
  and one `build` outcome (`prop-e2e-guard`, normal stage); `judgedBy: 'normal'`.
- Shared candidate with opposite per-item verdicts: `cand-nest-blueprint` is
  `eligible: true` and installed for `item-nestjs`, and rejected with a reason
  for `item-domain-modules`.
- Same name, different source: `cand-nest-blueprint`
  (`vercel-labs/skills`) and `cand-nest-blueprint-alt`
  (`anthropic/claude-skills`) both named `Nest Blueprint`.
- Not-judged coverage for the new UI row: `item-guardrails`
  (`registry: 'search-failed'`, `judgedBy: 'none'`), consistent with the
  `searchFailures` entry; `method: 'mixed'`.
- Id and count consistency: every `candidateId`/`candidateIds` exists in
  `candidates`; `proposalId` exists in `proposals` and its `itemIds` reference
  real items; `counts { decision: 1, normal: 1, notJudged: 1 }` match the three
  items' `judgedBy`; stage `itemsJudged` (2 decision, 1 normal) match the
  outcomes' stages.

## Plan items done

- Plan line 207-209 (component 10, binding): `satisfies` applied to the
  recommendation value; typed `wizard:get-setup-model` / `wizard:set-setup-model`
  responses added (with `commitSeq`, per the committed W1 type
  `WizardSetSetupModelResult` in `rpc-skill-judge.types.ts:130-135`); Setup keys
  added to `settings.fixtures.ts`. Batch table row: plan line 289.

## Check commands and results

- `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json`
  — PASS (exit 0, no diagnostics).
- `npx eslint <the 2 changed files>` — PASS (exit 0). One warning:
  `settings.fixtures.ts:894 max-lines (file has 795 lines, max 700)`. This
  warning pre-exists: the file was already over the 700-line limit at HEAD
  (1,012 lines before this batch; this change adds 9).
- Playwright/e2e: not run, per the brief.

## Decisions

1. Setup pair values (`anthropic` / `claude-sonnet-4-5`). Options: the design
   spec's example pair ("Anthropic / claude-sonnet-4-5", design-spec.md:23) vs
   the `config:models-list` ids. Evidence: the design spec names this pair for
   the Setup card, and it is consistent with the models the analyze fixture
   already lists. Reversible: constants in one file.
2. `settings.fixtures.ts` answers `''` for both Setup keys. Options: `''`
   (Unset) vs a stored pair. Evidence: the keys' registered default is `''`
   (plan line 66) and the neighbouring `skills.enhancement.*` branches answer
   their defaults; specs needing a set pair can override `settings:get` or the
   wizard RPC. Reversible: two return values.
3. `wizard:set-setup-model` is a static answer (committed `SETUP_PAIR`,
   `commitSeq: 1`). Options: static value vs a params-echoing resolver. Evidence:
   this file registers every RPC as a static value; a stateful resolver belongs
   to `settings.fixtures.ts`'s pattern and no spec here needs read-back yet.
   Reversible.
4. `skills` carries the one install candidate as a ranked row. Options: keep
   `skills: []` vs mirror the installed candidate. Evidence: plan line 139 —
   "`skills` as Install candidates"; an install verdict with an empty ranked
   list is a state the backend does not produce. Reversible.

## Open items / needed changes in other groups

- None blocking. Later waves that drive the analyze-skills UI can override
  `'wizard:recommend-analysis-skills'`, `'wizard:get-setup-model'` or
  `'wizard:set-setup-model'` through the existing `overrides` spread.
- The pre-existing `max-lines` warning on `settings.fixtures.ts` is out of
  scope for this batch (report, not fix).

## Extra reads (outside my 2 write files)

- `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts` (types, W1).
- `libs/shared/src/lib/types/rpc/rpc-setup.types.ts:180-280`
  (`WizardRecommendAnalysisSkillsResult`, `StackSummaryItem`).
- `libs/shared/src/lib/types/rpc.types.ts:1-60` (`SkillRecommendation`).
- `libs/shared/src/lib/types/rpc/rpc-agents.types.ts:93-125` (`SkillShEntry`).
- `libs/shared/src/lib/types/rpc/rpc-auth.types.ts:693-694` (Setup key metadata).
- `libs/shared/src/index.ts` / `rpc.types.ts` export chain (barrel reachability).
- `onboarding-proposal.fixtures.ts` (satisfies precedent), `onboarding-ready.fixtures.ts`,
  `onboarding-analyze-visual.e2e.spec.ts` (fixture consumers), `marketplace.fixtures.ts`
  (type-only import rule, `RpcFixtureResolver`).
- Plan `implementation-plan.md` (lines 195-224, 238-240, 289, 556-649 by grep),
  `batches.md` (G-Fixtures row), `design-spec.md` (Setup pair example, section 12).

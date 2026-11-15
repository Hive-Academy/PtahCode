# Review — Phase 4 step 2 (retire verification roles)

Reviewer: independent lane, read-only. Scope: `git diff HEAD` plus the four staged template
deletions in `.claude-worktrees/phase4-step2-verify-roles` (60 files). The local `main` ref is
behind `HEAD` (merge-base is `31f7d869f`, `HEAD` is the #1307 merge), so `git diff main` also
shows step 1. This review uses `git diff HEAD`, which is the step 2 change only.

## Verdict: REVISE

One Major finding (M-1) gives callers of `ptah.orchestration` an agent name that does not
exist. The other findings are Minor or Nit. The core routing, effort and resolver changes are
correct and match P4-S1-1 and C2-1..C2-6.

## Findings

### Major

**M-1. `getNextAction` returns phase kinds as agent names.**
`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts:57`
sets `qa: ['tests', 'review', 'visual-review']`. Lines 281-284, 298-301 and 314-317 return
`{ action: 'invoke-agent', agent: agents[0] }`. For the `qa` phase the caller now gets
`agent: 'tests'`. No agent, template or subagent type has that name. A model that follows
the result calls `Task { subagent_type: 'tests' }` and fails. The spec at
`orchestration-namespace.builder.spec.ts` pins `expect(action.agent).toBe('tests')`, so the
spec accepts the defect. The `NextActionResult` type (`code-execution/types.ts:2030-2040`)
documents `agent` as "Agent to invoke".
Fix (pick one):
1. Add an optional `phaseKind` field to the result (or an `'invoke-phase'` action), and return
   `{ action: 'invoke-phase', phaseKind: 'tests' }` for `qa`. Update the type, help text and spec.
2. Or keep `agent` for real agents only and add `phaseKinds: ['tests', 'review', 'visual-review']`
   for `qa`, with `agent` omitted.

### Minor

**m-1. Effort on resume ignores the stored phase kind.**
`agent-process-manager.service.ts:1027-1031` passes `phaseKind: request.phase?.kind`. The
record at lines 1067-1071 falls back to `previous?.phaseKind` on resume. A resumed `review`
lane without a new `phase` therefore uses the name rule, not the phase rule, while its record
says `phaseKind: 'review'`. Fix: compute `const phaseKind = request.phase?.kind ??
previous?.phaseKind` once and use it in both places. Add one spec for a resumed lane.

**m-2. The Claude adapter keeps a name-only reviewer check.**
`cli-adapters/claude-cli.adapter.ts:538` calls `isReviewerOrTester(input.role?.name)` without
the phase kind. It matters only when the lane effort is undefined (for example, an
`implement` lane with role `custom-reviewer` and no chat effort). Then the adapter adds
`medium`, which goes against "phase kind wins". Fix: pass the phase kind into
`ClaudeCliCommandOptions` and call `isReviewerOrTester(name, phaseKind)`, or remove the
fallback because `reasoningEffort` already carries the resolved value.

**m-3. The validator does not enforce the step 2 alias rows.**
`scripts/validate-orchestration-skill.ts:126-130` and `742-756` check alias rows only for
`IMPLEMENT_ALIASES`. The four new rows at `agent-catalog.md:123-126` have no check. A later
edit can delete them and `validate-skill` still passes. Fix: replace `IMPLEMENT_ALIASES`
with a slug-to-kind map built from (or equal to) `RETIRED_ROLES`, and match
`Retired; alias of .*<kind>` for each entry.

**m-4. Some reviewer rules from the deleted templates have no destination and no drop reason.**
`step-2-learned-differences.md` does not list these rules, and `phases/review.md:15-21`
does not contain them:
- "Read whole files, not only changed lines" (both reviewer templates, Inputs 1).
- "A passing check that does not exercise the new behaviour is not evidence for that
  behaviour" (code-logic-reviewer, Inputs 6).
- "When you cannot decide between two severity levels, take the higher one" (both).
- The wizard-filled `LLM:REVIEW_FOCUS` section (repository-specific review focus). No
  template now carries `REVIEW_FOCUS`, so the wizard no longer generates any repository
  review focus.
Fix: add the first three as one sentence each to `phases/review.md` Method or Reviewer
stance (both copies). Add a row to `step-2-learned-differences.md` for `REVIEW_FOCUS` with
the drop reason (project guidance and nearby implementations replace it), as step 1 did for
`FRAMEWORK_CONVENTIONS`.

**m-5. Follow-up F-S2-1 is recorded only in the plan and a batch result.**
C2-2 makes reviewer-family separation for `visual-review` a follow-up. It appears only in
`step-2-plan.md:426` and `batch-2-B-result.md:23`. Fix: add F-S2-1 to `decisions.md` or the
follow-up list in `context.md`, so that it is not lost after merge.

### Nit

- **n-1.** Stale doc comment: `lane-spawn-policy.ts:364-366` still says a reviewer is a role
  name that ends in `-reviewer` or equals `senior-tester`. Add "a `review`, `visual-review` or
  `tests` phase kind wins; the name rule applies only when no phase kind is given".
- **n-2.** Stale source pointer: `libs/shared/src/lib/types/task-spec.contract.ts:115` cites
  `senior-tester.template.md:528`, which this change deletes. Point it at `phases/tests.md`.
- **n-3.** Dead code: `content-generation.service.ts:931-952` (`REVIEW_FOCUS` topic) and the
  reviewer cases in `generated-section-validator.spec.ts:574-595` now serve no template.
  Keep them only if released apps need them, and then say so in a comment. Otherwise remove
  them in step 4 cleanup.
- **n-4.** Format churn: Prettier `--write` on whole files reformatted unrelated code in
  `agent-spawn-environment.service.ts`, `agent-process-manager.service.ts:736-752`,
  `lane-spawn-policy.ts` (refusal and argv helpers), `setup-rpc.handlers.ts:980-1075`,
  `wizard.types.ts`, `recommendations.ts`, the catalog and crucible tables. Behavior does not
  change, and lint-staged applies the same format, so no fix is required. Mention it in the PR
  body so reviewers can skip it.
- **n-5.** The new resolver spec proves that a step 2 slug is refused with the correct phase
  hint. The custom same-name spec (`agent-role-resolver.service.spec.ts:293-319`) still uses
  only `backend-developer`. The logic is slug-generic, so this is acceptable. One
  `senior-tester` case would make the step 2 intent explicit.
- **n-6.** Info, out of scope (C2-6): `team-leader.template.md:376, 382, 453` still say
  "visual-reviewer". Step 3 owns that file.

## What I checked

1. **Capability loss.** I read `git show HEAD:` of `code-style-reviewer` and
   `code-logic-reviewer` templates in full and compared them with `phases/review.md`. The five
   logic questions, five style questions, hunt lists, inline hygiene block, suppression
   blocker, boundary validation and disposal rules are present. The compositor-only animation
   rule is in `phases/implement.md`, not in review (acceptable). Gaps are in m-4. For
   `senior-tester` and `visual-reviewer` I checked `phases/tests.md` and
   `phases/visual-review.md` (runner reuse, behavioral seams, escalation file, six viewports,
   dark and light, states, WCAG, nearby-implementation expectations). I found no gap there.
   The "Base URL" invocation input of the old catalog row is gone, but the phase requires a
   running Electron app, so this is acceptable.
2. **Effort rule.** `isReviewerOrTester(roleName, phaseKind)` returns the phase result when a
   phase kind exists and the name rule otherwise. `resolveLaneEffort` passes it. The only
   spawn path (`agent-process-manager.service.ts:1027`) passes `request.phase?.kind`. Callers
   with no phase (provider CLI lanes, platform-cli, cli-engine) keep the old name behavior,
   and the spec covers `custom-reviewer` and `senior-tester` without a phase. Gaps: m-1, m-2.
3. **Resolver.** The message uses `phaseKindForRole(role)` (C2-3). A retired slug is refused
   only when `isRetiredAgent` proves an unchanged wizard file. `RETIRED_ROLES` entries match
   `ROLE_PHASE_ALIASES`.
4. **Catalog removals.** `AGENT_CATALOG`, setup RPC fallback list, allowlist, icon table and
   `agent-pack-manifest.json` drop the four slugs. `roleIconFor` falls back to `Bot` and the
   spec covers all seven retired slugs. No production code still keys on the four slugs
   except the alias table, the name fallback and a harness-sync comment. Visual review keeps
   its browser requirement through `machineCapabilities: [browser]` and
   `phase-definition-resolver.ts:47`, so the removed "visual-reviewer does not delegate" rule
   is replaced by capability routing.
5. **Mirror parity.** `cmp` of both `commands/orchestrate.md` and both `agent-lanes/SKILL.md`,
   and `diff -rq` of both `orchestration` and `tribunal` trees: identical. The validator still
   reads retired roles from the census and rejects them in phase files and the active flow.
   Gap: m-3.
6. **Guard spec.** The template count goes from 11 to 7. `REVIEWER_STANCE` and the
   visual-reviewer non-delegation entry leave `ROLE_PARTIALS` and `NON_DELEGATING_ROLES`. The
   hygiene check keeps the software-architect reference block, its 7-line length and the
   "no `ENGINEERING_HYGIENE` partial" rule. Only the byte-copy check for the deleted
   code-style template is removed, which is correct because no other role copies the block.
   `ui-ux-designer` stays non-delegating.
7. **Manifests, docs, personal data.** `content-manifest.json` drops the four templates and
   updates the hash. Docs counts (7 templates), phase-kind wording and the origin-store
   statement match the code. A search of the added lines for home paths, user names, e-mail
   addresses and organization domains found nothing.
8. **Scope.** `hard-constraints.ts`, `.claude/agents/**`, `.codex/**`, `.opencode/**` and
   `team-leader.template.md` have no change.

I did not run Jest: the lane shell refused the command without approval. Test evidence comes
from `batch-2-B/C/D-result.md` (focused Jest, `tsc`, `eslint`, `validate-skill`,
`manifest:check`, all passed). The coordinator gate must still run the official role census
(batch D could not run it).

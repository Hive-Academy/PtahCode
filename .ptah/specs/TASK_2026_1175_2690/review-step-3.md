# Review: Phase 4 step 3 (definition roles)

## Verdict

**REVISE.** One blocking finding: the edit tool corrupted UTF-8 text (mojibake) in four shipped files.
All other findings are minor or notes. The retirement logic itself is sound.

## Findings

1. **blocking - Mojibake (`â€”`) introduced in shipped orchestration files.**
   - Files and lines:
     - `plugins/ptah-core/commands/orchestrate.md:21,30,56`
     - `.claude/commands/orchestrate.md` (same 3 lines)
     - `plugins/ptah-core/skills/orchestration/references/agent-catalog.md:117-119,127-129`
     - `.claude/skills/orchestration/references/agent-catalog.md:117-119,127-129`
   - Evidence: `git show HEAD:<file> | grep -c "â€"` gives 0 for all four. The working copy gives 3, 3, 6 and 6.
     The `git diff HEAD` pairs show `—` on the removed side and `â€”` on the added side.
     So the batch rewrote em dashes as double-encoded text, and also changed lines that had no wording change
     (`orchestrate.md:21`, `:30`, `:56`).
     The `.claude/skills` copy is byte-identical to the plugin copy, so both copies are wrong.
   - Fix: replace every `â€”` with `—` in the four files. Then run
     `git diff HEAD -- <file> | grep -c "â€"` (expect 0).
     The only changed lines in `orchestrate.md` must be the "Active agent" line.
     Then re-run `cmp` on the mirror pairs.

2. **minor - Stale docs card: "See all 7 built-in agents".**
   - `apps/ptah-docs/src/content/docs/agents/index.mdx:70`.
   - Evidence: `built-in-agents.md` now lists one active agent (`team-leader`).
   - Fix: change to "See the built-in agent and the phase workflow."

3. **minor - Garbled sentence in the phase workflow section.**
   - `apps/ptah-docs/src/content/docs/agents/built-in-agents.md` (section "Phase workflow", first sentence):
     "A feature can run through `plan` maps to optional `research` and `design` maps to `architecture` maps to ..."
     It is not grammatical and it reads as a wrong claim.
   - Fix: write a plain arrow chain such as
     `plan` -> optional `research`/`design` -> `architecture` -> `team-leader` -> `implement` -> `tests` and `review`.

4. **minor - `taskSpecAudienceFor('project-manager')` now returns `'specialist'` (was `'coordinator'`).**
   - `libs/backend/agent-generation/src/lib/services/template-partial-resolver.ts:80`
     and `template-partial-resolver.spec.ts`.
   - Evidence: `TASK_SPEC_COORDINATOR_TEMPLATES` lost `project-manager`.
   - Effect: a user-authored template named `project-manager` in user template storage, rendered by the wizard,
     now gets the specialist task-spec block. This block forbids task-ID allocation and `task.md` edits.
     The block is correct for the retired role as a custom agent, but it is a silent change for a user who kept
     a custom PM template.
   - Fix: this is acceptable by plan. Add one line in the PR notes or the docs "Customizing" section.
     The spec assertion is kept and flipped, not removed, so no coverage is lost.

5. **minor - Disallowed-tools policy is gone for same-name generated agents.**
   - `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts`
     (`SUBAGENT_DISALLOWED_TOOLS` has only `team-leader`).
   - Effect: a wizard re-render of a custom same-name agent no longer writes `disallowedTools`.
     Existing generated files keep their old line. `hasSubagentToolPolicy` returns false for them (the
     "unknown type" path). The new spec asserts `formatDisallowedToolsFrontmatter('technical-content-writer')` is `undefined`.
     This matches the plan, and the test keeps its meaning.
   - Fix: none required. Note in the PR body.

6. **minor - `template-sharing.guard.spec.ts` lost the hygiene-block reference test.**
   - Removed: the 7-line `Engineering hygiene` to `Runtime cost` block check, the `NON_DELEGATING_ROLES` case
     for `ui-ux-designer`, and the per-role partial map for six roles.
   - Evidence: the six templates are gone, so these tests have no subject. The hygiene rules moved to
     `phases/architecture.md` (Method, paragraphs 2-3). A "partial stays absent" guard remains.
   - Fix: none required. The old comment about released apps that reject unknown `STATIC:` ids is also dropped;
     the remaining guard for the absent partial still protects them.

7. **note - Retired-role guards are agent-kind only.**
   - `retired-role-guard.ts:44` (`kind === 'agent'`), `clone-action-gating.ts:38-41` (`clone.kind === 'agent'`).
   - Evidence: both check `kind` before `isRetiredRole`.
     So skill clones named `ui-ux-designer` and `technical-content-writer` keep working. The skills stay in
     `popular-skills.md` and under `plugins/ptah-core/skills/`.
     `isRetiredRole` has no other call site that takes a skill name (`phase-plan.ts:311`, `retired-agent-origin.ts:17`,
     `decision-model-task-kind-classifier.ts:41` take role slugs).
   - Fix: none. A test that pins a skill clone with a retired name would harden this. Optional.

8. **note - E2E harness fixtures still use `software-architect` as an agent id.**
   - `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate.fixtures.ts:54,66,97`
     and `onboarding-analyze.fixtures.ts:93`.
   - Effect: these are data for the onboarding generation UI. They are the same shape as the step plan's
     "historical fixtures" class, but they model an active catalog row. If they feed screenshots, the UI shows a
     role that the catalog no longer offers.
   - Fix: switch to `team-leader` in a follow-up, or add a one-line comment that they are legacy data.

9. **note - Stale mirrors in the repository.**
   - `.claude/agents/*.md` and `.opencode/agent/*.md` for the six roles are still tracked.
   - Evidence: the plan keeps tracked generated agents (U-D12), and `agent-pack-manifest.json` no longer lists
     them. The manifest now lists only `team-leader.md`. Consistent. `content-manifest.json` drops the four deleted
     template names it listed; the other two were not listed at HEAD (diff shows four removals).
   - Fix: none.

## Checked and clean

- `RETIRED_ROLES` has six step-3 rows. The `ROLE_PHASE_ALIASES` map at `retired-roles.ts:19-32` already held all six.
  Each row's `phaseKind` matches the plan. `isRetiredRole('team-leader')` is false in the spec.
- Runtime: no non-spec source file spawns, recommends, generates or allowlists one of the six as an active agent.
  Remaining hits are alias maps, event-type doc comments and the docs alias sentence.
  The `agent-recommendation` catalog, `template-storage`, `setup-rpc.handlers` and `core.types` rows are all removed.
- `orchestration-namespace.builder.ts`: `planning` maps to `plan`, `design` maps to `architecture`, and a new
  task returns `invoke-phase` with `plan`. The `team-leader` fallback is reached only in the implementation phase.
  A legacy `.orchestration-state.json` with `currentAgent: 'project-manager'` is only stored text and still loads.
- Frontend: icons for the six roles are removed from `agent-marks.ts`. The plan requires a generic avatar fallback
  for legacy events, and no source file looks up the old keys.
- Phase files: `plan`, `architecture`, `research`, `docs` and `design` each gained 1-2 paragraphs.
  `architecture.md` carries the hygiene, command-safety, external-call and test rules, and inventory-only mode.
  `research.md` carries consolidation of deferred items (source trace, dedupe by issue, scan for gaps).
  `step-3-learned-differences.md` has a verdict per template line range. Drops are limited to wrapper metadata
  and repository-specific facts.
- Skill copies: all five phase files, `agent-catalog.md` and `orchestrate.md` are byte-identical between
  `plugins/ptah-core/` and `.claude/` (`cmp`). This does not clear finding 1, since both copies share the same defect.
- Tests: expectations were flipped to match the new catalog (`toHaveLength(1)`, `['team-leader']`,
  `recommendedIds` equals `['team-leader']`). Retired-role names are added to "not offered" lists in
  `agent-recommendation.service.spec.ts` and `setup-rpc.handlers.spec.ts`. Fixtures moved to `team-leader` only where the
  test subject was "any template" (example ids, `humanizeName`, `loadTemplate`). No test meaning changed.
- Manifests: `agent-pack-manifest.json` has no entry for a deleted file. `content-manifest.json` has no entry for a
  deleted template. Hash and timestamp are updated.
- Docs: no markdown link points at a deleted page or template. The alias sentence in `built-in-agents.md` lists
  all six slugs. Skill rows in `popular-skills.md` are intact.
- `scripts/validate-orchestration-skill.ts`: the six slugs left the required-active list. The `team-leader` case stays.

## Not checked

- No Jest, `tsc` or lint run (read-only brief). I did not execute the changed specs.
- `team-leader.template.md` (known pending).
- `libs/backend/skill-synthesis` skill-trigger paths beyond the `isRetiredRole` call sites.
- Rendered docs site and Electron UI (no screenshots).
- Role-census counts against the plan's ceilings (the tool was not run).
- Full text of `step-3-learned-differences.md` for every row, and the local-clone and history layers it cites.

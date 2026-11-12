# Plan review

Verdict: REVISE

## Findings

1. **Blocking. The census source bucket rises.** The plan adds `batch: 'team-leader'` and
   `completion: 'team-leader'` to `DEFAULT_ROLE` (`libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:43-54`).
   Each line names a retired role. `check-role-census.ts:167-180` compares each bucket alone, and
   `baseline.json:21-24` gives source = 201. The plan says only that B5 lowers the skills bucket.
   The plan must (a) state that new `DEFAULT_ROLE` lines add 2 to source and add the same lines to
   the test bucket if specs name a role, and (b) name an equal reduction in the same bucket, or
   store the two new defaults without a role name (for example a separate map that is empty for
   `batch` and `completion` and routes them to the orchestrator). Also run `role-census:lint`
   before B5 and record the result.
2. **Serious. New skill files can raise the skills bucket.** `check-role-census.ts:25` puts
   `.claude/skills/**` and `plugins/*/skills/**` in `skills` (466 lines, 35 files). The plan
   writes 12 new `phases/*.md` in two copies, plus a "compatibility appendix". The discipline
   table of the plan itself names roles ("from project-manager", "from team-leader Mode 1").
   Every such line counts twice. The plan must forbid role names in `phases/*.md`, and must move
   (not copy) the roster rows into the appendix. The plan must give a line budget:
   removed lines from the five merged files and the flows must be larger than the lines kept in
   the appendix, counted in both copies. Run the census check at the end of B3 and B4.
3. **Serious. The B5 verify command is invalid.** `npm run verify -- -p @ptah-extension/shared @ptah-extension/lane-routing`
   uses a space. `scripts/verify.mjs:46-50` splits only on a comma and `-p` takes one value per flag.
   Use `-p @ptah-extension/shared,@ptah-extension/lane-routing`. The names themselves are correct
   (`libs/shared/project.json:2`, `libs/backend/lane-routing/project.json:2`).
4. **Serious. The `validate-skill` target on lane-routing is not defined and is not scoped.**
   `libs/backend/lane-routing/project.json` has `build`, `test` and `typecheck` only. The script is
   `scripts/validate-orchestration-skill.ts` (`package.json:46`) and reads the plugin and `.claude`
   folders and `libs/backend/agent-generation/templates`. The target needs explicit `inputs`
   (both skill folders, the script, the templates) or it caches a stale pass. Better: add the
   target to a project that owns `scripts/` (or run it through
   `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill`, which the
   CLAUDE.md allows). The plan must choose one and state the cache inputs.
5. **Serious. B3 and B4 verify nothing about skill text.** Both use
   `npm run verify -- -p @ptah-extension/lane-routing`, which runs lint, test and typecheck of a
   library that B3 and B4 do not touch (probably a cache hit). The correct gate for B3 is
   `npm run validate-skill` under the lock plus `role-census:lint`; for B4 it is the new mirror
   check. Use `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill`.
6. **Serious. The validator is not run in CI and runs in the hook only for `.claude/skills/`.**
   `.husky/pre-commit:20-30` runs `validate-skill` only when a staged path starts with
   `.claude/skills/`. `grep` of `.github` finds no `validate-skill` step (`ci.yml:95-98` runs
   only `role-census`). A plan that changes only `plugins/ptah-core/skills/**` (B3 alone) skips the
   hook, and the new mirror check never runs in CI. The plan must add the plugin path to the hook
   pattern and add a CI step (or an Nx target that CI already runs), otherwise the "byte check keeps
   the copies equal" claim has no enforcement.
7. **Serious. A run-time process can write `.claude/skills`.** The plan says "no copy command was
   found". `libs/backend/harness-sync` (`plugin-origin-gate.ts:44-60`, `claude-target.ts`,
   `copy-engine`) copies plugin skills into `.claude/skills`, `.agents/skills`, `.github/skills` and
   `.cursor/skills` of a workspace, and owns them through a manifest. `.gitignore:207-210` makes
   `.claude/skills/` tracked in this repository. The plan must state whether harness-sync can
   overwrite or quarantine the tracked mirror in the developer workspace, and that the mirror in git
   stays the reference for the byte check. Add this to Risks. (Also `.gitattributes` forces LF, so a
   byte check is safe if the validator reads Buffers; normalize CRLF anyway for a Windows checkout
   with `core.autocrlf`.)
8. **Serious. The blast radius of the move of `PHASE_KINDS` is incomplete.** The plan names only
   `route-decide-args.schema.ts`, `phase-plan.ts` and `index.ts`. Found in code:
   - `libs/backend/lane-routing/src/index.ts:62` re-exports `PHASE_KINDS`. Keep this export.
   - `libs/backend/lane-routing/src/lib/pipeline/tier-effort-policy.spec.ts:1,35,41` imports
     `PHASE_KINDS` from `../contracts/route-decide-args.schema`. Keep a re-export there or change the
     spec. The spec is not in any batch.
   - `libs/backend/lane-routing/src/lib/ranking/hard-constraints.ts:22,27,327` derives `PhaseKind`
     from the schema file and uses `PHASE_KINDS.includes`. Not in B2's write set.
   - `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:410-430` `taskKindFor` has an exhaustive
     `never` default. `batch` and `completion` must be mapped (plan states only `DEFAULT_ROLE`).
     The mapping to `OutcomeTaskKind` is a decision the plan must state.
   - `libs/backend/lane-routing/src/lib/pipeline/tier-effort-policy.ts:20` maps kinds to tier rules
     (R1-R5). New kinds fall to R3-R5 by shape. State the intended tier and add a spec case; the
     file is not in B2's write set.
   - `libs/backend/lane-outcomes/src/lib/task-kind-mapping.ts:22-23` mirrors phase kinds by role
     name (no `batch`, no `completion`). It does not break, but the comment says it mirrors
     `taskKindFor`. Add it to B2 or note it as deliberate.
   - `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tools.ts` and
     `route-tools.spec.ts:47` build the `ptah_route_decide` schema from the Zod enum and assert
     `visual-review`. Add a check that both new kinds appear; the tool description (`route-tools.ts:117`)
     may list kinds.
   - `libs/shared/src/index.zod-free.spec.ts` forbids Zod in the shared contract files. The plan keeps
     Zod in lane-routing, which is correct; state it and add the new file to that guard.
   - The renderer and `apps/` have no use of `PHASE_KINDS` or `document-review`. No change there.
   - `contracts.spec.ts:151-162` and `phase-plan.spec.ts` have no fixed count of 10. No fixed-count
     test was found; the "ten" claim only holds for the `Record<PhaseKind, string>` at
     `phase-plan.ts:43`.
9. **Serious. The resolver parser is not named, and a second tool-profile concept is invented.**
   - Repository code already parses frontmatter with `gray-matter` and must pass
     `{ language: 'yaml' }` to avoid a module cache bug
     (`libs/backend/task-specs/src/lib/task-frontmatter.ts:104`;
     `libs/backend/output-styles/src/lib/output-style-frontmatter.ts:27-40`). `yaml` ^2.9.1 is also a
     dependency (`package.json:143`). The plan says only "parse frontmatter ... with Zod". It must name
     `gray-matter` with `MATTER_OPTIONS`, and add the dependency to the lane-routing `package.json`
     if lane-routing has one (the lib has none; check the Nx dependency check).
   - Tool-profile concepts already exist: `disallowedTools` deny lists per agent type
     (`libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts:1-40`) and
     `agent-permission.types` in shared (`libs/shared/src/index.ts:42`). The plan's
     `toolProfile.{allowed,denied,approval}` with `'read-only' | 'workspace-write' | 'host-gated'` is a
     third vocabulary. The plan must show how it maps to those two (same tool-name forms, same deny
     semantics, bare `*` forbidden) or reuse them.
   - Failure behavior: "fail closed with a typed error" needs the error shape. Use the existing
     pattern of a pre-formatted, path-free message (`output-style-frontmatter.ts:1-12`).
10. **Moderate. Module boundaries are correct but not shown.** `libs/shared` has tags
    `scope:shared,type:util` (`project.json:6`); lane-routing has `scope:extension,type:feature` and
    already imports `@ptah-extension/shared` (`route-decide-args.schema.ts:2`; `scope:extension` may
    depend on `scope:shared`, `eslint.config.*:285-286`). The graph stays acyclic. The plan cites only
    the import. Add the tags as evidence. Put the interface in shared as types and the `as const` array
    (no Zod) to keep the zod-free guard (finding 8).
11. **Moderate. The merge table is complete but imprecise.** Hunks verified by the diff: SKILL.md
    (2 hunks), agent-catalog.md (3 hunks: prompt line, table rows, "Skill routing" section),
    git-standards.md (1), strategies.md (3), task-tracking.md (1). The table covers all. Imprecise:
    - agent-catalog.md also has per-row `Required Skills:` additions in the table and a
      "Skill routing" table of 21 skill ids. "Keep plugin Required Skills field and skill table" is
      right but must say the whole row set, because the rows are also the rows that B3 must rewrite by
      kind. Merge first, rewrite second, in two commits.
    - The table says `SKILL.md:70-74` for the project close-out and plugin `136-141` for skill
      routing. In the diff, the project text is at project lines 67-74 (6 removed lines); the plugin
      text is a hunk at 133-141. Give the exact ranges.
    - The unique project content is in three files (SKILL.md, git-standards.md, task-tracking.md)
      and uses close-out tool names; the three copies must stay consistent after the merge.
    - `team-leader-modes.md` is identical in both copies today and exists in both
      (`find` result). B3 lists it as a "new" write; it is an edit.
12. **Moderate. Size of B3 for one agent run.** B3 has 5 merged files, 1 edit of
    `team-leader-modes.md` and 12 new phase files, plus kind-only rewrites of `strategies.md` and
    `task-tracking.md` continuation. This is too large for about 20 minutes. Split into: B3a merge only
    (5 files, no rewrite); B3b `phases/*.md` for 6 kinds; B3c `phases/*.md` for 6 kinds; B3d kind-only
    flows (`strategies.md`, `task-tracking.md`, `agent-catalog.md`, `SKILL.md`, `team-leader-modes.md`).
    Write sets stay disjoint. SKILL.md is 244 lines and the validator target is under 300
    (`validate-orchestration-skill.ts:147,542`); state the line budget for SKILL.md.
13. **Moderate. Write sets are not fully disjoint from the real change set.** B5 edits
    `libs/backend/lane-routing/project.json`, and B2 edits files in the same project; they are
    ordered, so no conflict. But B2 misses the files in finding 8 and B1 does not list the zod-free
    spec. Add them to the write sets.
14. **Moderate. Missing work.**
    - Continuation table (`task-tracking.md:140-160`) is in B3 but with no test. Add a validator rule
      that the table has no role name outside the compatibility appendix.
    - Task-spec contract: B1 says "add only new phase artifact constants". Say which. If none, say none.
    - Team leader modes: the plan keeps Mode 1/2/3 as labels (Decisions). The kind names `batch` and
      `completion` are in routing, but `team-leader-modes.md` still names the role. State the wording.
    - Routing tests: B2 lists a resolver spec and "twelve kinds". Add: `DEFAULT_ROLE` ten old values
      unchanged, `taskKindFor` for 12 kinds, the route tool schema includes both new kinds.
    - Docs: `libs/backend/lane-routing/README.md:21` documents the phase `kind` list. Update it.
      `lane-assignment.md` (both copies) must list the new kinds if it lists kinds.
    - The acceptance "a task can run from start to completion with no role name in an orchestrator
      prompt" has no test. The plan relies on the validator rule in Risks only. Add the exact rule
      (which files and sections are scanned) to B5.
15. **Minor. `## Findings` claims.** Confirmed with small errors:
    - `package.json:46` is correct. The validator is not in CI (finding 6); the plan does not say
      where it runs today. Add: `.husky/pre-commit:20-30` only.
    - "validator checks 14 roster entries and templates (`:100-123,400-438`)" is correct.
    - "`libs/shared/src/index.ts:48-52`" exports `task-spec.contract` at line 50 in the visible
      range; the range is close but include the line number.
    - "`DEFAULT_ROLE` ... (`phase-plan.ts:42-59,309-329`)" is correct (`:43-54` and `:312`).
16. **Minor. No removals.** The plan removes no capability. It states "None" under Proposed Removals.
    The unique-content check passes provided finding 11 is applied: the project close-out text and
    the plugin skill-routing text both survive. Note the merge is not "no net deletion": the
    rewrite by kind removes role names from flows. Each removed role name must stay in the
    appendix (no loss of capability), as the plan says.

## Confirmed claims

- Five files differ; three hunk groups per the diff match the table. The remaining four files of
  nine are equal. `validate-orchestration-skill.ts:147-154` reads the plugin root only.
- `PHASE_KINDS` has ten values; `role` is optional on a route phase
  (`route-decide-args.schema.ts:4-15,30-39`).
- lane-routing already imports `@ptah-extension/shared` (`route-decide-args.schema.ts:2`).
- Project names `@ptah-extension/shared` and `@ptah-extension/lane-routing` are correct.
- `.gitattributes` sets `* text=auto eol=lf`; a byte check works on Windows and Linux.
- No file in `libs/` or `apps/` has a fixed count of ten kinds. The renderer does not use the list.
- Role census compares each bucket on its own and raises only with `--force-raise`.

## Not checked

- I did not run the validator, the census or any test.
- I did not read all lines of `strategies.md` and `task-tracking.md` for role names in flows.
- I did not check the exact `OutcomeTaskKind` set for a fit to `batch` and `completion`.
- I did not read the `claude-target.ts` write path to say if harness-sync overwrites a tracked
  mirror (finding 7 states the risk, not the result).
- I did not read `template-classification.md` or `parity-inventory.md` against the phase files.

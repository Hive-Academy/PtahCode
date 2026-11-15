# Step 2 plan: retire verification roles

Branch: `feat/phase4-step2-verify-roles`, after PR #1307. This is a plan only. Keep Electron first; preserve provider CLI lanes, platform-cli and cli-engine.

## Scope

Retire four built-in subagents: `code-logic-reviewer` and `code-style-reviewer` alias to `review`; `senior-tester` to `tests`; `visual-reviewer` to `visual-review`. Keep aliases for old tasks and records. Preserve user-written agents with the same names. No other role retires in this step. Items 1-12 in `implementation-plan.md` §4 apply to each role.

## Routing confirmation

- The single alias map already has the four mappings at `libs/shared/src/lib/types/retired-roles.ts:17-32`; add four step-2 rows to `RETIRED_ROLES` at :39-43. Do not add another map.
- `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:301-315` sends a retired role to the phase subagent; `assemble-gate.ts:188` retains its phase kind. Add cases for the four slugs in `phase-plan.spec.ts:53-71`. The explicit custom-agent route remains. The alias applies by slug in routing, as P4-S1-1 says.
- Lane spawn role resolution uses `isRetiredPtahAgent` at `libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.ts:166-173`; mirror, sync and reap use it in `libs/backend/harness-sync/src/lib/targets/retired-agent-origin.ts:11-12` and `workspace-target.ts:457,669`. It retires only an unchanged wizard agent proven by origin and hash. Fix the resolver's hard-coded `implement` advice at :88 to report the mapped kind for these roles. Do not hide an edited or user-written same-name agent.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:284,297-302,357` still gives reviewer/tester effort from a role-name suffix or `senior-tester`. Add lane phase kind to its input and use `review`, `visual-review`, `tests`. Use the name rule only for a user-written agent with no phase. Trace the phase kind from the spawn caller and test all three kinds, custom no-phase names, and ordinary phases.
- The reviewer-family exclusion already reads `phase.kind` and executor family at `libs/backend/lane-routing/src/lib/ranking/hard-constraints.ts:119-134,158-163`; its set at :45-48 currently contains `review` and `document-review`. Add `visual-review` to that set so visual reviewers also get family separation. Test both retired review slugs and visual review; do not use the `-reviewer` suffix.
- Recheck classifier prompt and caller, namespace fallback and help text at this head before edits. `orchestration-namespace.builder.ts` and `system-namespace.builders.ts` must offer phase kinds for built-in work and preserve explicit user agents. Keep raw legacy role in stored outcomes; normalize the classifier input. No host-specific imports in shared code.

## Learned differences

Write `step-2-learned-differences.md` before deleting templates. Each row needs source line, target line or drop reason, and review verdict. Layer A compares workspace `.claude/agents/<slug>.md` with `libs/backend/agent-generation/templates/agents/<slug>.template.md`. `role-file-comparison.md:88-140` says logic, style and tester have learned content; visual has generated differences only.

| Layer A source | Destination or drop reason |
| --- | --- |
| Logic: registration before use, RPC boundary validation, error containment and safe rendering | Check `orchestration/phases/review.md`; add only missing generic checks. Drop local file names and rules already in project guidance. |
| Style: boundary discipline and blocking unjustified lint suppression | Add missing blocker rule to `phases/review.md`; keep existing strictness and boundary rules. Put a missing generic barrel rule in `nx-workspace-architect`, if absent. Drop repository-only naming and DI facts. |
| Tester: repository test runner, fixtures, coverage and command details | Drop when already in project guidance or `CLAUDE.md`; add a truly missing generic testing discipline to `phases/tests.md` only. |
| Visual: generated-only differences | Drop; preserve browser evidence rule in `phases/visual-review.md:19-25`. |

The destinations are `phases/review.md`, `phases/tests.md`, and `phases/visual-review.md` under both `plugins/ptah-core/skills/orchestration` and `.claude/skills/orchestration`. The two trees must be byte-identical. Layer B reads the current user-layer clone and every readable history snapshot for each slug locally. Record transferable rules or an explicit no-op by snapshot order, without personal paths, scope names, user names, or content in the repository. Do not delete a template until its Layer B audit is complete. `skills-learning-locations.md` gives clone and history locations; `step-1-learned-differences.md` is the row format. If evidence is unavailable, report the gap and hold the affected deletion.

## Current references

The inventory below comes from `git grep -l -E 'code-logic-reviewer|code-style-reviewer|senior-tester|visual-reviewer'` at this head. Each listed file is classified by the intended action. Re-run it after implementation. No blanket replacement: historical tests and reports may be evidence for compatibility.

### Change active product references

- Source and contracts: `agent-pack-manifest.json`, `content-manifest.json`; `libs/shared/src/lib/types/retired-roles.ts`, `task-spec.contract.ts`, `wizard/recommendations.ts`; `libs/backend/agent-generation/src/lib/interfaces/template-storage.interface.ts`, `services/agent-recommendation.service.ts`, `orchestrator.service.ts`, `subagent-tool-allowlist.ts`, `template-storage.service.ts`, `types/analysis.types.ts`, `core.types.ts`, `wizard.types.ts`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts`; `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts`, `system-namespace.builders.ts`; `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`; `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts`; `libs/frontend/onboarding/src/lib/shell/onboarding-announcer.service.ts`. Check each row's purpose; retain legacy parse values and historical display if needed.
- Skill and command surfaces: both `commands/orchestrate.md`, both `skills/agent-lanes/SKILL.md`, both `skills/orchestration/references/agent-catalog.md`, and `scripts/validate-orchestration-skill.ts`. Change active catalog wording to phase kinds and mark compatibility aliases retired. Keep both skill copies equal. The two `skills/tribunal/references/crucible.md` files need a context check before changing any historic reviewer example.
- Docs: `apps/ptah-docs/src/content/docs/agents/{agent-orchestration.md,built-in-agents.md,cli-agents.md,index.mdx}`, `setup/setup-wizard.md`, `templates/{index.md,template-storage.md}`. Remove claims that these four are active built-ins; retain migration explanation when useful.
- Delete only the four source templates `libs/backend/agent-generation/templates/agents/{code-logic-reviewer,code-style-reviewer,senior-tester,visual-reviewer}.template.md` after learning audit. `template-sharing.guard.spec.ts:52,1040-1050,1055,1177` changes count 11 to 7, removes four partial rows, and replaces the `visual-reviewer` nondelegation reference with a phase-level rule. Its hygiene reference is `software-architect` (:1176), which stays; its inline hygiene role is `code-style-reviewer` (:1177), which must be removed and its generic rule retained in review guidance.

### Keep compatibility and historical references

- Tracked generated agents: `.claude/agents/{code-logic-reviewer,code-style-reviewer,senior-tester,team-leader,visual-reviewer}.md`, `.codex/agents/{code-logic-reviewer,code-style-reviewer,senior-tester,team-leader,visual-reviewer}.toml`, and `.opencode/agent/{code-logic-reviewer,code-style-reviewer,team-leader}.md`. These stay under U-D12; sync must not recreate an unchanged retired wizard agent.
- Historical `.ptah/analysis` and `.ptah/specs` files, old fixtures under `scripts/agent-usage` and `tools/mcp-bench`, and legacy parsing/attribution specs remain. Review their expectations if they assert an active catalog. The complete path inventory for these and all active specs is in the appendix below.
- `libs/shared/project.json` has a role-name test target; inspect whether it is still a valid compatibility test before changing. `apps/ptah-electron-e2e/src/specs/tasks/tasks-list-visual.spec.ts` is a historical UI fixture; update only if it asserts an active role.

## Role census

Ran `npx ts-node --transpile-only tools/role-census/check-role-census.ts` without `--update`. It failed before counting because Node `spawnSync('git')` returns `EPERM` in this lane; direct `git ls-files` succeeds. The read-only fallback uses `git grep -I -n` across the same 14 slugs and the census bucket rules. These are fallback counts, not a passing official gate. Re-run the official command in an environment where child process spawn works.

| Bucket | Current fallback lines/files | Step-2 ceiling lines/files | Reason |
| --- | ---: | ---: | --- |
| templates | 59/11 | 47/7 | Four templates, 12 matching lines together |
| skills | 77/27 | 69/27 | Four active catalog rows in two copies; phase prose uses kinds |
| generated-agents | 176/28 | 176/28 | Preserve tracked files |
| docs | 111/28 | 107/28 | At least four active built-in rows removed |
| test | 908/143 | 908/143 | Preserve historical fixtures; new tests should replace active assertions |
| source | 176/41 | 168/41 | Four retirement rows offset by at least 12 active selector/help/icon rows removed |
| other | 114/8 | 107/8 | Three agent-pack and four content-manifest entries removed |
| total | 1621/286 | 1582/282 | Sum of bucket ceilings |

These ceilings are targets, not a claim of final exact counts. The official census must exit 0, with no baseline change. Record actual counts after edits and explain any bucket above its ceiling before merge.

## Batches

At most three file-disjoint batches run at once. Each executor gets a reviewer from the other family. Coordinator owns integration and full-diff review.

| Order | Batch, owner, files | Reviewer |
| --- | --- | --- |
| Parallel 1 | A, codex: Layer A/B audit, `step-2-learned-differences.md`, both orchestration skill copies and command/catalog text | Claude Api |
| Parallel 1 | B, Claude Api: retired aliases, lane spawn effort, phase routing and resolver; focused specs in those projects | codex |
| Parallel 1 | C, codex: setup catalog, recommendation, shared contract, icon, host namespace, docs and their focused specs; avoid A's skill files | Claude Api |
| After A and C | D, Claude Api: four templates, template guard and partial checks, manifests, sync regression specs; verify A's learning verdict first | codex |
| After B-D | E, coordinator: reconcile all references, census, independent reviews, Electron and CLI real tasks, gates and full-diff review | Other family |

If the same file is needed by two batches, assign it to the earlier owner and send a patch request; do not edit concurrently. Keep Electron composition and CLI container coverage in the owner batch if a service registration changes.

## Real task

After implementation, run one real `review` phase on a provider CLI lane with a non-subagent executor and cross-family reviewer. Run one real `visual-review` phase in Electron on an executor with browser tools; capture screenshots for each visual claim. Record task, phase kind, executor, verdict, deliverable and persisted outcome row in `step-2-real-task.md`. A CLI lane without browser tools cannot satisfy visual review. Before merge, local phase routing, CLI review task, and Electron visual task can run if the Electron host and browser tools are available. Green CI, release propagation, and merged-host behavior cannot be claimed before merge.

## Gates

- Official read-only role census exits 0; no `--update` and no baseline edit. `npm run validate-skill`, `npm run manifest:check`, degradation audit, and byte comparison of both orchestration skill copies pass.
- Run scoped checks only for changed projects, one heavy check at a time. Check Electron first, then provider CLI lanes, platform-cli and cli-engine, then VS Code. Run webview template typecheck only if a template changes. Update DI guards if a service or RPC method changes.
- Tests cover alias routing, unchanged wizard origin proof, custom same-name agent, sync/mirror/reap, reviewer family, lane effort, catalog removal and Bot avatar fallback. Independent other-family review, full diff review, Electron task, CLI task and green CI precede parent merge.

## Preserve list

Keep alias parsing, old task and grade attribution, user clones and snapshots, custom same-name agents, tracked generated agent files, provider copies allowed by P4-S1-1, `Bot` fallback, phase definitions, Electron and CLI behavior, and all reusable review/test/visual capabilities. Keep `software-architect` as the hygiene reference template until its own step.

## Proposed Removals

Remove four active built-in catalog and recommendation rows, four source templates, obsolete role-specific icons/help wording and their manifest entries. Do not delete user-layer files, history, grades or tracked generated agents. Remove the `code-style-reviewer` inline hygiene test only after its transferable rule is covered in `review.md`.

## Decisions

| Decision | Evidence | Status |
| --- | --- | --- |
| Alias four slugs to phase kinds; retire only unchanged wizard agents in spawn/mirror/sync/reap | P4-S1-1; `retired-roles.ts:17-43`; origin helper | Settled |
| Use phase kind for lane effort and reviewer-family exclusion | `lane-spawn-policy.ts:297-302`; `hard-constraints.ts:119-134` | Settled |
| Keep tracked generated files and historical compatibility evidence | U-D12; step-1 coordinator decisions | Settled |
| Read local clone history before each template deletion; publish no personal content | §2; `skills-learning-locations.md` | Required |
| Official census cannot run under this lane's Node subprocess policy | `spawnSync git EPERM`; fallback table above | Open gate: rerun before merge |
| Visual review needs Electron browser screenshots | `phases/visual-review.md:19-25` | Required |

## Coordinator decisions (override the text above)

- Never pass `--update` or edit `tools/role-census/baseline.json`. The fallback table is planning evidence only; the coordinator must obtain an official passing census before merge.
- Run A, B, C in parallel only while files remain disjoint. D follows A and C; E follows all implementation batches. All implementation has cross-family review.
- If local Layer B history is missing or holds a unique capability without a safe destination, hold that role's template deletion and report the evidence and options to the parent. No other user decision is currently open.

## Appendix: complete current grep path inventory

The following paths are the complete current `git grep -l` inventory for the four slugs. Above sections determine change or keep; a path listed here is not an instruction to rewrite historical text.

~~~text
.claude/agents/code-logic-reviewer.md
.claude/agents/code-style-reviewer.md
.claude/agents/senior-tester.md
.claude/agents/team-leader.md
.claude/agents/visual-reviewer.md
.claude/commands/orchestrate.md
.claude/skills/agent-lanes/SKILL.md
.claude/skills/orchestration/references/agent-catalog.md
.claude/skills/tribunal/references/crucible.md
.codex/agents/code-logic-reviewer.toml
.codex/agents/code-style-reviewer.toml
.codex/agents/senior-tester.toml
.codex/agents/team-leader.toml
.codex/agents/visual-reviewer.toml
.opencode/agent/code-logic-reviewer.md
.opencode/agent/code-style-reviewer.md
.opencode/agent/team-leader.md
.ptah/analysis/ptah-extension/04-elevation-plan.md
.ptah/analysis/ptah-extension/generation-manifest.json
.ptah/specs/FIX_PLUGIN_SESSION_ROOT/code-logic-review.md
.ptah/specs/TASK_2026_1009_f898/final-diff-review-2.md
.ptah/specs/TASK_2026_1171_7664/decisions.md
.ptah/specs/TASK_2026_1173_c17f/code-logic-review.md
.ptah/specs/TASK_2026_1173_c17f/decisions.md
.ptah/specs/TASK_2026_1175_2690/batch-1-E-result.md
.ptah/specs/TASK_2026_1175_2690/fix-1-review-result.md
.ptah/specs/TASK_2026_1175_2690/fix-3-result.md
.ptah/specs/TASK_2026_1175_2690/implementation-plan.md
.ptah/specs/TASK_2026_1175_2690/review-step-1.md
.ptah/specs/TASK_2026_1175_2690/role-file-comparison.md
.ptah/specs/TASK_2026_1175_2690/role-reference-map.md
.ptah/specs/TASK_2026_1175_2690/role-routing-map.md
.ptah/specs/TASK_2026_1175_2690/step-1-real-task-lane.md
.ptah/specs/TASK_2026_1175_2690/step-1-real-task.md
.ptah/specs/TASK_2026_155/implementation-plan.md
.ptah/specs/TASK_2026_239/context.md
.ptah/specs/TASK_2026_239/docs-changes.md
.ptah/specs/TASK_2026_254/audit-findings.md
.ptah/specs/TASK_2026_254/codex-audit.md
.ptah/specs/TASK_2026_254/context.md
.ptah/specs/TASK_2026_257/context.md
.ptah/specs/TASK_2026_257/tasks.md
.ptah/specs/TASK_2026_267/tasks.md
.ptah/specs/TASK_2026_299/context.md
.ptah/specs/TASK_2026_299/tasks.md
.ptah/specs/TASK_2026_303/implementation-report.md
.ptah/specs/TASK_2026_308/implementation-report.md
.ptah/specs/TASK_2026_309/implementation-report.md
.ptah/specs/TASK_2026_323/cross-vendor-review.md
.ptah/specs/TASK_2026_332/implementation-report.md
.ptah/specs/TASK_2026_333/context.md
.ptah/specs/TASK_2026_333/implementation-report.md
.ptah/specs/TASK_2026_335/context.md
.ptah/specs/TASK_2026_335/implementation-report.md
.ptah/specs/TASK_2026_359/codex-design.md
.ptah/specs/TASK_2026_359/codex-review.md
.ptah/specs/TASK_2026_359/context.md
.ptah/specs/TASK_2026_362/batches.md
.ptah/specs/TASK_2026_362/implementation-plan.md
.ptah/specs/TASK_2026_362/task-description.md
.ptah/specs/TASK_2026_388/batches.md
.ptah/specs/TASK_2026_402_a5c7/batch-10-report.md
.ptah/specs/TASK_2026_402_a5c7/batches.md
.ptah/specs/TASK_2026_402_a5c7/implementation-plan.md
.ptah/specs/TASK_2026_420_84d9/context.md
.ptah/specs/TASK_2026_431_39db/implementation-report.md
.ptah/specs/TASK_2026_431_39db/tribunal/round1-antigravity.md
.ptah/specs/TASK_2026_431_39db/tribunal/round1-codex.md
.ptah/specs/TASK_2026_431_39db/tribunal/round2-antigravity.md
.ptah/specs/TASK_2026_431_39db/tribunal/round2-codex.md
.ptah/specs/TASK_2026_432_f208/context.md
.ptah/specs/TASK_2026_432_f208/implementation-plan.md
.ptah/specs/TASK_2026_432_f208/implementation-report.md
.ptah/specs/TASK_2026_432_f208/task.md
.ptah/specs/TASK_2026_433_d22a/batches.md
.ptah/specs/TASK_2026_433_d22a/implementation-plan.md
.ptah/specs/TASK_2026_433_d22a/research-report.md
.ptah/specs/TASK_2026_433_d22a/task.md
.ptah/specs/TASK_2026_433_d22a/test-report.md
.ptah/specs/TASK_2026_494_ca38/batches.md
.ptah/specs/TASK_2026_494_ca38/code-logic-review-batch-11-glm.md
.ptah/specs/TASK_2026_494_ca38/code-logic-review-batch-16.md
.ptah/specs/TASK_2026_494_ca38/code-logic-review-batch-17.md
.ptah/specs/TASK_2026_494_ca38/code-logic-review-batch-19.md
.ptah/specs/TASK_2026_494_ca38/code-logic-review-batch-6-glm.md
.ptah/specs/TASK_2026_494_ca38/context.md
.ptah/specs/TASK_2026_494_ca38/implementation-plan.md
.ptah/specs/TASK_2026_512_feaa/design-brief.md
.ptah/specs/TASK_2026_512_feaa/lane-e-report.md
.ptah/specs/TASK_2026_512_feaa/prototypes/variant-1-ticker.html
.ptah/specs/TASK_2026_512_feaa/prototypes/variant-2-stacked-log.html
.ptah/specs/TASK_2026_512_feaa/prototypes/variant-3-split.html
.ptah/specs/TASK_2026_512_feaa/prototypes/variant-4-wire-console.html
.ptah/specs/TASK_2026_524_mkpl/batches.md
.ptah/specs/TASK_2026_533/code-style-review.md
.ptah/specs/TASK_2026_533/cross-side-review-rule-review.md
.ptah/specs/TASK_2026_533/lane-report-a.md
.ptah/specs/TASK_2026_533/lane-report-b-rev1.md
.ptah/specs/TASK_2026_533/lane-report-b.md
.ptah/specs/TASK_2026_533/pr-582-comments-review.md
.ptah/specs/TASK_2026_533/pr-582-round3-lane-ag-report.md
.ptah/specs/TASK_2026_533/pr-582-round3-review.md
.ptah/specs/TASK_2026_533/pr-582-round4-lane-report-rev1.md
.ptah/specs/TASK_2026_533/pr-582-round4-lane-report.md
.ptah/specs/TASK_2026_533/pr-582-round4-review-round2.md
.ptah/specs/TASK_2026_533/pr-582-round4-review.md
.ptah/specs/TASK_2026_533/pr-583-comments-lane-report.md
.ptah/specs/TASK_2026_533/pr-583-comments-review.md
.ptah/specs/TASK_2026_533/task.md
.ptah/specs/TASK_2026_538/fix-report.md
.ptah/specs/TASK_2026_560_2ae5/implementation-plan.md
.ptah/specs/TASK_2026_560_2ae5/reviews/code-review.md
.ptah/specs/TASK_2026_581_2af1/context.md
.ptah/specs/TASK_2026_582_a7db/context.md
.ptah/specs/TASK_2026_583_c0a1/implementation-plan.md
.ptah/specs/TASK_2026_587_bffd/context.md
.ptah/specs/TASK_2026_587_bffd/task.md
.ptah/specs/TASK_2026_591_fff5/implementation-plan.md
.ptah/specs/TASK_2026_593_7c2e/HANDOFF.md
.ptah/specs/TASK_2026_593_7c2e/rail-redesign/HANDOFF.md
.ptah/specs/TASK_2026_611_8fe7/context.md
.ptah/specs/TASK_2026_611_8fe7/task.md
.ptah/specs/TASK_2026_619_af7f/batches.md
.ptah/specs/TASK_2026_619_af7f/handoff.md
.ptah/specs/TASK_2026_667_af48/pr724-body.md
.ptah/specs/TASK_2026_714_c8a2/HANDOFF.md
.ptah/specs/TASK_2026_714_c8a2/batches.md
.ptah/specs/TASK_2026_714_c8a2/code-style-rereview-p6.md
.ptah/specs/TASK_2026_714_c8a2/context.md
.ptah/specs/TASK_2026_714_c8a2/decisions.md
.ptah/specs/TASK_2026_853_897f/batches.md
.ptah/specs/TASK_2026_853_897f/code-logic-review-phase-c.md
.ptah/specs/TASK_2026_853_897f/decisions.md
.ptah/specs/TASK_2026_853_897f/implementation-plan-review-round1.md
.ptah/specs/TASK_2026_853_897f/implementation-plan.md
.ptah/specs/TASK_2026_853_897f/reports/batch-1.json
.ptah/specs/TASK_2026_853_897f/reports/batch-15.json
.ptah/specs/TASK_2026_853_897f/reports/batch-16.json
.ptah/specs/TASK_2026_853_897f/reports/batch-34.json
.ptah/specs/TASK_2026_853_cli_lanes/code-logic-review.md
.ptah/specs/TASK_2026_855_d4b6/decisions.md
.ptah/specs/TASK_2026_855_d4b6/implementation-plan.md
.ptah/specs/TASK_2026_856_d668/HANDOFF.md
.ptah/specs/TASK_2026_856_d668/batches.md
.ptah/specs/TASK_2026_856_d668/decisions.md
.ptah/specs/TASK_2026_856_d668/implementation-plan-review.md
.ptah/specs/TASK_2026_857_f660/batch-20-report.md
.ptah/specs/TASK_2026_857_f660/batches.md
.ptah/specs/TASK_2026_857_f660/code-logic-review-phase-a.md
.ptah/specs/TASK_2026_857_f660/decisions.md
.ptah/specs/TASK_2026_857_f660/implementation-plan.md
.ptah/specs/TASK_2026_857_f660/task-description-review.md
.ptah/specs/TASK_2026_858_c7a2/HANDOFF.md
.ptah/specs/TASK_2026_858_c7a2/code-logic-review-fix-R2.md
.ptah/specs/TASK_2026_858_c7a2/context.md
.ptah/specs/TASK_2026_858_c7a2/implementation-plan.md
.ptah/specs/TASK_2026_858_f7b9/batches.md
.ptah/specs/TASK_2026_858_f7b9/implementation-plan.md
.ptah/specs/TASK_2026_858_f7b9/task-description.md
.ptah/specs/TASK_2026_859_b561/batches.md
.ptah/specs/TASK_2026_864_1376/batches.md
.ptah/specs/TASK_2026_864_1376/decisions.md
.ptah/specs/TASK_2026_864_1376/implementation-plan.md
.ptah/specs/TASK_2026_865_2a1d/HANDOFF.md
.ptah/specs/TASK_2026_865_2a1d/batch-8-report.md
.ptah/specs/TASK_2026_865_2a1d/batches.md
.ptah/specs/TASK_2026_865_2a1d/context.md
.ptah/specs/TASK_2026_865_2a1d/decisions.md
.ptah/specs/TASK_2026_865_2a1d/implementation-plan.md
.ptah/specs/TASK_2026_865_2a1d/task-description.md
.ptah/specs/TASK_2026_872_f3b4/context.md
.ptah/specs/TASK_2026_873_f748/research/coderabbit-analysis.md
.ptah/specs/TASK_2026_873_f748/research/ptah-infra-inventory.md
.ptah/specs/TASK_2026_874_93f0/decisions.md
.ptah/specs/TASK_2026_878_5513/batches.md
.ptah/specs/TASK_2026_878_5513/research-root-causes.md
.ptah/specs/TASK_2026_878_eae4/design-spec-review.md
.ptah/specs/TASK_2026_879_9809/batches.md
.ptah/specs/TASK_2026_879_9809/implementation-plan.md
.ptah/specs/TASK_2026_884_sdk_queue/HANDOFF.md
.ptah/specs/TASK_2026_886_cae4/batches.md
.ptah/specs/TASK_2026_886_cae4/implementation-plan.md
.ptah/specs/TASK_2026_886_cae4/task-description-review.md
.ptah/specs/TASK_2026_886_cae4/task-description.md
.ptah/specs/TASK_2026_889_d57a/docs-app-review.md
.ptah/specs/TASK_2026_889_d57a/lane-l2-report.md
.ptah/specs/TASK_2026_894_0e20/decisions.md
.ptah/specs/TASK_2026_894_0e20/design-spec.md
.ptah/specs/TASK_2026_894_0e20/final-review.md
.ptah/specs/TASK_2026_895_d988/research-setup.md
.ptah/specs/TASK_2026_896_1ec9/decisions.md
.ptah/specs/TASK_2026_900_a3f1/code-logic-review-round-2.md
.ptah/specs/TASK_2026_908_2835/code-logic-review-rpc-shared.md
.ptah/specs/TASK_2026_910_e8e2/context.md
.ptah/specs/TASK_2026_977_0876/evidence/coupling-census.md
.ptah/specs/TASK_2026_977_0876/task-description-review.md
.ptah/specs/TASK_2026_977_0876/task-description.md
.ptah/specs/TASK_2026_977_0876/template-classification.md
.ptah/specs/TASK_2026_AGENT_BUDGET/code-style-review-final.md
.ptah/specs/TASK_2026_AGENT_BUDGET/code-style-review-round-3.md
.ptah/specs/TASK_2026_MCP_AUTH_REJECT/context.md
.ptah/specs/TASK_2026_ONBOARDING/code-logic-review.b1c-b.md
.ptah/specs/TASK_2026_ONBOARDING/decisions.md
.ptah/specs/TASK_2026_ONBOARDING/design-spec.md
.ptah/specs/TASK_2026_ONBOARDING/implementation-plan.addendum-prereqs.md
.ptah/specs/TASK_2026_ONBOARDING/prototype/index.html
.ptah/specs/TASK_2026_SUBAGENT_STOP_PATH/HANDOFF.md
.ptah/specs/TASK_2026_glass_scenes/HANDOFF.md
.ptah/specs/TASK_2026_kimi_limits/HANDOFF.md
.ptah/specs/TASK_2026_motion_presets/implementation-plan.md
.ptah/specs/TASK_2026_video_move_and_package_trim/verify-triage.md
.ptah/specs/child-session-model-effort/summary.md
agent-pack-manifest.json
apps/ptah-docs/src/content/docs/agents/agent-orchestration.md
apps/ptah-docs/src/content/docs/agents/built-in-agents.md
apps/ptah-docs/src/content/docs/agents/cli-agents.md
apps/ptah-docs/src/content/docs/agents/index.mdx
apps/ptah-docs/src/content/docs/setup/setup-wizard.md
apps/ptah-docs/src/content/docs/templates/index.md
apps/ptah-docs/src/content/docs/templates/template-storage.md
apps/ptah-electron-e2e/src/specs/tasks/tasks-list-visual.spec.ts
content-manifest.json
libs/backend/agent-generation/src/lib/interfaces/template-storage.interface.ts
libs/backend/agent-generation/src/lib/services/agent-recommendation.service.spec.ts
libs/backend/agent-generation/src/lib/services/agent-recommendation.service.ts
libs/backend/agent-generation/src/lib/services/content-generation.service.spec.ts
libs/backend/agent-generation/src/lib/services/generated-section-validator.spec.ts
libs/backend/agent-generation/src/lib/services/invocable-plugin-skills.spec.ts
libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts
libs/backend/agent-generation/src/lib/services/orchestrator.service.ts
libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.spec.ts
libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts
libs/backend/agent-generation/src/lib/services/template-sharing.guard.spec.ts
libs/backend/agent-generation/src/lib/services/template-storage.service.ts
libs/backend/agent-generation/src/lib/services/user-layer/user-layer-agent-scope.spec.ts
libs/backend/agent-generation/src/lib/services/user-layer/user-layer-seed-quarantine.spec.ts
libs/backend/agent-generation/src/lib/types/analysis.types.ts
libs/backend/agent-generation/src/lib/types/core.types.ts
libs/backend/agent-generation/src/lib/types/wizard.types.ts
libs/backend/agent-generation/templates/agents/code-logic-reviewer.template.md
libs/backend/agent-generation/templates/agents/code-style-reviewer.template.md
libs/backend/agent-generation/templates/agents/senior-tester.template.md
libs/backend/agent-generation/templates/agents/team-leader.template.md
libs/backend/agent-generation/templates/agents/visual-reviewer.template.md
libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.spec.ts
libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.account-binding.spec.ts
libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts
libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.spec.ts
libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.settings-routing.spec.ts
libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/__fixtures__/grok-p1-ptah-mcp-search-use-tool.ndjson
libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/__fixtures__/grok-p2-permission-allow-once.ndjson
libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.spec.ts
libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts
libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-terminal-outcomes.integration.spec.ts
libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.spec.ts
libs/backend/harness-sync/src/lib/manifest/harness-manifest.builder.spec.ts
libs/backend/harness-sync/src/lib/targets/transformers/agent-transformers.spec.ts
libs/backend/harness-sync/src/lib/targets/transformers/opencode-agent-transformer.spec.ts
libs/backend/harness-sync/src/lib/targets/workspace-target.ts
libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.spec.ts
libs/backend/lane-outcomes/src/lib/subagent-stop.integration.spec.ts
libs/backend/lane-routing/src/lib/contracts/contracts.spec.ts
libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts
libs/backend/lane-routing/src/lib/ranking/hard-constraints.spec.ts
libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.spec.ts
libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts
libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts
libs/backend/rpc-handlers/src/lib/handlers/skills-synthesis-rpc.handlers.spec.ts
libs/backend/rpc-handlers/src/lib/handlers/wizard-generation.preview-fidelity.spec.ts
libs/backend/skill-synthesis/src/lib/spec-extractor.spec.ts
libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-surface-parity.spec.ts
libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.spec.ts
libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts
libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/route-namespace.builder.spec.ts
libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/system-namespace.builders.ts
libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts
libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts
libs/frontend/chat-streaming/src/lib/execution-tree-builder.service.spec.ts
libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts
libs/frontend/chat/src/lib/settings/ptah-ai/routing-display-names.store.spec.ts
libs/frontend/onboarding/src/lib/shared/item-status-card.component.spec.ts
libs/frontend/onboarding/src/lib/shell/onboarding-announcer.service.ts
libs/frontend/setup-wizard/src/lib/services/setup-wizard/wizard-phase-generation.spec.ts
libs/shared/project.json
libs/shared/src/lib/types/retired-roles.ts
libs/shared/src/lib/types/task-spec.contract.ts
libs/shared/src/lib/types/wizard/recommendations.ts
libs/shared/src/lib/utils/pricing.utils.spec.ts
plugins/ptah-core/commands/orchestrate.md
plugins/ptah-core/skills/agent-lanes/SKILL.md
plugins/ptah-core/skills/orchestration/references/agent-catalog.md
plugins/ptah-core/skills/tribunal/references/crucible.md
scripts/agent-usage/__fixtures__/claude-session/subagents/agent-code-logic-reviewer.meta.json
scripts/agent-usage/claude-transcript.reader.spec.ts
scripts/agent-usage/subagent-metrics.spec.ts
scripts/validate-orchestration-skill.ts
tools/mcp-bench/fixtures/memory-skills/memory-facts.v1.jsonl
tools/mcp-bench/fixtures/memory-skills/merge-pairs.v1.jsonl
tools/role-census/check-role-census.ts
~~~

## Coordinator decisions (override the text above)

- C2-1 Census: the official census ran in the coordinator shell and exits 0. Its counts match the
  fallback table (1621 lines in 286 files). The ceilings above apply.
- C2-2 Reviewer family: `hard-constraints.ts` does not change in step 2. Visual review had no
  family separation before (the set is `review`, `document-review`), so adding it is a new
  routing rule, not a retirement. Record it as follow-up F-S2-1. Add only specs that prove the
  retired review slugs route by phase kind.
- C2-3 Resolver hint: the retired-role message uses `phaseKindForRole(role)`, not a fixed
  `implement`.
- C2-4 Executors: codex implements batches A, B, C and D. Claude Api reviews the full step diff
  (other family). Batches A, B and C run in parallel. D starts after A and C.
- C2-5 File owners: B owns `libs/shared/src/lib/types/retired-roles.ts`, `lane-spawn-policy.ts`
  and its caller, `agent-role-resolver.service.ts`, and the lane-routing specs. C owns the other
  `libs/shared` files, `libs/backend/agent-generation/src/**` (not templates and not
  `template-sharing.guard.spec.ts`), `rpc-handlers`, `vscode-lm-tools`, `chat-ui`, `onboarding`
  and `apps/ptah-docs`. A owns both orchestration skill copies, both `agent-lanes` and
  `tribunal` skill copies, both `commands/orchestrate.md` and `scripts/validate-orchestration-skill.ts`.
  D owns the four templates, `template-sharing.guard.spec.ts`, `agent-pack-manifest.json`,
  `content-manifest.json` and harness-sync specs.
- C2-6 `team-leader` and the step 3 roles do not change in step 2.

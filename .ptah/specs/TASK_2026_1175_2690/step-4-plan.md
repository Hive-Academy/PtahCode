# Step 4 plan: retire `team-leader`

## Scope and non-goals

Plan against committed step 3. Retire the last built-in role. Decomposition and batch acceptance use `batch`; final audit uses `completion`. Preserve legacy role reads, old task/grade attribution, tracked generated agents, custom same-name agents, skill names, and task deliverable filenames. Phase 5 removes agent generation; step 4 makes only safe empty-catalog changes. Electron is the priority host; keep CLI and shared-host paths. This plan changes no source. The program acceptance is: no workflow path names a role.

The step-3 lane rules forbid commit/push, destructive git, `npm run verify`, Nx, build, serve, dev, e2e and package targets. Keep orchestration skill mirrors byte-identical. Never edit census or degradation baselines.

## Reference inventory

Search: `rg -n 'team-leader|REVIEW_FOCUS|phaseKindForRole' libs apps plugins .claude/skills .claude/commands scripts tools agent-pack-manifest.json content-manifest.json`. Re-run at implementation HEAD. These groups cover the `team-leader` hits in those roots; also search filenames because the modes reference and CLI prompt may have no matching content.

| File:line group | Class and action |
| --- | --- |
| `libs/shared/src/lib/types/retired-roles.ts:21`, `.spec.ts:90` | Alias/test: retain single `batch` alias, add step-4 retirement row and tests. |
| `libs/shared/src/lib/types/task-spec.contract.ts:66,148,503,591-592,608,612`, `.spec.ts:480,559-561,589`; `task-graph.spec.ts:436,439`; `branded.types.spec.ts:663-664` | Active contract and legacy fixtures: change ownership prose, retain old reads and deliverable names. |
| `plugins/ptah-core/skills/orchestration/{SKILL.md:166,251,references/lane-assignment.md:75,references/git-standards.md:113,references/fleet.md:36,references/agent-catalog.md:119}` and same `.claude/skills/orchestration` files | Active: rename modes reference, update every link, move rules into `phases/batch.md` and `phases/completion.md`, remove role workflow prose. |
| `plugins/ptah-core/commands/orchestrate.md:37,48` and `.claude/commands/orchestrate.md:37,48` | Active: update both copies and reference links. |
| `scripts/validate-orchestration-skill.ts:117,139,169,973` | Active validator: remove roster/template special case; require batch/completion phases and renamed reference; retain alias checks. |
| `libs/backend/agent-generation/templates/agents/team-leader.template.md:2,9,155,183,434,446,474,488,492`; `team-leader-template.policy.spec.ts:5,10` | Active template/test: compare Layer A/B guidance, transfer durable rules, delete template and template-only test. |
| `libs/backend/agent-generation/src/lib/services/{agent-recommendation.service.ts:46,subagent-tool-allowlist.ts:66,template-partial-resolver.ts:80}`, specs `agent-recommendation.service.spec.ts:50`, `subagent-tool-allowlist.spec.ts:40,74,88`, `template-partial-resolver.spec.ts:119`, `template-sharing.guard.spec.ts:1034,1164,1169,1184-1196` | Active catalog/tests: empty roster, remove coordinator template special case, update zero-template guards. |
| `libs/backend/agent-generation/src/lib/{types/wizard.types.ts:37,types/core.types.ts:37,65,481,496,539,655,types/analysis.types.ts:146,interfaces/template-storage.interface.ts:59,64}`; `services/{template-storage.service.ts:228,233,346,orchestrator.service.ts:1286}` | Doc examples: use custom ID; keep generic API. |
| `libs/backend/agent-generation/src/lib/services/{content-generation.service.spec.ts:1006,1207,1224,2433,2449,2476,2497,2511,2584,orchestrator.service.spec.ts:1512-1513,1556-1565,1824,1829-1830,invocable-plugin-skills.spec.ts:70,76,85,95,105,114}` | Test fixtures: switch current built-in examples to custom IDs, retain same-name legacy cases. |
| `libs/backend/agent-generation/src/lib/services/user-layer/{user-layer-agent-scope.spec.ts:202-338,user-layer-seed-quarantine.spec.ts:114-1033}` | Legacy/custom fixtures: keep clone, migration, quarantine and history behavior. |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:632`, `.spec.ts:961,1051` | Active setup catalog: return empty built-in list; preserve custom setup. |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/{orchestration-namespace.builder.ts:56,312,335,357,system-namespace.builders.ts:413}`, `orchestration-namespace.builder.spec.ts:254,308` | Active routing: dispatch batch/completion by state. |
| `libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.spec.ts:142-558`; ACP `__fixtures__/{grok-p2-permission-allow-once.ndjson:96,grok-p1-ptah-mcp-search-use-tool.ndjson:114}` | Legacy/test: verify retired hint and custom same-name path; retain recorded wire fixtures. |
| `libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.spec.ts:502`; `libs/backend/workspace-intelligence/src/ast/language-registry.spec.ts:255` | History/test fixture: retain attribution or rename disposable sample. |
| `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts:109`, `molecules/background-agent-strip.component.ts:49`; `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts:684`; `libs/frontend/onboarding/src/lib/shell/onboarding-announcer.service.ts:5` | Active UI/example: remove dedicated built-in mark and examples; keep generic historical display. |
| `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-task-reader.spec.ts:33`; `libs/frontend/webview-e2e-harness/src/lib/scenarios/{vscode-shell/config-menu-absent.e2e.spec.ts:21,settings/settings-advanced-search-voice.fixtures.ts:11,marketplace/marketplace-visual.e2e.spec.ts:11}` | Test fixtures: keep historical data, revise current examples. |
| `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/{onboarding-analyze.fixtures.ts:93,onboarding-generate.fixtures.ts:54,66-67,97,99}` | Current fixture: replace stale `software-architect` sample ID with custom sample. |
| `apps/ptah-docs/src/content/docs/{templates/template-storage.md:16,30,templates/index.md:6,14,setup/setup-wizard.md:60,agents/index.mdx:14,18,41,agents/cli-agents.md:123,agents/built-in-agents.md:8,14,18,26,agents/agent-orchestration.md:25,27,33}` | Doc: describe phases and user agents; note compatibility separately. |
| `agent-pack-manifest.json:10`, `content-manifest.json:81,238` | Manifest: remove retired pack/template, point at renamed phase reference. |
| `tools/role-census/{check-role-census.ts:19,run-self-test.js:41-108}`; `tools/mcp-bench/questions/7910f34cf/file-tools.json:5397,14841,15015,15157,15275` | Detector/benchmark data: preserve, not workflow use. |

## Decisions

`phaseKindForRole` returns one `PhaseKind`. Its callers use the alias for CLI retirement hint (`agent-role-resolver.service.ts:91`), bulk clone guard (`retired-role-guard.ts:58`), task kind (`decision-model-task-kind-classifier.ts:42`), and outcome attribution (`task-kind-mapping.ts:51`). Add exactly `{ slug: 'team-leader', phaseKind: 'batch', step: 4 }` to `RETIRED_ROLES`; keep `ROLE_PHASE_ALIASES` unchanged. A second row for completion would make one slug ambiguous. Select `completion` from workflow state. `batch.md` and `completion.md` already own the respective methods; each phase's acceptance contract covers its acceptance step.

Empty catalog: `agent-recommendation.service.ts:44-54,95-111` maps rows, so `[]` is valid. `orchestrator.service.ts:446-467` already returns successful zero-agent summary for zero selections. Setup RPC returns `[]`. Wizard shows a clear empty built-in state and disables built-in preview/generation for no IDs (`choose-agents.page.ts:421-428` guards preview). Preserve explicit custom-agent generation, storage, mirror and history; do not synthesize a replacement built-in. Update specs asserting one default recommendation, available template or selected ID. Phase 5 will delete recommendation, wizard generation and rendering code/specs.

Deferred n-3: `REVIEW_FOCUS` appears in `content-generation.service.ts:931,952` and generation/validator/resolver/orchestrator specs, while no remaining shipped role template uses that marker after step 3. Search all templates and dynamic custom section paths before changing it. Remove obsolete built-in prompt text and fixtures; retain generic marker parsing if custom templates can use it.

## Census ceilings

`npx ts-node --transpile-only tools/role-census/check-role-census.ts --json` exits 0 at step-3 HEAD: 1,472 lines/270 files. Conservative step-4 ceilings (current → expected maximum, lines): templates **9 → 0**; skills **72 → 72**; generated-agents **176 → 176**; docs **86 → 86**; test **923 → 923**; source **111 → 111**; other **95 → 95**; total **1,472 → 1,463**. Other buckets retain compatibility lines and lines shared with other role names; require no increase and record exact achieved counts. Direct workflow search is the semantic gate. Never update a baseline.

## Batches

At most three parallel lanes. A must finish guidance transfer before C deletes the template. B and D can run beside A. Write sets are disjoint; coordinator owns any newly found cross-owner file. Run heavy checks one at a time. Verify project configs/spec paths before command execution.

| Batch | Write set; read set; acceptance | Focused checks |
| --- | --- | --- |
| A, guidance | Write both orchestration skill trees, both `commands/orchestrate.md` copies, `scripts/validate-orchestration-skill.ts`. Read old modes reference, full team-leader template, phase files, validator and readable user-layer clone/history. Transfer durable rules with source-to-destination audit, rename reference, update every link; both skill trees identical. | `npm run validate-skill`; `npx eslint scripts/validate-orchestration-skill.ts` |
| B, contracts/routing | Write `libs/shared/src/lib/types/{retired-roles.ts,retired-roles.spec.ts,task-spec.contract.ts,task-spec.contract.spec.ts,task-graph.spec.ts,branded.types.spec.ts}` and `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/{orchestration-namespace.builder.ts,orchestration-namespace.builder.spec.ts,system-namespace.builders.ts}`. Read phase contracts, alias callers, task status and namespace builders. One batch alias, explicit completion route, legacy/custom tests. | `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/retired-roles.spec.ts libs/shared/src/lib/types/task-spec.contract.spec.ts`; `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`; `npx eslint <B files>` |
| C, empty catalog | Write `libs/backend/agent-generation/templates/agents/team-leader.template.md`, `libs/backend/agent-generation/src/lib/**`, `libs/backend/rpc-handlers/src/lib/handlers/{setup-rpc.handlers.ts,setup-rpc.handlers.spec.ts}`. Read A audit, recommendation, selection, storage, rendering, user-origin/quarantine and setup RPC. Delete template after transfer; empty roster/zero selection succeed; custom and legacy paths pass; dead REVIEW_FOCUS prompt removed. | `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/agent-recommendation.service.spec.ts libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts libs/backend/agent-generation/src/lib/services/template-partial-resolver.spec.ts`; `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json`; `npx eslint <C files>` |
| D, UI/docs/manifests | Write `libs/frontend/onboarding/**`, `libs/frontend/chat-ui/**`, `libs/frontend/chat-streaming/**`, `libs/frontend/webview-e2e-harness/**`, `apps/ptah-docs/**`, `agent-pack-manifest.json`, `content-manifest.json`. Read setup RPC contract, wizard empty state, fixtures, docs and manifest generator. No built-in implied; current examples use custom IDs; history renders; manifests match. | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <changed specs>`; `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`; `npx eslint <D files>` |

For UI changes, render the empty state and inspect a screenshot against the existing empty-state design reference. Do not infer quality from source checks. No e2e run in this lane.

## Gates

1. Role census without `--update` exits 0 and meets bucket ceilings. Search all 14 slugs in orchestration skill, lane-routing and cli-agent-runtime; permit only alias/legacy reads and intentional fixtures.
2. `npm run validate-skill` passes. Compare relative file lists and bytes of both orchestration skill trees and both command copies. Check renamed links and phase frontmatter.
3. `npm run manifest:generate` followed by `npm run manifest:check`; inspect intended diff. These named gates are permitted, unlike build/package targets.
4. Degradation audit in check mode exits 0 without baseline edit. Run focused Jest, TypeScript and ESLint checks sequentially. Confirm Electron and CLI alias/custom paths.
5. Review final diff for generated agent/history safety, guidance transfer, and no active workflow role names. No commit or push in this lane.

## Risks and open questions

| Risk/question | Recommendation |
| --- | --- |
| One slug represents batch and completion | Keep one `batch` alias; dispatch completion by workflow state and test both. |
| Unique template or user-clone rule has no destination | Block deletion until transferred or explicitly documented as non-general; publish no private content. |
| Empty catalog breaks wizard or removes custom agents | Preserve zero-selection success, show empty state, test custom selection and existing files. |
| Validator/manifest still requires deleted paths | Update validator before deletion; generate manifests after paths settle. |
| Broad census ceilings beyond templates | Record exact post-batch counts and use direct workflow search as semantic gate. |
| Historical fixtures name roles | Keep compatibility cases; replace only examples shown as current catalog. |

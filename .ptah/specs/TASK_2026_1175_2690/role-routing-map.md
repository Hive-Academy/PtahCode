# Role routing map at 803b7bd8b

Scope: current-tree replacement for surfaces 5 and 6 of `role-reference-map.md`. Step 1 retires backend/frontend/devops implementers; step 2 retires logic/style/visual reviewers and tester; step 3 retires PM, architect, researcher, writer, designer, modernization detector; step 4 retires team leader. The compatibility appendix calls this an optional legacy path; active routing uses phase kinds (`plugins/ptah-core/skills/orchestration/references/agent-catalog.md:109-115`).

## A. Routing and dispatch source

`git grep -n -E` over the 14 slugs in `libs apps ':!*.spec.ts'` was used, followed by reads of the routing and dispatch hits. The old map's `DEFAULT_ROLE` and `BUILTIN_SUBAGENT_ROLES` in `phase-plan.ts` are **absent** at this HEAD. The host coordinator also no longer imports or filters with `BUILTIN_SUBAGENT_ROLES`; it deduplicates whatever `source.roles()` returns (`libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.ts:688-693`).

| Current file:line | What it does and value path | Phase 4 action |
| --- | --- | --- |
| `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:300-313`; `ranking/candidate.types.ts:120-134` | `candidatesFor` creates `subagent:<phase kind>` with `phaseKind` when `phase.role` is absent. An explicit `phase.role` only becomes `subagent:<role>` when present in gathered roles. | All steps: keep kind default and user-authored explicit role path. Resolve retired explicit slugs through one alias table before the availability check; never synthesize a retired agent. |
| `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:149,192`; `pipeline/assemble-gate.ts:182-188` | The explicit-role flag is tracked for scoring/decision; assembly forwards candidate `role` or `phaseKind` to the chosen executor. | All steps: preserve distinction for user-written roles; return `phaseKind` for retired aliases. |
| `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts:24`; `contracts/route-decide-result.schema.ts:75-103` | Request permits optional `phase.role`. Result permits either `executor.role` or `executor.phaseKind` for a subagent. | All steps: schemas already support neutral dispatch; keep user role, map retired alias to phase kind. |
| `libs/backend/lane-routing/src/lib/ranking/capability.ts:16-23`; `ranking/hard-constraints.ts:119-163,253-260` | Capability and reviewer-family checks use phase kind, candidate tools and executor family. No slug literal remains in hard constraints. | Keep; ensure alias resolution retains the phase kind and browser requirement. |
| `libs/backend/lane-routing/src/lib/task-kind/decision-model-task-kind-classifier.ts:39` | Classifier prompt can receive a request `role`; it does not dispatch. | All steps: pass canonical kind for retired aliases if this input is built from a retired role; keep arbitrary user role text. Caller path not confirmed. |
| `libs/backend/lane-outcomes/src/lib/task-kind-mapping.ts:14-46,48-52,75-86` | Exact legacy role-to-outcome table has 13 retired slugs; `modernization-detector` is absent. `resolveTaskKind` prefers explicit task kind, then phase kind, then role. `ui-ux-designer` maps to outcome `docs`, while its phase is `design`; `visual-reviewer` maps to outcome `review`. | Steps 1-4: replace duplicate slug table with shared alias-to-phase resolution, then phase-to-outcome map. Add modernization alias in step 3; preserve existing outcome semantics. Keep user-written role handling. |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:284,297-302,357`; `agent-process-manager.service.ts:951-955` | Resolved lane `roleDefinition.name` reaches `roleName`; `isReviewerOrTester` detects `*-reviewer` or `senior-tester` to choose default effort. This is lane spawn role, not `phase.role` directly. | Step 2: use lane phase kind (`review`, `visual-review`, `tests`) for retired aliases; retain name rule for user-authored agents when no phase exists. |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:428` | Lane instruction text mentions the `ui-ux-designer` **skill** as an example. It does not route a role. | Step 3: keep the skill reference. |
| `libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.ts:494,688-693` | Advisory candidate list exposes currently available roles. No builtin filter or slug literal. | All steps: retired agents disappear through source inventory; retain user-written roles. |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-caller-phase-filter.ts:12-22` | Authenticated `phaseKind` binding gates phase tool denial. No role slug and no `phase.role` lookup. | Keep; phase dispatch already supplies its input. |
| `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts:58-98` | Generated agent frontmatter deny-list has all 14 slug keys. Unknown user templates receive no policy. This is generation, not active phase dispatch. | Remove each retired generated-agent key at its step; use phase tool profile for active dispatch. Keep unknown user-template behavior. |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts:54-57,258,284,301,317` | Legacy `planning/design/implementation/qa` role arrays and fallback `agent` names construct orchestration namespace requests. These can still select retired slugs. | Steps 1, 2, 3, 4 by slug: route to phase kinds and remove role fallback strings. Preserve a user-specified agent when it names a user-written agent. |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/system-namespace.builders.ts:382,403-410` | Tool help advertises legacy role names by work type. | Steps 1-4: describe phase kinds and available user agents; remove retired names as advertised spawn choices. |

Other `git grep` hits under `libs/` and `apps/` are catalogue, generated-template selection, UI label, contract example, fixture, or documentation text, not another confirmed routing/dispatch branch: `agent-recommendation.service.ts:46-150`, `template-partial-resolver.ts:80-81`, `template-storage.service.ts:228,233,346`, `setup-rpc.handlers.ts:632-723`, `harness-sync` transformer ports and rules, `task-spec.contract.ts`, chat UI/streaming, onboarding, and `apps/ptah-docs/src/content/docs/agents/index.mdx:18-41`. Treat their retirements as their own surfaces in the older map; retain examples only if they clearly refer to user-written agents. The exact behavior of all peripheral hits was not confirmed for this routing-only pass.

## B. Alias and role-path decisions

| Retired aliases | Step | Canonical phase kind | Routing result |
| --- | ---: | --- | --- |
| `backend-developer`, `frontend-developer`, `devops-engineer` | 1 | `implement` | Alias to kind; stop offering generated role. |
| `code-logic-reviewer`, `code-style-reviewer` | 2 | `review` | Alias to kind; keep review discipline in phase text. |
| `senior-tester` | 2 | `tests` | Alias to kind; update lane effort classification. |
| `visual-reviewer` | 2 | `visual-review` | Alias to kind; preserve browser capability. |
| `project-manager` | 3 | `plan` | Alias to kind. |
| `software-architect` | 3 | `architecture` | Alias to kind. |
| `researcher-expert`, `modernization-detector` | 3 | `research` | Alias to kind; modernization remains after-QA research. |
| `technical-content-writer` | 3 | `docs` | Alias to kind; keep same-named skill when required. |
| `ui-ux-designer` | 3 | `design` | Alias to kind; keep same-named skill and browser requirement. |
| `team-leader` | 4 | `batch` in alias table | Appendix also assigns acceptance and `completion` duties; resolve those from the actual phase kind, never from the single alias alone. |

The alias source is the compatibility appendix (`plugins/ptah-core/skills/orchestration/references/agent-catalog.md:117-130`). `phase.role` reaches the explicit-role candidate branch only (`phase-plan.ts:308-312`). A lane spawn role reaches effort selection via `roleDefinition.name` (`agent-process-manager.service.ts:951-955`). `executor.role` is for a selected user-written subagent; the neutral result has `executor.phaseKind` (`route-decide-result.schema.ts:75-103`).

## C. Orchestration skill text

Every line matching one of the 14 slugs inside `plugins/ptah-core/skills/orchestration/**` is below. `team-leader-modes.md` matches because its filename contains the slug; keep the compatibility link until the step 4 text move or rename. Skill names `ui-ux-designer` and `technical-content-writer` remain valid skill IDs where the line requests a skill.

| File | Matching lines and step |
| --- | --- |
| `plugins/ptah-core/skills/orchestration/SKILL.md` | 166, 251: `team-leader-modes.md` link; step 4. |
| `plugins/ptah-core/skills/orchestration/references/agent-catalog.md` | 70: `ui-ux-designer` skill, step 3 review/keep; 71: `technical-content-writer` skill, step 3 review/keep; 117 PM, 118 architect, step 3; 119 team leader, step 4; 120 backend, 121 frontend, 122 devops, step 1; 123 tester, 124 style, 125 logic, 126 visual, step 2; 127 researcher, 128 modernization, 129 designer, 130 writer, step 3. Keep compatibility aliases in one table while removing executable role instructions. |
| `plugins/ptah-core/skills/orchestration/references/fleet.md` | 36: team leader; step 4. |
| `plugins/ptah-core/skills/orchestration/references/git-standards.md` | 113: `team-leader-modes.md` link; step 4. |
| `plugins/ptah-core/skills/orchestration/references/lane-assignment.md` | 75: `team-leader-modes.md` link; step 4. |
| `plugins/ptah-core/skills/orchestration/references/strategies.md` | 269: devops executor alias; step 1. |

The 12 phase files under `plugins/ptah-core/skills/orchestration/phases/` have **no `role` field** (searched `role:` and role text). They also have no matching retired slug line. Windows `bash` could not launch for literal `diff -r` (access denied); a recursive relative-path and SHA-256 comparison found 21 plugin files and **zero differences** against `.claude/skills/orchestration`. Byte identity is confirmed by hashes; literal `diff -r` execution is not confirmed.

## D. Phase contract

`PhaseDefinitionV1` fields are `version`, `kind`, `input`, `deliverable`, `verdict`, `acceptanceStep`, `requiredCapabilities`, `toolProfile` (`disallowedTools`, `permission`), and `discipline` (`method`, `outputContract`, `returnValue`, `refusals`, `escalationProtocol`, optional `reviewerStance`) (`libs/shared/src/lib/types/phase-contract.types.ts:20-42`). It has no role field. Default required capability is `browser` for `visual-review` and `design`, empty for other kinds; an explicit requirement overrides the default (`libs/backend/lane-routing/src/lib/ranking/capability.ts:16-24`). `hard-constraints.ts:253-260` applies this requirement while filtering candidates.

## E. Spec impact estimate

Counts are **unique tracked `*.spec.ts` files** with a literal retired slug for that step, from `git grep -n -E` under `libs/` and `apps/`. A file may appear in multiple steps. These are likely edit/review candidates, not a prediction that every test fails; tests using only phase kinds are outside this count.

| Step | Spec files | Matching lines |
| --- | ---: | ---: |
| 1 | 93 | 650 |
| 2 | 36 | 130 |
| 3 | 27 | 69 |
| 4 | 16 | 73 |

Ten most affected specs by matching lines across the four steps:

| Spec file | Lines |
| --- | ---: |
| `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.spec.ts` | 45 |
| `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts` | 44 |
| `libs/backend/rpc-handlers/src/lib/handlers/skills-synthesis-rpc.handlers.spec.ts` | 41 |
| `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-agent-scope.spec.ts` | 33 |
| `libs/backend/agent-generation/src/lib/services/template-storage.service.spec.ts` | 32 |
| `libs/backend/skill-synthesis/src/lib/spec-harvester.service.spec.ts` | 31 |
| `libs/backend/agent-generation/src/lib/services/wizard-agent-origin.store.spec.ts` | 29 |
| `libs/backend/agent-generation/src/lib/services/template-sharing.guard.spec.ts` | 27 |
| `libs/frontend/setup-wizard/src/lib/services/setup-wizard/wizard-phase-generation.spec.ts` | 27 |
| `libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.spec.ts` | 25 |

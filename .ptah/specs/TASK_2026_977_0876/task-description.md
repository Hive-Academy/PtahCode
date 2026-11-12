# Program definition - TASK_2026_977_0876

Move the workflow from role subagents to phases, skills and sessions.

Author: orchestrator (Claude). Revision: 2. Date: 2026-11-12.

Review: `task-description-review.md` (codex lane, other family than the author). Round 1 verdict:
REVISE, 8 findings. The orchestrator checked findings 1, 2, 4, 5, 6 and 8 in the code and accepted
all 8. Revision 2 contains the changes.

## 1. Goal

Ptah runs every piece of work as a **phase** with a contract. Any executor can run a phase: a
child session, a CLI lane or an SDK subagent. Knowledge comes from **skills** that a registry
supplies by tech stack. Facts of one repository come from the **project guidance**. The 14 role
subagents and the template-based agent generation stop being product concepts.

## 2. Model

| Concept | Meaning | Source |
| --- | --- | --- |
| Phase | What the workflow needs: kind, input, deliverable, verdict, acceptance, required capabilities | The orchestration skill (one definition per phase kind) |
| Skill | Knowledge of a technology or a practice. Provider-neutral | A registry (skills.sh) by tech stack, plus the built-in Ptah skills |
| Project guidance | Facts of one repository (`CLAUDE.md` and equivalents) | The workspace analysis |
| Executor | Who runs a phase: child session, CLI lane, SDK subagent | The router decides, the user can pin |
| Bot | Identity for the persistent case: name, instructions, skill list, model, memory scope, triggers, approval rules | Later, separate feature (Phase 7) |

A role subagent today mixes four things: a phase contract, stack knowledge, repository facts and
an executor type. The program separates them.

## 3. End state

1. The workflow text, the router and the setup name phases, not role titles.
2. The setup installs skills by tech stack and writes the project guidance. It generates no agents.
3. Ptah does not sync agent files to other providers.
4. The 14 role templates do not exist. Their discipline content lives in the phase definitions.
5. A phase runs on any executor that has the required capabilities.
6. The workflow has a general skeleton. The software workflow is one pack of it.

What stays:

- **The workspace analysis.** It feeds the skill selection and the project guidance.
- **The SDK subagent as a runtime function.** The Claude Agent SDK supplies it. A user-written
  `.claude/agents/*.md` file continues to work. Ptah stops generating, syncing and requiring such
  files.
- **Every capability in the parity inventory** that has no approved removal.

## 4. Rules for every phase of the program

1. **No silent removal.** Phase 0 writes `parity-inventory.md` from the old code. A capability
   stays, moves or is listed as a proposed removal. The user approves each removal.
2. **Each phase ships alone.** One child task (`parent: TASK_2026_977_0876`), one worktree from
   `main`, one pull request. The old path continues to work until its retirement step.
3. **Electron first.** Plan, build and verify in `apps/ptah-electron` with the renderer in
   `apps/ptah-extension-webview`. Keep CLI lanes, `platform-cli` and `cli-engine` in operation.
4. **Coupling goes down only.** The role-name census (§8) is the baseline. No phase can increase
   it. Phase 5 brings the non-test count to the approved remainder.
5. **Lane output is evidence, not proof.** The orchestrator checks a capability claim in the code
   before the claim goes into a plan or a report.
6. **Verification:** `npm run verify -- -p <changed projects>` only. No workspace-wide checks. No
   `build`, `serve`, `dev`, `e2e` or `package` targets unless the user asks.

## 5. Program phases

Order: 0 → 1 → 2 → 4 → 5. Phase 3 can run in parallel with Phase 2 after Phase 1. Phase 6 follows
Phase 4. Phase 7 follows Phase 2 and is a separate decision.

### Phase 0 - Inventory and open points (no behavior change)

Scope:

- Write `parity-inventory.md`: each capability that the role subagents, the agent generation and
  the subagent sync supply today. Columns: capability, where today (`file:line`), backing RPC or
  API, decision (keep, move, remove-proposed), new location, test that proves it.
- Include the custom subagent designer of the harness wizard
  (`harness-subagent-design.service.ts`) and its callers in the inventory. See user decision U4.
- Include the non-Electron consumers: the CLI bootstrap (`cli-engine` `harness-boot.ts`), the
  TUI and the docs app.
- Close the open points in §9.
- Record the census baseline and add a check that fails when the count increases.

Deliverables: `parity-inventory.md`, `research-report.md`, the census check.

Acceptance:

- Each of the 14 templates has its sections classified: discipline (moves to a phase definition),
  stack knowledge (a skill covers it, named), repository fact (the project guidance covers it).
- Each open point in §9 has an answer. A code point has `file:line` evidence. A runtime point
  (for example the tool list of a child session) has a measured result from Electron.
- Phase 2 does not start before the measured result for point 2 (browser tools) exists.
- The user approved or rejected each proposed removal.

### Phase 1 - Phase contract

Scope:

- Define the phase contract: kind, input, deliverable, verdict, acceptance step, required
  capabilities, tool profile, and the discipline sections (Method, Output contract, Return value,
  Refusals, Escalation protocol, reviewer stance).
- Give the contract a serialized form with a version. One resolver reads a phase definition and
  returns the text and the tool profile. Phase 2 delivers that result to each executor.
- Write one phase definition per phase kind in the orchestration skill. Move the discipline content
  of the templates there. Keep one source: resolve which skill copy is authored
  (`.claude/skills/orchestration` or `plugins/ptah-core/skills/orchestration`) and generate or
  check the other.
- Add the phase kinds that the team leader supplies today:
  - Mode 1 (decomposition, writes `batches.md`) → phase kind `batch`.
  - Mode 2 (verify and commit each batch) → the acceptance step of the phase contract. The
    orchestrator does it.
  - Mode 3 (completion checks against `parity-inventory.md`) → phase kind `completion`.
- Rewrite the flows of the orchestration skill by phase kind. A role title can stay only as a
  compatibility alias for the default executor.
- Update `PHASE_KINDS`, the task-spec contract, the continuation table and
  `scripts/validate-orchestration-skill.ts`.

Acceptance:

- The orchestration skill describes each flow with phase kinds only.
- A task can run from start to completion with no role name in an orchestrator prompt.
- The subagent path of today continues to work with no change for the user.
- The validator and the routing tests pass.

### Phase 2 - Executor neutrality

Scope:

- **Phase delivery.** Each executor accepts a phase definition and a skill list:
  `ptah_session_start`, `ptah_agent_spawn` and the SDK subagent call. `role` on a lane stays as a
  compatibility input.
- **Existing worktree.** `ptah_session_start` can attach to a registered worktree of the same
  task. The `branch-exists` refusal stays for an unrelated start.
- **Routing.** The child session becomes a routing candidate and a pin target. `DEFAULT_ROLE` goes
  away: a phase kind resolves to a phase definition, not to a role title.
- **Capability rule.** `NEVER_ON_A_LANE_PHASE_KINDS` becomes a required capability (for example
  `browser`) plus a ranking preference. It is not a hard refusal by phase name. A user pin wins.
  The router reads the capability from the effective tool list of the executor at run time, not
  from the executor type. When the capability is absent, the router selects the next candidate
  and records the reason. When no candidate has it, the phase stops with a clear reason.
- **Tool profile.** The deny lists in `subagent-tool-allowlist.ts` move to the tool profile of
  the phase definition. Their purpose is context cost (fewer tool definitions in the start
  prefix), not security. Each executor gets an adapter: `disallowedTools` for the SDK subagent,
  the MCP caller policy for a child session and a lane. Lane permission modes do not cover this
  today (`bypass`, `default`, `plan` only). An executor with no adapter runs with all tools and
  the result records that.
- **One completion verdict** for the three executors: deliverable check, verdict, parent signal.
- **Usage by phase kind.** `session_usage_turns` has no role or phase column. Add a migration and
  the attribution, so that the economics in §8 can be measured.
- **Outcome classification.** `lane-outcomes` `task-kind-mapping.ts` maps role slugs to task
  kinds. Make the phase kind the primary key. Role slugs stay as aliases until Phase 4 removes
  each one.
- **Small fast lookups.** Keep a low-cost path for a short read-only question (the built-in SDK
  subagent or a lane). A child session has a higher start cost.

Acceptance:

- One phase of each kind runs on each executor that has the required capabilities, in Electron.
- A `visual-review` phase runs in Electron on an executor whose effective tool list has the
  browser tools, with screenshots as evidence. On an executor without them, the router selects
  another candidate or stops with a clear reason.
- A phase with a tool profile starts with the reduced tool list on each executor that has an
  adapter. The result names each executor that has none.
- Two sessions of one task work in one worktree without a `branch-exists` refusal.
- The usage ledger gives a total per phase kind and per executor type.

### Phase 3 - Setup: skills by tech stack

Scope:

- The analysis output becomes: a tech stack, a skill search (`skillsSh:detectRecommended`,
  `skillsSh:search`) and an install list. The AI team builder in the setup hub is the base.
- **Relevance gate.** Select a skill only when a dependency proves the technology. Refuse a second
  skill for a subject that an installed skill covers. Keep the consent step for a third-party
  skill that contains scripts.
- **Project guidance** with labeled facts: `follow`, `tolerate`, `do not copy`.
- **Weak repository rules:**
  1. One owner decision at setup: match the repository, or raise the standard.
  2. Scope rule: new code follows the skill. A change to old code stays local unless the task is a
     refactor.
  3. Debt is recorded, not fixed silently.
  4. A phase can give the verdict "cannot verify" and propose a baseline task.
- The setup UI step for agents becomes a step for skills and guidance (Electron first).
- The agent generation stays callable until Phase 5.

Acceptance:

- Setup of this repository selects the Angular, Nx and NestJS skills that the dependencies prove.
  It does not select a Fastify or Vitest skill.
- Setup of a repository with weak practices writes labeled facts and asks for the owner decision.
- No skill is installed without the consent step when it contains scripts.

### Phase 4 - Retire the role subagents, one by one

Sequence:

1. Implementation: `backend-developer`, `frontend-developer`, `devops-engineer`.
2. Verification: `code-logic-reviewer`, `code-style-reviewer`, `senior-tester`, `visual-reviewer`.
3. Definition and knowledge: `project-manager`, `software-architect`, `researcher-expert`,
   `technical-content-writer`, `ui-ux-designer`, `modernization-detector`.
4. `team-leader` last.

For each role:

- The workflow reaches its work through a phase kind.
- The default executor for that phase kind is not `subagent:<role>`.
- The role leaves the catalog, the template folder, the sync, the icon map and the tests.
- One real task ran through the phase on a non-subagent executor, with the result recorded.

Acceptance: each step is one pull request. After step 4, no workflow path names a role.

### Phase 5 - Remove agent generation and subagent sync

Scope:

- Remove the template-based generation (`libs/backend/agent-generation`: templates, selection,
  recommendation, the wizard RPC for agents). Keep the analysis services.
- Remove the agents target of `harness-sync` (`.codex/agents`, `.github/agents`,
  `.cursor/agents`) and the agent transforms (`transform-rules.ts`). Use the artifact retirement
  path (`artifact-retirement.ts`) for files that Ptah wrote.
- Remove the wizard RPC methods for agents (`setup-rpc.handlers.ts`) after Phase 3 replaced their
  UI.
- Remove the agent generation from the CLI composition (`cli-engine` `harness-boot.ts` imports
  `@ptah-extension/agent-generation`).
- Keep `AgentRoleResolver` and the SDK Task lifecycle (`subagent-hook-handler.ts`) for
  user-written agent files.
- Skill scorecards: the grade attribution reads `role` from `lane_outcome_records` where
  `executor_kind = 'subagent'` (`skill-task-grade.store.ts`). Keep the historical keys readable,
  or migrate them. Decide in the plan of this phase.
- The custom subagent designer of the harness wizard: see user decision U4.
- Remove the role list from `ptah_agent_list` and the role vocabulary from shared types, or keep
  the approved remainder for user-written agent files.
- Migration for a workspace that has generated agent files: stop regeneration, leave the files, and offer removal
  with consent (user decision U-D7).

Acceptance:

- A new workspace setup writes no agent file for any provider, in Electron and in the CLI.
- A user-written `.claude/agents/*.md` file continues to work.
- The census reaches the approved remainder.
- The DI guards (`container.smoke.spec.ts`, `expected-resolvable.ts`, `rpc-surface.spec.ts`,
  `surface-composition.spec.ts`) pass after the removals.
- The CLI bootstrap composes and the scoped checks of `cli-engine` and `platform-cli` pass.
- Skill grades recorded before the removal stay readable.

### Phase 6 - General workflow

Scope:

- A skeleton that does not assume software: clarify, plan, do, check, deliver.
- The software workflow (plan, design, batch, implement, test, review) becomes one pack.
- A pack format so that other work types (research, content, operations) can add phases.

Acceptance: one non-software task and one software task run on the same skeleton.

### Phase 7 - Bots (separate decision, not committed by this program)

A bot is an identity for the persistent case. It is a session with a name, instructions, a skill
list, a model, a memory scope, triggers and approval rules. Phases 1 to 6 do not need bots. Start
a separate task after Phase 2 if the user wants this feature.

## 6. Out of scope

- Cloud computers and always-on agents (the infrastructure of the external products).
- Changes to the tribunal skill, other than the names it takes from the orchestration skill.
- The removal of the `fastify-best-practices` and `vitest` skills from this workspace (separate
  item; it needs a user action or approval).

## 7. Decisions

User decisions (final):

| ID | Decision | Date |
| --- | --- | --- |
| U-D1 | Agent generation and the role subagents are not product concepts after this program | 2026-11-12 |
| U-D2 | The workflow describes phases, not developer titles. Any executor can run a phase | 2026-11-11 |
| U-D3 | Skills come from a registry by tech stack. No generation of skills by hand | 2026-11-11 |
| U-D4 | The work of the team leader, the design and the visual review are phases | 2026-11-11 |
| U-D5 | The never-on-a-lane rule is a preference, not a blocker | 2026-11-12 |
| U-D6 | Retire the subagents one by one | 2026-11-11 |
| U-D7 | (was U1) Generated agent files in a workspace that exists: stop regeneration, leave the files, offer removal with consent | 2026-11-12 |
| U-D8 | (was U3) Phase 7 (bots) is a later task, not part of this program | 2026-11-12 |

Open decisions for the user:

| ID | Question | Recommendation |
| --- | --- | --- |
| U2 | After Phase 5, what replaces `role` on a spawn? The user asked: a skills list, or blank? | Three inputs, each with one meaning. `phase` (the phase kind) replaces `role` as the primary input and supplies the discipline text and the tool profile. `skills` is an optional list of skill names; blank is the default and means the executor finds skills by itself. `role` stays only as the name of a user-written agent file. The list holds names, not contents, so its cost is small. It also gives the skill scorecards a clean attribution key in place of the role key. Phase 0 must confirm that each provider CLI loads a skill by name on request |
| U4 | The harness wizard designs 2 to 5 custom subagents from a persona, each with an execution mode (`background`, `on-demand`, `scheduled`) and triggers. Does the removal decision U-D1 include it? | Do not remove it in Phase 5. It is the nearest thing to a bot that Ptah has. Make it the base of Phase 7 and change its output from a subagent to a bot |

Orchestrator decisions are in `decisions.md`.

## 8. Evidence

Executor facts, checked in the code by the orchestrator:

| Fact | Where |
| --- | --- |
| The routing contract is phase-first: `PHASE_KINDS`, optional `role` | `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts` |
| A phase kind maps to a role title | `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:43-58` (`DEFAULT_ROLE`) |
| `visual-review` and `design` are subagent only | `libs/backend/lane-routing/src/lib/ranking/hard-constraints.ts:47-56` |
| A child session start has no role field | `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts:134-146` |
| Depth limit 1 for child sessions | `.../session-children/session-spawner.service.ts:356-361` |
| A new child needs a new branch (`branch-exists`). The host port accepts any worktree path | `.../session-children/child-worktree.provisioner.ts:103-132`, `child-chat-session-host.port.ts` |
| A child session has a staged, advisory budget and a handoff successor | `libs/shared/src/lib/types/session-budget.types.ts`, `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.ts` |
| A subagent has a hard stop (`agentBudget.*`) | `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:21-33` |
| A lane has an `agentBudget` record and a budget stop reason | `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:474,745,1390-1394` |
| The user can send a message to a subagent and to a lane | `libs/shared/src/lib/types/rpc.types.ts` (`subagent:send-message`, `agent:sendMessage`) |
| Agent selection loads all templates with score 100. The analysis changes the text only | `libs/backend/agent-generation/src/lib/services/agent-selection.service.ts:61-94` |
| Agents sync to three provider folders, skills to four | `libs/backend/harness-sync/src/lib/gitignore/harness-state-store.ts:62-83` |
| Agents need a transform for each provider | `libs/backend/harness-sync/src/lib/targets/transformers/transform-rules.ts:340-373` |
| Skills sync with no transform | Not checked in the target code. Phase 0 confirms it |
| The tool deny lists are for Claude agent files only, and their purpose is context cost | `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts:1-24,66-83` |
| The outcome classifier maps role slugs to task kinds | `libs/backend/lane-outcomes/src/lib/task-kind-mapping.ts:13-43` |
| The harness wizard designs custom subagents with execution modes and triggers | `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:25-99` |
| The CLI bootstrap imports the agent generation | `libs/backend/cli-engine/src/lib/bootstrap/harness-boot.ts:42` |
| Skill grade attribution reads the subagent role | `libs/backend/skill-synthesis/src/lib/skill-task-grade.store.ts:167-173` |
| The skills.sh integration exists (search, detect, install, uninstall) | `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts` |

Coupling baseline (lane census, `evidence/coupling-census.md`; class counts are estimates):

- About 224 files and 1,500 role-name lines.
- Non-test TypeScript: 43 files, 200 lines.
- Tests: 137 files, 934 lines.
- Orchestration skill: 212 lines in each of two copies. 5 of 9 files differ between the copies.

Economics baseline (`.ptah/specs/TASK_2026_AGENT_BUDGET/usage-burn-investigation.md`, scan
2026-11-05 to 2026-11-08):

- Subagents are 44.8% of the main Claude weighted cost (212 of 441 files).
- Cached reads are about 68% of the weighted total. A prefix trim saved 1.6% at most.
- The cost driver is requests multiplied by context, not the executor type. A move to sessions and
  lanes changes who pays (other vendors) and gives control (steer, handoff, budget). It does not
  decrease tokens by itself.
- No per-role or per-phase total exists today. Phase 2 adds it.

External products: `evidence/web-trends.md`, `evidence/web-trends-b.md`.

## 9. Open points for Phase 0

The review answered points 4, 6 and 7. The answers from the lane for points 1, 2, 3 and 5 are
partial. The orchestrator did not check them.

| # | Point | State |
| --- | --- | --- |
| 1 | Which copy of the orchestration skill is authored | Open. The validator and one spec read the plugin copy. No copy step was found. Phase 0 selects the source |
| 2 | Does a child session have the browser tools | Open. It needs a measured tool list from Electron. The MCP caller policy puts the browser tools in the privileged class |
| 3 | Which providers can a child session use | Partial. The chat runtime has a Claude SDK branch and a Codex app-server branch. Phase 0 lists the profiles |
| 4 | Do lane permission modes cover the tool deny lists | Answered: no. See Phase 2, tool profile |
| 5 | Who reads the `executor` field of `batches.md` | Open. The task carrier `executor` is parsed and indexed. No parser of the batch field was found |
| 6 | Does the usage ledger have a field for a role or a phase kind | Answered: no. See Phase 2, usage by phase kind |
| 7 | Do the judge and scorecard services depend on role names | Answered: the judge does not. The grade attribution does. See Phase 5 |
| 8 | Which sections of each template are cross-references to other roles | Open |
| 9 | Do skills sync to each provider with no transform | Open |

## 10. Risks

| Risk | Control |
| --- | --- |
| A capability disappears with a role | Parity inventory, user approval for each removal |
| Two skill copies drift again | Phase 1 makes one copy the source and checks the other |
| A registry skill is wrong for the repository | Relevance gate, consent step, labeled facts |
| Session start cost for a small question | Keep a low-cost lookup path (Phase 2) |
| Review quality decreases without the role text | The reviewer stance and the output contract move to the phase definition before a reviewer role retires |
| Large test churn (934 lines) | Retire role by role, one pull request per step |

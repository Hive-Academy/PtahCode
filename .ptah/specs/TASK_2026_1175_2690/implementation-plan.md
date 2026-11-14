# Implementation plan - Phase 4: Retire the role subagents, one by one

Task `TASK_2026_1175_2690`, program `TASK_2026_977_0876`. Author: coordinator (Claude).
Revision 1, 2026-11-14. Status: for parent review before step 1.

Evidence files in this folder:

- `skills-learning-locations.md` (codex lane): code of the skills-learning feature.
- `role-reference-map.md` (Claude Api lane): every tracked reference of the 14 role slugs.
- `role-file-comparison.md` (Claude Api lane): workspace agent file against template, 14 roles.
- `phase2-handover.md`: open items from Phase 2.
- `decisions.md`: P4-1 and later.

The coordinator checked 6 cited locations in the code before this plan used them
(`clone-rebase.service.ts:200-222`, `skill-task-grade.store.ts:160-176`,
`clone-card.component.ts:425-432`, `user-layer-mirror.service.ts:844-856` and `:1195-1220`,
`spec-harvester.service.ts:300-325`). All 6 agree with the lane text.

## 0. Base of the branch (resolved)

Resolved 2026-11-14: with parent approval, the branch was fast-forwarded to `origin/main`
(`803b7bd8b`). The routing facts in §4 and §5 were checked again at this head
(`role-routing-map.md`). The orchestration skill copies are byte-identical at this head.

Spec impact at this head (tracked `*.spec.ts` files with a literal slug of the step): step 1 93
files (650 lines), step 2 36 (130), step 3 27 (69), step 4 16 (73). Step 1 will likely pass the
25-file mark, so its plan must say how it splits (for example, routing and catalog in one pull
request, specs and fixtures in a second).

Original note:

The branch starts at `d94bde57b` (local `main`). Phase 2 (`803b7bd8b`, PR 1174) is on
`origin/main` only, 30 commits later. The skills-learning files are the same in both trees. The
routing files are not: on `origin/main`, `DEFAULT_ROLE` is gone and `candidatesFor`
(`phase-plan.ts:300-314`) adds a phase subagent candidate when `phase.role` is absent.

- Required action: fast-forward the branch to `origin/main` (no commits on the branch yet).
  The session rules forbid a merge of another branch, so the parent must permit it.
- After the fast-forward, rerun surface 5 (routing) and surface 6 (orchestration skill text) of
  `role-reference-map.md` against the new tree. This plan already uses `origin/main` content for
  routing (`git show origin/main:<path>`).

## 1. Model of the change

One host-neutral table holds the retirement state. It grows by one step per pull request.

```ts
// libs/shared/src/lib/types/retired-roles.ts  (new, exported from the shared index)
export interface RetiredRoleV1 {
  readonly slug: string;          // e.g. 'backend-developer'
  readonly phaseKind: PhaseKind;  // alias target, from agent-catalog.md § Compatibility appendix
  readonly step: 1 | 2 | 3 | 4;   // Phase 4 step that retired it
}
export const ROLE_PHASE_ALIASES: Readonly<Record<string, PhaseKind>>;  // all 14 roles
export const RETIRED_ROLES: readonly RetiredRoleV1[];                 // grows per step
export function isRetiredRole(slug: string): boolean;
export function phaseKindForRole(slug: string): PhaseKind | null;
```

- `ROLE_PHASE_ALIASES` holds all 14 roles from step 0. Its values come from the compatibility
  appendix (`plugins/ptah-core/skills/orchestration/references/agent-catalog.md:109-130`):
  `team-leader` → `batch`, `modernization-detector` → `research`, the others as listed there.
- `task-kind-mapping.ts` (`lane-outcomes`) reads role aliases through `phaseKindForRole`, then
  `TASK_KIND_BY_PHASE`. Its own role rows go away in step 0. Result: one alias table, not two.
  The fix also maps `modernization-detector`, which has no row today.
- Each later consumer asks `isRetiredRole` or `phaseKindForRole`. No consumer keeps its own
  list of role slugs.

## 2. Skills learning (user decision U-D13)

Code locations: `skills-learning-locations.md`. Summary:

| Item | Code today |
| --- | --- |
| Library view with Skills, Agents and Commands tabs | `skill-clones-view.component.ts:128`, state `skill-clones-state.service.ts:240`, RPC client `skill-synthesis-rpc.service.ts:135-259` |
| RPC handlers (`skillSynthesis:*`) | `skills-synthesis-rpc.handlers.ts:158-165`, enhance `:345`/`:406`, snapshots and revert `:453-519`, rebase `:535-545`, keep mine `:596-607` |
| Clone storage | `user-layer-mirror.service.ts`: roots `:391-401`, kind switch `:846-857`, history `:1202-1215`. Skill = folder, agent and command = file |
| Diverged state | `user-layer-mirror.service.ts:1850-1874` (file), `:1776-1800` (folder); sidecar `<slug>.ptah-origin.json` |
| Upstream of an agent clone | `clone-rebase.service.ts:217-220`: the workspace file `.claude/agents/<slug>.md` |
| Rebase all diverged | `skill-clones-view.component.ts:698-700`, `:1065`; `clone-bulk-rebase.service.ts:90-103` |
| Enhance body target | `skill-enhancer.service.ts:815-819` (`SKILL.md` for a skill, `<slug>.md` for a file kind) |
| Provider re-sync after a change | enhance and revert only (`skill-enhancer.service.ts:536`, `:769`); rebase and keep mine have none |
| Grades | write `spec-harvester.service.ts:315-322`; attribution `skill-task-grade.store.ts:145-174`; scorecards `skill-scorecard.service.ts:79-88`, `:144-155` |

Facts measured on this machine (counts only, no scope names; decision P4-4, P4-5):

- The scope of this workspace has 14 role clones. All 14 equal their source hash. None is
  `diverged`. `frontend-developer` has 7 history snapshots and `lastEnhancedAt` 2026-10-02.
  `team-leader` has `lastEnhancedAt` 2026-10-02 and an empty history folder.
- All 6 local scopes: 90 role clones, 48 `diverged`, 4 with content that differs from the
  source hash. "Rebase all diverged" can overwrite those 4 today.
- The user-layer clone of `orchestration` has no `phases/` folder. Its source is the downloaded
  `ptah-core` plugin, which predates Phase 1. Phase definitions reach a user only with a
  plugin release that contains them.

### U-D13 (1) Learning actions apply to skills and phase definitions

- A phase definition stays a file of the `orchestration` skill (`phases/<kind>.md`). No new
  registry kind. The Skills tab is the primary surface.
- Add an optional `file` argument to the enhance, snapshot-body and revert RPCs for kind
  `skill`. Accepted values: `SKILL.md` (default) or `phases/<kind>.md` with `<kind>` in
  `PHASE_KINDS`. Parse it with Zod. Check the path with `isInsideRoot`. Refuse any other path
  with a typed `RpcUserError`.
- `skill-enhancer.service.ts:815-819` resolves the body from this argument.
- Before an enhance applies to a phase file, run `resolvePhaseDefinition`
  (`lane-routing/src/lib/contracts/phase-definition-resolver.ts`) on the new text. A parse
  failure refuses the apply and keeps the old file.
- Snapshots and revert stay folder-wide for a skill (the `.history` of the skill folder holds the
  whole folder). Revert of one phase file restores that file from the snapshot.
- Rebase to upstream and keep mine stay folder-wide for a skill. No change.
- UI: the clone drawer of a skill that has a `phases/` folder lists the phase files. Each row has
  enhance, history and revert. The Skills tab is the first tab (`activeKind` starts at `skill`
  today, `skill-clones-view.component.ts:653`). Electron first.
- Rebase and keep mine call the same provider re-sync as enhance and revert
  (gap 5 of `skills-learning-locations.md`).

### U-D13 (2) Learned differences move before a role retires

Two layers (decision P4-4):

- Layer A: workspace agent file `.claude/agents/<role>.md` against its template. Result in
  `role-file-comparison.md`: 6 roles have learned differences (`backend-developer`,
  `frontend-developer`, `code-logic-reviewer`, `code-style-reviewer`, `senior-tester`,
  `software-architect`). 8 roles have generated differences only.
- Layer B: user-layer clone of this workspace scope against its upstream (the workspace file),
  plus its history snapshots. Today: no content difference. `frontend-developer` has 7
  snapshots that the step-1 comparison must read.

Rule for each learned item (target order):

1. A generic discipline rule → the phase definition of its phase kind, in both skill copies
   (byte-identical).
2. A stack rule → the built-in stack skill in `plugins/` (`angular-frontend-patterns`,
   `nx-workspace-architect`, `ddd-architecture`). Only when the skill does not have it.
3. A fact of this repository → no move when the project guidance (`## Project-Specific
   Guidance`, written by `enhanced-prompts.service.ts`) or `CLAUDE.md` already has it. When
   neither has it and the fact is a rule for every executor, add it to `CLAUDE.md`. Else drop
   it, with the reason in the comparison record.

Each step writes `step-<n>-learned-differences.md`: one row per item with source line, target
file and line, or "drop" with the reason. The reviewer checks each row.

### U-D13 (3) New grades key on phase kind, skill and executor

- Migration (next free number in `persistence-sqlite/src/lib/migrations/`): add `phase_kind TEXT`
  to `lane_outcome_records`, and `phase_kind TEXT` and `executor_kind TEXT` to the grade table
  of `skill-task-grade.store.ts`. Old rows keep `NULL`.
- `lane-outcome-recorder.service.ts:173-176` persists `phaseKind`. Today it only feeds
  `resolveTaskKind`.
- `findAttributions` adds lane rows of every executor kind that carry a phase kind, with subject
  kind `phase` and slug = the phase kind. The skill attribution of skill invocations stays.
  The role attribution (`executor_kind = 'subagent'`, registry kind `agent`) stays for
  user-written agent files.
- Read path: `skill-scorecard.service.ts` shows phase scorecards. A role grade (subject kind
  `agent`, slug in `ROLE_PHASE_ALIASES`) shows under its phase kind as a legacy row. No rewrite of
  stored rows.

### U-D13 (4) Agents tab: user-written files; a retired role is read-only history

- Backend: enhance, revert, rebase, keep mine and save refuse kind `agent` with a slug for which
  `isRetiredRole` is true and the upstream is a Ptah-generated file. Typed `RpcUserError` with
  code `role-retired`. List, history and snapshot body stay readable.
- A user-written file with the same slug is not refused. Step 0 locates the marker that
  separates a Ptah-generated file from a user file (the generation manifest or sidecar). If no
  reliable marker exists, the refusal applies to the slug, and the plan of the step records it.
- UI: the clone card shows a "Retired role" badge and history only. It does not show "Rebase to
  upstream", "Keep mine", enhance or revert (`clone-card.component.ts:429`, `:445`, and
  `clone-action-gating.ts`).

### U-D13 (5) "Rebase all diverged" skips the 14 role files

- From step 0: `clone-bulk-rebase.service.ts:90-103` and the eligibility filter
  (`skill-clones-view.component.ts:698-700`) exclude every slug in `ROLE_PHASE_ALIASES` of kind
  `agent`. The backend refuses a bulk-origin rebase for those slugs too.
- A single "Rebase to upstream" stays for a role that has not retired. The user starts it on one
  card. It is not part of a bulk run.
- After a role retires, (4) removes the single rebase for it.

### Provider copies (U-D13 decision 5)

- The sync of provider copies stays for user-written agent files (`harness-manifest.builder.ts:770-790`,
  `rival-targets.ts:13-15`).
- When a role retires, the harness sync stops writing new copies of its Ptah-generated file.
  Copies that exist stay (user decision U-D7, U-D12). Phase 5 removes the agents target and uses
  `artifact-retirement.ts` with consent.

## 3. Phase 2 hand-over items

| Item (`phase2-handover.md`) | Step | Plan |
| --- | --- | --- |
| §1 Machine capability field in the 12 phase files | 0 | New contract field `machineCapabilities: [browser]` (optional, default `[]`) in `PhaseDefinitionV1`; bump the serialized contract to version 2 and keep version 1 readable. Fill it in the 12 files in both copies (`visual-review` and `design` get `[browser]`). Strict parse in `resolvePhaseDefinition` (unknown token = error). The route request producer sends it. Remove the default table in `capability.ts` (`requiredCapabilities`). Update `scripts/validate-orchestration-skill.ts` |
| §2 Role aliases (`phase.role`, lane spawn `role`, task-kind role slugs) | 0 to 4 | Step 0 moves the task-kind role rows to `ROLE_PHASE_ALIASES`. Each step: a retired slug in `phase.role` or in a lane spawn `role` resolves to its phase kind (phase subagent candidate, phase text), not to `subagent:<role>`. A user-written agent file with another name still works (U-D9) |
| §3.1 Deny channel for built-in tools of non-Claude CLIs | 0 (research), then the step that needs it | A research lane reads the current CLI options of codex, grok, antigravity, cursor, copilot, opencode and gives a table: deny flag or config key, version, evidence. Only a channel that the vendor documents gets an adapter. Others stay `unfiltered` and named in the result |
| §3.1 result (`deny-channel-research.md`, 2026-11-14) | Later step or follow-up task | Documented deny channels exist for grok (`--disallowed-tools`, `--disable-web-search`), copilot (`--excluded-tools`, `--deny-tool`), pi (`--exclude-tools`), opencode (V2 `permissions` in `OPENCODE_CONFIG_CONTENT`), antigravity and cursor (`permissions.deny` settings; per-run channel not confirmed), codex (`-c web_search="disabled"`, feature flags; no general per-tool deny). The coordinator checked the grok and copilot flags in the local `--help`. No code in step 0. Proposal: one follow-up task, copilot, grok and pi first |
| §3.3 Large snapshot in `effective-tool-list.spec.ts` | 0 | Replace the full-definition snapshot with an ordered name list plus one schema hash per tool |
| §3.3 Usage totals with no RPC or UI | 0 (RPC only) | Add a read-only RPC `usage:getDimensionTotals` over `getUsageDimensionTotals`, with the RPC guard specs. UI is out of Phase 4 scope unless the parent asks |
| §3.4 Deferred full-diff findings | - | The copied note has none ("To be filled"). Ask the parent for the final Phase 2 note |

## 4. Work for each retired role

Each step does these items for each role of the step:

1. Learned differences: write `step-<n>-learned-differences.md` (§2 (2)) and move the items.
2. Add the role to `RETIRED_ROLES`.
3. Workflow text: the orchestration skill (both copies) names the phase kind, not the role. The
   row of the role in the compatibility appendix becomes "retired, alias of `<kind>`".
   `scripts/validate-orchestration-skill.ts:112-125` loses the role.
4. Routing (checked at `803b7bd8b`, `role-routing-map.md`):
   - `phase-plan.ts:308-312` (`candidatesFor`): a retired slug in `phase.role` becomes
     `toPhaseSubagentCandidate(phaseKindForRole(slug))` before the `gathered.roles` check. A
     retired agent is never synthesized. A user-written role keeps the explicit path.
   - `assemble-gate.ts:182-188`: returns `executor.phaseKind` for a retired alias.
   - `lane-spawn-policy.ts:297-302` (`isReviewerOrTester`, step 2): use the lane phase kind
     (`review`, `visual-review`, `tests`). Keep the name rule only for a user-written agent with
     no phase.
   - `decision-model-task-kind-classifier.ts:39`: send the phase kind for a retired alias. The
     caller path is not confirmed. The step plan confirms it.
   - `orchestration-namespace.builder.ts:54-57`, `:258-317`: the role arrays and fallback
     `agent` names become phase kinds.
   - `system-namespace.builders.ts:382-410`: the help text names phase kinds.
   - No change: `hard-constraints.ts` and `host-routing.coordinator.ts` have no slug literal at
     this head (`BUILTIN_SUBAGENT_ROLES` is gone). `cli-adapter.utils.ts:428` names the
     `ui-ux-designer` skill, not the role. `mcp-caller-phase-filter.ts` uses `phaseKind` only.
   - `team-leader` maps to `batch`. Acceptance and `completion` come from the real phase kind,
     never from the alias alone.
5. Catalog: remove the role from the setup catalog (`setup-rpc.handlers.ts:632-723`), the
   recommendation list (`agent-recommendation.service.ts`), the tool allow list
   (`subagent-tool-allowlist.ts:63-82`), the `ptah_agent_list` text
   (`system-namespace.builders.ts:382-410`), `orchestration-namespace.builder.ts`,
   `task-spec.contract.ts`, `agent-pack-manifest.json` and prompt text
   (`ptah-core-prompt.ts:126`, `prompt-catalogue.ts`).
6. Template: delete `templates/agents/<role>.template.md`. The `_shared` partials stay until no
   template uses them.
7. Sync: the harness sync writes no new copy of the Ptah-generated file of the role (§2).
8. Icon map: remove the role from `AGENT_ROLE_ICONS` (`agent-marks.ts:122-135`). The `Bot`
   fallback covers old records.
9. Tests and fixtures: update the specs that name the role. Add specs for the retired path
   (alias resolution, read-only refusal, bulk skip, sync skip).
10. Docs: `apps/ptah-docs/src/content/docs/agents/built-in-agents.md` loses the role.
11. Real task: one real task runs through the phase on a non-subagent executor (CLI lane or
    child session). Record it in `step-<n>-real-task.md`: task, phase kind, executor, verdict,
    deliverable, outcome row.
12. Census: the role census must go down by the planned amount only (§6).

The tracked generated files of this repository (`.claude/agents/<role>.md`,
`.codex/agents/<role>.toml`, `.opencode/agent/<role>.md`) stay. U-D12 says that existing
generated files stay until the user agrees to a cleanup. Question Q2 asks the parent.

## 5. Steps

Each step is one pull request against `main`. A step starts after the previous one merges, on a
new branch from `main` in this worktree line, or on a new worktree if the parent prefers.

### Step 0 - Foundation (no role retires) - two pull requests

Approved by the parent (Q1): step 0 is its own work, foundation only, no role removed. The
estimate is more than 25 files (0a alone touches about 27), so step 0 is split into two pull
requests (decision P4-12). 0b starts after 0a merges.

**Step 0a pull request: alias table, bulk-rebase skip, read-only guard, grade keys.**

| Batch | Scope | Executor | Reviewer family |
| --- | --- | --- | --- |
| 0a-1 | `retired-roles.ts` (shared) + `task-kind-mapping.ts` on the alias table + specs | Claude Api | codex |
| 0a-2 | Bulk rebase skip (§2 (5)) + backend refusal + retired-role guard (empty `RETIRED_ROLES`) + UI gating + specs | Claude Api | codex |
| 0a-3 | Grades: migration, phase-kind persistence, attribution, scorecard read path (§2 (3)) + DI guard specs | codex | Claude Api |

0a-1 goes first. 0a-2 and 0a-3 are file-disjoint after 0a-1.

**Step 0b pull request: phase-file learning, machine capability field, snapshot check, usage
totals RPC.**

| Batch | Scope | Executor | Reviewer family |
| --- | --- | --- | --- |
| 0b-1 | Learning on phase files (§2 (1)) + re-sync after rebase and keep mine + specs | Claude Api | codex |
| 0b-2 | Machine capability field (§3 §1), both skill copies, validator, remove default table | codex | Claude Api |
| 0b-3 | Small snapshot check, usage totals RPC + RPC guard specs | Claude Api | codex |

**Research deliverable, no code:** `deny-channel-research.md` (§3 §3.1). It runs in parallel with
0a. It changes no code in step 0.

Lane choice: codex is at 90% of its weekly limit (reset 2026-11-17). Glm and kimi code are at
their limit. Claude Api implements most batches. codex reviews them, and the families stay
different. At most 3 lanes run at one time.

Electron check (both pull requests), from a throwaway worktree of the head:

- 0a: Library view, Agents tab, a role clone in the diverged list. "Rebase all diverged" skips
  it. A single "Rebase to upstream" still works for a role that has not retired.
- 0b: Skills tab, orchestration skill drawer with phase files, enhance and revert of
  `phases/review.md`. `ptah_route_decide` for `visual-review` chooses a candidate with browser
  tools, and a pin to one without them names the missing capability (PR 1174 B8 step 4). Read
  the usage totals per `phase_kind` and `executor_type` through the new RPC (B8 step 6).
- Both: `ptah_agent_list` (B8 step 1). One phase of each changed kind on one CLI lane and one
  child session, with verdict, deliverable check and phase kind (B8 step 2). B8 steps 3 and 5
  are not touched by step 0. The test plan names them as not run.

PR body of each step states: the tracked generated agent files stay for retired roles until the
user approves their removal (U-D12). The sync writes no new copies of them.

### Step 1 - Implementation roles

Roles: `backend-developer`, `frontend-developer`, `devops-engineer` (all → `implement`).

- Learned differences: `backend-developer` and `frontend-developer` have layer A items.
  `devops-engineer` has none (unfilled wizard section). Read the 7 layer B snapshots of
  `frontend-developer`.
- Most items are repository facts that the project guidance has. Generic items go to
  `phases/implement.md` and `phases/review.md`. Stack items go to `angular-frontend-patterns`,
  `nx-workspace-architect` and `ddd-architecture` when absent.
- Real task: one small `implement` phase on a codex lane or a child session.

### Step 2 - Verification roles

Roles: `code-logic-reviewer`, `code-style-reviewer` (→ `review`), `senior-tester` (→ `tests`),
`visual-reviewer` (→ `visual-review`).

- `lane-spawn-policy.ts:298-302` (`isReviewerOrTester`) changes to the phase kind.
- Reviewer-family rule: it must read the phase kind, not the `-reviewer` suffix.
  `hard-constraints.ts:119-163` already uses the phase kind and executor family. No change.
- Real task: one `review` phase on a lane, one `visual-review` phase in Electron on an executor
  with browser tools (screenshots as evidence).

### Step 3 - Definition and knowledge roles

Roles: `project-manager` (→ `plan`), `software-architect` (→ `architecture`),
`researcher-expert` and `modernization-detector` (→ `research`), `technical-content-writer`
(→ `docs`), `ui-ux-designer` (→ `design`).

- The skills `ui-ux-designer` and `technical-content-writer` stay. Only the role subagents of the
  same names retire. Each change must keep the skill paths (`plugins/ptah-core/skills/...`) and
  the `Required Skills:` names. The census treats the skill files as bucket `skills`; the plan
  of step 3 lists the expected count change per bucket.
- `task-spec.contract.ts` deliverable names (`task-description.md`, `design-spec.md`,
  `content-specification.md`) stay. Only the role names go.

### Step 4 - `team-leader`

Role: `team-leader` (→ `batch`, with acceptance step and `completion`).

- `references/team-leader-modes.md` becomes a phase reference for `batch` and `completion`.
- `scripts/validate-orchestration-skill.ts:141`, `:171`, `:776` lose the special case.
- Acceptance of Phase 4: no workflow path names a role. Check with the census and with
  `git grep` for the 14 slugs in `plugins/ptah-core/skills/orchestration`, `libs/backend/lane-routing`
  and `libs/backend/cli-agent-runtime` (only `ROLE_PHASE_ALIASES` and legacy-read code remain).

## 6. Gates for each pull request

- Role census: `tools/role-census` exits 0. Never `--update`. A step lowers a bucket only by the
  planned amount. Each step plan lists the expected new count per bucket before the first batch.
- `npm run validate-skill` and `npm run manifest:check` pass.
- Degradation audit exits 0 with no baseline edit.
- `plugins/ptah-core/skills/orchestration` and `.claude/skills/orchestration` are byte-identical
  (`diff -r`).
- Scoped `npm run verify -- -p <changed projects>`, plus `typecheck-templates` for
  `ptah-extension-webview` after a template change. DI guard specs updated when a service or an
  RPC method changes (`container.smoke.spec.ts`, `expected-resolvable.ts`,
  `rpc-surface.spec.ts`, `surface-composition.spec.ts`).
- Independent review: reviewer family is not the implementer family.
- Electron step list in the test plan. Green CI. Mark ready only after all batches and a
  full-diff review. The parent merges.

## 7. Questions for the parent

- Q1: Permit step 0 as its own pull request? Recommendation: yes. Fallback: step 0 batches go
  first in the step 1 pull request.
- Q2: Do the tracked generated agent files of this repository stay for each retired role
  (`.claude/agents`, `.codex/agents`, `.opencode/agent`)? Recommendation: they stay until the
  user approves a cleanup (U-D12). Note: while `.claude/agents/<role>.md` exists, the host lists
  the role, so the retired-slug alias rule (§3 §2) is necessary.
- Q3: Permit the fast-forward of this branch to `origin/main` (§0)?
- Q4: Repository facts from role files: add missing ones to `CLAUDE.md`, or drop them when the
  project guidance has them? Recommendation: drop when present, add to `CLAUDE.md` only when the
  fact is a rule for every executor and is absent.

## 8. Risks

- Step order conflicts: `setup-rpc.handlers.ts`, `agent-recommendation.service.ts`,
  `subagent-tool-allowlist.ts`, `agent-marks.ts`, the orchestration skill files and many specs
  change in each step. Each step starts from the merged `main`.
- A plugin release is needed before users can learn on phase files (the clone of
  `orchestration` has no `phases/`). Step 0 does not depend on it for tests (fixture skill
  folder).
- The generation marker of a Ptah-written agent file is not located yet (§2 (4)).
- Lane availability: grok and antigravity cannot run with `auto-edit` here (P4-3). codex and
  Claude Api are the working lanes. Reviewer family must differ from the implementer.

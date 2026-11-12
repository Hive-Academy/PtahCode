# Document review - task-description.md (revision 1)
Author: orchestrator (Claude). Reviewer: codex lane. Round: 1.

## Verdict
REVISE — custom subagent generation and CLI bootstrap are outside the removal scope; several acceptance checks lack effective runtime contracts.

## A. Fact check
| # | Claim | Result | Evidence (file:line) |
| --- | --- | --- | --- |
| 1 | Routing phase-first; role optional | CONFIRMED | `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts:4,33-34` |
| 2 | Phase kind maps to role | CONFIRMED | `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:43-57,312-315` |
| 3 | Visual review/design subagent-only | CONFIRMED | `libs/backend/lane-routing/src/lib/ranking/hard-constraints.ts:44-49,157` |
| 4 | Child start has no role field | CONFIRMED | `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts:134-146` |
| 5 | Child depth limit one | CONFIRMED | `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:359-360` |
| 6 | New branch required; host takes worktree path | CONFIRMED | `libs/backend/cli-agent-runtime/src/lib/session-children/child-worktree.provisioner.ts:103-135`; `child-chat-session-host.port.ts:28` |
| 7 | Child staged advisory budget and handoff | CONFIRMED | `libs/shared/src/lib/types/session-budget.types.ts:4-16,35`; `session-spawner.service.ts:2251-2254` |
| 8 | Lanes and subagents hard-stop via agentBudget | WRONG | `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:21-33` proves subagent stop only; cited file does not establish CLI-lane hard stop. |
| 9 | User can message subagent and lane | CONFIRMED | `libs/shared/src/lib/types/rpc.types.ts:1614,1784` |
| 10 | Selection loads all templates, score 100 | CONFIRMED | `libs/backend/agent-generation/src/lib/services/agent-selection.service.ts:4-5,70-86` |
| 11 | Agents sync to three formats; skills four folders, untransformed | WRONG | `libs/backend/harness-sync/src/lib/gitignore/harness-state-store.ts:62-83` records destinations/state, not transform behavior. `libs/backend/harness-sync/src/lib/targets/transformers/transform-rules.ts:340-373` shows agent transforms. Cite target implementations for the rest. |
| 12 | skills.sh search/detect/install/uninstall exist | CONFIRMED | `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts:166-172,237,360,794` |

## B. Open points

### 1. Authored orchestration copy
Not settled. The plugin copy is the validated copy: `scripts/validate-orchestration-skill.ts:148-154`, `libs/backend/vscode-lm-tools/src/lib/code-execution/lane-rule-single-home.spec.ts:17-19`. `surface-catalog-reference.spec.ts:33` also reads the plugin tree, for another skill. Read-only `git log --oneline -5 -- <path>` on each copy shows different recent histories but no authoring direction. Targeted search found no copy step. Phase 0 must choose a source.

### 2. Child browser tools
Needs Phase 0 effective-tool-list check. `mcp-caller-policy.ts:104-137` classes browsers as privileged. The child connects MCP when present (`chat-session.service.ts:1443-1465`), but root retention may fail and report tools unavailable (`session-spawner.service.ts:752-777`). The reads do not prove a privileged child token and browser tools in its actual list.

### 3. Child providers
The child inherits chat account selection and launches through the chat runtime (`child-chat-session-host.adapter.ts:105-129`; `chat-session.service.ts:1432-1467`). That runtime has Claude SDK and Codex app-server branches (`chat-session.service.ts:1754-1781`). Both are possible where the workspace account/model gate accepts them; exact provider profiles need Phase 0 enumeration.

### 4. Lane modes and role tool limits
No. Lane levels map to bypass/default/plan (`libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts:260-278`), not per-tool denies. `subagent-tool-allowlist.ts:33-74` denies browser, Ptah web search and Firecrawl for six planning/review roles; Firecrawl only for six builder/content/design roles; nothing for visual-reviewer/researcher-expert. Unknown roles get no restriction (`:79-101`).

### 5. batches.md executor readers
Not settled as an execution input. `libs/shared/src/lib/types/task-spec.contract.ts:269,404-405` defines/writes optional task executor; `libs/backend/task-specs/src/lib/task-writer.service.ts:421,525` writes it; `task-frontmatter.ts:408-410` parses task frontmatter and `task-index.store.ts:345-358` indexes it. These do not prove that `batches.md` executor is parsed or routed. Trace its parser in Phase 0.

### 6. Usage ledger column
No role or phase-kind column in the full `session_usage_turns` schema, `libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:45-66`. It has provider, model, workspace and host. Phase 2 needs migration and attribution.

### 7. Judge/scorecard roles
Judge criteria are skill-quality based; no built-in role-title map (`libs/backend/skill-synthesis/src/lib/skill-judge.service.ts:138-142,340-358`). Scorecards are keyed by agent-clone slug (`skill-scorecard.service.ts:76-100`); grade attribution uses `role` and agent registry rows (`skill-task-grade.store.ts:167-173`). There is agent-slug coupling even without literal titles.

## C. Findings

1. **Blocking — §5 Phase 5.** Custom subagent generation remains: `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:48-82` designs 2–5 custom role subagents. The user's end state in `context.md` says agent generation and subagents should cease as product concepts. Inventory this path and its callers; put its retirement or explicit approved exception in Phase 5.
2. **Serious — §5 Phase 5.** CLI bootstrap imports agent generation and syncs agents (`libs/backend/cli-engine/src/lib/bootstrap/harness-boot.ts:42,64,103-122`). The acceptance checks cover Electron DI but not CLI composition. Add a CLI bootstrap and platform-cli acceptance check before removal.
3. **Serious — §5 Phase 2.** Capability routing needs an effective runtime probe. A child may lack MCP tools (`session-spawner.service.ts:752-777`), while router exclusion is phase-name based (`hard-constraints.ts:44-49,157`). Specify browser availability, refusal/fallback, and Electron visual-review evidence.
4. **Serious — §5 Phases 1–2.** The phase contract has no specified serialized delivery/enforcement path across all executors. Lane modes are broad (`claude-sdk-lane-options.ts:260-278`); current Claude-only frontmatter denies do not translate to CLI/child (`subagent-tool-allowlist.ts:1-24`). Define versioned contract delivery and executor-specific tool adapters.
5. **Moderate — §5 Phases 2/4.** Outcome classification maps role to task kind (`libs/backend/lane-outcomes/src/lib/task-kind-mapping.ts:7-11,46-68`). Migrate it to phase kinds in Phase 2 before removing roles in Phase 4.
6. **Moderate — §5 Phase 5.** Scorecard attribution reads subagent role (`libs/backend/skill-synthesis/src/lib/skill-task-grade.store.ts:167-173`). Specify historical-key preservation or migration; a role-name census cannot prove score continuity.
7. **Moderate — §5 Phase 0.** “Each open point has an answer” is untestable by code citation for runtime MCP availability (`session-spawner.service.ts:752-777`). Permit a measured result and gate Phase 2 on it.
8. **Minor — §8.** Two evidence rows overstate their cited files (A8, A11). Supply separate lane-stop and sync-target citations.

## Uncovered code sites
| Site (file) | What depends on roles / generation / sync | Program phase that should own it |
| --- | --- | --- |
| `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts` | Custom role-subagent generation | 0 inventory; 5 decision/retirement |
| `libs/backend/cli-engine/src/lib/bootstrap/harness-boot.ts` | CLI agent-generation and sync composition | 5 |
| `libs/backend/lane-outcomes/src/lib/task-kind-mapping.ts` | Role-to-task-kind classifier | 2 |
| `libs/backend/skill-synthesis/src/lib/skill-task-grade.store.ts` | Role-keyed historical grade attribution | 5 |
| `libs/backend/harness-sync/src/lib/targets/transformers/transform-rules.ts` | Agent format transforms | 5 |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` | Wizard agent RPCs | 3 transition; 5 removal |
| `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts` | Role icon map | 4 |
| `libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.ts` | User-authored .claude/agents resolution | 5 preserve |
| `libs/backend/agent-sdk/src/lib/helpers/subagent-hook-handler.ts` | SDK Task lifecycle | 5 preserve runtime |
| `libs/backend/harness-sync/src/lib/targets/artifact-retirement.ts` | Owned agent artifact retirement | 5 |

## Decisions
Carry U1–U3 from §7. Preserve user-written agent files and SDK Task runtime; obtain user approval for each generated-file removal. Phase 0 must decide skill source and custom-designer disposition.

## Clarifications Needed
- Does the harness wizard's custom subagent designer fall under the removal decision? The quoted user direction suggests yes.
- Which skill copy is authored, and how is the other synchronized?
- Does Electron/CLI child execution expose browser tools with a privileged caller capability?
- Is `batches.md` executor a programmatic input or prompt-only guidance?

## Extra areas read
Besides requested sites: `scripts/validate-orchestration-skill.ts`; `libs/backend/task-specs/src/lib/{task-writer.service,task-frontmatter,task-index.store}.ts`; `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts`; `libs/backend/skill-synthesis/src/lib/{skill-task-grade.store,skill-scorecard.service}.ts`; `libs/backend/cli-engine/src/lib/bootstrap/harness-boot.ts`. These trace cited evidence and host impact. Read-only git log covered both skill copies. No tests or checks ran.

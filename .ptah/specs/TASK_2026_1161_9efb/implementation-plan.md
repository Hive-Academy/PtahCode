## Findings

- Phase 1 provides a versioned phase definition with required capabilities and tool profile (`libs/shared/src/lib/types/phase-contract.types.ts:20-29`). The resolver returns its validated definition (`libs/backend/lane-routing/src/lib/contracts/phase-definition-resolver.ts:82-108`).
- `ptah_session_start` has no phase, skills or attach input and uses a strict schema (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tool-args.schema.ts:38-62`). Its request crosses `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts:134-146`. The provisioner refuses existing branches/worktrees (`child-worktree.provisioner.ts:103-132`).
- `ptah_agent_spawn` has `role` and `taskKind`, but no phase or skills (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-args.schema.ts:80-100`). Its namespace builder resolves role (`agent-namespace.builder.ts:390-510,570`). The exact SDK subagent call boundary and final advertised tool-list boundaries need discovery before adapter edits.
- Routing uses `DEFAULT_ROLE`, with `BUILTIN_SUBAGENT_ROLES` derived from it (`libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:43-58,310-321`). Candidates cover lanes and subagents; hard constraints ban lanes by phase name (`hard-constraints.ts:47-50,147-158`).
- Old browser deny sets live in `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts:30-53,63-118`. Child completion has turn, verdict and parent envelope (`session-spawner.port.ts:344-415`). Outcome classification uses explicit task kind, then role (`libs/backend/lane-outcomes/src/lib/task-kind-mapping.ts:50-72`).
- Usage rows lack phase/executor columns (`libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:45-69`, S0002). Phase 2 acceptance requires Electron executor runs, screenshots, reduced tools, shared worktrees and usage totals (`.ptah/specs/TASK_2026_977_0876/task-description.md:127-167`).

## Design

Use a versioned phase payload at spawn: phase kind, rendered discipline, definition metadata, optional host-resolved skills and tool profile. B1 probes Codex, Copilot, Cursor and other installed lanes for skill path/text delivery. If a CLI has no skill channel, deliver resolved discipline text and report `skillDelivery: unavailable`; do not claim the skill loaded. Empty skills permits executor selection. A lane's `role` remains a Phase 2 compatibility input for legacy callers and user-written agents; it does not select a default phase executor.

Add registered same-task attach mode for `ptah_session_start`. Compare registry task ID, canonical path and branch. Attached worktrees are non-owned: failure never rolls back their branch or directory. Two sessions may share one attached worktree and branch with distinct identities, transcripts, budgets, completions and parents. Unrelated existing branches still refuse.

Route session, lane and SDK subagent candidates together. Replace role-derived SDK identity with stable phase-kind plus executor ID, without a retired role title. Permit stable session IDs in pins. Resolve phase before ranking. Determine capability from callable effective tools after policy/profile filtering. For an unstarted child, use the host adapter's predicted effective list, then recheck the actual advertised list before execution. If no candidate has a required capability, return `unavailable` with missing capability and candidate reasons, without fallback to an incapable candidate. Apply cost preference only after eligibility; keep low-cost SDK/lane for short read-only work.

Move deny sets into plugin-authored phase definitions and regenerate the `.claude` mirror. SDK maps profile to `disallowedTools`; session and lane apply MCP caller policy before advertising tools. The common adapter result includes `toolProfileStatus: 'filtered' | 'unfiltered'` and `executorId`. An unsupported adapter records `unfiltered` in that result, not just in logs. Verify browser tools remain callable for `visual-review`.

Normalize completion to phase/executor IDs, deliverable check, verdict, parent signal and adapter result. Attribute usage at each producer. Persist nullable `phase_kind` and `executor_type`; old rows remain unknown. Classify outcome by explicit task kind, then phase kind, then legacy role alias.

B1 records the exact SDK call and tool-list boundary files in implementation notes; B4a confirms adapter ownership before editing. B2/B3 may overlap after B1. B5/B6 may overlap after B4. B7 may start after B3 and overlap B5/B6 only if it owns no B6 completion file; otherwise wait for B6. Implementation batches target roughly 20 minutes.

### Census and verification budget

Independent role-name ceilings: skills 466, source 201, test 938, docs 116 (`.ptah/specs/TASK_2026_1161_9efb/context.md:43-51`). Run `npx ts-node --transpile-only tools/role-census/check-role-census.ts` before/after B5 and after each other implementation batch. No bucket rises; no new source line contains a retired role title. Skill edits run `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill`. Verify only changed projects with comma-separated `-p` values. Commands below are future implementation checks; this planning revision runs no npm or git commands.

## Batches

| ID / goal | Write set or output | First read / dependency / verification | Acceptance |
| --- | --- | --- | --- |
| B1 Contract and discovery | `libs/shared/src/lib/types/phase-contract.types.ts`, `libs/backend/lane-routing/src/lib/contracts/phase-definition-resolver.ts`, focused specs; implementation notes naming exact SDK call file, effective-list file per adapter, CLI probe results. Exclude `task-spec.contract.ts`: task-spec storage is unchanged. No spawner port edit. | First read `sdk-query-options-builder.ts`, actual SDK invocation, session/agent schemas, spawner port, phase definitions and installed CLI channels. Verify changed `shared`, `lane-routing`. | Phase payload validates, malformed definition fails before spawn, legacy input works; exact B3/B4 files and per-CLI skill delivery/fallback are recorded before those edits. |
| B2 Session delivery and attach | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tool-args.schema.ts`, session handler/spec; `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts`, `session-spawner.service.ts`, `child-worktree.provisioner.ts`, `session-child.registry.ts` and specs; `ptah_session_start` MCP tool description for phase/skills/attach keys. | B1. Read `session-child.registry.ts` lookup API and host adapter first. Parallel with B3. Verify changed `vscode-lm-tools`, `cli-agent-runtime`. | Two-session same-worktree/branch spec proves separate identities. Attached spawn-failure rollback spec proves branch/worktree retained; owned failure still rolls back. Unrelated branch refuses. |
| B3 Lane and SDK delivery | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-args.schema.ts`, `agent-namespace.builder.ts`, specs; exact SDK call/options file and spec named by B1; `ptah_agent_spawn` MCP tool description for phase/skills keys. | B1 SDK boundary, process spawn request and user-agent loader. Parallel with B2. Verify changed `vscode-lm-tools`, `agent-sdk`. | Lane/SDK receive matching phase text and resolved skills; `role` compatibility works; absent CLI channel records unavailable skill delivery. |
| B4a Adapter discovery | Implementation notes listing exact SDK, session and lane final-advertised-list files, call paths, and disjoint B4 ownership. | After B2/B3. Trace policy to actual callable advertisement. Read-only. | No unknown adapter write set remains before B4b-d. |
| B4b SDK profile | `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts` and spec; plugin phase markdown and generated `.claude` mirror; SDK adapter file/spec named by B4a. | B4a; read old deny sets and SDK `disallowedTools`. Verify changed `agent-generation`, `agent-sdk`; skill validator. | Restricted SDK advertises reduced callable tools; visual review retains browser tools. |
| B4c Session profile | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-caller-policy.ts` and spec; session final-list adapter file/spec named by B4a. | B4a/b; read MCP advertisement. Verify changed `vscode-lm-tools`, `cli-agent-runtime`. | Restricted session list shrinks. Unsupported adapter result asserts `toolProfileStatus: 'unfiltered'` and `executorId`. |
| B4d Lane profile | Lane final-list adapter file/spec named by B4a; no B4c-owned file. | B4a/b; read lane advertisement. May overlap B4c only with disjoint files. Verify changed project. | Restricted lane list shrinks, or result asserts `toolProfileStatus: 'unfiltered'` and `executorId`; browser tools remain callable when required. |
| B5 Neutral router | `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts`, `phase-plan.spec.ts`, `libs/backend/lane-routing/src/lib/ranking/candidate.types.ts`, `hard-constraints.ts`, `hard-constraints.spec.ts`, route schema/result types and focused specs. | B2/B4. Census before and after. Parallel with B6. Verify changed `lane-routing`. | Remove `DEFAULT_ROLE` and role-derived `BUILTIN_SUBAGENT_ROLES`; phase/executor identity adds no retired title. Three executor types and pins work. No-browser-capable-candidate spec returns unavailable with clear missing-browser reason and no fallback. Capable pin wins; cheap read-only route remains. |
| B6 Verdict and outcome | Exact completion notifier/result and lane/SDK adapter files/specs recorded after dependency check; `libs/backend/lane-outcomes/src/lib/task-kind-mapping.ts`, `task-kind-mapping.spec.ts`. Exclude B7 usage files. | First run `ptah_get_dependents` on `task-kind-mapping.ts` and update callers. Change role-only mapping signature to `(explicitTaskKind, phaseKind, role)` or equivalent named input. B2-B4; parallel B5. Verify changed `cli-agent-runtime`, `agent-sdk`, `lane-outcomes`. | All executors check deliverables and emit common verdict/parent signal; classification order is explicit, phase, role; old aliases remain readable. |
| B7 Usage ledger | `libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts`, `session-stats-repository.ts`, `session-stats-repository.spec.ts`, `sqlite-session-usage-sink.ts` and spec; `libs/backend/agent-sdk/src/lib/session-stats/session-usage-ledger.ts` and spec; exact producer/query files found from callers. | B2/B3; inspect S0002 and all SDK/lane/child producers. Reserve S0003: additive nullable `phase_kind`, `executor_type`; add grouping index if query plan needs it. Parallel with B5/B6 only with disjoint files. Verify changed `persistence-sqlite`, `agent-sdk`, producer projects. | Spec opens S0002 DB with old rows, migrates, reads them with null dimensions. New rows group by phase/executor; old rows stay unknown. |
| B8a Matrix specification | `.ptah/specs/TASK_2026_1161_9efb/evidence/executor-matrix.md`. | B5-B7; enumerate phase kinds, installed executors and actual callable capabilities. Documentation step. | Fixed list of each capable cell, evidence and human/Electron operator; blocked cells name capability and reason. Split oversized run into bounded sessions. |
| B8b Visual-review run | Screenshots and matrix records under task `evidence/`. | B8a; human operates Electron. | Each capable visual-review cell has run ID, executor and screenshot of rendered result; browser callable status recorded. |
| B8c Tool-reduction/worktree run | Tool-list snapshots, adapter results and two-session evidence under task `evidence/`. | B8a; human operates Electron. | Reduced advertised tools on supported executors; unsupported results show `unfiltered`; two live sessions safely share registered worktree with separate identities. |
| B8d Usage totals check | Usage query output and reconciled matrix notes under task `evidence/`. | B8b/c; Electron data and human review. | Totals by phase/executor reconcile to observed runs; unresolved cells remain open with exact blocker. |

### File disjointness and scheduling

| Pair | Ownership rule | Schedule |
| --- | --- | --- |
| B2/B3 | Session schema/handler, spawner and registry versus agent-spawn schema, namespace builder and SDK call. No shared edits. | Parallel after B1. |
| B2/B4c/B6 | Session start/attach versus caller policy/final-list versus completion. If B4a finds one file holds two concerns, serialize and record owner. | B4c/B6 after B2. |
| B3/B4b/B6/B7 | SDK call/options versus profile adapter versus completion adapter versus usage ledger. B1/B4a verify exact files; serialize any shared file. | Later edits after B3. |
| B4b/B4c/B4d | SDK/phase markdown, session and lane adapters have separate owners. | B4c/d may overlap after B4b only if B4a proves disjoint. |
| B5/B6 | `lane-routing` versus completion and `lane-outcomes`; specs also separate. | Parallel after B4. |
| B5/B7 | Router versus persistence/usage producer. | Parallel after prerequisites. |
| B6/B7 | Completion adapter may also contain attribution. Assign one owner; B7 excludes that file or waits for B6. | B7 after B3 if disjoint, else after B6. |

## Risks

| Risk | Control |
| --- | --- |
| SDK candidate identity loses role-derived name | Use phase-kind plus executor ID; spec pins/stability; census before/after B5. |
| CLI has no skill channel | Probe each installed CLI; deliver resolved discipline text, record unavailable delivery. |
| Electron matrix too large | Write B8a first, assign operator, split runs and keep unrun cells open. |
| Hidden file overlap | B1/B4a record exact boundaries before edits; enforce disjointness table. |
| Listed browser tool not callable | Check actual effective list and B8b screenshot. |
| Attach admits another task or deletes shared work | Check task ID, canonical path, branch; spec two sessions and attached failure. |
| Policy changes tools after ranking | Predict post-policy list, recheck actual at dispatch, record adapter result. |
| Usage attribution omitted | Inspect SDK, lane, child producers; assign B6/B7 file owner; keep unknown old rows. |
| Role census rises | Move profile data without new retired titles; check independent buckets after each batch. |

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Host resolves phase/skills; each installed CLI is probed | Executor-side lookup | Resolver contract; research point 10 in `.ptah/specs/TASK_2026_977_0876/task-description.md`. | Yes |
| Lane `role` remains compatibility input in Phase 2; default mapping retires | Narrow role to user-written agents now | `.ptah/specs/TASK_2026_977_0876/task-description.md:132-133`; later retirement is Phase 4. | Yes |
| Attach only registered same-task identity | Accept arbitrary path | `.ptah/specs/TASK_2026_977_0876/task-description.md:134-135`. | Yes |
| Capability uses effective callable tools; preference follows eligibility | Ban lane by phase name | `.ptah/specs/TASK_2026_977_0876/task-description.md:138-142`. | Yes |
| Unfiltered status is a result field | Log only | `.ptah/specs/TASK_2026_977_0876/task-description.md:143-148`. | Yes |
| Old usage rows keep null dimensions | Infer historical phase/executor | S0002 lacks both columns. | Yes |
| Update MCP descriptions with strict schemas | Rely on schema alone | `ptah_session_start` phase/skills/attach and `ptah_agent_spawn` phase/skills keys are agent-visible. | Yes |
| Keep low-start-cost lookup | Always open session | `.ptah/specs/TASK_2026_977_0876/task-description.md:155-156`. | Yes |

## Clarifications Needed

None before implementation. B1 and B4a are mandatory discovery gates. A matrix cell without a callable executor remains an explicit acceptance gap with its blocker recorded.

## Proposed Removals

Remove only `DEFAULT_ROLE`, its derived `BUILTIN_SUBAGENT_ROLES` default-candidate use, and the phase-name lane ban. Keep role aliases and user-written agent behavior for compatibility until scheduled retirement.

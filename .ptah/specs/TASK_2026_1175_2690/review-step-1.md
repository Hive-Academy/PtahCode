# Review: Phase 4 step 1 (retire implementation roles)

- Task: TASK_2026_1175_2690, step 1
- Branch: `feat/phase4-step1-impl-roles`, uncommitted changes against `7e8a50496`
- Reviewer: other family (implementer was codex). Read-only review. No `npm run verify`, no `nx`.
- Scope: source, skills, docs and manifests in full. Spec files only lightly, because batch E edits them now.

## Verdict: CHANGES REQUESTED

The main design is correct. The alias table, the routing change and the catalog removals do what
the plan says. Four defects stop the push: one encoding and manifest defect, one changed
orchestration default, one probable degradation-audit failure, and one personal-data file in the
task folder. Two plan items are not done and not recorded as deferred.

## What passes

- `libs/shared/src/lib/types/retired-roles.ts:39-43` adds the three `step: 1` rows. It uses the
  single alias table (`:22-24`). No second table exists.
- `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:312-314` checks a retired slug before
  the `gathered.roles` check. No `subagent:<retired>` candidate is made. The new spec
  (`phase-plan.spec.ts`, `it.each` over the three slugs) proves this, and it proves that
  `custom-agent` keeps the explicit route.
- `decision-model-task-kind-classifier.ts:40-45` sends `implement` in the prompt only. The raw
  role stays in the input record.
- Catalog removals are complete: `setup-rpc.handlers.ts` and `agent-recommendation.service.ts`
  each have 11 entries; `subagent-tool-allowlist.ts`, `agent-pack-manifest.json`,
  `content-manifest.json` file list and `agent-marks.ts` no longer name the three roles. The
  templates folder has 11 templates. The docs claim of 11 agents matches the code.
- No active template, plugin command, or skill still names the three roles, except finding 6.
- Both orchestration trees are byte-identical for `phases/implement.md`,
  `references/strategies.md`, `references/agent-catalog.md` and `commands/orchestrate.md`
  (`cmp`).
- `scripts/validate-orchestration-skill.ts:126-129,558-563` removes the three roles from the
  active list and requires a "Retired; alias of ... implement" row for each. The regex is
  correct for the new rows.
- `step-1-learned-differences.md` routes every Layer A row of the plan and B1-B7. It copies no
  history body, no scope ID and no path. The new paragraph in `phases/implement.md:18` is generic
  and does not repeat `:16`.
- Tracked `.claude/agents`, `.codex/agents` and `.opencode/agent` files are not changed. The
  reap loop skips retired base entries (`workspace-target.ts:673-680`), so existing provider
  copies stay.
- No `any`, `@ts-ignore`, `as unknown as` or `console.*` was added in `libs`. No DI registration
  changed. The CLI and Electron containers both call `registerLaneRoutingServices`, so the
  routing change reaches both hosts.

## Findings

### 1. Blocker: encoding damage and CRLF in `agent-catalog.md` break the content manifest

Evidence:

- `plugins/ptah-core/skills/orchestration/references/agent-catalog.md` and the `.claude` copy
  now contain the text `â€”` six times. At `HEAD` the count is 0. The rows of
  `project-manager`, `software-architect`, `team-leader`, `researcher-expert`,
  `modernization-detector` and `ui-ux-designer` changed only by this damage (diff lines
  117-119, 126-128). The correct character is `—`.
- The same file has CRLF line endings in the worktree (130 lines with `\r`). `.gitattributes:4`
  sets `* text=auto eol=lf`, so the commit stores LF.
- `scripts/generate-content-manifest.js:147-150` hashes raw bytes. The lane regenerated
  `content-manifest.json` (`contentHash sha256:8cf3...`) from the CRLF bytes. A CI checkout has
  LF bytes, so `npm run manifest:check` will report a `contentHash` mismatch.

Fix:

1. Restore the six `—` characters in both copies. Write both files with LF and UTF-8.
2. Confirm `cmp` of both copies and 0 matches of `â€`.
3. Run `npm run manifest:generate` again after the LF rewrite. Then run `npm run manifest:check`.
4. Also convert `agent-pack-manifest.json`, `orchestrator.service.ts` and
   `template-storage.service.ts` back to LF. Git normalizes them on commit, but a CRLF worktree
   copy hides the problem above.

### 2. Major: `orchestration-namespace.builder.ts` now tells the orchestrator to invoke agent `implement`

Evidence: `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts:56`
changes `implementation: ['team-leader']` to `['implement']`. `getNextAction` returns
`{ action: 'invoke-agent', agent: agents[0] }` (`:281-284`, `:298-301`, `:314-317`). No agent
named `implement` exists, so a `Task(subagent_type: 'implement')` call fails. The old value was
`team-leader`, which step 1 does not retire. The change also removes the team-leader
recommendation for the implementation phase. This is a capability loss in this step.

Fix: Revert `:56` to `['team-leader']`. Retire `team-leader` in its own step. If a phase kind
must go into this API later, add a separate action (for example `invoke-phase` with
`phaseKind`). Do not put a phase kind in the `agent` field. Update the spec of this builder.

### 3. Major: new `catch` in `workspace-target.ts` probably fails the degradation audit

Evidence: `libs/backend/harness-sync/src/lib/targets/workspace-target.ts:485-488` is
`catch { return false; }` with a plain comment. `tools/degradation-audit/check-degradation.ts:6,128`
counts a catch that returns `false` as `catch-return-sentinel`, unless a
`// degradation-audit: <kind> - <reason>` marker is present (`:27,102`).
`tools/degradation-audit/baseline.json:18` has `"libs/backend/harness-sync": 6`. One new
unmarked site raises the count above the baseline. No lane ran the audit.

Fix: Replace the comment with
`// degradation-audit: optional-capability - a missing or unreadable sidecar cannot prove Ptah ownership, so the agent stays eligible for sync.`
Run `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`. Do not edit the
baseline.

### 4. Major: same-slug user agents lose routing, mirroring and sync; the code and docs say they keep them

Evidence:

- Routing: `phase-plan.ts:312` uses the slug only. A user-written
  `.claude/agents/backend-developer.md` is never chosen as an explicit candidate.
- Mirror: `user-layer-mirror.service.ts:2338` and `:2491` skip by slug only. A user-written
  workspace file with a retired slug no longer gets a user-layer clone.
- Sync: `workspace-target.ts:477-484` treats a sidecar with `pluginId === null` as "Ptah
  built-in". But `mirrorAgents` writes `{ kind: 'agent', pluginId: null }` for every workspace
  agent, user-written or generated (`user-layer-mirror.service.ts:2497-2501,2510-2515`). So the
  check cannot separate a user file from a generated file. Only a plugin agent or a clone with
  no sidecar stays eligible. The spec case "keeps a formerly managed retired copy after its
  source gains Ptah provenance" tests a no-sidecar clone, not a real user agent.
- The step 0 finding agrees: `rpc-handlers/.../skill-synthesis/retired-role-guard.ts:7-10`
  says no reliable marker exists, so the rule applies to the slug.
- `implementation-plan.md:163-165` accepts a slug rule only when "the plan of the step records
  it". The fact is only in `batch-1-B-result.md`. `step-1-plan.md` "Preserve list" says
  "Explicit user-agent route stays". Both catalog copies say "Legacy records and user-authored
  agents only" (`agent-catalog.md:120-122`). The comment at `workspace-target.ts:476` says "A
  user-authored file without Ptah provenance remains eligible".

Result: this is a real capability loss for a user who wrote an agent with one of the three
names. It is acceptable under the plan, but only as a recorded decision.

Fix:

1. Add a coordinator decision to `step-1-plan.md` and `decisions.md`: the retired-slug rule
   applies to routing, mirroring and sync for workspace agents. A user agent must use another
   name. A plugin agent with the same slug stays eligible.
2. Rename `isRetiredBuiltInClone` to a name that states the real rule (for example
   `isRetiredWorkspaceAgent`). Change the comment at `:476` and the spec title.
3. Change the catalog column text to "Legacy records only; rename a custom agent". Keep both
   copies identical.
4. Add one sentence to `apps/ptah-docs/.../agents/built-in-agents.md:36`: a custom agent with
   one of these names is treated as the retired role; rename it.
5. Optional, for a later step: `.ptah/analysis/<workspace>/generation-manifest.json` lists the
   agents that the wizard generated. Evaluate it as the missing origin marker.

### 5. Major: lane spawn `role` still resolves the three retired roles

Evidence: `implementation-plan.md:192` (§3, row "§2 Role aliases") says that in each step a
retired slug in a lane spawn `role` resolves to its phase kind. `step-1-plan.md` item 4 does not
include it and does not defer it. `libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.ts:50-56,82-91`
lists and loads every file in `.claude/agents`. The tracked generated files stay, so
`ptah_agent_list` still offers `backend-developer`, `frontend-developer` and `devops-engineer` as
roles, and a spawn loads the old role body. No capability is lost, but the retired roles stay
active on this path.

Fix: Choose one:

1. In `AgentRoleResolver`, leave the retired slugs out of `listRoles`. In `resolve`, give the
   `implement` phase text for a retired slug, or throw `unknown_role` with a hint to use the
   `implement` phase. Add a spec.
2. Record an explicit deferral to a named step in `step-1-plan.md`, with the reason.

### 6. Minor: the UI designer handoff skill still recommends `frontend-developer`

Evidence: `plugins/ptah-core/skills/ui-ux-designer/DEVELOPER-HANDOFF.md:498` and
`.claude/skills/ui-ux-designer/DEVELOPER-HANDOFF.md:498`:
`**Recommended Developer**: frontend-developer`. This is active workflow text.

Fix: Change both lines to `**Recommended executor**: the \`implement\` phase`. Keep both copies
identical. Regenerate `content-manifest.json` (after finding 1).

### 7. Minor: a retired role uses the alias kind, not the phase kind

Evidence: `phase-plan.ts:313-314` builds the candidate from `phaseKindForRole(phase.role)`. A phase
with `kind: 'tests'` or `kind: 'docs'` and `role: 'devops-engineer'` gets an `implement`
candidate for a tests or docs phase. The `role === undefined` branch (`:311`) uses `phase.kind`.

Fix: Use `toPhaseSubagentCandidate(phase.kind)` in the retired branch, so that the phase contract
stays the source of truth. Or keep the alias kind and add a spec that states that intent. The
first option is simpler and removes the `null` check.

### 8. Minor: help text lists a phase kind as an agent

Evidence: `system-namespace.builders.ts:402-405` puts `implement` in a list headed
"SPECIALIST PHASES AND AGENTS", next to agent names. An orchestrator can read it as a
`subagent_type`.

Fix: Write `- Development and infrastructure: phase kind \`implement\` (not an agent; route it to a lane, session or phase subagent)`.

### 9. Blocker for the commit: personal data in the task folder

Evidence: `.ptah/specs/TASK_2026_1175_2690/batch-1-E-failures.txt:60,69,79,88,98,108,162` contains
a full user home path with the account name. The repository is public. `step-1-plan.md:78`
contains a local absolute worktree path.

Fix: Do not stage `batch-1-E-failures.txt`. Delete it after batch E, or replace each path with
`<tmp>`. In `step-1-plan.md:78`, replace the absolute path with `<worktree>`. Before the commit,
search all staged task files for home paths.

### 10. Nit: stale examples in comments

Evidence: comments still use the retired slugs as examples:
`agent-generation/src/lib/interfaces/template-storage.interface.ts:59,64`,
`agent-generation/src/lib/types/core.types.ts:37,65,481,496,539`,
`agent-generation/src/lib/types/wizard.types.ts:42`,
`shared/src/lib/types/wizard/recommendations.ts:35`,
`frontend/chat-streaming/src/lib/agent-monitor.store.ts:92`,
`apps/ptah-docs/src/content/docs/agents/index.mdx:10` ("such as backend code").

Fix: Change them to an active role (for example `senior-tester`). This also lowers the census
`source` bucket. Comments about directory layout that use the slug as a file-name example
(`harness-source.port.ts`, `transform-rules.ts`, `user-layer-agents.ts`) can stay.

### 11. Information: gates not yet run

The lanes could not run these checks because of `EPERM` in their sandbox:

- `setup-rpc.handlers.spec.ts` (batch C), `agent-marks.spec.ts` (batch D).
- The role census `tools/role-census/check-role-census.ts` (batches A and D).
- The degradation audit (no lane ran it, see finding 3).
- The real `implement` task of item 11 (`step-1-real-task.md` does not exist yet).

The coordinator must run them, plus `npm run validate-skill` and `npm run manifest:check`
after the fixes, and the scoped `npm run verify` gate. Electron route and CLI route evidence is
still due in batch F.

## Requested order

1. Findings 1, 3 and 9 (gate and publication blockers).
2. Finding 2 (behavior regression).
3. Findings 4 and 5 (record or implement).
4. Findings 6-8 and 10.
5. Run the gates in finding 11.

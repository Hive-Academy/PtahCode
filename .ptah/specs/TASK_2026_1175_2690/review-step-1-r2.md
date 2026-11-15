# Review round 2: Phase 4 step 1 (retire implementation roles)

- Task: TASK_2026_1175_2690, step 1
- Branch: `feat/phase4-step1-impl-roles`, worktree and index against `HEAD` (`7e8a50496`)
- Inputs: `review-step-1.md`, `fix-1-review-result.md`, `batch-1-E-result.md`, decision P4-S1-1
- Read-only review. No `npm run verify`, no `nx`.

## Verdict: CHANGES REQUESTED

The fix lane closed findings 1, 2, 3, 5, 6, 7, 8 and 9. The resolver change is safe for active
roles. One major defect stays: the batch E origin check does not do what P4-S1-1 and the docs
say. The workspace agent source has no origin sidecar in production, so the mirror check is dead
code. The sync check reads the user-layer clone sidecar, and that sidecar is `pluginId: null`
for every workspace agent, so it cannot separate a user file from a generated file.

## Status of round 1 findings

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Encoding damage and CRLF in `agent-catalog.md` | Fixed | 0 matches of `â€` in both copies. Coordinator ran `manifest:check` (exit 0) and `cmp`. |
| 2 | `implementation: ['implement']` in orchestration namespace | Fixed | `orchestration-namespace.builder.ts:56` is `['team-leader']`. The file has no diff against `HEAD`. |
| 3 | Unmarked `catch` in `workspace-target.ts` | Fixed | `workspace-target.ts:486` has the `degradation-audit: optional-capability` marker. Coordinator audit exit 0. |
| 4 | Same-slug user agents lose routing, mirror and sync | Partly fixed | Routing rule is recorded (P4-S1-1, `decisions.md:21`, `step-1-plan.md:167`). Catalog text and docs updated. The new mirror and sync marker does not work. See new finding N1. |
| 5 | Lane `role` still resolves retired roles | Fixed | `agent-role-resolver.service.ts:55,73-81`. See the resolver check below. |
| 6 | UI designer handoff recommends `frontend-developer` | Fixed | `DEVELOPER-HANDOFF.md:498` in both copies: "the `implement` phase". |
| 7 | Retired role uses the alias kind | Fixed | `phase-plan.ts:313-314` uses `toPhaseSubagentCandidate(phase.kind)`. |
| 8 | Help text lists a phase kind as an agent | Fixed | `system-namespace.builders.ts:405`. |
| 9 | Personal data in the task folder | Fixed | `batch-1-E-failures.txt` is gone. A search of the task folder for home paths, drive paths and the account name has 0 matches. |
| 10 | Stale examples in comments | Mostly fixed | The listed source comments have 0 retired slugs. `apps/ptah-docs/src/content/docs/agents/index.mdx:10` still says "such as backend code". See N4. |
| 11 | Gates not run | Accepted | Coordinator ran census, degradation audit, validate-skill and manifest:check (all exit 0). The scoped verify gate is in progress. |

## Resolver check (`cli-agent-runtime`)

The change is safe for active roles and for both hosts.

- `listRoles` (`:55`) only removes retired slugs. Active roles keep the same list and order.
- `resolve` (`:73-81`) throws `unknown_role` for a retired slug before the old code path. For an
  active role, the code after `:81` is the same as `HEAD`: exact match on `file.role`, same
  `no_roles`, `unknown_role` and `role_read_failed` errors.
- `isRetiredRole` normalizes case and space (`retired-roles.ts:50-53`). The exact match at `:91`
  does not. So `Backend-Developer` gets the retired hint, not a plain miss. This is correct.
- All consumers go through `ptahAPI.agent.listRoles()` (`ptah-api-builder.service.ts:845`,
  `agent-tool.dispatcher.ts:992`, `route-namespace.builder.ts:118`, `protocol-dispatcher.ts:1548`).
  The CLI and Electron containers use the same service. The routing `gathered.roles` input also
  loses the retired slugs, which agrees with `phase-plan.ts:313`.
- The resolver has no origin check. A user role file named `backend-developer.md` is rejected.
  This agrees with the slug rule in P4-S1-1, but P4-S1-1 names only "routing". See N3.

## New findings

### N1. Major: the origin marker does not separate Ptah-generated from user-authored agents

Evidence:

- Mirror, seed path: `user-layer-mirror.service.ts:2492-2494` calls
  `isRetiredPtahAgent(slug, agentSourceDir)`. `agentSourceDir` is the workspace `.claude/agents`.
  The check reads `<slug>.ptah-origin.json` in that folder (`:2530-2540`). No production code
  writes an origin sidecar there. Every sidecar writer targets the user layer (`targetDir`,
  `agentsRoot`, `rootDir`, `cloneDir`: `:1101`, `:1209`, `:1360`, `:2167`, `:2555`). The
  workspace `.claude/agents` folder in this repository holds only `.md` files. So the check is
  always `false`. A Ptah-generated retired agent is still mirrored into a new user-layer scope.
- The E spec hides this. `user-layer-mirror.service.spec.ts` ("keeps retired role sources out of a
  new user-layer scope") writes a sidecar into `ws/.claude/agents`. That state does not occur in
  production.
- Mirror, legacy seed: `:2339` reads the sidecar in the flat legacy root. There, `mirrorAgents`
  wrote `{ kind: 'agent', pluginId: null }` for every workspace clone (`:2511-2516`). So the
  check is `true` for user-authored and generated clones alike. Impact is small, because the flat
  originals stay on disk.
- Sync: `workspace-target.ts:452` and `:673-680` read the sidecar beside `agent.sourceFile`. That
  file is in the user-layer `agentsRoot` (`harness-manifest.builder.ts:783`). Its sidecar is the
  clone sidecar with `pluginId: null` for every workspace agent. Result: a user-authored
  `.claude/agents/backend-developer.md` is mirrored, then not projected to `.codex` or
  `.opencode`. Only a file that the user wrote directly into the user layer (no sidecar) stays
  eligible. The comment at `:476` and the docs say otherwise.
- `built-in-agents.md:38` says "Mirror and sync use the Ptah origin sidecar to preserve
  user-authored files". This is false for the sync path, and the mirror path preserves both kinds.

Net effect today: mirror retires nothing. Sync retires every workspace agent with a retired slug,
user-authored or generated. This is the behavior of a plain slug rule on sync, not the decision.

Fix (choose one, then record it in P4-S1-1):

1. Use a real marker. `WizardAgentOriginStore` (`wizard-agent-origin.store.ts`,
   `<harnessRoot>/.ptah/setup-wizard/agent-origins.json`) records each agent that the wizard
   wrote, with its hash. Treat a retired slug as Ptah-generated only when that store has an entry.
   Optionally require that the file still hashes to the recorded value. A missing or unreadable
   store reads as "user-authored", which is the safe direction. Use the same helper in mirror and
   sync. Inject it. Do not read a sidecar beside the workspace file. Change both specs to use the
   store, not a planted sidecar. Note: agents generated before the store existed stay eligible.
   That is no capability loss.
2. Accept the slug rule for sync too. Change P4-S1-1, `built-in-agents.md:38`, the comment at
   `workspace-target.ts:476` and the helper names to say "retired slug with a clone sidecar". Remove
   the dead check in `mirrorAgents` (`:2492-2494`) or keep it with a comment that states it has no
   production effect. Fix the mirror spec so that it does not plant a sidecar in the source folder.

Option 1 matches the program goal (no capability loss). Option 2 is smaller.

### N2. Minor: the sync reap skip reads a sidecar that can be gone

Evidence: `workspace-target.ts:673-680` keeps an old provider copy only when
`isRetiredPtahAgent(..., entry.source)` is `true`. If the user-layer clone and its sidecar are
removed (for example by the orphan reaper), the check is `false` and the copy is reaped. Round 1
said the reap loop keeps existing provider copies. That is true only while the clone sidecar
exists.

Fix: After N1, skip the reap for any `kind: 'agent'` base entry with a retired slug, with no
origin check. A reap skip only keeps a file, so it cannot lose capability. Add a spec case with
the clone removed.

### N3. Minor: P4-S1-1 does not name the lane role path

Evidence: `agent-role-resolver.service.ts:73-81` rejects a retired slug by name, with no origin
check. `decisions.md:21` and `step-1-plan.md:167` name only "routing". The docs
(`built-in-agents.md:38`) do not say that `ptah_agent_spawn { role }` rejects these names.

Fix: Add "lane spawn `role`" to P4-S1-1 and one clause to `built-in-agents.md:38`. Optional:
change the message at `:77` to `Role "<role>" is retired. Use the "implement" phase instead.`,
because "Unknown role" is not correct for a file that exists.

### N4. Nit: one stale example in the docs

Evidence: `apps/ptah-docs/src/content/docs/agents/index.mdx:10`: "such as backend code, UI review,
or research".

Fix: Write "such as testing, UI review, or research".

## Requested order

1. N1 (decide option 1 or 2, then update code, specs, P4-S1-1 and docs together).
2. N2 and N3.
3. N4.
4. After the fixes, run the focused mirror and harness-sync specs, the degradation audit and
   `manifest:check` again.

# Status — TASK_2026_1172_fd37 (Phase A)

Written because `ptah_agent_report` was not delivered (parent-session-not-active).

## 2026-11-14 12:05 — Electron evidence run 6 (items 2-4)

Run from the v2 worktree under the verify lock. All 3 items FAILED, but the harness works now:
MCP connected (chip "MCP 2") and `ptah_agent_spawn` was called once in each item. The failures
come from the spawns.

- **Item 4, PRODUCT DEFECT.** `cli: claude`, `permission: ask`. The spawn result line says
  `Permission: requested ask -> effective none (source: Built-in default)`. The approval prompt
  DID appear (lane card "Needs input, Tool: Bash, Allow / Deny" for
  `echo lane-ask > ask-evidence.txt`). The behavior looks like ask, but the
  requested -> effective display is wrong for the system `claude` adapter:
  `effectivePolicy.permission` is undefined (`mcp-response-formatter.ts:1986`). Screenshot:
  `.ptah/tmp/test-results-4-r6/*/test-failed-1.png`. A fix needs a production change.
  **Decision needed from the parent:** fix in Phase A, or record it as a follow-up.
  Codex lane 1eaa3dd8 (read-only) traces the cause -> `.ptah/tmp/run6-investigation.md`.
- **Item 3.** `cli: codex`, `permission: plan`. Refused with `UNSUPPORTED_LANE_POLICY`
  (field `combination`). The evidence app uses the real HOME, where the saved Codex default
  network is `allow`. Plan + network allow is refused. The parent-plan cap forces network deny,
  but an explicit plan request does not. Options: (a) test-only: add `network: deny` to the
  item 3 prompt; (b) product: an explicit plan request takes network deny. Proposal: (a) plus a
  follow-up note, unless the parent wants (b).
- **Item 2.** `cli: codex`, `permission: auto-edit`. Failed with
  "Tool ptah_agent_spawn failed: Codex context could not be opened" (`codex-runtime.ts:423`).
  The main-process log is in the temp profile, which the spec deletes, so the cause is unknown.
  Codex lanes start normally from the host app. Next step (test-only): keep the profile logs on
  failure and run item 2 again.

### Item 4 cause (confirmed by me from Codex lane 1eaa3dd8, `.ptah/tmp/run6-investigation.md`)

- `AgentSpawnEnvironment.resolveLanePolicy` returns `translateLaneSpawnPolicy(...)`, a wrapper
  `{ requested: EffectiveLanePolicy, permissionMode, ... }` (`agent-spawn-environment.service.ts:185`,
  `lane-spawn-policy.ts:37`).
- `agent-process-manager.service.ts:989` stores that whole wrapper as `AgentProcessInfo.effectivePolicy`,
  which is typed as a flat `EffectiveLanePolicy`. The top-level `permission` / `permissionSource` are
  undefined, so the formatter prints `effective none (source: Built-in default)`.
- Codex lanes are not affected: the Codex SDK handle sets its own flat `effectivePolicy` (line 1133).
- The real level is `ask`: the Claude `canUseTool` callback gets `lanePolicy.requested.permission`, so
  the approval prompt appears.
- NOT display-only: `SystemCliLaneResumer` reads the stored snapshot as `resumePolicy`. A resumed
  Claude lane can lose its `ask` policy.
- The store line is the same on main (line 986). The defect is pre-existing. This PR's new
  requested -> effective line makes it visible.
- Smallest fix (production, NOT applied): line 989
  `effectivePolicy: options.effectivePolicy?.requested,` plus a manager spec: Claude spawn with ask
  -> stored + returned `effectivePolicy` is flat `ask` / `spawn` / `allow`, and resume gets a flat
  `resumePolicy`.

### Item 3 rule (confirmed)

The resolver keeps the saved `network: allow` for an explicit `permission: plan`. The Codex manifest
does not declare plan + allow, so validation refuses `field: combination`. Only the parent-plan cap
forces network deny. The code implements "refuse" on main and here.

PR #1266 stays a draft (head c092fea7c). CI on c092fea7c: only the pre-existing axe failure
(shard 2: 1 failed, 54 passed). No reviews yet. The spec fix (strict mode + MCP 0 retry) is
still uncommitted. It goes into the next harness commit.

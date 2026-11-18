# Implementation plan — TASK_2026_2281_120a

Choose a capable model for child sessions that do code work.

Status: draft, waits for parent approval. Written by the coordinator from its own code reading.
The codex analysis lane (`468f3ba3-…`) had not delivered `analysis.md` when this plan was
written. Differences that it finds go into section 8.

## 1. Facts checked in the code

### 1.1 The ranking rule (root cause of symptom 1)

`libs/backend/lane-routing/src/lib/child-session/child-setting-rule.ts:28-47`
(`rankChildSettings`):

```ts
const strong = /unknown (?:cause|reason)|security|architectur/i.test(brief);
const small  = !strong && /coordinat|\bgit\b|\bci\b|continuous integration/i.test(brief);
if (!strong && !small) return { modelSource: 'default', effortSource: 'default' };
const model = strong ? ordered.at(-1) : ordered[0];   // ordered by strength(), weakest first
return { model, effort: strong ? 'high' : 'low', modelSource: 'ranking', effortSource: 'ranking' };
```

- The input `brief` is `${request.label ?? branch}\n${task}`
  (`session-spawner.service.ts:696`). It is the full task text.
- Every coordinator brief contains "You coordinate task …" and words such as "git".
  The regex `coordinat` matches, so the rule selects `ordered[0]`, the weakest model
  (`strength()` gives `haiku` 0), and effort `low`. This is exactly the observed
  `claude-haiku-4-5-20251001 (ranking); effort low (ranking)`.
- `strength()` (lines 10-26) knows only the words opus/pro/large/strong (2) and
  haiku/mini/nano/flash/small/lite (0). `fable` and `default` get 1 (the "balanced" bucket).
- The rule does not read `phase.kind`, although `SessionChildStartRequest.phase`
  (`session-spawner.port.ts:154`) carries an explicit kind.

### 1.2 The decision model can also go below any floor

`libs/backend/lane-routing/src/lib/child-session/child-setting-router.service.ts:40-168`
first computes the rule result, then asks the decision model (System-One) to choose from
all catalog models and all efforts (`low` … `max`). A valid answer replaces the rule result
with no floor check (lines 145-150). So a fix in the rule only is not sufficient.

### 1.3 The caller of the router

`libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:652-724`
(`routeAndStart`). An explicit `model` is validated first (line 658), then the router runs
when `model` or `effort` is missing. An explicit value already wins (`pin`), which meets
requirement (e) today. The routed model is admitted again with `resolveChildModel`.

### 1.4 The model list (symptom 2)

- `listAgentChildModels` and `resolveAgentChildModel` in
  `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1344-1490`.
  For the native Claude login they read `SdkModelService.getNativeClaudeModels()`
  (`libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts`), which is the SDK
  `supportedModels()` result of the spawned CLI, cached in memory and persisted across
  boots (`restorePersistedCatalog`, stale-while-revalidate).
- The admission check is an exact `acceptedModels.includes(resolvedModel)`
  (line 1459). The catalog that the parent got is
  `default, opus, fable, sonnet, haiku, claude-fable-5-1, claude-haiku-4-5-20251001,
  claude-sonnet-5, claude-opus-5, claude-fable-5, claude-opus-4-8, claude-opus-4-7,
  claude-opus-4-6, claude-sonnet-4-6`. It has no 5.5 ids, so `claude-opus-5-5` is refused.
- The ranking chooses only from this same list (`listChildModels` → `router.route({ models })`).
  So the ranking also can never choose a current-generation id.
- The repository already knows the current ids:
  `libs/shared/src/lib/providers/entries/claude-cli-provider-entry.ts:37-124`
  (`defaultTiers: opus → claude-opus-5-5, sonnet → claude-sonnet-5-5,
  haiku → claude-haiku-5-5`; `staticModels` with `claude-fable-5-2`, context windows).
  The comment says each id was checked with `claude -p`.
- Open point: why the native catalog is old (an old persisted catalog, or an old CLI
  binary). The fix in section 3.3 does not depend on the answer. The lane analysis can
  settle it.

### 1.5 The alias `opus` in this session

This session was started with `model: "opus"`. The runtime reports the model id
`claude-opus-5-5`. So the CLI resolves the alias `opus` to the current generation. The
status line still shows only `opus`.

### 1.6 Status text

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tool-handlers.ts:258`
prints `model X (source); effort Y (source)`. `ChildSettingSource` is
`'pin' | 'model' | 'ranking' | 'default'` (`libs/shared/src/lib/types/messages/agent-session.ts:8`).
No reason is recorded.

### 1.7 Does the same ranking serve `ptah_agent_spawn`?

No. `CHILD_SETTING_ROUTER` is injected only into `SessionSpawnerService`
(`cli-agent-runtime/src/lib/di/tokens.ts:54`, `rpc-handlers/src/lib/chat/di.ts:142`).
`ptah_agent_spawn` uses `modelTier ?? 'sonnet'` for Ptah CLI agents
(`protocol-dispatcher.ts:1457`, `mcp-stdio/agent-tool.dispatcher.ts:597`,
`ptah-cli-registry.ts:885`) and the CLI default for `cli: "claude"`. No change there.

A separate policy exists for `ptah_route_decide`:
`libs/backend/lane-routing/src/lib/pipeline/tier-effort-policy.ts:28-29` (rule R4) gives
`haiku` + `low` to shape `mechanical | test | docs` under weight 4000. That is a route
suggestion, not this ranking. It is out of scope here; it is listed as a follow-up in
section 7.

## 2. New rule

Input of the rule: `brief`, `models`, the explicit `phaseKind` (from `request.phase.kind`)
and a new explicit `workKind` (section 3.2). First match wins.

| # | Rule id | Input | Tier | Effort |
|---|---------|-------|------|--------|
| 1 | `pin` | caller gives `model` / `effort` | as given | as given |
| 2 | `coordination-only` | `workKind: 'coordination'` and no code phase kind | small | `low` |
| 3 | `deep-work-kind` | `workKind` in `investigation, design, security` or `phaseKind` in `plan, architecture, design, review, document-review, visual-review, batch, completion` | strong (Opus class) | `high` |
| 4 | `deep-work-text` | no explicit kind, brief matches `root cause`, `unknown (cause\|reason)`, `security`, `architectur`, `design`, `investigat` | strong | `high` |
| 5 | `code-work-kind` | `workKind: 'code'` or `phaseKind` in `implement, tests, docs, research` | balanced (Sonnet class) | `high` |
| 6 | `unknown-kind-floor` | nothing above | balanced | `high` |

- Text never selects the small tier. Only the explicit `workKind: 'coordination'` does.
  This removes the false match on "You coordinate task …".
- Rule 3 agrees with `policyForPhase` R1/R2 (`tier-effort-policy.ts:17-22`), so the two
  policies give the same tier for the same phase kind.
- Floor: after the decision model answers, the router clamps the answer. A model of a
  lower tier than the rule tier is replaced by the rule model. An effort below the rule
  effort is raised to it. The source then stays `ranking` and the reason records
  `decision-model-below-floor`. Rule 2 has no floor, so the decision model may go up.
- An explicit `model` with a missing `effort` keeps the model (`pin`); the effort still
  gets the floor of the rule for its kind.

### 2.1 Model choice inside a tier

1. Classify each catalog entry by family: `opus` → strong, `sonnet` → balanced,
   `haiku` → small, `fable` → top (never chosen by ranking), `default` → ignored.
   Also keep the existing words (`pro`, `mini`, …) for other providers.
2. In the target tier, choose the current-generation id: the highest version
   (`claude-sonnet-5-5` > `claude-sonnet-5` > `claude-sonnet-4-6`; a date suffix is ignored).
3. Requirement (f): drop a candidate with a known 200k window when a 1M candidate of the
   same tier exists. The window comes from `claude-cli-provider-entry.ts` `contextLength`
   when the id is there; else a small table in the rule (`claude-haiku-4-5*`, `claude-3*` →
   200k). Unknown window counts as "not 200k".
4. If the tier has no candidate, take the next stronger tier, never a weaker one.
5. If the catalog is empty, return no model (host default) with reason `catalog-empty`,
   and still apply the effort floor.

## 3. Changes by file

### 3.1 `libs/backend/lane-routing` (rule and router)

- `src/lib/child-session/child-setting-rule.ts`: replace `rankChildSettings` with the rule
  of section 2. New exported input type
  `{ brief; models; phaseKind?; workKind? }` and the output gets
  `reason: { rule: ChildSettingRuleId; input: string }`. Keep the export name.
- New `src/lib/child-session/child-model-tier.ts`: family/tier classification, version
  order, window table (keeps the rule file small).
- `src/lib/child-session/child-setting-router.service.ts`: accept `phaseKind` and
  `workKind` in the Zod `Input`; clamp the decision-model answer to the floor; pass the
  reason through. The decision model is asked only for options at or above the floor
  (filter `modelOptions` and `effortOptions` before the question), and the clamp stays as
  a second guard.
- `src/index.ts`: export the new types only (additive).

### 3.2 `libs/backend/vscode-lm-tools` and `libs/backend/cli-agent-runtime` (signal and reason)

- `ptah_session_start` schema: add optional `workKind`, enum
  `['coordination', 'code', 'investigation', 'design', 'security']`. Change the tool
  description sentence to: "Without model or effort the host ranks by phase.kind or
  workKind: code work gets a balanced model at high effort, investigation, security and
  design get the most capable model; set workKind 'coordination' for Git, CI or status
  work only." Apply the same schema in the stdio dispatcher (`mcp-stdio`) so the CLI host
  keeps parity.
- `cli-agent-runtime/src/lib/session-children/session-spawner.port.ts`: add `workKind?`
  to `SessionChildStartRequest`, `settingReason?` (`{ rule; input }`) to the child record
  and snapshot. Extend `ChildSettingChoice` in `child-setting-router.port.ts` the same way.
- `session-spawner.service.ts` (3,066 lines, must not grow): move the block of lines
  652-724 into a new file `session-children/child-setting-resolution.ts`
  (`resolveChildSettings(host, router, request, root, caller, task, branch, logger)`), pass
  `phaseKind: request.phase?.kind` and `workKind`, and store `settingReason`. The service
  file gets shorter.
- `session-tool-handlers.ts` (827 lines, must not grow): print the reason on the existing
  line through a helper `describeChildSetting(sources, reason)` in the port file, for
  example `model claude-sonnet-5-5 (ranking: code-work-kind, phase.kind implement);
  effort high (ranking: code-work-kind)`. The start reply gets the same text (requirement d).

### 3.3 `libs/backend/rpc-handlers` (model admission, symptom 2)

- New `src/lib/chat/session/child-model-admission.ts`:
  - `nativeChildModelIds(catalog)`: the catalog ids plus `CLAUDE_CLI_PROVIDER_ENTRY`
    `staticModels` ids and `defaultTiers` values, deduplicated. Only for the native login.
  - `resolveNativeTierAlias(model)`: `opus`, `sonnet`, `haiku` → `defaultTiers` id;
    `fable` → the highest `claude-fable-*` id of `staticModels` (`claude-fable-5-2`).
- `chat-session.service.ts` (3,486 lines, must not grow): in `listAgentChildModels` and
  `resolveAgentChildModel`, the native branch calls these helpers in place of the inline
  list code. Third-party provider profiles and named accounts do not change.
- Result: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-2`
  are accepted, aliases resolve to them (status shows the concrete id), and the ranking can
  choose them.

`libs/shared` does not change (it is only read).

## 4. Tests

| Spec | Cases |
|------|-------|
| `lane-routing/.../child-setting-rule.spec.ts` | brief "You coordinate task … git …" without workKind → balanced + `high`, never haiku; `workKind: 'coordination'` → small + `low`; `phaseKind: 'implement'` → `claude-sonnet-5-5` + `high`; `phaseKind: 'review'`/`'architecture'` → opus + `high`; text "unknown cause" → opus; unknown → balanced + `high` (`unknown-kind-floor`); the parent's real catalog plus the static ids → `claude-sonnet-5-5`, not `claude-sonnet-5`; old catalog only → `claude-sonnet-5`; balanced tier missing → strong, never haiku; `claude-haiku-4-5` (200k) not chosen when a 1M model of the tier exists; empty catalog → no model, effort `high`; reason recorded each time |
| `lane-routing/.../child-setting-router.service.spec.ts` | decision model answers haiku + `low` for a code brief → clamped to the floor, reason `decision-model-below-floor`; options sent to the decision model contain no model or effort below the floor; pins still win |
| `cli-agent-runtime/.../session-spawner*.spec.ts` (existing, update) and new `child-setting-resolution.spec.ts` | `phase.kind` and `workKind` reach the router; explicit model + no effort → model pin, effort floor; `settingReason` stored in the snapshot |
| `vscode-lm-tools/.../session-tools.spec.ts` (existing, update) | status and start reply print rule and input; schema accepts `workKind`, refuses other values |
| `rpc-handlers/.../child-model-admission.spec.ts` (new) and the existing chat-session child model specs | `claude-opus-5-5` admitted on the native login with the old catalog; `opus` → `claude-opus-5-5`, `fable` → `claude-fable-5-2`; third-party profile unchanged; named account unchanged |

## 5. Affected Nx projects

`lane-routing`, `cli-agent-runtime`, `rpc-handlers`, `vscode-lm-tools`.
Consumers that compile against them: `ptah-electron`, `cli-engine`, `platform-cli`
(no source change expected; the full gate covers the four changed projects, and the
pre-push hook runs di-lint and the Electron `validate-deps` gate).

Checks (coordinator only, after the lane ends):

1. `npm run verify -- --related -p lane-routing,cli-agent-runtime,rpc-handlers,vscode-lm-tools`
2. `npm run verify -- -t lint,typecheck -p lane-routing,cli-agent-runtime,rpc-handlers,vscode-lm-tools`
3. `npm run verify -- -p lane-routing,cli-agent-runtime,rpc-handlers,vscode-lm-tools` (full gate, once before the push)

No template change, so no `typecheck-templates`.

## 6. Execution

1. One codex implementation lane in this worktree (file-disjoint in one lane, because the
   rule types flow through all four projects). Deliverable: `implementation-report.md`.
2. One antigravity review lane after it, read-only. Deliverable: `review.md`.
3. The coordinator runs section 5, commits, pushes, opens the pull request, watches CI.

## 7. Out of scope (follow-up)

- `tier-effort-policy.ts` R4 gives `haiku` + `low` to small `test`/`docs` phases in
  `ptah_route_decide`. A `tests` phase edits code. Propose the same floor there in a
  separate task, because it changes route suggestions for CLI lanes too.
- Why the native SDK catalog has no 5.5 ids (persisted catalog or CLI binary version).

## 8. Analysis lane deltas

Source: `analysis.md` (codex lane `468f3ba3`). Its code claims were checked against the code.
They agree with section 1. None of the differences below changes the design. Each one is
added to the implementation scope.

| # | Analysis claim | Check | Effect on this plan |
|---|----------------|-------|---------------------|
| 1 | The router Zod input cuts the brief to 8,000 characters before the rule runs (`child-setting-router.service.ts:17-22`), so a keyword after 8,000 characters is lost | Confirmed | The rule reads the full brief. Only the decision-model request uses the cut text |
| 2 | A routed model that admission refuses falls back to the host default model and keeps the routed effort (`session-spawner.service.ts:701-723`) | Confirmed | The router returns an ordered candidate list for the tier. The resolver tries each candidate in order; if all are refused, it keeps the host default and records reason `routed-model-refused` |
| 3 | An empty catalog still gives effort `low` today | Confirmed (`child-setting-rule.ts:40-46`) | Already covered: rule 6 and section 2.1 step 5 give `high` |
| 4 | `ptah_agent_spawn` does not call `rankChildSettings` | Confirmed | No change to the spawn path (section 1.7) |
| 5 | Route-decide R4 gives `haiku` + `low` to light test/docs work | Confirmed | Follow-up only (section 7), per coordinator decision |
| 6 | Propose a richer catalog API with capacity and generation metadata in `agent-sdk` and `shared` | Not a code fact, a design option | Not adopted. This plan reuses the existing versioned mapping `claude-cli-provider-entry.ts` (ids checked with `claude -p`) for the native login only, and a small window table. No hard-coded id is added. A richer catalog API can be a follow-up |
| 7 | Coordination-only variants `git-only`, `ci-watch`, `status-only`; a code phase kind wins over a conflicting coordination flag | Design option | `workKind` keeps one value `coordination` (simpler). Rule 2 already requires "no code phase kind", so a code phase is never downgraded |
| 8 | The reason must survive restart and handoff, and legacy records must say "reason unavailable" | Design option | The child record and its persistence (if the record is persisted in `cli-agent-runtime`) get the optional `settingReason`. A record without it prints `reason unavailable`. `libs/shared` is not changed |
| 9 | Review and plan need at least balanced + `high`; architecture gets strongest | Agrees | This plan gives plan and review the strong tier (same as `policyForPhase` R1/R2). That is above the minimum |
| 10 | The cause of the old native catalog (no 5.5 ids) is not proven | Agrees | Still open (section 7). The admission union does not depend on it |

Tests added from the analysis: a code brief with "coordinate", "git commit" and CI words
stays at the floor; a keyword after 8,000 characters is seen; a valid decision-model answer
of `low` or haiku for code work is clamped; each pin wins, including an explicit `low` or
haiku; a refused first candidate falls to the next candidate of the same tier.

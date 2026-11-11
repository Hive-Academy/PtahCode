# Review - TASK_2026_930_4e06

Verdict: **REVISE**

The design is mostly implemented and the structure is sound. One blocker (silent routing loss for long tasks),
three major findings and test gaps remain. All findings below were verified in the code.

## Checked and correct

- Per-field precedence: `child-setting-router.service.ts:34-40` gives `pin` to explicit fields and routes only omitted ones.
- Decision model picks only a label: options built by code (`:44-48`), label regex-checked and index-mapped (`:75-81`). A free-form id cannot pass.
- No decision call when both fields are explicit (`:41`). One `runFixedRequest` call for both fields.
- Routed model refused by host: `session-spawner.service.ts:397-409` logs and keeps the default. Explicit model path (`:365-384`) is unchanged and still fails the start.
- Named account: `chat-session.service.ts:1317-1320` returns an empty catalog, so no model is routed and the source is `default`.
- Routing runs before `provisioner.create`. Router token is optional (`isOptional: true`), so no router bound gives the old behavior.
- DI: `Symbol.for` tokens, optional binding in `rpc-handlers/chat/di.ts:142`. Registration order is correct (lane-routing in phase-2 / `container.ts:795`, chat in phase-4 / `container.ts:1011`). cli-agent-runtime does not import lane-routing.
- No `any`, `as unknown as`, `@ts-ignore`, `console.*`, or `[innerHTML]` in the added lines. Catch clauses use `unknown`.
- Renderer: `tab-persistence.ts:243-246` drops only an invalid field. The card renders nothing when `agentOrigin` is absent. Signals plus `computed` with an equality function. `title` and `aria-label` are set.

## Findings

1. **blocker** - `child-setting-router.service.ts:12` and `session-spawner.service.ts:386-416`.
   Evidence: `Input` has `brief: z.string().max(8000)`. The brief is `label + task`, and `task` may be up to
   `AGENT_MESSAGE_MAX_CHARS = 102_400` (`libs/shared/.../agent-messaging.types.ts:100`). `Input.parse(raw)` throws
   a `ZodError` for a longer brief. The spawner catch (`:413-415`) only logs `name`, so routing is silently lost
   for every long task. Also, the whole brief is sent to the decision model.
   Fix: truncate the brief to 8,000 characters in the spawner (or the router) before `route`. Do not throw. Add a test for a 20,000-character task.

2. **major** - `child-setting-rule.ts:10-11`. Evidence: `/haiku|mini|flash|small|lite/i` matches `gemini-*`,
   so `gemini-2.5-pro` gets strength 0 (smallest). `/opus|pro|large|strong/i` matches `provider`, `pro` inside other ids.
   The smallest/strongest choice is wrong for a Gemini catalog.
   Fix: match on word boundaries or on a token list (`(^|[-_./])(mini|flash|haiku|lite)([-_./]|$)`); check `pro|opus` first only as tokens. Add a test with `gemini-*` ids.

3. **major** - `child-setting-router.service.ts:56-66`. Evidence: the 3,000 ms deadline starts after
   `openCaller()` (`:52`) and does not cover it. The `request` promise is not aborted on timeout. If it rejects
   after the timeout won the race, the rejection is unhandled (no `.catch` on `request`).
   Fix: put `openCaller()` inside the raced work, and attach `request.catch(() => undefined)` (log at debug) before the race.
   Note the 3,000 ms cap is only valid if the dispatch honors it; `DECISION_REQUEST_TIMEOUT_REMOTE_MS` also exists in `routing-constants.ts:121`, so confirm the intended limit for a remote model.

4. **major** - `session-spawner.service.ts:386-416` (routing and Git order). Evidence: the router runs up to
   3,000 ms before every start even when no match exists, because the decision model is called whenever a field is
   omitted (`router.service.ts:41-49`). Design 6 allows this, but nothing records that the effort options list all
   five levels for a brief that matched no rule. Not a defect of the code against the Design, but it adds
   latency to every default start.
   Fix: accept, and note in the report. Optional: skip the decision call when the brief is under a minimum length.

5. **minor** - `session-spawner.service.ts:392-396`. `listChildModels` is awaited even when only `effort` is
   omitted and `model` is explicit: guarded by `request.model ? []`, so this is correct. But an `effort`-only
   explicit start still performs a router call with `models: []`; fine. No change needed.

6. **minor** - `session-spawner.service.ts:410-415`. If `resolveChildModel` throws for a routed model, the outer
   catch swallows it with only `name`. `effortSource` and `resolvedEffort` were already applied, which is
   acceptable. Fix: log the `code` or message hint like the refusal branch for diagnosis.

7. **minor** - `session-tool-handlers.ts:140`. The fallback `child.modelSource ?? (child.model ? 'pin' : 'default')`
   is duplicated in the spawner (`:1409-1410`). The snapshot always has sources after this change, so the fallback
   in the handler is dead code. Fix: make the fields required on `SessionChildSnapshot`, or keep one helper.

8. **minor** - `tab-persistence.ts:243-246` plus `compact-session-card.component.ts:351-374`. A tab that has a `model` but
   no `modelSource` (older restore) shows no source (tooltip has no label). Acceptable, but the card tooltip
   for a present effort without a source drops the source silently. No fix required.

9. **minor** - DI guard specs. `expected-resolvable.ts` lists tokens that are required. The new token is
   optional and conditionally bound, so it must NOT be added there. `libs/backend/rpc-handlers/src/lib/chat/di.spec.ts`
   has a test for `CHILD_CHAT_SESSION_HOST` (`:244`) but none for the new binding.
   Fix: add the tests in the list below. No change to `container.smoke.spec.ts` or `expected-resolvable.ts`.

10. **minor** - Formatting. Several added lines exceed the repository Prettier width (for example
    `child-setting-router.service.ts:50-55`, `register.ts:63-69`, `agent-session.ts:7`, `spawner:386-387`). Run
    Prettier on the changed files before commit (lint-staged will do it, but check the diff).

## Missing tests (exact list)

`libs/backend/lane-routing/src/lib/child-session/child-setting-router.service.spec.ts`:
- `keeps the ranking result when the decision model returns an invalid label` (label `o99` and `x1`)
- `keeps the ranking result when the decision call exceeds 3000 ms` (fake timers; no timer left after return)
- `keeps the ranking result when the decision call throws`
- `uses a valid model label and reports source model`
- `uses a valid effort label and reports source model`
- `routes only effort when model is explicit and calls the decision model once`
- `accepts a brief longer than 8000 characters` (after fix 1)
- `rankChildSettings` in `child-setting-rule.spec.ts`: `ranks gemini ids correctly` (after fix 2)

`libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts` (grep found no router tests):
- `uses the routed model and effort and stores their sources on the snapshot`
- `falls back to the host default when the routed model is refused by admission` (start still succeeds, `modelSource: 'default'`)
- `still fails the start when an explicit model is refused` (regression)
- `starts with the old behavior when no router is bound`
- `routes before provisioner.create` (call order)
- `opened payload carries model, effort, modelSource and effortSource`

`libs/backend/vscode-lm-tools/.../session-tool-handlers` spec:
- `start result text shows model and effort with both sources`

`libs/backend/rpc-handlers/src/lib/chat/di.spec.ts`:
- `binds CHILD_SETTING_ROUTER to the lane-routing router when it is registered`
- `leaves CHILD_SETTING_ROUTER unbound when lane-routing is not registered`
- a `ChatSessionService.listAgentChildModels` case: `returns an empty list for a named account` and `returns an empty list when the catalog throws`

## Other notes

- B1 reports 3 failing test targets with no logs read. Rerun `npm run verify` for the three projects and read the logs before delivery. Do not claim success until they pass or the cause (missing `marked`) is shown to be environment-only.
- B2 reports 106 `chat` suites failing on `marked` in this worktree. This is an environment limit; confirm the `compact-session-card.component.spec.ts` suite itself ran.
- Privacy: no user name, email or secret found in the changed source files.

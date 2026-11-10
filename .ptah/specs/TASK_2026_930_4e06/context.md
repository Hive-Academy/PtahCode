# Context - TASK_2026_930_4e06

Type FEATURE, depth Partial. Host priority: Electron. Related task: TASK_2026_896_9339 (PR 1061,
file-disjoint; this task does not depend on it).

## User intent

The routing decision (deterministic rule, optionally refined by the decision model) also chooses
the MODEL and the EFFORT of a child session started with `ptah_session_start`. The start result
and the session UI show the resolved model, the resolved effort and the source of each.

## Facts on `main` (file:line)

- `ptah_session_start` takes optional `model` (string, max 200) and `effort`
  (`low|medium|high|xhigh|max`): `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tool-args.schema.ts:38-62`.
- Tool rule text: "Use a smaller model or lower effort for coordination, Git or CI; use a strong
  model for unknown causes, security or architecture. Omit both for defaults."
  (`mcp-core/session-tools.ts:75-77`).
- The spawner admits an explicit model with the host before Git work and stores the resolved id:
  `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:356-377,401-429,450-461`.
- The host resolves an alias and requires the full id in the workspace catalog; an unknown id is
  refused with `invalid-model`: `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1337-1357`.
  A named-account explicit model cannot be admitted before launch (`:1323-1335`).
- With both fields omitted, no decision runs; the host defaults apply.
- Start result prints `model ${child.model ?? 'default'}; effort ${child.effort ?? 'default'}`
  (`mcp-core/session-tool-handlers.ts:134-141`). The snapshot has no source
  (`session-children/session-spawner.port.ts:57-67`).
- The UI payload, tab origin, tab restore and the compact child card carry no model or effort:
  `libs/shared/src/lib/types/messages/agent-session.ts`, `libs/frontend/chat-types/src/lib/chat-types.ts:547-560`,
  `libs/frontend/chat-state/src/lib/tab-manager.service.ts:1375-1409`, `tab-persistence.ts:195-219`,
  `libs/frontend/chat/src/lib/components/molecules/compact-session/compact-session-card.component.ts:285-296`.
- `ptah_route_decide` has only `lane` and `subagent` candidates. It has no child session row.
- `ROUTE_DECIDE_SERVICE` token: `libs/backend/lane-routing/src/lib/di/tokens.ts:9-11`. The decision
  model timeout is 3,000 ms (`routing-constants.ts`).

## Design

`ptah_session_start` resolves each omitted field itself, before Git work.

1. Explicit parent `model` or `effort` wins for that field. Source `pin`.
2. Deterministic rule on the child brief (label + prompt): coordination, Git or CI text gives the
   smallest admitted model and a lower effort; unknown cause, security or architecture text gives
   the strongest admitted model and a higher effort. Source `ranking`. No match: host default,
   source `default`, field stays omitted.
3. When a decision model is available, one call (3,000 ms timeout) gets labeled options `o1..oN`
   that code built from the admitted workspace catalog and the effort levels. A valid label gives
   source `model`. A timeout, an error or an invalid label keeps the result of step 2.
4. The chosen model goes through the existing admission check. A refusal of a ROUTED (not
   explicit) model falls back to the host default (source `default`); it does not fail the start.
5. Named Claude account: the catalog is unavailable before launch. No routed model; source `default`.
6. Cost: at most one decision call per start, only when a field is omitted.

Contract (already in `libs/shared/src/lib/types/messages/agent-session.ts`):
`ChildSettingSource = 'pin' | 'model' | 'ranking' | 'default'`; `AgentSessionOpenedPayload` has
optional `model`, `effort`, `modelSource`, `effortSource`.

## Batches

- B1 backend (codex): decision module, port, spawner, snapshot, payload fill, start result text.
- B2 renderer (antigravity): tab origin, adoption, restore validation, compact card and tab display.

## Lanes (2026-11-10)

Gate 0.1: lanes `enabled`, approval `lane-review`. codex (forced, user confirmed quota),
antigravity (explicit model), Claude Api for the independent review (different family).

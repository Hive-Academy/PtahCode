# Research Report - TASK_2026_2320_lnpar

## Question

- Decision this supports: per-lane capability flags (supported / workaround / disabled-with-reason) and the mechanism the architect uses for steer, interrupt, per-turn model and effort, attachments, mid-run usage and permission routing in lane chat.
- Question: settle every "Research" cell of task-description.md (8 questions, all lanes).
- Bounds: no billed CLI turn or live model call; no builds or tests. Only `--help` output of installed CLIs was read. Pi and Copilot CLIs: Pi is not installed here; the Copilot shim printed no help.

Installed versions checked: `@anthropic-ai/claude-agent-sdk` 0.3.329, `@cursor/sdk` 1.0.31, `@agentclientprotocol/sdk` 1.7.0, opencode (local `run --help`). Pi, Copilot, Grok and agy were read from repo code and web docs only.

## Answer

Four of the eight "Research" areas resolve to native support with a small mechanism: Claude/ptah-cli steer (queued messages fold into the running turn between tool rounds), Codex per-turn model/effort/images/interrupt, Pi (all of steer, images, set_model, set_thinking_level), and ACP per-session model/effort/images/permission routing (all already present in `acp-runtime` and `ProviderSession`). Cursor mid-run usage is not supported (usage is emitted once at turn end); Copilot `ask` is not supported (the lane is CLI-driven with `--allow-all-tools`; the bridge is never called by the adapter). OpenCode and Antigravity stream-json get model and effort only at spawn, so they apply at the next turn. Each unsupported item should become disabled-with-reason, not scope growth.

## Results table (lane x capability)

Verdicts: N = native, W = workaround, X = not supported, ? = unknown.

| Lane | Steer | Interrupt | Per-turn model/effort | Images/files | Usage timing | Permission/ask |
| --- | --- | --- | --- | --- | --- | --- |
| Claude SDK, ptah-cli | N (fold between tool rounds; see Q1) | N (`Query.interrupt()`; keeps session) | N (`setModel`, `applyFlagSettings`) | N (content blocks; mailbox must send blocks) | N per assistant message | N (`canUseTool`; routing is architect work) |
| Codex app-server | N (already) | N (`turn/interrupt`, thread kept) | N (`turn/start` `model`, `effort`) | N (`image` data URL, `mention`) | N (token_count) | W (lane forces `never`; needs sink and profile change) |
| Pi RPC | N (already) | X (`abort` only; see Q4) | N (`set_model`, `set_thinking_level`) | N (`images` on prompt/steer/follow_up) | N (`message_end`) | X (no core permission events) |
| Cursor SDK | X | N (`run.cancel()`) | N (`send({model:{id,params}})`) | N (`SDKUserMessage.images`) | X (one `usage` at turn end) | X/? (no approval API in types) |
| Copilot CLI | X | X | W (flags at next spawn) | ? | N-ish (`assistant.usage` per request) | X (CLI `--allow-all-tools`; bridge unused) |
| OpenCode | X | X | W (`--model provider/model#variant` at next spawn) | N (`--file`) | N (`step_finish` per step) | W/? (`--auto` only; see Q6) |
| Grok ACP, agy ACP | X (prompt queues) | N (`session/cancel`) | N (`session/set_config_option` via `setModel`/`setEffort`) | N (`image`, `resource_link` if `promptCapabilities.image`) | N (`usage_update`, mid-turn) | W (`approvals` sink exists; lane passes none) |
| agy stream-json | X | X | W (`--model` incl. effort suffix at spawn) | ? | N (`step_update.usage` optional per step) | X (`--dangerously-skip-permissions`) |

## Evidence

| Claim | Source | Date | Verified how |
| --- | --- | --- | --- |
| A message sent during tool calls reaches Claude after those tool calls finish; Claude answers it and the earlier message in one response; if the turn ends first, a new turn starts | https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode (NOTE under "Send more than one message") | fetched 2026-11-23, undated | read |
| `SDKUserMessage.priority?: 'now' \| 'next' \| 'later'`; docs: "To choose when Claude reads a message you push during a response, set the message's priority field" | `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:6984,7089`; same docs page | v0.3.329 | read; per-value semantics not in the d.ts or the fetched page |
| Result carries `user_message_uuids` (all prompts consumed, incl. "queued user message folded into the running turn between tool rounds") and `queued_turn_count` | `sdk.d.ts:6317,6281` | v0.3.329 | read |
| An interrupt leaves queued commands alive (`still_queued`); `cancel_queued` cancels them | `sdk.d.ts:5080-5102`; docs page "Interrupt Claude's response" | v0.3.329 | read |
| Lane mailbox yields string-content messages only, no `priority`, no blocks | `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-prompt-mailbox.ts:10-17,23-29` | repo | read |
| Lane tracks turns with `pendingTurns` (one entry per turn, shifted per result) | `claude-sdk-lane-runner.ts:~135-150` | repo | read |
| Codex `turn/start` params carry `model`, `effort`, `approvalPolicy`, `sandboxPolicy`; settings are read at each start | `libs/backend/codex-runtime/src/lib/codex-context.ts:1018-1038` | repo | read |
| Codex input items: `text`, `image` (data URL), `mention` (path) | `codex-context.ts:989-1011` | repo | read |
| Codex interrupt: `turn/interrupt {threadId, turnId}`; thread persists; 30 s guard | `codex-context.ts:1350-1375` | repo | read |
| Lane forces `approvalPolicy: 'never'` (`consumer === 'lane'`), lane `ApprovalSink` always returns `decline` | `codex-execution-profile.ts:201`; `codex/codex-app-server-lane.adapter.ts:392-405` | repo | read |
| Chat uses `on-request` style mapping and `approvalsReviewer: 'user'` | `codex-execution-profile.ts:153-174,321` | repo | read |
| Pi `prompt`/`steer`/`follow_up` accept `images: [{type:'image',data,mimeType}]`; bare `prompt` while streaming errors unless `streamingBehavior`; `abort` waits for idle; `set_model {provider, modelId}`; `set_thinking_level {level}` | https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/rpc-commands.md | fetched 2026-11-23, undated | read (via fetch summary) |
| Pi `extension_ui_request` (`select`, `confirm`, `input`, `editor`) arrives only via extensions' `ctx.ui`; core permission events not documented | https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/rpc-extension-ui.md; `pi-cli.adapter.ts:51` ("no permission popups") | undated | read |
| Pi lane passes `--thinking` and `--model` at spawn only | `pi-cli.adapter.ts:451-452` | repo | read |
| Cursor `SendOptions.model?: ModelSelection {id, params?}`, `mode`, per-send `local` options; `SDKUserMessage {text, images?}` | `node_modules/@cursor/sdk/dist/cjs/agent.d.ts:36-52`, `options.d.ts:5-20,106-109` | v1.0.31 | read |
| Cursor `usage` message: "emitted once at turn end when the runtime reported usage" | `@cursor/sdk/dist/cjs/messages.d.ts:83-89` | v1.0.31 | read |
| Cursor types expose no approval callback; custom tools "never require interactive approval" | `@cursor/sdk/dist/cjs/options.d.ts:187`; grep for approval/permission found nothing else | v1.0.31 | read and searched |
| Cursor lane builds the agent once with `model: {id}` and sends text only | `cursor-cli.adapter.ts:411-420,573` | repo | read |
| Copilot lane spawns `copilot -p <prompt> --output-format json --allow-all-tools --model --effort --resume=<id>` per turn | `copilot-sdk.adapter.ts:331-348` | repo | read |
| Copilot `permissionBridge` is retained for constructor compatibility; the CLI path "does not route permission requests through this bridge" | `copilot-sdk.adapter.ts:139-146` (only references: lines 146, 160) | repo | read and grepped |
| Copilot `assistant.usage` handled per request | `copilot-sdk.adapter.ts:755-790` | repo | read |
| OpenCode `run` flags: `--model provider/model#variant`, `--file/-f`, `--session`, `--continue`, `--fork`, `--agent`, `--format json`, `--auto` ("Auto-approve permissions that are not explicitly denied") | `opencode run --help` run locally | 2026-11-23 | ran (free, no model call) |
| OpenCode is one-shot per turn, stdin closed; `step_finish` per step, final `reason: "stop"` | `opencode-cli.adapter.ts:11,30-42,362-368` | repo | read |
| ACP session runtime: `setModel`, `setEffort` write `session/set_config_option`; both need a live, set-up session | `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts:244-250,917-945,1699-1730` | repo | read |
| `ProviderSession` contract declares `setModel`, `setEffort` and a `setModel` capability flag | `libs/backend/provider-session-contracts/src/lib/provider-session.types.ts:119,188-189` | repo | read |
| ACP prompt content: `image` block and `resource_link` (`file://`), gated by `promptCapabilities.image` | `acp-prompt-content.ts:1-35`; `acp-provider-session-runtime.ts:228` | repo | read |
| ACP `usage_update` notifications arrive during the turn (used for context size); prompt response may carry usage | `acp-session-runtime.ts:570-580,1540,1563` | repo | read |
| ACP `session/request_permission` is answered by a `ProviderApprovalSink` when `config.approvals` is set, else by `decideAcpPermission` policy; sink decisions map to `allow_once`/`reject_once`/`cancelled` | `acp-session-runtime.ts:483-505`; `acp-approval-adapter.ts:1-20` | repo | read |
| An ACP prompt sent mid-turn is queued by the agent, not injected (Grok) | `grok-cli.adapter.ts:11-17` | repo; the fixture `grok-p2-cancel-mid-shell` is cited there | read (repo's own claim, not re-run) |
| agy stream-json: `step_update.usage?` optional per step, `result.usage`, `result.model`; model passed as `--model` with an effort suffix id at spawn; continuation by NDJSON on stdin | `antigravity-cli.adapter.ts:205-232,384-435` | repo | read |

## Per-question notes

### Q1 Claude SDK and ptah-cli: steer?

Verdict: supported natively as fold-in at the next tool-round boundary; not an interrupting steer.
- The mailbox is the SDK `prompt` stream. The SDK reads that stream continuously. The d.ts treats a message "read but not yet queued, from its own input stream" as a normal state (`sdk.d.ts:5095`). Pushing mid-turn therefore queues it, and the CLI folds it into the running turn between tool rounds. The result lists it in `user_message_uuids` (`sdk.d.ts:6317`). If the turn ends first, it starts a new turn (docs NOTE).
- Mechanism: extend `PromptMailbox.push` to take content blocks, a `uuid` and an optional `priority`; call `push` while a turn runs. Use `priority: 'now'` only after a test proves what it does (unknown; see Unknowns). Detect whether a steer landed from `user_message_uuids` on the next assistant message or result frame.
- Manifest consequence: this is "steer" in the same sense Codex `turn/steer` is (new input joins the turn at a boundary), but a text-only turn with no tool calls has no boundary, so the message becomes the next turn. State this in the UI reason text. Requirement 2.5 (an adapter test must prove it) still holds; a fixture with a tool call is the test.
- Bookkeeping risk (inferred, not run): `claude-sdk-lane-runner.ts` pushes one `pendingTurns` entry per turn and shifts on each result. Two messages folded into one turn give one result for two pushes, so the queue desyncs. Use `user_message_uuids` and `queued_turn_count` (`sdk.d.ts:6281`) to settle pending turns.
- ptah-cli providers use the same SDK and the same CLI subprocess, so the same behaviour applies. Provider backends (non-Anthropic gateways) were not tested; steer depends only on the CLI queue, not the model, so no extra risk is expected (inferred).
- Interrupt for contrast: `Query.interrupt()` ends the running response with `error_during_execution`; queued messages survive unless `cancel_queued: true` (`sdk.d.ts:5080`; docs).

### Q2 Codex app-server

- Per-turn model and effort: native. `turn/start` takes `model` and `effort` (`codex-context.ts:1020-1026`); the context reads `this.settings` at each start. The lane `startTurn({text, signal})` only needs the setting to change before the next turn, through the same settings object main chat uses (`session-runtime-router.ts:58` per task description). The setter name in `CodexContext` was not located (settings is private, `codex-context.ts:152`); the architect should find the public update method used by chat (unknown: exact name).
- Images and files: native. `CodexTurnInput.attachments` is already supported by `wireInput` (image as base64 data URL, file as `mention`). The lane only has to pass attachments to `startTurn`.
- Interrupt keeping the thread: native. `CodexContext.interrupt(turnId)` sends `turn/interrupt`; the state goes to `interrupting`, admission is blocked until the terminal state arrives. The lane manifest says unsupported with a reason about steer; the reason is about the lane, not the protocol.
- Approvals: the lane sets `approvalPolicy: 'never'` through `consumer === 'lane'` (`codex-execution-profile.ts:201`) and an `ApprovalSink` that returns `decline` (`codex-app-server-lane.adapter.ts:392-405`). To support `ask`: (1) build the profile with a non-`never` policy for the lane (`resolveApprovalPolicy`, lines 153-174, gives `on-request`); (2) replace the sink with one that routes to the user and returns accept/decline; the bridge already supports `requestUserInput` too. Requires the lane to hold a pending state while the user answers. Unknown: whether `sandbox_approval` and `skill_approval` feature flags (lines 166-168) should be on for lanes.

### Q3 Cursor

- The Cursor lane uses `@cursor/sdk` (not a stream-json CLI).
- Mid-run usage: not supported. Docs comment: usage is "emitted once at turn end" (`messages.d.ts:83`). Keep per-turn usage; mark mid-run as disabled-with-reason.
- Per-turn model: native. `SendOptions.model: {id, params?}` overrides per send; `params` is the variant list (effort is a model parameter, `ModelParameterDefinition`). The lane currently fixes the model in `Agent.create` (`cursor-cli.adapter.ts:417`). Unknown: parameter id for effort is per model; read it from `Cursor.models.list()` variants (`options.d.ts:110-120`).
- Images: native. `SDKUserMessage.images` accepts `{url}` or `{data, mimeType}`; the lane sends text only.
- Permission requests: no approval API exists in the types (grep for approval/permission shows only custom-tool notes). The manifest's `unverified` is correct; keep `ask` disabled.

### Q4 Pi (rpc)

- Per-turn model/effort: native. `set_model {provider, modelId}` and `set_thinking_level {level}` are RPC commands on the live process. Whether `set_model` persists for later prompts is not stated in the doc (implied); one local `get_state` check after `set_model` would settle it. The lane currently passes `--model`/`--thinking` at spawn only (`pi-cli.adapter.ts:451`).
- Images: native on `prompt`, `steer`, `follow_up`.
- Interrupt: `abort` exists and waits for idle, but the adapter treats it as stopping the agent; the manifest reason ("no run-scoped abort that keeps its agent alive") was not contradicted nor confirmed by the docs. Unknown: whether the process stays usable after `abort`. Settled by one RPC session (`abort` then `prompt`), which needs a Pi install and a model call, so it was not run.
- Permissions/questions: core has none ("no permission popups", `pi-cli.adapter.ts:51`). `extension_ui_request` appears only if an extension is installed. Keep `ask` disabled; questions could route through `extension_ui_request`/`extension_ui_response` only when such an extension is present (unverified).

### Q5 Copilot

- The lane is CLI-driven (`copilot -p ... --allow-all-tools`), not the in-process SDK. The manifest `ask: unsupported` is correct. The bridge (`copilot-permission-bridge.ts`, forwarded by `agent-events.ts:577-646` per the task description) is wired but nothing calls it from the lane adapter (`copilot-sdk.adapter.ts:139-146`). Reconcile Req 5.6 vs 5.7: the card UI path exists but never fires for lane turns; do not claim `ask` support. Making it real would need either the Copilot ACP server (the docs page links a "Copilot CLI ACP server" reference; not read, unknown) or the in-process SDK. Neither was examined.
- Per-turn model/effort: each turn is a fresh process with `--model` and `--effort` built from `options` (`:342-347`), so changes apply at the next turn. Workaround, not live.
- Attachments: unknown for `-p` mode. The docs read cover only interactive `@file` and image paste. Settle with `copilot --help` on a machine where the shim works.
- `assistant.usage`: arrives per request in the JSON stream; the adapter already maps it (`:755-790`) and sums for the turn total.

### Q6 OpenCode

- Per-turn model/effort: `--model provider/model#variant` per `run`; the `#variant` suffix is the effort-like selector (local help). New process each turn, so applies at the next turn. Unknown: which variants a given model lists; read from `opencode models` (not run).
- Attachments: `--file/-f` repeatable (help text says "File to attach"). Images: unknown whether image files are passed to vision models; one local `run -f img.png` would settle but is a billed call.
- Usage: `step_finish` arrives per step in the stream (`opencode-cli.adapter.ts:30-42`), so mid-run usage is available.
- Permissions: only `--auto` (auto-approve unless explicitly denied) exists in `run`. How `run` behaves for an `ask` rule with no TTY is not documented in the fetched page (unknown). Keep `ask` disabled.

### Q7 ACP (Grok, agy ACP)

- Model/effort: native. `AcpSessionHandle.setModel`/`setEffort` call `session/set_config_option` on the live session; the `ProviderSession` contract exposes them with a `setModel` capability flag. The lane handle is built on the provider session (`provider-session-lane-handle.ts`); the lane has no `setModel` call today. Mechanism: gate the UI on `capabilities.setModel` and call before the next `session/prompt`. The option ids and value lists are advertised by the agent; `writeConfig` validates against them.
- Images/files: native. `acp-prompt-content.ts` builds `image` and `resource_link` blocks; gate on the advertised `promptCapabilities.image`.
- Permissions: `session/request_permission` is answered by a `ProviderApprovalSink` if `config.approvals` is given, else by policy. The lane passes no sink, so approvals are policy-decided. Mechanism: pass a sink that routes to the lane approval UI; the adapter maps accept to `allow_once`, decline to `reject_once`, anything else to `cancelled`. For Grok, `ask` additionally needs the agent to send the request: with `--always-approve` it never does; unknown whether `grok agent stdio` without that flag asks for tools (needs one live trace).
- Steer: unsupported (ACP agent queues mid-turn prompts, per the repo's Grok fixture note). Interrupt: `session/cancel`, process kept.

### Q8 Antigravity stream-json

- Usage: `step_update.usage` is an optional field on each step and `result.usage` ends the turn (`:205-232`), so per-step usage is available when the CLI fills it. Unknown how often it is filled; the capture note `.ptah/specs/TASK_2026_199/stream-json-capture.md` was not read.
- Continuation: NDJSON on stdin in the same process (`:27-29`), supported.
- Model switching: `--model` (with the effort suffix id, `agyModelWithEffort`) at spawn; no mid-process switch found. Applies when the next process starts, or via the ACP transport when `agy acp` is used (preferred transport; see Q7).
- Images: unknown; no image field in the observed schema.
- Permissions: only `--dangerously-skip-permissions`; keep `ask` disabled.

## Options (steer for Claude/ptah-cli)

| Option | Fit here | Cost to adopt | Known failure mode |
| --- | --- | --- | --- |
| Push into mailbox with fold-in semantics | Mailbox and `query()` already stream | Extend mailbox to blocks and uuid; settle `pendingTurns` by `user_message_uuids` | No tool boundary, so the message becomes the next turn; per-turn bookkeeping desync |
| Interrupt then send | What main chat does (`follow-up-queue.service.ts:322-327`) | Uses existing `interrupt()` | Aborts the running response (`error_during_execution`); queued messages survive unless `cancel_queued` |

Not examined: `priority: 'now'` behaviour in practice.

## Disagreements

- Task description says Claude steer "may be read as the next turn". Docs and d.ts say it is both: folded between tool rounds, next turn if the turn ends first. Decided by the docs NOTE and `user_message_uuids` text; confirm with one fixture.
- Task description says Copilot's bridge forwards permission requests (suggests `ask` could work). The adapter source says the lane never calls the bridge. Code wins: `ask` unsupported.

## Decisions supported

1. Claude and ptah-cli manifest: steer = supported with the caveat "joins the turn at the next tool boundary", only after a fixture test (Req 2.5).
2. Codex: enable interrupt, per-turn model/effort, attachments; `ask` needs profile and sink changes, so treat it as a separate item.
3. Cursor: disable mid-run usage (reason: once at turn end); enable per-send model, images; keep ask disabled.
4. Pi: per-turn model/effort and images via RPC; ask disabled; interrupt stays unsupported until `abort` is tested.
5. Copilot and OpenCode: model/effort at next turn (spawn flags); ask disabled; OpenCode attachments via `--file`.
6. ACP lanes: use `ProviderSession.setModel/setEffort`, image blocks and an approvals sink; ask depends on the vendor sending requests.
7. agy stream-json: model/effort at spawn; ask disabled; prefer the ACP transport for live switching.

## Local consequences

- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-prompt-mailbox.ts`: accept content blocks, `uuid`, optional `priority`.
- `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts`: reconcile `pendingTurns` with folded messages.
- `codex/codex-app-server-lane.adapter.ts:392-405`, `codex-runtime/src/lib/codex-execution-profile.ts:201`: the two places that force no approvals.
- `cursor-cli.adapter.ts:411-420,573`: send per-send `model` and `images`.
- `copilot-sdk.adapter.ts:139-146,220`: leave `ask` unsupported; bridge is dead for lanes.
- `provider-session-lane-handle.ts`: expose `setModel`/`setEffort` and an approvals sink to the lane.

## Unknowns

| Unknown | Why not settled | Smallest experiment |
| --- | --- | --- |
| Meaning of `priority: 'now' \| 'next' \| 'later'` | d.ts has no comment; the docs pages read do not define the values (the TypeScript reference was only partly read, 200k of 336k characters) | Read the remaining part of the TypeScript reference (offset 250000), or a unit fixture with a mock CLI |
| Claude fold-in observed end to end | Needs a model turn (billed) | Fixture with a tool call: push during the tool, expect `user_message_uuids` to hold both uuids |
| Pi: `abort` keeps the process usable; `set_model` persists | Not in the docs; Pi not installed | One RPC session on a local model |
| Copilot `-p` attachments; Copilot ACP server as an `ask` route | Flag table not reached in the docs; shim printed no help | `copilot --help` on a working install; read the ACP server reference page |
| OpenCode image attachments; `ask` behaviour of `run` with no TTY | Not documented; needs a model call | One `run -f` on a free model |
| Cursor effort parameter id | Per-model | Read `Cursor.models.list()` output |
| agy: how often `step_update.usage` is filled; images | Capture note not read | Read `.ptah/specs/TASK_2026_199/stream-json-capture.md` |
| Grok: does `grok agent stdio` without `--always-approve` send `session/request_permission` | Needs a live trace | One recorded ACP session (the repo has fixtures under `acp-runtime/src/lib/__fixtures__`) |
| Codex: public setter for model/effort on the lane context | Not located | Read `CodexContext` public methods near `codex-context.ts:1385-1400` |

Questions settled: 5 fully (Q1 mechanism, Q2, Q3, Q7, Q8 usage and continuation); 3 settled with open sub-points (Q4 Pi, Q5 Copilot, Q6 OpenCode). Open sub-unknowns: 9.

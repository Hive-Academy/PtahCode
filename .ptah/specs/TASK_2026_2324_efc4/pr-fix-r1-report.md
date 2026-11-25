# PR #1509 review round 1: fix report

All six CodeRabbit threads were checked against head 3beedaa9a. All six
are fixed in commit 5f0a7aa95.

## Threads

### 1. PRRT_kwDOPngTds67hf8u / comment 4684615970

- File: `claude-sdk-lane-runner.ts:455`. Pending steers settle the wrong
  turn when a result frame omits `user_message_uuids`.
- Outcome: **fixed**.
- Change: a result frame that lists uuids now settles the in-flight
  turns it lists, wherever they sit (`settledByResult`). The SDK
  contract (`sdk.d.ts`, result `user_message_uuids`) says that list
  holds every prompt the turn consumed. A frame without the field still
  settles the head, in push order. That frame is always the anchor's
  frame or an earlier one, because a steer runs after its anchor. A
  steer that such a frame passes becomes unproven. It gets no
  placeholder and no missed-steer notice. If it later runs as its own
  turn, its frame lists only the steer and settles no real turn. The
  steer rule is unchanged: steer is offered only after the CLI has
  reported uuids, each proven-missed steer gets its own placeholder,
  and both manifests stay `unsupported`.
- Specs (`claude-sdk-lane-runner.spec.ts`):
  - "lets an unproven steer run as its own turn without settling a
    queued prompt"
  - "gives an unproven steer no placeholder when the next frame lists
    only the queued prompt"
- Reply: "Fixed in 5f0a7aa95. A result frame that lists uuids now
  settles only the turns it lists. A steer that a frame without uuids
  passed is unproven: it gets no placeholder, and its own later frame
  settles no queued prompt. New specs cover both orders."

### 2. PRRT_kwDOPngTds67hf80 / comment 4684615980

- File: `claude-sdk-lane-runner.ts:486`. Named-lane steer placeholders
  can be out of the gate's commit order.
- Outcome: **fixed**.
- Change: settlement no longer depends on placeholder position. Each
  placeholder and each queued prompt settles on the frame that lists
  its own uuid. A `continue` prompt that the gate commits before an
  earlier steer settles on its own frame. The steer's later frame
  settles only its placeholder. The placement comment now says that
  position keeps push order only.
- Spec: "settles a prompt the gate committed before an earlier missed
  steer on its own frame". The queued prompt gets its own exit code,
  and the steer's frame leaves the third prompt waiting.
- Reply: "Fixed in 5f0a7aa95. I chose identity over a commit-order
  barrier: every result frame settles the turns whose uuids it lists,
  so a steer's frame can only settle its own placeholder, whatever
  order the named gate committed the prompts in."

### 3. PRRT_kwDOPngTds67hf88 / comment 4684615990

- File: `cli-agent-output.component.ts:191`. User echoes are appended
  after all event nodes, so a later reply groups before the follow-up.
- Outcome: **fixed**.
- Change: `withUserEchoes` puts each timed echo before the first event
  node that starts after its send time, before transcript grouping.
  Untimed segment nodes still follow the event tree. A lane without
  text deltas keeps the earlier sequential order, because its assistant
  text exists only as untimed segments.
- Spec (`cli-agent-output.component.spec.ts`): "places a timed user
  echo among the event nodes by its send time". It checks the order
  reply 100, echo 200, reply 300.
- Reply: "Fixed in 5f0a7aa95. Timed user echoes are now placed among
  the event nodes by send time before grouping. Segment-only lanes, and
  lanes whose text exists only as segments, keep the earlier sequential
  order."

### 4. PRRT_kwDOPngTds67hf9E / comment 4684616003

- File: `lane-composer.component.ts:150` and `:154`. Prefix alias
  matching maps `gpt-5.5-mini` to `gpt-5.5`, and the reverse.
- Outcome: **fixed**.
- Change: both alias branches accept only a date suffix: `-YYYYMMDD` or
  `-YYYY-MM-DD`. Exact matches and name matches are unchanged. Any
  other unmatched id stays raw.
- Spec (`lane-composer.component.spec.ts`): the new
  `findLaneModelOption` describe block covers dated ids in both
  directions, the variant mismatch in both directions, and the exact
  and name matches.
- Reply: "Fixed in 5f0a7aa95. Alias matching now accepts only a date
  suffix (-YYYYMMDD or -YYYY-MM-DD) in both directions, so gpt-5.5-mini
  and gpt-5.5 never stand in for each other. Exact and name matches are
  unchanged."

### 5. PRRT_kwDOPngTds67hf9M / comment 4684616015

- File: `lane-transcript-messages.ts:91`. Echo suppression matches a
  substring from any turn.
- Outcome: **fixed**.
- Change: each host echo now consumes at most one streamed user
  message, and each streamed message is used once. For a timed echo,
  that message must contain the echo's body and must not predate the
  last output before the send. The containment check stays, because
  providers wrap the prompt (for example the `[Ptah message ...]`
  prefix). Send time is not a lower bound: the existing spec shows a
  provider stream echo stamped before the host's `sentAt`.
- Specs (`lane-transcript-messages.spec.ts`):
  - "keeps a later echo that only an earlier turn contains"
  - "matches each streamed user turn to one echo, so a repeated message
    stays visible"
- Reply: "Fixed in 5f0a7aa95. Each echo now matches one streamed user
  message of its own delivery, used once and not older than the output
  before the send. An earlier turn no longer hides it, and repeated
  messages stay visible."

### 6. PRRT_kwDOPngTds67hf9T / comment 4684616030

- File: `agent-monitor-tree-builder.service.ts:488`. A user echo node
  hides the stdout fallback.
- Outcome: **fixed**.
- Change: `showStdoutFallback` now ignores user echo nodes. The
  component imports `LANE_USER_ECHO_NODE_PREFIX` from the tree builder
  service, beside `AgentMonitorTreeBuilderService`.
- Spec (`cli-agent-output.component.spec.ts`): "keeps the stdout
  fallback when the only node is a user echo". It also checks that a
  structured node still hides the fallback.
- Reply: "Fixed in 5f0a7aa95. The stdout fallback now counts only nodes
  that are not user echoes, so a stdout-only lane keeps its output
  after the user sends a message."

## Commits

- 5f0a7aa95 `fix(cli-agent-runtime,chat): address PR 1509 review round 1`
- This report, committed separately with scope `docs`.

## Checks run (focused only, as the user asked; CI verifies the rest)

- jest `claude-sdk-lane-runner.spec.ts`: 107/107 passed.
- jest, chat lib: 83/83 passed.
  - `lane-transcript-messages.spec.ts`
  - `cli-agent-output.component.spec.ts`
  - `lane-composer.component.spec.ts`
- jest, chat lib, transcript neighbours: 19/19 passed.
  - `lane-transcript.component.spec.ts`
  - `transcript-lane-parity.spec.ts`
  - `transcript-lane-events.spec.ts`
- eslint on the 8 changed files: 0 errors. Three earlier warnings
  remain: max-lines and non-null assertion.
- `tsc --noEmit`, `cli-agent-runtime/tsconfig.lib.json`: clean.
- `tsc --noEmit`, `chat/tsconfig.lib.json`: clean.
- degradation audit: 0 unsuppressed sites.
- ui-class audit: 0 over baseline. No `[class]` bindings were added.
- Not run: verify, nx, builds, spec tsconfig typecheck, and
  `typecheck-templates`. No template changed.

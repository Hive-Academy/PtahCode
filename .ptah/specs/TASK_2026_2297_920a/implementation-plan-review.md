# implementation-plan.md review (coordinator, in-process; author = Codex lane)

Verdict: APPROVED WITH CHANGES (user gate pending)

## Matches the user requirement
- No stopTask / abort in budget, handoff or watchdog paths; kind D (SubagentStop) is the only completion.
- Pause = PreToolUse deny + canUseTool deny interrupt:false with Ptah text; agent stays alive.
- Read-only agents keep Read/Grep/Glob in the pause phase and return a report inline.
- Ptah-caused permission denials relabeled; interrupt:true kept only for a plain user deny.
- SDK stock text cannot be rewritten in the tool_result; plan relabels the Ptah-rendered event and
  adds an origin explanation to the next model input / parent notice. Correct per
  inventory-sdk-cancel-text.md.
- Watchdog: provider-hang guard only inside a confirmed open turn; Monitor/ambient tasks counted from
  raw background_tasks_changed; one first-turn retry for top-level successors, child sessions and
  child successors (Fix C extended); child report routing from authenticated session identity.
- One vocabulary in libs/shared (actor / action / reason / nextStep).

## Lane-introduced constraints (need user confirmation)
1. Pause ceilings at 2x existing keys (6M weighted tokens, 2x context 300k, 2x duration 180 min,
   3 consecutive missing-telemetry turns, 2x repeat-call count, 2x lane inactivity).
2. Lane inactivity timeout and repeat-call stop become ask-then-pause (no kill). A truly hung CLI
   process stays alive until a person stops it.
3. Session handoff ack no longer calls endSession on the predecessor; the predecessor stays live and
   visible until it settles or the user stops it. This changes the top-level handoff flow.
4. Child runtime cap: no forced interrupt after grace; freeze new tools instead.

## Changes required
- Scope is 26 batches across shared, agent-sdk, rpc-handlers, cli-agent-runtime, vscode-lm-tools,
  chat, chat-state. One PR is too large to review safely. Split into phased PRs (see below), each
  independently shippable, with the "never reintroduce a kill" rule kept per phase.
- Proposed phases:
  - P1 subagents + permissions + shared vocabulary/thresholds (batches 1-7, 21-23): fixes failures 1 and 2.
  - P2 watchdog + cause propagation + first-turn recovery incl. children (8-13, 24-25): fixes failure 3.
  - P3 child report routing (17-18): fixes failure 4.
  - P4 CLI lanes ask-then-pause (14-16, 26).
  - P5 Electron UI rendering and handoff banner (19-20).
</content>
</invoke>

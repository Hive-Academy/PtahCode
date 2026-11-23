# S2 live probe: does agy keep the `session/new` system-prompt append on restore?

Date: 2026-11-22. agy 1.5.14 (`agy --version`), model `gemini-4-hydrogen-low`,
`@agentclientprotocol/sdk` 1.7.0 from the repo `node_modules`. Windows 11,
launched from PowerShell with `node` (no slash commands, no Git Bash).

## Method

A Node probe (scratchpad `agy-s2-probe/probe.mjs` and `probe2.mjs`, not kept in
the repo) drives a raw `ClientSideConnection` over `agy acp` stdio in a fresh,
empty temp workspace (`<user>/AppData/Local/Temp/agy-s2-*`):

1. Spawn `agy acp`, `initialize`, `session/new` with
   `_meta.antigravity.systemPrompt.append` = "The session codeword is
   PTAH-S2-XXXXXX. When the user asks "what is the codeword", answer with
   exactly the codeword and nothing else. Never use tools."
   Set `model` = `gemini-4-hydrogen-low` through `session/set_config_option`.
   Send turn 1.
2. Kill the agy process tree. Spawn a new `agy acp`, `initialize`,
   `session/resume` with the same session id, set the model, ask
   "what is the codeword?".
3. Kill again. Spawn a new `agy acp`, `initialize`, `session/load` with the
   same id, set the model, ask again.

`initialize` on every process advertised `loadSession: true`,
`sessionCapabilities.resume`, and `_meta.antigravity.systemPrompt.append: true`.

## Results

Run 1 (confounded: turn 1 already asked for the codeword, so the transcript
held it):

| Turn | Step | Answer |
| --- | --- | --- |
| 1 | new session, ask codeword | `PTAH-S2-UUM6CW` |
| 2 | restart + `session/resume`, ask | `PTAH-S2-UUM6CW` |
| 3 | restart + `session/load` (5 replayed updates), ask | `PTAH-S2-UUM6CW` |

Run 2 (clean for resume: turn 1 is "Reply with the single word OK. Do not
mention any codeword", so the codeword exists only in the system-prompt
append):

| Turn | Step | Answer |
| --- | --- | --- |
| 1 | new session, "reply OK" | `OK` (no codeword) |
| 2 | restart + `session/resume`, ask codeword | `PTAH-S2-PYLG5O` |
| 3 | restart + `session/load` (5 replayed updates), ask codeword | `PTAH-S2-PYLG5O` |

Turn 3 of run 2 is itself confounded by turn 2's answer. Without billing,
the agy store settles `load` too: the full append sentence ("The session
codeword is PTAH-S2-PYLG5O ...") is stored in the conversation database
`<user>/.gemini/antigravity-cli/conversations/<session-id>.db` (11 hits, and
21 in its `-wal`). It is not in the brain transcript logs. Both `session/resume`
and `session/load` restore from that conversation record, so the append
comes back with the conversation and does not depend on the request that
created it.

Billed turns: 6 (3 per run). No agy process was left running after the
probe (`Win32_Process` query for `agy.exe` returned none).

## Zero-turn session (review moderate 6, no billing)

`probe-zero-turn.mjs`: `session/new` with the append, no prompt, kill agy,
then a new process each for `session/resume` and `session/load`.

| Step | Result |
| --- | --- |
| restart + `session/resume` of the zero-turn id | ok |
| restart + `session/load` of the zero-turn id | ok, 0 replayed updates |

The zero-turn conversation's database already holds the append text right
after `session/new`. agy 1.5.14 persists a session at `session/new`, so a tab
closed before its first turn ends still resumes. Billed turns: 0.

## Conclusion

agy keeps the `session/new` system-prompt append across a process restart
for both `session/resume` (clean proof) and `session/load` (proof by
persistence plus a confounded live answer). `instructionsOnRestore: 'none'`
is correct for agy 1.5.14. Re-sending the append on restore would duplicate
it, so no runtime change is needed. The profile comments now record the
probe result in place of "live probe pending".

---
name: session-handoff
description: 'Wrap up this session and continue in a fresh one: finish the current step, write HANDOFF.md, then open a new Ptah session with ptah_session_handoff. Use only when the user, the Ptah session-budget banner, or a child runtime-cap warning asks for /session-handoff.'
---

# Session Handoff

This session is ending. Your job is to leave the next session nothing to rediscover. Anything
after `/session-handoff` (for example a context-usage figure) is context only, not a new task.

## 1. Wrap up

- Start no new work. Bring the current step to a safe stopping point and finish any
  half-made edit; never leave a file broken. Leave uncommitted work in place.
- Check everything still running once: subagents, CLI agent lanes (`ptah_agent_status`; lane
  mechanics live in the `agent-lanes` skill) and child sessions (`ptah_session_status`). Collect
  the results of those that finished.
- Do not wait for CLI lanes or child sessions. `ptah_session_handoff` hands every one still
  running to the new session: from then on their `ptah_agent_report`, `<agent-lane-completed>`
  signal and completion notice go to the new session, which can also use `ptah_session_status`
  and `ptah_session_read` on the children. Waiting here only spends paid turns in this full
  context; `ptah_agent_wait` returns after at most 45 s per call. Never poll.
- Subagents (Task tool) are the exception: they live inside this session and end with it. Let a
  foreground subagent finish its step, or record it as lost.
- Record and continue: anything still running, or waiting on a permission or other outside input
  (for example `awaiting-permission`), is unfinished. Record it under **Background work** in
  HANDOFF.md (its id, its task, its state), then go on. If its report arrives before you finish,
  add the result.

## 2. Write HANDOFF.md

Write it in the task folder you are working in (for example `.ptah/specs/<task>/`); with no task
folder, in the root of the current worktree. Overwrite an earlier HANDOFF.md. Write for a reader
who has none of this conversation:

- **Goal**: what the user asked for, and the decisions they already made.
- **Done**: commits (hash and subject), branches, PRs (links), with verification results.
- **In progress**: what is partly done, and in which files.
- **Open problems and decisions**: blockers, failing checks, questions waiting on the user.
- **Key files**: absolute paths, one line each on why they matter.
- **Background work**: lanes and child sessions still running (id, task, state). The new session
  receives their reports; it can also read them with `ptah_agent_read` / `ptah_session_read`.
- In a child session, list each running lane agent id. Leave uncommitted work in place; never
  stash or revert it for a handoff. The successor uses the same worktree and branch.
- **Next steps**: ordered, concrete, with the exact verification commands to run.

Record facts you checked, not intentions. Leave out what the next session can read from the code.

## 3. Hand off

Compose the continuation prompt. It must stand on its own: the goal in one or two sentences,
the ABSOLUTE path of HANDOFF.md, this session's ID as `predecessorSessionId`, an instruction
to read that file first and continue from Next steps,
the repository rules that matter, and a note that it can run `/session-handoff` itself when its
own budget runs low.

Call `ptah_session_handoff` exactly once with `handoffPath` (absolute path of HANDOFF.md),
`prompt` (the continuation prompt) and optionally a short `label`.

On success, the result lists the lanes and child sessions the new session adopted. Do not act on
them here. Any of their signals that still reach this session can be ignored. Then read
`tabOpened`:

- `true`: tell the user the new session is open. This session closes after the successor acknowledges the handoff.
- `false`: tell the user the new session started, no tab appeared, and it is in the session list. This session closes after the successor acknowledges the handoff.

In a child session, the same steps apply. Write HANDOFF.md in the task folder, or the worktree
root if there is no task folder. A host runtime-cap warning is a trigger. After success, finish
your turn: the host ends this child and starts its successor in the same worktree and branch.

Do no further work here.

## Successor: accept the handoff

Read the exact HANDOFF.md path supplied in the continuation prompt, and no other handoff file.
Take over the adopted work and continue from its Next steps. A successor child session does not
call `ptah_session_handoff_ack`: the host retires its predecessor. The successor of a top-level
session calls `ptah_session_handoff_ack`
once with the predecessorSessionId and handoffPath supplied by the handoff. If it returns
`retryable-failure`, retry at most twice more, a few seconds apart. After the last failure,
tell the user the old session stays open and they can close it by hand. If it returns `refused`,
do not retry; tell the user its reason. If the tool is absent (CLI host or older build), skip the
acknowledgement and tell the user the old session stays open and can be closed by hand.

## Fallback

If `ptah_session_handoff` is not available, or the call is refused (any code) or fails: do not
retry. Print the continuation prompt in exactly one fenced code block and tell the user to paste
it into a new session. HANDOFF.md stays where you wrote it. Lanes and child sessions stay with
this session, so their reports arrive here. If the refusal says the new session
may still open late, tell the user to look for it in the sessions panel first, and to paste the
prompt only if it does not appear.

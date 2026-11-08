# Fourth-pass fixes review

**Verdict: REVISE — 7/10.** Reviewed the uncommitted fixes against HEAD `c1111f47f`. Scoped verification was reported as passed; this review ran no checks or Electron visual pass.

## BLOCKING

- **D: derived names exceed the stated 256-character protocol limit for astral Unicode.** `sessionNameFromPrompt` caps `Array.from(clean)` at 256 code points, so 256 emoji produce a name with 512 UTF-16 units (`libs/backend/worker-host/src/lib/commands/remote-sessions.ts:184`). The `session.start` name contract uses `z.string().max(256)`, which counts UTF-16 units (`libs/worker-protocol/src/lib/methods.ts:330`). The generated name bypasses that input parser, but it breaks the documented limit and cannot round-trip as a valid `session.start` name. Cap the final string by the schema's length measure without splitting a surrogate pair.

## Non-blocking follow-ups

- **K:** The `turn_state` terminal phases mean the foreground turn ended, including `awaiting-background`; revision ordering and the driver's `ending` guard avoid the reviewed early/double-end cases. The generating revision is held in a `WeakMap` keyed by turn/admission objects, so it does not retain old turns. An SDK/Electron denial replay would still confirm the live event path.
- **H:** `isError: true` maps both denied and ordinary failed tools to the accurate `Failed` state. A distinct `Denied` label would need a separate denial signal; the fourth-pass expected wording is not met.
- **G:** The selector targets descendant `.prose ol` within this transcript and adds only list styling. Visual appearance was not confirmed in Electron in this read-only review.
- **D privacy:** Prompt-derived names make the first prompt visible in session lists and replay; this is consistent with the live title but should be considered when naming prompts that contain secrets.

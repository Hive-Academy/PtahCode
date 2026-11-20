# Run startup CLI probes off the Electron main thread

## Problem

About 10 s after the Electron window opens, the main process is blocked.
`boot:getReadiness`, `agent:detectClis` and other RPCs time out in the renderer.
A CPU profile puts the time in `child_process.spawn` (synchronous `CreateProcessW`
on Windows, slower under antivirus scanning) called from `execFile` in
`readVersion` (`libs/backend/codex-runtime/src/lib/select-codex-executable.ts`).

Most rival-CLI probes already use `SDK_PROCESS_SPAWNER` (`OffThreadProcessSpawner`,
a `worker_threads` pool). These still spawn on the main thread:

- Codex `readVersion` (`execFile`): CLI detection, Codex readiness, plan limits.
- `ClaudeCliDetector.executeCommand` and `ClaudeCliPathResolver` (`cross-spawn`, `spawn`).
- Plan-usage readers: antigravity, grok, opencode, fallback runner (`execFile`, `spawn`).

## Plan

1. `platform-core`: `runProcessToCompletion(spawner, request, { timeoutMs, maxOutputBytes })`
   over the `IProcessSpawner` port.
2. Route each main-thread spawn above through it, with the host's
   `SDK_PROCESS_SPAWNER`. Keep the direct call as the fallback when no spawner is given
   (CLI host, tools).
3. Verify in the Electron dev app: no event-loop lag above 1 s at startup and no RPC
   timeouts in the renderer console.

## Outcome

- Done: Codex `readVersion`, `ClaudeCliDetector.executeCommand` and
  `ClaudeCliPathResolver.resolveCommandPath` run through the host `IProcessSpawner`
  when one is given. Every host that calls `registerSdkServices` registers
  `SDK_PROCESS_SPAWNER`, so the CLI host uses the worker path too. Only code that builds
  these classes without DI (`new ClaudeCliDetector()`, tools, specs) spawns inline.
- Not done, measured as not worth it: the plan-usage readers. A CPU profile of startup
  after the change shows 30 ms of main-thread spawn time in the antigravity reader and
  55 ms in a Codex app-server child kill, against about 3 s before.
- Measured in the Electron dev app (worktree build, test workspace): longest event-loop
  block 0.75 s in the first run and no lag warning in the profiled run (before: about
  10 s). No RPC timeouts in the renderer console (before: 3 to 12).
- Review (code-logic-review.md) findings fixed: a probe that times out before its pid is
  known is now killed (`handle.kill()` is queued by the spawner); `error` listener is
  `on`, not `once`; the Electron bootstrap checks `isRegistered` before resolving the
  spawner. F3 (cross-spawn parse on the host thread) is covered by the lag measurement.

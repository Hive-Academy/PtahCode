# Context

## Problem

Packaged Electron build, 2026-11-10 about 15:58 UTC. The renderer console showed a burst of
`[ClaudeRpcService] RPC timeout` errors for eight startup methods, then
`RendererFrame: long frame` with `durationMs` 34482 and `blockingMs` 34431, then one minute
later `RecentSessionsStore: Session list RPC failed` with `workspacePath: ""` and no error code.

## Hypotheses

1. The renderer main thread was blocked for 34 s. The RPC timeouts are a symptom.
2. The Electron main process was blocked and answered late.
3. The session list failure with an empty `workspacePath` can be a separate defect.

## Investigation lanes

| Lane | Family | Deliverable |
| --- | --- | --- |
| codex (forced past the weekly limit gate, as the task brief permits) | codex | `investigation-renderer.md` |
| Claude Api | anthropic-api | `investigation-main.md` |

## Rules for this task

- Verify only with `npm run verify -- -p <changed projects>`.
- No `build`, `serve`, `dev`, `e2e`, `package`. Do not launch the app.
- Independent review by a different family before the first push.

# Context — TASK_2026_2330_5c6e

User report: "in earlier claude code cli session we fixed sending commands for agy acp runtime,
but currently with codex app server when i send any command it completely breaks and returns error".

Reference: commit 4836da477 (ACP lane turn input and commands, provider-session-lane-handle.ts,
antigravity-acp-lane.ts). Codex app-server adapter: libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/.

Type BUGFIX, depth Minimal/Partial. Gate 0.1: lanes enabled (user asked: CLI-lane-first, Claude
usage 96%). Approval mode: lane-review. Executor: codex (diagnose + fix). Reviewer: grok or Kimi Code
(different family).

Lanes available: codex (39% weekly), grok (49%), Kimi Code (46% 5h), antigravity, opencode.

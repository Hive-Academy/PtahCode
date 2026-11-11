# Context: setup hub on Codex stops at the first question

## Source

Second setup hub trial on the Electron dev app (2026-11-10), recorded in
`.ptah/specs/TASK_2026_927_144e/trial-2-findings.md` on branch `fix/skill-delivery-and-routing`
(PR #1067). Provider: OpenAI Codex, model `gpt-6.1-terra`. Workspace: an empty folder.

## Observed

The flow `/onboarding/new-project` → RPC `harness:start-new-project` started a Codex session. The
skills were delivered and Codex read `saas-workspace-initializer`. Then the run stopped.

### F4: the Codex question is aborted at turn end

- Codex has no `AskUserQuestion`. It asked the first discovery question through
  `request_user_input_async`. That tool returns `{"accepted":true}` at once, and the turn ends.
- Ptah `SdkPermissionHandler` aborts the pending question when the turn ends. Log marker:
  `codex-user-input-undelivered`, cause `turn-ended`.
- The banner "Question needs an answer" stays on screen. The bell shows "All clear". Nothing can be
  clicked. The user cannot answer.

### F2: the Codex session is not reachable

- After "Continue", the home page shows "1 sessions". The Sessions panel shows "No sessions yet".
- No tab and no chat input exist for the session started by `harness:start-new-project`.
- `session:list` reads `~/.claude/projects` through `JsonlReader`. A Codex session lives in
  `~/.codex/sessions/**/rollout-*.jsonl` and is not listed.

## Result of the trial

The workspace holds only the files Ptah wrote (`.agents`, `.claude`, `.ptah`, `.github`,
`.gitignore`, `.mcp.json`). No discovery answers, no roadmap, no scaffold.

## Goal

A setup hub run on Codex must get past the first question:

1. A question asked with `request_user_input_async` stays answerable after the turn ends, and the
   answer reaches Codex (as the tool expects for the asynchronous form).
2. The user can see and open the session that `harness:start-new-project` started, for a Codex
   session as for a Claude session.

## Acceptance

- Unit tests cover both corrections.
- A repeat of the recorded trial on Electron gets past the first discovery question.

## Direction change (user decision, 2026-11-11)

The user decided to route two setup hub flows to the normal chat:

- "New project" (`/onboarding/new-project`, mode `new-project`)
- "AI team builder" (`/onboarding/team-builder`, mode `configure-harness`)

Both flows share `ProposalFlowStore`, `ProposalWorkspacePage` and `ReviewApplyPage` in
`libs/frontend/onboarding/src/lib/proposal/`. The workspace page is a private copy of a chat (run
log, reply composer, answer dock, session status). It is the reason the session is not visible and
the Codex question has no answer path.

Target: each flow keeps its brief form as a thin launcher. On submit, Ptah prepares the workspace
(plugins, skill allowlist, seed prompt) and opens an ordinary chat tab on that session. The agent
proposes and applies the harness from the chat. The custom proposal and review pages go away.

Out of scope: the "Analyze workspace" flow (`/onboarding/analyze/**`) stays in the setup hub.

Still needed in any design: the Codex `request_user_input_async` question must be answerable in the
normal chat (F4). `investigation.md` covers that.

## Lane limits (2026-11-11)

- `antigravity` (cli, family antigravity): usage quota reached at about 06:00 UTC during the review fix round (HTTP 429 RESOURCE_EXHAUSTED). Reset at about 07:30 UTC. Fallback: Claude Api ptah-cli lane (family anthropic-api).

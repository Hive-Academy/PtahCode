---
id: TASK_2026_2308_provswitch
status: backlog
type: BUGFIX
title: Continuing a chat after a main-agent switch sends the new provider's model
depends_on: []
relatesTo: [TASK_2026_2297_agy]
created: '2026-11-22T18:30:00.000Z'
updated: '2026-11-22T18:30:00.000Z'
description: >-
  Found in the 2026-11-22 integration live test (Electron, Windows). With an
  Antigravity chat open, the workspace main agent was switched to OpenAI
  Codex (gpt-6-luna). Continuing the existing Antigravity session then ran
  applyLiveTurnSettings with the composer's new model: agy rejected
  session/set_config_option model=gpt-6-luna ("Unknown model ID") and
  ProviderSessionChatAdapter logged runtime-failed: model. The turn still
  answered (no error shown), but a session must keep its own provider's
  model. Fix: the composer/live-turn settings for an existing session must
  use that session's provider and model (or ignore a model the session's
  provider does not advertise), never the workspace's current main agent.
  Check Claude and Codex sessions after a switch too. Code path:
  ChatSessionService.continueSession -> applyLiveTurnSettings ->
  ProviderSessionSessionControls.setSessionModel.
executor: claude
estimate: S
---

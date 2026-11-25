# Task Context - TASK_2026_2325_lvrf

## User Request

2026-11-25, after PR #1509 merged: "do the live test and everything you need but make sure to use
low priced models for the test".

## Scope

- L4: Claude lane steer on a dev build with `messaging.steer` flipped to supported in
  `claude-cli.adapter.ts` and `ptah-cli-registry.ts` (uncommitted until L4 passes; Batch 6 of
  TASK_2026_2324_efc4).
- Claude follow-up settling by `user_message_uuids` (live behaviour change from PR #1509 round 1).
- Lane resume after an app restart keeps the stored permission (Grok yolo, Claude, Codex).
- Electron re-check of the visual fixes (full desktop window), NG0103, sub-agent composer.
- Grok live usage mid-turn, stopped-lane efforts, Claude image on resume, Grok running `/context`.

## Models (cost rule)

Cheapest models only: Claude Haiku 4.5 (main chat and Claude lanes), Codex smallest/mini tier at
low effort, agy `gemini-4-hydrogen-low`, Grok cheapest listed model at low effort. Tiny prompts.

## Verification

User: "let CI do the verification". Builds here are for the live run the user asked for.

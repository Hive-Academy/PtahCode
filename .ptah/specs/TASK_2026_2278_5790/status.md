# Status — TASK_2026_2278_5790

## Report 1 — plan (2026-11-18)

- Task folder: `.ptah/specs/TASK_2026_2278_5790/` in worktree `fix-settings-field-info-hints-ca36b7999aeb`.
- Files to change: `ptah-ai/lane-guards-settings.component.ts` + `.logic.ts`,
  `ptah-ai/session-budget-settings.component.ts`, `ptah-ai/local-stt-panel.component.ts`,
  `ptah-ai/local-tts-panel.component.ts` and their specs. Possibly
  `search-voice-settings.component.ts` and the harness spec
  `settings-advanced-search-voice.e2e.spec.ts` (select stacking).
- Executor: one codex lane for the field edits. I run checks, shots, commit, push and PR.
- (c) `ptah-select info`: not done. All selects in scope sit in a `ptah-field`, which already
  shows the info button. No standalone consumer exists in scope.
- ~~Known parity change: `lane-guards-intro` goes away.~~ Corrected by the coordinator: the id and
  data-testid stay. `ptah-field` gets optional `infoTextId` / `infoTestId` inputs for its
  always-present sr-only info text; lane guards passes `lane-guards-intro` to both.

## Before shots (Electron, base 8826c7262)

- Fixture fix: the shot spec mocks valid `sessionBudget.*` defaults (the advanced fixture gave
  null, which showed "saved value is not valid").
- Stacking: Search & Voice page TTS provider panel covered by the Go vet form section at 1824,
  1168 and 784. Drawers (Whisper model, TTS voice): on top. Fix: stacking classes on the
  `search-voice-page` container + trial click in the harness spec.
- Toggle hints at 1168 px: "Hand off automatically at 100%" 2 lines, "Routing suggestions"
  2 lines. Both shortened to one line (routing hint differs from the prototype text now).

## Coordinator correction (accepted)

- Keep every id / data-testid / aria-label, also for text that moves into a popover.
- Gate shots 1824 / 1168 / 784 dark (light also taken), one open info popover shot per page,
  no cut text, popover above neighbor fields.
- ui-class-audit totals not above origin/main. Report full head sha + PR number after push.

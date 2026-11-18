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

## Report 2 — PR open (2026-11-18)

Child "I" (TASK_2026_2278_5790): PR #1429 is open against main. It is not merged.

- PR: https://github.com/Hive-Academy/PtahCode/pull/1429
- Head: 7e73dd4ff8adc94eee658b9bb2f29842920867bd (one push). Merge of origin/main 1790df542 is in.
- Shot folder: `docs/design-system/settings/gate/1429/` (59 files). It was 1428, but #1428 was
  already taken, so commit 7e73dd4ff renamed the folder before the push.
- Checks on the merged head: lint + typecheck 10/10 PASS. typecheck-templates PASS.
  ui-class-audit 0 over baseline. Electron shot spec before + after: 1 passed each.
- Test: all projects PASS except chat: 1 failed / 6635 passed in
  `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts` ›
  "resends a direct command whose send already settled with authoritative absent". This task did
  not touch that file. The spec alone also fails (1 failed / 46 passed, deterministic), so the
  defect comes from origin/main. Open PR #1428 (`fix/auto-handoff-resend-spec`) changes only that
  spec. The PR body states this, and that test-plan line is not checked.
- Harness e2e spec `settings-advanced-search-voice.e2e.spec.ts`: not run locally (CI runs it).
- task.md status: in_review. CI watch is active.

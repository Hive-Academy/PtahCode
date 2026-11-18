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

## Report 3 — review fixes pushed (2026-11-18)

PR #1429, head 56df676881741c80fff4db4ea17d931fb153f6d9. All 5 coordinator findings are fixed. Not merged.

- 1: "Tighten auto-compact window (tokens)" → "Compact window (tokens)" (same key, id, testid).
- 2: local grid tracks `minmax(min(100%, 22rem), 1fr)`: "Handoff after compactions" and "Weighted session tokens" are not cut (the grid has 3 columns at 1824, 1 column at 1168 and 784).
- 3: every grid field has one hint line, one row gap `calc(var(--ptah-gap-field) + var(--ptah-field-label-float-leading) / 2)`. Measured gaps are equal (within 2 px) at all widths.
- 4: decision table (field | help | result):
  Budget unit | Tokens or priced cost. | hint ·
  Token measure | Weighted discounts cache reads. | hint ·
  Token budget | Chat token limit. | dropped (repeats label), range hint ·
  Cost budget (USD) | Session cost limit. | dropped, range hint ·
  Fallback weighted tokens | Without pricing. | hint + range ·
  Tighten at (%) | Below Handoff. | hint + range ·
  Handoff at (%) | Offers handoff. | dropped (repeats label), range hint ·
  Handoff after compactions | Handoff after repeated compactions leave context at least half full. | popover + range hint ·
  Compact window (tokens) | Advisory until set. | hint + range ·
  Repeat-call stop at | long lane guard paragraph | popover + "Range: 2 or greater." ·
  STT Whisper model | Downloads on first use. | hint (folder detail dropped) ·
  STT / TTS custom model | Use owner/name or an absolute folder path. | hint.
  The sr-only help paragraphs and ids of the two selects stay.
- 5: STT and TTS custom model input gets a full row with Save below; the placeholder is not cut at 1168 and 784.
- Shot spec: the after phase now fails on a cut floating label, select value or placeholder (budget grid and drawers), and on budget row gaps that differ by more than 2 px. An empty input keeps its label in the box; the gap check uses the floated notch offset for it.
- Shots: docs/design-system/settings/gate/1429/ (56 files). The after shots are new. The voice-stt-info-open-* shots are removed (Whisper has no popover now). Budget popover shots: context-info-budget-open-dark-{1824,1168,784}-after.jpg (Handoff after compactions).
- Checks: full gate on the review-fix head before the last merge: lint + typecheck 10/10 PASS. Test PASS except chat 1 failed / 6635 passed, only the origin/main spec session-auto-handoff-coordinator.service.spec.ts. Then PR #1428 merged; I merged origin/main (958409505). On the merged head, that spec plus the 3 changed settings specs: 4 suites, 140 tests PASS. typecheck-templates PASS. Electron after shot spec 1 passed.
- Earlier CI failures on 7e73dd4ff (test shard 4/4 and main): only that same chat spec. main is the summary job.
- CodeRabbit: no review. It hit its rate limit ("Review limit reached"), so I have no finding to accept or reject.
- Pushes: this is the second push. The first push opened the PR. The review fixes needed this second push.

## Report 4 — last 2 findings fixed (2026-11-18)

- 1: the session budget grid keeps the shared 14rem tracks: 3 columns at 1824, 2 at 1168, 1 at 784. In the 2-column range (container query 29rem–44rem), Fallback weighted tokens, Compact window and Handoff after compactions span both columns (their hint or label does not fit in one 232 px track). Compact window now comes before Handoff after compactions, so the 2-column grid has no empty cell. Row gaps stay equal. No text is cut.
- 2: STT and TTS custom source: the field takes the free width and Save sits at the end, centred on the field box. With a custom source, the TTS Voice select spans the full row, and its hint is on one line. 1824 has the same layout.
- New shot checks: 2 columns at 1168. Save is centred (within 2 px) on the custom field box. The Voice select is not narrower than the custom row.
- Checks: focused jest 93 PASS. Full gate (chat, ptah-electron-e2e, webview-e2e-harness, ui-class-audit) PASS with no test failure. typecheck-templates PASS. Electron after shot spec 1 passed.
- Not merged. Only the coordinator merges PR #1429.

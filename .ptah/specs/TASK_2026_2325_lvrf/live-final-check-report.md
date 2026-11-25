# Live final check - TASK_2026_2325_lvrf

Build: head fce4aa49d. `build-dev`, `copy-wasm.js`, `copy-renderer-dev` run one at a time under the verify lock (MIN_FREE_GB=4). No OOM. Electron with CDP 9333, real "Ptah Dev" profile, maximized (1920x983), DevTools target closed. Log: `.ptah/tmp/electron-main-final.log`. Screenshots: `screenshots/final-*.png`.

Models: orchestrator turns on Haiku 4.5 (SDK query model claude-haiku-4-5-20251001); Claude lanes Haiku (policy `haiku`, reported "Haiku 5.5"); Grok lanes `grok-4.7` (CLI default). No `claude-opus` in any lane policy or init of this run. Spend: session cost $1.09 -> $1.50 shown in the inspector (about $0.04 from my turns; the rest is the shared session figure that also moved by earlier-lane rollups). Orchestrator turns 3, Claude lanes 2 (one stopped mid-tool), Grok lanes 3.

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Chip in toolbar, no hint lines, one scrollbar, pinned composer | PASS | Stopping chip `final-13-stopping.png`; Stopped chip, tooltip "Stopped by you" `final-14-stopped.png`, `final-17-chip-tooltip.png`. No hint/status line under the card in any state. Running Claude lane: collapsed bar "Claude is working... Haiku 5.5 [Stop]", no scroller (`final-12`). Long done Grok lane (restored, 12m): one scrollbar at x~1402, composer pinned (grok lane screenshot before resume, `final-25`). Only one overflow container found in the lane panel by DOM probe. |
| 2 | Stale tool rows | PASS | Claude lane stopped mid `Start-Sleep 100`: tool row shows orange bar and final time `49.2s`, not "running (Ns)" (`final-16-stopped-expanded.png`). DOM scan for "running (" is empty in all lane views. A restored lane could not be opened directly (see check 5), so the restored-lane case is not seen. |
| 3 | Model pill, "N earlier" tile | PASS with note | New/resumed lanes: pill "Haiku 5.5" (`final-12`, `final-14`). Tile "claude-fable-5-2 +..." initially "Haiku 4.5 +2 earlier"; rows read "current" / "earlier in this session" (`final-19-models-rows.png`). Note: the "current" row is a raw id `claude-fable-5-2`, and the old Opus lane (restart orphan, ran Opus 5.5) still shows pill "claude default" (`final-01`). |
| 4 | F1 resume of an orphan with "claude default" | NOT RUN | The only orphan still showing "claude default" is the Opus child lane (last-run model Opus 5.5), so a resume would legitimately use Opus; not resumed under the cost rule. The stopped 4m37s orphan redirects to that child (`final-03`). |
| 5 | F2 view follows resumed lane | PASS | Resumed the restored Grok lane (12m57s) with "Reply OK." The new running lane became the active tab at once and stayed through 18 s of polling (`final-24`, `final-25`). The old tab is no longer the viewed one. |
| 6 | F3 new Grok lane shows composer while running | FAIL | `final-10-grok-running.png`, `final-11-grok-running-b.png` (new spawn) and `final-25-after-resume-20s.png` (resumed): the only control is a lone red stop square at bottom-left (386,953); no composer. No lane textarea in the DOM (only the orchestrator one, width 0). Claude running lane shows the collapsed bar correctly, so this is Grok only. |
| 7 | F4 `/context` | PARTIAL | Typing `/context` + Enter now inserts `/context ` (not `/compact`) (`final-20`, `final-21`). Second Enter sent; log `Delivering a raw lane command {"command":"context"}`. No budget handoff prompt. But no "Grok ran /context and returned no output." info line and no output: the transcript shows only the "Unverified" card (`final-22-grok-context-sent.png`; DOM search for "returned no output" is empty). Turn ended in 2 s. |
| 8 | Theme pass | PASS | ptah-glass (dark): all shots above. ptah-glass-light: chip "Stopped", tool row and composer legible (`final-28-light-stopped.png`, `final-29-light-chip.png`). |

## Evidence for FAIL / PARTIAL
- F3: see check 6 screenshots; DOM probe `textarea` list while Grok running returned only the zero-width orchestrator textarea.
- F4 info line: after send the DOM has no match for "ran /context" or "no output".

## Other observations
- Clicking the restored stopped Claude lane (4m37s) or the 9m59s done Claude lane in the strip re-selects the 9s Opus child lane; the originals cannot be viewed (`final-02`, `final-05`). Possibly the intended F2 redirect, but it hides those lanes.
- Orchestrator row in the inspector shows `claude-fable-5-2 -- 59:xx`, a raw id with a timer-like suffix.
- The theme was left on ptah-glass-light in the profile (the restore click hit a closed popover). Set it back by hand.

## Process
Lanes started: Claude x2 (Haiku), Grok x3; none running at the end (all done or stopped). Electron closed (PID 2116 tree), 0 electron processes. No source edited. `nm_cache_bak/` untouched.

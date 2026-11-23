# Visual Review Round 2 - TASK_2026_2309_5bea

Verdict: APPROVED (score 8/10). No visual-breaking or serious findings. 8 of 10 defects verified fixed, 1 partial (D3 chips), 1 unchanged/minor (D10); D4 verified fixed in light. TASK section could not be reviewed visually.

## Environment
- Electron dev instance (CDP 9333), workspace /tmp/ptah-live-test, one session "Stats sidebar live test" (6 msgs, no linked task).
- Widths 300/336/400/448 reached with the app's own split handle (real mouse drag). Only the Electron window was resized (id 0x05000004).
- Themes: dark = ptah-glass (predecessor run); light = DaisyUI "Light" (data-theme=light confirmed). Note: the dialog's "Light" filter tab (index 2) is a category; the theme itself is the button at index 6.
- Screenshots: TF/visual-review/round2/{w300,w336,w400,w448}-dark.png, {w300,w336,w400,w448}-light.png, tooltip-light.png, models-400-dark.png, agent-detail-400-dark.png, focus-models-400-dark.png, open-336-dark.png.

## Defect table
| # | Defect | State | Evidence |
|---|---|---|---|
| 1 | Plan-limit labels truncated | FIXED (dark, light) | Full labels "Claude and GPT models · Weekly", "Gemini Models · 5 Hour" at 300-448; w400-light.png |
| 2 | Models disclosure | FIXED (dark) | One card, Cost basis Reported, no sr-only leak; models-400-dark.png |
| 3 | Agent share bars + header chips | Bars FIXED; chips PARTIAL | Orchestrator bar with aria "100% of reported session tokens"; codex/antigravity show a dash and no bar. Only the Done chip renders (workflow/branch inputs empty in this session), so chips are not confirmed against the reference |
| 4 | Opaque popover in light theme | FIXED | `.cdk-overlay-popover` bg rgba(0,0,0,0), border none; no full-window fixed/absolute layer with a background; tooltip-light.png |
| 5 | Agent names truncated at 300 | FIXED (dark, light) | Cost column drops at 300 and 336, names full; w300-light.png scenario same |
| 6 | Agent detail cramped | FIXED | Two-column label/value pairs, Status on one line (agent-detail-400-dark.png, w400-light.png) |
| 7 | Legend wrapping | FIXED | "2 unreported" in one line; "≥ = lower bound" inline; wraps whole at 300 |
| 8 | Duplicate limit lines / ? hint | FIXED | Claude row single "no open session" line. The `?` tooltip was not hover-tested |
| 9 | Zero-share sliver | FIXED | 0% fill measured 0.00 px (0.23 px at 0.1%) |
| 10 | Always-on ring on compact button | UNCHANGED, minor | Ring seen while the tooltip is open; consistent with the focus style |

## Light theme findings
- No horizontal overflow at 300/336/400/448 (only a hidden 1 px "Branch" dt, same as dark).
- Contrast (canvas-resolved rgb, WCAG formula): title 14.68, tooltip text 9.20, muted labels ("SDK + CLI", "≥ = lower bound") 6.27, "Review changes" link 5.72. All pass AA 4.5:1 for 11-12 px text.
- The "Done" chip text/background pair was not separately measured (colour deduplicated in my script). Not a finding, residual uncertainty.
- "Compactions 0" for Orchestrator: cannot tell a real zero from an unknown value. Trust-the-data question for the lead (moderate, unverified).

## New defects
- None serious or breaking.
- Minor: casing "Gemini Models" vs "Claude and GPT models" in producer data (not CSS).
- Minor: the Themes dialog stays open after Escape (observed count 1 afterwards). Possibly because the dialog was in a transient state; not part of the sidebar scope.

## TASK section
NOT reachable. The workspace has one session and no linked task, so no TASK section is in the DOM. I did not create or link a task, because that would alter workspace data and the instruction forbids faking it. Defect from the TASK section (stat tiles, collapsed Documents/Folders tiles) is unverified visually; only the lane's spec/jest evidence exists.

## Not examined
Keyboard and focus pass done in dark only (Models disclosure ring 2px + halo, Enter/Space toggles). Loading skeleton never observed. Browser set: Electron (Chromium) only, per the repository rule.

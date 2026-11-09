# Stitch — Reviews

Status: **one screen export.** [reviews-a-1280-dark-stitch.png](reviews-a-1280-dark-stitch.png)
(2560 × 2048) is option A, wide, dark. The retry with a one-sentence prompt
(`GEMINI_3_5_FLASH_LITE`, session `17121144131799240923`) succeeded. `list_screens` still returns
`{}`, so the PNG is the project thumbnail (`projects/9667497201590341954/files/0ac9632c…`).
No HTML export is available. Earlier, longer prompts timed out three times.

What the Stitch screen confirms: the 3-pane layout works at 1280 px, and the stage strip,
coverage meters and findings table fit in the detail pane.

Deviations in the Stitch screen (do not build these):

- Invented app chrome: "ReviewPulse" brand, top tabs (Runs, Pull Requests, Rules, Analytics),
  Export Report, Trigger Analysis, avatar. The Electron shell owns the chrome.
- Invented status-bar footer (Engine RPC, Mem, version). Not in the contract.
- Minor severity in blue. DESIGN.md: Minor = idle outline, blue = run status only.
- Clipped text: the status chip "Comple…", the stat "Suppresse…", the column "Confi…".
  The build wraps chips into an overflow menu and uses `ptah-stat-card` with wrap.
- `code-xs` 11 px meta, 6 px dots, uppercase-free but bold column titles: see report.md
  section 4 for the token mapping.
- Invented data (coverage %, cache hit rate, tokens). The contract has per-lens coverage
  status, not percentages — the build shows status, not a fake percentage.

The prototypes in `../../prototype/` are the reference for review. They use the real tokens.

The layout decision uses the text wireframes in [../../reviews-ux.md](../../reviews-ux.md)
section 9.

## Prompts to run again (in https://stitch.withgoogle.com or through the MCP)

Put the DESIGN.md section 10 preamble before each prompt. Desktop device. Dark first, then the
same prompt with the light preamble.

1. **R1 option A, wide, dark.** Page "Reviews". Header: title, chip "Publishing live", buttons
   Pause, Refresh, Settings. Three panes: 240px repository list with mode badges (Live, Dry
   run, Paused); 340px list of PR review runs with status dots (Running, Completed, Failed,
   Partial coverage); detail of PR #482 with an 8-stage timeline, coverage per lens and a
   findings table with severity badges Critical, Major, Minor.
2. **R1 option A, narrow (360px), dark.** Runs list only, repository select in the toolbar.
3. **R1 option B, wide, dark.** KPI strip of 4 stat cards, repository chips, full-width runs
   table, run detail in a 480px right drawer.
4. **R1 option B, narrow, dark.** Stat cards 2 x 2, stacked rows.
5. Repeat 1 to 4 with the light preamble.

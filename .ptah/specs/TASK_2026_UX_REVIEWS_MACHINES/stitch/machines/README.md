# Stitch — Machines

Status: **no screen export. Stitch is not used for Machines.** It is the same Stitch project as
Reviews (`9667497201590341954`). The one retry with a one-sentence prompt
(`GEMINI_3_5_FLASH_LITE`) timed out again, so I stopped using Stitch for this page. The
prototypes in `../../prototype/machines-a.html` and `machines-b.html` replace it.

The layout decision uses the text wireframes in [../../machines-ux.md](../../machines-ux.md)
section 8.

## Prompts to run again

Put the DESIGN.md section 10 preamble before each prompt. Desktop device. Dark first, then light.

1. **M1 option A, wide, dark.** Page "Machines", subtitle "2 of 3 connected", chip "1 approval
   waiting", button "Add machine". Left 280px machine list with search and status markers
   (Connected filled circle, Reconnecting ring, Offline hollow circle). Right: machine
   overview of build-01 with versions line, Readiness check button, an approval card (tool
   Bash, argument `npm test`, 42 s countdown, Allow once, Deny), a collapsed readiness tile
   "7 of 7 passed", and a sessions list with New session.
2. **M1 option A, narrow (360px), dark.** Machine list only, search always shown.
3. **M1 option B, wide, dark.** Approvals strip on top, grid of machine tiles with state,
   session count, readiness and Retry now on offline tiles.
4. **M1 option B, narrow, dark.** One tile in each row.
5. **M12 session view, wide, dark.** Back "build-01", transcript, composer with Send and Stop.
6. Repeat 1 to 5 with the light preamble.

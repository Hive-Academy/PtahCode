# Context: UI foundation (step 0)

Umbrella task: TASK_2026_924_8ac1 (owner of `libs/frontend/ui`). Plan:
`.ptah/specs/TASK_2026_924_8ac1/design-system-plan.md`, section 10 step 0.

## User decisions (2026-11-10)

- U1: the visual direction is decided family by family at the Look approval gate.
- U2: polished pages can change. Exceptions: chat composer and canvas rail.
- U3: remove the overlap in the ui lib.
- U4: the shared tooltip is only for icon buttons.
- U5: no new dependency.
- U6: one density.
- U7: close TASK_2026_904 after Wave 1.
- U8: accept the TASK_2026_919 decisions D3 and D5 to D8.
- U9: the VS Code host gets the new look at the same time.
- Quality bar: a maintainable code base, one design language, correct white space and visual
  hierarchy.

## Batches

| Batch | Content | Branch | State |
|---|---|---|---|
| 0a | Tokens (`foundation-tokens.md`), Tailwind names, guard specs | `feat/ui-foundation-tokens` | In review |
| 0b | Gallery split into sections, token specimens, theme switch | stacked on 0a | In review |
| 0c | `ui-class-audit` step in CI, baseline seeded again | `ci/ui-class-audit-ratchet` | In review |
| 0d | `look-approval-checklist.md` | `feat/ui-foundation-tokens` | Written |

## Decisions of this task

1. The token file is in the ui lib (`libs/frontend/ui/src/lib/tokens/ptah-tokens.css`), not
   in the 4100-line `styles.css` of the application. The ui lib owns the tokens that its
   components use.
2. The spacing scale is a subset of the Tailwind scale. No second scale exists.
3. Control heights xs and sm are equal to DaisyUI `btn-xs` and `btn-sm`. Adoption at these
   sizes moves no pixel.
4. Radius and border come from the DaisyUI theme variables. A theme controls the shape.
5. Batch 0c finding: the ratchet was red on `main` (44 counts in 13 files above the baseline,
   total 5570 in 452 files). The ratchet did not run on each pull request. Batch 0c seeds the
   baseline again from `main` and adds the CI step. The total did not go up (5572 to 5570).

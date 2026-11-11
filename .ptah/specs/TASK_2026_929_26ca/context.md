# Family 1: button, icon button, tooltip

Task TASK_2026_929_26ca. Family 1 of `.ptah/specs/TASK_2026_924_8ac1/design-system-plan.md`.
Foundation: TASK_2026_926_6b1f (tokens, gallery, ratchet, Look approval checklist).
Input: `button-research.md` in this folder (counts, recipes, reference pages).

## Decisions

1. One owner folder: `libs/frontend/ui/src/lib/button/`. The old file
   `surfaces/button.directive.ts` moves there. The public API stays `@ptah-extension/ui`.
2. Five variants: `primary`, `secondary`, `ghost`, `danger`, `link`. Three sizes for one
   density: `xs` (row and toolbar action), `sm` (default), `md` (the one primary action of a
   page or a dialog). There is no outline, success, warning or info variant.
3. Hosts: `button[ptahButton]`, `a[ptahButton]`, `button[ptahIconButton]`, `a[ptahIconButton]`.
4. An icon button has a required `label`. The label becomes the `aria-label` and the text of
   the shared tooltip. The tooltip is a directive on the CDK Overlay. Only icon buttons use it
   (decision U4).
5. Batch 1a (extract) and batch 1b (adopt) move no pixel: the host classes stay the DaisyUI
   recipe (`btn btn-<variant> btn-<size>`). The new look is batch 1c. It is a proposal behind
   the Look approval, and no product page gets it before the approval.
6. The chat composer and the canvas rail are exceptions. `ptahSetupAction` and
   `ptahRailIconAction` keep their look.

## Batches

| Batch | Content | State |
|---|---|---|
| 1a | Extract: folder, directives, tooltip, specs | In work |
| 1b | Adopt zero pixel: the equal recipes | Not started |
| 1c | Proposed look, gallery entry, look sheet `family-1-look.md` | Not started |
| Stop | Look approval by the user | Not started |

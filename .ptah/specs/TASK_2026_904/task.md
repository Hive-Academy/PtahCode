# TASK_2026_904 — Unified composable UI system with liquid-glass refinements

- status: in_progress (Wave 1 implementation on feat/component-system-wave-1; see wave1/decisions.md)
- type: CREATIVE
- branch: feat/liquid-glass-design-system
- worktree: .claude-worktrees/feat-liquid-glass-design-system-222de99f5343
- scope: design and plan only (no production code)
- direction: see context.md (scope correction, direction changes 2-4; #1028 merged at bcd76af07)

## Deliverables
- existing-system-audit.md — current themes, tokens, glass v2, chat styling (file:line)
- inventory-part-a.md, inventory-part-b.md, duplication-inventory.md — duplication counts + ranked extraction list
- core-controls-reuse-map.md — best existing button/input/dropdown implementations to generalize
- headless-library-evaluation.md — behavior layer choice (native, CDK + Floating UI, @angular/aria)
- polish-map.md — page tiers; extraction source (polished page file:line) -> consumers; Electron zero-pixel diff targets
- component-system-plan.md — TOP-DOWN plan (current): extract-as-is from polished pages, zero-pixel gate, waves; old bottom-up sections SUPERSEDED
- design.md — (bottom-up framing; token deltas apply only when they fall out of an extraction) glass token enhancements (existing → enhanced), glass only inside primitives, state recipes
- foundation-1028-assessment.md — merged #1028: keep / do not push onto polished pages / 2 follow-ups; old option B SUPERSEDED
- prototypes/index.html, prototypes/foundation-1028.html, prototypes/core-controls.html

# TASK_2026_975_b61e: T1 timer owners

Binding plan: `.ptah/specs/TASK_2026_924_8ac1/design-system-epic.md` section 3A.2, row T1 of 3A.4.

## Decisions

- D1. `libs/frontend/ui` is `type:ui` and must not import `@ptah-extension/core` (lint rule and
  `dependency-boundaries.spec.ts`). `core` is `type:core` and must not import `ui`. So the clock
  contract lives in ui: `PtahClock` interface and `PTAH_CLOCK` injection token in
  `libs/frontend/ui/src/lib/time/clock.token.ts`. `ClockService` in core implements the shape
  structurally. The webview app (composition root) provides
  `{ provide: PTAH_CLOCK, useExisting: ClockService }`.
- D2. Helpers `formatDuration` and `formatRelative` live in `libs/frontend/ui/src/lib/time`,
  because the components use them and ui cannot import core.
- D3. `WallClockService` and `CountdownClock` become thin wrappers over `ClockService`. The
  `CountdownClock` wrapper changes `machines-ui`, so the verify adds `machines-ui` to `ui,core`.
- D4. The countdown has no ring in T1 (the ring owner is C1 `ptah-ring`). The countdown has no
  animation. The tone change has no transition under reduced motion.
- D5. Accessibility: host `role="timer"`, `aria-live="off"`. A separate visually hidden
  `aria-live="polite"` span changes text only on a state change. Every value is in a
  `<time [attr.datetime]>` with an absolute `title`.

## Lanes

- Lane A (Codex): core `ClockService`, wrappers, app provider, gallery section.
- Lane B (Claude Api): ui `time` folder: token, helpers, three components, specs, exports.
- Lane R: independent review before the first push.

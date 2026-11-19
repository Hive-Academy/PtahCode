# Batch R01d review

Score: 9/10. Verdict: APPROVED.

Scope: `git diff -- libs/backend` and `bot-application.skills.spec.ts`. No checks were run (read-only).

## Defect 1: skill error choice (fixed)

- `bot-application.service.ts:553-562`. The throw now always uses `INVALID_PARAMS` ("Choose an installed skill.") and is guarded by `!skillsUnknown`.
- `skillsUnknown` (line 539-544) is true only when the status is `unavailable` or a `SKILLS_UNAVAILABLE` / `SKILLS_PARTIAL` diagnostic exists. The adapter emits both codes (`bot-catalog-adapter.ts:211,220`).
- A partial catalog caused by another reason (for example `MODELS_UNAVAILABLE`) with a good skills lookup gives `INVALID_PARAMS`. Correct.
- Unknown skills do not throw. The code adds a `SKILL_UNRESOLVED` warning and the save continues as unverified. Correct.
- The new spec covers `available` and `partial` and asserts that `save` is not called. It does not cover the unknown-skills path. That path is unchanged and tested elsewhere.

## Defect 2: deadline timer (fixed)

- `bot-catalog-adapter.ts:55-63`. `startDeadline()` runs at line 228, as the first statement inside the `try`. `clearTimeout` stays in the `finally`. A synchronous throw after the start now clears the timer. A throw before the start has no timer.
- The deadline stays 8 s (`BOT_CATALOG_DEADLINE_MS`), shared by all lookups. The `Promise.all` of the four tasks is unchanged, so the lookups stay parallel.
- Moved code: `runtime` is now `let` (line 142), set at line 229. `registryTask` and `providersTask` read it only after the assignment. `providersTask` has its own `const runtime`. The `const runtime` at line 298 shadows the outer `let` in a block. No behaviour change found.
- The new spec uses a getter that throws and asserts `jest.getTimerCount() === 0`. It uses fake timers and restores real timers in `finally`.

## Defects

None blocking.

- LOW (existing, not new). `bot-catalog-adapter.ts:57-62`. If the timer fires when no `Promise.race` is attached to `deadline`, the rejection is unhandled. The window is small, because the timer is cleared when all tasks end. A no-op `deadline.catch(() => undefined)` would remove the risk.

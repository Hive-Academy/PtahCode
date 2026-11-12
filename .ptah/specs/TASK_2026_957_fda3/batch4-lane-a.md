# Badge adoption batch 4 — lane A

## Files

- `agent-summary.component.ts`: adopted the function name badge as neutral `xs`; kept monospace text.
- `chat-input/autopilot-popover.component.ts`: adopted the Active badge as accent outline `xs`; kept the right alignment.
- `compact-session/compact-rail-meta.component.ts`: adopted all three rail chips as neutral outline `xs`. Kept the rail sizing rules, updated the dense selector, and wrapped shrinking labels in `ptah-badge-text`.
- `permissions/permission-request-card.component.ts`: adopted the tool and expiry badges as `xs`. Tool colors map to typed tones; the expiry switches from warn to err. Kept the icon, spacing, and monospace utilities.
- `question-card.component.ts`: adopted the timer badge as `xs`, with warn/err tone based on remaining time.
- `session/plan-limits/provider-lane-limit-tile.component.ts`: adopted the source chip as neutral `xs`.

No badge in the six assigned components remains raw. Each component imports `PtahBadgeDirective` from `@ptah-extension/ui` and registers it in `imports`.

Updated the old badge selectors in `compact-rail-meta.component.spec.ts`, `compact-rail-card.component.spec.ts`, and `provider-lane-limit-tile.component.spec.ts` to use `data-ptah-badge` (and `data-size` where relevant).

## Verification

- `git diff --check` passed; source search found no raw `badge badge-*` recipe in the six components.
- Scoped Ptah diagnostics reported no errors in the changed components. It reported errors in unrelated sibling files.
- `npm run verify -- -t lint -p @ptah-extension/chat-ui` passed (Nx cache hit).
- Focused `compact-rail-meta`, `compact-rail-card`, and `provider-lane-limit-tile` specs passed via scoped `npm run verify -- -t test -p @ptah-extension/chat-ui -- --testPathPatterns='(compact-rail-meta|compact-rail-card|provider-lane-limit-tile)' --coverage=false --maxWorkers=2` (no cache hit).
- No rendered UI review ran. The brief prohibits starting the Electron renderer, and no in-workspace HTML artifact exists for browser inspection.

# Final allow list: form controls step 6

## Accepted exceptions (9)

| # | File | Tokens | Reason |
|---|---|---|---|
| 1 | tasks-ui `board/task-card.component.ts` | `checkbox` | 24 px task-card checkbox |
| 2 | command-center `command-session-controls.component.ts` | `input-sm` | Borderless command text |
| 3 | chat `ptah-ai/copilot-auto-approve-toggle.component.ts` | `toggle toggle-success toggle-xs` | Success-tone toggle |
| 4 | chat `ptah-ai/host-routing-setting.component.ts` | `toggle toggle-success toggle-xs` | Success-tone toggle |
| 5 | chat `ptah-ai/lane-rotation-setting.component.ts` | `toggle toggle-success toggle-xs` | Success-tone toggle |
| 6 | review-runs-ui `review-settings-drawer.component.html` | `toggle toggle-warning` | Warning toggle |
| 7 | chat-ui `molecules/question-card.component.ts` | `checkbox checkbox-info checkbox-xs` | Question-card info variant |
| 8 | chat-ui `molecules/question-card.component.ts` | `input input-bordered input-info input-xs` | Question-card info variant |
| 9 | core `components/attention-permission-actions.component.ts` | `input input-bordered input-sm` | Boundary rule: `type:core` cannot import `@ptah-extension/ui` (`eslint.config.mjs` ~line 394) |

## Removed from the list

- canvas `canvas-rail/canvas-rail-card.component.ts`: migrated to `ptahInput size="sm"`. Tokens removed from the baseline.
- chat-ui `tool-input-display.component.ts` (`input-preview-block`): false positive. The matcher fix removed it from the baseline.

## Open items

- Entry 9 needs a decision: move the owner to a lib that core can import, or move the component out of core.
- The canvas rename field needs a visual check in Electron. No screenshot was taken.

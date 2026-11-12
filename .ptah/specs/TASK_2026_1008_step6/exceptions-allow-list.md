# Exceptions allow list: form controls step 6

## Accepted exceptions (8 confirmed)

| # | File | Tokens | Reason | Migration path |
|---|---|---|---|---|
| 1 | tasks-ui `board/task-card.component.ts` | `checkbox` | 24 px task-card checkbox | None planned |
| 2 | command-center `command-session-controls.component.ts` | `input-sm` | Borderless command text | None planned |
| 3 | chat `ptah-ai/copilot-auto-approve-toggle.component.ts` | `toggle toggle-success toggle-xs` | Success-tone toggle | None planned |
| 4 | chat `ptah-ai/host-routing-setting.component.ts` | `toggle toggle-success toggle-xs` | Success-tone toggle | None planned |
| 5 | chat `ptah-ai/lane-rotation-setting.component.ts` | `toggle toggle-success toggle-xs` | Success-tone toggle | None planned |
| 6 | review-runs-ui `review-settings-drawer.component.html` | `toggle toggle-warning` | Warning toggle | None planned |
| 7 | chat-ui `molecules/question-card.component.ts` | `checkbox checkbox-info checkbox-xs` | Question-card info variant | None planned |
| 8 | chat-ui `molecules/question-card.component.ts` | `input input-bordered input-info input-xs` | Question-card info variant | None planned |

## Extra entries (accepted, per recommendation)

| File | Tokens | Reason | Migration path |
|---|---|---|---|
| canvas `canvas-rail/canvas-rail-card.component.ts` | `input input-sm input-bordered` | Rename field in a pre-owner pattern | Migrate to `ptahInput` in a later task |
| core `components/attention-permission-actions.component.ts` | `input input-bordered input-sm` | Permission actions in a pre-owner pattern | Migrate to `ptahInput` in a later task |
| chat-ui `tool-execution/tool-input-display.component.ts` | `input-preview-block` | False positive of the `input-` prefix rule. It is a custom class, not a form control. | Rename the class (for example `tool-input-preview`) in a later task |

## Radio decision

Decision: do NOT add `radio` to `BLOCKED_ROOTS`. This differs from the recommendation.
Reason: many files still use raw `radio` classes (provider-setup-wizard, question-card,
output-style-*, codex-sandbox-setting, motion-preference, install-scope-field,
connection-choice, agent-model-editor, surface-choice-input). Adding the root would seed many
new baseline entries. That is a new migration scope, not a lock of finished work.
The radio in `surface-choice-input.component.ts:79` stays a named exception.
Next step: a separate task migrates the radios, then adds `radio` to `BLOCKED_ROOTS`.

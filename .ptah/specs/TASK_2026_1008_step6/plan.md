# Form controls step 6: removal and lock

Date: 2026-11-12. Task: TASK_2026_1008_step6. Branch: chore/ui-form-step6-removal.
Binding plan: `.ptah/specs/TASK_2026_924_8ac1/design-system-epic.md`.

## Scope

Form controls are input, textarea, select, checkbox and toggle. All 10 adoption batches (PRs #1127–#1138) are merged as of 3499e5c75 (main).

This PR removes raw form control classes and styles that have no consumer, then locks the form tokens in the ratchet so that new raw `input`, `select`, `textarea`, `checkbox`, `toggle` classes fail the audit.

## Steps

### Phase 1: baseline audit

1. Run the class audit tool on the fresh tree: `npm run audit` in `tools/ui-class-audit`.
2. Confirm that `tools/ui-class-audit/baseline.json` agrees with the tool output (two baseline merges landed; if the tool output differs, commit it).

### Phase 2: identify exceptions

1. List all accepted raw exceptions with the reason for each:
   - Task-card 24 px checkbox (task-card selection state)
   - Borderless command text (variant)
   - Success-tone toggles (variant)
   - Warning toggle in review settings drawer (no warning variant)
   - Question-card info variants (raw)
   - Radio group in surface-choice-input (raw)

2. Find helpers that the adoption left without a consumer (dead exports) in `libs/frontend/ui`. Use `ptah_lsp_references` to check each helper export.
3. Remove helpers only if no consumer exists.

### Phase 3: removal and lock

1. Remove raw form control classes and styles with no consumer.
2. Lock form tokens in the ratchet (add to `tools/ui-class-audit` if not present).
3. Update `baseline.json` with the tool output.
4. Add a named allow list for the exceptions.

### Phase 4: verify and report

1. Run scoped verify: `npm run verify -- -p ptah-extension-webview,ui`.
2. After template change, also `npm run verify -- -t typecheck-templates -p ptah-extension-webview`.
3. Report findings: merged PRs, verified files, exceptions, dead helpers removed.

## Files to investigate

- `tools/ui-class-audit/`: audit tool and baseline
- `libs/frontend/ui/ptah-field/`: form owner
- `libs/frontend/ui/ptahInput/`: input owner
- `libs/frontend/ui/ptahCheckbox/`: checkbox owner
- `libs/frontend/ui/ptahTextarea/`: textarea owner
- `libs/frontend/ui/ptahSelect/`: select owner
- `libs/frontend/ui/ptahToggle/`: toggle owner
- Consumer files in adoption batches 1-10

## Exceptions to preserve

Named allow list:

| Exception | Reason | Location |
|-----------|--------|----------|
| Task-card 24 px checkbox | Card selection state, internal layout constraint | task-card component |
| Borderless command text | Command text variant, no token | command text context |
| Success-tone toggles | Toggle variant (success tone), not yet in owner | chat settings |
| Warning toggle in review settings | No warning variant, internal state | review settings drawer |
| Question-card info variants | Info variants without owner, internal style | question-card component |
| Radio group in surface-choice-input | Radio group exception, surface choice pattern | surface-choice-input component |

## Ratchet roots to lock

Add to `tools/ui-class-audit` if not present:
- `input`
- `select`
- `textarea`
- `checkbox`
- `toggle`

## Lint rules

Add lint rules to forbid raw form control recipes outside `libs/frontend/ui`:
- `input` (use `ptahInput`)
- `textarea` (use `ptahTextarea`)
- `select` (use `ptahSelect` or native)
- `checkbox` (use `ptahCheckbox`)
- `toggle` (use `ptahToggle`)

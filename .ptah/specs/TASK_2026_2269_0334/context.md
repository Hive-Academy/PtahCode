# Context: TASK_2026_2269_0334

Redesign of the skills page of the setup wizard (Electron renderer, lib `libs/frontend/onboarding`).

- Worktree: `.claude-worktrees/skills-step-redesign`, branch `fix/skills-step-redesign`.
- The branch started from `fix/setup-skills-step` at `84cb799ba`. PR #1415 (TASK_2026_2260_f6dc)
  merged to `main` as `9af0177cb`, so the branch holds no commit that `main` does not have.
- Depends on TASK_2026_2260_f6dc (done).

## User decisions (2026-11-18)

| Decision | State |
| --- | --- |
| Delivery: new task and PR, separate from PR #1415 | user-requested |
| Problems in scope: layout and density, skill cards, actions and hierarchy, page concept | user-requested |
| Design proposal first, user approval before implementation | user-requested |
| Concept "Coverage board" (`design-spec.md`) | approved |
| Removals R1-R4 | approved |
| Decisions D1-D9 (D5 installed skills selectable, D6 busy primary during preview, D9 new title) | approved |
| Amendment: primary label "Install N skills and continue", pinned and always visible, helper line, same label on the modal confirm | user-requested ("i still don't see the button that should be accepting the skills and installing it in the workspace and moving to the next step") |
| Consent step stays a modal (not a popover, not in place) | approved |

| Launch of the app for the visual review in Electron (screenshots of the real page) | approved by the user for this task |
| Paid calls (the `Claude Api` lane) use the `haiku` tier | user-requested |

## Not decided / defaults taken by the coordinator

- The consent modal shows in all cases, also when no selected skill contains scripts. A direct
  install without the modal was offered to the user as an option; no answer yet.

## Lanes

| Lane | Work | Deliverable |
| --- | --- | --- |
| claude (ambient, role ui-ux-designer) | design proposal, prototype, amendment | `design-spec.md`, `prototype/` |
| codex | parity inventory (47 capabilities) | `parity-inventory.md` |

## Notes

- A host restart stopped the first two lanes; both were resumed.
- `node_modules` in the worktree is a junction to the main checkout. Never run `npm install` here.
  Remove the junction with `cmd /c rmdir` before any worktree removal.
- Known stale spec matcher from the inventory: 'Back to intent' against the current label 'Back'.

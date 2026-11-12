# Badge adoption batch 2, lane B

- `accounts/ambient-account-row.component.ts`: Changed the Used by chip from a ghost DaisyUI badge to a neutral `ptahBadge` span. Kept wrapping and sizing utilities; registered the directive.
- `add-cli-instance-modal.component.ts`: Changed the Copilot sign-in state to an outlined, extra-small badge with typed `ok`/`warn` tone binding. Kept spacing and typography utilities; registered the directive.
- `agents-routing-settings.component.ts`: Changed the Background Model Roles badge to an outlined, info-tone `ptahBadge` span. Kept layout and typography utilities; registered the directive.
- `connection-drawer/overview-tab.component.ts`: Changed the active Used by badge to an `ok` tone `ptahBadge` span. Kept layout and typography utilities; registered the directive.
- `decision-model-row.component.ts`: Changed the decision tier to an extra-small neutral `ptahBadge` span. Kept layout and typography utilities; registered the directive.

No badges in the five scoped files were left raw. Companion specs have no `.badge` selectors to replace. No button or anchor badge host occurs in this scope. The audit baseline was not touched.

Verification: the scoped chat Jest run passed 4 suites and 134 tests. `agents-routing-settings.component.spec.ts` could not start because Jest maps `marked` to a missing `node_modules/marked/lib/marked.umd.js` in this worktree. `git diff --check` passed. Scoped Ptah TypeScript diagnostics timed out after 45 seconds with the check still running. No rendered UI was available to inspect without starting a prohibited build or server; badge mapping was checked against the directive and batch 1 review.

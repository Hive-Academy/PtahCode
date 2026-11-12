# Batch 5 badge adoption: machines UI

## Files

- `machines-page-header.component.ts`: adopted the pending approvals badge as warn outline sm; retained the count and status dot.
- `session-sync-chip.component.ts`: adopted the sync chip as info outline sm while fetching/catching up and ok outline sm when caught up; retained its spinner and state attribute.
- `remote-approval-block.component.ts`: adopted the approval badge as warn outline sm while action is pending and neutral outline sm otherwise.
- `remote-session-list.component.ts`: adopted the driver badge as neutral outline sm; retained its spacing and width limit and wrapped the dynamic label in `ptah-badge-text`.
- `remote-session-view.component.ts`: adopted all three owner badges as err or neutral outline sm; retained the width limit and wrapped the dynamic driver label in `ptah-badge-text`.

No raw DaisyUI badge remains in the assigned files. All hosts are spans, and each component imports `PtahBadgeDirective`.

## Specs and verification

- Searched `machines-ui` specs for `.badge` and `badge-` selectors; found none to update.
- `git diff --check` passed. Scoped Ptah diagnostics found no errors in the five changed files; eight preexisting BigInt target errors appeared in shared and worker protocol sibling files.
- Targeted lint and tests could not start because this worktree has no `node_modules`.
- No rendered UI screenshot was possible without starting the Electron renderer, which the brief prohibits. Source comparison against `family-3-look.md` confirmed the outline size, state tones, and truncation wrapper choices; visual appearance remains unverified.

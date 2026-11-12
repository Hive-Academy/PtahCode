# Badge adoption batch 5 — lane A

## Files

- `git-ui/src/lib/commit/commit-composer.component.ts`: adopted the success chip as `ok` `sm`; kept icon spacing.
- `git-ui/src/lib/review-canvas/file-section-header.component.ts`: adopted the side chip as neutral outline `xs`, and the file and summary chips as neutral `xs`; kept responsive visibility classes and short-label behavior. The separate `ptah-file-status-badge` remains its purpose-built component.
- `git-ui/src/lib/spot-editor/spot-editor.component.ts`: adopted the Read only chip as neutral `xs`.
- `git-ui/src/lib/task/task-worktree-view.component.ts`: adopted the main, active, locked, and prunable chips as `xs`; locked uses `warn`, and the others use neutral. Kept their nonshrinking layout.
- `machines-ui/src/lib/components/machines-view/machine-overview.component.ts`: adopted the machine state container as neutral outline `sm`; kept the nested machine status marker and nonshrinking layout.

All ten raw badge hosts were adopted. Each host is a `span`, and each component imports `PtahBadgeDirective` from `@ptah-extension/ui` in its standalone `imports`. No dynamic badge text in these hosts needs truncation.

## Specs and verification

- Searched specs under `git-ui/src/lib` and `machines-ui/src/lib` for `.badge` selectors and relevant badge classes. No spec queries a raw badge host changed here, so no spec needed editing. The `task-worktree-view.component.spec.ts` `badge-*` assertions target the separate PR state component.
- `git diff --check` passed for the five changed files; source search found no remaining `badge badge-*` recipe in them.
- Scoped Ptah diagnostics found no errors in the five changed files. They reported 11 errors in sibling files outside this lane.
- `node_modules` is absent in this worktree, so focused Nx tests and lint could not start.
- No rendered UI was available to inspect: the brief prohibits build and serve targets, and these Angular templates have no standalone in-workspace HTML artifact. Source review compared the chosen sizes, tones, outline treatment, and retained layout classes against `family-3-look.md`.
- Skill discovery found no locally invocable Angular frontend or UI design skill; the available `ui-ux-designer` marketplace entries were marked `not-invocable`.

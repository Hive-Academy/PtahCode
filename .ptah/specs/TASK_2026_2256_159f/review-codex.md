# Independent review — TASK_2026_2256_159f

Verdict: **changes needed**. Score: **7/10**. One moderate accessibility regression; no blocking or serious issue established. The signal-based layout changes are coherent, but the failed-read announcement path prevents approval. Confidence: medium; executable verification was restricted by the environment.

## Numbered findings

1. **Moderate / P2 — Projected loading and failure announcements inherit a busy region that can remain busy forever.**
   File: `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts:194` (new projection), `:167` (ancestor), `:339` (loading computation); also `libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.ts:120` (placeholder).
   Evidence: `[read-states]` is now projected *inside* `[aria-busy]="loading()"`. `loading()` means both orchestration and CLI-agent data are absent, independent of their request statuses. On an initial failure of both reads, each retains null data: the new Retry alerts exist beneath `aria-busy="true"` indefinitely. Assistive technology may defer descendant live-region updates while an ancestor is busy, so the errors and retry availability may never be announced. Initial loading statuses also inherit that busy ancestor. Previously these read states were siblings outside it. The placeholder similarly places all read states beneath an unconditional busy flag.
   Suggested fix: keep the projection inside the matrix card but outside the busy content wrapper; give the placeholder a separate busy visual/content child with the read states as siblings. Derive any remaining busy flag from actual in-flight statuses. Add coverage with both sources `{status: 'error', data: null}` and a real matrix, asserting alerts/statuses have no busy ancestor. The added host spec uses a stub without the busy wrapper and populated error data, so it misses this regression.

## Five logic questions

1. **How does this fail silently?** Finding 1: the new projection at matrix `:194` can withhold error announcements.
2. **What user action produces unexpected behaviour?** Opening Settings when initial CLI reads fail exposes Retry visually but may leave a screen-reader user waiting; matrix `:167`, `:339`.
3. **What input data produces a wrong answer?** Both failed sources with null data produce a permanently busy accessibility state; matrix `:340`. No changed persistence or selection computation was found.
4. **What happens when a dependency fails?** Per-source retries remain bound to their original refresh methods (`agents-routing-settings.component.ts:221` onward), but announcement delivery has the finding above. Deferred chunk-load recovery was not changed.
5. **What is missing that requirements never mentioned?** Real rendered overflow checks and actual ResizeObserver boundary tests remain absent from this review's executable evidence. The new lanes spec substitutes `collapsed()` rather than exercising width observations (`lanes-table.component.spec.ts:102`).

## Scope and checks

- Examined the uncommitted diff, new card-grid implementation/spec, affected component templates and logic, shared table/alert/skeleton behavior, UI export chain, task context/carrier and root instructions. No task-description, implementation-plan, batches or style-review document existed in this task folder when discovered.
- Settings main is centered and capped; the form-section default remains 15rem/36rem and `wide` overrides the fields token (`settings-layout.component.ts:207`, `form-section.component.ts:16`, `:132`, `ptah-tokens.css:474`). At a 606px main width the form stacks; above 640px the fields track has a zero minimum. Card-grid tracks clamp their minimum to 100% (`card-grid.directive.ts:14`). These support shrinkability, not a proof that every card's intrinsic contents fit.
- Collapse uses the table host's ResizeObserver width, not viewport width (`table.component.ts:221` onward). The new 950px threshold and both colgroups match the stated contract (`lanes-table.component.ts:88`). Percentages plus the unsized expander use automatic table sizing; exact rendered allocation remains unverified.
- All four grid classes and the wide override are complete static literals. Requiring the actual webview Tailwind config returned 33 content globs, including `libs/frontend/ui/src/**/!(*.stories|*.spec).{ts,html}` and chat. There is no separate UI Tailwind config. A focused Tailwind 3/PostCSS compilation generated all four grid rules, the wide custom-property override, percentage widths and the form container query.
- No newly broken id, aria-label or existing data-testid established. The defer replacement spec asserts one loading instance after completion (`agents-routing-settings.component.spec.ts:445`); the template has no explicit IDs to duplicate. Skeleton internals are aria-hidden, and the new alerts supply one role internally. Multiple source-specific status regions convey different reads, not duplicate copies of the same read.
- Inputs/computeds track signal reads under OnPush. The card-grid spec covers consumer-class retention and variant changes. No new source-level daisyUI classes, inline styles, raw controls, unsafe casts, suppression comments, console calls, innerHTML or skipped tests were found in added lines. Existing raw controls/daisyUI classes elsewhere in these files predate this diff.

## Commands/tools run and results

- `git status --short`, `git diff --stat`, `git diff --name-only`, `git diff --numstat`, `git diff -- libs/frontend` and focused path variants: inspected 16 tracked changed files plus the untracked card-grid folder; final status retained the reviewed changes.
- `git diff --check`: exit 0, no whitespace errors.
- `Get-Content` (including line slices) read the review instructions, root CLAUDE.md, task context/task.md, affected sources/spec additions, shared UI dependencies, exports, tokens and config. `Get-ChildItem .../TASK_2026_2256_159f -File` found context.md/task.md initially. Attempts to read `libs/frontend/ui/tailwind.config.js` and a guessed installed Nx helper path failed because those files do not exist; `require.resolve('@nx/angular/tailwind')` located the actual helper.
- `rg --files -g AGENTS.md -g CLAUDE.md -g '*handoff*' ...` and targeted `rg -n` for classes, tokens, exports, busy/projection references: inspected source evidence. Added-line `Select-String` scan for forbidden casts, `$any`, suppressions, console, innerHTML, skips/fixmes and styles returned no matches.
- Ptah workspace/search/AST tools were used first for discovery and structural inspection. Task-folder and AGENTS searches returned zero, so native listing/search supplied the fallback. No skill-loading tool/catalogue was available to this lane; no skill instructions were reconstructed.
- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/patterns/card-grid/card-grid.directive.spec.ts libs/frontend/ui/src/lib/patterns/form-section/form-section.component.spec.ts libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts`: **blocked**, exit 1; all three suites failed before tests executed with esbuild `spawn EPERM` (0 tests run).
- `ptah_get_diagnostics` scoped to the nine changed production TypeScript files, twice: **unavailable**, compiler still running after 45 seconds on each call; nine files unchecked. This is not a diagnostic pass.
- In-memory Node/PostCSS check using raw TypeScript content from card-grid, form-section and lanes-table and `corePlugins: {preflight:false}`: exit 0; `gridVariants=4`, `wideOverride=true`, `width20=true`, `formContainerQuery=true`. No generated CSS file was written.
- `node -e` requiring `apps/ptah-extension-webview/tailwind.config.js` and printing content: exit 0; dependency globs include UI/chat. Nx helper printed its existing deprecation warning. An initial slash-only UI filter missed Windows separators; printing the actual glob list resolved that ambiguity.
- Progress report about the blocked Jest run was attempted with `ptah_agent_report`; host rejected delivery with `parent-inbox-full`.

## Decisions and remaining uncertainty

- Followed the user's explicit `review-codex.md` deliverable name over the role template's generic filename; no source changes made.
- No builds, nx commands, app launch, e2e, commits or other git mutations ran. No screenshot/1024px render or screen-reader test was performed. Focused Jest and diagnostics require a permitted execution environment before claiming a pass.

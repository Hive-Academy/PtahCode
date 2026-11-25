# P2 review slice C fix report

## Files changed

Under `libs/frontend/onboarding/src/lib/analyze/`:

- `analyze-skills.page.ts` and `analyze-skills.page.spec.ts`.
- Corrected the existing Vitest and Playwright fixture kinds to the shared `test-tool` value in `analyze-skills.page.spec.ts`.
- `analyze-workspace.page.ts` and `analyze-workspace.page.spec.ts`.
- `analyze-workspace.render.spec.ts`. The coordinator authorized the fifth file for fixture changes. It supplies a valid Setup RPC response and initializes Setup before the two clock tests start analysis.

## Findings and tests

1. **Draft confirmation**. The post-result action captures the draft revision and its name, description, and body. The page dismisses the confirmation when the target changes and checks the snapshot again immediately before discarding. The regression tests cover replacing the draft with identical field values and editing the same draft after confirmation appears. The existing test still confirms that matching edits can be discarded. See `analyze-skills.page.ts:682`, `:819` and `analyze-skills.page.spec.ts:2154`. Plan lines 287 and 569.
2. **Re-run and consent**. Loading starts before the Setup RPC. Re-run, consent preview, and deferred draft confirmation respect the selection busy state. The recommendation path checks consent ownership before clearing previews or applying results. The regression test clicks Re-run and Install during a deferred read, then confirms that open consent and an in-flight install block Re-run and preserve the preview rows. See `analyze-skills.page.ts:700`, `:985`, `:1023` and `analyze-skills.page.spec.ts:454`. Plan lines 572 and 575.
3. **Focus during clear**. A clear invalidates any older read and coalesces focus or Settings refreshes while the write is pending. The queued read starts after the receipt or failure and preserves write recovery copy. The deferred clear test exercises both outcomes and verifies RPC order, the effective pair, Start availability, and error visibility. See `analyze-workspace.page.ts:721`, `:780` and `analyze-workspace.page.spec.ts:262`. Plan lines 172 and 287.
4. **Run readiness**. Start, Continue, and the route Re-run wait for a settled valid Setup pair before mutating run state. A failed read shows fixed retry copy. Tests cover a deferred invalid response, successful recovery and single consumption of the route intent, and a rejected initial read with Retry. See `analyze-workspace.page.ts:287`, `:572`, `:866` and `analyze-workspace.page.spec.ts:181`, `:231`. Plan lines 287 and 572.

## Checks

Focused commands ran under `node scripts/verify.mjs --exec`.

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <three changed specs>` passed 71 tests in three suites.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` passed.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json` still exits 2 after correcting the in-scope fixture types. The rerun reported errors only in files outside the slice, listed under Open items.
- `npx eslint <five changed TypeScript files>` passed with zero errors and three warnings. Both pages exceed the line limit, and the render test stub's existing `ngOnDestroy` lacks an explicit accessibility modifier.
- Scoped `ptah_get_diagnostics` timed out and marked all five files unchecked. Scoped `ptah_ast_analyze` parsed all five files with zero error nodes.

## Decisions

- Dismiss a stale discard prompt rather than retarget it. The revision and fields show what was presented when results arrived. A new Re-run remains available. This is reversible.
- Queue one refresh after an in-flight clear rather than overlap reads and resolve competing snapshots. The RPC write receipt follows persistence and focus events can coalesce. This is reversible.
- Keep a blocked route Re-run pending until successful Setup recovery rather than consume the route and require a second click. This preserves the user's requested run and current selection during preflight. This is reversible.

## Open items

The coordinator assigned the Electron visual review to a separate lane.

The onboarding spec typecheck flagged errors outside the slice: a missing draft `content` field in `proposal/stack-skill-review.component.spec.ts:134`, an argument count mismatch in `ready/onboarding-ready-host.guard.spec.ts:14`, and a non-callable value in `shell/onboarding-workspace.store.spec.ts:87`. The spec TypeScript target is ES2016 and includes BigInt literals from `libs/shared` and `libs/worker-protocol`. The coordinator received those details.

## Extra reads

- Root `CLAUDE.md` for focused check and worktree instructions. Task carrier, relevant plan excerpts, D44, and review findings for scope and decisions.
- Local `angular-frontend-patterns/SKILL.md` through Ptah file access. The lane exposed no separate skill-loading tool.
- `proposal/stack-skill.store.ts`, `proposal/stack-skill-review.component.ts`, `proposal/stack-skill-review.component.html`, and `proposal/skill-selection-rail.component.{ts,html}` for existing loading, draft, and consent behavior. The render spec was read for the failed fixture and later authorized for edits.
- `ptah_search_files` returned zero task Markdown hits and `ptah_get_dependents` returned an incomplete graph. Scoped Ptah file reads and native `rg` supplied the task and consumer context.
- `ptah_code_search_symbols` returned no hits for `StackItemKind`. Scoped `rg` located its definition in shared `rpc-setup.types.ts:222` and the ES2016 setting in onboarding `tsconfig.spec.json:6`.

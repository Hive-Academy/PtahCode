# Brief: visual fix round 1 (TASK_2026_2325_899d, decision D45)

Worktree (work only here): `/home/amun/ptah-extension/.claude-worktrees/skill-judge` (branch `feat/skill-judge`).
TF = `.ptah/specs/TASK_2026_2325_899d` in that worktree.

## Objective

Fix visual-review defects 1, 2, 3 and 5 from `TF/visual-review.md` (section "Defects"). Defect 4
(Analyze Start button) is OUT of scope for this lane: do not edit `analyze-workspace.page.ts`.
Then rebuild the Electron dev bundle and re-capture the affected screens to prove each fix.

Binding rules (read these lines only):
- `TF/decisions.md` lines 100-112 (R22, R23).
- `TF/design-spec.md` lines 238-275 (F22-F32 amendments).
- Prototype PNGs in `TF/prototype/screenshots/` (images only). NEVER open `TF/prototype/index.html`.
  NEVER read `TF/implementation-plan.md`.

## Defects

1. **Collapsed disclosures render their content.** Root cause (verified by the coordinator): the
   `[hidden]` binding loses to the Tailwind `flex` display class on the same node.
   - `libs/frontend/onboarding/src/lib/proposal/skill-method-banner.component.ts:~70` (`<ul [hidden] class="... flex ...">`)
   - `libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.html:~88` (`<span [hidden] class="card-details flex ...">`)
   - Fix so the collapsed state hides the content (for example, bind `flex` only when expanded, or
     `[class.hidden]`). Keep the `id` element in the DOM so `aria-controls` stays valid. Search the
     onboarding lib and `libs/frontend/chat/src/lib/settings/providers/` for the same `[hidden]` + display-class
     pattern on the new task components and fix each instance that you find (list them in the report).
   - Add or adjust a spec that asserts the collapsed node is not displayed (for example, it has the
     `hidden` attribute and no `flex` class, or the style is `display: none` in the jsdom computed style).
2. **Wide layout and density miss R22/F22.** The shell caps the column at 1120 px because the route
   `analyze/skills` in `libs/frontend/onboarding/src/lib/onboarding.routes.ts:~71` has no
   `data.layout: 'wide'` (see `shell/onboarding-shell.component.ts:38-39,142`). R22 requires full renderer
   width with normal page padding. F22 requires 4 Install columns at 1100 px and 5 at 1440 px, and the
   8 Install + 3 Build fixture must end within about 1500 px at 1100 x 1000.
   - Make the skills step use the full width (add a layout value or adjust the shell so only that route
     is uncapped; keep other onboarding pages unchanged).
   - Adjust `proposal/stack-skill-review.component.css` (grid/rail areas near line 90-115) if needed so
     the Install grid reaches 4 / 5 columns at 1100 / 1440 with the sticky rail still visible.
   - Update the shell or route spec for the new layout value.
3. **Settings stale-pair warning is squeezed.** `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:~354`.
   The two recovery actions take most of the width and the model id breaks across lines at 1100 px.
   Match the approved stale picker PNG: warning text on its own full-width line, actions below it.
   Do not change behavior, copy, or the accessible label.
5. **Empty state shows "AI review is unavailable".** `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html:~56`.
   With zero items, candidates and proposals, do not render the method banner (the approved empty
   state omits it). Add a spec for this.

## Scope

You may edit only these files and their direct `.spec.ts` neighbors:
- `libs/frontend/onboarding/src/lib/proposal/skill-method-banner.component.ts`
- `libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.{html,ts,css}`
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.{html,ts,css}`
- `libs/frontend/onboarding/src/lib/onboarding.routes.ts`
- `libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts`
- Other files with the same `[hidden]` + display-class defect (defect 1 sweep), list them in the report.
- Scripts and captures under `.ptah/tmp/visual/` only.
Do not modify anything else. Do NOT edit any file under `libs/frontend/onboarding/src/lib/analyze/`.

## Checks (lanes never run `npm run verify` or `nx` test/lint/typecheck)

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <changed onboarding specs>`
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <changed chat specs>`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` and `libs/frontend/chat/tsconfig.lib.json`
- `npx eslint <changed files>`
- Rebuild for visual proof (authorized, Electron only), under the verify lock:
  `node scripts/verify.mjs --exec --task visual-build -- npx nx run ptah-electron:build-dev` and then
  `node scripts/verify.mjs --exec --task visual-copy -- npx nx run ptah-electron:copy-renderer-dev`.
  Reuse the existing Playwright scripts and fixtures in `.ptah/tmp/visual/` (the previous visual lane
  wrote them). Re-capture: judged Skills dark + light at 1100 x 1000 and 1440 x 1000; Settings stale
  picker dark + light at 1100; Skills empty state dark. Write them to `.ptah/tmp/visual/shots/round1/`.
  Measure and report: Install columns at 1100 and 1440; bottom y of the last Build row at 1100;
  collapsed banner and card detail heights (must be 0 or not displayed).

## Rules

- Electron first. Visual checks in Electron only (Playwright `_electron`), never a web browser.
- Git: never commit, push, restore, checkout, stash, reset or clean. A change you did not make is
  not yours; report it, never revert it.
- Follow neighbor components (signals, OnPush, Tailwind classes, existing tokens).
- User-facing copy: Simplified Technical English, short. Do not change existing copy unless a defect needs it.

## Deliverable

**Deliverable**: `/home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d/batch-fix-visual-1-report.md`
Write a skeleton first, then fill it: files changed, each defect with fix and `file:line`, measurements
before/after, screenshot paths, checks with results, `## Decisions`, open items. Call `ptah_agent_report`
once before you exit. Reply only `WROTE: <path>` plus a one-line headline.

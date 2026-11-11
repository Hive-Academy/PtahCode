# Review 4a: button adoption (onboarding, setup-wizard)

Paths are relative to `libs/frontend/`. Scope: `git diff` of 38 files. No test was run.

## Verdict

PASS WITH MINORS. No major defect found. Every changed element keeps its attributes. The report contains
three false statements, and two points need a decision (see Minors).

## Majors

None.

## Checks

1. Attributes and tags: PASS. The removed lines contain only `class` text. `data-testid`, `(click)`,
   `[disabled]`, `type`, `@if`, `aria-label`, `[attr.*]` stay. No broken tag.
   - Cosmetic only: `onboarding/src/lib/ready/ready-settings-step.page.ts:~233` has `>Back</a` with
     wrong indentation (`\n>Back</a\n        >`). It still parses.
2. Variants: PASS. Ghost + border becomes secondary at `onboarding/src/lib/proposal/proposal-status-card.component.ts:61,63`
   and `onboarding/src/lib/proposal/review-apply.page.ts:61`. Ghost + outline becomes secondary at
   `onboarding/src/lib/proposal/proposal-workspace.page.ts:66`. No `btn-error` existed. No
   `variant="danger"` was added.
3. Tinted panels: PASS. No danger button exists in the diff, so none was converted wrongly.
   - Risk (minor): `setup-wizard/src/lib/components/pack-install-prompt.component.ts:122` is a `ptahButton ghost xs` inside
     `alert alert-error` (line 118). It is not destructive, but the ghost look on an error tint can fail AA.
     Check it with axe, or keep it raw.
   - Same kind, lower risk: secondary buttons next to alert panels at
     `setup-wizard/src/lib/components/community-packs-panel.component.ts:62` (outside the alert) and
     `setup-wizard/src/lib/components/completion/outcome-summary.component.ts:128` (inside `alert-info`).
4. `ptahIconButton`: N/A. None was added. Icon-only candidates stay as `ptahButton ghost xs` with their
   existing `aria-label` (for example `setup-wizard/src/lib/components/agent-preview-dialog.component.ts:124`,
   `onboarding/src/lib/proposal/revision-history.component.ts:34`). Confirm they have visible text.
5. Imports: PASS by diff. Each changed component adds `PtahButtonDirective` to `imports` and to the import
   line. The directive is used in each one. Several files add the import as a separate line after unrelated
   imports (order only).
6. Skip rules: PASS. The raw elements stay (`btn-warning` at `onboarding/src/lib/proposal/new-project-intake.page.ts:78`,
   dynamic `[class]` buttons at `onboarding/src/lib/ready/ready-connection-step.page.ts:42,48`,
   `setup-wizard/src/lib/components/confirmation-modal.component.ts:104`). No `ptahSetupAction` element
   changed. No `join-item` or `btn-active` change.
7. `aria-busy`: PASS with a note. No `[attr.aria-busy]` was on a converted element. See Minors 3 for
   `[attr.aria-disabled]` at `onboarding/src/lib/ready/connection-choice.component.ts:54`.
8. Specs: PASS.
   - `onboarding/src/lib/analyze/agent-recommendation-list.component.spec.ts:155` replaces `min-h-8` with
     `data-ptah-button`. Valid.
   - `onboarding/src/lib/ready/connection-choice.component.spec.ts:87` replaces `button.btn-outline` with
     `button.btn-secondary`. Valid: the directive sets `btn-secondary` (`ui/src/lib/button/button-host.ts:13`).

## Minors

1. Chip buttons in `onboarding/src/lib/proposal/new-project-intake.page.ts:146,165,181` are raw (correct skip:
   `[class.bg-base-content]` pill toggles). The diff only moved `class` before `type`. This is noise. Restore
   the original attribute order. The lane report lists them as converted (rows 145/162/179). That is wrong.
2. `onboarding/src/lib/shared/run-panel.component.ts:23` (Stop) is still raw
   (`btn btn-outline btn-sm min-h-8 border-state-err text-base-content`). The lane report lists it as
   converted and says `border-state-err` was removed. Both statements are false. Raw is acceptable because
   of the error border. List it under Skipped.
3. `onboarding/src/lib/ready/connection-choice.component.ts:54` replaces
   `[attr.aria-disabled]="!canConfirm() || phase()==='saving'"` with `[busy]`. The directive sets
   `aria-disabled`, `aria-busy`, `opacity-60`, `cursor-wait` and blocks activation. This is right for
   `saving`. It is wrong in meaning for `!canConfirm()` (not pending). Use `[disabled]` for that case, or
   accept the busy look. The existing spec line 80 still passes.
4. The lane report says the `:host ::ng-deep ... button.btn-sm` rules were left in place. The diff removes
   them in `onboarding/src/lib/analyze/generate-agents.page.ts:~64` and
   `onboarding/src/lib/analyze/project-guidance.page.ts:~66-73`. The removal is acceptable, but it changes
   the margin of the saved-card ghost button. The `mt-3` class at `project-guidance.page.ts:307` replaces it.
   Correct the report text.
5. Anchors: `<a ptahButton>` is supported (`button[ptahButton], a[ptahButton]`). Anchors at
   `onboarding/src/lib/ready/provider-panel.component.ts:135,201,241`,
   `onboarding/src/lib/ready/connection-readiness-banner.component.ts:45` and
   `onboarding/src/lib/ready/ready-settings-step.page.ts:232` keep `routerLink` or `href`. OK.
6. The report counts (113 converted) include items 1 and 2. The true count is lower.

## Not checked

No render, template compile (`typecheck-templates`) or axe run. Run
`npm run verify -- -t typecheck-templates -p ptah-extension-webview` before the commit.

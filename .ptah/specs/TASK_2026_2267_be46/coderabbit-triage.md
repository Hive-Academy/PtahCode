CodeRabbit triage against current working code; older-head comments were treated as untrusted claims.

4612414802 REJECTED (coordinator) advanced-settings-group.component.ts - No more edits to that file in this PR (owned by PR #1417); the note returns when #1417 merges with the section mode.
4612414813 FIXED libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts - Close the active rating when its column changes placement and focus a surviving control after rendering; unrelated reflow keeps it open.
4612414820 FIXED libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts - Give both rating detail panels named dialog roles matching their existing triggers.
4612414830 FIXED libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts - Describe both rating buttons with the numeric score and stale state, preserving their accessible names.
4612414839 FIXED libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts - Show Unrated text in both layouts; regression coverage keeps zero as a rated score.
4612414848 FIXED (coordinator) decision-matrix-page.component.ts - An unresolved custom executor uses its id as the option label, so options stay distinct.
4612414854 FIXED (coordinator) decision-matrix-page.component.ts - The band has 4 segments (as in the prototype; "Stale ratings" removed), so it stays 2x2 at narrow widths.
4612414865 FIXED (coordinator) decision-matrix-page.component.ts - A null routing read shows "Unknown" (idle), not "Needs a model".
4612414873 FIXED libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts - Include each route in its visible recent-pick badge while preserving the title.
4612414883 FIXED libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts - Use live="polite" so the unavailable recent-picks warning has status semantics, including after retry.
4612414893 FIXED libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-measure-advice.component.ts - Use the existing button busy input to block repeated activation and retain focus.
4612414901 REJECTED libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts - Confirmed shared rich-select limitation; no supported busy input exists and a local replacement would exceed the small-fix scope.
4612414911 FIXED libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts - The help text is now the field hint, so it reaches the focused trigger; the hint stays one short line (no "Current measure" text, the select shows it).
4612414925 FIXED libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.ts - Use an invalid-and-ignored hint for invalid environment overrides; precedence applies only to valid overrides.
4612414935 REJECTED libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.ts - The select already shows the placeholder "Unknown" when no value is confirmed; a second "Unknown" line repeats it (coordinator review).
4612414948 REJECTED libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.ts - Confirmed shared rich-select limitation; preserving pending-save focus needs shared-control support outside the allowed scope.
4612414961 FIXED libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.ts - Include the effective override value in the supported field hint that reaches the focused trigger.

Changed files (this lane only; concurrent coordinator changes excluded):

- libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.spec.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.spec.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-measure-advice.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-measure-advice.component.spec.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.spec.ts
- .ptah/specs/TASK_2026_2267_be46/coderabbit-triage.md

Checks:

`npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-measure-advice.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.spec.ts`

Result: PASS (exit 0), 5 suites and 74 tests. Initial runs identified and corrected a status-role assertion and reflow focus timing; all fixes have regression assertions.

`npx eslint libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-measure-advice.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-measure-advice.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.spec.ts`

Result: PASS (exit 0).

Tools and limits: Ptah workspace/AST tools were used. The dependency graph was not ready, so targeted native rg import searches were used. Native Codex skill loading/discovery was unavailable; local angular-frontend-patterns and ui-ux-designer instructions were read directly. No shared UI, coordinator-owned, provider, shared-contract, or documentation files were edited by this lane. IDs, data-testid values, existing aria-labels, settings keys, and RPCs are unchanged. No commit, push, GitHub comments, nx, build, serve, e2e, or whole-library typecheck.

Visual limitation: no live renderer/browser session was available, and the authorized verification excludes build/serve/e2e. Component DOM, accessible descriptions, focus recovery, and visible Unrated/Unknown copy were verified in Jest against the existing settings design requirements; an actual Electron screenshot was not captured. No visual-quality claim is made.

---
version: 1
kind: visual-review
input: [context.md, implementation-plan.md, approved prototype or before screenshots, Electron app, changed UI files]
deliverable: [visual-review.md, Electron screenshots]
verdict: [APPROVE, REVISE, REJECT]
acceptanceStep: ["See ../SKILL.md orchestrator acceptance step", orchestrator checks visual evidence and independent verdict before UI acceptance]
requiredCapabilities: [inspect rendered Electron UI, capture screenshots, measure accessibility]
toolProfile:
  disallowedTools: []
  permission: prompt
---

## Method
Read the changed components and styles before opening the running Electron app. Confirm which build is rendered. Compare with the approved `prototype/index.html` when present; otherwise pair before and after screenshots for both dark and light themes. Test all six viewports: 320, 375, 768, 1024, 1366 and 1920 pixels; save a screenshot of each in screenshots/. Supply both inputs: base-commit capture or running app at the base commit, and the running app with the fix. Compare dark and light themes and show evidence before merge. Capture default, hover, keyboard focus, active, disabled, loading, filled and error states where applicable; inspect menus, dialogs, toasts and tooltips. Tab through the screen and check semantic structure. Measure computed contrast and target sizes against the repository's declared standard, or WCAG AA if none is declared. Check responsive overflow, hierarchy, spacing, typography, content stress including long and RTL text, layout movement and animation. Classify each finding as visual breaking, serious, moderate or minor with a screenshot and affected viewport.

## Output contract
Write `visual-review.md` in the task folder and screenshots from Electron. Include summary score, assessment and counts; verified build, viewports, screens and screenshot paths; findings with severity, file and line, impact and fix; prototype fidelity or explicit dark/light before-after pairs; per-viewport and interaction results; design tokens observed; measured contrast, target size, focus and semantics; visual performance; recommendation, confidence and key concern. Every visual claim needs a screenshot. A deviation from an approved prototype or removal of an existing component requires explicit approval before acceptance.

## Return value
Return `WROTE: <absolute path>`, then verdict and issue counts by severity.

## Refusals
Do not review a build that cannot be identified, claim an unopened viewport passes, make unsupported visual claims, edit the UI under review, soften severity for an easy fix, or approve unapproved deviations. Do not substitute source or type checks for rendered evidence.

## Escalation protocol
If Electron cannot render, the prototype or before capture is missing, or interaction cannot be reached, report the blocker, attempted evidence and exact capture or decision needed. Preserve a partial verdict with uncovered states named.

## Reviewer stance
Inspect independently and report observable defects, including disagreements with the design. Separate evidence from inference; state uncertainty and recommend approval only for rendered states actually checked.

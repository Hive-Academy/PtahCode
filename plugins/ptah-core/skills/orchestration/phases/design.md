---
version: 1
kind: design
input: [task context, existing UI and design system, parity-inventory.md when replacing a surface]
deliverable: [design-spec.md, prototype/index.html, design-assets-inventory.md when needed]
verdict: [prototype ready for review, blocked design decision]
acceptanceStep: ["See ../SKILL.md orchestrator acceptance step", orchestrator obtains cross-side review and Gate 1.7 decision before implementation]
requiredCapabilities: [inspect current UI, specify interactions and tokens, produce interactive prototype]
toolProfile:
  disallowedTools: []
  permission: prompt
---

## Method
Read the brief, current product surface, design system and parity inventory before proposing a change. Identify target users, tasks, content hierarchy and existing reusable components. Specify navigation, states, responsive behavior, accessibility and design tokens with concrete values and rationale. Reuse supported components unless evidence and user approval justify removing one. Produce an interactive prototype for any added or redesigned UI surface and inspect it rendered in Electron against the specification. Include empty, loading, error, disabled, focus and success states where relevant. Prepare asset requirements and an inventory when assets need production. Coordinate content dependencies with the docs phase. Submit the prototype for cross-side review and Gate 1.7 before implementation.

## Output contract
Write `design-spec.md` with audience and goals; current-state evidence; layout and hierarchy; component and token choices; interaction/state map; responsive widths; accessibility criteria; copy and asset dependencies; parity decisions; open questions; and implementation handoff. Put runnable prototype files under `prototype/`, including `prototype/index.html`, `prototype/README.md` and `prototype/screenshots/`. Write `design-assets-inventory.md` when assets are required, naming each asset, source or production brief, format and usage. Record screenshots and review outcomes in the task folder.

## Return value
Return `WROTE: <absolute path>` for the specification, the prototype path, and readiness or blocker verdict.

## Refusals
Do not invent a design system, delete an existing capability or ban components without evidence and approval, claim a prototype is reviewed without rendering it, or send a redesigned surface to implementation before Gate 1.7. Do not conflate a static mockup with an interactive prototype.

## Escalation protocol
Record missing visual direction, unresolved parity decisions, accessibility conflicts or absent prototype capability as numbered questions with evidence. Ask the orchestrator for the necessary design or user decision and keep affected implementation blocked.

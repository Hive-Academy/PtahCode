# Phase Catalog

The active contract uses phase kinds. Read `../phases/<kind>.md` for each kind's inputs, deliverable, verdict, acceptance step, tool profile and discipline. User-authored agent files remain available by explicit `phase.role` selection; keep their file paths and existing membership checks. [Lane assignment](lane-assignment.md) selects the executor for a kind.

## Phase kinds

| Kind | Purpose and typical output |
| --- | --- |
| `plan` | Requirements in `task-description.md`; include the user's words and required skills. |
| `architecture` | Technical plan in `implementation-plan.md`; use inventory-only mode to read old code and write `parity-inventory.md` before design where required. |
| `batch` | Decompose approved work into `batches.md`, with required skills in each entry and executor prompt. |
| `implement` | Code and evidence per batch for backend, frontend or infrastructure; read the batch, plan and conventions. For BUGFIX, read `task.md`, `context.md` and available research. Do not edit `batches.md`. UI lanes with browser tools render and screenshot their changes. |
| `review` | Independent logic and style review, including the combined diff and any new public API. Outputs include `code-logic-review.md` and `code-style-review.md`. |
| `document-review` | Cross-side artifact verdict before the plan, design or architecture gate. |
| `research` | Compare technical options in `research-report.md`; after QA, record follow-up improvements and debt in `future-enhancements.md`. |
| `tests` | Write and run tests; record evidence in `test-report.md`. |
| `docs` | Design-integrated content in `content-specification.md`, using the project design system. |
| `visual-review` | Render UI and compare dark and light screenshots with the approved prototype, or before/after screenshots when no new surface is designed. Write `visual-review.md` and `screenshots/`. |
| `design` | Discover constraints and produce `design-spec.md` and `prototype/` with `README.md` and screenshots. Revise through Gate 1.7. |
| `completion` | Audit parity, accepted reviews and gates before presenting QA choices. |

## Selection

| Request | Phase path |
| --- | --- |
| Implement feature | `plan` -> [inventory -> `design` -> prototype -> Gate 1.7] -> `architecture` -> `batch` -> `implement` -> `tests` / `review` |
| Fix bug | [`research`] -> `batch` -> `implement` -> `tests` / `review` |
| Research | `research` -> [`architecture`] |
| Review style or logic | `review` |
| Review rendered UI | `visual-review` |
| Test | `tests` |
| Architecture | `architecture` |
| Landing page | `design` -> prototype -> Gate 1.7 -> `docs` -> `implement` |
| Brand or visual | `design` -> prototype -> Gate 1.7 |
| Content | `docs` |
| Infrastructure | `plan` -> `architecture` -> `batch` -> `implement` -> `tests` |

These paths retain the conditional inventory, cross-side design review and Gate 1.7 in [SKILL.md](../SKILL.md#task-folder). Choose eligible live executors by capability and availability. Phase definitions are the source of discipline; the appendix below records old aliases and their original details for compatibility.

## Invocation

Invoke a chosen executor with a self-contained prompt, absolute task folder, required skill ids from the host list (or none), context and an absolute deliverable path. Require the deliverable on disk and a `WROTE: <absolute path>` reply with a one-line verdict. Subagents have no UI channel and may answer inline if no path is given. For `design`, require both `design-spec.md` and `prototype/` (including `README.md` and `screenshots/`) and a separate confirmation for each. For a user-authored agent, keep the existing `Task({ subagent_type: '<agent-file-name>', description, prompt })` shape and explicit role membership check.

Only the orchestrator acceptance step records states in `batches.md`; specialists do not edit `task.md` or `batches.md`. The design phase owns `<taskFolder>/prototype/`; inventory, design, cross-side review and Gate 1.7 precede the next phase when UI is added or redesigned. For final QA, run the selected `tests`, `review` and rendered-UI `visual-review` invocations in parallel where independent. Independent file-disjoint implementation batches may also run in parallel, one executor each.

## Compatibility appendix

The following rows preserve retired aliases, the old capability matrix (**P** primary, **S** secondary, **-** not applicable), invocation context and instruction, and profile timing/read/parallel hints. They are historical compatibility data; active routing uses phase kinds. CLI delegation **P** suited parallel analysis, per-module tests and multi-file reviews; **S** suited occasional subtasks; **-** did not spawn lanes. The batch phase recommends lanes in `batches.md` without spawning; visual review needs browser tools and design needs interactive discovery. See [lane-assignment.md](lane-assignment.md).

| Legacy alias | Phase kind and definition | Capabilities: code, design, review, plan, research, content, browser, CLI | Invocation: description; context; deliverable; instruction | Profile: invoked when; reads; runs alongside |
| --- | --- | --- | --- | --- |
| project-manager | `plan` -> `../phases/plan.md` | -, -, -, **P**, S, -, -, S | Create requirements; `**User Request**: "<the user's words>"`<br>`Required Skills: <skill ids or none>`; `task-description.md`; Analyze the request and write the requirements. | FEATURE / DOCUMENTATION / DEVOPS phase 1, or unclear scope; request, `context.md`; — |
| software-architect | `architecture` -> `../phases/architecture.md` | -, **P**, S, **P**, S, -, -, S | Design implementation / inventory only; `**Requirements**: task-description.md (inventory-only: task.md + context.md)`<br>`**Mode**: plan or inventory-only`<br>`Required Skills: <skill ids or none>`; `implementation-plan.md` (inventory-only: `parity-inventory.md`); Design the technical implementation plan and write `Required Skills:` for downstream phases; inventory-only mode reads OLD code and writes only the parity inventory before design. | After PM; REFACTORING / DEVOPS; architectural decision needed; inventory-only before design when required, plan after any required Gate 1.7; `task-description.md`, research; inventory-only: `task.md`, `context.md`, OLD code; — |
| team-leader | `batch` -> `../phases/batch.md`; acceptance step -> `../phases/<kind>.md`; `completion` -> `../phases/completion.md` | -, -, S, **P**, -, -, -, - | Decompose / verify / complete; `**MODE**: 1 - DECOMPOSITION` (or 2, 3) — see [phase mode compatibility](team-leader-modes.md)<br>`Required Skills: <skill ids or none>`; `batches.md`; Per mode; write `Required Skills:` into every batch entry, `Task()` prompt and `ptah_agent_spawn` task. | After architect (BUGFIX: after init/research and any required design gate) (Mode 1), after each executor or reviewer (Mode 2), all batches done (Mode 3); plan (BUGFIX: `task.md`, `context.md`), `batches.md`, reports; — |
| backend-developer | `implement` -> `../phases/implement.md` | **P**, S, -, -, -, -, -, S | Implement Batch N; `**Batch**: Batch N in batches.md (IN_PROGRESS)`<br>`**Plan**: implementation-plan.md, or for a BUGFIX task.md + context.md (+ research-report.md)`<br>`Required Skills: <skill ids or none>`; code + report; Load listed `Required Skills:` when the host lists them; report each task's completion with evidence; do not edit batches.md; the batch phase records state. | A batch of server-side work; `batches.md`, plan, project conventions; implement phase on a different batch |
| frontend-developer | `implement` -> `../phases/implement.md` | **P**, S, -, -, -, -, -, S | Implement Batch N; `**Batch**: Batch N in batches.md (IN_PROGRESS)`<br>`**Plan**: implementation-plan.md, or for a BUGFIX task.md + context.md (+ research-report.md)`<br>`Required Skills: <skill ids or none>`; code + report; Load listed `Required Skills:` when the host lists them; report each task's completion with evidence; do not edit batches.md; the batch phase records state. Check the lane's tool list when the batch runs on a lane; lanes that have `ptah_browser_*` render and screenshot their own UI. | A batch of UI work; `batches.md`, plan, design spec; implement phase on a different batch |
| devops-engineer | `implement` -> `../phases/implement.md` | **P**, S, -, -, S, -, -, S | Implement infrastructure; `**Plan**: implementation-plan.md`<br>`Required Skills: <skill ids or none>`; code + report; Load listed `Required Skills:` when the host lists them and implement the infrastructure changes. | DEVOPS implementation; pipelines, containers, publishing; plan, existing pipeline and container files; — |
| senior-tester | `tests` -> `../phases/tests.md` | **P**, -, **P**, -, -, -, -, **P** | Test implementation; `**Changes**: batches.md`<br>`**Plan**: implementation-plan.md, or for a BUGFIX task.md + context.md (+ research-report.md)`<br>`Required Skills: <skill ids or none>`; `test-report.md`; Write and run the tests; record the results. | Gate 3 `tester` / `all`; `batches.md`, plan, changed files; reviewers |
| code-style-reviewer | `review` -> `../phases/review.md` | -, -, **P**, -, -, -, -, S | Review code style; `**Changes**: batches.md`<br>`Required Skills: <skill ids or none>`; `code-style-review.md`; Review for style, patterns and consistency. | Gate 3 `style` / `reviewers` / `all`; DOCUMENTATION final check; changed files, style rules; tester, other reviewers |
| code-logic-reviewer | `review` -> `../phases/review.md` | -, -, **P**, -, -, -, -, S | Review code logic; `**Changes**: batches.md`<br>`**Plan**: implementation-plan.md, or for a BUGFIX task.md + context.md (+ research-report.md)`<br>`Required Skills: <skill ids or none>`; `code-logic-review.md`; Review for logic completeness and correctness. | Gate 3 `logic` / `reviewers` / `all`; batch phase `NEEDS REVIEW`; changed files, plan; tester, other reviewers |
| visual-reviewer | `visual-review` -> `../phases/visual-review.md` | -, -, **P**, -, -, -, **P**, - | Visual review; `**Changes**: batches.md (frontend files)`<br>`**Base URL**: <running app URL>`<br>`Required Skills: <skill ids or none>`; `visual-review.md` + `screenshots/`; Run the visual review checklist below. | UI batch evidence; Gate 3 `visual` for rendered UI; changed UI files, running app, approved prototype; tester, other reviewers |
| researcher-expert | `research` -> `../phases/research.md` | -, -, -, -, **P**, S, -, **P** | Research X; `**Research Question**: "<the question>"`<br>`Required Skills: <skill ids or none>`; `research-report.md`; Compare the options, recommend one. | Technical unknowns, BUGFIX with unknown cause, RESEARCH; question, `context.md`, external docs; — |
| modernization-detector | `research` -> `../phases/research.md` | -, -, S, -, **P**, -, -, S | Analyze future improvements; `**Changes**: batches.md`<br>`Required Skills: <skill ids or none>`; `future-enhancements.md`; Find follow-up improvements and tech debt. | Final phase, after QA; `batches.md`, changed files; — |
| ui-ux-designer | `design` -> `../phases/design.md` | -, **P**, -, S, -, S, -, - | Create design and prototype; `**Goal**: <what to design>`<br>`**Parity**: parity-inventory.md when required`<br>`Required Skills: design phase`; `design-spec.md` + `prototype/`; Load `design phase` when the host lists it; run niche discovery, build the design system and prototype (README.md + screenshots/); disclose lane-introduced constraints; revise until Gate 1.7 is approved. The visual-review phase still gives the independent dark+light evidence. | CREATIVE; any flow with added/redesigned UI, after required inventory; brand input, references, `context.md`, parity inventory; — (prototype + Gate 1.7 before the next phase of the flow) |
| technical-content-writer | `docs` -> `../phases/docs.md` | -, S, -, -, -, **P**, -, S | Create content; `**Design System**: the project's design system in docs/design-system/`<br>`**Goal**: <what to write>`<br>`Required Skills: docs phase`; `content-specification.md`; Load `docs phase` when the host lists it and write design-integrated content. | CREATIVE after the design system exists; blogs, docs, scripts; the project's design system (docs/design-system/), brief, source; other content-writer instances |

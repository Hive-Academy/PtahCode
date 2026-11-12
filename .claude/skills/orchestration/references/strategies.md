# Execution Strategies Reference

Detailed workflow diagrams and guidance for all 8 task type workflows. Route each phase by kind at Gate 0.1 and read `../phases/<kind>.md`; use [the compatibility appendix](agent-catalog.md#compatibility-appendix) when assigning a built-in subagent. Which phases or batches may run on CLI lanes: [lane-assignment.md](lane-assignment.md).

Every document gate below runs `author → independent document review → bounded revision → gate`
([checkpoints.md § Cross-side review protocol](checkpoints.md#cross-side-review-protocol)), for initial
artifacts and revisions alike. The gate passes on the reviewer's APPROVED in `lane-review` mode and on
the user's `APPROVED` in `user` mode or on escalation ([checkpoints.md § Approval mode](checkpoints.md#approval-mode)). Include the reviews in the announced agent sequence. Every
implementation also gets the required shipping-code review before batch acceptance, or before
completion and git in flows without a batch planner; Gate 3 `skip` does not waive it.

**Skill routing**: The `architecture` and `batch` phases must put a `Required Skills:` line (skill ids,
or `none`) in every phase brief, `Task()` prompt and `ptah_agent_spawn` task, chosen from the
skills the host lists whose descriptions match the batch's stack and layer (loaded when the host
lists it; a role never stops work because an optional skill is absent). Stack-cue → skill table:
[agent-catalog.md § Skill routing](agent-catalog.md#skill-routing).

---

## Strategy Overview

| Strategy | Complexity | Phase kinds | User checkpoints |
| --- | --- | --- | --- |
| FEATURE | Full | `plan`, `document-review`, optional `research`/`design`, `architecture`, `batch`, `implement`, `review`, `tests`, `completion`, after-QA `research` | Scope, requirements, design (1.7), architecture, QA |
| BUGFIX | Streamlined | optional `research`, `batch`, `implement`, `review`, `tests`, `completion`, after-QA `research` | QA |
| REFACTORING | Focused | `architecture`, `batch`, `implement`, `review`, `tests`, `completion`, after-QA `research` | Architecture, QA |
| DOCUMENTATION | Minimal | `plan`, `document-review`, `docs`, `implement`, `review`, `tests`, `completion` | Requirements |
| RESEARCH | Investigation | `research`, optional FEATURE flow, `completion` | None |
| DEVOPS | Infrastructure | `plan`, `architecture`, `implement`, `review`, `tests`, `completion`, after-QA `research` | Requirements, architecture, QA |
| SAAS_INIT | Full + discovery | discovery, `plan`, `architecture`, `batch`, `implement`, `review`, `tests`, `completion` | Scope, PRD, architecture, batches |
| CREATIVE | Design first | `design`, `docs`, `implement`, `review`, `visual-review`, `completion` | Design system, design (1.7) |

---

## FEATURE (Full Workflow)

**When to use**: New features, unclear scope, complex requirements

```
Phase 0.5: [IF ambiguous request] SCOPE CLARIFICATION
           Decision ladder: evidence -> cross-side peer -> user only for scope intent
           |
           SCOPE DECISIONS LOGGED (decisions.md)
           |
           v
Phase 1: plan --> Creates task-description.md
         |
         INDEPENDENT DOCUMENT REVIEW (other execution side; bounded revision per agent-lanes §6)
         |
         GATE PASSES (lane-review: reviewer APPROVED; user: "APPROVED" or feedback)
         |
         v
Phase 2: [IF technical unknowns] research --> Creates research-report.md
         |
         v
Phase 3: [IF UI/UX work] design --> Creates design-spec.md + prototype/
         |
         INDEPENDENT DOCUMENT REVIEW (other execution side; bounded revision per agent-lanes §6)
         |
         GATE 1.7 PASSES (lane-review: reviewer APPROVED; user: "APPROVED" or revisions)
         |
         v
Phase 3.5: [IF multiple valid approaches] TECHNICAL CLARIFICATION
           Decision ladder: evidence -> cross-side peer -> user only if user-reserved
           |
           TECHNICAL DECISIONS LOGGED (decisions.md)
           |
           v
Phase 4: architecture --> Creates implementation-plan.md
         |
         INDEPENDENT DOCUMENT REVIEW (other execution side; bounded revision per agent-lanes §6)
         |
         GATE PASSES (lane-review: reviewer APPROVED; user: "APPROVED" or feedback)
         |
         v
Phase 5: batch (decompose) --> implement + acceptance (loop)
         |
         Review and test phases selected by rule (notice; user may add agents)
         |
         v
Phase 6: `review`, `tests`, `visual-review` as selected
         |
         v
Phase 7: User handles git (commits already created)
         |
         v
Phase 8: completion --> research (after-QA modernization scan) --> Creates future-enhancements.md
```

Before design starts on an existing surface being replaced, consolidated, rebuilt or redesigned,
`plan` (`architecture` inventory-only when no `plan`) writes `parity-inventory.md` from the old code. `design` owns
`design-spec.md` and `<taskFolder>/prototype/`, including `README.md` and `screenshots/`;
revise them until Gate 1.7 is approved, then pass the approved prototype to the `architecture` phase.

### Conditional Phase Triggers

| Kind             | Invoke When                                                 |
| ----------------- | ----------------------------------------------------------- |
| research | Technical complexity > 3, unknown libraries/APIs, needs POC |
| design    | Landing pages, visual redesigns, new UI components          |

---

## BUGFIX (Streamlined)

**When to use**: Bug reports, error fixes, issue resolution

```
[IF complex/unknown cause] research
         |
         v
batch (decompose) --> implement + acceptance (loop)
         |
         Review and test phases selected by rule
         |
         v
[`review`, `tests`, `visual-review` as selected] --> Git --> completion --> research (after-QA modernization scan)
```

### Decision Points

- **Unknown cause**: Add research before batch
- **Known cause**: Skip directly to batch decomposition (MODE 1)
- **Single-file fix**: Consider minimal pattern (direct `implement` phase)

---

## REFACTORING (Focused)

**When to use**: Code restructuring, optimization, technical debt reduction

```
architecture --> Creates implementation-plan.md
         |
         INDEPENDENT DOCUMENT REVIEW (other execution side; bounded revision per agent-lanes §6)
         |
         GATE PASSES (lane-review: reviewer APPROVED; user: "APPROVED" or feedback)
         |
         v
batch (decompose) --> implement + acceptance (loop)
         |
         Review and test phases selected by rule
         |
         v
[`review`, `tests`, `visual-review` as selected] --> Git --> completion --> research (after-QA modernization scan)
```

### Why Skip `plan`

Refactoring requirements are typically clear:

- "Extract service from component"
- "Optimize database queries"
- "Consolidate duplicate code"

The `architecture` phase designs HOW to refactor; no scope discovery needed.

**Candidate skill**: Assign `humanize-library` in `Required Skills:` when the host lists it and the
task splits large files, removes duplication, or cleans up module structure without changing
behavior ([agent-catalog.md § Skill routing](agent-catalog.md#skill-routing)).

---

## DOCUMENTATION (Minimal)

**When to use**: README updates, API docs, comments, guides

```
plan --> Creates task-description.md
         |
         INDEPENDENT DOCUMENT REVIEW (other execution side; bounded revision per agent-lanes §6)
         |
         GATE PASSES (lane-review: reviewer APPROVED; user: "APPROVED" or feedback)
         |
         v
`docs` --> Writes content-specification.md
         |
         v
`implement` --> Edits real documentation files
         |
         v
`review` --> Verifies formatting/consistency
         |
         v
Orchestrator acceptance and git
```

### Documentation Implementation Selection

Route documentation content specification as `docs`; route real documentation file edits as `implement` and preserve the subject expertise when selecting an executor.

| Documentation type | Required expertise |
| --- | --- |
| API docs | Backend APIs |
| Component docs | Frontend components |
| CI/CD docs | Infrastructure and deployment |
| General guides | Frontend and product workflows |

---

## RESEARCH (Investigation Only)

**When to use**: Technical exploration, feasibility studies, POC evaluation

```
research --> Creates research-report.md
         |
         v
[IF implementation needed] --> Switch to FEATURE strategy
[IF research only] --> Complete
```

### Research-to-Implementation Transition

If research concludes implementation is needed:

1. Research report becomes input to the `plan` phase
2. Switch to FEATURE strategy
3. `plan` references research-report.md in task-description.md

---

## DEVOPS (Infrastructure & Deployment)

**When to use**: CI/CD, Docker, Kubernetes, Terraform, monitoring, publishing

```
Phase 1: plan --> Creates task-description.md
         |
         INDEPENDENT DOCUMENT REVIEW (other execution side; bounded revision per agent-lanes §6)
         |
         GATE PASSES (lane-review: reviewer APPROVED; user: "APPROVED" or feedback)
         |
         v
Phase 2: architecture --> Creates implementation-plan.md
         |
         INDEPENDENT DOCUMENT REVIEW (other execution side; bounded revision per agent-lanes §6)
         |
         GATE PASSES (lane-review: reviewer APPROVED; user: "APPROVED" or feedback)
         |
         v
Phase 3: implement --> Implements infrastructure
         |
         Review and test phases selected by rule (style/logic)
         |
         v
Phase 4: `review`, `tests`, `visual-review` as selected
         |
         v
Phase 5: User handles git (commits already created)
         |
         v
Phase 6: completion --> research (after-QA modernization scan) --> Creates future-enhancements.md
```

### DEVOPS Trigger Keywords

Invoke DEVOPS strategy when task involves:

- CI/CD pipelines, GitHub Actions, GitLab CI
- Docker, Kubernetes, container orchestration
- Terraform, CloudFormation, infrastructure-as-code
- npm/Docker publishing automation
- Monitoring, observability, alerting
- Secret management, cloud platform configuration

**Key Signal**: Work is 100% infrastructure (no application business logic)

**Implementation**: Route the infrastructure work as `implement`; default executor alias `devops-engineer`; use `Required Skills:` from the skill-routing table.

**Candidate skill**: Assign `nestjs-deployment` in `Required Skills:` when the host lists it and
the task containerizes, configures health checks, CORS, rate limiting or production logging, runs
deploy-time migrations, or deploys a NestJS/Nx application
([agent-catalog.md § Skill routing](agent-catalog.md#skill-routing)).

---

## SAAS_INIT (SaaS Workspace Initialization)

**When to use**: Creating new multi-tenant SaaS projects with Nx, NestJS, and Angular

### Trigger Keywords

Invoke SAAS_INIT strategy when task involves:

- "new SaaS", "create SaaS", "start SaaS project"
- "multi-tenant", "multitenancy"
- "Nx monorepo with NestJS and Angular"
- "initialize workspace", "scaffold workspace"
- "B2B SaaS", "B2C platform"

**Key Signal**: Greenfield project requiring full workspace structure

### Strategy Flow

```
Phase 0: DISCOVERY (Orchestrator)
         Run saas-workspace-initializer Step a: mandatory two-round
         AskUserQuestion (Round 1 business, Round 2 stack)
         |
         USER ANSWERS (clarifies business/technical context)
         |
         v
Phase 1: plan + [saas-discovery-prompt]
         --> Creates SaaS PRD (task-description.md) with:
             - Tenant model
             - Domain boundaries
             - Integration patterns
             - MVP scope
         |
         INDEPENDENT DOCUMENT REVIEW (other execution side; bounded revision per agent-lanes §6)
         |
         GATE PASSES (lane-review: reviewer APPROVED; user: "APPROVED" or feedback)
         |
         v
Phase 2: architecture + [saas-architecture-skills]
         References: nx-workspace-architect, nestjs-backend-patterns
         --> Creates implementation-plan.md with:
             - Complete library structure
             - Module boundary rules
             - Batch breakdown
         |
         INDEPENDENT DOCUMENT REVIEW (other execution side; bounded revision per agent-lanes §6)
         |
         GATE PASSES (lane-review: reviewer APPROVED; user: "APPROVED" or feedback)
         |
         v
Phase 3: `batch` (decompose)
         Creates batched tasks from implementation plan
         |
         v
Phase 4: `implement` batches with orchestrator acceptance
         Batch 1: Workspace + shared infrastructure
         Batch 2: Authentication + multitenancy
         Batch 3: First domain scaffold
         Batch 4: Build verification
         |
         v
Phase 5: `completion`
         Final verification, summary
```

### Discovery (Phase 0)

Single source of truth: `saas-workspace-initializer` Step a. Do not maintain a separate discovery question list here. Ask through the `AskUserQuestion` tool, in the skill's two rounds, before invoking `plan`:

- **Round 1 — business**: what is being built, customer type (B2B/B2C/internal), core jobs-to-be-done (2-3 candidate domains), MVP scope, monetization yes/no.
- **Round 2 — stack**: frontend, API, DB/ORM, auth shape, tenancy — each with a "Recommend for me" option.

See `saas-workspace-initializer/SKILL.md` Step a for the exact question wording and the "never proceed with unanswered required questions" rule.

### `plan` Phase Brief

When invoking `plan`, include in prompt:

```
Reference skill: saas-workspace-initializer/SKILL.md

The task-description.md MUST include sections for:
1. TENANT MODEL - Identification and isolation strategy
2. AUTHENTICATION - Provider choice with rationale
3. DOMAIN BOUNDARIES - Bounded contexts list
4. THIRD-PARTY INTEGRATIONS - Using Provider Pattern
5. MVP FEATURE SCOPE - Must-have vs phase 2
6. NON-FUNCTIONAL REQUIREMENTS - Scale, compliance
```

### `architecture` Phase Brief

When invoking `architecture`, include in prompt:

```
Reference skills:
- nx-workspace-architect (library structure)
- nestjs-backend-patterns (backend patterns)
- angular-frontend-patterns (frontend patterns)
- ddd-architecture (if complex domains)

The implementation-plan.md MUST include:
1. WORKSPACE STRUCTURE - All libraries with tags
2. DOMAIN LAYER ORGANIZATION - Per bounded context
3. SHARED INFRASTRUCTURE - Common libraries
4. MULTITENANCY IMPLEMENTATION - Middleware + policies
5. AUTHENTICATION SCAFFOLD - Provider pattern
6. PHASE BREAKDOWN - Batched for the `batch` phase
```

### Batch Templates

Batch structure follows the phase schema in `saas-workspace-initializer/references/roadmap-format.md` — do not duplicate a separate breakdown here. Batch 1 scaffolds exactly the Foundation phase (Nx workspace, ESLint, shared/domain, api-interfaces, plus tenant/auth/DB primitives only if Phase 0 discovery makes them load-bearing — see `saas-workspace-initializer/SKILL.md` Step c). Later batches implement roadmap Phase 2 (Tenancy & Auth) and Phase 3 (Domain Modules) items, one item per batch, in the dependency order given by each item's `Depends on:` field. A final batch always runs verification (build all, lint, typecheck, boundaries) before handoff.

### Implementation Skill References

Implementers reference these skills during implementation:

| Task Area            | Skill                     |
| -------------------- | ------------------------- |
| Workspace, libraries | nx-workspace-architect    |
| Auth, multitenancy   | nestjs-backend-patterns   |
| Entities, aggregates | ddd-architecture          |
| Angular components   | angular-frontend-patterns |

---

## Creative Workflows

Creative workflows follow a **design-first principle** with specific phase sequencing.
Whenever `design` ran or a UI surface is added/redesigned, `design` owns `design-spec.md`
and `<taskFolder>/prototype/` (with `README.md` and `screenshots/`). Run Gate 1.7 before
content/implementation; an existing design system does not waive it. For an existing surface,
`plan` (`architecture` inventory-only when no `plan`) inventories the old code in `parity-inventory.md` before design starts.

### Design-First Dependency Chain

```
+---------------------------------------------------------------+
|  CREATIVE WORKFLOW DEPENDENCY CHAIN                           |
|                                                               |
|  1. DESIGN SYSTEM (Foundation)                                |
|     +-- design creates if missing                     |
|         +-- Output: the project's design system, in           |
|                     docs/design-system/                       |
|                                                               |
|  1.7 DESIGN -> PROTOTYPE -> GATE 1.7 (APPROVED)              |
|                                                               |
|  2. CONTENT GENERATION (Depends on #1)                        |
|     +-- docs uses design system           |
|         +-- Output: Design-integrated content specs           |
|                                                               |
|  3. IMPLEMENTATION (Depends on #1 and #2)                     |
|     +-- implement implements with specs              |
+---------------------------------------------------------------+
```

### Automatic Design System Check

Before invoking docs for landing pages:

The design system lives in the project, at `docs/design-system/`; a skill
directory is never its home. Select ONE authoritative document there: the one the project's
`CLAUDE.md` or `AGENTS.md` names, otherwise the one named for the project or its brand. Never
combine several design systems.

```
design_system_file = select_authoritative(Glob(docs/design-system/**/*.md))

if NOT exists(design_system_file):
    -> Invoke design FIRST
    -> "Create design system for this project"
    -> Wait for completion
    -> `design` creates design-spec.md + prototype/; run Gate 1.7
    -> Then invoke docs

if exists(design_system_file):
    -> For added/redesigned UI: `design` -> prototype -> Gate 1.7
    -> Then invoke docs
    -> Content will use existing design system
```

### Creative Request Detection

| User Says                         | Workflow                                |
| --------------------------------- | --------------------------------------- |
| "Create landing page"             | Design check -> `design` -> `docs` phase |
| "Design our homepage"             | Design check -> `design` -> `docs` phase |
| "Marketing content for..."        | Design check -> `docs` phase          |
| "Visual design for..."            | design                          |
| "Brand identity"                  | design (full discovery)         |
| "Write a blog post"               | `docs` phase (design check optional)  |
| "Video script for..."             | `docs` phase                          |
| "What should our site look like?" | design (discovery)              |

### Workflow A: Full Creative (Landing Page, Marketing Site)

```
User: "Create a landing page for our extension"

Orchestrator:
  1. Check design system exists
     select_authoritative(Glob(docs/design-system/**/*.md))

  2. IF MISSING -> Invoke design:
     Route `design` to create the design system
     - Agent loads NICHE-DISCOVERY.md skill
     - Agent guides user through aesthetic discovery
     - Agent creates the design system in docs/design-system/
     - Wait for completion

  2.5. Invoke design for design-spec.md + prototype/ (even if design system exists)
       - Include prototype/README.md and prototype/screenshots/
       - Run the independent document review, then present Gate 1.7; revise per the review protocol until APPROVED

  3. Invoke docs:
     Route `docs` to create landing page content
     - Agent loads LANDING-PAGES.md skill
     - Agent loads the project's design system
     - Agent creates design-integrated content

  4. Deliver combined output:
     - Design system (if created)
     - Approved design-spec.md and prototype/
     - Content specification with visual specs
     - Asset generation briefs
```

### Workflow B: Content Only (Blog, Docs, Video)

```
User: "Write a blog post about the SDK"

Orchestrator:
  1. Design system check (OPTIONAL for blogs)
     - If exists, `docs` phase can reference it
     - If missing, proceed without (text-focused content)

  2. Invoke docs:
     Route `docs` to write the blog post
     - Agent loads BLOG-POSTS.md skill
     - Agent investigates codebase
     - Agent creates evidence-backed content
```

### Workflow C: Design System Only

```
User: "Help me define our visual identity"

Orchestrator:
  1. Invoke design:
     Route `design` for full discovery and the design system
     - Agent loads NICHE-DISCOVERY.md
     - Agent loads DESIGN-SYSTEM-BUILDER.md
     - Agent guides through discovery questions
     - Agent creates complete design system, design-spec.md and prototype/
  2. Run the independent document review, then present Gate 1.7; revise per the review protocol until APPROVED
```

### Parallel vs Sequential Execution

**Sequential (Default for Creative)**:

- Design system MUST complete before content; if `design` ran or UI is added/redesigned,
  designer → prototype → Gate 1.7 approval also precedes content
- Content informs implementation

**Parallel (When Design Exists)**:

- Multiple content pieces can be created in parallel
- Different content types (blog + video) can run simultaneously

```
# Sequential (design missing)
design --> prototype --> Gate 1.7 --> docs --> implement

# Parallel (design exists; Gate 1.7 approved for added/redesigned UI)
+-> docs (landing page)
+-> docs (blog post)
+-> docs (video script)
```

### Creative Output Locations

| Kind                    | Output File                                                  | Purpose                           |
| ------------------------ | ------------------------------------------------------------ | --------------------------------- |
| design           | Existing authoritative design-system document in the project | Design tokens, colors, typography |
| design           | `.ptah/specs/TASK_[ID]/design-spec.md` + `prototype/`         | Visual spec + prototype for Gate 1.7        |
| docs | `.ptah/specs/TASK_[ID]/content-specification.md`             | Content with design integration   |
| docs | `docs/content/*.md`                                          | Final content files               |

### Creative Handoff Protocols

**design -> docs:**

```markdown
## Design Handoff for Content

**Design System**: the project's design system in `docs/design-system/`
**Approved Prototype**: `<taskFolder>/prototype/` (Gate 1.7; README.md + screenshots/)
**Aesthetic**: [Name - e.g., "Sacred Tech"]
**Key Colors**: [Primary accent, backgrounds]
**Typography**: [Display + body fonts]
**Animation Patterns**: [Key effects to reference]

The `docs` executor should:

- Reference the project's design system for all visual specs
- Use LANDING-PAGES.md templates with design integration
- Include animation/effect specifications in content
```

**docs -> implement:**

```markdown
## Content Handoff for Implementation

**Content Spec**: .ptah/specs/TASK\_[ID]/content-specification.md
**Design System**: the project's design system in `docs/design-system/`
**Approved Prototype**: `<taskFolder>/prototype/` (Gate 1.7)
**Assets Needed**: [List from asset briefs]

The `implement` executor should:

- Implement content following visual specs and the approved prototype; return deviations to the `design` phase
- Use design system tokens exactly
- Generate/source assets from briefs
```

---

## Strategy Selection Summary

Use this decision tree for quick strategy selection:

```
Is task SAAS_INIT (new SaaS, multi-tenant, Nx workspace)?
    YES -> SAAS_INIT strategy
    NO  -> continue

Is task DEVOPS (CI/CD, Docker, K8s, Terraform)?
    YES -> DEVOPS strategy
    NO  -> continue

Is task CREATIVE (landing page, brand, marketing)?
    YES -> Check design system -> CREATIVE strategy
    NO  -> continue

Is task a new FEATURE?
    YES -> FEATURE strategy (full workflow)
    NO  -> continue

Is task a BUGFIX?
    YES -> Is cause known?
           YES -> Minimal pattern (`implement` only)
           NO  -> BUGFIX strategy
    NO  -> continue

Is task REFACTORING?
    YES -> REFACTORING strategy
    NO  -> continue

Is task DOCUMENTATION?
    YES -> DOCUMENTATION strategy
    NO  -> continue

Is task RESEARCH?
    YES -> RESEARCH strategy
    NO  -> Ask user for clarification
```

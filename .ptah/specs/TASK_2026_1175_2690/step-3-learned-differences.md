# Step 3 learned differences

Layer A compares each source template with its phase and related skill. Line ranges refer to templates. Metadata, static partial markers and tool syntax are delivery mechanics covered by the orchestration contract.

## Project manager

| Template lines | Rule | Destination or drop reason | Verdict |
| --- | --- | --- | --- |
| 1-46 | Metadata and static contracts | Generated wrapper and orchestration contract | dropped-with-reason |
| 48-54 | Set scope and classify; leave design to later phase | `plan.md:16,29` | covered |
| 56-70 | Read request, current artifacts, review findings and code; refine in place | `plan.md:16,18` | moved |
| 74-75 | Read the current feature and its constraints | `plan.md:16` | covered |
| 76-78 | Separate outcome from proposed mechanism | `plan.md:16,29` | covered |
| 79-80 | State in/out scope with reasons | `plan.md:16` | covered |
| 81-84 | Contract type, estimate and evidenced priority | `plan.md:16` | covered |
| 85-89 | Name actor or affected system, capability and outcome | `plan.md:16` | covered |
| 90-92 | Write condition and observable behavior for each criterion | `plan.md:16,18` | moved |
| 93-96 | Include only evidenced measurable nonfunctional constraints | `plan.md:16,29` | covered |
| 97-99 | Name stakeholders and risks with owner and action | `plan.md:16,18` | moved |
| 100-106 | Inventory old surface and obtain removal approval | `plan.md:20,29` | covered |
| 108-208 | Requirements and parity artifact structure | `plan.md:22` | covered |
| 210-216 | Return path and functional area count | `plan.md:25` | covered |
| 218-239 | Refuse invented design, thresholds and risks; preserve prior work | `plan.md:18,29` | covered |

## Software architect

| Template lines | Rule | Destination or drop reason | Verdict |
| --- | --- | --- | --- |
| 1-42,57-58 | Metadata and static contracts | Generated wrapper and orchestration contract | dropped-with-reason |
| 43-56 | Instruction priority, simple structure, safe boundaries, external calls, tests, bounded resources | `architecture.md:18-20` | moved |
| 59-93 | Source-backed design, inventory-only mode | `architecture.md:16,22` | covered |
| 94-121 | Read requirements, prior plan, handoff and required skills | `architecture.md:16,18` | covered |
| 122-126 | Read repository instructions before designing | `architecture.md:16` | covered |
| 127-129 | Inspect comparable implementations | `architecture.md:16` | covered |
| 130-132 | Verify every symbol and contract before naming it | `architecture.md:16` | covered |
| 133-136 | Trace dependency direction, state, validation and failure | `architecture.md:16` | covered |
| 137-139 | Prefer fitting established patterns | `architecture.md:16` | covered |
| 140-142 | Label evidence and assumptions | `architecture.md:16` | covered |
| 143-145 | Record requirement, choice, alternative and consequence | `architecture.md:16` | covered |
| 146-150 | Check component cohesion and boundary contracts | `architecture.md:16,20` | covered |
| 151-160 | Use external docs as context; verify local behavior | `architecture.md:18` | moved |
| 162-175 | Repository-specific patterns | Project guidance; local facts stay out of generic phase | dropped-with-reason |
| 176-259 | Plan sections, component contract, integration and handoff | `architecture.md:24` | covered |
| 260-268 | Return path and finding | `architecture.md` Return value | covered |
| 269-288 | No unverified names, silent conflicts, premature batching or speculative abstractions | `architecture.md:16,18,24` | covered |

## Researcher expert

| Template lines | Rule | Destination or drop reason | Verdict |
| --- | --- | --- | --- |
| 1-43 | Metadata and static contracts | Generated wrapper and orchestration contract | dropped-with-reason |
| 44-60 | Bound question; read task and installed versions | `research.md:16` | covered |
| 61-64 | Frame a bounded decision with options | `research.md:16` | covered |
| 65-66 | Inspect repository and installed version first | `research.md:16` | covered |
| 67-70 | Search outward only for missing evidence | `research.md:18` | moved |
| 71-74 | Cite source, date and verification method | `research.md:16` | covered |
| 75-76 | Examine disagreements and common source origin | `research.md:18` | moved |
| 77-78 | Tie findings to local files and constraints | `research.md:18` | moved |
| 79-80 | Label verified and inferred claims | `research.md:16` | covered |
| 81-125 | Question, evidence, options, consequences and unknowns | `research.md` Output contract | covered |
| 126-133 | Return path and finding | `research.md` Return value | covered |
| 134-148 | No invented attribution, unrelated answer or false comparison; recommend only | `research.md:18` and Refusals | moved |

## Modernization detector

| Template lines | Rule | Destination or drop reason | Verdict |
| --- | --- | --- | --- |
| 1-42 | Metadata and static contracts | Generated wrapper and orchestration contract | dropped-with-reason |
| 43-67 | Consolidate deferred items with detail; scan code and discover present sources | `research.md:20-24` | moved |
| 68-72 | Identify real framework and authoritative versions | `research.md:16,20` | covered |
| 73-76 | Compare current code with supported patterns | `research.md:20` | covered |
| 77-79 | Detect inconsistent solutions | `research.md:20` | covered |
| 80-82 | Count affected sites and derive effort | `research.md:20` | covered |
| 83-87 | Rank by impact, effort, risk and work unblocked | `research.md:20` | covered |
| 88-93 | Cite maturity, fit and local evidence; exclude speculation | `research.md:16,20` | covered |
| 94-128 | Opportunity table, implementation notes, benefit and source | `research.md` Output contract | covered |
| 129-132 | Return counts by priority | `research.md` Return value | covered |
| 133-139 | No edits, unsupported opportunities, speculative patterns or invented counts | `research.md` Refusals | covered |

## Technical content writer

| Template lines | Rule | Destination or drop reason | Verdict |
| --- | --- | --- | --- |
| 1-41 | Metadata and static contracts | Generated wrapper and orchestration contract | dropped-with-reason |
| 42-99 | Load named skill, investigate task and source, establish audience, fact check | `docs.md:16`; technical-content-writer skill | covered |
| 100-127 | Landing sections, evidence, CTA and visual tokens | `docs.md:16`; skill `LANDING-PAGES.md` | covered |
| 128-177 | Post metadata, outline, examples and read time | `docs.md:16`; skill `BLOG-POSTS.md` | covered |
| 178-210 | Update post structure, evidence and acceptance | `docs.md:16`; skill `BLOG-POSTS.md` | covered |
| 211-253 | Documentation invocation, inputs, outputs, errors and examples | `docs.md:18`; skill `DOCUMENTATION.md` | moved |
| 254-311 | Script timing, demo, visual and sound cues | `docs.md:18`; technical-content-writer skill | moved |
| 312-331 | Specification, verification table, assets and open questions | `docs.md:18` and Output contract | covered |
| 332-343 | Return count; refuse unsupported claims and page implementation | `docs.md` Return value and Refusals | covered |

## UI UX designer

| Template lines | Rule | Destination or drop reason | Verdict |
| --- | --- | --- | --- |
| 1-42 | Metadata and static contracts | Generated wrapper and orchestration contract | dropped-with-reason |
| 43-72 | Load skill and selected reference; read authoritative design system and tokens | `design.md:16,18`; ui-ux-designer skill | moved |
| 73-78 | Discover brand and build one design system | `design.md:16,18`; ui-ux-designer skill | covered |
| 79-89 | Specify screens and interactive prototype; record constraints; pass Gate 1.7 | `design.md:16,18` | moved |
| 90-93 | Write asset briefs using available tools | `design.md:18` | moved |
| 94-99 | Trace values and measure contrast pairs | `design.md:18` | moved |
| 100-113 | Design spec, asset inventory, handoff and prototype | `design.md` Output contract | covered |
| 114-118 | Return written path and asset status | `design.md` Return value; skill handoff | covered |
| 119-128 | No invented tokens or unadvertised tools; require contrast, prototype and approval | `design.md:18` and Refusals | moved |

Layer B: not audited by this lane.

## Held deletions

None from the repository templates audited here. This verdict does not cover Layer B.

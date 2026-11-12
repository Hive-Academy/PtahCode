# Batch B3c report

Six phase definitions were authored in `plugins/ptah-core/skills/orchestration/phases/` and copied byte for byte to `.claude/skills/orchestration/phases/`: `tests.md`, `docs.md`, `visual-review.md`, `design.md`, `batch.md` and `completion.md`. All twelve use LF without CR or BOM.

## Capability mapping

Indexes identify templates by classification range without reproducing retired titles or filenames. Routing metadata and stack tutorials remain outside phase discipline as classified.

### tests

| Template section → place in phase file | Classification lines |
| --- | --- |
| Template 1 frontmatter discipline, scope and inputs → metadata, Method | 213-224 |
| Template 1 test procedure and infrastructure boundary → Method | 224-225 |
| Template 1 missing-harness assessment and questions → Escalation protocol, Output contract | 226-228 |
| Template 1 suite/report schema and observed verdict → Output contract, Return value | 229-230 |
| Template 1 prohibited false passes and suite weakening → Refusals | 231 |

### docs

| Template section → place in phase file | Classification lines |
| --- | --- |
| Template 2 discipline, scope and evidence inputs → metadata, Method | 311-323 |
| Template 2 audience, outline, fact-check and acceptance procedure → Method | 324 |
| Template 2 content-type techniques → relevant content skill selected by Method | 325-329 |
| Template 2 specification, claims, assets and questions → Output contract | 330-334 |
| Template 2 completion signal and unsupported-claim limits → Return value, Refusals | 335-336 |

### visual-review

| Template section → place in phase file | Classification lines |
| --- | --- |
| Template 3 metadata, scope, inputs and reviewer stance → metadata, Method, Reviewer stance | 365-378 |
| Template 3 comparison, viewport/state sweep, accessibility and severity → Method | 379-380 |
| Template 3 screenshot-backed report and verdict → Output contract, Return value | 381-382 |
| Template 3 evidence and independence limits → Refusals, Escalation protocol | 383-384 |

### design

| Template section → place in phase file | Classification lines |
| --- | --- |
| Template 4 discipline, scope and design inputs → metadata, Method | 342-355 |
| Template 4 specification and prototype procedure → Method | 356 |
| Template 4 design artifact and asset handoff → Output contract | 357 |
| Template 4 completion signal and unapproved-deviation limits → Return value, Refusals | 358-359 |

### batch

| Template section → place in phase file | Classification lines |
| --- | --- |
| Template 5 shared discipline, validation inputs and constraints → metadata, Method | 275-287 |
| Template 5 Mode 1 validation, sizing, routing and self-contained entries → Method, Output contract | 288-290 |
| Template 5 Mode 2 checks, review, commit and status → `acceptanceStep` only; orchestrator owns execution | 291 |
| Template 5 signal, status vocabulary and blockers → Return value, Refusals, Escalation protocol | 297-305 |

### completion

| Template section → place in phase file | Classification lines |
| --- | --- |
| Template 5 shared inputs and constraints → metadata, Method | 275-287 |
| Template 5 Mode 3 parity, visual evidence and write-path audit → Method, Output contract | 292-296 |
| Template 5 final verdict, status and stop conditions → Return value, Refusals, Escalation protocol | 297-305 |

## Verification

| Check | Exit | Result |
| --- | ---: | --- |
| `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill` | 0 | 21 Markdown files; 0 errors; 0 warnings |
| `npx ts-node --transpile-only tools/role-census/check-role-census.ts` | 0 | All buckets at or below baseline |
| Six-pair recursive-diff equivalent (`git diff --no-index --exit-code` per pair) | 0 | No differences; hashes equal |
| Byte inspection | 0 | LF, no CR, no BOM in all six authored files |

Census buckets: templates 68/68; skills 461/466; generated-agents 176/176; docs 116/116; test 938/938; source 201/201; other 120/120. Total 2080 counted lines in 298 files.

## Decisions

- The orchestrator acceptance step carries scoped checks, independent review, commit and status evidence. The batch phase decomposes and recommends executors; completion audits the resulting evidence.
- Visual evidence is captured from Electron. The definition requires screenshots and a confirmed build, with prototype comparison or dark/light before-after pairs.
- Source filenames contain retired titles. This report uses template indexes because the task folder is counted by the census. Phase definitions use artifact or phase names.
- The orchestration skill was read locally; no separate skill discovery was needed for these documentation definitions.

## Proposed Removals

None. All discipline assigned to these six kinds was placed; routing metadata and stack tutorials follow their classified destinations.

## Clarifications Needed

None.

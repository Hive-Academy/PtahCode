# Batch B3b report

## Coverage

The tables map classification line numbers and section labels to the authored phase file. Template indexes follow the classification order among sources relevant to this batch; no retired title is repeated here. Shared clarification and tooling discipline is in each phase's Method or Escalation protocol; the shared evidence stance is in review's Reviewer stance.

### plan

| Template section | Place in phase file |
| --- | --- |
| Template 1, classification 171-181: scope, inputs, task classification | Frontmatter input/capabilities; Method |
| Template 1, 182: requirements method, acceptance criteria, parity inventory | Method |
| Template 1, 183-185: task description and inventory schema | Output contract |
| Template 1, 186-187: completion and stop rules | Return value; Refusals; Escalation protocol |

### architecture

| Template section | Place in phase file |
| --- | --- |
| Template 2, classification 237-250: inputs, boundaries, evidence | Frontmatter input/capabilities; Method |
| Template 2, 251-253: inventory-only mode | Method; Output contract; Return value |
| Template 2, 254-261: source and design inputs, architecture procedure | Method |
| Template 2, 263-265: plan schema and handoff | Output contract |
| Template 2, 266-269: completion and refusals | Return value; Refusals; Escalation protocol |

### implement

| Template section | Place in phase file |
| --- | --- |
| Template 3, classification 38-49: backend inputs, method, validation, wiring | Frontmatter input/capabilities; Method |
| Template 3, 52-54: implementation evidence, return and refusals | Output contract; Return value; Refusals |
| Template 4, classification 106-117: automation, services, secrets, proof | Method |
| Template 4, 119-121: operations report and stop conditions | Output contract; Return value; Refusals |
| Template 5, classification 127-140: UI conventions, safe content, states, boundaries | Method |
| Template 5, 143-145: UI evidence and stop conditions | Output contract; Return value; Refusals |

### review

| Template section | Place in phase file |
| --- | --- |
| Template 6, classification 60-72: logic scope, five questions, failure hunt | Frontmatter input/capabilities; Method |
| Template 6, 74-76: findings, verdict, refusal | Output contract; Return value; Refusals |
| Template 7, classification 83-95: style questions and pattern hunt | Method |
| Template 7, 97-99: maintenance findings, verdict, refusal | Output contract; Return value; Refusals |
| Shared evidence stance, classification 28-33 | Reviewer stance |

### document-review

| Template section | Place in phase file |
| --- | --- |
| Orchestration artifact review contract: inputs, opposite-side independence, read-only review | Frontmatter; Method; Reviewer stance |
| Artifact trace, numbered findings, state and verdict | Output contract; Return value |
| Revision cap and gate handling | Refusals; Escalation protocol |

### research

| Template section | Place in phase file |
| --- | --- |
| Template 8, classification 151-162: modernization inputs, scan and ranking | Frontmatter input/capabilities; Method |
| Template 8, 163-165: opportunity schema, return and refusal | Output contract; Return value; Refusals |
| Template 9, classification 193-204: decision question, evidence and option method | Method |
| Template 9, 205-207: report schema, return and refusal | Output contract; Return value; Refusals |

## Verification

- Validator command: `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill` (PowerShell output filtered to last 30 lines). Exit 1: six mirror-missing errors for the other lane's kinds during its write. Zero errors for this lane's six kinds.
- A second locked validator run after profile adjustment exited 1 before validation: TypeScript errors TS2322 and TS2532 in `scripts/validate-orchestration-skill.ts` at lines 236, 268 and 270. A transpile-only retry also exited 1 before validation with TS5011 from the root tsconfig. These are outside this write set; the first run is the only completed content-validation result.
- Census command: `npx ts-node --transpile-only tools/role-census/check-role-census.ts`. Exit 0. Buckets: templates 68/68, skills 461/466, generated-agents 176/176, docs 116/116, test 938/938, source 201/201, other 120/120. No bucket exceeds baseline.
- Recursive comparison restricted to this lane's six relative paths: all six plugin files are byte-identical to their `.claude` copies; all have LF without CR or BOM. This is the six-file `diff -r` result: no differences.

## Decisions

- The plugin tree is authored source; each mirror was copied from plugin bytes after writing.
- The code review report uses the path named by task tracking rather than a literal role-bearing filename. This preserves the existing report destination without adding a census line.
- Artifact review uses `<artifact-stem>-review.md` and preserves revision state across rechecks.
- Tool profiles contain no disallowed entries because these six kinds require differing read tools across hosts; `permission: prompt` allows the host approval flow for deliverable writes in all six kinds; each reviewer's Refusals section keeps implementation and source files read-only.

## Proposed Removals

None. All assigned discipline was placed in the phase definitions; existing capabilities remain subject to the task's parity and approval rules.

## Clarifications Needed

None for this batch. The other lane must finish its six mirrors before the whole-skill validator can return zero.

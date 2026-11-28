# Code Logic Review — Batch B4

- **Verdict**: REVISE
- **Score**: 5/10
- **Scoring basis**: The 14 agent descriptions, 49 `SKILL.md` files (29 unique skills, 20 mirror pairs), and STE output-style compression are sound and preserve routing boundaries and rules. The score sits in the 5–6 band (real gaps) rather than 7–8 because the shared budget enforcement in `orchestrator.service.ts` and `scripts/regen-agents.mjs` emits empty `description: ""` values on overlong single tokens and whitespace-only inputs, lacks UTF-16 surrogate-pair / multi-byte safety (and any multi-byte spec coverage), and has a mid-token sentence-slice defect plus an off-by-one word drop in `capAgentDescription`. It stays above 3–4 because the core 4-phase generation pipeline, shipped agent/skill frontmatter, and STE rules are intact and passing their existing scoped checks.

## Five Logic Questions

1. **What fails when input leaves the happy path?**
   - An overlong single token (`'A'.repeat(201)`, e.g., a long URL or unbroken identifier) causes both `capAgentDescription` (`libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:98-99`) and `truncateAgentDescription` (`scripts/regen-agents.mjs:13`) to return `""`, emitting `description: ""` into agent frontmatter.
   - A whitespace-only `template.description` (e.g., `"   \n  "`) bypasses `template.description || ...` (`orchestrator.service.ts:1289-1290`), trims to `""` in `capAgentDescription`, and emits `description: ""`.
   - A dotted token straddling character 200 right after punctuation (e.g., `... v1.2.3` where `.` is at index 199) is cut mid-token as `... v1.` because `normalized.slice(0, 200)` runs before matching `/[.!?](?=\s|$)/g` (`orchestrator.service.ts:91-92`).
   - A 200-code-point description containing a supplementary-plane emoji (e.g., 199 ASCII chars + `🚀` = 201 UTF-16 code units) exceeds `MAX_AGENT_DESCRIPTION_CHARS` under `.length` and triggers premature truncation or lone-surrogate slicing.

2. **What assumptions break under failure or edge input?**
   - Both writers assume `String.prototype.length` and `.slice()` map 1:1 to characters and never split a UTF-16 surrogate pair.
   - `orchestrator.service.ts:1289-1290` assumes any truthy `template.description` remains non-empty after whitespace normalization and budgeting.
   - `scripts/regen-agents.mjs:19` assumes `\\"` unescaping can run in two sequential `.replace()` calls (`\\"` before `\\\\`) without corrupting escaped backslashes, and `:17` assumes `description:` only appears inside the leading YAML frontmatter.

3. **What boundaries are unchecked?**
   - `libs/backend/harness-sync/src/lib/targets/transformers/transform-rules.ts:197-198` (`extractFrontmatterDescription`) treats `description: ""` as `""` (not `undefined`), so `resolveAgentDescription` (`:231-241`) propagates `""` into OpenCode frontmatter and Codex TOML instead of falling back to `${agentId} agent`.
   - `orchestrator.service.ts:1292-1294` runs `.replace(/"/g, '\\"')` *after* `capAgentDescription`, which can push the serialized description past 200 chars when quotes are present, and leaves backslashes unescaped.
   - `scripts/regen-agents.mjs:10-13` has no whitespace normalization (`\s+`), no trailing-space trim on consecutive spaces (`"foo  bar"`), and no sentence-boundary preference.

4. **What requirements are missed or weakened?**
   - Batch B4 writer requirements explicitly require: **no mid-word cut, no empty description, multi-byte safe, correct for an overlong single token; specs cover it**. Current code violates "no empty description" (explicitly asserting `description: ""` in both spec files), lacks multi-byte safety and tests, and can split a dotted token at index 200.
   - In `.claude/output-styles/simplified-technical-english.md:16,29,31`, three prohibitions/strict constraints softened slightly (`Do not use` -> `Avoid` for jargon, complex verb constructions, and `-ing` forms; `Use only ... when possible` -> `Prefer`), though every rule, numeric limit, and Scope exemption remains present.

5. **What is unverified?**
   - Runtime Claude Agent SDK dispatch behavior and OpenCode/Codex CLI execution with the trimmed descriptions were not executed in this read-only review (only static files, focused Jest specs, `node --test`, TypeScript, and ESLint were run).
   - No runtime templates under `~/.ptah/templates/agents/` exist in this repository (`0` `*.template.md` files in repo); only `orchestrator.service.ts` and `scripts/regen-agents.mjs` were verified.

## Agent Descriptions (14 files)

Verified via `git diff HEAD -- .claude/agents` and frontmatter/body comparison script: for all 14 `.claude/agents/*.md` files, **only** the `description:` frontmatter line changed (`otherFmSame: true`, `bodySame: true`), and all 14 new descriptions are `<= 200` chars (136–191 chars).

| Agent | Old chars | New chars | Routing OK? | Role / trigger / sibling boundary assessment |
|---|---:|---:|---|---|
| `.claude/agents/backend-developer.md` | 610 | 142 | Yes | Keeps server-side services/APIs/persistence/background role, backend file/contract trigger, and boundary vs UI and delivery pipelines (`frontend-developer`, `devops-engineer`). |
| `.claude/agents/code-logic-reviewer.md` | 581 | 157 | Yes | Keeps behavioral bugs/unsafe boundaries/failure paths role, correctness defect trigger, and boundary vs style/architecture review (`code-style-reviewer`, `software-architect`). |
| `.claude/agents/code-style-reviewer.md` | 547 | 156 | Yes | Keeps conventions/structure/types/boundaries role, maintainability trigger, and boundary vs behavioral bug review (`code-logic-reviewer`). |
| `.claude/agents/devops-engineer.md` | 640 | 136 | Yes | Keeps builds/tests/CI/releases/containers/local services role, build/delivery trigger, and boundary vs application feature code. |
| `.claude/agents/frontend-developer.md` | 571 | 155 | Yes | Keeps UI components/state/styling/client data access role, renderer/UI file trigger, and boundary vs server code or delivery pipelines (`backend-developer`, `devops-engineer`). |
| `.claude/agents/modernization-detector.md` | 504 (500 unescaped) | 191 | Yes | Keeps deferred modernization & prioritized follow-ups role, post-batch cleanup trigger, and boundary vs implementing fixes or reviewing correctness. |
| `.claude/agents/project-manager.md` | 647 | 170 | Yes | Keeps scoped acceptance criteria/constraints role, `task-description.md` trigger, and boundary vs architecture plans, implementation, or batch coordination (`software-architect`, `team-leader`). |
| `.claude/agents/researcher-expert.md` | 548 | 160 | Yes | Keeps bounded technical questions with cited evidence/open questions role, `research-report.md` trigger, and boundary vs implementation plans or task decomposition. |
| `.claude/agents/senior-tester.md` | 567 | 163 | Yes | Keeps focused tests verifying acceptance criteria + evidence role, post-implementation coverage trigger, and boundary vs implementing features or visual review (`visual-reviewer`). |
| `.claude/agents/software-architect.md` | 783 | 165 | Yes | Keeps multi-boundary design (boundaries, contracts, data flow) role, `implementation-plan.md` trigger, and boundary vs single-file edits, batch decomposition, or coding (`team-leader`). |
| `.claude/agents/team-leader.md` | 668 | 164 | Yes | Keeps plan stress-testing, file-disjoint batches, and coordination role, `batches.md` / task fleet trigger, and boundary vs architecture design or coding (`software-architect`). |
| `.claude/agents/technical-content-writer.md` | 507 | 152 | Yes | Keeps evidence-grounded product/technical content role, docs/launch copy/scripts/case studies trigger, and boundary vs code changes or unsupported claims. |
| `.claude/agents/ui-ux-designer.md` | 506 | 177 | Yes | Keeps visual specs/design systems/handoffs role, pre-UI design direction trigger, and boundary vs implementing UI (`frontend-developer`) or reviewing rendered output (`visual-reviewer`). |
| `.claude/agents/visual-reviewer.md` | 494 | 168 | Yes | Keeps rendered UI layout/accessibility/interaction defect role, post-UI-build inspection trigger, and boundary vs design spec (`ui-ux-designer`) or source-only review. |

## Skill Descriptions and Mirrors

Scanned all 49 `SKILL.md` files (`26` under `plugins/**/skills/*/SKILL.md` and `23` under `.claude/skills/*/SKILL.md`, representing `29` unique skills: `20` mirrored plugin/workspace pairs, `6` non-mirrored plugin skills in `ptah-dotnet` and `ptah-react`, and `3` workspace-only skills `angular-developer`, `execute-phase-gated-task`, `frontend-design`):

- **Budget compliance**: 49/49 `SKILL.md` descriptions are `<= 200` chars (range `87`–`134` chars).
- **Mirror parity**: All `20/20` plugin/workspace skill pairs have byte-identical `description` strings. Bodies are identical on `19/20` pairs; `session-handoff` differs intentionally in body (per brief). Note: `.claude/skills/agent-lanes/SKILL.md`, `.claude/skills/orchestration/SKILL.md`, and `references/lane-assignment.md` also contain B3/earlier body additions, which match byte-for-byte between `.claude/skills` and `plugins/ptah-core/skills`.
- **Trigger retention**: All `29` unique skill descriptions preserve their core domain, framework/package, and action trigger words. Minor omissions (`humanize-library` drops the verb `humanize` from `description`, though `name: humanize-library` remains in the listing; `tribunal` generalizes `Council, Forge, Race, Crucible, Relay` into `Tribunal modes`) do not break routing.

## Simplified Technical English (STE) Rule-by-Rule Comparison

Compared `HEAD:.claude/output-styles/simplified-technical-english.md` (`5,199` LF chars, 205 lines) against the working tree (`.claude/output-styles/simplified-technical-english.md:1-37`, `3,311` LF chars, 37 lines).

| Rule / Limit | Baseline (`HEAD`) | Trimmed (`.claude/output-styles/simplified-technical-english.md`) | Status |
|---|---|---|---|
| Frontmatter (`name`, `description`, `keep-coding-instructions: true`) | Lines 1–5 | Lines 1–5 (identical) | Preserved |
| Purpose: ASD-STE100 Issue 9, clear and unambiguous | Lines 9–11 | Line 9 | Preserved |
| Approved dictionary words, approved meaning, approved part of speech | Lines 15–17 | Line 12 | Preserved |
| Do not replace approved word with synonym for style / one term per meaning | Lines 18, 160–164 | Line 15 (`never swap synonyms for style`) | Preserved |
| Approved technical nouns & verbs; established software terms; do not simplify if meaning changes | Lines 19, 170–184 | Line 14 (`never simplify a term if that changes its technical meaning`) | Preserved (trimmed blockchain examples) |
| Same term for same item/action/concept throughout | Line 20 | Line 15 | Preserved |
| Jargon / informal expressions prohibition | Line 21 (`Do not use jargon...`) | Line 16 (`Avoid jargon...`) | Retained (slightly softened modal: `Do not use` -> `Avoid`) |
| American English spelling | Line 22 | Line 13 | Preserved |
| Exact project command, component, field, and function names | Line 166 | Line 17 | Preserved |
| Abbreviations: helpful only, define unfamiliar before repeated use, consistent, avoid unnecessary, project-rule note | Lines 146–156 | Line 18 | Preserved |
| Short clear sentences; subject/verb/object close; one principal idea per descriptive sentence | Lines 26–27, 30 | Line 21 | Preserved |
| **20 words max** procedural sentence; **25 words max** descriptive sentence | Lines 28–29 | Line 22 (`20 words in a procedural sentence; 25 words in a descriptive sentence`) | Preserved |
| Do not omit words only to shorten; articles (`a`, `an`, `the`) when necessary; no contractions; no semicolons | Lines 31–34 | Line 23 | Preserved |
| Paragraphs: one topic, optional topic sentence for descriptive, **max 6 sentences** descriptive, gradual info, repeat key words | Lines 126–132 | Line 24 (`at most six sentences per descriptive paragraph`) | Preserved |
| Lists: vertical for complex info, numbered for sequence, bulleted otherwise, keep items short | Lines 136–142 | Line 25 | Preserved |
| Instructions: imperative, one per sentence (two only if simultaneous), `"you"` for user, important condition first | Lines 38–42 | Line 28 | Preserved (multi-line example removed) |
| Verb forms: infinitive, imperative, simple present/past/future, past participle as adjective; avoid complex forms | Lines 60–77 | Line 29 | Retained (slightly softened modal: `Use only ... when possible` -> `Prefer`; `Do not use` -> `Avoid`) |
| Active voice; passive in descriptive text only when agent is unknown | Lines 79–91 | Line 30 | Preserved |
| `-ing` verb forms forbidden except approved dictionary word, approved technical noun, or modifier in approved technical noun | Lines 95–111 | Line 31 | Retained (slightly softened modal: `Do not normally use` / `Do not create unnecessary` -> `Avoid`) |
| Multi-word nouns: **3-word max** when possible; recognized technical noun exception; full noun first then short form/abbrev | Lines 115–122 | Line 32 | Preserved |
| Scope applies to user-facing explanations, summaries, reviews, recommendations, instructions | Line 188 | Line 35 | Preserved |
| **All 11 Scope exemptions** (source code, commands, file paths, config keys, function/variable/type/protocol names, literal error messages, quoted source text, commit messages) | Lines 190–202 | Line 36 (all 11 listed) | Preserved |
| Follow `AGENTS.md`, `CLAUDE.md`, or equivalent files | Line 204 | Line 37 | Preserved |
| Technical accuracy wins over STE rule | Line 205 | Line 37 | Preserved |

## Numbered Defects

1. **[Major / High] Empty `description: ""` emitted for overlong single tokens and whitespace-only descriptions**
   - **Locations**:
     - `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:98-99` (`capAgentDescription`)
     - `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:1289-1298` (`buildAgentFileContent`)
     - `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts:773-786`
     - `scripts/regen-agents.mjs:13,16-23` (`truncateAgentDescription`, `capDescription`)
     - `scripts/regen-agents.spec.mjs:21-23`
   - **Problem**:
     - When an agent description is a single unbroken token longer than 200 characters (e.g. `'A'.repeat(201)` or a long URL), `wordBoundary` (`lastIndexOf(' ')`) is `-1`, so both `capAgentDescription` (`orchestrator.service.ts:99`) and `truncateAgentDescription` (`scripts/regen-agents.mjs:13`) return `""`, and both specs assert `""` (`description: ""`).
     - In `orchestrator.service.ts:1289-1290`, `template.description || ...` treats whitespace-only strings (`"   \n  "`) as truthy, after which `capAgentDescription` trims them to `""` and emits `description: ""`.
     - In `scripts/regen-agents.mjs:13`, leading whitespace before a 201-char token (`" " + "x".repeat(205)`) yields `boundary === 0`, so `boundary > 0` is false and it also returns `""`.
     - Downstream, `extractFrontmatterDescription` (`libs/backend/harness-sync/src/lib/targets/transformers/transform-rules.ts:197-198`) returns `""` (not `undefined`) for `description: ""`, bypassing the `${agentId} agent` fallback and writing blank descriptions to OpenCode and Codex targets.
   - **Fix**:
     - Never emit an empty `description: ""`. In `orchestrator.service.ts:1289-1298`, normalize/trim before applying the deterministic fallback (`${this.humanizeName(template.name)} agent`), and if `capAgentDescription` cannot fit a whole sentence or whole word (empty result from an unbroken overlong single token), fall back to `${this.humanizeName(template.name)} agent` (or hard-cap the single unbroken token at a safe code-point boundary `MAX_AGENT_DESCRIPTION_CHARS`) so the emitted description is always non-empty and `<= 200` chars.
     - In `scripts/regen-agents.mjs`, trim/normalize first, never return `""` for a non-empty input (either fall back to `${agentId} agent` in `capDescription` when `truncateAgentDescription` finds no word boundary, or cap a single unbroken token at 200 code points), and update both spec files to assert non-empty bounded output for overlong tokens and whitespace-only inputs.

2. **[Major / Medium] Not multi-byte / UTF-16 surrogate-pair safe, and no multi-byte spec coverage**
   - **Locations**:
     - `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:89-91`
     - `scripts/regen-agents.mjs:10-11`
     - `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts:736-786`
     - `scripts/regen-agents.spec.mjs:1-23`
   - **Problem**:
     - Both `capAgentDescription` and `truncateAgentDescription` use UTF-16 `.length` and `.slice(0, MAX)` rather than Unicode code points (`Array.from(...)`).
     - A 200-character string ending in a 2-code-unit emoji (199 ASCII chars + `🚀` = 201 UTF-16 units) exceeds `200` via `.length` and is sliced in the middle of the surrogate pair by `.slice(0, 200)`, leaving a lone high surrogate `\uD83D` in `boundedText` and unnecessarily dropping trailing content (or emitting `""`). If single-token slicing is added using `.slice(0, 200)`, it would also emit malformed lone surrogates.
     - Neither `orchestrator.service.spec.ts` nor `scripts/regen-agents.spec.mjs` contains any multi-byte / emoji test case.
   - **Fix**:
     - Convert the normalized string with `Array.from(normalized)` (or iterate code points), check `chars.length <= MAX_AGENT_DESCRIPTION_CHARS`, and perform slicing on the code-point array (`chars.slice(...).join('')`) before searching sentence/word boundaries. Add explicit multi-byte / surrogate-pair tests in both spec files.

3. **[Medium] `capAgentDescription` slices at 200 before checking sentence/word boundaries, causing mid-token cuts on dots and dropping valid 200-char boundary words**
   - **Locations**:
     - `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:91-99`
   - **Problem**:
     - `boundedText = normalized.slice(0, MAX_AGENT_DESCRIPTION_CHARS)` cuts off index `200` *before* evaluating `/[.!?](?=\s|$)/g` and `lastIndexOf(' ')`.
     - If a dotted token like `v1.2.3` straddles index 200 with `.` at index 199 and `2` at index 200, the `$` anchor in `boundedText` matches after `.`, cutting `v1.2.3` mid-token as `v1.`.
     - If a description has no sentence ending before 200 and `normalized[200] === ' '` (the last word ends cleanly at character 200), `boundedText.lastIndexOf(' ')` misses the space at index 200 and drops that entire last word unnecessarily.
   - **Fix**:
     - Slice a `MAX_AGENT_DESCRIPTION_CHARS + 1` window (`chars.slice(0, MAX_AGENT_DESCRIPTION_CHARS + 1).join('')`) when looking up `/[.!?](?=\s|$)/g` (ignoring a match whose end would be at index `MAX`, i.e., require `match.index < MAX_AGENT_DESCRIPTION_CHARS` AND followed by whitespace in the `MAX + 1` window) and when calling `lastIndexOf(' ')`. Add tests in `orchestrator.service.spec.ts` for `v1.2.3` straddling index 200 and a word ending cleanly at index 200.

4. **[Minor] `scripts/regen-agents.mjs` lacks whitespace normalization/sentence preference and has YAML unescaping/scope edge bugs**
   - **Locations**:
     - `scripts/regen-agents.mjs:9-14` (`truncateAgentDescription`)
     - `scripts/regen-agents.mjs:16-23` (`capDescription`)
     - `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:1292-1294`
   - **Problem**:
     - `truncateAgentDescription` does not collapse `\s+` or trim trailing spaces before slicing: `"role  trigger..."` with `boundary` at the second space returns `"role "` (trailing space), and tabs/newlines are not recognized as word boundaries. It also omits the sentence-boundary preference implemented in `orchestrator.service.ts`.
     - `capDescription` unescapes `\"` before `\\` (`raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\')`), does not unescape YAML single-quoted `''`, captures `\r` in CRLF plain scalars (`([^\n]*)`), and matches `^description:` anywhere in the file rather than restricting to the leading frontmatter block.
     - `orchestrator.service.ts:1292-1294` escapes `"` after `capAgentDescription` (which can push the YAML line over 200 chars if quotes are present) and does not escape `\`.
   - **Fix**:
     - Align `truncateAgentDescription` with the fixed `capAgentDescription` behavior (whitespace normalization, sentence-boundary preference, word-boundary fallback, code-point safety, non-empty fallback).
     - Scope `capDescription` to the leading `^---\r?\n...\r?\n---` block, strip `\r`, unescape YAML quotes in a single pass (`/\\(.)/g`), and escape `\` before `"` in `orchestrator.service.ts`.

## Checks run

- **Jest (`libs/backend/agent-generation`)**:
  `npx jest --config libs/backend/agent-generation/jest.config.ts --runTestsByPath libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts libs/backend/agent-generation/src/lib/services/template-storage.service.spec.ts libs/backend/agent-generation/src/lib/services/agent-recommendation.service.spec.ts --runInBand --coverage=false`
  -> **3 suites passed, 139 tests passed, 0 failed** (note: `orchestrator.service.spec.ts:773-786` passes only because it currently asserts `description: ""`).
- **Node test (`scripts/regen-agents.spec.mjs`)**:
  `node --test scripts/regen-agents.spec.mjs`
  -> **3 passed, 0 failed** (note: line 22 passes only because it asserts `''` for `'x'.repeat(201)`).
- **TypeScript (`libs/backend/agent-generation`)**:
  - `npx tsc --noEmit -p libs/backend/agent-generation/tsconfig.lib.json` -> **passed** (exit 0).
  - `ptah_get_diagnostics` on `orchestrator.service.ts` and `orchestrator.service.spec.ts` -> **0 errors, 0 warnings**.
- **ESLint**:
  - `node D:\projects\PtahCode\node_modules\eslint\bin\eslint.js scripts/regen-agents.mjs scripts/regen-agents.spec.mjs` -> **passed** (0 errors, 0 warnings).
  - `node D:\projects\PtahCode\node_modules\eslint\bin\eslint.js libs/backend/agent-generation/src/lib/services/orchestrator.service.ts libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts` -> **0 errors, 96 pre-existing warnings** (`max-lines`, `no-non-null-assertion`, pre-existing unused vars in spec).
- **Git hygiene & inventory checks**:
  - `git diff --check -- libs/backend/agent-generation scripts/regen-agents.mjs scripts/regen-agents.spec.mjs .claude/agents .claude/output-styles/simplified-technical-english.md .claude/skills plugins` -> **passed** (exit 0, no whitespace errors).
  - Node scan of all 14 `.claude/agents/*.md` and all 49 `SKILL.md` files (`plugins` + `.claude/skills`) -> **0 files > 200 chars**; **14/14** agents changed only `description:`; **20/20** mirror pairs have identical `description` values.

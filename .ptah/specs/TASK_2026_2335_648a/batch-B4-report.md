# Implementation Batch B4 report

Counts use JavaScript characters after LF normalization. Agent and skill rows count the frontmatter description value; STE and script rows count the full file. The proposed source baseline in listing-trim.md records STE as 5,198 chars; direct baseline file count is 5,199 because its trailing newline is included.

## File character counts

| File | Chars before | Chars after |
|---|---:|---:|
| `.claude/agents/backend-developer.md` | 610 | 142
| `.claude/agents/code-logic-reviewer.md` | 581 | 157
| `.claude/agents/code-style-reviewer.md` | 547 | 156
| `.claude/agents/devops-engineer.md` | 640 | 136
| `.claude/agents/frontend-developer.md` | 571 | 155
| `.claude/agents/modernization-detector.md` | 504 | 191
| `.claude/agents/project-manager.md` | 647 | 170
| `.claude/agents/researcher-expert.md` | 548 | 160
| `.claude/agents/senior-tester.md` | 567 | 163
| `.claude/agents/software-architect.md` | 783 | 165
| `.claude/agents/team-leader.md` | 668 | 164
| `.claude/agents/technical-content-writer.md` | 507 | 152
| `.claude/agents/ui-ux-designer.md` | 506 | 177
| `.claude/agents/visual-reviewer.md` | 494 | 168
| `plugins/ptah-angular/skills/angular-3d-scene-crafter/SKILL.md` | 396 | 128
| `plugins/ptah-angular/skills/angular-frontend-patterns/SKILL.md` | 399 | 97
| `plugins/ptah-angular/skills/angular-gsap-animation-crafter/SKILL.md` | 396 | 106
| `plugins/ptah-core/skills/agent-lanes/SKILL.md` | 391 | 122
| `plugins/ptah-core/skills/ddd-architecture/SKILL.md` | 286 | 128
| `plugins/ptah-core/skills/humanize-library/SKILL.md` | 269 | 121
| `plugins/ptah-core/skills/orchestration/SKILL.md` | 274 | 117
| `plugins/ptah-core/skills/ptah-surface-authoring/SKILL.md` | 367 | 119
| `plugins/ptah-core/skills/session-handoff/SKILL.md` | 262 | 124
| `plugins/ptah-core/skills/skill-creator/SKILL.md` | 226 | 118
| `plugins/ptah-core/skills/technical-content-writer/SKILL.md` | 239 | 123
| `plugins/ptah-core/skills/tribunal/SKILL.md` | 322 | 134
| `plugins/ptah-core/skills/ui-ux-designer/SKILL.md` | 307 | 129
| `plugins/ptah-dotnet/skills/dotnet-solution-architect/SKILL.md` | 321 | 128
| `plugins/ptah-dotnet/skills/dotnet-solution-initializer/SKILL.md` | 322 | 118
| `plugins/ptah-dotnet/skills/nx-dotnet-workspace/SKILL.md` | 254 | 118
| `plugins/ptah-nx-saas/skills/nestjs-backend-patterns/SKILL.md` | 253 | 124
| `plugins/ptah-nx-saas/skills/nestjs-deployment/SKILL.md` | 237 | 126
| `plugins/ptah-nx-saas/skills/nx-workspace-architect/SKILL.md` | 263 | 126
| `plugins/ptah-nx-saas/skills/resilient-nestjs-patterns/SKILL.md` | 385 | 115
| `plugins/ptah-nx-saas/skills/saas-platform-patterns/SKILL.md` | 243 | 112
| `plugins/ptah-nx-saas/skills/saas-workspace-initializer/SKILL.md` | 237 | 107
| `plugins/ptah-nx-saas/skills/webhook-architecture/SKILL.md` | 249 | 123
| `plugins/ptah-react/skills/composition-patterns/SKILL.md` | 248 | 127
| `plugins/ptah-react/skills/react-best-practices/SKILL.md` | 239 | 117
| `plugins/ptah-react/skills/react-nx-patterns/SKILL.md` | 272 | 127
| `.claude/skills/agent-lanes/SKILL.md` | 391 | 122
| `.claude/skills/angular-3d-scene-crafter/SKILL.md` | 396 | 128
| `.claude/skills/angular-developer/SKILL.md` | 472 | 87
| `.claude/skills/angular-frontend-patterns/SKILL.md` | 399 | 97
| `.claude/skills/angular-gsap-animation-crafter/SKILL.md` | 396 | 106
| `.claude/skills/ddd-architecture/SKILL.md` | 286 | 128
| `.claude/skills/execute-phase-gated-task/SKILL.md` | 346 | 133
| `.claude/skills/frontend-design/SKILL.md` | 204 | 99
| `.claude/skills/humanize-library/SKILL.md` | 269 | 121
| `.claude/skills/nestjs-backend-patterns/SKILL.md` | 253 | 124
| `.claude/skills/nestjs-deployment/SKILL.md` | 237 | 126
| `.claude/skills/nx-workspace-architect/SKILL.md` | 263 | 126
| `.claude/skills/orchestration/SKILL.md` | 274 | 117
| `.claude/skills/ptah-surface-authoring/SKILL.md` | 367 | 119
| `.claude/skills/resilient-nestjs-patterns/SKILL.md` | 385 | 115
| `.claude/skills/saas-platform-patterns/SKILL.md` | 243 | 112
| `.claude/skills/saas-workspace-initializer/SKILL.md` | 237 | 107
| `.claude/skills/session-handoff/SKILL.md` | 262 | 124
| `.claude/skills/skill-creator/SKILL.md` | 226 | 118
| `.claude/skills/technical-content-writer/SKILL.md` | 239 | 123
| `.claude/skills/tribunal/SKILL.md` | 322 | 134
| `.claude/skills/ui-ux-designer/SKILL.md` | 307 | 129
| `.claude/skills/webhook-architecture/SKILL.md` | 249 | 123
| `.claude/output-styles/simplified-technical-english.md` | 5,199 | 3,311
| `scripts/regen-agents.mjs` | 1,694 | 2,831
| `scripts/regen-agents.spec.mjs` | 0 | 824 |
## STE rule-by-rule check

Compared the proposal in listing-trim.md section C with the current style rules:

- **Vocabulary:** Keeps approved dictionary words and their approved meanings and parts of speech; prevents style-only synonym swaps; retains approved technical nouns and verbs, exact software meaning, the jargon rule, and American spelling.
- **Consistency and technical content:** Keeps one term per concept, exact project command/component/field/function names, abbreviation definition and consistency guidance, and the rule to preserve software terms when simplification changes meaning.
- **Sentences:** Keeps short clear subject/verb/object structure, one principal idea per descriptive sentence, the 20-word procedural and 25-word descriptive limits, required articles, no contractions, and no semicolons.
- **Paragraphs and lists:** Keeps one topic per paragraph, optional topic sentences, the six-sentence descriptive-paragraph limit, gradual information, repeated key terms, and short vertical lists with numbering when order matters.
- **Instructions and verbs:** Keeps imperative instructions, one action per sentence (two only for simultaneous actions), conditions before instructions, “you” for the user, the approved simple verb forms, active voice with passive only when the agent is unknown, and the -ing exceptions.
- **Nouns:** Keeps the three-word maximum where possible, the recognized technical-noun exception, and full technical noun before an approved short form or abbreviation.
- **Scope:** Keeps all 11 exemptions: source code, commands, file paths, configuration keys, function names, variable names, type names, protocol names, literal error messages, quoted source text, and commit messages. It also keeps the user-facing application scope, project-instruction precedence, and technical-accuracy override.

## Generator change

Updated scripts/regen-agents.mjs to cap descriptions at 200 characters before the Opencode and Codex transformers. Truncation uses the last preceding word boundary and never adds an ellipsis or splits a word. The generator exports the cap helper for its focused spec. Shipped agent descriptions were authored as concise role/trigger/boundary text. ContentGenerationService does not author descriptions: it treats them as template metadata; its actual file writer is outside this lane's write set. The script budget therefore covers regenerated harness agents, but template-generated Ptah agents can still exceed the budget; see Unknown.

## Focused checks

- `node --test scripts/regen-agents.spec.mjs`: **3 passed, 0 failed**.
- `node D:\projects\PtahCode\node_modules\eslint\bin\eslint.js scripts/regen-agents.mjs scripts/regen-agents.spec.mjs`: **passed** (2 files, 0 errors).
- Description-budget scan: **63 checked, 0 over 200 chars**.
- STE fixture review: output-style specs use an inline fixture for parser/frontmatter behavior; no spec compares its body with the shipped style file, so the fixture remains unchanged.

## Proposed Removals

Removed repeated examples and duplicated statements from STE Vocabulary, Instructions, Verbs, Multi-word Nouns, and Technical Content sections. No rule, limit, scope exemption, frontmatter field, or agent body was removed. The removed examples were redundant with retained rules.

## Decisions

- Kept every other agent frontmatter field and all agent bodies unchanged.
- Kept skill bodies unchanged and set plugin/workspace mirror descriptions to the same concise value.
- Left the output-style fixture unchanged because specs do not compare it to the shipped file's body.
- Did not edit the named ContentGenerationService because its generation prompt only creates sections and explicitly excludes descriptions; the relevant agent-file writer is outside this lane's write set.

## Unknown

- The pre-existing .claude/skills/session-handoff/SKILL.md body differs from plugins/ptah-core/skills/session-handoff/SKILL.md. The descriptions now match, but the files are still not byte-identical. Syncing the plugin body would overwrite distinct handoff guidance, so that remaining mirror divergence needs coordinator direction.
- The requested 200-character budget is enforced for agents regenerated by scripts/regen-agents.mjs. Whether the coordinator can expand this lane to the actual Ptah template-to-agent writer is unresolved; this lane left it untouched because it was outside the write set.
- Skill discovery found only non-invocable marketplace skills and no locally available skill invocation mechanism. The technical-content-writer skill was not loaded; its repository guidance was not changed.
## Continuation

| File | Chars before | Chars after |
|---|---:|---:|
| `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts` | 52,491 | 53,003 |
| `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts` | 94,277 | 94,745 |
| Agent template files | 0 found | 0 |

- Writer now emits at most 200 description characters. It prefers the last full sentence that fits; if none fits, it cuts at a word boundary. Whitespace is normalized before counting. A single unbroken token over budget becomes an empty description rather than a partial word.
- No `*.template.md` source files exist under `libs/backend/agent-generation` or `plugins`. The built-in source templates are retired; runtime templates are downloaded into `~/.ptah/templates/agents/`. There were no repository template descriptions to shorten.
- Jest with the library config, `--runTestsByPath`, and `--runInBand`: **3 suites passed, 139 tests passed, 0 failed** (`orchestrator.service.spec.ts`, `template-storage.service.spec.ts`, and `agent-recommendation.service.spec.ts`). A first invocation without `--config` failed while Jest resolved an unrelated workspace config; the scoped rerun passed.
- `tsc --noEmit -p libs/backend/agent-generation/tsconfig.lib.json`: **passed**.
- ESLint on the two changed TypeScript files: **0 errors, 96 warnings** (existing warnings in these long files).
- The two `session-handoff` bodies remain untouched; only their descriptions match, per coordinator decision.

## Revise round 1

| File | Chars at HEAD / before revise | Chars after revise |
|---|---:|---:|
| `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts` | 52,491 | 54,109 |
| `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts` | 94,277 | 97,515 |
| `scripts/regen-agents.mjs` | 1,694 | 4,801 |
| `scripts/regen-agents.spec.mjs` | New file | 2,538 |

### Reviewer defects -> fixes

| Defect | Fix | Implementation / spec locations |
|---|---|---|
| Empty output for whitespace-only and overlong-token descriptions | Whitespace normalizes to a safe name-based fallback; overlong single tokens are safely hard-cut at the code-point budget, never empty. | `orchestrator.service.ts:95-128,1320-1327`; specs `orchestrator.service.spec.ts:773-795`; script `regen-agents.mjs:16-41`; specs `regen-agents.spec.mjs:22-25,52-55` |
| UTF-16 slicing could split surrogate pairs and miscount descriptions | Both implementations iterate `Array.from` code points and count JSON-escaped output width. | `orchestrator.service.ts:87-90,98-105`; `regen-agents.mjs:8-13,24-31`; specs `orchestrator.service.spec.ts:797-805`, `regen-agents.spec.mjs:27-31` |
| Sentence truncation could split dotted tokens; exact-boundary word was dropped | Sentence punctuation is accepted only before whitespace/end; an already-fitting complete token is retained when whitespace lies at index 200. | `orchestrator.service.ts:109-128`; specs `orchestrator.service.spec.ts:807-823`, `regen-agents.spec.mjs:33-38` |
| Regen script mishandled whitespace, YAML escaping/quotes, CRLF, and body `description:` keys | Normalize before cap; decode quoted values in one pass (including doubled YAML single quotes); re-emit with `JSON.stringify`; edit only the description in initial frontmatter and preserve CRLF. | `regen-agents.mjs:44-69`; specs `regen-agents.spec.mjs:40-55` |

### Focused checks

- `node --test scripts/regen-agents.spec.mjs`: **7 passed, 0 failed**.
- Agent-generation Jest (`orchestrator.service.spec.ts`, `template-storage.service.spec.ts`, `agent-recommendation.service.spec.ts`, `--runInBand --coverage=false --no-watchman`): **3 suites passed, 144 tests passed, 0 failed**.
- `node D:\projects\PtahCode\node_modules\typescript\bin\tsc --noEmit -p D:\projects\PtahCode\.claude-worktrees\prompt-trim\libs\backend\agent-generation\tsconfig.lib.json`: **passed**.
- ESLint on the four changed implementation/spec files: **0 errors, 96 warnings** (warnings are pre-existing in the large TypeScript files).

### Round decisions

- The script and writer keep equivalent local budget logic; sharing a helper would require an inappropriate script-to-library or cross-library dependency.
- Only `description` in the initial frontmatter is normalized by `regen-agents.mjs`; body text is preserved. Script-generated YAML uses JSON-compatible double-quoted scalars.
- Coordinator confirmed the session-handoff bodies remain unchanged; their descriptions only need to match.

### Round unknowns

- No runtime templates are present in the repository, as noted above. Runtime-only templates under the user home directory were not available for this revise round.

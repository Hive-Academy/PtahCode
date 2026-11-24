# Code Logic Review — `TASK_2026_2306_a1d6`

Scope: `git diff HEAD~2 HEAD`, all non-spec and spec files read in full (rows, renderers, consumers, both drift specs, resolver and its spec). No test, nx or build was run. Text equality was checked by transpiling the two shared files to /tmp and comparing with `.ptah/tmp/baseline/` (read-only, temp dir removed).

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 8/10           |
| Assessment          | APPROVED       |
| Blocking issues     | 0              |
| Serious issues      | 0              |
| Moderate issues     | 4              |
| Failure modes found | 4              |

## Evidence that the behaviour-preserving claim holds

- `renderCoreSubstitutionBlock()` is a substring of the baseline `core-section.txt` (checked: `true`), same row order as the old table. The core prompt and the server instructions follow (instructions are parsed from that block; baseline instructions file shows the same 5 rows + fallback + closing).
- `renderLaneToolTable()` has 14 lines (header + 13), and after whitespace normalisation each line equals the baseline line (no diff). Only padding differs, as stated.
- Namespaces vs `buildToolDefinitions` (`effective-tool-list.ts:178,221,246`): `ide` = lsp_references, lsp_definitions, get_dirty_files (gated on `hasIDECapabilities` and `!disabled.has('ide')`); `code` = ast_analyze, context_enrich_file, get_dependents, memory_search, relevance_rank_files, project_detect_monorepo, get_symbol_index, code_search_symbols; `browser` = navigate, screenshot; `core` = workspace_analyze, search_files, get_diagnostics, grep, read_symbol, count_tokens, web_search (lines 143-149, no guard). All rows match. The drift spec tests both directions (off -> absent, only others off -> present), so it can fail.

## Five logic questions

1. Silent failure: a row cannot drop out of a rendering silently. `tool-guidance.render.ts:55,82` skip rows without a wording, but `tool-substitutions.spec.ts:30-43` forces an `omit` reason (10+ chars) or a wording, and rejects both together. The one soft spot is that an omit reason is free text and is not checked (see M3).
2. Unexpected user action: none in the runtime path; renderers are pure. A downloaded `tooling-precedence.md` with an unusual heading layout is the only odd input (M1).
3. Wrong answer from valid input: `applyAgentToolingRules` on `### Working rules` or an inline mention (M1); the generated rules contradict themselves on `git` (M2).
4. Dependency failure: the only I/O is the existing `readFile` in `template-partial-resolver.ts:316`; failure paths unchanged. `findRow` throws for an unknown tool (`render.ts:21`); called only with hard-coded names and by `withToolCue` at module build time, so a renamed constant fails loudly at startup, which is acceptable.
5. Missing: no golden test pins the generated core block text (M4); `priority` is not honoured by the server instructions (M3); the checked-in `.claude/agents/*.md` are hand copies of the old table and are not covered by any guard (outside this task).

## Failure modes

### M1 Splice is not anchored (Moderate)

- Trigger: the downloaded block contains `### Working rules`, or the string `## Working rules` inside prose or a fenced code block, or a `\n## ` inside a code fence in the section.
- Symptom: `indexOf('## Working rules')` (`render.ts:150`) matches inside `### Working rules` (leaving a stray `#` before the new heading) or mid-line; a fenced `\n## ` ends the replaced span early, leaving the tail of the old section in the agent file.
- Evidence: `tool-guidance.render.ts:150-155`. CRLF files work but come out with mixed endings (generated part LF, rest CRLF; tested by me, `\r\n` before `## Skill use` is kept). `loadBlock` then calls `body.trim()` (`template-partial-resolver.ts:208`), so a lost trailing newline when the section is last is harmless.
- Current handling: heading missing returns the text unchanged (correct); idempotent (second apply yields the same text; spec `tool-substitutions.spec.ts:195`).
- Recommendation: match a line-anchored heading (`/^## Working rules[ \t]*\r?$/m`) and the next `/^## /m`. Cheap; do it or accept as is.

### M2 Generated agent rules contradict themselves (Moderate)

- Trigger: every agent file generated from the template.
- Symptom: bullet 2 and the closing line say Bash is for "build/test/git" and "git stay native", while the table sends `git status` via Bash to `ptah_get_dirty_files` and "Build to find errors" to `ptah_get_diagnostics`. "or one Grep after zero hits. Then name the empty tool." has no antecedent for "the empty tool" (old text: "then Grep once and name the empty tool"). The old qualifier "(string literals, config keys, error messages)" is gone.
- Evidence: `tool-guidance.render.ts:130-131,142` (`FALLBACK_LINE` reused with ` Then name the empty tool.`), `tool-substitutions.ts:178-189`.
- Recommendation: word the agent bullet separately ("... or one Grep after zero hits; name the tool that returned nothing."), and drop `write, build, test and git stay native` to `write and build stay native` or limit it to non-status git. The core prompt has the same `git` overlap since before this change, so only the agent text is new.

### M3 `priority` promise is not true for the server instructions (Moderate)

- Trigger: reading the row contract.
- Symptom: `tool-substitutions.ts:61-64` says priority 1 "must appear in every size-limited rendering". Baseline instructions name only 5 tools; `ptah_code_search_symbols` and `ptah_ast_analyze` (priority 1, rows 11-12) never appear, and nothing tests it. Which rows reach Codex is decided by row order in the core table (`server-instructions.ts` keeps rows in order until 512 chars). Adding or reordering a row silently changes the instructions. `priority` is read only by the spec; `disabledNamespaces` is never passed by any consumer (plan Item 7, known).
- Also: the `ptah_browser_screenshot` omit reason ("Named in the same lane line") and the other omit reasons are strings no test verifies (`tool-substitutions.ts:310-315`).
- Recommendation: either lower these two rows to priority 2 / reword the comment to "lane policy and core prompt", or add an instructions assertion for priority-1 rows (needs a core reorder, which breaks byte-identity, so prefer the comment fix). Optionally assert that an omitted-lane row's tool appears in the lane text when the reason says "Named in".

### M4 Byte-identity is a one-off measurement (Moderate/Minor)

- Trigger: a later edit to a `why` or `insteadOf` cell.
- Symptom: baselines live in git-ignored `.ptah/tmp/baseline/`; no spec pins the full block. Existing specs pin tokens, instruction length and structure, not wording. Text edits pass review through the row table only.
- Evidence: `tool-substitutions.spec.ts:75-110` check structure and the free-text line, not the cells.
- Recommendation: optional inline snapshot of the first two rows and the fallback/callout lines in the shared spec.

## Minor

- `tool-guidance-drift.spec.ts:37-45` `SWITCHABLE_NAMESPACES` is a hand copy; a namespace added to `buildToolDefinitions` is not tested for `core` rows.
- `(d)` scanning (`:160-196`) needs 2+ lines per file and skips `libs/shared`; one stray hand-written row passes. Acceptable and stated in the spec.
- `renderLaneToolTable` with every row disabled: `Math.max()` of nothing gives `-Infinity`, `padEnd` tolerates it (header only). Not reachable today.
- Template-partial cache (`template-partial-resolver.ts:306-321`): generated text is cached under the file name, `derive` blocks bypass it, `clearCache` clears it; correct. A stale file on disk cannot leak since generation happens before `set`. The raw file is never cached, so a second call with a changed renderer needs a new process (renderer is constant; fine).

## Data flow

1. `TOOL_SUBSTITUTIONS` rows -> `renderCoreSubstitutionBlock()` -> `PTAH_MCP_SUBSTITUTION_SECTION` -> core prompt (byte-identical, OK).
2. Same section -> `buildServerInstructionsFrom` (parses table, 512 cap) -> instructions (identical, OK; M3 on which rows survive).
3. Rows -> `renderLaneToolTable()` -> `PTAH_LANE_POLICY` (padding only, OK; 3500-byte cap now `LANE_POLICY_MAX_BYTES`).
4. Rows -> `renderAgentToolingRules()` -> `applyAgentToolingRules(raw)` -> cache -> `body.trim()` into agent file (OK; M1, M2).
5. Rows -> `withToolCue` -> grep and read_symbol descriptions (OK; spec checks `startsWith(cue)`).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| One typed source generates core, lane, agent-file, cue | COMPLETE | none |
| Core prompt and instructions byte-identical | COMPLETE | verified by me against baseline; not pinned (M4) |
| Lane policy differs only by padding | COMPLETE | verified |
| Namespaces match the tool list | COMPLETE | two-sided spec |
| Instructions stay derived by parsing | COMPLETE | priority claim not true (M3) |
| Splice safe on missing heading, last section, CRLF, repeat | COMPLETE | anchoring (M1) |

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Heading missing | YES | text unchanged | none |
| Working rules is last section | YES | no tail, trailing newline dropped, then trimmed | none |
| CRLF file | YES | works | mixed line endings |
| Apply twice | YES | spec | none |
| `### Working rules` / inline mention | NO | substring match | M1 |
| Row without wording, no omit | YES | spec fails | none |
| Duplicate lane order | YES | spec fails | none |

## Verdict

- Recommendation: APPROVE (fix M2 wording and M3 comment if cheap)
- Confidence: HIGH on text equality and namespaces (checked directly); MEDIUM on runtime resolver behaviour (read, not run).
- Top risk: the new generated agent-file rules say `git` is native and also route `git status` to a ptah tool, so agents get a mixed instruction.
- A robust version would add: line-anchored heading match; separate agent fallback wording; a golden snapshot of the core block; priority-1 coverage check for the instructions or a corrected contract comment.

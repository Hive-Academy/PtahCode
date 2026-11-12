# Code logic re-review: fix round 1 (TASK_2026_1009_f898)

## Verdict

Review family: anthropic-api; implementer family: codex

APPROVED. No Blocker and no Serious finding. Two Minor notes remain. None of them blocks the merge.

Evidence: `npm run validate-skill` exits 0 (21 files, 0 errors). `npm run verify -- -t test -p @ptah-extension/lane-routing` exits 0 (Nx cache hit for the current inputs).

## Status of the first-review findings

| id | status | evidence |
|----|--------|----------|
| 1 | Fixed | Validator: exact case (heading compare is `includes`/`Map`, no `i` flag), `requiredCapabilities` in the nonempty list loop, unknown top and `toolProfile` keys rejected (`validate-orchestration-skill.ts` `validatePhase`, `topKeys` and `toolProfile` loops), duplicate heading error. Resolver: `list` has `.min(1)`, both schemas `.strict()`, duplicate throws `INVALID_SCHEMA` (`phase-definition-resolver.ts:48`). Both sides now use the same heading regex and the same gray-matter options. |
| 2 | Fixed | `maskFences` in both files. Section text is sliced from the original body (`phase-definition-resolver.ts:51-52`). The mask keeps the string length: `line.replace(/[^\r\n]/g, ' ')` keeps every character count and every line end. Two new specs cover a fenced heading in text and a fenced-only section. |
| 3 | Declined (P1-10) | No new evidence. Not raised again. |
| 4 | Partly fixed | The fence mask is applied to the active-flow gate (`validate-orchestration-skill.ts:291`). The part about B3 is open: `SKILL.md` has no `## Phase-kind flows` heading yet (count 0), so the 12-file and role checks are still off. This is by design until B3. B3 must add the heading and must make the gate fire. See N1 for a side effect. |
| 5 | Fixed | `assemble-gate.ts:328-330` appends `(excluded: candidate:rule, ...)`. The new gate spec uses one `at-limit` lane and asserts both texts. |
| 6 | Fixed | `phase-definition-resolver.ts:60-62` rejects `Reviewer stance` on a non-review kind. The validator has the same rule. A spec exists. |
| 7 | Fixed | The validator imports `PHASE_KINDS` from `libs/shared/src/lib/types/phase-contract.types`. The script runs under ts-node (validate-skill run passes). |
| 8 | Fixed | `listFiles` tests `isSymbolicLink()` before `isDirectory()`, so a symlinked directory is also an error. |

## Regression check of `maskFences`

I traced these inputs by reading the code. The validator and the resolver behave the same for each one.

- Unclosed fence: the mask covers the rest of the file. Later headings do not count. Both sides report a missing section.
- Different marker or a shorter marker inside a fence: the line is masked and the fence stays open. Correct.
- Longer closing fence, tilde fence, backtick fence: handled with marker character and length.
- Indent of 0 to 3 spaces: handled. Indent of 4 or more is not a fence. Correct per CommonMark.
- CRLF: `.` stops at `\r`, `$` matches before `\r`, and the next match is a bare `\n`. Lines are not merged. The heading regex takes an optional `\r`. Offsets stay correct.
- Slice offsets: `match.index + match[0].length` points into the original body. The length is equal after the mask, so the offsets are valid.
- Not exact CommonMark: a closing fence line with trailing text closes the fence here, and a backtick fence with a backtick in its info string opens a fence. Both sides do the same, so the files are accepted or rejected equally. Impact: nil for the 12 files (none has a fence).

Accept or reject difference, validator against resolver:

- Validator only: the retired role name check, the filename-equals-kind check, the `startsWith('---')` check. These are intended, because the validator is the CI gate.
- No input found that the resolver accepts and the validator rejects, apart from the three items above. No input found that the validator accepts and the resolver rejects.

The 12 real files in `plugins/ptah-core/skills/orchestration/phases/` pass the validator, which applies the same rules. I did not call the resolver on them.

## New findings

| id | severity | file:line | scenario | fix |
|----|----------|-----------|----------|-----|
| N1 | Minor | `scripts/validate-orchestration-skill.ts:291-296` | The retired role check reads `active[1]` from the masked text. A retired role name that sits inside a fenced example in the flow section is not reported. Before the fix round the check saw fenced text. | Find the section on the masked text, then slice the same offsets from the original `skill` for the `includes` check. |
| N2 | Minor | `scripts/validate-orchestration-skill.ts` `validatePhase` | The resolver and the validator keep two copies of `maskFences` and of the heading regex. A later change to one copy can split the two sides again. The comments name the other file, but no test links them. | Add a spec or a script test with one table of inputs (fenced, CRLF, duplicate, unknown key) for both functions. Low priority. |

## Not checked

- I did not run the resolver against the 12 real phase files. Only the validator ran on them.
- I did not run a differential test of the two parsers on generated input. The result above comes from code reading.
- The Jest run was a cache hit, so I did not see a fresh run of the new specs.
- I did not check the markdown files that another lane edits at the same time.

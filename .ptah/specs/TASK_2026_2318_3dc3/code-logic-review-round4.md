# Code logic review, round 4

**FAIL · 6/10**

The same-line accessor and class-method collision fixes match the reader's surviving ranges. The change still regresses omitted names outside the class list, and the new character guard can underestimate the size of qualified names.

## Findings

### P2 · Medium — The class lookup changes names in other cut lists

- `libs/backend/workspace-intelligence/src/ast/ast-result-format.ts:228`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:154`, `:183`, and `:239`

The formatter applies `listedName` to every cut list. For a multiline TypeScript class `Box` with a field `options = { run() {} }` on its own line, the object-literal method stays in `functions`. When that row is cut, the callback emits `Box.run` in `truncated.functions.omittedNames`, where the previous formatter listed `run`. The same change affects unclaimed methods in languages that leave methods in `functions`. Module functions and object-literal methods outside class ranges generally keep their names when the lookup runs and the reader retains their ranges. A cut row whose range is discarded during reader de-duplication now loses its name altogether.

When either guard trips, the callback suppresses every name before reaching the range-free fallback. Ordinary module functions and named exports therefore also lose their omitted names if their lists are cut and the names would otherwise fit. Below the guard, exports keep their names. Current import records carry `source` and `importedSymbols` and have no `name` for the formatter to emit. The override should apply to the `classes` list and its members. The existing function-cut test at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts:342` checks counts and retained rows and leaves `omittedNames` unasserted.

### P2 · Medium — The character guard misses cumulative enclosing names

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:121` and `:161`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:58` and `:73`

Each qualified name includes the sum of its enclosing class names. The guard multiplies the length of the longest individual name by the declaration count. A generated TypeScript file can put 12,000 short methods on distinct lines in the innermost of 20 nested classes with 400-character names. That stays below the parser's 1 MiB cap and both lookup thresholds, even counting the attached methods again in the estimate. The method names alone require roughly 96 million characters before the reader's de-duplication keys and before the formatter applies its 1,800-character cap. This work is newly incurred by AST truncation. The round 3 fix catches a single long name with enough declarations, but the intended bound also needs to account for enclosing-name accumulation.

## Round 3 follow-up

- The getter/setter and object-literal collision fixes are correct for the reported cases. The lookup includes all original functions in reader order, followed by attached methods. It indexes the retained ranges, so a discarded member with a different end line contributes to `omittedMembers` without advertising a name that reads another range. See `ast-analyze-output.ts:158` and `nav/nav-symbols.ts:72`, `:92`.
- `readerOutline` preserves declaration names, ranges, and array order. Its only function-field default is `parameters: []`, which the mapping uses for signatures. The production parser supplies parameter arrays and both tools use `ptahAPI.ast.analyze`. The copy produces the same names and de-duplication winners as the outline passed directly to the reader. See `ast-analyze-output.ts:105`, `nav/nav-symbols.ts:100`, and `libs/backend/workspace-intelligence/src/ast/ast-analysis.service.ts:476`.
- Two function-local classes named `Local` can still return a reader candidate list. Compact or overlapping same-line layouts can also produce bare names or unexpected qualifiers. Those are existing consequences of line-based qualification and the reader's ambiguity rules. The emitted names agree with the reader in those cases, and those layouts need no further change for this task. The revised hint directs the reader to class and method entries. The class table retains its fields and values, and the reader source is unchanged.

## Verification

- `git diff --check` passed and the worktree diff matched `change.diff`.
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts` passed all 25 tests. Both findings were established by source trace. The formatter spec was reviewed statically under the one-spec limit.
- Used Ptah workspace and AST inspection, with native Git and line-numbered source reads for the implementation trace. Skill discovery returned no installed matching code-review skill. Only this review artifact was written.

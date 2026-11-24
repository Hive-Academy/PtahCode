# Code logic review, round 5

**PASS-WITH-FINDINGS · 8/10**

The class and member naming fix meets the functional goal. One performance regression remains on deeply nested generated files. It does not block the fix.

## Finding

### [P2 · Medium] Account for cumulative enclosing names in the lookup guard

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:138` and `:163`

The guard multiplies the longest individual name by the declaration count. A valid TypeScript file can nest 100 classes with 900-character ASCII identifiers inside successive `make()` methods, then put 10,000 short methods on separate lines in the innermost class. The source is under 210 KiB. Each method appears in both `functions` and the class’s `methods`, giving `100 + 2 × (99 + 10,000) = 20,298` declarations for the guard. Its estimates are 2,029,800 containment comparisons and 18,268,200 characters, both below their limits. The 10,000 distinct innermost method names alone contain more than 900 million characters after qualification. The lookup builds and retains those names before the formatter applies its 1,800-character output cap. De-duplication also constructs keys containing the qualified names. See `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:58`, `:73`, and `:100`, and `libs/backend/workspace-intelligence/src/ast/ast-result-format.ts:143`.

The 1 MiB parser cap in `libs/backend/workspace-intelligence/src/ast/parser-refusal.ts:15` limits source bytes. Each enclosing identifier appears once in the source and is repeated for every enclosed method in the lookup. The reader already incurs this cost when called. The change adds it to ordinary AST truncation, even when no symbol read follows. That makes the round 4 dismissal insufficient. A bound that accounts for cumulative enclosing names would cover this case. The allocation estimate is source-traced; peak memory was not measured.

## Functional verification

- Round 4 finding 1 is fixed. The production caller registers the override under `classes` only at `ast-analyze-output.ts:241`. The formatter selects `listedName?.[key]` at `ast-result-format.ts:230` and uses the record’s own `name` when there is no callback at `:105`. Cut functions and exports therefore keep their own names, including when the class guard suppresses class names. The regression test at `ast-analyze-result.spec.ts:619` cuts an object-literal method inside `Box` plus a module helper and asserts `run,helper` at `:644`.
- Class names and member names use the reader’s line-containment rules and de-duplication winners. The parser-to-reader tests cover nested and compact layouts, including a same-line collision where the reader keeps the object-literal method. Existing reader ambiguity for identically named function-local classes remains within the scope documented in `context.md`.
- The class table uses the same shaping path and retains its fields and values. The focused spec checks the emitted header at `ast-analyze-result.spec.ts:685`. The reader has no changes in the diff.

## Checks

- The worktree `git diff` matched `change.diff` byte for byte. `git diff --check` passed.
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts` passed all 26 tests. The formatter spec was reviewed statically under the one-spec limit.
- Applied the installed Codex review-agent skill. Used Ptah workspace and AST inspection, native Git for the diff, and line-numbered source reads for the logic trace. Only this verdict file was written.

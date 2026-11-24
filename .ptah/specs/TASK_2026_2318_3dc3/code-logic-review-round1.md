# Code logic review

**Verdict — FAIL · 6/10**

The patch fixes the multiline nested-class case. A valid compact nested class still produces a member name the reader cannot resolve, and same-line siblings can change the output schema for a file containing only top-level classes.

## Findings

### [P2 · Medium] Use the reader's qualification for each omitted member

Evidence — `libs/backend/workspace-intelligence/src/ast/ast-result-format.ts:109-117`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:49-55,96-107`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.ts:165-169,184-196`.

```ts
class Outer {
  make() {
    class Inner { run() {} }
    return Inner;
  }
}
```

`Inner` and `run` both have line range 3–3. The reader qualifies the class as `Outer.Inner` but excludes `Inner` when independently qualifying `run`, because it discards every class whose line range equals the target's. If truncation lists the omitted member, the formatter emits `Outer.Inner.run`. The reader recognizes `Outer.run` or `run` and returns “No declaration” for the emitted name. The same issue occurs for a one-line top-level class and method. Use the reader's member name directly, or make both paths share column-aware containment. Update the hint at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:43-50` together with the behavior, since it currently presents the full chain as usable.

### [P2 · Medium] Preserve top-level output when sibling classes share a line

Evidence — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:101-107,153-156`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:39-55,80-88`.

```ts
class A {} class B {
  run() {}
}
```

Both classes are top-level, but `B` has line range 1–3, which strictly contains `A`'s 1–1 by the reader's line-only predicate. The patch therefore emits `outer: "B"` for `A` and adds an `outer` column even in the untruncated table. If `A` is listed as omitted, its name also changes to `B.A`. This imports the reader's existing false containment into the AST output. Derive nesting from syntax ancestry or column-aware spans and add a top-level-only regression fixture with shared lines.

### [P3 · Low] Avoid a quadratic class scan before budgeting the result

Evidence — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:96-101,150-156,179-181`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:49-55,80-89`, `libs/backend/workspace-intelligence/src/ast/parser-refusal.ts:15`.

Shaping now synchronously scans all classes for every class before the formatter can cut the list. A generated TypeScript file with 50,000 short, distinct top-level class declarations, one per line, fits the 1 MiB parser limit and triggers 2.5 billion range checks even though no class needs an `outer`. The previous class-shaping path made linear passes. A sorted containment pass or parser ancestry would avoid the all-pairs work.

## Other checks

- **Range key and deduplication.** AST extraction uses zero-based rows and distinguishes classes by name position including column. Navigation adds one to each bound and the shaper subtracts one, so the conversion is correct, including row zero. Two same-named classes in separate blocks on a single line can share `name:startLine:endLine`. With line-only containment they have the same qualification, so the surviving nav symbol supplies the same map value to both records. The key cannot distinguish their declaration identities. For the same start line and different ends, the shorter class's parent set necessarily includes the longer class and is a strict superset of the longer class's parent set. Their qualification lengths differ for equal raw names, so reader deduplication cannot drop a distinct-end row by that mechanism. Evidence — `libs/backend/workspace-intelligence/src/ast/ast-analysis.service.ts:519-533`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:49-59,63-88`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:83-107`.
- **Class expressions and function scope.** A captured variable-assigned class expression inside a method gets the expected chain when its class and method spans are distinct and containment matches syntax. A class inside a plain function with no enclosing captured class has no `outer`. A method of an uncaptured anonymous expression such as `return class { run() {} }` stays in `functions`, because membership attachment requires a captured class body. The existing `members` set and function filtering still match on raw `name:startLine:endLine`. A same-key unmatched method can still be filtered out by the existing logic if it shares a key with an attached method. Evidence — `libs/backend/workspace-intelligence/src/ast/languages/typescript.language.ts:29-44`, `libs/backend/workspace-intelligence/src/ast/class-members.ts:145-168`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:79-81,150-161`.
- **Table and consumers.** The header is built from the fields present in shown rows. A missing `outer` becomes an interior `null` or a trimmed trailing cell as appropriate, and `members` still gets its own nested table. Top-level classes with no false containment retain their previous full table. The longer hint is visible on truncated top-level responses too. The dispatcher uses the shaped result through `renderAstAnalyzeResult`; the exported formatter otherwise treats any nonempty string `outer` as a qualification prefix during cuts. I found no other production caller in the worktree. Evidence — `libs/backend/workspace-intelligence/src/ast/ast-result-format.ts:75-89,265-290`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:2891`.
- **Caps and budget fallback.** The final qualified strings go through the existing caps of 150 names plus any ellipsis and 1,800 characters including separators and the ellipsis. Longer names consume more of that allowance. If every list is empty and the output with names still fails the budget predicate, the formatter removes the names and keeps the counts. As before, the final counts-only form is returned without a second fit guarantee. Evidence — `libs/backend/workspace-intelligence/src/ast/ast-result-format.ts:62-63,131-153,186-214,231-239`.
- **Test quality.** The integration spec uses real Tree-sitter output and calls the real `handleReadSymbol` against a temporary source file, with parser setup shims and a mocked argument-error formatter. It verifies the reply header and rejects missing or ambiguous replies. The explicit `Outer3.Inner.run` and deeper names, and the formatter spec's exact output, would fail with the old behavior. The new cut uses a row-count predicate to force the case, and the fixture avoids compact ranges and shared-line siblings. The existing spec separately exercises the production budget. Evidence — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts:46-50,391-532`, `libs/backend/workspace-intelligence/src/ast/ast-result-format.spec.ts:254-276`.

## Verification

The saved diff and `git diff` match. The focused Jest run of `ast-analyze-result.spec.ts` passed all 17 tests. `git diff --check` passed. The counterexamples above were traced from the parser and reader source. No source files were edited.

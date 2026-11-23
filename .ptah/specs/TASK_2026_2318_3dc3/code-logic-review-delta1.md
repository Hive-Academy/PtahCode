# Code logic review of the lookup guard delta

**FAIL · 6/10**

## Findings

### [P2] Bound the full enclosing prefix of each qualified name

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:141`, `:145`, `:172`

The stack drops a class when a later class ends beyond it. The reader includes every class whose line range contains the target, so the dropped class can still contribute. For example, `A [0,1]` and `B [1,2]` both enclose `m [1,1]` in the valid TypeScript source `class A {\n} class B { m() {}\n}` (escaped newlines). The stack returns zero and the reader emits `A.B.m`. This can bypass the actual budget. Give the same pair of classes distinct 50,000-character identifiers and place 300 distinct short top-level function declarations between the two classes on the shared line. The guard estimates 15,100,000 characters across 302 declarations and allows the lookup. The 300 function names alone contain more than 30,000,000 characters after qualification. The generated source fits within the parser's 1 MiB limit.

Even with strictly nested ranges, the stack samples the sum before adding the current class. A lone class `A [0,2]` with `m [1,1]` therefore also gives a chain of zero and emits `A.m`. The longest individual name cannot stand in for both the method's own name and the missing innermost class name. Each enclosing class also contributes a dot, which the estimate omits. The reader predicates and separator are at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:39`, `:50`, and `:59`.

### [P2] Exclude identical target ranges from the estimate

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:133`, `:141`, `:146`

Classes with equal starts and different ends are ordered outermost first, as required for strictly nested ranges. Classes with identical starts and ends also accumulate on the stack, although the reader excludes all classes exactly matching the target range. For example, put 1,500 classes with five-character names and two uniquely named five-character methods each on one line. All 4,500 symbols have empty enclosing prefixes. The stack reports 7,495 enclosing-name characters, so the guard suppresses names at 33,750,000 estimated characters even before counting the method copies in `functions`. With those copies the work check still passes at 11,250,000 comparisons, and the base character check would pass at 37,500. The distinct qualified names would total just 22,500 characters. Identical class ranges can still all enclose a target with a strictly smaller range. Classes missing either endpoint are filtered consistently with the reader.

### [P3] Put the flat control's methods inside their owning class

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts:662`, `:677`

The flat fixture leaves all method ranges at lines 100–12,099 while attaching them to the class at lines 190,000–199,999. The reader qualifies those methods under the first two classes by range. Both assertions query class names, so they miss the malformed control and never verify a method's qualified name. The test does show that cumulative class names can suppress the lookup with the declaration count held constant. The old guard would allow both fixtures, at 4,832,040 characters and 240,400 comparisons. The fixture crosses the character threshold even when the estimate omits the innermost class, so it cannot catch that undercount.

## Complexity and production coverage

- For `n` class records and `k` ranged classes, the new helper takes O(n + k log k) time and O(k) space. Each ranged class is pushed once and popped at most once. The guard also scans all declarations once. The reader's existing class-by-declaration scan runs after the guard allows it.
- The production-budget spec at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts:740` uses the real parser, production renderer, and symbol reader. Its 1,500 outer classes each have an inner class, so the fixture exercises 3,000 class records and 3,000 methods. It verifies more than 50 emitted names, at least one qualified inner class name, and successful reads of the first six emitted names. Including method copies, the nominal guard inputs give 27,000,000 comparisons and at most 126,000 estimated characters. The test passed and covers the ordinary multiline case. Nonoverlapping multiline classes with 1,500 classes and 3,000 methods also stay comfortably within both limits with ordinary short names. The compact same-line case above is a separate regression.

## Verification

The saved delta matched the worktree diff against `1d6009d3` byte for byte. `git diff --check` passed. The focused `ast-analyze-result.spec.ts` Jest suite passed all 27 tests. The counterexamples are derived from the exact reader and guard predicates. Applied the installed Codex `review-agent` skill and used Ptah AST inspection with native line-numbered source reads.

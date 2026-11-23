# Final review of the AST lookup guard delta

**9/10 · PASS-WITH-FINDINGS**

## Findings

### [P3] Keep every method in the flat control inside its owning class

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts:665`, `:671`, `:687`

The last class spans lines 190,000–199,999, but its methods span 190,200–202,199. The reader emits `m9800` through `m11999` without a class prefix because those 2,200 methods are past the class end. The sampled `m5` is inside the range, so the assertion passes over the malformed fixture. Widen the flat intervals to fit all methods and check the last method as the boundary case.

### [P3] Make the overlap assertion sensitive to inclusive endpoints

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts:688`, `:695`, `:703`

With 302 declarations, counting even one of the two 50,000-character classes produces an estimate of 30,200,302 characters. The assertion still passes if the sweep removes a class at `endLine` and misses the shared endpoint. With 150 methods, the one-class estimate is 15,200,152 and the two-class estimate is 22,800,304. That fixture would cross the threshold only when both class names are counted.

## Guard analysis

- The upper bound holds for valid parser line ranges. For a declaration with range `[s, e]`, each reader-selected class with range `[a, b]` satisfies `a ≤ s ≤ e ≤ b`. Every selected class therefore contributes its name and one dot to the sweep total at `s`. Excluding exact matches to the declaration’s range can only shrink the reader’s prefix. The longest individual name bounds the declaration’s own name, so no valid declaration exceeds the sum. The reader’s conversion to 1-based lines preserves containment. `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:39`, `:50`, `:58`, `:64`, `:100`
- Subtracting at `endLine + 1` includes the last line. Aggregating changes for the same line preserves both classes at a shared endpoint and removes a class before a class starting on the following line is counted. The sweep and reader both exclude a class with either endpoint missing. Any ranged methods attached to that class are still seen by the reader and counted by the guard. `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:131`, `:139`, `:156` and `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:31`, `:64`, `:92`
- For `D` declarations and `K` ranged classes, the guard takes O(D + K log K) time and O(K) additional space. It sorts at most `2K` event lines and visits each event once. The existing reader still scans the classes per ranged declaration, which is quadratic when the number of classes grows with the declaration count. The existing work threshold gates those scans. The reader also sorts each declaration’s matching classes and the resulting symbols. `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:144`, `:166`, `:198` and `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:49`, `:80`, `:102`, `:113`
- The nested-versus-flat comparison does catch a return to the longest-name-only guard. Both have 12,020 declarations and 240,400 estimated comparisons. The old character estimate is 4,832,040 for both, while the sweep gives 101,593,040 for nested and 9,676,100 for flat. The nested assertion queries a class, which detects the lookup-wide suppression. Querying a nested method too would directly exercise the behavior named by the spec. `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts:647`, `:685`

## Verification

The two source diffs against `1d6009d3` match `delta.diff` byte for byte. The full worktree diff also includes the reviewed `context.md` update. `git diff --check 1d6009d3` passed, and all 27 tests in the focused `ast-analyze-result.spec.ts` Jest suite passed. Applied the Codex `review-agent` skill and used Ptah AST inspection with native line-numbered source reads. This report is the only file written.

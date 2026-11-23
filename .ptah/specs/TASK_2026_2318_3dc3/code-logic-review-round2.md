# Code logic review, round 2

**FAIL · 6/10**

### [P2 · Medium] Qualify omitted members by their own ranges

`libs/backend/workspace-intelligence/src/ast/ast-result-format.ts:136` and `libs/backend/workspace-intelligence/src/ast/ast-result-format.ts:142`

Round 1's compact-class example is fixed. If the member and its owner have identical bounds, their enclosing-class sets are identical too, including the exclusion of every class on the same range. A narrower member can instead pick up classes absent from its owner's chain.

```ts
class Host { make() { const Inner = class {
  run() {}
}; return Inner; } }
```

The parser gives both classes lines 1–3. The reader leaves both out when qualifying either class, so `Inner` has no `outer`. Both classes strictly contain the member on line 2, so the reader names it `Host.Inner.run`. The formatter emits `Inner.run`, which matches zero reader symbols. With 190 preceding one-line filler classes, the production formatter shows 173 of 192 classes and emits `Inner.run` in the cut note. A shared closing line also reproduces the problem with unequal owner ranges. In the example below the formatter emits `Host.run` and the reader names the member `Host.Inner.run`.

```ts
class Host {
  make() { const Inner = class {
    inside() {} }; return Inner; } run() {}
}
```

Use the reader's qualification for each member. The current hint also presents the full owner chain as universal, although even the working compact case can omit that owner. Reader evidence is in `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:44`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:96` and `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.ts:165`. The hint is at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:43`.

### [P2 · Medium] Keep names addressable above the 2,000-class cutoff

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:101`

Round 1's P3 performance finding is addressed. The quadratic class-to-class scan runs for at most 2,000 classes, or 4 million containment checks. The fallback introduces a correctness failure. In a real-parser fixture with 1,000 distinct `HostN` classes, each containing an `Inner` class with a multiline class body, the production formatter emits names such as `Host18.Inner` at 2,000 classes. Prepending one unrelated class triggers the cutoff and the production formatter emits `Inner`, which matches 1,000 nonadjacent classes and produces the reader's ambiguous response. A forced two-row cut also exposes `Inner.run`, which matches zero symbols because the reader still qualifies the method as `Host999.Inner.run`. The normal budget's name cap hid the member names in this fixture, while the ambiguous class names were visible. Keep the work bounded while preserving reader-compatible names, or omit name hints where the formatter cannot produce them. Reader ambiguity handling is at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.ts:199`.

### [P2 · Medium] Preserve the top-level class output for shared lines

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:131`

Round 1's finding remains open under the top-level output requirement. For `class A {} class B {\n  run() {}\n}`, the formatter emits `B.A` and `B.run`, exactly matching the reader's names. The dismissal is correct about lookup compatibility. The same real-parser run shows `outer: "B"` on the lexically top-level `A`, adding a column to its class table and changing its omitted name from `A` to `B.A`. The reader accepts raw `A` unambiguously in this fixture. Its line-only interpretation does not require this change to the top-level class output. Separately, the compact top-level member changes from `Flat.hit` to `hit`, which is the spelling the reader accepts. If top-level preservation includes previously unresolvable member names, those two requirements conflict for compact classes.

## Edge cases and regression evidence

- A one-line variable-assigned class expression inside a one-line method of a multiline `Host` emitted `Host.Inner`, `Host.make` and `Host.run`, matching the reader. Putting the whole `Host` declaration on one line emitted `Host,Inner,make,run`, also matching the reader. The rule handles the absence of an `outer` and the exclusion of several classes with exactly the target's bounds. An explicit empty `outer` is treated as absent by `libs/backend/workspace-intelligence/src/ast/ast-result-format.ts:85`.
- A synthetic member missing either bound falls through to `Owner.member`. The reader skips such a record, so that spelling has no matching symbol in an outline containing only that record. Real parser members always receive both bounds at `libs/backend/workspace-intelligence/src/ast/ast-analysis.service.ts:791`, and attachment preserves them at `libs/backend/workspace-intelligence/src/ast/class-members.ts:156`. The formatter's missing-range fixture tests generic formatting rather than reader compatibility.
- The focused Jest run passed all 18 tests in `ast-analyze-result.spec.ts`. An in-memory check against the two formatter files from `HEAD` produced `Host,Inner,Flat,Host.make,Inner.run,Flat.hit` for the equivalent compact fixture, which fails the new exact-name assertion at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts:533`. The multiline assertion at line 468 and the formatter expectations at `libs/backend/workspace-intelligence/src/ast/ast-result-format.spec.ts:276` and `:316` also require names the baseline cannot produce. No second spec file was run.
- The saved diff matched `git diff`, and `git diff --check` passed. Counterexamples used the actual parser, formatter and reader symbol mapping in in-memory probes. Reader response categories were checked against its matching logic. Source files and the reader were left untouched.

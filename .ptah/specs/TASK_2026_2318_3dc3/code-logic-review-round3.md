# Code logic review, round 3

**FAIL · 6/10**

The current lookup fixes qualification for the nested and compact layouts covered by the specs and preserves the class table schema. Same-line de-duplication can still make an emitted name ambiguous or make it return a different declaration. The work guard also leaves qualified-name allocation unbounded by its stated estimate.

## Findings

### [P2 · Medium] De-duplication can leave a ranged member without a lookup entry

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:134` and `:148`

`toNavSymbols` keeps the first symbol for each `kind:qualifiedName:startLine` key. The formatter indexes the survivors by `name:startLine:endLine`. A discarded same-start member with a different end row therefore falls through to its plain name. For example, cut both classes in this TypeScript outline:

```ts
class Box {
  get value() { return 1; } set value(v: number) {
    void v;
  }
}
class Other {
  get value() { return 2; }
}
```

Both accessors in `Box` are captured and attached by name position. They qualify as `Box.value` and start on line 2. The getter ends on line 2 and the setter ends on line 4, so the setter's lookup key is absent and the cut note includes plain `value`. The reader matches `Box.value` and `Other.value` and returns a candidate list. Suppress a cut member's name when the reader has no corresponding surviving range. Apply the same rule to cut class or member records without numeric ranges, which the reader skips.

Reader evidence is at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:31`, `:72` and `:96`, and `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.ts:166` and `:199`. Extraction evidence is at `libs/backend/workspace-intelligence/src/ast/ast-analysis.service.ts:466` and `:471`.

### [P2 · Medium] The method-only projection can keep a different declaration than the reader

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:118`

```ts
class Box {
  options = { run() {} }; run() {
    return 42;
  }
}
```

The full outline puts the object-literal method in `functions` and the class method in both `functions` and `Box.methods`. In source order both classify as `method:Box.run:2`. The full reader keeps the object method's range, line 2 alone. The projected outline drops the object method and keeps the class member spanning lines 2–4, so the cut class emits `Box.run` for the member. A read of that name returns a header ending in `method Box.run` but omits `return 42;`. Preserve the full outline's de-duplication winners when deciding whether an omitted class member is addressable. Add a parser-to-reader case that checks the returned body or range as well as the name.

The merge and first-wins key are at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:72` and `:92`. Class membership uses the method declaration's position at `libs/backend/workspace-intelligence/src/ast/class-members.ts:156`.

### [P2 · Medium] The 100 million guard counts containment scans but leaves expensive name construction below the limit

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:113` and `:204`

With `C` classes and `M` attached methods, `C × (C + M)` bounds the filter predicate calls for the projected outline. Each call also sorts the surviving parents, joins their names, and constructs a de-duplication key. The final sort adds work over the surviving symbols. The eager lookup runs before the formatter can tell whether a class list needs names at all.

A valid generated TypeScript file with one class named by a 100,000-character identifier and 5,000 distinct one-line methods fits under the parser's 1 MiB source limit. The guard sees 5,001 checks. Qualification still constructs about 500 million characters across the method names, which the lookup retains, plus the de-duplication keys. This happens before the formatter applies its 1,800-character list cap. Defer the lookup until a cut class or member needs it and bound qualification work or retained name characters in addition to the scan count.

The sort, join and key are at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts:49`, `:58`, `:73` and `:113`. The source limit is at `libs/backend/workspace-intelligence/src/ast/parser-refusal.ts:15`.

### [P2 · Medium] A surviving qualified name can still require disambiguation

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:148`

The reader's qualification omits function and block scopes. For example, two module functions can each declare a local class `Local`, with the two declarations more than two lines apart. Both qualified names are `Local`, and the reader returns candidates when given that name alone. This reader limitation predates the change, but copying qualified names alone cannot meet the name-only contract. If the reader stays unchanged, omit ambiguous names or narrow the contract explicitly. The reader matches plain names as well as qualified names and checks whether multiple matches form one declaration at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.ts:140`, `:166` and `:199`.

### [P3 · Low] The hint overstates which names are readable and how they are spelled

`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-output.ts:43`

The hint says methods follow as `Class.method` and nested members carry the outer classes. The compact fixture itself emits `Compact.ping` for a member of `Compact.Tiny` and bare `hit` for a member of `OneLine`. The direction to pass a name from any `omittedNames` also covers export records such as an interface or constant, which the reader cannot resolve by name. Describe the class and method spellings as reader-derived and scope the read instruction to the entries it applies to. See `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts:538` and `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.ts:195`.

## Other checks

- For parser-produced integer rows, the lookup key is sound as a qualification key. For a fixed class list, the raw name and range determine the enclosing classes and their ordering for either kind of record. Row zero becomes one in the reader and converts back to zero in the index. The failure is that the reader's de-duplication may remove a record before indexing. The formatter callback adds no class-table field.
- At `libs/backend/workspace-intelligence/src/ast/ast-result-format.ts:98`, an owner without a plain name still skips its entire member list, matching default behavior. A named owner whose callback returns `undefined` still allows members to be listed, and each named member counts even when its own callback returns `undefined`. The existing named-member and new all-suppressed tests cover parts of this behavior. A mixed callback test would pin down independent owner/member suppression and the nameless-owner gate.
- The small integration fixtures use the real parser, write physical files and call the real `handleReadSymbol` with injected analysis and workspace dependencies. The expected nested names and compact spellings at `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts:470` and `:521` would fail against the pre-change spellings. The production-budget fixture at `:641` catches old unqualified nested class names, but its first-six check samples owner entries because owners precede members. The small fixtures exercise methods with a forced row cut. In `libs/backend/workspace-intelligence/src/ast/ast-result-format.spec.ts:256` and `:287`, the expected custom spellings and suppression also distinguish the new behavior from the old default. The work-guard spec exercises the over-limit callback and count logic separately and leaves below-limit name construction untested.

## Verification

- The worktree `git diff` matched `change.diff`. `git diff --check` passed.
- Ran `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts`. All 23 tests passed. The new counterexamples above are source-traced. The formatter spec was reviewed statically under the one-spec limit.
- Used Ptah workspace and AST tools for initial inspection and native Git and line-numbered reads for the diff and implementation. CLI skill discovery and loading were unavailable. Only this review artifact was written.

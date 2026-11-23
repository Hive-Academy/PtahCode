# TASK_2026_2318_3dc3: nested class member names in ptah_ast_analyze

## Defect
PR #1487 made a cut `ptah_ast_analyze` list name the cut class members. A method of a nested
class was named `Inner.run`. `ptah_read_symbol` resolves `run` or `Outer.Inner.run` (chain from
enclosing class ranges, `nav/nav-symbols.ts`), so `Inner.run` did not resolve.

## Fix (design after review round 2)
Round 1 and 2 showed that the reader qualifies each name by LINE containment of classes, with every
class on the member's own lines left out. A chain built from an `outer` field and rules in the
formatter fails for some layouts. So the name comes from the reader's mapping itself.
- `workspace-intelligence/src/ast/ast-result-format.ts`: new option `listedName(record)`. It gives the
  name that `omittedNames` lists for a cut record and for each of its `members`. Default is
  unchanged (`name`, and `Record.member`). `omittedMembers` counts named members either way.
- `vscode-lm-tools/.../mcp-core/ast-analyze-output.ts`: `readerNameLookup(result)` runs `toNavSymbols`
  (the mapping `ptah_read_symbol` uses) on the class and method ranges and returns the qualified name
  by `name:startLine:endLine`. `renderAstAnalyzeResult` passes it as `listedName`. No field is added to
  any class record, so the table output does not change. Hint text changed.
- The lookup runs `toNavSymbols` on the same outline the reader sees (functions and class methods).
  A ranged record the reader dropped (it keeps one symbol per kind, qualified name and start line)
  lists no name; a record without a range (export, import) keeps its own name, as before.
- The table is built on the first name asked for, so an uncut result costs nothing.
- Work bound: classes x (classes + functions + methods) over 100 million, or longest name x
  declarations over 20 million: no names are listed and the counts stay (generated code).

## Scope and left out
- Chain is by class-range containment for every language whose class records have line ranges
  (same rule as the reader). Member attachment (`class-members.ts`) is TS/JS/TSX only, so members
  of nested classes in other languages stay in `functions` and are not named under a class.
- Reader not changed. Class expressions are captured only as `const X = class {}` (grammar
  query), so only those are nested classes in TS/JS.
- Local `main` was stale (no PR #1487); the branch was fast-forwarded to `origin/main` before work.

## Review rounds
- Round 1 (codex, FAIL 6/10): compact one-line class, same-line siblings, quadratic scan.
- Round 2 (codex, FAIL 6/10) on the `outer` design: more line-overlap layouts; the 2000-class cutoff
  gave ambiguous plain names; a top-level class could get `outer`. Answer: the design above.
  Files: `code-logic-review-round1.md`, `code-logic-review-round2.md`.
- Round 3 (codex, FAIL 6/10): getter/setter on one line, object-literal method with the class
  method's name, work bound ignored name size, local classes in functions. First three fixed.
  `Local` classes declared in two functions share one qualified name in the reader: a reader limit,
  the name still reads (the reader lists both candidates); not changed.
- Round 4 (codex, FAIL 6/10): (1) real regression: the class lookup renamed entries of other cut lists
  (`functions`): fixed, `listedName` is now per list key and the shaper serves `classes` only; spec added.
  (2) the character guard ignores the sum of enclosing class names (adversarial file: 20 nested classes
  with 400-character names and 12,000 methods; about 100 million characters at most, bounded by the
  1 MiB parser limit; the reader does the same work on every read): dismissed, no change.
- Known, by design: where the reader names a class by its line containment (`class A {} class B {` on
  one line), the emitted name is the reader's name (`B.A`). It resolves; the plain name resolves too.

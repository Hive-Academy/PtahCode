# Code Logic Review r5 — TASK_2026_2299_d6f5 (uncommitted changes)

| Metric | Value |
| --- | --- |
| Overall score | 6.5/10 |
| Assessment | NEEDS_REVISION |
| Blocking | 0 |
| Serious | 2 |
| Moderate | 5 |

Scope: all four groups read in full (grep-engine.ts, grep.ts, grep.limits.ts, class-members.ts, ast-analysis.service.ts hunks, ast-analyze-output.ts, ast-result-format.ts, language queries, code-symbol-indexer hunk, embed-batches.ts, embedder-worker.ts). No tests were run (the main agent runs the full checks).

## Serious

### S1. Regex inference turns common literal code searches into match-everything or wrong-answer searches
- File: `nav/grep-engine.ts:112-143` (`REGEX_SYNTAX[0]`, `inferRegexMode`), used at `nav/grep.ts` (`args.regex ?? regexInferred`).
- Scenario: the alternation rule `/(?<!\\)\|/` fires on any unescaped `|`, then `new RegExp(pattern)` succeeds, so the call runs in regex mode.
  - `x || y` becomes `x |` or ` y` with an empty alternative, which matches every line of every file. The result is a capped list of unrelated lines.
  - `string | null`, `a | b` (TS unions, shell pipes, markdown tables) match lines containing either half.
  - `C:\dir\sub` hits `\d`/`\s`, compiles, and the literal path is never found.
- Impact: a silent wrong answer, not an error. Only the small header note `(pattern read as regex ...)` signals it. The 0-match hint is added only when nothing matches, and here something always matches. Before the change, the literal search worked.
- Fix: require stronger evidence for `|`. For example, fire only when no whitespace surrounds the `|`, or the pattern has no `||`, or every alternative is non-empty and the pattern has no spaces around `|`. Treat `\d`/`\s` rules as regex only when the pattern contains no path separators or drive prefix. Alternatively, when inferred, run literal and regex and prefer the literal if it finds a match.

### S2. An inferred pattern that compiles in JS may be rejected by the rg engine
- File: `nav/grep-engine.ts:121-137`, rg args at `:401-408` (no `-P`/`--pcre2`).
- Scenario: `(?=`, `(?!`, `(?<!` and `(?<=` are listed as regex signals and pass the JS `RegExp` check. rg's default Rust engine rejects lookaround, so the call fails (the "fail closed on rg errors" path). The caller never asked for regex. git grep uses `-P`, so this fails only on the rg path.
- Impact: an error on a request that previously returned literal results. The inference also does not guarantee that the chosen engine accepts the syntax.
- Fix: drop the lookaround signal from inference, or retry as a literal search when the engine reports a regex parse error under an inferred mode.

## Moderate

- M1. `nav/grep.ts` `planInlineBodies`/`renderBody`: bodies are keyed by innermost symbol, so two matches can give a class body (match in a field or header) and a method body inside it.
  - The method's lines are then printed twice, and both copies consume `budget`.
  - The window's line count excludes the marker and `…` lines, so the total can exceed 150 by a few lines.
- M2. `nav/grep.ts` renderBody: a match line is shown from the re-read file (`fileLines`) rather than the engine's `match.text`. If the file changed between the engine run and the read, or splits lines differently (a lone `\r` or form feed), a body line can differ from the matched text.
  - The `|`/`-` marking is by line number only.
  - `readLines` splits on `\r?\n`, so line numbers stay consistent with rg in the common case.
- M3. `ast-analyze-output.ts:78-111` with `ast-result-format.ts`: methods now live in `classes[].members`. Budget truncation cuts `functions` first, then later lists as whole records, and never cuts inside a class.
  - A huge class can keep the output over budget, or be dropped whole when classes are cut. The dropped class's methods are then missing from both `functions` and `members`. `omittedNames` names only the class.
  - Confirm that the class-cut path lists names.
- M4. `workspace-intelligence/src/services/code-symbol-indexer.service.ts:1514-1558`: for every TS/JS method the `method Class.name` chunk is now skipped, because `functions` carries the same name and start line.
  - This is a semantic-search regression. The class-qualified chunk text (`Class.method`) is never embedded, and the function chunk has only the bare name.
  - Consider keeping the qualified chunk and dropping the bare function chunk for members instead, or including the class name in the function chunk.
  - Before this change TS `cls.methods` was empty, so this is not a duplicate-removal gain but a lost-qualification trade.
- M5. Methods with a string or computed name (`'a-b'() {}`, `[Symbol.iterator]() {}`) and abstract signatures are not matched by `JS_TS_FUNCTION_QUERY`. They appear in neither `functions` nor `members`. This predates the change, but `class-members.ts` now implies completeness of `members`.

## Minor
- `nav/grep-engine.ts:~390`: the `degradation-audit` marker was removed from the `isGitWorkTree` callback. It is a callback, not a catch, so this is probably right. Confirm that the audit script does not flag it.
- `embed-batches.ts` is correct: shape checks cover total, last dim and first dim (`rows`), and a mismatch throws. A 1-D tensor with `rows > 1` throws. Batch padding with mean pooling is masked, so values stay equivalent up to q8 numeric noise. An empty input returns `[]`. No finding.

## Checked and found sound
- `bodyWindow` (`grep.ts:176-207`):
  - The window always contains every match line. `first >= start` because `lastMatch > start+max-1` gives `A > start`; `last <= end` because `first <= end-max+1` or `first = A` with `last = lastMatch`. The full-fit, head-cut and tail-cut branches all hold.
  - `lastMatch - firstMatch + 1 > maxLines` returns undefined, so those matches fall back to the plain list.
  - A zero or negative budget hits the `maxLines < 1` guard. `end` is clamped to the file length.
  - Empty symbols or lines (a failed `loadSymbols` or `readLines`) give an undefined window and the plain list.
- The footer count `^ {2}\d+\| ` still counts body match lines, and `renderBody` keeps `| ` on empty match lines.
- `class-members.ts` attachment:
  - It is keyed by exact `row:col` of the method node to the brace of its own `class_body`. Nested classes, object-literal methods inside methods, same-line methods and getter/setter pairs are all handled. An anonymous class gets no attachment, and its methods stay in `functions`.
  - `rangeKey` filtering removes only members, because the members are copies of the same `FunctionInfo`.
- `nav-symbols.ts` merges `functions` with `classes[].methods`; dedup by `kind:qualifiedName:startLine` is unaffected by the double listing.

## Five logic questions (brief)
1. Silent failure: S1 (a wrong-answer search flagged only by a header note); M3 (methods lost when classes are truncated).
2. User action: `x || y`, TS unions, Windows paths with `\d`/`\s` (S1).
3. Input data: `||` gives a match-all regex; see S1.
4. Dependency failure: the rg engine rejects lookaround (S2). Symbol or file read failure falls back to the plain list (OK).
5. Missing: no literal-fallback when an inferred regex fails or floods; no overlap handling of nested bodies (M1).

## Verdict
REVISE. Confidence: MEDIUM-HIGH. Top risk: regex inference misfiring on `|`.

## Disposition (coordinator, 2026-11-22)

- Serious, alternation floods: FIXED. `alternativesAreWords` in grep-engine.ts keeps a pattern
  literal when an alternative is empty or has edge spaces (`x || y`, `|a`, `A | B`). Specs added.
- Serious, lookaround / back-reference: FIXED. `REGEX_BLOCKERS` keeps `(?=`, `(?!`, `(?<=`,
  `(?<!`, `\1` and Windows paths (`C:\`) literal. `(?<` was removed from `REGEX_SYNTAX`. Specs added.
- Moderate, overlapping bodies: FIXED. planInlineBodies merges a declaration nested in another
  matched declaration into the outer group. Spec added.
- Moderate, indexer skips `method Class.name` text: ACCEPTED. It is the behavior before this
  branch (TS/JS methods were indexed only as bare-name `function` rows). The exact-name search
  needs the bare name. Spec pins one row per method.
- Moderate, class truncation drops members without naming them: OPEN, recorded for a later round.
- Moderate, string/computed method names: pre-existing, out of scope.
- Moderate, body lines re-read from disk: ACCEPTED. The engine match text is one line only. A
  file changed between the search and the read gives a body from the newer file.

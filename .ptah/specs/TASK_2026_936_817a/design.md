# Design: structured triage + renderer-owned walkthrough comment

## Principle

The model returns **data** (`out/triage.json`). The renderer owns layout, escaping, size and the mermaid syntax.
Deterministic facts (head, scope, size, lens status, finding counts) come from code, not from the model.
The model no longer writes markdown and no longer echoes scope fields.

## Removed (no reader, no human value)

- `Risk map` per-file table (path / risk / contract+security signal / note): nobody reads it; it repeats the diff.
- The "Incremental scope" bullet with raw `previousReviewedHeadSha: null`, `dependentPaths: []`, `recheckFailureIds: []`.
  Agents get these from SQLite and `IncrementalScope` (see investigation.md). Humans get "initial" or "incremental,
  `abc1234…def5678`". Non-empty values go to a collapsed "Reviewer data" block (diagnostics only, capped).
- The three-heading contract ("Observed behavior" / "Inferred risks" / "Risk map") and its regex check.
- Full file paths in prose. Paths appear only as counts in the Changes table and capped code spans in collapsed sections.
- Not added, because the data does not exist: review duration and cost (`Usage: unavailable` in the review body).

## Triage schema (`TriageOutputSchema`, Zod, strict, schemaVersion 1)

```
summary      string 1..400          1-2 plain sentences: what the PR does
changeType   feature|fix|refactor|docs|test|chore|mixed
risk         { level: low|medium|high, reason: string 1..160 }
areas[1..10] { name 1..60, paths: string[0..20] (repo-relative, no ..), summary 1..200, details: string[0..4] each 1..240 }
risks[0..8]  { title 1..100, detail 1..300, verify 1..200 }          what to check by hand
apiChanges[0..10] { symbol 1..100, change: added|changed|removed, impact 1..200, callers: string[0..5] each 1..120 }
tests        { summary 1..240, gaps: string[0..5] each 1..160 }
diagram?     { title 1..80, participants[2..8] { id 1..40, label 1..40 }, steps[1..16] { from, to, label 1..80 } }
```

Mermaid: the model gives participants and steps only. The renderer emits `sequenceDiagram` with its own ids
(`P1..P8`), strips everything except letters, digits, space and `_ - . / ( ) : ,` from labels, and drops steps that
reference unknown participants. The diagram is dropped when fewer than 2 participants or 1 step remain.

## Layout (renderer output)

```
## PtahCode review · [`1aeafd4`](commit url)

<summary sentence(s)>

| | |
| --- | --- |
| **State** | ✅ Complete · 4 of 4 lenses ran      or      ⚠️ Partial · 1 of 4 lenses unavailable (contracts-callers: deadline) |
| **Scope** | Initial review of the full PR     or     Incremental · [`abc1234…1aeafd4`](compare url) · 3 new commits' files |
| **Size** | 17 files · +640 −48 · feature |
| **Risk** | 🟡 Medium · removes a public input of an exported directive |
| **Findings** | 2 verified (🟡 2 minor) · 0 held locally · 1 dismissed |

### Changes
| Area | Files | What changed |
| --- | ---: | --- |
| Button directive | 3 | Removes deprecated `iconOnly` input ... |
(max 10 rows, then "+N more areas")

[optional ```mermaid sequenceDiagram``` under "### Flow" - only when diagram present]

<details><summary>Walkthrough by area</summary> ... </details>
<details><summary>Risks and what to verify (N)</summary> ... </details>
<details><summary>API and contract changes (N)</summary> ... </details>
<details><summary>Test coverage of this change</summary> ... </details>
<details><summary>Reviewer data</summary> ... only when scope is incremental ... </details>

<sub>Updated for the reviewed head only. The inline review below lists findings.</sub>
```

State rules: **Complete** when every selected lens completed; **Partial** otherwise, naming each unavailable lens with its
reason. When triage fell back to legacy text, the top block still renders from deterministic data and the legacy text is
shown in a collapsed "Walkthrough (earlier format)" section, truncated.
Findings: verified = published inline findings plus findings held by the inline cap (cap overflow is counted as
"held locally", like today's review body); dismissed = verifier did not accept or disproved. Severity icons: 🔴 critical,
🟠 major, 🟡 minor, ⚪ nitpick. Zero findings renders "No verified findings".

## Size budget (enforced in the renderer, `walkthrough-budget.ts`)

| Part | Budget (characters) |
| --- | ---: |
| Top block (title through Findings row) | ≤ 1,500 |
| Whole comment before the GitHub marker suffix | ≤ 6,000 |
| Changes table | ≤ 10 rows, ≤ 160 chars per "what changed" |
| Each `<details>` section | ≤ 1,400 |
| GitHub hard limit (unchanged, `boundedBody`) | 65,536 |

Truncation order when the whole exceeds 6,000 (stop at the first step that fits):
1. cut "Reviewer data" → 2. cut Test coverage → 3. keep only titles in Walkthrough by area → 4. drop `callers` and
`impact` text of API changes → 5. keep top 4 risks → 6. drop the diagram → 7. keep 6 Changes rows →
8. drop all `<details>` and append "Details omitted (size budget)". The top block and Changes table are never removed;
if the top block alone exceeds 1,500, the summary is cut to 200 chars, then the risk reason to 80.
Every cut string ends with `…`; every omitted list ends with `+N more`. Output never splits a code fence or details tag
(sections are built whole and dropped whole).

## Markers and safety (unchanged contracts)

- The adapter keeps appending `<!-- ptah-review:walkthrough -->` (`boundedBody`). The renderer never emits it, never
  starts the body with `<!-- ptah-review:progress -->`, and escapes every model string with `safeText` + `escapeText`.
- All model text is escaped once (HTML, markdown specials, pipes in table cells, newlines folded). Code spans use a safe
  fence helper. Paths in spans are capped to 80 chars with a leading `…`.
- Backward compatibility: old attempts have `out/walkthrough.md` only. `readTriage` returns `{ kind: 'legacy', text }` for
  them, so they still render (dry-run preview and export) and republish.

## Code plan

| File | Change |
| --- | --- |
| `review-core/src/lib/publication/walkthrough/triage-output.schema.ts` | new: Zod schema + `parseTriageOutput` |
| `.../walkthrough/walkthrough.renderer.ts` (+ `walkthrough-sections.ts`, `walkthrough-budget.ts`, `mermaid-sequence.ts`, `diff-stats.ts`) | new: pure renderer |
| `lanes/prompts/triage.prompt.ts` | model writes `out/triage.json` (schema in prompt), no markdown |
| `lanes/review-lane.runner.ts` | triage validation: valid `triage.json` OR legacy headings |
| `lanes/review-artifact.writer.ts` | `readTriage(outRoot)`; preview uses rendered string |
| `stages/publication-stage.runner.ts`, `publication/review-publication.service.ts` | render with deterministic facts, pass string on |
| `apps/ptah-electron/src/services/review/review-lane-files.ts` | allow reading/clearing `triage.json` |
| specs | renderer spec (small, large, incremental, partial, zero findings, budget), schema spec, runner and prompt specs |

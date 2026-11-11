# Investigation: PtahCode "PR Triage & Walkthrough" comment

Paths are relative to the worktree root. Live GitHub data and CodeRabbit structure are in `investigation-github.md`.

## 1. Where the comment is produced

- Producer: the **triage lane** (`kind: 'triage'`). Prompt: `libs/backend/review-core/src/lib/lanes/prompts/triage.prompt.ts:3-9`.
  The lane writes two files: `out/lane-output.json` (`findings: []` + `coverage`, parsed by `ReviewOutputParser.parseLens`,
  `lanes/review-lane.runner.ts:109-112`) and **`out/walkthrough.md`, free model-written markdown** (prompt line 6).
- Validation of the walkthrough: only 3 heading regexes "Observed behavior", "Inferred risks", "Risk map"
  (`review-lane.runner.ts:118-124`). No schema, no size limit (cap 200,000 in `lanes/review-artifact.writer.ts:14`).
- Rendering: **there is none.** The model's markdown is published verbatim. `readWalkthrough` reads the file
  (`review-artifact.writer.ts:123-131`), `publication-stage.runner.ts:60` passes it on, `review-publication.service.ts:126`
  applies `safeText` (redaction only) and `publication-outbox.service.ts:46-52,83-89` hands it to the adapter.
  The only layout code is `renderSummary` (review body) and `renderInline` (inline comments) in
  `publication/review-markdown.renderer.ts:31-79`. They do not touch the walkthrough.
- Publisher: `libs/backend/review-github/src/lib/github-review-publication.adapter.ts`.
  `ownWalkthrough` (155-167) pages through the bot's own issue comments and finds the one containing
  `<!-- ptah-review:walkthrough -->` (line 13). `publish` (200-227) then PATCHes it (or POSTs the first time).
  So: **one summary comment per PR, updated in place, not one per head.** Body goes through
  `boundedBody(walkthrough, [marker])` (`github-body-budget.ts:22-44`, limit 65,536) which appends the marker.
  `updateProgress` (184-198) prefixes `<!-- ptah-review:progress -->...` to the same comment during a run;
  the final publish replaces the whole body.
- Separate findings summary: yes. A **PR review** per head (`## PtahCode review · <sha12>`: lens table, counts,
  "held locally", low-severity `<details>`, run metadata with `Usage: unavailable`) built by `renderSummary`
  (`review-markdown.renderer.ts:59-79`), marker `<!-- ptah-review:head:<sha> -->`
  (`publication-outbox.service.ts:57`). Inline findings are separate review comments with
  `<!-- ptah-review:finding:<id> -->` (`publication/publication-text.ts:23`).
- The 14.7k text is therefore model prose, one shot. The "Incremental scope" bullet and its raw field names come from
  the prompt asking the model to echo the deterministic evidence JSON (`context-stage.runner.ts:127`).

## 2. Who consumes it

| Data | Producer | Consumer | Evidence |
| --- | --- | --- | --- |
| `walkthrough.md` text | triage lane | (a) heading check, (b) dry-run preview + export artifact files, (c) GitHub comment for humans | `review-lane.runner.ts:118-124`; `review-artifact.writer.ts:93`; `publication-stage.runner.ts:60-76` |
| walkthrough text -> other lenses | - | **nobody**: lens stage never reads triage output (`lens-stage.runner.ts` has no triage reference); lens prompts have no walkthrough | grep over `review-core/src` finds `walkthrough` only in the files above |
| walkthrough text -> verification | - | **nobody**: verification gets findings, not triage text | same grep |
| GitHub comment body read back | - | **only** `ownWalkthrough`: `body.includes('<!-- ptah-review:walkthrough -->')` among own comments (`publication adapter:162`) and the `progress` prefix strip regex (`:188`). No agent reads the text | `context-stage.runner.ts:126` sets `comments: ''` for every lane, so no lens sees any PR comment, including its own |
| `previousReviewedHeadSha` | **code**: `repository.getLastReviewedHead` (SQLite) | `IncrementalScopeService.plan`, `publishNewVerifiedRootsOnly` | `context-stage.runner.ts:102,113`; `incremental-scope.service.ts:34-36` |
| `dependentPaths`, `changedPaths` | code (`context.callers`, diff) | publication suppress rule `outside-incremental-scope` | `review-publication.service.ts:97-102` |
| `recheckFailureIds` | code (`repository.getOpenFailures`) | verification recheck + follow-up "addressed" | `review-publication.service.ts:56-70` |
| scope JSON | code | all lanes as `deterministicEvidence` input | `context-stage.runner.ts:127` |
| Electron review UI | - | does not parse walkthrough or markers; detail view shows a fixed string "Walkthrough preview unavailable." | `libs/frontend/review-runs-ui/.../review-run-detail.component.ts:73` |
| GitHub status sync | `review-status-coordinator.service.ts:120` | writes `record.description` as the progress prefix; never reads the body | `review-status.port.ts:36,62` |

Plain statement: **agents use the structured data (SQLite last-reviewed head, open failures, `IncrementalScope`, the diff and
`deterministicEvidence`). The walkthrough text is used by nobody except humans on GitHub and the dry-run/export files.
The only machine reads of the comment are the marker lookup for the PATCH and the `progress` prefix strip.**
The prose fields `previousReviewedHeadSha: null`, `dependentPaths: []`, `recheckFailureIds: []` are echoes of data the code
already holds; they have no reader and no human value in that form.

Per triage section:

| Section | Reader | Verdict |
| --- | --- | --- |
| Reviewed head, size/risk bullet | human | keep, move to status table (deterministic where possible) |
| Incremental scope bullet with raw fields | human only | replace by "scope + commit range"; raw fields to collapsed "Reviewer data" only when non-empty |
| Observed behavior (nested bullets, paths) | human | keep shortened as per-area walkthrough, collapsed |
| Likely consumers / unchanged callers | human | keep inside API changes, short |
| Inferred risks | human | keep as "Risks and what to verify", collapsed |
| Risk map table (path / risk / signals / note per file) | nobody (heading regex only) | **remove**: duplicates the diff; replaced by the area table |

## 3. Constraints found (markers and readers to preserve)

- `<!-- ptah-review:walkthrough -->` appended by the adapter (not the renderer). `ownWalkthrough` and its spec depend on it.
- `<!-- ptah-review:progress -->` first-line prefix: the renderer output must not start with that marker and the body
  must stay valid after `^<!-- ptah-review:progress -->[^\n]*\n\n` is prepended.
- `safeText` / `escapeText` neutralize forged `ptah-review:finding:` and `ptah-review-triage:` markers; structured
  text must still pass through them. Secrets redaction applies to the final body (`review-publication.service.ts:126`).
- Old stored attempts keep `out/walkthrough.md`; the preview/export writers take a string. Keep a legacy path.
- `ReviewPreviewInput.walkthrough` is a string with max 200,000 (`review-artifact.writer.ts:14`).
- Data available at publish time for a deterministic top block: claim (head, repo, PR), `runRows` (lens, family, status),
  `scope` (previous head, changed/dependent paths, recheck ids), verdict counts per severity, suppressed list, the diff.
  **Not available: duration and cost** (the review body says `Usage: unavailable`), so they are omitted, not invented.

## 4. What the earlier tasks already did (do not repeat)

- f617b1e88 "render rich review markdown": `renderSummary`/`renderInline` (lens table, collapsed low-severity list,
  evidence links, suggestion blocks, collapsed AI prompt). Applies to the review body and inline comments only.
- d7327e490: redact before escape; keep markers whole. 887ab9c44: keep publish alive on oversized bodies
  (`boundedBody` minimal fallback). Earlier: durable outbox and identity. None of them changed the walkthrough, which stays
  free model prose.

## 5. Existing renderer tests

`publication/review-markdown.renderer.spec.ts` (renderInline links/escape/redaction; renderSummary lens counts),
`publication-text.spec.ts`, `github-body-budget.spec.ts`, `github-review-publication.adapter.spec.ts` (marker, PATCH,
bounded walkthrough), `lanes/prompts/review-prompts.spec.ts` (triage prompt contract), `lanes/review-lane.runner.spec.ts`
(triage headings), `stages/publication-stage.runner.spec.ts`, `review-publication.service.spec.ts`.
No snapshot tests on walkthrough content.

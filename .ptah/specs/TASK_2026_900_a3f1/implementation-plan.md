# Implementation plan — rich PtahCode GitHub reviews

## Codebase evidence

| Evidence | Architectural consequence |
| --- | --- |
| `libs/backend/review-contracts/src/lib/review-finding.schema.ts:20-53` defines evidence path, line, excerpt, severity, `suggestedDiff`, and `fixPrompt`. | Render from the validated finding; no new model field is needed. |
| `libs/backend/review-core/src/lib/publication/review-publication.service.ts:12-19,108-132` redacts text, ranks findings, builds plain bodies, and selects at most ten RIGHT-side anchors. | Put presentation at the publication boundary after redaction; preserve selection and safety. |
| `libs/backend/review-github/src/lib/github-review-publication.adapter.ts:11-13,145-203` owns walkthrough upsert, review submission, marker dedupe, and anchor fallback. | Preserve the marker protocol and existing GitHub mutation path. |
| `libs/backend/review-contracts/src/lib/github-review.port.ts:47-52` and `libs/backend/review-github/src/di/registration.ts:1-9` show contracts and registered adapters. | Keep GitHub I/O in review-github; keep the core independent of new adapter APIs. |
| `libs/backend/review-core/src/lib/stages/lens-stage.runner.ts:16-23,30-55` stores lens and family results; `libs/backend/review-core/src/lib/stages/publication-stage.runner.ts:65-77` assembles selected lens metadata but currently passes none to publication. | Extend the publication call with typed run metadata; do not fabricate a six-lens count. |

## Architecture decision

**Chosen:** Add a pure review Markdown renderer in review-core, called by `ReviewPublicationService`; pass rendered strings through the existing outbox and publication adapter. Extend the existing GitHub adapter only for size validation and safe fallback. No new library or dependency edge. Replace the current plain body assembly in place (`review-publication.service.ts:113-132`). The existing `rightAnchorKey` import from review-github (`review-publication.service.ts:4`) is a pre-existing reverse dependency; move that pure key into review-contracts and use it from both libraries during this task, avoiding a core → GitHub edge. Rejected: building HTML in the GitHub adapter, because the adapter lacks the typed finding and run metadata. Rejected: parallel V2 publication flow, because existing marker and outbox dedupe already own publication.

## Component specifications

### Markdown renderer

- **Responsibility:** deterministic inline and summary Markdown from typed, already redacted review input.
- **Contract:** `ReviewFindingSchema` fields (`review-finding.schema.ts:20-59`); existing `PublicationInlineComment` body (`github-review-publication.adapter.ts:29-43`). Keep `<!-- ptah-review:finding:<id> -->` verbatim at the publication adapter's insertion point (`github-review-publication.adapter.ts:187-190`).
- **Behavior:** severity emoji plus label; one-line escaped title; distinct impact line from `affectedBehavior`; evidence links to `https://github.com/<owner>/<repo>/blob/<headSha>/<encoded path>#L<line>` and escaped excerpts; valid single-hunk concrete `suggestedDiff` only as a GitHub `suggestion` fence; collapsed `<details><summary>Prompt for AI agents</summary>` with escaped prompt. Use a plain proposed-fix section if a diff cannot be safely translated into an inline replacement. Escape Markdown, table delimiters, HTML and fences from model text while preserving intentional renderer markup. Summary has one row per actual lens/run result with lens, family, severity counts and verdict; low-severity findings and run metadata in separate details sections. No invented usage numbers: show recorded usage only, otherwise “unavailable”.
- **Failure:** malformed suggestion or missing anchor yields plain explanation, never an unsafe suggestion; invalid paths/SHAs fail Zod at the boundary. Truncation retains title, impact, required finding marker, and a clear omitted-count line; use Unicode-safe character accounting and byte guard below 65,536 characters for each GitHub body. Do not split inside a marker, link, fence, table row, or details tag.
- **Verification seam:** focused renderer spec for links/escaping, suggestion eligibility, details, severity table, multibyte length, and retained marker.
- **Files:** CREATE `libs/backend/review-core/src/lib/publication/review-markdown.renderer.ts`, `libs/backend/review-core/src/lib/publication/review-markdown.renderer.spec.ts`; MODIFY `libs/backend/review-core/src/lib/publication/review-publication.service.ts`, `libs/backend/review-core/src/lib/stages/publication-stage.runner.ts`, `libs/backend/review-contracts/src/lib/github-review.port.ts`, `libs/backend/review-contracts/src/index.ts` for the shared pure anchor key and metadata handoff.

### Publication adapter safeguards

- **Responsibility:** enforce the GitHub body budget at each outbound POST/PATCH and preserve dedupe.
- **Contract:** existing marker and 422 anchor fallback (`github-review-publication.adapter.ts:165-203`); typed error and rate-limit handling (`github-review-publication.adapter.ts:94-115`).
- **Behavior:** apply the renderer's bounded output independently to walkthrough, review overview, fallback review, and every inline body. Keep head and finding markers outside optional content. Check final assembled body, including markers and fallback text, before sending; reduce optional content deterministically if it exceeds 65,536 characters.
- **Failure:** a body that cannot fit required markers fails locally with a typed publication error; GitHub API, permission, rate-limit and timeout errors retain current typed behavior. The 422 retry must also pass the size guard. Missing token continues to block writes (`github-review-publication.adapter.ts:149-150`).
- **Verification seam:** existing publication adapter spec extended for oversized body, 422 fallback, exact marker dedupe, and no secret leakage.
- **Files:** MODIFY `libs/backend/review-github/src/lib/github-review-publication.adapter.ts`, `libs/backend/review-github/src/lib/github-review-publication.adapter.spec.ts`.

## Integration architecture

Validated finding and persisted lane result → redaction/selection in ReviewPublicationService → pure Markdown renderer → outbox → existing GitHub publication adapter → GitHub issue comment and PR review. The core owns presentation, the adapter owns transport, and the contracts own shared input and anchor identity. No storage migration. A publication failure stays in the outbox for retry; mutation idempotency continues to use the head and finding markers (`github-review-publication.adapter.ts:165-185`). Logging must use injected Logger and omit model text, credentials, and raw GitHub responses.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Only emit `suggestion` for a single anchored replacement | `suggestedDiff` is arbitrary text (`review-finding.schema.ts:51`), while GitHub review comments use one RIGHT-side line (`github-review-publication.adapter.ts:188-190`). A multi-file or deletion diff cannot be represented safely as one suggestion. | Yes |
| Count actual recorded lenses, not a fixed six | Current lens runner declares four named lenses (`lens-stage.runner.ts:16-20`); other stages are triage/verification. | Yes |

## Open decisions

- **Recommended default:** show unavailable usage explicitly when no persisted usage exists. Alternative: omit usage entirely. Check the artifact schema before implementation; do not infer token totals.
- **Recommended default:** preserve old GitHub comments; new render applies on the next publication/update. Alternative: bulk rewrite historical comments, which changes existing external content and requires separate approval.

## File-disjoint batch handoff

Sequence task 900 before 901; task 901 modifies the same GitHub publication file. Within 900, renderer and adapter safeguards can be worked in parallel after the shared body-budget contract is settled. The renderer batch owns only the renderer files, `review-publication.service.ts`, and `publication-stage.runner.ts`; the adapter batch owns only `github-review-publication.adapter.ts` and its spec; the shared anchor key and export are a separate contracts batch. Integrate after all are complete.

**Rules for every later implementation batch:** verify only with `npm run verify -- -p <projects>`; never run build, serve, dev, e2e, package targets, workspace-wide checks or `nx run-many`; do not raise degradation-audit baselines; no `any`, `@ts-ignore`, or `as unknown as`; Zod at every boundary including GitHub responses and settings; Logger rather than console in libs; DI tokens in `di/tokens.ts`; register services in phased DI and update `container.smoke.spec.ts`, `expected-resolvable.ts`, and `rpc-surface.spec.ts` when needed; Electron is priority, and platform-cli and cli-engine must keep working; never log tokens. For this task, focused verification projects are review-core, review-contracts, review-github, and ptah-electron only if composition changes. No verification is run during planning.

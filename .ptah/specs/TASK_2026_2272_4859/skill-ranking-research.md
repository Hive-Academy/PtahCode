# Skill ranking step — research

Question: how to add a step that lets a model rank the skills.sh candidates of each stack item,
with the decision model first, the wizard's session model second, and today's deterministic
order as the last fallback. Read-only research on `fix/skills-step-redesign` (head `84cb799ba`).
Paths are relative to the worktree. "Verified" = read in source. "Assumption" = not verified.

## Today

**Flow (verified).** `wizard:recommend-analysis-skills` loads the saved run, reads
`saved.stackSummary.items` and calls `SkillRecommendationService.recommendAnalysis`
(`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:640-689`). The handler
resolves the service through `resolveService` (`:670-674`); the search is
`this.skillsShApi.search(query)` (`:677`).

**`recommendAnalysis` (verified, `skill-recommendation.service.ts`).**
1. Query: one term per stack item, `dependencyKeyword(technologyName(item.name))` — first part
   of a composite name, versions removed, lower case, non-alphanumerics removed (`:56-61`,
   `:79-85`, `:100-104`). Duplicate terms collapse; maximum 30 items (`MAX_TERMS`, `:39`, `:105`).
2. Search: 4 parallel workers, 8 s timeout per query (`SEARCH_TIMEOUT_MS`, `:38`, `:68-76`,
   `:109-123`). A failure goes to `searchFailures` with `'Search timed out' | 'Search failed'`.
3. Candidate match: each row passes `recommendationEntrySchema` (`:41-53`, `:133`). A row is a
   candidate only if the term equals the whole `skillId`/`name` keyword, or is one of their
   tokens, or (term length ≥ 3) a pair of adjacent tokens (`:139-142`).
4. Score: `100 + log10(1 + installs)` (`:143`). Empty descriptions are replaced with
   `"<source> - <installs> installs"`, and `described` records the original state (`:144-147`).
5. Choice: sort by described-first, then `compareRecommendations` (score desc, then `skillId`,
   `source`, `name`) (`:63-66`, `:155-157`). Take the **first free candidate** whose
   `source/skillId` and `name` an earlier item did not take (`:149-160`). If all candidates are
   taken, the item name is added to the `evidence` of the skill that covers it (`:166-172`).
   An item with no candidate and no search failure goes to `unmatchedItems` (`:173-178`).
6. Final list sorted by score (`:180`). Result: `{ skills, detectedItems, unmatchedItems,
   searchFailures, summarySource }` (`:181-182`).

## Decision model

**What it is (verified).** A user-selected small model that `lane-routing` asks fixed-choice
questions. Selection kinds: `unset`, `ollama`, `jev`, `structured`, `ollama-cloud`, `custom`
(`libs/backend/lane-routing/src/lib/decision-model/decision-model.types.ts:16-65`).

## Proposal

**Step position.** Inside `recommendAnalysis`, between candidate collection and the pick.
The deterministic sort stays and produces the default order. The ranker only returns a per-item
preferred order.

**Input (sent to a model).** Per stack item: `key` (`i1..iN`), `kind`, `name`. Per candidate:
label (`o1..oK`), `name`, `source/skillId`, `installs`, `description` cut to 200 chars.
Do NOT send `evidence` (holds repository file paths) or URLs. Only items with ≥ 2 candidates
need a question; others keep their single candidate.

**Output.**
- Decision model: one `choice` question per item, criteria = candidates. Answer = best label;
  reorder = that label first, rest in deterministic order. No reason.
- Session model: JSON schema `{ items: { [itemKey]: { order: enum(labels of that item)[],
  reason?: string(maxLength 140) } } }`. Then Zod: `order` items must be in that item's label
  set, deduplicated, unknown keys dropped, missing labels appended in deterministic order.

**Order of attempts (each bounded; wizard never blocks).**
1. Decision model if `openCaller()` is `system-one`/`structured` — 3 s per request (existing).
2. Session model via `resolveForPath` + internal query, `toolAccess: 'none'`, timeout 15 s. 
   Only if attempt 1 is `unset`, `blocked`, failed or invalid.
3. Deterministic order (today). Always available.
Partial answers allowed per item: invalid item falls back alone.

## RPC contract (optional fields, backward compatible)

In `SkillRecommendation` (`rpc.types.ts`): 
- `rankedBy?: 'decision-model' | 'session-model' | 'heuristic'`
- `reason?: string`
- `rank?: number`

In `WizardRecommendAnalysisSkillsResult`: `rankedBy?` for the whole run.
UI sorts by `rank ?? score`.

## Decisions

- Expose a generic fixed-choice service from `lane-routing` following `DecisionModelTaskKindClassifier` pattern
- Ranking logic in `rpc-handlers/skills-sh/services`
- Send names, kinds and public metadata only
- Choice per item (not full ranking) from decision model

## User approval summary (2026-11-18)

✓ Order of attempts: decision model first → session model → deterministic
✓ Privacy: wizard MAY send stack item names/kinds and public skill metadata to local or remote decision model, WITH one-line note in skills step
✓ Delivery: separate task, worktree and PR
⚠ UI rendering deferred: another PR is redesigning the skills step now

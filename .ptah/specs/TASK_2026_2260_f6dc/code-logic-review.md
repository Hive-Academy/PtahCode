# Code Logic Review — TASK_2026_2260_f6dc (setup wizard, skills step)

Reviewer: code-logic-reviewer (independent; did not write the change).
Scope: the uncommitted diff on `fix/setup-skills-step`, read as whole files:

- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts` (+ spec)
- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts` (+ spec)
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts` (+ spec)

Callers and collaborators read: `setup-rpc.handlers.ts:640-757` (both RPC callers of the service),
`cli-agent-runtime/.../skills-sh-api-client.ts:100-310` (the real `search` function),
`skills-sh-description.enricher.ts:40-190`, `agent-generation/.../stack-summary.extractor.ts:40-95`,
`stack-skill.store.ts:32-50`, `stack-skill-review.component.html` (whole), `team-builder-start.page.html:99-122`,
`analyze-done.page.ts`, `libs/shared/.../rpc-agents.types.ts:86-110`.

Checks run: one `node -e` evaluation of `technologyName` + `dependencyKeyword` on the edge inputs
from the brief (output quoted in finding 2). No Jest, tsc or lint run (the coordinator runs them).

## Verdict

**NEEDS_REVISION — score 5/10.**

Fix 4 (the forward path) works on both pages. Fixes 1-3 work for the spec fixtures but not reliably
for real registry data. The strict description rule (fix 1) is applied to API results where only the
top 8 of 50 rows can carry a description, so it silently cuts recall and turns an enrichment outage into
"no matching registry skill" for every item. Fix 2 dedupes needs with a different key than it matches
with, so duplicates for one technology can still occur. Fix 3 strips only a trailing pure-numeric
version, and this repository's own profile has names it does not handle. The always-visible
"Re-run skill search" button exposes a stuck `searching` state.

Why not 6-7: finding 1 is a silent failure on the main path with a realistic trigger (network to
`raw.githubusercontent.com`), and findings 2-3 leave the reported defects partly open for real inputs.
Why not 3-4: the forward-path fix is correct and guarded, the backend changes do not break the other
caller (`recommend()`), and no data loss or security issue was found.

---

## Five logic questions

1. **Does it do what was asked?** Partly. A4 yes. A1 yes for display, at the cost of recall (F1).
   A2 and A3 only for the shapes the specs use (F2, F3).
2. **What happens on failure?** An enrichment failure is invisible: entries are dropped without a log,
   and the items are reported as unmatched, not as search failures (F1). A stack item whose
   candidates are all taken disappears from every list (F4).
3. **What do edge inputs do?** See the table in F2. `Node.js 24.x`, `Angular ~22.2`, composite names and
   parenthesized suffixes are not normalized. `Vue 3`, `D3`, `Zod 4`, `Angular 22.2`, `Nx 24.0.0` are.
4. **State and races?** Team builder: safe (stage set to `launching` synchronously). Analyze page:
   Re-run during a search leaves `searching` true forever (F5). Double click on "Continue without
   skills" opens two guidance tabs (F6).
5. **Do the specs prove the fixes?** The specs use fixtures that all have a description, so they do not
   exercise the real API shape (F1). One spec pins the silent drop of F4 as expected behaviour. No spec
   covers F2, F3, F5 or F6.

---

## Confirmed defects

### F1 — HIGH — Strict description rule rejects most real registry rows, silently

**Evidence**

- `skill-recommendation.service.ts:51-53` requires a non-blank `description`; `:128-129` drops a row that
  fails, with no log and no counter.
- The real search is `SkillsShApiClient.search` (`setup-rpc.handlers.ts:677`). The skills.sh API returns no
  description (`skills-sh-description.enricher.ts:5`). `toSkillShEntry` sets `description: ''`
  (`skills-sh-api-client.ts:297`). The enricher fills only the first 8 rows
  (`skills-sh-description.enricher.ts:44-45`, `:133-135`) of up to 50 (`skills-sh-api-client.ts:56`),
  is best-effort (`skills-sh-api-client.ts:183-191`), and caches a miss for 24 hours (`enricher.ts:183-189`).
- An item with zero valid candidates goes to `unmatchedItems` (`service.ts:153-158`). The page then shows
  "No matching registry skill" and, for frameworks and patterns, offers to draft a project skill
  (`analyze-skills.page.ts:38-44`).

**Failing inputs**

- `raw.githubusercontent.com` is unreachable, rate-limited (429) or blocked by a proxy: every row has
  `description: ''`. Result: `skills: []`, every detected item in `unmatchedItems`, `searchFailures: []`.
  The user is told no skill exists for Angular, Nx, etc.
- Query `nx` returns the matching `nx` skill at rank 9 or lower: it is never a candidate.
- A popular skill whose repository layout is not in `CANDIDATE_PATHS`: never recommended for 24 hours.

**Proposed fix (choose one)**

1. Keep rows with a blank description and let the card show real fallback text (for example
   `source · N installs`). This is not fabricated content. Keep the strict check for blank
   `source`, `skillId`, `name`.
2. Or enrich after match: call the enricher on the matched candidates (not the top 8 of the raw
   list), then apply the strict rule.
3. In all cases, count rows rejected for a blank description per item. If an item had matching rows
   but all were rejected, put it in `searchFailures` with a reason such as
   `Registry entries had no description`, not in `unmatchedItems`. Log at `debug`.

Add a spec with the real shape: 50 rows, only rows 0-7 described, and one with all descriptions blank.

### F2 — MEDIUM — `technologyName` handles only a trailing numeric version

**Evidence** `skill-recommendation.service.ts:56-58`: `/\s+v?\d+(?:\.\d+)*(?:[-+][\w.-]+)?$/i`.
The match term is `dependencyKeyword(technologyName(name))` (`:125`), which concatenates all remaining
characters. Output of the actual functions:

| Input | `technologyName` | term | Result |
| --- | --- | --- | --- |
| `Nx 24.0.0` | `nx` | `nx` | OK |
| `Angular 22.2`, `Vue 3`, `Zod 4` | `angular`, `vue`, `zod` | same | OK |
| `D3` | `d3` | `d3` | OK (no space, not stripped) |
| `Tailwind CSS 3.4` | `tailwind css` | `tailwindcss` | OK |
| `Node.js 24.x` | unchanged | `nodejs24x` | **no match** (this repository's profile, line "Node.js 24.x") |
| `Angular ~22.2` | unchanged | `angular222` | **no match** |
| `TypeScript 6.0.3 (exact pin)` | unchanged | `typescript603exactpin` | **no match** |
| `Python 3.12rc1` | unchanged | `python312rc1` | **no match** |
| `Astro 7 + Starlight` | unchanged | `astro7starlight` | **no match**; query also sent as `astro 7 + starlight` |
| `ESLint 10 + typescript-eslint` | unchanged | `eslint10typescripteslint` | **no match** |
| `better-sqlite3 + sqlite-vec` | unchanged | `bettersqlite3sqlitevec` | **no match** |
| `Slack Bolt / discord.js / grammY` | unchanged | `slackboltdiscordjsgrammy` | **no match** |
| `C++ 20` | `c++` | `c` (length 1) | always skipped (`:134`) |

The composite rows were unmatched before the change too, so they are not a regression. They are the
same class as reported defect 3 ("no Nx skill"), and 6 of the 30 items in this repository's own stack
summary have this shape. The Nx case alone is fixed.

**Proposed fix**

1. Remove version tokens anywhere, not only at the end: drop parenthesized suffixes, then drop tokens
   that match `^[~^v]?\d+(?:\.(?:\d+|x))*(?:[-+.]?[a-z]+\d*)?$` (keep tokens such as `D3` that have no
   leading space).
2. Split composite names on ` + `, ` / ` and `,` into separate needs. Each part gets its own query.
   Keep the original item name as the evidence.
3. Add spec rows for `Node.js 24.x`, `Angular ~22.2` and `ESLint 10 + typescript-eslint`.

### F3 — MEDIUM — Needs are deduped by one key and matched by another, so duplicates return

**Evidence** `skill-recommendation.service.ts:96-99` dedupes needs by `technologyName(item.name)`
(for example `nx`, `@nx/angular`, `tailwind css`, `tailwindcss`). Matching uses
`dependencyKeyword(technologyName(...))` (`:125`), which maps all of these pairs to one term
(`dependencyKeyword('@nx/angular') === 'nx'`, both Tailwind forms to `tailwindcss`). The legacy
extractor can emit scoped package names (`stack-summary.extractor.ts:77-78` accepts `@`), and a
structured summary can list a framework and its package (`Nx 24.0.0` and `@nx/jest`).

**Failing input** items `[Nx 24.0.0, @nx/angular]`, registry returns `nx-monorepo` (1000 installs) and
`nx-workspace` (50) for both queries. Result: two Nx skills, one per item. That is reported defect 2
("duplicate skills for one need"). The registry is also queried twice for the same technology.

**Proposed fix** Key `needs` by `dependencyKeyword(technologyName(item.name))` and use that same key for
the query and the match. Add a spec with `Nx 24.0.0` + `@nx/angular` that expects one skill.

### F4 — MEDIUM — Greedy per-item assignment drops items silently and ignores match quality

**Evidence**

- `skill-recommendation.service.ts:144-158`: if an item has candidates but all are used, it goes to
  neither `skills` nor `unmatchedItems` nor `searchFailures`. The page lists it under "Detected" with
  no outcome. The new spec "does not repeat the same name or install source across queries"
  (`skill-recommendation.service.spec.ts`, `expect(result.unmatchedItems).toEqual([])`) pins this
  as expected.
- Assignment follows the order of `input.items`, and `compareRecommendations` (`:60-63`) sorts by
  install count only. The `complete` flag computed at `:133` is used only as a filter, not as rank.

**Failing inputs**

- Items `[Angular 22.2, Angular SSR]`. Query `angular` returns `angular-ssr` (5000 installs) and
  `angular-developer` (800). Angular takes `angular-ssr` (token `angular` matches). Angular SSR's only
  candidate is used, so it disappears. Result: one SSR skill with evidence "Angular 22.2", no general
  Angular skill, and "Angular SSR" with no outcome.
- Items `[Playwright, Angular]` against the data of the spec "falls back to the next free candidate":
  the result changes with item order (the spec tests only one order).

**Proposed fix**

1. Rank candidates by match quality first (complete > whole word > adjacent pair), then by score.
2. Assign globally: sort all (item, candidate) pairs by quality and score, then assign greedily.
   Or run a second pass so an item takes a skill only if no other item has that skill as a
   complete match.
3. When an item is covered by a skill another item took, record it. For example, append its name
   to that recommendation's `evidence` (`"Angular, Playwright"`), so the user sees an outcome.
4. Update the spec that pins the silent drop.

### F5 — MEDIUM — "Re-run skill search" during a search leaves `searching` stuck

**Evidence** The button is now always rendered (`analyze-skills.page.ts:47`), disabled only by
`state.loading()`. `retry()` increments `version` (`:142-145`). `search()` clears `searching` only when
`version === this.version` (`:160`). `load()` does not reset `searching` (`:124-140`). The review
component disables Search and shows the spinner while `searching()` is true
(`stack-skill-review.component.html:80, 85`).

**Failing input** Type `nx`, click Search, click "Re-run skill search" before the search reply arrives.
The search reply is discarded and `searching` stays `true`. Search stays disabled and the spinner
stays visible until the user leaves the page. Before the change, the retry button was only rendered
when `error && !summary && !loading`, so this sequence was much less likely.

**Proposed fix** In `retry()` (or at the start of `load()`), run `this.searchVersion++` and
`this.state.searching.set(false)`. Or make the `finally` in `search()` depend only on
`searchVersion`. Add a spec for this sequence.

### F6 — LOW-MEDIUM — Double click on "Continue without skills" opens two guidance tabs (Analyze page)

**Evidence** `preview()` (`analyze-skills.page.ts:164-166`) calls `continueToGuidance()` when nothing is
selected. `continueToGuidance()` (`:208-212`) has no in-flight guard. It calls `tabs.createTab` and
`setWorkflow` before the first `await`. The page binds no `[busy]` to the review component, so the
button stays enabled until navigation completes.

**Failing input** Two fast clicks on the primary button with zero selected skills: two
"Project guidance" tabs with the `setup-project-prompt` workflow, and two navigations. The "Skip skills"
button had the same gap before. The primary button could not reach this path before the change because
it was disabled at zero selection.

The Team Builder page does not have this defect. `launchChat()` sets stage `launching` before its first
`await` (`team-builder-start.page.ts:404-409`), and the second click returns at `:400`.

**Proposed fix** Add a `leaving` signal. Return early in `continueToGuidance()` when it is set, set it
before `createTab`, and bind `[busy]="leaving()"` on `ptah-stack-skill-review`.

### F7 — LOW — Re-run is shown when there is nothing to re-run, and it discards manual choices

**Evidence**

- With no completed analysis, the page shows "Choose a completed analysis first." (`:89`, `:101`) and
  the button is still enabled. `retry()` does nothing when `runId` is missing (`:143-144`). This is a
  dead button.
- A successful re-run replaces `selectedIds` with all new recommendations (`:133`). This removes the
  user's deselections and any selected search result, while `searchResults` stay on screen with their
  checkboxes cleared. There is no message.

**Proposed fix** Render the button only when `analysis.loaded()` has a `runId`. On re-run, keep the
selections that are still present, or tell the user that the selection was reset.

### F8 — LOW — Zod strips optional entry fields on both service paths

**Evidence** `recommendationEntrySchema` / `analysisEntrySchema` (`service.ts:41-53`) are plain
`z.object`. `parsed.data` (`:130`, `:203`) drops `id`, `slug`, `sourceType`, `url`, `installUrl`
(declared on `SkillShEntry`, `rpc-agents.types.ts:99-108`, and set by the API client,
`skills-sh-api-client.ts:300-302`). It also trims `source`/`skillId`. The result is still typed as
`SkillShEntry`. This affects `recommend()` (`wizard:recommend-skills`) as well as `recommendAnalysis()`.
No current consumer of recommendations reads those fields: `analyze-done.page.ts` uses `slug` but
from `harness:get-skill-selection`. So this is a contract loss, not a visible regression now.

**Proposed fix** Validate, then push the original `rawEntry` (`safeParse(rawEntry).success`), or use a
loose object schema so unknown keys pass through.

---

## Checked and correct

- **`recommend()` regression risk.** The new lenient schema needs `isInstalled: boolean` and a finite
  `installs`. The API client always sets `isInstalled: false` and validates `installs` as a number
  (`skills-sh-api.schema.ts:12`). Blank descriptions are allowed there. No behaviour change apart from F8.
- **Case differences.** `usedIds` and `usedNames` are lower-case (`service.ts:138-141`). Zod `.trim()` makes
  the compared values trimmed. `Owner/Repo/Angular` and `owner/repo/angular` are one skill.
- **Version-only names.** A name such as `24` is not stripped (the regex needs leading whitespace). The
  `term.length < 2` guard (`:134`) prevents an empty term from matching everything.
- **Team Builder forward path.** `reviewSelection()` with zero selection calls `launchChat()`
  (`team-builder-start.page.ts:270-276`). The owner-decision guard runs first. `launchChat()` returns on
  `loading` and on an active launch. The stage changes synchronously, so a double click is safe.
- **Button state.** `[disabled]="loading() || busy()"` (`stack-skill-review.component.html:195`) enables
  the primary button in the empty, error and zero-selection states. It stays disabled while loading.
  The label switches correctly on `selectedIds().size`.
- **Analyze forward path.** `preview()` routes zero selection to guidance (`:166`). A selected skill still
  goes through preview and consent. The error state no longer blocks the user.

## Speculation (not confirmed)

- **Two equal primary/secondary actions.** At zero selection, "Continue without skills" and
  "Skip skills" do the same thing on both pages. This is a UX redundancy, not a logic defect.
- **Re-run during the consent stage.** The Re-run button stays enabled when the consent dialog is open
  or install is running (`stage` is `consent`/`installing`, `loading` is false). If the dialog does not
  block the page behind it, a re-run can set stage `review` while an install runs, and the install
  completion would then navigate anyway. I did not confirm whether `ptah-stack-skill-consent` is modal.
- **Name-based global dedupe.** `name` comes from `formatSkillName(skillId)`
  (`skills-sh-api-client.ts:296`), so name dedupe equals skill-id dedupe across repositories. Two different
  skills with the same id in different repositories collapse to one. This matches the stated decision,
  but it can hide the better one when installs are close.

## Spec assessment

| Spec | Proves | Gap |
| --- | --- | --- |
| `rejects a blank %s` | blank fields are rejected | Does not use the real API shape (50 rows, 8 described); see F1 |
| `chooses one best %s skill` | order independence within one item | Does not cover order dependence across items (F4) |
| `queries Nx without its version` | `Nx 24.0.0` → query `nx` | The "40 earlier hits" part guards a global cap that never existed |
| `does not repeat the same name` | cross-item dedupe | Pins the silent drop of F4 as expected |
| `falls back to the next free candidate` | fallback in one order | Only one item order |
| Analyze `continues to guidance with %s` | real template, enabled button, navigation | No double-click case (F6), no Re-run-during-search case (F5) |
| Team Builder `starts the chat from Continue` | zero-selection path launches | No owner-decision-required case at zero selection |

## Decisions

- **Severity of F1.** Options: High (silent, main path, realistic trigger) or Medium (only when GitHub
  raw is unreachable). Evidence: the top-8 limit applies on every search, not only on failure, so recall
  loss is permanent. I chose High. Reversible.
- **F4 as a defect, not as a design choice.** The fix report records "one per technology" as a decision,
  but it does not record that a covered item vanishes from the outcome lists. A spec pins this. I
  recorded it as a defect because the user sees a detected item with no result. Reversible.

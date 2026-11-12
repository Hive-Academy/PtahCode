# Plan review 2

Verdict: REVISE

## Finding status

| # | Resolved | Evidence |
| --- | --- | --- |
| 1 | partly | Plan text keeps ten aliases and gives `batch` and `completion` no role name. This also compiles with `taskKindFor` (`phase-plan.ts:409-430`) after the plan adds two `case` labels. But the routing path for a phase with no role is not designed (new finding N3). The test bucket is not kept at 0 (new finding N2). |
| 2 | yes | Phase files forbid role titles. Roster rows move to one appendix. Per-copy budget is in "Census budget". The budget is plausible: the plan counts 201 and 196 role lines in the seven files, and the baseline skills bucket is 466 (`baseline.json:6-9`). The census counts any line that contains one of the 14 names (`check-role-census.ts:51`). |
| 3 | yes | B2 and B5 use comma lists. `splitList` in `scripts/verify.mjs:42-46` splits on commas. |
| 4 | yes | The plan uses `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill`. This is a valid form. `package.json:46` has the script. |
| 5 | yes | B3a-B3d, B4 and B5 run the validator and the census. B4 has an order defect (N1). |
| 6 | yes | B4 writes the hook and CI. The current hook matches only `^\.claude/skills/` (`.husky/pre-commit:21`). The CI job has only role-census (`ci.yml:95-98`). |
| 7 | yes | The plan text is correct. `planEntry` returns `foreign` for an unowned differing copy, `kept` for an owned local edit, and `update` for an owned unchanged copy (`claude-target.ts:584-624`). |
| 8 | yes | Re-exports, `taskKindFor`, tiers (R1 and R2 are valid rules in `tier-effort-policy.ts:14-35`), outcome mirror, tool schema spec, README and the zod-free guard are covered. |
| 9 | yes | `gray-matter` with `language: 'yaml'` is named. The profile reuses `disallowedTools` (`subagent-tool-allowlist.ts:9-23`) and allow/deny decisions (`agent-permission.types.ts:59-69`). `prompt` means the existing approval flow. This adds no new tool-name vocabulary. |
| 10 | yes | Tags and import direction are cited. |
| 11 | yes | The plan lists all hunks. The `git diff --no-index --stat` shows the same five files (67 insertions, 38 deletions). |
| 12 | partly | The split is better. B3d is still large (N4). |
| 13 | yes | Write sets include the zod-free spec, tier policy, outcome mapping and tool spec. |
| 14 | yes | Continuation scan, no new document constant, Mode wording, README and lane-assignment are in the plan. |
| 15 | yes | Hook-only statement and exports are corrected. |
| 16 | yes | "Proposed Removals: None" holds. Roster rows move to the appendix and no unique hunk is dropped. See "Capability removal" below. |

## New findings

N1. **Serious. B4 runs before the mirror is in parity.** The plan order is B1, B2, B4, B3a. B4 adds the recursive mirror check "immediately" and its verify command is the validator. Today five files differ between the two trees (`git diff --no-index --stat`: `SKILL.md`, `agent-catalog.md`, `git-standards.md`, `strategies.md`, `task-tracking.md`). The B4 verify command therefore fails. The sentence "B4 mirror introduces 0 net because parity was already established" is false at that point. Exact change: put B3a before B4. Enable the mirror check in B4 (after B3a). Keep the phase-count and active-role-scan checks gated until B3c and B3d, as the plan already says. Update the dependency column (B3a depends on B2, B4 depends on B3a, B3b depends on B4 or B3a) and the order sentence at the start of "Batches".

N2. **Serious. The test bucket rises with the planned alias tests.** The plan says test lines added are 0 (target <=938), but B2 also says "Add tool-schema and routing tests for both kinds and all ten unchanged aliases". A test that asserts the ten values writes the role names as literals. Each line counts (`check-role-census.ts:51`) and the test bucket is at its baseline (`baseline.json:21-24`). Exact change: state that the alias test derives the expected set from an existing export (for example `BUILTIN_SUBAGENT_ROLES`) or compares against a fixture written without a literal title on a new line. Alternatively, name an equal reduction of test lines in the same bucket. Run the census at the end of B2 (the plan already requires it).

N3. **Serious. Routing for `batch` and `completion` is not designed.** The plan says the default executor is "orchestrator" via "a separate phase policy with no role-name value". But `candidatesFor` reads `phase.role ?? DEFAULT_ROLE[phase.kind]` (`phase-plan.ts:312`) and calls `toSubagentCandidate(role)` (`:315`). `toSubagentCandidate` throws for an empty role (`hard-constraints.spec.ts:666`). The string "orchestrator" does not exist anywhere in the non-spec routing source. The plan does not say what `candidatesFor` returns, what `constraintInput` and hard constraints do, or what the result of `ptah_route_decide` shows for these two kinds when no role is given. Exact change: add one paragraph to "Design: Routing" that states (a) the type of the phase policy and where it lives, (b) that `candidatesFor` returns only `gathered.lanes` (or a defined orchestrator-owned marker) for the two kinds, with no `toSubagentCandidate` call and no new retired title, (c) the result when a user gives `role` for these kinds, and (d) a spec case for each branch.

N4. **Moderate. B3d is still too large for about 20 minutes.** It edits 12 files (6 files in 2 copies). The plan reads `strategies.md:35-533` and rewrites the continuation table, the catalog and `SKILL.md`. Exact change: split into B3d1 (`agent-catalog.md` plus `team-leader-modes.md` plus `lane-assignment.md`, 6 paths) and B3d2 (`SKILL.md`, `strategies.md`, `task-tracking.md`, 6 paths). Run census and validator after each. The B3d budget lines (+28, -60) then split by file.

N5. **Minor. `hard-constraints.ts` is in the B2 write set with no change.** The plan says the import "remains valid through the schema re-export" (Design: Routing), so no edit is needed. Exact change: remove it from the write set, or state the edit.

N6. **Minor. B3a text contradicts itself.** B3a is "merge only" with no flow rewrite, but the batch budget says B3a "must remove at least 2 role-bearing lines". Exact change: keep the single rephrased `SKILL.md` line as the only edit, or drop the "at least 2" bound.

## Capability removal

None found. The roster rows, the default executor aliases and the user-authored agent path stay (appendix). `team-leader-modes.md` becomes a compatibility note and Mode 1/2/3 map to `batch`, orchestrator acceptance and `completion`. This changes the active text, so the user should confirm that Mode 2 as an orchestrator acceptance step is the intended decision (`template-classification.md:288-296`). A reviewer cannot approve it.

## Not checked

- I did not run the validator, the census, the verify command or any test.
- I did not count role-bearing lines per file. I used the plan counts and the baseline.
- I did not check that the `gray-matter` import passes the Nx module-boundary lint for lane-routing.
- I did not read `template-classification.md` or `parity-inventory.md` against the phase files.
- I did not check `hard-constraints.ts` kind-specific rules for the two new kinds.

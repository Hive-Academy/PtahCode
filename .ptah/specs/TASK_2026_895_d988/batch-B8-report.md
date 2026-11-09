# Batch B8 report

## Changes

- Updated `plugins/ptah-core/skills/agent-lanes/SKILL.md` and `.claude/skills/agent-lanes/SKILL.md` in §2, §3 and §8. Each gained 17 net lines, within the ~40-line limit.
- §2 now states raw `model` IDs, the limited `modelTier` mapping, advisory routing tier/effort, and the system CLI model resolution order.
- §3 now requires a one-batch implementation brief with bounded write/read sets, inline contracts, dependencies, exact verification and acceptance criteria; extra reads require a named type error or failing test and must be reported.
- §8 now sizes batches by `ptah_count_tokens` plus 10% framing, with the requested bands and secondary limits, split-then-rewire handling, and actual-token recording.
- The new policy wording is identical in both copies. Pre-existing copy-specific differences remain untouched.

## Verification

- `npm run validate-skill`: passed; 9 files, 0 errors, 0 warnings. The script validates the checked-in agent-lanes copy but has no path argument for the source copy, so it could not be run directly against that copy.
- `npm run verify -- -p @ptah-extension/agent-generation`: failed. Typecheck reports missing `tier` and `effort` fields in `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:291,324`. Tests: 46 suites passed, 1 failed; 1461 tests passed, 2 failed, 1 skipped. Both failures in `user-layer-reap.spec.ts` are Windows `EPERM` creating symlinks. These failures are outside the Markdown write set.
- `ptah_get_diagnostics` on both Markdown files: unavailable; no requested file could be checked.
- UTF-8 read of both files: zero matches for `â€`, `â‰`, or `â†`. `git diff --check`: passed.
- Actual lane tokens for this batch: unavailable.

## Decisions

- Kept the checked-in copy's unrelated permission/network row and other local differences. Options were to synchronize entire files or only requested policy text; the scoped write set and preservation instruction support the latter. Reversible.
- Used the research setup's current model-resolution findings for §2. Options were to apply tiers to all system CLIs or only supported paths; evidence says only Claude CLI and ptah-cli providers map tiers. Reversible.

## Open issues

- Project verification remains red for the typecheck and Windows symlink failures above. No implementation files were edited because they are outside this batch's write set.
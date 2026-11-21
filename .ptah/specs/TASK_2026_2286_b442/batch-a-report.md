# Batch A report: Antigravity CLI usage source

Two backend-developer agents were stopped by the Ptah budget monitor; the coordinator completed the last steps.

## Changed files
- `libs/backend/auth-providers/src/lib/quota/readers/antigravity-usage-json.parser.ts` (+spec): accepts `buckets` and a
  top-level object without `type`.
- `.../antigravity-cli-usage.adapter.ts` (+spec, new): `agy -p /usage --output-format json` through `runFallbackUsage`;
  rejects `num_turns > 0` (`cli-model-turn`) with the long backoff.
- `.../antigravity-plan-usage.reader.ts` (+spec): the `antigravity-cli` source calls the adapter; account store check
  before and after the run.
- `.../antigravity-oauth-plan-usage.reader.ts`: failure cause union and mapping.
- `libs/backend/auth-providers/package.json`: `which` dependency.
- `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts` (coordinator): the dashboard read sets
  `allowCliFallback` for providers in `CLI_USAGE_FALLBACK_PROVIDERS` (antigravity). A spec for this is owed (tests phase).

## Checks
- Focused jest, 5 suites, 114 tests: pass (`.ptah/tmp/batch-a-jest6.log`). Coordinator corrected two spec window keys
  (`PlanWindowKey` type).
- Live check (temporary script, removed): `cli-store` and `unknown` owners both `available` with 4 windows
  (Gemini Models Weekly / 5 Hour, Claude and GPT models Weekly / 5 Hour), no source failures.

## Open risks
- An agent created a git-ignored symlink `node_modules -> main checkout node_modules` in the worktree (jest
  moduleNameMapper needs it).
- `scripts/agent-usage/probe-plan-usage.ts` does not set `allowCliFallback`, so the probe still reports Antigravity
  unavailable.

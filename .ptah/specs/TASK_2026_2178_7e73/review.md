# PR #1288 review — findings

**Verdict: REQUEST CHANGES.** Static review of `origin/main...HEAD`; specs were inspected, not executed.

## Findings

1. **High — recognized children can be approved without reaching the parent sink.** `codex-approval-bridge.ts:324-328` applies `codexPermissionPolicy` to child requests after `isChildTurn` passes, and `:468-476` calls the sink only for `present`. The existing policy returns `accept` for `yolo` requests and `auto-edit` file changes, or `acceptForSession` for a matching remembered rule (`codex-permission-policy.ts:31-44`). Thus a newly admitted child can receive an approval without a parent decision. The new child spec covers only `ask`; it does not test these modes or a parent denial. This violates the requested no-child-auto-approval and strictly-equal-or-stricter checks. Route child approvals through the sink, or explicitly establish and test an authorized child policy that permits these grants.

2. **High — completed native child turns remain eligible for approval.** `codex-context.ts:884-889` records a native child terminal event and returns without deleting `childTools` or `childTurns`; `isChildTurn` at `:396-398` checks only those maps. `isCurrent` at `:390-394` also accepts any retained child turn ID while the parent is running and does not consult `terminalTurns`. A delayed request from a finished native child can therefore pass the new callback and reach the sink or the automatic grant path while another parent or child turn remains active. Remove or invalidate terminal child turns for approval routing, and add a terminal-child regression spec.

3. **Commit policy — invalid scopes and missing trailer.** `.commitlintrc.json` has an explicit `scope-enum` that includes `shared`, `codex-runtime`, and `agent-sdk`, but not `cli-lane-defaults` or the combined `codex-runtime,agent-sdk`. Commits `50cd4dc39` and `7c3e909a6` therefore use invalid scopes. Commit `50cd4dc39` also has no `Co-Authored-By` trailer, despite the requested trailer check; the other three PR commits have one. Correct commit metadata before merge.

## Checks that passed

- D24 changes `PERMISSIONS` to `['plan', 'ask', 'auto-edit', 'yolo']` (`cli-lane-defaults.types.ts:41`). The resolver preserves an explicit permission, validates and uses `resumePolicy`, and chooses `plan` for a no-row plain spawn. The new resolver specs cover all three; the environment spec covers plain spawn through service translation. The permission change itself is stricter.
- D17 admits a foreign thread only with a matching string turn ID and `isChildTurn(...) === true`; an unknown thread returns `cancel`. The new specs cover a recognized child in `ask` mode and an unknown child. A sink denial still maps to `decline` on the presented path.

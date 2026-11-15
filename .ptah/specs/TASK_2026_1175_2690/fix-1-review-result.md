# Phase 4 step 1 review fix result

## Findings

1. Restored six em dashes in both agent catalogs. Wrote changed files as UTF-8 LF without BOM. Regenerated the content manifest. Both catalogs have the same bytes. `git diff` has zero `Ã¢â‚¬` byte sequences.
2. Restored `team-leader` as the implementation action in `orchestration-namespace.builder.ts:56`; updated its spec.
3. Added the optional-capability audit marker in `workspace-target.ts:486`. The audit exits 0.
4. Mirror and sync skip a retired slug only when its source has a valid Ptah origin sidecar. Renamed the sync helper in `workspace-target.ts:477`. Recorded P4-S1-1 in `step-1-plan.md` and `decisions.md`: routing aliases by slug, so a same-name custom agent needs a new name for explicit routing. Updated both catalogs and built-in agent docs.
5. `agent-role-resolver.service.ts:46,75` omits retired roles from list and rejects their resolution with an `implement` hint. Added a three-role regression spec.
6. Both `ui-ux-designer/DEVELOPER-HANDOFF.md` copies recommend the `implement` phase.
7. `phase-plan.ts:312` uses the phase kind for retired-role candidates. Added a tests-phase assertion.
8. `system-namespace.builders.ts:405` calls `implement` a phase kind and explains its route.
9. Replaced local absolute paths and account names in task documents with placeholders. Removed the BOM from `batch-1-E-result.md`.
10. Updated stale example names in the listed comments and docs to `senior-tester`.

## Checks

- `npm run manifest:generate`: exit 0. `npm run manifest:check`: exit 0.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0.
- `npm run validate-skill`: exit 0.
- Focused Jest: cli-agent-runtime role resolver 38/38, lane-routing phase plan 16/16, vscode-lm-tools orchestration builder 14/14; all exit 0.
- `npx tsc --noEmit --project <project>/tsconfig.spec.json`: exit 0 for cli-agent-runtime, lane-routing, and vscode-lm-tools.
- `npx eslint` on the eight changed TypeScript source and spec files: exit 0, with three existing warnings.
- `git diff --check`: exit 0. `git ls-files --eol` reports LF for the catalogs and manifest. The orchestration and ui-ux-designer copies are byte-identical. `git diff --stat` shows no line-ending whole-file rewrite.
- Role census command: failed before counting. Its Node `spawnSync('git')` returned no status or stderr (`git ls-files failed: undefined`). Census buckets and limits are unverified in this sandbox; the coordinator must run it.

## Open issues

The census gate is open due to the child-process failure. Other changed projects did not receive scoped TypeScript and lint checks here.

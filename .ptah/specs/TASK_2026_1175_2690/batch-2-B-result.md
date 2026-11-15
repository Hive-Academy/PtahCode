# Batch 2 B result

## Changed files

- `libs/shared/src/lib/types/retired-roles.ts:43-46`: retire four verification roles in step 2. `retired-roles.spec.ts` checks all rows.
- `libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.ts:91`: use `phaseKindForRole(role)` in the retired wizard role hint. `agent-role-resolver.service.spec.ts:270-293` checks each new slug and hint. The origin and hash rule remains unchanged.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:353,368-379,435`: choose reviewer or tester default effort from phase kind when present. A role name is the fallback when phase kind is absent. `lane-spawn-policy.spec.ts:48-76` covers review, visual-review, tests, implement, and custom no-phase names.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:153-169` and `agent-process-manager.service.ts:1027-1030`: carry the optional phase kind to the effort policy. The source is `request.phase.kind` on the existing spawn request. It is also the source used for lane outcome phase metadata.
- `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts:128-141`: each retired slug routes to its phase kind candidate, with no role candidate.
- `libs/backend/lane-routing/src/lib/task-kind/decision-model-task-kind-classifier.spec.ts:93-103`: check the classifier's existing shared-alias normalization for each new slug. No classifier source change was needed.

## Checks

- Prettier `--write` on all ten changed source and spec files: passed.
- Focused Jest: shared 8, cli-agent-runtime 309, lane-routing 30 tests passed.
- `tsc --noEmit --project .../tsconfig.lib.json`: passed for shared, cli-agent-runtime, lane-routing.
- ESLint on all changed files: 0 errors, 5 warnings. Nx module-boundary rule was skipped because no cached ProjectGraph was available. Existing imports stay on the same public shared alias; no new cross-project dependency or host import was added.
- `git diff --check`: passed.

## Open risks

- Nx module-boundary lint could not run without a ProjectGraph cache. Manual import review found no new dependency edge.
- Reviewer family separation for visual-review remains unchanged by coordinator decision C2-2; follow-up F-S2-1 owns that rule.

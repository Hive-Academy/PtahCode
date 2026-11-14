# Batch 0a-2 result

Status: code written. Checks listed below are in progress (see "Checks").

## Changed files

Shared (no edit to `libs/shared/src/index.ts`):
- `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts`: new code `'role-retired'`.
- `libs/shared/src/lib/types/rpc/rpc-skill-clone.types.ts`: `SkillSynthesisRebaseCloneParams.origin?: 'single' | 'bulk'`.

Backend (`rpc-handlers`):
- `skill-synthesis/retired-role-guard.ts` (new): `assertRoleMutable(action, kind, slug, isRetired = isRetiredRole)` and `assertNotBulkRoleRebase(origin, kind, slug)`.
- `skill-synthesis/retired-role-guard.spec.ts` (new).
- `skills-synthesis-rpc.handlers.ts`: guard calls in previewEnhancement, applyProposal (enhance), revertEnhancement, rebaseClone (+ bulk check), keepClone, saveCloneBody. Reads (list, getClone, getHistoryBody) are not guarded.
- `skills-synthesis-rpc.schema.ts`: `origin: z.enum(['single','bulk']).optional().default('single')` on the rebase schema.
- `skills-synthesis-rpc.schema.spec.ts`: origin cases.

Frontend (`skill-synthesis-ui`):
- `components/clones/clone-action-gating.ts`: `isRoleAgentClone`, `isRetiredRoleClone`, `RETIRED_ROLE_REASON`, `bulkSkippedRoleCount`; `eligibleForBulkRebase` excludes role agents; `cloneActionModel` has `retired` and an injectable retired predicate (3rd argument).
- `components/clones/clone-action-gating.spec.ts`: role cases added.
- `components/clones/clone-card.component.ts`: "Retired role" badge; enhance and revert hidden for a retired role (rebase and keep are already null in the model).
- `components/clones/skill-clones-view.component.ts`: `bulkSkippedRoles` computed and a short text "Rebase all skips N role agents. Rebase a role from its own card."
- `components/clones/skill-clones-view.component.spec.ts`: bulk calls now expect the `'bulk'` argument.
- `services/clone-bulk-rebase.service.ts`: filters role agents, sends `'bulk'`.
- `services/clone-bulk-rebase.service.spec.ts`: `'bulk'` argument and a role-skip case.
- `services/skill-synthesis-rpc.service.ts`: `rebaseClone(kind, slug, origin = 'single')`.

## Marker finding

No reliable marker separates a Ptah-generated role file from a user-written file with the same slug.
- Registry row and `.ptah-origin.json` sidecar: `user-layer-clone-state.ts:48` (`sourceRef`) is the only identity key. It names a plugin source, not a generator.
- The generation manifest `generation-manifest.json` (`analysis-storage.service.ts:45`) is an analysis checkpoint, git-ignored, not a per-file ownership record.
- `.ptah-managed.json` and the "writer signature" (`harness-target.port.ts:157-165`, `workspace-target.ts:824`) belong to deleted writers and to rival provider targets, not to `.claude/agents`.
- `clone-rebase.service.ts:217-220`: a workspace agent upstream is just `{root}/.claude/agents/<slug>.md`.

Decision: the refusal applies by slug (kind `agent` and `isRetiredRole`). A user-written file with a retired slug is refused too. No "user-written allowed" spec exists for that reason.

## Open items for the coordinator
- `role-retired` is lower-case and kebab-case, while the other codes are upper snake case. It follows the brief.
- The bulk refusal of a non-retired role uses code `INVALID_PARAMS`, not `role-retired`.
- The bulk toolbar count text (`ptah-clone-bulk-toolbar`) is unchanged. The new text sits under it.
- No line is needed in `libs/shared/src/index.ts`: `retired-roles` is already exported.
- No file of persistence, grades, lane-outcomes, lane-routing or skill text was touched.

## Checks

NOT RUN. The permission layer denied every command that sets `NX_ISOLATE_PLUGINS=false`
("Command modifies environment variables"; the Bash tool also refused the inline variable
prefix). I did not go around the denial. The coordinator runs these, each prefixed with
`node scripts/verify.mjs --exec --task b0a2 -- ` and with `NX_ISOLATE_PLUGINS=false`:

1. `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/skill-synthesis/retired-role-guard.spec.ts libs/backend/rpc-handlers/src/lib/handlers/skills-synthesis-rpc.schema.spec.ts libs/backend/rpc-handlers/src/lib/handlers/skills-synthesis-rpc.handlers.spec.ts`
2. `npx jest --config libs/frontend/skill-synthesis-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-action-gating.spec.ts libs/frontend/skill-synthesis-ui/src/lib/services/clone-bulk-rebase.service.spec.ts libs/frontend/skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.spec.ts`
3. `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`
4. `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`
5. `npx tsc --noEmit --project libs/frontend/skill-synthesis-ui/tsconfig.lib.json`
6. `npx eslint` on all changed files listed above.

Risk to look at first: the clone card template edit (an `@if` wrapped around enhance and
revert). Run `typecheck-templates` for `ptah-extension-webview` after the checks pass.
Other specs that build a `CloneActionModel` literal by hand (if any) need `retired`.

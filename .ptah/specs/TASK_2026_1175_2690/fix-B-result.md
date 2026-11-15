# fix-B result

## Changed files

- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-skill-phase-writer.ts` and `user-layer-enhance.spec.ts`: live symlink and realpath guards under the slug lock, stale hash refusal, missing-clone guard, and revert directory creation; regression cases for folder and source links, stale body, missing SKILL.md, and missing phases folder.
- `libs/backend/skill-synthesis/src/lib/skill-file-writer.port.ts`, `skill-enhancer.service.ts`, and `skill-enhancer.phase-file.spec.ts`: expected body hash and typed stale result; stale skip reason; candidate version and machine capability preservation.
- `libs/backend/rpc-handlers/src/lib/handlers/skill-synthesis/skill-clone-file-path.ts` and its spec: real-parent and symlink checks for missing targets.

## Decisions

- The writer compares the exact current phase body hash inside the slug lock before taking a snapshot. A mismatch returns `stale: true`; the enhancer returns `stale-proposal`. Existing UI apply handling displays `applied.skipReason` (skill-clones-view.component.ts:1019).
- The phase writer still accepts direct writes without an expected hash for existing callers. The enhancer always supplies one.
- The Angular pattern skill was read. No Angular file was edited because C4 needs data from an unowned parent component.

## Checks

- `node scripts/verify.mjs --exec --task fixB-writer-final -- npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/user-layer/user-layer-enhance.spec.ts`: 22/22 passed.
- Same verify command for `fixB-enhancer`, `libs/backend/skill-synthesis/jest.config.ts`, `skill-enhancer.phase-file.spec.ts`: 10/10 passed.
- Same verify command for `fixB-rpc`, `libs/backend/rpc-handlers/jest.config.ts`, `skill-clone-file-path.spec.ts`: 15/15 passed.
- `npx tsc --noEmit --project` for agent-generation lib and spec, skill-synthesis lib and spec, rpc-handlers lib and spec: exit 0 each.
- `npx eslint <seven changed source/spec files>`: exit 0; one existing max-lines warning in skill-enhancer.service.ts.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0 after an intentional path-refusal catch was annotated; no baseline update.
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0.
- `git diff --check` on changed files: no whitespace errors.

## Not done

- C4 history filtering is unresolved. `ClonePhaseFilesComponent` receives only `{ ts, hasBody }` entries; `hasBody` describes SKILL.md, not each phase. Its parent `clone-detail-drawer.component.ts` does not pass a slug or availability map and is outside fix-B ownership. A parent change is required to query or pass per-file snapshot availability. A `ptah_agent_report` attempt was refused because the parent inbox was full.
- No UI file changed, so the requested UI render and screenshot were inapplicable.

## Risks

- Filesystem changes by external processes can still occur between a final path check and the atomic operation; the slug lock serializes Ptah operations only. The checks block the reviewed preview-to-apply and symlinked-history cases at the point of use.

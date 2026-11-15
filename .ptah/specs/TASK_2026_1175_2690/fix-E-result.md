# Changed files

- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-skill-phase-writer.ts`: record an absent phase in each applicable history snapshot; revert removes a created phase after snapshotting current state and refreshes the sidecar.
- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-enhance.spec.ts`: cover create then revert, missing snapshot directory, and retained existing phase content restore.

# Decisions

- A snapshot with a missing phase stores `.ptah-absent-phase` containing the exact phase path. Revert treats a missing snapshot directory as `restored: false`; a matching marker means restore the phase's prior absence. A snapshot with neither file nor matching marker still returns `restored: false`.
- `getHistoryBody` in rpc-handlers already returns `body: null` when the phase file is absent. It does not expose the marker; no reader edit is required for this fix. The marker distinction is used by revert only.
- No matching locally installed skill was available for this backend file operation; skill discovery was checked.

# Checks

- `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/user-layer/user-layer-enhance.spec.ts` — passed, 23 tests.
- `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.spec.json` — passed.
- `npx eslint libs/backend/agent-generation/src/lib/services/user-layer/user-layer-skill-phase-writer.ts libs/backend/agent-generation/src/lib/services/user-layer/user-layer-enhance.spec.ts` — passed.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` — exit 0, no baseline edit.
- `git diff --check` — passed.

# Risks

- Historical snapshots made before this change with a missing phase have no absence marker, so revert continues returning `restored: false` for them.

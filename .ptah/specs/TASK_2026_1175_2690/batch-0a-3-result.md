# Batch 0a-3 result: new grade keys (phase, skill, executor)

Status: code written, NOT verified. All check commands were denied by the permission layer
and are NOT RUN (see "Checks"). The coordinator must run them before acceptance.

## Changed files

Migration (persistence-sqlite):

- `libs/backend/persistence-sqlite/src/lib/migrations/0075_phase_grade_keys.ts` (new)
- `libs/backend/persistence-sqlite/src/lib/migrations/0075_phase_grade_keys.spec.ts` (new)
- `libs/backend/persistence-sqlite/src/lib/migrations/index.ts` (register version 75)
- Latest-version pin 74 -> 75 in 25 migration specs: 0028, 0030, 0038, 0039, 0040, 0041,
  0042, 0043, 0044, 0045, 0046, 0047, 0051, 0052, 0053, 0054, 0055, 0056, 0059, 0060, 0061,
  0063, 0064, 0070, 0071.

Lane outcomes:

- `libs/shared/src/lib/types/lane-outcome.types.ts` (optional `phaseKind?: PhaseKind | null`)
- `libs/backend/lane-outcomes/src/lib/lane-outcome.schema.ts` (`phaseKind` enum, default null)
- `libs/backend/lane-outcomes/src/lib/store/sqlite-lane-outcome.store.ts` (`phase_kind` column map)
- `libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.ts` (persists `phaseKind`)
- `libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.spec.ts`
- `libs/backend/lane-outcomes/src/lib/store/sqlite-lane-outcome.store.spec.ts`
- `libs/backend/lane-outcomes/src/lib/write/pipeline.test-support.ts` (fixture column)

Grades and scorecards (skill-synthesis, shared):

- `libs/backend/skill-synthesis/src/lib/skill-task-grade.store.ts`
- `libs/backend/skill-synthesis/src/lib/skill-task-grade.store.spec.ts`
- `libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts` (`writeGrades` passes the keys)
- `libs/backend/skill-synthesis/src/lib/spec-harvester.service.spec.ts` (fixture columns)
- `libs/backend/skill-synthesis/src/lib/skill-scorecard.service.ts` (`getPhaseScorecards`)
- `libs/backend/skill-synthesis/src/lib/skill-scorecard.service.spec.ts`
- `libs/shared/src/lib/types/rpc/rpc-skill-clone.types.ts` (new `PhaseScorecard` type)

Not touched: Library view, clone card, bulk rebase, clone-rebase service, `skillSynthesis:*`
mutation handlers, degradation-audit and role-census baselines, `libs/shared/src/index.ts`.

## Migration 0075 (`0075_phase_grade_keys`)

```sql
ALTER TABLE lane_outcome_records ADD COLUMN phase_kind TEXT;
ALTER TABLE skill_task_grades ADD COLUMN phase_kind TEXT;
ALTER TABLE skill_task_grades ADD COLUMN executor_kind TEXT;
```

Static SQL, nullable columns, no backfill. No stored row is rewritten. Old rows read NULL.

## Attribution rules (`SkillTaskGradeStore.findAttributions`)

1. Skill invocation events: unchanged (skill, agent or command attribution). The joined lane
   row now also gives `phase_kind` and `executor_kind` (NULL when no lane row).
2. Role lane rows: unchanged filter (`executor_kind = 'subagent'` and a registry row of kind
   `agent`). The grade now also stores the lane `phase_kind` and `executor_kind`.
3. Phase lane rows (new): every lane row of the task with a non-empty `phase_kind`, for every
   executor kind. Subject kind `phase`, slug = the phase kind, key `run:<run_id>`. The same
   workspace-root filter applies. A stored phase kind that is not in `PHASE_KINDS` reads as
   NULL and the row is dropped (it does not fail the harvest).
4. `writeGrades` writes `phaseKind` and `executorKind` on each grade. `upsert` writes and
   updates the two new columns.

`GradeSubjectKind = SkillRegistryKind | 'phase'` is the new subject kind type. The row
schemas accept `phase`.

## Double-count choice

One lane row can give a role attribution and a phase attribution. Both subjects are written,
because the role scorecard (`getScorecards`, subject kind `agent`) and the phase scorecard
read different subjects. Each scorecard counts the lane row one time.

Inside the phase scorecard (`SkillTaskGradeStore.getPhaseAggregates`):

- The current row (`source: 'phase'`, `legacy: false`) counts only `subject_kind = 'phase'`.
- The legacy row (`source: 'role-alias'`, `legacy: true`) counts `subject_kind = 'agent'`
  grades whose slug maps to the phase in `ROLE_PHASE_ALIASES`, except a grade whose task,
  attribution key and workspace root also have a `phase` grade. So a new lane row with a role
  and a phase is in the current row only. An old role grade is in the legacy row only.
- The two rows are returned apart and are not added into one total. The shared type doc
  says that a consumer must show them apart.
- The read path is read-only. A spec checks that the stored rows do not change.

## Read path

- `SkillTaskGradeStore.getPhaseAggregates(workspaceRoot)` returns `PhaseGradeAggregate[]`:
  one current row for each phase kind, plus one legacy row when legacy grades exist.
- `SkillScorecardService.getPhaseScorecards(workspaceRoot)` maps them to `PhaseScorecard[]`
  (`source: 'phase' | 'role-alias'`, `legacy`, `aliasedRoles`, counts, rate). A store
  failure logs a warning and returns `[]`.
- No new service, no new RPC method, no DI registration change. The DI guard specs
  (`container.smoke.spec.ts`, `expected-resolvable.ts`, `rpc-surface.spec.ts`,
  `surface-composition.spec.ts`) need no change.

## Shared export

`PhaseScorecard` is in `libs/shared/src/lib/types/rpc/rpc-skill-clone.types.ts`.
`rpc.types.ts` has `export * from './rpc/rpc-skill-clone.types'`, and
`libs/shared/src/index.ts` has `export * from './lib/types/rpc.types'`, so the type is
exported now. No index line is needed. If the coordinator wants a direct line, it is:

```ts
export type { PhaseScorecard } from './lib/types/rpc/rpc-skill-clone.types';
```

## Checks

All commands use `NX_ISOLATE_PLUGINS=false` and the prefix
`node scripts/verify.mjs --exec --task b0a3 -- `.

| Command | Result |
| --- | --- |
| jest persistence-sqlite: `0075_phase_grade_keys.spec.ts` + the 25 pinned migration specs | NOT RUN |
| jest lane-outcomes: `lane-outcome-recorder.service.spec.ts`, `sqlite-lane-outcome.store.spec.ts` | NOT RUN |
| jest skill-synthesis: `skill-task-grade.store.spec.ts`, `skill-scorecard.service.spec.ts`, `spec-harvester.service.spec.ts` | NOT RUN |
| `npx tsc --noEmit --project libs/<lib>/tsconfig.lib.json` for persistence-sqlite, lane-outcomes, skill-synthesis, shared | NOT RUN |
| `npx eslint <changed files>` | NOT RUN |

The permission layer denied the first check command
(`node scripts/verify.mjs --exec --task b0a3 -- npx tsc --noEmit --project
libs/backend/skill-synthesis/tsconfig.lib.json`, with and without a log redirect). The
fallback `ptah_get_diagnostics` was also denied. I did not go around the denials. No check
result exists for this batch. The coordinator must run all the commands above. Earlier in the
batch, `perl`, `sed -i`, a PowerShell script and a node script were also denied, so I made
the 74 -> 75 pin edits by hand.

Manual review only: I read the changed code for strict types (no `any`, no `@ts-ignore`, no
`as unknown as`). Zod is version 4, so `z.ZodType<T>` accepts the transform schemas in
`parseRow`. Spec fixtures that create `lane_outcome_records` or `skill_task_grades` by hand
now carry the 0075 columns.

New tests to run first:

- `0075_phase_grade_keys.spec.ts`: registration, columns, legacy NULL, new keys.
- `sqlite-lane-outcome.store.spec.ts`: "stores the phase kind and reads a legacy row as null".
- `lane-outcome-recorder.service.spec.ts`: two phase-kind tests in "task-kind resolution".
- `skill-task-grade.store.spec.ts`: phase attribution for every executor kind, key round
  trip, and legacy alias read without a double count and without a row rewrite.
- `skill-scorecard.service.spec.ts`: phase scorecards with a separate role-alias row.

## Open items

- RPC and UI wiring of `getPhaseScorecards` is not in this batch (no new RPC by brief). The
  Library view is owned by another lane.
- The lane writers must pass `phaseKind` to `recordLaneCompletion` for phase grades to
  appear. Rows without a phase kind give no phase attribution.
- `.ptah/tmp/b0a3-bump.cjs` is an unused helper script (the permission layer denied it). It
  is in a git-ignored temp folder. The coordinator can delete it.

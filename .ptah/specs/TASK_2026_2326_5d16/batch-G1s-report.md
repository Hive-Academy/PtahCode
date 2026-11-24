# Batch B11 — Input schema (route-decide args and MCP tool text)

Status: code complete. Two vscode-lm-tools jest runs are NOT RUN: blocked by the
G1 lane's in-flight `ResolvedMatrixCell.layers` type change. The coordinator
runs them after G1 lands.

## Files changed

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tools.ts`
  — `flattenStageUnion` now skips the stage note when the required-owner list is
  empty. `pins`, `preferenceSource` and `preferences` keep their own descriptions
  and no longer show "Required when stage is .". Stage-required fields
  (`taskType`, `depth`, `phases`) keep their "Required when stage is gate-0.1."
  note.
- `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts`
  — new `PreferenceSourceSchema`: rejects `;`, `\r`, `\n` on the raw input with
  the message "preferenceSource must not contain a semicolon or a line break",
  trims, treats an empty trimmed value as absent (parses as `undefined`), keeps
  the 200-character limit on the trimmed value, and documents the rule with
  `.describe`. `pins` and `preferences` get a description that says they apply
  to stage gate-0.1; `preferences.prefer` gets the candidate-id description.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tools.spec.ts`
  — three new tests: stage notes only on stage-required fields; empty-owner
  descriptions without a required note; the `prefer` entry description.
- NEW `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.spec.ts`
  — six tests for `preferenceSource` (plain text, trimmed, whitespace-only
  absent, semicolon/CR/LF at start/middle/end rejected, 200 ok / 201 rejected).

Not changed (as instructed): `__snapshots__/effective-tool-list.spec.ts.snap`
(see below), `compile-reasons.ts`, `src/index.ts`, `contracts.spec.ts`.

## Tests added

- `route-decide-args.schema.spec.ts` — 6 tests.
- `route-tools.spec.ts` — 3 new tests (plus 6 existing, not run; see below).

## Check results

- `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.spec.ts`
  — PASS, 6/6 tests.
- `npx eslint <4 changed files>` — clean, no findings (only the repo's
  no-ProjectGraph boundary-rule warnings).
- `npx tsc --noEmit -p libs/backend/lane-routing/tsconfig.lib.json` — one error,
  NOT in B11 files: `pipeline/gather.ts(304,43) TS2741` (`ResolvedMatrixCell.layers`
  missing). Cause: the G1 lane made `layers` required in
  `matrix/capability-matrix.store.ts`; `gather.ts` is B06's write set. Zero
  errors in B11 files.
- `npx tsc --noEmit -p libs/backend/vscode-lm-tools/tsconfig.lib.json` — the
  same single transitive `gather.ts` error, nothing in B11 files.
- NOT RUN: `route-tools.spec.ts` (vscode-lm-tools) — blocked by the G1 type
  change above; ts-jest fails at suite setup on the
  `@ptah-extension/lane-routing` barrel import chain.
- NOT RUN: `effective-tool-list.spec.ts` (vscode-lm-tools) — same blocker.

## Snapshot diff summary

- The snapshot `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/__snapshots__/effective-tool-list.spec.ts.snap`
  is UNCHANGED. The effective-tool-list spec could not run (blocker above), so
  the fingerprint lines for `ptah_route_decide` (3 occurrences, currently
  `8af49891ab1deaa2`) are not updated. When the spec runs, update it ONLY with
  `-u` on that one spec and check that the diff changes only the
  `ptah_route_decide` hash lines.

## Deviations

- Created a `node_modules` symlink in the worktree to the main checkout's
  `node_modules`, the same pattern the other `.claude-worktrees` entries use.
  Without it the vscode-lm-tools jest run cannot resolve `marked`.
- The two vscode-lm-tools jest runs and the snapshot update are left to the
  coordinator, per its instruction of 2026-11-24.
- No other deviations from the write set.

## Decisions

- Decision: the 200-character limit of `preferenceSource` applies to the
  trimmed value, not the raw input. Options: limit raw (200 raw rejected when
  trimmed is shorter) or limit trimmed. Evidence: the defect text orders the
  steps "reject `;`, `\r`, `\n` on the raw input ... then trim; ... keep max 200
  characters", which reads the limit after the trim; the required tests (200
  accepted, 201 rejected) pass either way. Reversible: one-line change.
- Decision: `PreferenceSourceSchema` uses two `.transform` steps (trim, then
  empty-to-undefined) over `z.preprocess`, keeping the reject-first order on the
  raw input and the existing `.optional()` shape of the gate-0.1 branch.
  Evidence: the existing schema already uses transforms (`.trim()`), and
  `z.toJSONSchema` with `io: 'input'` serializes the input side, which the
  current tool builder already relies on. Reversible.

## Open questions

- None for B11. The coordinator must run the two vscode-lm-tools specs and the
  snapshot `-u` update after G1 lands.

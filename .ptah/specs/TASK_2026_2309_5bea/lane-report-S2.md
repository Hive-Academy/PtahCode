# S2 shared UI extensions

## Files changed

All source and test paths below are relative to `libs/frontend/ui/src/lib`.

- `charts/chart.types.ts`
- `charts/meter.component.ts` and `charts/meter.component.spec.ts`
- `charts/ring.component.ts` and `charts/ring.component.spec.ts`
- `charts/stat.component.ts` and `charts/stat.component.spec.ts`
- `charts/charts.a11y.spec.ts` and `charts/meter.marker.a11y.spec.ts`
- `time/timer.component.ts`, `time/timer.component.spec.ts`, and `time/time-a11y.spec.ts`

## Public API

```ts
export interface PtahMeterSegment {
  readonly value: number;
  readonly tone: PtahMeterTone;
  readonly label: string;
}

readonly segments = input<readonly PtahMeterSegment[] | null>(null);
readonly unreported = input<'none' | 'partial' | 'missing'>('none');
readonly track = input<'2px' | '3px' | undefined>(undefined);

export type PtahRingSize = PtahChartSize | 'dot' | 'inline' | 'stat' | 'row' | 'tile' | 'lg' | 'xl';

export type PtahStatAccuracy = 'exact' | 'lower-bound' | 'approximate' | 'lower-bound-approximate';

readonly detail = input<string | undefined>(undefined);
readonly accuracy = input<PtahStatAccuracy>('exact');
readonly accessibleValue = input<string | undefined>(undefined);

export type PtahTimerState = 'running' | 'frozen' | 'unknown';

readonly startedAt = input.required<PtahTimeInput | null>();
readonly durationMs = input<number | null>(null);
readonly unknownReason = input<string | undefined>(undefined);
readonly description = input<string | undefined>(undefined);
```

## Acceptance

- Meter specs cover a zero-width legacy fill, a tiny positive width, an empty segmented track at zero subtotal or max, invalid segment filtering, proportional widths and the final remainder. The partial stub is a sibling of the track, its fixed width comes from CSS, and all-missing coverage retains the stub and visible status with no track.
- Ring specs cover the 11 px and 20 px footprints, SVG geometry, hidden center and subtext classes, and unchanged accessible value text. Both sizes are included in `BOX`, `CENTER`, `SUB`, and `GEOMETRY`.
- Timer specs cover null start with absent, zero, negative and non-finite duration values. They assert muted `--:--`, no datetime and no clock holder. A finite positive duration renders statically and can supply a description. The accessibility spec checks the spoken reason and the timer's silent and non-focusable behavior.
- Stat specs cover the em dash placeholder and all accuracy glyphs. Accessibility specs assert one spoken value, hidden visual value and unit, hover and focus opening, blur and Escape dismissal, and Escape preserving focus.
- Legacy cases cover the meter role and animation classes, ring value text, stat defaults, and timer date/ISO inputs, clock release, and Stopped announcement. New inputs are opt-in, and the existing required timer input accepts the additional null value.

## Checks

- Pass — 181 tests across seven suites. `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/charts/meter.component.spec.ts libs/frontend/ui/src/lib/charts/ring.component.spec.ts libs/frontend/ui/src/lib/charts/stat.component.spec.ts libs/frontend/ui/src/lib/charts/charts.a11y.spec.ts libs/frontend/ui/src/lib/charts/meter.marker.a11y.spec.ts libs/frontend/ui/src/lib/time/timer.component.spec.ts libs/frontend/ui/src/lib/time/time-a11y.spec.ts`
- Pass — `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json`
- Fail (exit 2) — `npx tsc --noEmit --project libs/frontend/ui/tsconfig.spec.json`. A second run filtered diagnostics by path and found 16 TypeScript errors across the spec project, zero in S2 files. Errors outside S2 include DOM observer mock types, nullable DOM references and ES targets for regex flags and BigInt literals.
- Pass — `npx eslint libs/frontend/ui/src/lib/charts/chart.types.ts libs/frontend/ui/src/lib/charts/meter.component.ts libs/frontend/ui/src/lib/charts/ring.component.ts libs/frontend/ui/src/lib/charts/stat.component.ts libs/frontend/ui/src/lib/time/timer.component.ts libs/frontend/ui/src/lib/charts/meter.component.spec.ts libs/frontend/ui/src/lib/charts/ring.component.spec.ts libs/frontend/ui/src/lib/charts/stat.component.spec.ts libs/frontend/ui/src/lib/charts/charts.a11y.spec.ts libs/frontend/ui/src/lib/charts/meter.marker.a11y.spec.ts libs/frontend/ui/src/lib/time/timer.component.spec.ts libs/frontend/ui/src/lib/time/time-a11y.spec.ts`

Earlier Jest runs exposed two test setup errors. The new accessibility fixture needed the existing fake clock provider, and the static duration assertion needed to match the existing seconds-form datetime `PT65S`. The all-specs run above initially failed and passed after both corrections. The focused command below reproduced the datetime assertion failure before its correction.

```sh
npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/time/timer.component.spec.ts
```

## Decisions

- The two small rings reuse the existing 36-unit geometry and compact hidden-text classes. They retain the same accessible naming as larger rings. This follows the existing `xs` pattern and can be changed per size.
- Static durations use the existing `frozen` state and do not announce Stopped when the explicit duration takes precedence. Null starts without an accepted duration use `unknown`. The existing invalid timestamp placeholder is preserved. This follows the plan's exact unknown-state condition and preserves timestamp consumers.
- `detail` opts into the focusable tooltip. The existing `title` input keeps its native behavior on its own. With both supplied, the keyboard-accessible tooltip takes precedence to avoid duplicate hover text. The choice is local to the stat template and host bindings.
- The accuracy literal names reflect lower-bound and approximate meanings without requiring consumers to supply visual glyphs. The glyph mapping is local to `ptah-stat`.

## Extra reads and limitations

- Read only the specified line ranges of `batches.md` and `implementation-plan.md`, and source and specs in the write set. No extra application code or review files were read.
- Skill files read from the worktree were `.claude/skills/angular-frontend-patterns/SKILL.md`, its `references/component-patterns.md`, and `.claude/skills/ui-ux-designer/SKILL.md`. No dedicated skill loader was listed. Ptah file search located the workspace skills.
- Used `ptah_ast_analyze` for source structure and fell back to scoped native reads for full templates and for three spec AST queue timeouts.
- Scoped `ptah_get_diagnostics` returned an incomplete result after a 45-second TypeScript timeout. The focused native checks above provide the check results.
- Electron visual review and coordinator verification remain outside this lane's permitted check list.

# Batch U02 review: shared list-detail split adaptation

Review family: claude (implementer: codex)

**Score: 8.5 / 10**
**Verdict: APPROVED** (no blocking defect, two low-severity notes)

## Acceptance criteria

| Criterion | Result | Evidence |
| --- | --- | --- |
| Default 768 behavior unchanged | Pass | `list-detail.component.ts:23-38` the 768 set is identical to the old literals. Default `splitAt` is 768 (line 23). The other consumers (`gallery-components.component.ts:47`, `inbox-layout-demo`) do not set `splitAt`. `list-row.component.ts` only mentions the component in a comment. |
| 960 layout, back, focus | Pass | Classes at lines 31-37. Focus and resize thresholds use `this.splitAt()` at lines 63 and 81. |
| Observer disconnect on destroy | Pass | Line 70 `destroyRef.onDestroy(() => observer.disconnect())`. Both specs assert it. |
| Literal Tailwind strings | Pass | Every class is a full literal inside the `.ts` file. `tailwind.config.js:7-10` scans `src/**` and `createGlobPatternsForDependencies`, which covers `libs/frontend/ui` `.ts` files (the spec excludes `*.spec` only). |
| `[class]` with static `class` and `[class.hidden]` | Pass | Angular merges a static `class`, a `[class]` binding and `[class.x]` bindings. The static classes stay. The specs check `hidden` on and off after selection and back (ui spec, gallery spec line 66). |
| Gallery spec | Pass | Mounts the real component. It checks `splitAt()===768`, projected list, empty and detail content, selection, Back, focus move, and observer disconnect. It uses a typed `ResizeObserver` fake. |
| UI spec: six query classes, both breakpoints | Pass | `describe.each([768, 960])` checks grid, grid-cols, pane `!block` (both panes), border-r, back `hidden`, meta columns, and the 1200 px classes. It also checks that no class of the other breakpoint leaks. |

## Defects (all low, non-blocking)

1. `list-detail.component.ts:23-24` The input type `768 | 960` is checked at compile time only. At runtime any other value (for example a dynamic binding) falls to the 768 class set, but the focus thresholds would use the unsupported number. Fix: add `transform: (v) => v === 960 ? 960 : 768`, or compute thresholds from the same narrowed value.
2. `list-detail.component.spec.ts` The spec sets `splitAt` once per run. No test changes `splitAt` at run time on a live component to prove the class swap. Fix: add one test that calls `setInput('splitAt', 960)` after first render and checks that the 768 classes are gone and the `hidden` toggle is intact.

## Check results

- `npx jest` list-detail spec: 1 suite passed, 7 tests passed.
- `npx jest` gallery-components spec: 1 suite passed, 1 test passed.
- `npx eslint` on the three files: no output (clean).
- Real CSS layout was not checked (JSDOM). Verify later in R01 in Electron.

## Decisions

None open.

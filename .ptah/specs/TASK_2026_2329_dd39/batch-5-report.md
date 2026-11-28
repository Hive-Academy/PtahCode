# Batch 5 report: Routing evidence summaries

## Files changed

- `libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component.spec.ts`

No shared UI or overlay files were changed. No commit or push was made.

## Design summary

- Added a computed, signal-based view model over the existing RPC response.
- Grouped evidence by CLI with catalog state, catalog size, fetch freshness, measured-model count, and sampled-cell count.
- Added one compact card per measured model with supported-effort chips, effort provenance, measured-cell count, and total samples.
- Rendered only keys with `sampleCount > 0` in a responsive task-kind and effort cell grid.
- Added native `details` disclosures for scores, sample counts, age, stale state, effort omission, and all existing funnel metrics.
- Moved unmeasured catalog models into a collapsed disclosure.
- Added distinct empty states for a CLI without models and a CLI without measured outcomes.
- Preserved family-default evidence, historical models, unknown scores, decision-model outcomes, loading, errors, and retry behavior.
- Used OnPush, existing Ptah badges, design tokens, Tailwind classes, native keyboard disclosures, and text labels that do not depend on color.

## Decisions

- Do not sum wildcard and effort-specific samples for the same task kind. The card displays `Sample totals overlap` and the detail view explains why. This prevents duplicate outcome counts.
- Count measured models and sampled cells at CLI level instead of summing overlapping model sample counts.
- Keep decision-model outcomes in the existing compact table because Batch 5 changes only CLI/model evidence presentation.

## Check results

| Check | Result |
| --- | --- |
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component.spec.ts` | Pass: 1 suite, 7 tests, 0 failures |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | Pass: 0 errors |
| `npx eslint libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component.spec.ts` | Pass: 0 errors, 2 warnings |
| `git diff --check` | Pass |

The ESLint warnings state that `@nx/enforce-module-boundaries` was skipped because no cached Nx project graph is available. The lane did not run Nx to create that cache.

Editor diagnostics reported no issues in the two requested files. The editor also reported errors in unrelated sibling chat test files. The requested standalone TypeScript project check passed.

The updated tests cover sparse evidence, zero-sample filtering, supported efforts, provenance, total samples, native disclosure expansion, funnels, decision models, family defaults, historical models, unknown scores, overlapping totals, empty CLIs, loading, errors, and retry.

## Open risks

- Electron visual review was not run. No active browser or Electron renderer session was available, and CLI lanes may not start build or serve targets. Sparse, empty, populated, narrow-pane, and keyboard states still require visual review in Electron.
- The responsive cell grid uses existing utility classes and design tokens, but its final wrapping and contrast need rendered confirmation.
- Full project gates and Angular template type-checking remain with the coordinating agent under the repository verification rules.

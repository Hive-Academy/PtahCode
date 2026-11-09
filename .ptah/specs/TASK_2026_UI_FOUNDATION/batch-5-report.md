# Batch 5 report — UI class lint ratchet

## Files

- `tools/ui-class-audit/check-ui-classes.ts`: template scanner and per-file/per-token ratchet; fixed variant plus important matching and restricted seeding to a missing baseline.
- `tools/ui-class-audit/check-ui-classes.spec.ts`: corrected invalid TypeScript fixtures and one ternary expectation; added a new-file update regression test.
- `tools/ui-class-audit/baseline.json`: explicitly seeded normalized, repository-relative legacy counts.
- `tools/ui-class-audit/project.json`, `jest.config.ts`, `tsconfig.json`: existing Nx targets and test configuration reviewed; no edits needed.

## Exact matching rule

Scan external `.html` templates and inline `template:` strings in `.ts` under `apps/ptah-extension-webview/src` and `libs/frontend/**/src`. Exclude `libs/frontend/ui/**`, `libs/frontend/webview-e2e-harness/**`, `*.spec.ts`, `*.test.ts`, dependencies and generated output. Inspect static `class` and `ngClass`, `[class.foo]`, and literals in `[class]`, `[ngClass]`, `[className]`, `[attr.class]`. Report `<dynamic>` when a class expression cannot be proven safe. HTML tag names are never inspected.

After removing Tailwind variant prefixes and a leading `!`, block tokens equal to `btn`, `input`, `select`, `textarea`, `card`, `badge`, `alert`, or `skeleton`, plus each root followed by `-` and a modifier. Exempt Tailwind `select-none`, `select-text`, `select-all`, `select-auto`. Each file has a count for each blocked token. Increases fail with file:line:class and a replacement hint from `@ptah-extension/ui`: `ptahButton`, `ptah-field` with `ptahFieldControl`, `ptah-surface-card/section/tile`, `ptah-status-badge`, `ptah-state-panel`, or `ptah-toolbar`. Decreases pass and are reported. Only explicit `--update-baseline` writes the baseline; after initial seeding it cannot raise counts or admit a new file.

## Baseline totals

- Files with blocked usage: **449**.
- Blocked tokens, including `<dynamic>`: **5,548**.
- Sanity checks: `apps/ptah-extension-webview/src/app/app.html` contains baselined `alert alert-error`; `libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html` contains legacy alert classes. The baseline contains **0** `libs/frontend/ui` files and **0** `select-none` tokens.

| File | Tokens |
| --- | ---: |
| `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts` | 109 |
| `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts` | 71 |
| `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts` | 63 |
| `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts` | 62 |
| `libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.ts` | 57 |
| `libs/frontend/marketplace/src/lib/smithery-surface.component.ts` | 54 |
| `libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts` | 49 |
| `libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts` | 49 |
| `libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html` | 48 |
| `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-header.component.ts` | 45 |

## How it runs in verify

`scripts/verify.mjs` selects `lint,test,typecheck` by default and uses `nx affected` without `-p`; `-p ui-class-audit` selects this one project. `tools/ui-class-audit/project.json` defines `ui-class-audit:lint` as the scanner command. Its `inputs` include scanner source, baseline and app/frontend HTML and TypeScript template globs, so template changes invalidate the lint target's cached result when that target runs. The explicit `update-baseline` target is separate and uncached.

Nx target inputs control hashing. This check did not establish that `nx affected` selects `ui-class-audit` for a template-only edit in another project; the scoped verify command explicitly selects it.

## Tests

`check-ui-classes.spec.ts` covers roots, modifiers, variants, Tailwind select exemptions, static and bound HTML classes, dynamic expressions, comments, inline templates and line numbers, new-file and same-file increments, unchanged usage, decreases, exclusions, and initial-only seeding. The first scoped verify exposed four failing tests; the matcher and fixtures were corrected and the full scoped gate was rerun successfully. Scoped Ptah TypeScript diagnostics reported 0 errors and 0 warnings after edits.

## Verify command and summary lines

```text
npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts --update-baseline
ui-class-audit: baseline.json updated (initial seed or decreases; prunes stale files; never raises an established count)

npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts
ui-class-audit: TOTAL 5548 blocked token(s) across 449 file(s); 0 token count(s) over baseline
EXIT=0

npm run verify -- -p ui-class-audit
[verify] starting verify lint,typecheck (ui-class-audit)
NX   2 tasks: 2 succeeded
[verify] starting verify test (ui-class-audit)
NX   1 task: 1 succeeded
[verify] lock released after 30.4s, exit code 0
EXIT=0
```

## Decisions

- **Initial-only seed:** Explicit update captures legacy usage only when the baseline file is absent. Once established, new files remain failures. The alternatives were automatic admission on update or a review-visible manual baseline edit. The per-file ratchet requirement favors the latter. Reversible by changing policy and tests.
- **Ternary condition:** A condition such as `isWide()` is not a class source; literal class branches are inspected. The implementation and its other ternary test support this interpretation. Reversible by changing expression analysis and tests.
- **Skill availability:** No host skill-loading tool or matching skill catalogue was exposed to this lane, so no optional skill was loaded.

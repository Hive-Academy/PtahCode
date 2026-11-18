# Batch U07 report

Status: implementation complete within the permitted write scope. Both TypeScript checks, ESLint, shared tests and new Bots navigation tests pass. One existing routing assertion requires coordinator action because the array-only restriction forbids updating it.

## Files and acceptance

| File | Lines | Result |
| --- | ---: | --- |
| libs/shared/src/lib/types/webview-surface.types.ts | 190 | Added bots to ViewType and immediately before machines in SURFACE_ROUTE_IDS. |
| libs/shared/src/lib/types/webview-surface.types.spec.ts | 172 | Exact expected list adds bots before machines; explicit identity, path, segment round trip, initial-view acceptance and alias identity assertions. |
| apps/ptah-extension-webview/src/app/app.routes.ts | 225 | Electron-only bots route directly before machines; SURFACE_ACTIVE factory for bots; dynamic import resolves BotsPageComponent with no eager feature import. |
| apps/ptah-extension-webview/src/app/webview-routing.spec.ts | 1368 | Only ELECTRON_ONLY_SURFACES changed: bots before machines. Final machines/chat expectations unchanged. Existing oversized-file exception retained. |
| apps/ptah-extension-webview/src/app/bots-route.spec.ts | 89 | Structural contract plus real Router direct /bots navigation: Electron reaches /bots and requests lazy loader once; other host reaches /chat without requesting it. |

New file and edited production route are below 700 lines. No control markup or raw DaisyUI control classes added. npx prettier --write ran on all five files; the existing large routing spec was preserved byte-for-byte outside the permitted array change, avoiding unrelated formatter edits. No bots-ui files were read, edited or directly checked by this lane; renderer checks necessarily resolve its exported types.

## Decisions

- **Coordinator action required:** webview-routing.spec.ts:1272 still asserts machines immediately follows review-runs. Required bots placement makes that obsolete. Options: coordinator changes the assertion to machines immediately after bots (recommended), or delegates a one-line exception to this lane. Evidence: the existing route-order test and U07's explicit array-only write restriction. Reversible: yes. Left untouched. Escalation via ptah_agent_report was rejected with parent-inbox-full.
- Use an isolated lazy component in the direct-navigation test, preserving the real route provider, Electron guard and wildcard. Options: construct the concurrently edited page, or isolate its loader (chosen). Evidence: explicit prohibition on checking bots-ui while another lane edits it and existing router composition testing style. The chat first-run guard is bypassed solely in this test's cloned route table. Reversible: yes.
- No project.json implicit dependency change is indicated: the renderer project has no explicit implicitDependencies list; dynamic imports express the dependency. The inspected assert-eager-bundle.mjs checks eager markers, not an import allowlist; no allowlist edit indicated. No configuration changed. Reversible: yes.
- Exhaustive-list search across repository TypeScript (excluding bots-ui) found no extra exhaustive ViewType/SurfaceId record or switch needing updates. Existing core test route maps are Partial<Record<ViewType, Routes>> and iterate SURFACE_ROUTE_IDS. The route-order assertion above is the only required extra adjustment found.

## Command results

- PASS: npx tsc --noEmit --project libs/shared/tsconfig.lib.json (exit 0).
- PASS: npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json (exit 0).
- PASS: npx prettier --write on the five files, with array-only preservation described above.
- PASS: npx eslint libs/shared/src/lib/types/webview-surface.types.ts libs/shared/src/lib/types/webview-surface.types.spec.ts apps/ptah-extension-webview/src/app/app.routes.ts apps/ptah-extension-webview/src/app/webview-routing.spec.ts apps/ptah-extension-webview/src/app/bots-route.spec.ts (exit 0).
- PASS: npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/webview-surface.types.spec.ts (exit 0; 1 suite, 47 tests). Jest emitted an ESM config warning but completed successfully.
- PARTIAL: npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/bots-route.spec.ts apps/ptah-extension-webview/src/app/webview-routing.spec.ts apps/ptah-extension-webview/src/app/app.routes.spec.ts (exit 1). bots-route.spec.ts and app.routes.spec.ts PASS. Combined result: 2 suites passed, 1 failed; 120 tests passed, 1 failed. Sole failure: webview-routing.spec.ts:1272 expects machines index 10 (immediately after review-runs), receives 11 (required bots insertion). No other failed tests. Existing Angular zoneless/Zone.js and logging output also appeared.
- PASS: focused raw-control-class audit of the new spec returned no matches.
- PASS: repository grep for SURFACE_ROUTE_IDS, ViewType/SurfaceId records and machines/review-runs switch cases completed; findings documented under Decisions.
- ptah_get_diagnostics scoped to all five files returned unavailable after 45 seconds, with no cleanliness claim. Native TypeScript commands above provide verification.

## Scope and limitations

- Skill discovery/loading through the CLI host is unavailable: no skills catalogue or skill-loading tool was exposed. Applied the supplied repository Angular/routing instructions; did not reconstruct unavailable skill steps.
- No git commands or writes. The existing ui-gallery route and related expectations were present before these edits; this lane did not introduce or remove them (Prettier only reflows the route file).
- No rendered visual check: this batch changes routing identity only; the page belongs to another lane and build/serve/Electron launch are outside this lane's permitted checks. No screenshot or UI-quality claim.

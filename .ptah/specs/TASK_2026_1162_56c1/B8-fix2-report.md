# B8 frontend fix round 2

## Changed files

- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`: Reset workspace data, reject stale search data, show failed skill details, and use safe action errors.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html`: Show install progress on review, block review controls during install, and bind the stored search query.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`: Add failed install, workspace reset, failed guidance, safe error, and install dismissal tests.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill.store.ts`: Add one reset method for workspace state and store the search query, search error, and search loading flag.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.ts`: Use the stored search query through input and output, and rename outputs to avoid DOM event names.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.html`: Bind the new query and event names.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts`: Set the required query input and bind the renamed selection output.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.ts`: Rename the cancel output to avoid a DOM event name.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.html`: Bind the renamed cancel output.
- `libs/shared/src/lib/types/rpc.types.ts`: Add optional failed skill and reason fields to the install response.

## Decisions

- Escape during install: the native modal has no dismissal block input or preventable cancel output. I used the brief's fallback. The review page shows install progress and makes its controls inert while the request runs; the stage guard prevents a second install. This is reversible if the modal later gains a dismissal block API.
- RPC errors: show `result.error` only when `ClaudeRpcService` supplies a parsed user error code. Otherwise use fixed text for each action.

## Verification

- `npm run verify -- -t lint,typecheck,test -p @ptah-extension/onboarding`: pass, exit 0. Onboarding Jest: 52 suites passed, 609 tests passed. The first run failed one Back cancellation test; the guard was fixed. A second run found lint errors in output names; they were fixed before this passing run.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: pass, exit 0, one target succeeded.
- `ptah_get_diagnostics` on changed TypeScript files: unavailable after its 45 second limit. The scoped typecheck and template typecheck commands passed.
- Electron visual check: unavailable because this lane had no running Electron renderer and the brief forbids starting one.

## Unexpected

- The skill loading tool was not available in this lane. Repository instructions and source patterns guided the work.
- The verify commands printed warnings about Jest module config files outside this write set. No backend file was edited.

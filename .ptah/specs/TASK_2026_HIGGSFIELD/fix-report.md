# Fix report: TASK_2026_HIGGSFIELD

## Root cause

`libs/backend/cli-agent-runtime/src/lib/mcp-directory/oauth/mcp-oauth.service.ts:339` (on main)
built the authorize scope as `options.scope ?? meta.scopesSupported?.join(' ')`. `meta` is the
authorization server's RFC 8414 document, so Ptah asked Clerk for every scope Clerk knows,
including `private_metadata`, which a dynamically registered client may not request. Clerk sent
`error=invalid_scope` back to the redirect URI.

## Fix

- `mcp-oauth-metadata.ts`
  - `discoverAuthorizationServer` now returns a `ProtectedResourceDiscovery`:
    `{ authorizationServer, challengeScope?, resourceScopes? }` (it returned a string before).
  - `readProtectedResourceMetadata` also returns the document's `scopes_supported`.
  - The 401 probe (`readResourceChallenge`, which replaces `discoverPrmUrlFromChallenge`) reads both
    `resource_metadata` and `scope` through the new `parseScopeChallenge` (RFC 6750 §3).
  - The new `selectAuthorizationScope(explicit, resource)` picks the explicit scope first, then the
    challenge `scope`, then the PRM `scopes_supported`, and otherwise returns `undefined`, so no
    `scope` parameter is sent.
  - `AuthServerMetadata.scopesSupported` was removed, so the AS list can no longer be used as a
    request scope.
  - An HTML 200 body never counts as metadata: `json()` throws and the candidate is skipped. New
    specs pin this for both the PRM and the AS document.
- `mcp-oauth.service.ts`: `discover()` returns `{ meta, resource }`, and `connect()` uses
  `selectAuthorizationScope(options.scope, resource)` (line 355). The token exchange records this
  same selected scope as its fallback (`exchangeCode`, `scope: str(data.scope) ?? input.scope`).
  Refresh keeps `token.scope`, which now comes from the same rule. Neither token request sends a
  `scope` parameter.
- `loopback-oauth-callback-listener.ts`: on `?error=`, the browser page and the rejection now
  include `error_description`, with control characters stripped and the text capped at 300
  characters. The message reaches the UI unchanged as `err.message` from
  `mcpDirectory:connectOAuth`. Example:
  `Authorization denied: invalid_scope - The OAuth 2.0 Client is not allowed to request scope 'private_metadata'`.
  Before this change the user saw only `invalid_scope`.

## Catalog entry

- `libs/shared/src/lib/connectors/ptah-connectors.catalog.ts:284`, after Webflow in the `design`
  `oauth-dcr` block: id `higgsfield`, label `Higgsfield`, URL `https://mcp.higgsfield.ai/mcp`, kind
  `oauth-dcr`, description "AI image and video generation; uses your Higgsfield credits.",
  `verifiedAt: '2026-11-24'`. No `scopes`: discovery supplies the scope.
- Logo: no vendored mark. `higgsfield` was added to `MONOGRAM_SLUGS` in
  `libs/frontend/ui/src/lib/native/brand-mark/brand-marks.vendored.ts`, which is what Zernio, Canva
  and the other entries without a logo do. `brand-slugs.spec.ts` requires every catalog
  `brandSlug` to be either vendored or a monogram.
- `ptah-connectors-catalog.live.spec.ts`: Higgsfield was added to the C1.1 probe candidates. The
  call site was adapted to the new return shape.

## Specs

- `__fixtures__/higgsfield-oauth.fixture.ts` (new): the measured Higgsfield/Clerk shapes. They are
  the 401 challenge, PRM path form, Clerk path-insert metadata with the full `scopes_supported`,
  the HTML 200 root, DCR and the token response.
- `mcp-oauth-metadata.spec.ts`: `parseScopeChallenge` and `selectAuthorizationScope`. The
  regression cases are: the challenge wins, PRM comes next, no scope when none is known, and a
  blank explicit scope is ignored. Also covered: Higgsfield discovery by the PRM path and by the
  challenge, the challenge scope on the origin fallback, Clerk metadata read from the path-insert
  form, HTML 200 rejected for both AS and PRM, and the AS metadata no longer carrying
  `scopesSupported`.
- `mcp-oauth.service.spec.ts`: end-to-end `connect()` over the Higgsfield fixture. The authorize
  URL has `scope=openid email offline_access`, never `private_metadata`, and the stored token
  scope matches. It also covers: the challenge route, an explicit scope winning, and the scope
  being omitted even though the AS publishes `scopes_supported`.
- `loopback-oauth-callback-listener.spec.ts`: `error_description` is surfaced.
- `ptah-connectors.catalog.spec.ts`: the Higgsfield entry shape.

## Check results (focused, under `scripts/verify.mjs --exec --task hf`)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` | exit 0 |
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` | exit 0 |
| `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` | exit 0 |
| jest cli-agent-runtime: metadata, service, loopback, live (skipped), override-resolver specs | 5 suites, 94 passed, 1 skipped |
| jest cli-agent-runtime: loopback spec, after the lint fix | 11 passed |
| jest shared: `ptah-connectors.catalog.spec.ts` | 34 passed |
| jest ui: `brand-slugs.spec.ts` | 49 passed |
| `npx eslint <12 changed files>` | 0 errors. One `max-lines` warning on `ptah-connectors.catalog.ts`, which was already over 700 on main (the rule is warn-level) |

Not run, per the task brief: `npm run verify`, `nx`, builds, the Angular marketplace specs
(they count `PTAH_CONNECTORS.length` dynamically), `typecheck` for `frontend/ui` (a one-string
array change) and the live probe (`PTAH_LIVE_PROBES=1`).

## Decisions

- **The challenge scope is used only when the 401 was read.** Discovery still reads the 401
  only after the PRM path and root documents fail. Probing it every time would add an
  unauthenticated request per connect and reorder discovery, which pinned specs fix in place.
  For Higgsfield, the challenge and the PRM name the same scope. This is reversible: move
  `readResourceChallenge` ahead of the PRM loop.
- **`AuthServerMetadata.scopesSupported` was deleted, not left unused.** The field has no
  remaining legitimate consumer, and keeping it invites the bug back. This is reversible, but
  the field is exported through the `cli-agent-runtime` barrel type, and no consumer outside the
  lib reads it (grep).
- **`discoverAuthorizationServer` returns an object instead of a string.** Its callers are the
  service, the live spec and the barrel export, and no consumer outside the lib exists. The
  callers were updated in place, with no wrapper.

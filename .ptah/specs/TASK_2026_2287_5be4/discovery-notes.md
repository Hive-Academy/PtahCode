# Discovery notes: named Claude account usage without a session

Status: design chosen and verified against source. NO source edits made yet for this part.
(Predecessor work for Defect A/B is in the worktree, uncommitted; do not redo it.)

## Key facts verified in source
- Stored profiles: `ProviderAccountStore.list()` (auth-providers/src/lib/accounts/provider-account.store.ts:188)
  returns rows with `profile_id, canonical_route, state, identity_ref` (schema ~47-53). `identity_ref`
  is set at sign-in to `status.identityReference` (provider-account-actions.service.ts:552/647).
- `identity_ref` = `claudeIdentityReference(email, org)` = sha256hex(`ptah-quota-owner\0<email>\0<org>`)
  (agent-sdk/src/lib/helpers/claude-identity-reference.ts).
- `claudeAccountOwnerKey` = `anthropic#account:` + sha256hex(FINGERPRINT_DOMAIN + `email\0org`).slice(0,16),
  FINGERPRINT_DOMAIN = 'ptah-quota-owner\0', FINGERPRINT_LENGTH = 16 (provider-owner.resolver.ts:65-66,
  127-137, 316-321, 417-423). So owner key == `anthropic#account:` + identity_ref.slice(0,16).
  => the stored profile DOES give the owner key, with no email and no file read.
  Caveat: an old profile may hold an email-only ref (certifier tolerates it, claude-route-certifier.ts:303);
  then the reader's .claude.json check (email+organizationName) mismatches -> account-unverified (fails safe).
- Existing port `ClaudeUsageProfileRoots` (auth-providers-tokens/src/lib/usage-profile-roots.port.ts),
  token `AUTH_PROVIDERS_TOKENS.SDK_CLAUDE_USAGE_PROFILE_ROOTS` (tokens.ts:86), adapter
  `UsageProfileRootsAdapter` (accounts/usage-profile-roots.adapter.ts), registered in
  auth-providers/src/lib/di/register.ts:194-200 with fallback `{ listActiveRoots: async () => [] }`
  when no sqlite. Mocks of the port: agent-sdk usage-source-registry.spec.ts:9 (`{ listActiveRoots }`).
- Snapshot service (rpc-handlers plan-limits-snapshot.service.ts:265-335) passes `entry.target` unchanged
  to `getOwnerSnapshot` -> NO edit needed there.
- `PlanOwnerOrigin` is only consumed inside cli-agent-runtime.

## Design (chosen)
1. Port: add `listSignedInAccounts(): Promise<readonly { profileId; canonicalConfigDir; identityReference }[]>`
   to `ClaudeUsageProfileRoots`; adapter filters `state === 'signed-in' && identity_ref` (make `state`,
   `identity_ref` optional in its reader row type so the old spec still compiles); register.ts fallback adds
   `listSignedInAccounts: async () => []`; update agent-sdk usage-source-registry.spec.ts mock.
2. auth-providers provider-owner.resolver.ts: export
   `claudeOwnerKeyFromIdentityReference(ref): string | null` (requires /^[0-9a-f]{64}$/, returns
   `${normaliseOwnerProviderId('anthropic')}#account:${ref.slice(0, 16)}`). Spec: equals
   `claudeAccountOwnerKey({email, organization})` for `claudeIdentityReference(email, org)` (fixture email
   like user@example.invalid). Export from quota/index.ts barrel.
3. plan-usage-reader.types.ts: new usage-only type
   `ClaudeUsageDirectory { kind: 'stored-profile-usage'; profileId; canonicalConfigDir }` and optional
   `claudeUsageDir?: ClaudeUsageDirectory` on `PlanOwnerTarget`. No brand -> never a `ClaudeAccountNamedRoute`.
   Export type from quota/index.ts.
4. OAuth reader: configDir = named claudeRoute dir, else `target.claudeUsageDir?.canonicalConfigDir`;
   both "named" cases never use env/home; empty dir -> account-unverified. Identity checks unchanged.
5. Live reader claude-plan-usage.reader.ts:170: before the ambient probe, if `target.claudeUsageDir`
   (and no named claudeRoute) -> `invalidSource('no-open-session')` (never `probe.readPlanUsage`).
6. plan-usage.service.ts: copy `claudeUsageDir` in the target snapshot (~265); flightKey (~660) includes
   `['usage-dir', ownerKey, profileId]` for such targets so it never joins an ambient flight. Cache stays
   keyed by owner key (decision: same owner key == same verified account; distinct accounts never share).
7. plan-owner-read.ts: context gains `claudeUsageDir?: ClaudeUsageDirectory`; anthropic without sessionId but
   with claudeUsageDir -> `{kind:'read', target:{providerId:'anthropic', ownerRef, claudeUsageDir:{...}}}`.
8. Discovery: optional `@inject(AUTH_PROVIDERS_TOKENS.SDK_CLAUDE_USAGE_PROFILE_ROOTS, {isOptional:true})`
   as LAST ctor param; new origin 'named-account'; new source placed BEFORE 'session' (so a named account
   with a live session also gets the OAuth reading instead of the known no-open-session entry) mapping each
   account -> owner from `claudeOwnerKeyFromIdentityReference` -> `planOwnerRead(owner,{claudeUsageDir})`;
   add each entry to `namedEntries` (so it never vouches for the ambient missing-email filter).
   Skip accounts whose ref is not a valid 64-hex.

## Tests to add (no real files, no network)
- plan-owner-read.accounts.spec.ts: usage-dir read plan; no dir -> NO_OPEN_SESSION (old).
- plan-limit-owner-discovery.service.spec.ts: stored account listed as read with claudeUsageDir and owner key
  from ref; none stored -> old result; ambient selected-provider entry has no claudeUsageDir.
- claude-oauth-plan-usage.reader.spec.ts: usage-dir reads only its dir files (env set to other dir);
  owner mismatch -> account-unverified.
- claude-plan-usage.reader.spec.ts: usage-dir target -> no-open-session, probe.readPlanUsage not called.
- plan-usage.service.spec.ts: usage-dir target reaches OAuth fallback, flight key distinct from ambient.
- usage-profile-roots.adapter.spec.ts: listSignedInAccounts filters state/ref.

## Left
Everything in "Design" steps 1-8 and tests; then focused checks (jest/tsc/eslint) per project:
auth-providers, auth-providers-tokens, agent-sdk (spec mock), cli-agent-runtime.

# Code logic review — TASK_2026_2202_e873

Scope: the uncommitted diff (17 modified files) plus 4 untracked files, read in full.
Inputs: `git diff`, `git status --short`, `task.md`, `implementation-report.md`
(claims only), and the unchanged consumers of the identity reference. No test,
build or Nx command ran. The auth-providers Jest suites did not run in this
worktree (see Not checked).

## Verdict

REVISE — score 6/10 (real gaps). The core logic of both parts is correct: the
certifier tolerance cannot accept another account, the re-probe is bounded and
fails closed, the reveal path holds the email only in transit, and the
consumers of `launch.identityReference` now compare like with like. The
implementation report claims the guard specs derive the new RPC method without
an edit, and that claim is false: two existing specs hard-code eleven provider
methods and fail with the twelfth, so the affected-project test gate breaks.
One new retry path also downgrades a proven signed-in profile on flaky
evidence. Nothing is wrong at the foundation, which keeps this above the 3-4
band; the missed gate breaks and the state downgrade keep it below 7-8.

## Defects

1. **major — test gate breaks: `apps/ptah-electron/src/di/container.smoke.spec.ts:538`**
   `expect(registered).toHaveLength(11)` asserts the provider account handler
   registers eleven methods. The shared tuple now has twelve
   (`libs/shared/src/lib/types/rpc/rpc-provider-accounts.types.ts:37-50`), and
   `register()` registers all of them
   (`libs/backend/rpc-handlers/src/lib/handlers/provider-account-rpc.handlers.ts:258`),
   so this spec fails. `apps/ptah-electron` is affected through the changed
   shared lib, so `npm run verify` runs it. The file is not in the diff. Fix:
   replace the literal with `ProviderAccountRpcHandlers.METHODS.length`, and
   add `revealEmail: jest.fn()` to the fake actions value at
   `container.smoke.spec.ts:510-516` so the fake matches the
   `ProviderAccountRpcActions` contract.

2. **major — test gate breaks: `libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts:267-268`**
   The test "has eleven distinct methods" asserts
   `expect(accountMethods).toHaveLength(11)` over
   `PROVIDER_ACCOUNT_RPC_METHOD_NAMES`, which now has twelve entries. This
   spec lives in a directly changed project, so the gate runs it and it fails.
   The file is not in the diff. The sibling handlers spec was updated to the
   derived length, so the miss is inconsistent, not deliberate. Fix: use
   `PROVIDER_ACCOUNT_RPC_METHOD_NAMES.length` and update the test name.

3. **minor — a flaky or conclusive retry downgrades a proven signed-in
   profile: `libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.ts:639`**
   `if (!retry.status?.loggedIn) return unobserved('identity-unproved', true)`
   treats two different outcomes the same. The first status probe proved the
   profile signed in; the re-probe then either reports `loggedIn: false`
   (proof of signed-out) or returns `null` (stopped or unparseable child). In
   both cases the code marks a previously `signed-in` profile `disconnected`
   and returns `identity-unproved`. For `loggedIn: false` the first probe's
   own branch (`:631`) returns `ok` / `signed-out` and clears the identity, so
   equal evidence produces different outcomes. For `null` the code throws away
   the first probe's proof and disconnects a healthy account because one retry
   child timed out. Impact stays fail-closed and the next status refresh
   repairs it, but only email-only (legacy or organization-free) profiles take
   this path, so every one of their refreshes runs this risk twice. Fix:
   `if (!retry.status) return complete('ok', 'signed-in', true, status.identityReference)`
   (keep the first probe's proof when the retry proves nothing), and
   `if (!retry.status.loggedIn) return complete('ok', 'signed-out', true, null)`.

4. **minor — a route change during a reveal leaves the profile `signed-in`:
   `libs/backend/auth-providers/src/lib/accounts/provider-account-actions.service.ts:330`**
   On `probe.routeChanged` the reveal returns `route-changed` and its
   `finally` releases the reservation with the prior state
   (`:308`, `profile.state` read at `:298`). The same evidence in
   `runStatus` settles a `signed-in` profile as `disconnected`
   (`:625`, `unobserved('route-changed', true)`). So a removed or replaced
   directory discovered by a reveal keeps the account listed as signed in,
   while the same discovery through `provider:getAccountStatus` disconnects
   it. Fix: align with `runStatus` — on `routeChanged` complete the
   reservation with `priorState === 'signed-in' ? 'disconnected' :
   profile.state`, or document the reveal as strictly read-only and keep the
   state untouched on purpose.

## Checked and correct

Task check 1 — consumers of `launch.identityReference` and `identity_ref`:
- `readIdentity` (`libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts:683-689`)
  and `namedIdentity`
  (`libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts:744-747`)
  hash the child's own `email` + `organization` and compare with
  `launch.identityReference`. Both sides are now the full form, so a legacy
  profile certifies and its run commits the full-form owner key
  (`claude-sdk-lane-runner.ts:842-851`). No consumer compares a full-form
  reference with a stored email-only reference.
- The run binding path never compares the owner key with `identity_ref`:
  `commitRunBinding` stores the child's key
  (`libs/backend/auth-providers/src/lib/accounts/provider-account.store.ts:204-230`),
  and `validateResume` / `persistReference` compare bindings only
  (`claude-named-account-persistence.ts:159-196`). `acquireRunLease` only
  requires `identity_ref` non-null (`provider-account.store.ts:440`).
- The cached certification cannot hand out a wrong reference. The cache key
  contains the profile `identityRef` and the scope revision
  (`claude-certification-cache.ts:59-62`), and every `identity_ref` write
  bumps the revision (`provider-account.store.ts:510-514`, `:577`), so an
  upgraded profile misses the old entry. A cached launch whose organization
  later changed is refused at `readIdentity` (fail closed), the same outcome
  as before this change.

Task check 2 — tolerance cannot accept a different account:
- `claude-route-certifier.ts:301-305` requires `configDirectoryMatches`, then
  accepts only `status.identityReference === profile.identityRef` or the
  upgrade `organizationPresent && status.emailOnlyReference ===
  profile.identityRef`. `emailOnlyReference` hashes the status's own email
  (`claude-account-status.ts:114`), so a different email fails both
  comparisons, and a same-email different-organization status fails against a
  full-form stored reference. `claudeIdentityReference` trims both parts
  (`claude-identity-reference.ts:16-24`), so the parsed `organizationPresent`
  flag and the hashes stay consistent. The certifier specs pin both
  directions (`claude-route-certifier.spec.ts:362-377`).

Task check 3 — the re-probe:
- One extra status child per sign-in tick
  (`provider-account-actions.service.ts:535-545`) and per status refresh
  (`:629-641`), gated by the same coverage checks, and the retry child is
  recorded in the ledger (`:539`) or tracked through its close receipt
  (`:634-636`). Abort, unproved children and route change all keep the
  reservation (fail closed). An organization-free account still signs in with
  the email-only reference, and the spec proves it
  (`provider-account-actions.service.spec.ts:433-440`).
- The genuinely organization-free account also certifies: its status reference
  equals the stored email-only reference, so the direct comparison passes
  without the tolerance clause.

Task check 4 — privacy:
- The raw status stdout never leaves `ClaudeAccountCommand.revealEmail`
  (`claude-account-command.ts:357-377`); a stopped child clears its output
  before the outcome resolves (`:520-525`), and `parseClaudeAccountEmail`
  returns only the validated email plus opaque references
  (`claude-account-email.ts:5-20`). No logger call exists on the reveal path
  in the service (`provider-account-actions.service.ts:290-349`), the handler
  (`provider-account-rpc.handlers.ts:390-402`) or the component. The RPC
  transport logs method names and correlation IDs only
  (`libs/backend/vscode-core/src/messaging/rpc-handler.ts:243-246`, `:275-279`),
  and its Sentry report carries `method` and `correlationId` only. Account
  summaries and broadcasts are built field by field with no email
  (`provider-account-rpc.handlers.ts:815-827`, `:709-720`), and the reveal
  broadcasts nothing. The service spec asserts the stored row and the refusal
  result contain no email, and the status key-list spec proves the parsed
  status carries no raw value.

Task check 5 — backend read gates:
- The reveal holds the same `reserveStatus` exclusion and store-side
  `unoccupied` arbitration (`provider-account.store.ts:475-492`), refuses
  removed, signed-out, pending and non-claude profiles before any child
  (`provider-account-actions.service.ts:298-301`;
  `provider-account-rpc.handlers.ts:394-396`), runs the coverage entry before
  and after the probe (`:320-335`), and the command revalidates the route
  before spawn and after close (`claude-account-command.ts:362-371`). The
  parser refuses a mismatching config directory (`claude-account-email.ts:9`)
  and the service refuses a different identity with fixed codes only
  (`provider-account-actions.service.ts:336-338`). The 15 s frontend timeout
  can expire while the backend still holds the operation; a retry then
  returns `busy` with the same fixed copy, and the reservation releases when
  the probe ends. Acceptable degradation.

Task check 6 — RPC registration:
- The method is in the shared tuple, the registry
  (`rpc-provider-accounts.types.ts:311-314`), `RPC_METHOD_ENTRIES`
  (`rpc.types.ts:3872`), the strict Zod schema
  (`provider-account-rpc.schema.ts:98`, `:161-165`), and the `provider:`
  prefix allowlist (`rpc-handler.ts:58`). The Electron manifest derives its
  methods from the tuple (`host-profile/manifest.ts:597-601`) and the
  `providerAccounts` capability gates them. The frontend classifies the method
  as a read (`provider-accounts-state.service.ts:728-734`). Only the two count
  assertions in Defects 1-2 were missed.

Task check 7 — the Angular component:
- The request token plus the profile check discards a late response after a
  profile change or a newer request (`account-email-reveal.component.ts:43`,
  `:48`, `:54`, `:56`). A mismatch can only follow a profile change, and the
  `linkedSignal` sources reset `email`, `error` and `loading` on that change
  (`:31-33`), so `loading` cannot stick. Hide clears the value (`:41`), the
  detail view renders the component only for `signed-in` accounts so a
  sign-out destroys it (`account-detail-view.component.ts:194-196`), the
  button carries `aria-label` and `aria-pressed` (`:16-17`), there is no
  `[innerHTML]`, the component is OnPush, and the host is reached only
  through `ClaudeRpcService` (`:2`, `:28`). The email lives only in the
  component signal.

Task check 8 — the tests:
- The new specs are behavioural, not mirrors: real-store privacy assertions
  for the reveal, gating before any probe, the tolerance in both directions,
  the organization-free sign-in, and the key-list proof. Gaps: no test for a
  reveal during a live operation (`busy`), the component spec does not cover
  the RPC exception branch, and no certifier test uses a different email
  (safe by SHA-256 construction, not by a test).

Five logic questions:
1. Does the code meet the stated behaviour? Part A yes (certify, sign in,
   refresh all upgrade or accept); Part B yes, minus Defect 4's state
   divergence on route change.
2. Unhandled failure paths? Defect 3 mishandles the failed or conclusive
   retry; every other failure path I traced fails closed with a fixed code.
3. Races and stale state? The frontend race guard is sound; the reservation,
   ledger and close-receipt paths retain on unproved closes; the
   certification-cache analysis above found no stale acceptance.
4. Boundary validation? Strict schemas at the RPC edge; opaque-ID and
   reference validators at the store; route, coverage, config-directory and
   identity gates at the backend read.
5. Quietly unmet requirements? The implementation report's guard-spec claim
   is false (Defects 1-2); the auth-providers suites were never executed.

## Not checked

- The auth-providers Jest suites: this worktree's Jest mapper misses
  `marked.umd.js`, per the implementer's report. I read every new spec but
  could not run it, and this review is read-only by instruction.
- Whether `claude auth status --json` and the SDK child's `accountInfo()`
  agree on the organization name for an organization-free account. If they
  disagree, that account's named runs refuse `identity-unproved` at
  `readIdentity` — fail closed, but the sign-in alone cannot prove runs work.
- The rendered Electron UI (build, serve and e2e are forbidden for this
  review); the `rpc-surface.spec.ts` count assertions concern other
  manifests and pass, but no Electron app test was executed here.
- Telemetry beyond the `RpcHandler` and its Sentry `extra` fields.
- `provider-accounts-state.service.spec.ts` beyond the type change (its
  report claims 38 passing tests; I did not run it).

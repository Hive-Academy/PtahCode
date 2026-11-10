# TASK_2026_907_eee8 — code-logic review

Review family: ollama-cloud (Glm); implementer family: codex

Change reviewed: uncommitted diff on branch `fix/claude-ultra-plan` (base `main`) —
`claude-certified-launch.ts` (+spec), `claude-account-status.ts` (+spec),
`session-query-executor.accounts.spec.ts`.

## Verdict

**APPROVED — 8/10**

The fix is correct and complete. Every consumer of the widened subscription class
was traced and handled. No functional defect and no security weakening was found.
The score is held below 9 only by a test-coverage gap at the two consumer layers
where the incident actually surfaced (defect 1).

## Scope examined

- Whole files read: `claude-certified-launch.ts` (agent-sdk),
  `claude-account-status.ts` (auth-providers), the uncommitted diff for all five
  changed files, `claude-sdk-lane-runner.ts:495-719`, and the tripwire spec tables
  in `claude-sdk-lane-runner.spec.ts` and `session-query-executor.accounts.spec.ts`.
- Consumer sweep (libs/ + apps/, node_modules/dist excluded, Grep because
  `ptah_lsp_references` timed out): `claudeSubscriptionFamily`,
  `ClaudeLoginSubscriptionClass`, `claudePersonalLoginCheck`, `claudePersonalLoginPassed`,
  `ClaudePersonalLoginCheck`, `personalSubscription`, and every `subscriptionType`
  reader. Covered: libs/backend (scoped re-run after the whole-tree search hit the
  tool time limit), apps/ (all five apps), libs/shared, libs/frontend, libs/web,
  libs/worker-protocol. Zero hits outside the files named below.
- Checks run: `npm run verify -- -t test -p @ptah-extension/agent-sdk --
  --testPathPatterns=claude-certified-launch` → exit 0, 1 task succeeded (all new
  classifier cases green). `ptah_get_diagnostics` could not finish inside its 45 s
  window on two attempts (the machine held three other verify slots); typecheck
  evidence is the implementer's `nx` typecheck (4/4 tasks) plus the green test run.

## The five logic questions

### 1. Does a `Claude Ultra` personal login now pass the tripwire?

Yes. Trace of the reported account (`accountInfo()` → `subscriptionType:
"Claude Ultra"`, `apiProvider: "firstParty"`, no `tokenSource`, no `apiKeySource`):

1. `claude-sdk-lane-runner.ts:673` reads `accountInfo()`; line 675 calls
   `claudePersonalLoginCheck(info)`.
2. `claude-certified-launch.ts:114` strips the `Claude ` prefix → `ultra`;
   `PERSONAL_PLAN` (`claude-certified-launch.ts:104`) now matches → the classifier
   returns `'ultra'` (`claude-certified-launch.ts:116`).
3. `tokenSource`/`apiKeySource` undefined and `apiProvider: 'firstParty'` pass
   (`claude-certified-launch.ts:195-200`); `personalSubscription` is true
   (`claude-certified-launch.ts:202`).
4. `claudePersonalLoginPassed` (`claude-certified-launch.ts:207-216`) → true, so
   the refusal at `claude-sdk-lane-runner.ts:676-677` no longer fires. The
   identity compare at `claude-sdk-lane-runner.ts:679-684` proceeds unchanged;
   both sides build the reference with `claudeIdentityReference` from the same
   account fields, and the context probe shows this account certifies and signs
   in cleanly, so the compare holds.
5. The second gate is the same function: `session-query-executor.service.ts:742`
   (`namedIdentity`) now passes and the gate opens. The init-message checks there
   (`session-query-executor.service.ts:726-729`, `:1197-1205`) test version and key
   source only, independent of the subscription family.

The refusal log in context.md (`subscription: "other"`, `personalSubscription:
false`) becomes `subscription: "ultra"`, `personalSubscription: true`, and the run
proceeds past `step: "personal-login"`. Evidence: the new pass case
`claude-certified-launch.spec.ts:330` uses the exact `accountInfo` shape from the
context probe and is green in my scoped run.

### 2. Are non-personal words still refused? Do other consumers need handling?

Refusals hold. `PERSONAL_PLAN` requires the whole word to be `pro|max|ultra` plus
an optional `\d+x` size suffix, and the prefix strip only removes a leading
`Claude `, so:

- `Ultra Team` → `other` (refused). Tested: `claude-certified-launch.spec.ts:361`,
  `:390`; `claude-account-status.spec.ts:135`.
- `ultra-enterprise`, `ultra api`, `ultra team`, `Claude Ultra Team`, `claudeultra`
  → `other` by the same whole-word rule that already handles `max-enterprise`.
- `team`, `enterprise`, `api` (raw and display) unchanged; unknown words
  (`future`, `maximum`, `promax`, `claude_max`, an email) → `other`; absent or
  empty subscription → `absent`/`other`. All refusal rows still green.

Consumer sweep result — no other handling needed:

- `claudeSubscriptionFamily`: exactly two call sites,
  `claude-certified-launch.ts:193` and `claude-account-status.ts:58`. Both updated.
- `ClaudeLoginSubscriptionClass`: the agent-sdk index re-export and the
  `ClaudePersonalLoginCheck.subscription` member only. No exhaustive switch, Zod
  enum, logging map, or UI copy keys on it anywhere in libs/ or apps/ (a
  `Record<ClaudeLoginSubscriptionClass, …>` would now fail to compile; typecheck
  passed). The lane runner logs the frozen check object only
  (`claude-sdk-lane-runner.ts:509-510`); the type doc already promises fixed,
  log-safe words, so the new literal is safe there.
- `claudePersonalLoginCheck` / `claudePersonalLoginPassed`:
  `claude-sdk-lane-runner.ts:675-676` and `session-query-executor.service.ts:742`.
  Both consume the verdict, so both are fixed by the central change.
- Independent `subscriptionType` readers: `session-quota-probe.service.ts:208` uses
  only `Boolean(account.subscriptionType)` (presence flag, no family logic). The
  route certifier reads no subscription word itself; it goes through
  `parseClaudeAccountStatus`, whose class-P rule was updated.

### 3. Is the executor fixture change correct, not a weakened test?

Correct. The old row
(`session-query-executor.accounts.spec.ts:505`, `subscriptionType: 'ultra'`)
asserted that a bare `ultra` word trips the wire. After the fix that word is
personal by design, so the run passes `namedIdentity`
(`session-query-executor.service.ts:742`) and the promise resolves — the row's
premise became false, which is why it failed with "Received promise resolved
instead of rejected". The replacement `Ultra Team` is a genuinely non-personal
word (`other`) that fails at the same check, so the row still proves: a
non-personal subscription word refuses with `identity-unproved` before the gate
opens, one child, zero yielded, no binding. The lost "unknown word" vocabulary at
this layer is still covered at the classifier layer
(`claude-certified-launch.spec.ts:362-364`, `:395`) and at the lane-runner layer
(`claude-sdk-lane-runner.spec.ts:763`), which is the right layering: the executor
delegates classification to the shared function.

### 4. Security posture — could a non-personal login now pass?

No. The gate keeps every other condition: `tokenSource` undefined or `claude.ai`,
`apiKeySource` undefined or `none`, `apiProvider` undefined or `firstParty`
(`claude-certified-launch.ts:195-200`). A team, enterprise, API-key or gateway
login is refused on its token/key/provider fields regardless of the subscription
word. The certified-launch boundary (env allowlist, digest, settings-override
scan, `extraArgs` flags) and the identity compare are untouched. On the
auth-providers side, class P still requires `authMethod: 'claude.ai'`,
`apiProvider: 'firstParty'`, no `forcedLoginMethod` other than `claudeai`, no
`allowedProviders`, `apiKeySource` absent or `none`, a non-empty email
(`claude-account-status.ts:56-66`); the `ultra` addition changes none of them.

The widening cannot turn a qualified non-personal word personal: the whole string
must be `pro|max|ultra` plus a `\d+x` size suffix. The residual assumption — a
bare `ultra` word (raw or display) always denotes a personal plan — is the same
assumption class the code already makes for `max` and `pro`. Context evidence
supports it: the personal Max 20x account reports `Claude Ultra` with
`firstParty` and no key sources, `claude auth status` still reports the raw word
`max`, and a qualified form would carry a qualifier (`Ultra Team`), which stays
`other`. If a future CLI ever reports a non-personal SKU as exactly `ultra`, that
account would still need a first-party provider, no foreign key source, and a
matching identity reference to be certified — the same residual risk the existing
`max`/`pro` words already carry. No new hole.

### 5. Test adequacy of the new cases

Adequate at the classifier and account-status layers:

- The exact regression shape (`Claude Ultra` + `firstParty`, no token/key sources)
  is a pass case: `claude-certified-launch.spec.ts:330`.
- Family table covers `Claude Ultra`, bare `ultra`, `ultra_20x`,
  `Claude Ultra 20x` → `ultra`, and `Ultra Team` → `other`
  (`claude-certified-launch.spec.ts:378-393`); refusal table covers `Ultra Team`
  (`:361`).
- Class P covers `ultra` and `Claude Ultra`; class O covers `Ultra Team`
  (`claude-account-status.spec.ts:88`, `:135`).
- My scoped run of the classifier spec passed (exit 0).

Gap: the fix's regression is pinned at the classifier layer only. The two
consumer layers where the incident surfaced have no `ultra` pass shape — see
defect 1.

## Defects

1. **Low — missing consumer-layer regression rows for the new `ultra` pass
   shape.**
   `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.spec.ts:727-731`
   (tripwire pass table: Max, Pro, `apiKeySource: none`, token-source shapes — no
   `Claude Ultra` row) and
   `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.accounts.spec.ts:517-522`
   (executor pass rows use only the default `max` fixture at line 34).
   The reported refusal fired in `readIdentity` and in `namedIdentity`; today a
   wiring-level regression inside either consumer (for example a future family
   branch added locally) would keep every classifier test green and no test would
   catch it. No functional defect exists now; this is coverage for the exact bug
   this task fixes.
   Fix: add `['the bundled CLI Claude Ultra shape', { subscriptionType:
   'Claude Ultra', apiProvider: 'firstParty' }]` to the lane-runner pass table
   (it must land at `identity-compare` like the other rows), and an executor pass
   row `fixture({ identityPatch: { subscriptionType: 'Claude Ultra' } })` expecting
   one `releaseReservation`, mirroring "accepts an explicit apiKeySource of none".
   Optionally add `['a team-qualified ultra subscription', { ...bundledCliPersonal,
   subscriptionType: 'Ultra Team' }, { subscription: 'other', personalSubscription:
   false }]` to the lane-runner trips table at `claude-sdk-lane-runner.spec.ts:745`.

## Non-defect observations

- No `ultra-enterprise` / `ultra api` refusal rows exist, but the whole-word rule
  that handles them is covered by the symmetric `Max Team` / `max-enterprise`
  rows through the same code path.
- The implementer's verification ran `agent-sdk` and `auth-providers` only.
  `cli-agent-runtime` (the lane runner) was not re-run. By inspection this is
  safe: no `ultra` string exists anywhere in that project, and its refusal
  expectations (`team`/`enterprise`/`api`/`other`/`absent`) hold unchanged under
  the new classifier. A confidence run of that project's tests would still be
  cheap and is recommended at commit time.
- `claude-route-certifier.spec.ts` has no `ultra` fixture; the certifier is
  class-driven and `claude-account-status.spec.ts` covers `ultra` → class P, so
  this is optional.
- The `personalSubscription` line in `claude-certified-launch.ts:202` and the
  family check in `claude-account-status.ts:59` now enumerate three literals in
  parallel with the regex alternation. If a fourth family is ever added, both
  lists and `PERSONAL_PLAN` must move together; a shared `personal` predicate
  would remove that triple-maintenance point. Not required now.
- The doc comments were updated in both files (including the D13 comment), so no
  stale "Pro/Max" copy remains in the changed area. The task-folder
  `decisions.md` files that define D13 are frozen records of other tasks and are
  correctly left untouched.
- Tool fallbacks used, per role rules: `ptah_lsp_references` timed out on three
  calls, so the consumer sweep used Grep; the first whole-tree Grep hit the tool
  time limit and was re-run scoped per directory; `ptah_get_diagnostics` could
  not complete inside its 45 s window on two attempts.

## Decisions

- Decision: the executor fixture change (`ultra` → `Ultra Team`) is a correct
  update, not a weakened test. Options: keep it, revert it and drop the row, or
  replace it with another unknown word. Evidence: `Ultra Team` fails the same
  check at the same line, the row's assertion set is unchanged, and unknown-word
  coverage survives at the classifier and lane-runner layers. Reversible.
- Decision: bare `ultra` is treated as personal-only in both vocabularies.
  Options: accept bare `ultra`, or require the display form only. Evidence: the
  context probe (SDK `Claude Ultra` for a personal Max 20x; raw `claude auth
  status` word stays `max`), and the code's existing raw-word handling of
  `max`/`pro`. Follows the existing design. Reversible.

## Score justification

Held above 7: all five review questions pass with traced evidence; every consumer
of the widened union was located and verified; the exact incident shape is a
green regression case at the classifier layer; the scoped test run passed.
Held below 9: the regression is not pinned at either consumer layer where the
incident manifested (defect 1), and the adjacent consumer project's tests were
not re-run.

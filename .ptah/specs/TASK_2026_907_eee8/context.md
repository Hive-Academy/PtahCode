# TASK_2026_907_eee8 — context

## Symptom

A named-account Claude CLI lane (stored workspace lane account) is refused at spawn:
`Claude account refused (identity-unproved): the account sign-in could not be proved`.
It repeats after every re-sign-in. An explicit `accountSelection: { kind: "ambient" }` works.

## Evidence (2026-11-09 22:02 UTC)

Host log `%APPDATA%/Ptah/logs/Ptah Electron-2026-11-10.log`:

```
[ClaudeCliAdapter] Named lane refused: {"stage":"launch","code":"identity-unproved",
 "hostStep":"bootstrap","phase":"bootstrap","step":"personal-login",
 "personalLogin":{"tokenSource":true,"apiKeySource":true,"apiProvider":true,
 "subscription":"other","personalSubscription":false}}
```

Probe of the same account folder (personal Max 20x, `billingType: stripe_subscription`,
`organizationType: claude_max`, credentials `subscriptionType: "max"`,
`rateLimitTier: default_claude_max_20x`):

- `claude auth status --json` → `subscriptionType: "max"`, `planTier: "max_20x"` (passes).
- SDK `query().accountInfo()` (SDK 0.3.318, bundled CLI and installed CLI 2.1.321) →
  `subscriptionType: "Claude Ultra"`, `apiProvider: "firstParty"`, no tokenSource, no apiKeySource.

## Root cause

`claudeSubscriptionFamily()` in
`libs/backend/agent-sdk/src/lib/helpers/claude-certified-launch.ts:102-118` accepts only
`pro`/`max` (+ size suffix). `"Claude Ultra"` → `ultra` → `other`, so
`claudePersonalLoginCheck().personalSubscription` is false and the lane runner
(`claude-sdk-lane-runner.ts:674-677`) refuses with `identity-unproved`. Sign-in
certification reads `claude auth status` (`max`), so the account looks valid and the
failure returns after each new sign-in.

## Fix decision

Add a personal `ultra` family: classifier accepts `ultra` (with optional size suffix),
`personalSubscription` true for `ultra`, and `isPersonalClass()` in
`libs/backend/auth-providers/src/lib/accounts/claude-account-status.ts:59` also accepts it,
so a later `claude auth status` that reports `ultra` keeps working. Qualified words such as
`Ultra Team` stay `other`, like `Max Team`.

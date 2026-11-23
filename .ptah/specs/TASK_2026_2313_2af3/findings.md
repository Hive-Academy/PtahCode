# Findings: agy, grok and Kimi plan usage

## Antigravity (agy)

**What was wrong.** One slow `agy -p /usage` run at app start was killed after 7 s. The code
treated every kill as proof of billing and disabled the CLI source until restart. Every later
read returned `cli-unavailable` / `cli-disabled`. The 7 s kill was also shorter than agy own
10 s `--print-timeout`.

**What changed** (`antigravity-cli-usage.source.ts`, `antigravity-plan-usage.reader.ts`,
`fallback-usage.runner.ts`):
- A kill without billing evidence backs off 30 s, then 120 s. The 3rd kill in a row disables the
  source. A completed run resets the count.
- Billing evidence (also in the partial stdout of a killed run) disables the source until restart.
  A refresh does not override it.
- A manual refresh passes the backoff and the kill-disable, at most one run per 10 s. A good
  answer re-enables the source.
- Kill window: 13 s (agy 10 s + 3 s). Chain budget: 22 s.
- The runner can skip its own failure cache (`cacheFailures: false`); agy uses that.

**Group field (added for the sidebar task).** `PlanLimitWindow.group?: string` is new in
`@ptah-extension/shared` (`plan-limit.types.ts`). It is a display name only, never a key. Only the agy
parser sets it. Keys and labels do not change. Sample window:
`{ key: 'other:cli-gemini-models-weekly', kind: 'weekly', label: 'Gemini Models · Weekly',
group: 'Gemini Models', durationMins: 10080, used: { kind: 'percent', percent: 0.1 },
usedSource: 'provider-unofficial', resetsAt: 1795942154000, resetSource: 'provider-unofficial', observedAt: ... }`.

**Data now** (real run, agy 1.5.15, Linux, 4.4 s): 4 windows from 2 groups, each with weekly and
5 hour. Keys `other:cli-gemini-models-{weekly,five_hour}` and
`other:cli-claude-and-gpt-models-{weekly,five_hour}`. Labels "Gemini Models · Weekly" and so on.
Status reasons on failure: `cli-timeout` (killed, retry later), `cli-unavailable` with cause
`cli-disabled` (3 kills in a row, or billing evidence), `usage-budget-exhausted` (deferred),
`cli-not-signed-in`, `cli-not-found`.

## Grok

**What was wrong.** Nothing in the backend. Grok is signed out on this machine:
`~/.grok/auth.json` is `{}` and the grok log shows `RefreshTokenRejected` on 2026-11-18.
`cli-not-signed-in` is correct. `grok usage --json` outside a session says plan usage is not
available there, so the CLI has no scriptable usage source; the account reader needs the OAuth
token.

**What changed.** No code. Existing specs cover `{}` and `GROK_AUTH` cases.

**Data now.** `no-usage-source` is a status of its own, not a failed reader. A failed reader
returns `service-unavailable` (with a reason such as `cli-timeout`). `status: no-usage-source`, `statusReason: cli-not-signed-in`, no windows.
**Open point for the UI task** (libs/frontend, not changed here): the chat tiles
(`plan-limit-tiles.ts`, `lane-tiles.ts`) and `stats-limit-view-model.ts` show "Grok does not
report plan usage" / "Limits not tracked". They should show
`planLimitReasonLabel(statusReason, providerId)` ("Sign in to the Grok CLI (run grok login)"),
as the dashboard card does.

## Kimi Code

**What was wrong.** The data path was correct. A full window gave AT LIMIT only through the
derived rule (fresh reading, `percent >= 100`, reset in the future). After a failed refresh the
lane fell back to `unknown`.

**What changed.** A window at 100% with a known reset now carries `exhaustion` (provider-api,
with the reset), as the Codex reader does. A reading below the limit, or the reset, clears it.
New specs: the at-limit payload (100 / 100 / 0 with resets), AT LIMIT gating through
`classifyLaneState` (Monthly total named, 5-hour not blocking), and a full window without a reset.

**Data now** (2026-11-23 state): `five_hour` "Kimi Code · 5-hour" 0%; `weekly` as reported;
`monthly` "Kimi Code · Monthly total" 100%, reset 2026-11-25T00:00Z, exhaustion set;
`other:monthly-code` "Kimi Code · Monthly code" 100%, same reset, exhaustion set.
At its limit, the reader reports the two monthly windows at 100% and the 5-hour window at 0%,
each with its reset time (checked by the new reader spec).
Not changed (unverified risk): a `used_ratio` above 1 rejects the whole payload; 99.8% shows as
near limit.

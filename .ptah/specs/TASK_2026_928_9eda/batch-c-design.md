# Batch (c): fallback usage reader port

## Current reader chain

`PlanUsageService` normalizes the provider ID, rejects providers in `NO_USAGE_SOURCE_PROVIDERS`, and selects one function from `readers[providerId]`. It resolves a credential before that call. Grok and OpenCode also have independent local accounting readers. OpenCode local totals are forced to `no-usage-source` for plan windows. The service has a 30 s owner cache, a single flight per owner, and a stale-on-transient-failure rule. Keep these facade rules. Each provider reader becomes a thin facade over the shared ordered source chain. See `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:19-40,137-175,197-204,225-275,282-374,377-405` in batch (b).

Batch (b) hard-coded Antigravity's chain inside `createAntigravityPlanUsageReader`: OAuth for `cli-store`/unknown, local language server, then `agy -p /usage`. It uses an 11 s chain deadline, 3 s OAuth and language-server stages, and an 8 s CLI cap. An account owner can use CLI output only after the active store owner matches, checked again after the read. See `readers/antigravity-plan-usage.reader.ts:46-49,73-136,139-180`. The CLI adapter uses `execFile` with an argument array and no shell; it caps output at 64 KiB, parses tab rows with Zod, and returns typed errors. Parse failure backs off 30 min; timeout, exit error, and sign-in failure back off 5 min. Its back-off is a process-local `WeakMap` keyed by executor, while the service's 30 s cache prevents a spawn on every list read. See `readers/antigravity-cli-usage.adapter.ts:4-10,23-49,100-165,170-225`. Batch (b)'s review/fixes defer model-group mapping to batch (d); see `batch-b-review.md` coordinator response and `batch-b-fixes.md`.

## Port and types

Keep the backend port in `libs/backend/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts`. `PlanUsageService` remains the facade. Add a registry of ordered sources, not a formatter or spawn-gate switch:

```ts
type UsageSourceLabel = 'provider-api' | 'cli-command' | 'local-state' | 'session-sdk' | 'local-rpc';
type UsageFailureReason = PlanLimitStatusReason | 'source-not-applicable';
interface UsageSource {
  readonly id: string; readonly label: UsageSourceLabel;
  read(request: PlanUsageReadRequest): Promise<UsageSourceResult>;
}
type UsageSourceResult =
  | { readonly ok: true; readonly source: UsageSourceLabel; readonly readAt: number; readonly reading: PlanUsageReading }
  | { readonly ok: false; readonly source: UsageSourceLabel; readonly reason: UsageFailureReason; readonly retryAfter?: number };
type UsageSourceChain = Readonly<Record<string, readonly UsageSource[]>>;
```

Provider reader factories own their source arrays and call one shared chain function. The chain tries sources in order until one returns a verified `available` plan window set. `no-usage-source`, local token totals, an unverified owner, or an empty/unparseable answer cannot win. An eligibility failure (for example a missing credential) can stop only sources that need that credential; another independent source may run. Exhaustion of the chain yields `service-unavailable` or `no-usage-source` with a typed reason. Do not synthesize a 100% window. Preserve the first useful failure reason in a fixed precedence order, with `account-unverified` ahead of generic unavailability. Carry `source` and `readAt` on the winning owner snapshot in `libs/shared/src/lib/types/plan-limit.types.ts`; derive `ageMs = now - readAt` at presentation time. Keep existing per-field `PlanLimitSource` evidence separate. `fetchedAt` stays the fetch time; stale cache reuse keeps the original `readAt`. The formatter and spawn gate consume the same snapshot and remain provider-agnostic. Add a neutral source/age display in the formatter and dashboard; update the exhaustive `PLAN_LIMIT_REASON_LABELS` map for any new reason (`plan-tile-view.model.ts:86-105`).

Wrap batch (b)'s `readAntigravityCliUsage` as a `UsageSource` with label `cli-command`. Move the stage order and common deadline to the chain. Keep `agy` arguments, owner checks, 8 s cap, 30/5 min back-off, Zod parser, and returned windows unchanged. Keep its current public reader factory as a thin facade for callers and tests. The model-group-to-model-ID resolver is the seam for batch (d); do not change model scope here.

## Shared fallback runner

Add `fallback-usage.runner.ts` in auth-providers. It accepts an injected async executor (`execFile` or `node-pty`), executable and fixed argument array, a parser, owner-safe cache key, signal, and deadline. It never invokes a shell. The runner starts only after a structured source fails and a list caller explicitly requests a snapshot. No constructor, registration, or Electron activation runs it. Limit stdout to 64 KiB; reject an extra prompt, login/trust/update dialog, malformed row, or unsupported version. Zod validates each CLI's parse boundary. Redact output and arguments from logs; log only source ID, reason code, and elapsed bucket through injected `TOKENS.LOGGER`.

Defaults: 8 s total CLI/pty timeout (the proven Antigravity cap), 30 s successful cache TTL (matches the owner cache), 30 min parse-failure back-off (a removed slash command may spend quota), and 5 min timeout/exit/sign-in back-off (avoid repeated hangs). Apply one deadline across executable candidates. Cache by source ID, owner key, executable/version and account fingerprint; never share rows across owners. Join concurrent reads with single flight; a caller abort ends only its wait. On timeout, kill the direct child and its process tree on Windows, dispose the pty, and wait for close with a bounded grace period. Do not promise cancellation from `AbortSignal` alone: batch (b)'s review notes a surviving grandchild risk. A cache hit reports the original `readAt`. A failure reports a reason and `retryAfter`, never a stale 100% assertion. The service's stale rule may retain old windows only under its existing ledger rules.

Use the existing Node backend runtime for child processes. No `electron` or `vscode` import enters host-neutral libs. If later hosts require a new process capability, define its port in `platform-core` and adapters in `platform-electron`, `platform-vscode`, and `platform-cli`; that host integration is not needed for this backend-only runner.

## Sources per CLI

Order below means first verified plan answer wins. “Now” means batch (c) implementation; “later” means retain current behavior or defer until evidence and credentials are safe. Evidence is in `usage-sources.md:5-99,110-126` and the untracked-lane section of `cause-analysis.md`.

| Lane | Ordered sources and labels | Batch (c) | Evidence / restriction |
|---|---|---|---|
| codex | App Server `account/rateLimits/read` (`provider-api`) → newest rollout `token_count.rate_limits` (`local-state`) | Port existing App Server; add bounded fresh rollout parser | Versioned JSON schema and local snake_case event. `/status` pty was blocked by an update screen; defer it. Never call a model. |
| antigravity | Cloud Code OAuth (`provider-api`) → local language server (`local-rpc`) → `agy -p /usage` (`cli-command`) | Port all three; preserve batch (b) safety and order | Batch (b) uses local server before CLI; survey recommends CLI before server. Preserve batch (b) behavior in this batch. Known four-row output takes 3.5–7 s. Unknown slash input can spend quota: fixed literal argument only; stop if version/command is unverified. |
| grok | Billing HTTP (`provider-api`) → pty `/usage` (`cli-command`) | Port HTTP; add guarded pty fallback | `grok usage --json` is a stub in 1.0.77. Pty modal works, but percent direction and local reset zone are unproven. Do not assert exhaustion until fixtures prove both; otherwise unknown. Session totals remain separate local accounting. |
| claude CLI | SDK `getUsage` (`session-sdk`) → OAuth HTTP (`provider-api`) → status-line JSON (`local-state`) | Port existing SDK only | SDK needs a routed open session. HTTP endpoint unverified; status-line hook conflicts with user settings. TUI `/usage` hits trust/approval dialogs: NOT allowed now. Stats cache is token counts, not plan limits. |
| copilot | `copilot_internal/user` HTTP (`provider-api`) → pty `/usage` (`cli-command`) | Chain slot only; no live source until independently verified | HTTP evidence is third-party only; pty hits trust dialog. `--usage-output-file` needs a real turn and is NOT allowed as a plan source. |
| opencode | Go HTTP (`provider-api`) → `stats --json` (`local-state`) | Port Go; keep stats as local accounting only | JSON stats lack plan allowance. For plain OpenCode, result stays unknown/no plan source. No verified usage slash command. |
| cursor | none | Typed `no-usage-source` | Binary absent; no owner or safe source surveyed. Do not start a billable session. |
| pi | none | Typed `no-usage-source` | Binary absent; no owner or safe source surveyed. Do not start a billable session. |
| ptah-cli lanes | Existing provider owner reader (`provider-api`/`session-sdk`) by resolved provider; no generic CLI spawn | Reuse chain by owner, preserve key/session routing | `anthropic-api` API-key quota is unsupported; do not borrow Claude subscription data. Per-provider new sources need verified owner and allowance. A prompt or session to inspect usage is NOT allowed. |

No source that spends quota or starts a billable session may be registered. A CLI command is eligible only with a documented or fixture-verified, fixed non-prompt invocation; reject dialogs and unexpected text before sending any further input.

## File list

Paths below are relative to the repo. “Size” is an estimate of changed or new lines. This is the implementation inventory, including verification files. Project names are Nx names.

| File | Project | Change | Purpose / size |
|---|---|---|---|
| `libs/backend/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts` | `@ptah-extension/auth-providers` | changed | Port types; 35 |
| `libs/backend/auth-providers/src/lib/quota/readers/usage-source-chain.ts` | same | new | Ordered dispatch and failure precedence; 130 |
| `libs/backend/auth-providers/src/lib/quota/readers/usage-source-chain.spec.ts` | same | new | Ordering, owner isolation, unknown; 150 |
| `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts` | same | changed | Registry and snapshot metadata; 75 |
| `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts` | same | changed | Cache/stale/first-answer tests; 100 |
| `libs/shared/src/lib/types/plan-limit.types.ts` | `@ptah-extension/shared` | changed | Result source and read time; 20 |
| `libs/backend/auth-providers/src/lib/quota/readers/fallback-usage.runner.ts` | `@ptah-extension/auth-providers` | new | Async command/pty runner; 180 |
| `libs/backend/auth-providers/src/lib/quota/readers/fallback-usage.runner.spec.ts` | same | new | Timeout, tree kill, cache, flight, back-off; 190 |
| `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts` | same | changed | Thin chain facade; 70 |
| `libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.adapter.ts` | same | changed | Delegate run policy, keep parser; 70 |
| `libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.adapter.spec.ts` | same | changed | Fixed args and failure behavior; 75 |
| `libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.spec.ts` | same | changed | Owner match and chain precedence; 75 |
| `libs/backend/auth-providers/src/lib/quota/readers/antigravity-usage.fixture.ts` | same | changed | Placeholder-only version fixture; 20 |
| `libs/backend/auth-providers/src/lib/quota/readers/codex-rollout-usage.reader.ts` | same | new | Bounded newest-event parser; 125 |
| `libs/backend/auth-providers/src/lib/quota/readers/codex-rollout-usage.reader.spec.ts` | same | new | Versioned snake_case and stale tests; 140 |
| `libs/backend/auth-providers/src/lib/quota/readers/fixtures/codex-rollout-0.166.jsonl` | same | new | Placeholder-only event; 8 |
| `libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.ts` | same | changed | App Server source wrapper; 45 |
| `libs/backend/auth-providers/src/lib/quota/readers/grok-pty-usage.reader.ts` | same | new | Guarded modal parser; 135 |
| `libs/backend/auth-providers/src/lib/quota/readers/grok-pty-usage.reader.spec.ts` | same | new | Modal and ambiguity tests; 145 |
| `libs/backend/auth-providers/src/lib/quota/readers/fixtures/grok-usage-1.0.77.txt` | same | new | Sanitized modal; 20 |
| `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts` | same | changed | Billing source wrapper; 35 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-limit.formatter.ts` | `@ptah-extension/vscode-lm-tools` | changed | Neutral source/age text; 35 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-limit.formatter.spec.ts` | same | changed | Unknown and age display; 65 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.ts` | `@ptah-extension/dashboard` | changed | Exhaustive generic reason/source labels; 30 |
| `libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.spec.ts` | same | changed | Label coverage; 45 |

No new injectable service or DI token is required: the existing `PlanUsageService` remains registered at `libs/backend/auth-providers/src/lib/di/register.ts:328-338`, guarded by `register.spec.ts:173-177`. If implementation changes its constructor or registers the runner as a service, change **both** `register.ts` and `register.spec.ts` in the same batch and test host resolution. Keep the process executor injected as a function to avoid that extra registration.

## Batches

Each row owns disjoint write files. “Verify” is an implementation command, not a command run for this note. Run one row at a time after batch (b) merges into `main`.

| Batch | Write files from the table above | Verify |
|---|---|---|
| C1, port | `plan-usage-reader.types.ts`, `usage-source-chain.ts`, `usage-source-chain.spec.ts`, `plan-usage.service.ts`, `plan-usage.service.spec.ts`, `plan-limit.types.ts` | `npm run verify -- -p @ptah-extension/auth-providers,@ptah-extension/shared` |
| C2a, fixture | `antigravity-usage.fixture.ts` | `npm run verify -- -p @ptah-extension/auth-providers` |
| C2, runner | `fallback-usage.runner.ts`, `fallback-usage.runner.spec.ts`, `antigravity-plan-usage.reader.ts`, `antigravity-plan-usage.reader.spec.ts`, `antigravity-cli-usage.adapter.ts`, `antigravity-cli-usage.adapter.spec.ts` | `npm run verify -- -p @ptah-extension/auth-providers` |
| C3, Codex | `codex-rollout-usage.reader.ts`, `codex-rollout-usage.reader.spec.ts`, `fixtures/codex-rollout-0.166.jsonl`, `codex-plan-usage.reader.ts` | `npm run verify -- -p @ptah-extension/auth-providers` |
| C4, Grok | `grok-pty-usage.reader.ts`, `grok-pty-usage.reader.spec.ts`, `fixtures/grok-usage-1.0.77.txt`, `grok-account-plan-usage.reader.ts` | `npm run verify -- -p @ptah-extension/auth-providers` |
| C5, presentation | `agent-limit.formatter.ts`, `agent-limit.formatter.spec.ts`, `plan-tile-view.model.ts`, `plan-tile-view.model.spec.ts` | `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/dashboard` |

C1 adds the chain helper and metadata handling. Provider facades keep their existing service registrations. C2–C4 add sources inside their own provider reader files, so later batches do not rewrite `plan-usage.service.ts`.

## Risks and conflicts

Batch (b) edits the Antigravity reader, adapter, specs, shared reasons, formatter, and dashboard labels. Start C1 from `main` only after (b) merges; recheck line references and preserve its fixes. C2 edits the same Antigravity files. C5 edits the same presentation files. Batch (d) owns model-group-to-model-ID mapping, per-model state and alternatives; batch (c) exposes only the `modelScope`/group resolver seam. Do not change window keys or classify a group quota as a global limit.

Fixtures must use `<user>`, `<account>`, and synthetic dates/percentages. Never store a real account ID, email, token, home path, raw pty capture, or auth file. Guarded pty handling must stop at login/trust/update screens. The Grok modal's percent direction and local reset timezone remain uncertain; a parser that cannot prove both returns unknown. Codex rollout data may be stale; set a short freshness ceiling and do not present old events as current allowance. Antigravity's fixed `/usage` may become a billable prompt on an unsupported version; version allowlist, parse back-off and no shell are mandatory.

## Decisions

| Decision | Options | Evidence | Reversible? |
|---|---|---|---|
| Source order and first answer | Ordered chain / parallel merge | Existing owner facade and batch (b) chain; parallel merge risks mixing accounts and stale windows | Yes, but changes precedence |
| Keep batch (b) Antigravity order | OAuth → local RPC → CLI / survey's OAuth → CLI → RPC | Behavior-preserving port; `antigravity-plan-usage.reader.ts:83-136` | Yes |
| Fallback execution | Shared async runner / per-reader spawn | Same timeout, cache, kill and back-off obligations for every CLI; survey's pty risks | Yes |
| Grok pty gate | Parse verified window / infer used share from one modal | Survey has only one data point and local reset text | Yes, after fixtures |
| Owner result metadata | `source` + `readAt` / overload per-window provenance | Per-window `PlanLimitSource` already means evidence origin; owner result needs reader origin and age | Yes, DTO migration |
| DI | Function-injected runner / new singleton service | Existing facade DI and register guard already exist; no new token needed | Yes |

No clarification is needed for the port. Version-specific Grok percent direction and Copilot HTTP identity remain evidence gates; they do not block the safe chain or unknown result.

## Lane-introduced constraints

This note is a proposal of a codex lane. The coordinator must approve it before implementation.
The items below are not in the task request. The coordinator can change each one.

- Two new `source` labels: `session-sdk` and `local-rpc`. The request names `provider-api`,
  `cli-command` and `local-state` only. Each new label needs a dashboard label.
- Defaults of the fallback runner: 8 s timeout, 30 s cache, 30 min back-off after a parse
  failure, 5 min back-off after a timeout, an exit error or a sign-in failure. They come from
  batch (b).
- The grok pty source does not report an exhausted window until fixtures prove the direction
  of the percent value and the time zone of the reset.
- copilot, cursor and pi get a chain slot or a typed `no-usage-source` only. No live source.
- The claude TUI `/usage` scrape is not allowed in batch (c), because of trust dialogs.
- The antigravity order of batch (b) stays (OAuth, local server, CLI).

## Coordinator decisions (2026-11-10)

The coordinator approved all items of "Lane-introduced constraints". These rules are now
`user-requested` and are mandatory for the implementation.

- Labels `session-sdk` and `local-rpc` are approved. The `source` label must reach the limit
  text and the UI, so that the user sees the origin of each number.
- Runner defaults are approved: 8 s timeout, 30 s cache, 30 min back-off after a parse failure,
  5 min back-off after a timeout, an exit error or a sign-in failure. Put them as constants in
  one file. Do not make them settings.
- Live fallbacks are for codex and grok only. The grok source reports no exhausted state until
  fixtures prove the direction of the percent value.
- copilot, cursor and pi have no live source. They must show a clear "no usage source" reason,
  not "unknown". No claude TUI scrape.
- The antigravity order of batch (b) stays.

Added conditions:

- At most one fallback process for each CLI at a time, and at most 2 fallback processes in total.
- A fallback never runs on the startup path or during a lane spawn.
- A killed or timed-out process leaves no child process. Prove this with a fake spawner test.
- Never log raw CLI output, because it can contain an account identifier. Log parsed fields only.

Delivery:

- Implementation starts from `main` only after the coordinator reports the merge of PR #1069.
- Commit this design note with batch (c), not on the branch of PR #1064.

## Implementation record (batch C, 2026-11-11)

Coordinator decision: batch C4 (grok pty live fallback) is NOT part of this PR. Grok keeps its
billing HTTP source only. No pty port, no `node-pty` dependency and no setting for it is added.

Reasons for the deferral:

1. No pty capability exists. `node-pty` is not in `package.json`, `package-lock.json` or
   `node_modules`, and no platform port for a pty exists. The runner starts a plain child with
   stdin ignored, so it cannot inspect a Grok screen before it sends `/usage`. A new native
   dependency (Electron rebuild, packaging) is a user decision.
2. The direction of the Grok percent value (used or left) and the time zone of the reset text are
   unproven. Under the binding rule the source returns no exhausted state until fixtures prove
   both. A pty source would return no usable window.

C1 (port, chain, `source` and `readAt` on the snapshot), C2 (runner and antigravity on the chain),
C3 (codex rollout fallback, label `local-state`) and C5 (formatter and dashboard) are delivered.

## Implementation record

The `node:child_process` import moved from the Antigravity adapter to `fallback-usage.runner.ts`, which owns fallback process spawning and cleanup.

### Known limits after the second review (2026-11-11)

- N4: the dashboard RPCs (`lane-plan-limits-rpc.handlers.ts`, `plan-limits-snapshot.service.ts`) do not
  set `allowCliFallback`. The antigravity CLI fallback runs only for `ptah_agent_list`. A dashboard
  user without OAuth and without a local server sees the structured failure reason, not CLI data.
- N5: a flagged read bypasses the 30 s cache for every non-`available` owner. The cost is small
  because Codex has its own cache. Restrict it to providers with a CLI fallback when grok gets one.
- m-B: `cli-busy` is shown as `cli-unavailable` until a typed reason exists (with m10).
- m7, m10, m11, m12 stay deferred.

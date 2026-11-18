## Diagnosis
- Scope: PR1 only, Electron first; keep platform-cli/cli-engine usable. Read analysis.md A–D using PowerShell Default encoding without rewriting it; context.md live probes and decisions.md override analysis.md's earlier suggested `grok usage --json` approach.
- **Grok's old failure is not reproducible with today's store.** A read-only Node/Zod probe found `.grok/auth.json`, a non-API-key entry with a refresh credential: login, not API-key mode. No relevant auth override environment names were present. Reported fields only: `key`, `auth_mode`, `refresh_token`, identity/profile metadata; every credential/identity value was redacted. `config.toml` did not match the reader's custom-auth/endpoints rejection. No CLI/model prompt was sent.
- Two bounded billing GETs (8 s each) returned HTTP 200. Shape: `{config:{creditUsagePercent:number,currentPeriod:{type:string,start:string,end:string},prepaidBalance:{val:number},productUsage:object,isUnifiedBillingUser:boolean,topUpMethod:string,billingPeriodStart:string,billingPeriodEnd:string}}`; all values redacted. Applying the existing reader's schema/branch predicates selected **window emitted**, not a no-plan or malformed-balance branch. This is a predicate diagnostic, not execution of the TypeScript service or proof of the live app's current snapshot.
- `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts:73-125` rejects non-cli-store owners, API-key/custom configuration and missing login credentials; `:127-145` maps HTTP failures; `:146-201` emits validated windows/credits. The earlier “API key, no plan” label cannot be attributed to the inspected current store: possible older auth epoch, different host environment/worktree/runtime, or cached status. Do not invent an auth/schema repair or convert an actual API-key spend total into plan room. Add provenance diagnostics and regression coverage first.
- **Antigravity direct failures are established locally:** `<profile>/antigravity-acp/acp_token.json` is missing at the path selected by `ANTIGRAVITY_HOME` or `.gemini`; CIM found zero `language_server` processes (bounded query). OAuth therefore stops before HTTP; local RPC has no server/listening port to query. No OAuth/RPC HTTP status or response body exists for these probes. Credentials were not created/refreshed and the IDE was not started.
- OAuth schema/path and refresh: `.../readers/antigravity-oauth-plan-usage.reader.ts:9-49,81-153`; local protocol/process discovery: `.../readers/antigravity-ls.provisional.ts:24-65`. The source chain collapses OAuth failures to `no-oauth` and local failures to `no-local-server` (`.../readers/antigravity-plan-usage.reader.ts:89-117`), hiding authentication/schema/time-budget distinctions. Repair those mappings rather than pretending an absent installation is a quota response.
- `.../readers/antigravity-cli-usage.adapter.ts:120-135` submits `['-p','/usage','--output-format','json']`. Supplied live evidence proves it starts inference. Delete this execution path; never retry it or the refused Grok subcommand. Runner failure caching explains the pause label, but the running host's original failure timestamp/backoff entry was not accessible here.
- Existing exhaustion support already includes `grok-balance-exhausted`: `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.ts:68-78,163-176,241-266`; tests at `lane-limit-classifier.spec.ts:163-185`. Current status-prefix regex does **not** accept the exact leading `402 Payment Required: Grok Build usage balance exhausted` form supplied in context.md. Add that narrow provider-error form, preserving rejection of a bare number or unrelated payment error.
- Existing recording: `.../cli-agents/agent-process-manager.service.ts:3922-3985` sends classification to ledger window/owner evidence; no rewrite of this 4,000+ line facade. Existing positive-credit clearance is `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:532-534`; ledger pattern-specific clearance is `plan-limit-ledger.service.ts:310-319`.
- No `node-pty`, `conpty` or `winpty` dependency was found in root/app manifests or package-lock.json. Native machinery exists: `apps/ptah-electron/scripts/rebuild-native.js:145-164` rebuilds/probes better-sqlite3; `scripts/validate-deps.js:103-159` checks bundle externals; `electron-builder.yml:52-95` unpacks native artifacts; `project.json:41-83,313-340` configures main/worker-host externals.

## Design
- Preserve direct-reader-first ordering: Grok billing → optional PTY; Antigravity OAuth → local LS → optional PTY. A fresh complete result suppresses PTY. Source-not-applicable may proceed; owner mismatch/account-unverified, explicit cancellation and unsupported auth must stop. API-key mode cannot borrow another login's plan; exhaustion evidence still applies to its actual lane owner.
- Add a narrow port under auth-providers quota, exported through its quota barrel; token belongs to auth-providers-tokens. No concrete host dependency or feature-to-feature import in auth-providers. Proposed signatures (all external results validated before use):
```ts
type UsageProbeProvider = 'grok' | 'antigravity';
interface UsagePtyRequest {
  readonly provider: UsageProbeProvider;
  readonly ownerKey: string;
  readonly authEpoch: string; // opaque fingerprint, never credential bytes
  readonly deadlineAt: number;
  readonly signal: AbortSignal;
}
type UsagePtyResult =
  | { readonly ok: true; readonly screen: string; readonly observedAt: number }
  | { readonly ok: false; readonly reason:
      'unsupported-host' | 'unsupported-version' | 'not-ready' |
      'timeout' | 'cancelled' | 'busy' | 'unavailable' };
interface UsagePtyProbe {
  probe(request: UsagePtyRequest): Promise<UsagePtyResult>;
}
interface UsageScreenParser {
  parse(provider: UsageProbeProvider, screen: string): UsageSourceResult;
}
```
- Request intentionally has no text, args, executable, cwd or environment fields. Host resolves a supported installed CLI and constructs trusted arguments. Ordinary process launches use cross-spawn/which and arrays; PTY launch uses node-pty's executable/args API, never a shell. Windows `.cmd` wrappers must resolve to their actual Node entrypoint or native exe; never fall back to cmd.exe. Refuse unrecognized wrappers.
- Coordinator in auth-providers validates port messages with Zod, applies owner checks before/after, maps parser output to existing PlanUsageReading, and reuses source-chain failure precedence. Add injectable probe dependency to PlanUsageService and reader factories; shared registration always supplies a concrete real-or-refusing implementation.
- Probe lifecycle: temporary empty working directory with no workspace instructions/hooks, sanitized inherited environment retaining only required auth/path/home context, fixed terminal geometry and version allowlist. Validate version-specific startup/options that disable project hooks/auto-prompts. Wait for a recognized idle command prompt; write exactly `/usage` plus its command terminator once. Never send a print argument, free text, confirmation, login input, retry keystrokes or exit command. Cancel by killing, not typing. Unexpected onboarding/trust/login or model-turn activity aborts.
- This guard requires a verified interactive `/usage` command handler for each allowed version; an ambiguous screen does not justify submitting it. Capture and sanitize real interactive screen fixtures during implementation without any model prompts; until fixtures establish this contract, that version returns unsupported-version. Do not manufacture fixtures from help output.
- Render terminal control sequences into a bounded screen model (cursor moves, overwrites, clears and split chunks), not merely strip ANSI. Reject unsupported sequences, oversized input (64 KiB), incomplete screens, error dialogs, mixed accounts, missing applicable windows, percentages outside [0,100], ambiguous localized numbers/reset times or unknown model scope. Schema-valid complete windows only; never default missing usage to zero or treat credits/spend alone as subscription room. Discard raw screens after parsing; never log/store them.
- Hard lifetime: parent-enforced 11 s chain cap inside 12 s outer lookup. Allocate at most 2 s OAuth, 2 s LS, remaining up to 6.5 s PTY, reserve 0.5 s cleanup; Grok billing at most 4 s before the same PTY cap. Pass linked cancellation and absolute remaining deadline through stages; no stage resets it. If <1 s remains, skip PTY. Parent watchdog kills child even if worker/native startup stalls. Unknown/timeout is valid if a cold CLI cannot finish.
- Replace Antigravity's independent 20 s chain and 15 s CLI allowances with this budget (`antigravity-plan-usage.reader.ts:48-51`; adapter timeout and runner options). Keep `evidence-precedence.ts:17-38` outer 12 s unchanged. Require tests showing no 12 s waiter leaves a 15–20 s child. Other providers retain current policies.
- Single flight keyed by provider + owner + auth epoch + resolved executable/version; at most one per provider and two total. Reuse existing 30 s success / 30 min parse-failure / 5 min operational-failure policy, expose safe reason and retry deadline. Transport-independent coordinator owns PTY caching; do not run it through the old pipe executor. Cancellation is per waiter; last waiter aborts transport. User cancellation/busy do not poison backoff. Auth changes invalidate the affected owner only; refresh never blindly clears failure backoff.
- Cleanup on completion, timeout, output cap, parse failure, cancellation, worker error and app shutdown: detach listeners, stop timers, dispose PTY and kill descendants, await bounded exit/worker termination and remove temporary cwd. Windows uses existing job/lifetime primitives where compatible; POSIX uses process group cleanup. Parent tracks worker and child lifetime, not just worker termination.
- Exhaustion flow: trusted failed-lane provider output → bounded provider-specific classifier → `laneLimitEvidence` → captured run owner/auth epoch and applicable scope → `recordOwnerEvidence` (Grok balance has no known window) → ledger merge → classifyLaneState → AT LIMIT. Store `source:'error-derived'`, pattern and observation time only; omit resetsAt entirely if absent and display reset unknown. Do not persist raw output or fabricate a rolling reset. Generic 402, 429 cooldown, model capacity, auth failures and quoted repository content are insufficient.
- Narrowly extend the existing classifier for leading `402 Payment Required:` at a provider-error boundary and test both nonzero failure and structured error with exit 0. Preserve current failed-run gating; successful output discussing an error must not set quota. Verify existing terminal finalization writes once and precedes later lookups; add integration coverage rather than editing the manager facade speculatively.
- Clearance: retain current ledger rules (`plan-limit-ledger.service.ts:20-42`, `plan-limit-ledger.rules.ts:152-172,195-219,278-285`). Newer same-allowance complete below-limit readings or proven plan-billed same-owner/scope success clear unknown-reset evidence; ordinary Grok success is not assumed plan-billed. Newer **request-start-after-hit**, validated positive Grok credits clear only `grok-balance-exhausted` via existing pattern method. Stale/cache data, missing auth, spend or a different account cannot clear it. Unknown-reset evidence expires after existing longest-window policy or restart and is not persisted; expiry yields unknown unless separate fresh room exists. Known-reset evidence retains its provider reset rules.

## Batches
Paths below are workspace-relative. Abbreviations: A=`libs/backend/auth-providers`, Q=`A/src/lib/quota`, R=`Q/readers`, C=`libs/backend/cli-agent-runtime`, L=`C/src/lib/cli-agents/limits`, E=`apps/ptah-electron`, T=`libs/backend/auth-providers-tokens`, H=`libs/backend/cli-engine`. Expand these abbreviations in commands. Each write set is exclusive; maximum six files and two Nx projects per batch. Run only the listed focused checks during implementation, one heavy command at a time; none were run in this planning lane.

### B1 — Grok direct-reader diagnosis and fallback seam (2 files; A)
- Write: R/grok-account-plan-usage.reader.ts, R/grok-account-plan-usage.reader.spec.ts.
- Read: same reader:14-65,73-208; Q/plan-usage.service.ts:398-449,479-549; context.md:31-49. Depends B4 contract; can prepare redacted fixtures first.
- Preserve valid current login billing mapping; emit safe distinguishable rejection reasons with injected Logger; accept optional fallback coordinator. Keep API-key, custom endpoints and owner gating intact. Do not refresh/rewrite CLI credentials.
- Verify: `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts`
- Verify: `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`; `npx eslint <the two write files>`.
- Accept: current redacted 200 shape produces complete windows, API-key spend stays separate, no PTY on direct success or auth mismatch, current-store/old-label discrepancy remains observable.

### B2 — Antigravity direct failures and replacement adapter (6 files; A)
- Write: R/antigravity-plan-usage.reader.ts and .spec.ts; R/antigravity-oauth-plan-usage.reader.ts and .spec.ts; R/antigravity-cli-usage.adapter.ts and .spec.ts.
- Read: reader:48-155 and local probe/discovery helpers:155-400; OAuth:81-210; adapter:90-150; R/usage-source-chain.ts:11-75; R/antigravity-ls.provisional.ts:24-65. Depends B4, B5.
- Preserve distinguishable missing OAuth, invalid grant, HTTP rejection, schema, timeout, missing server and account mismatch. Replace print execution with coordinator delegation; retain owner validation and parsed-window contracts. Apply shared 11 s budget and linked aborts.
- Verify: `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath <the three write-set .spec.ts paths>`
- Verify: `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`; `npx eslint <the six write files>`.
- Accept: no `-p /usage` execution remains; absent sources reach eligible PTY or explicit unsupported-host; no model request; failed source reasons survive; child closes before outer deadline.

### B3 — Exhaustion evidence regression (4 files; C and A)
- Write: L/lane-limit-classifier.ts, L/lane-limit-classifier.spec.ts, L/owner-lifecycle.integration.spec.ts, Q/plan-limit-ledger.service.spec.ts.
- Read: classifier:68-78,163-190,241-270; manager:3730-3765,3922-3985; Q/plan-limit-ledger.service.ts:20-42,280-362; Q/plan-limit-ledger.rules.ts:152-219,278-285; Q/plan-usage.service.ts:532-549. Independent of PTY.
- Verify: `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <the two L specs>`; then `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts`.
- Verify: `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`; `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`; `npx eslint <the four write files>`.
- Accept: exact supplied leading 402 error becomes owner AT LIMIT with no reset; unrelated/quoted errors do not; same-owner clearance ordering, positive-credit pattern clearing, account isolation and restart/expiry semantics hold. Existing ledger production code is reused, not expanded without a demonstrated failing case.

### B4 — Port, terminal parser and coordinator (6 files; A)
- Write: Q/usage-pty-probe.port.ts, Q/usage-pty-probe.service.ts, Q/usage-pty-probe.service.spec.ts, R/usage-screen.parser.ts, R/usage-screen.parser.spec.ts, R/usage-screen.fixture.ts (new).
- Read: R/plan-usage-reader.types.ts:49-140; R/fallback-usage.runner.ts:84-163,252-340; R/fallback-usage.constants.ts:1-40; R/antigravity-usage-window.ts:1-160; shared evidence-precedence.ts:11-38. No dependencies.
- Verify: `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath <the two new specs>`
- Verify: `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`; `npx eslint <the six write files>`.
- Accept: fail-closed screen state machine, Zod transport/window validation, owner-aware flight/cache/backoff, last-waiter abort and injected Logger. Only redacted synthetic or securely sanitized captured fixtures enter git.

### B5 — Shared DI and service wiring (6 files; A and T)
- Write: T/src/lib/tokens.ts; Q/index.ts; Q/plan-usage.service.ts; Q/plan-usage.service.spec.ts; A/src/lib/di/register.ts; A/src/lib/di/register.usage-pty.spec.ts (new).
- Read: PlanUsageService:186-247,479-549; registrar:330-355; T/src/lib/tokens.ts:18-30; Q/index.ts:1-100. Depends B4; coordinates final B1/B2 factory signatures.
- Add USAGE_PTY_PROBE token, public port export and default refusing implementation; factory injects host override and constructs one coordinator, passes it to both readers. Keep existing positional test seams compatible or migrate their callers in these specs.
- Verify: `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath <the two write-set specs>`
- Verify: `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`; `npx tsc --noEmit --project libs/backend/auth-providers-tokens/tsconfig.lib.json`; `npx eslint <the six write files>`.
- Accept: no host import in A, no unresolved token, no duplicate coordinator/cache and existing non-PTY readers unchanged.

### B6 — Native dependency lifecycle (5 files; root tooling and E)
- Write: package.json, package-lock.json, E/package.json, E/scripts/rebuild-native.js, E/scripts/verify-packed-native.js.
- Read: root package.json:50-70; E/package.json:1-100; rebuild-native.js:1-55,145-205; verify-packed-native.js:1-180. Independent of readers; precedes B7/B8.
- Pin chosen node-pty release only after Electron 44/Node 24 compatibility check; update both manifests and lock coherently. Rebuild/probe PTY binding and helper executables for the runtime that loads it; preserve CLI's Node-native SQLite behavior. Extend packed-native validation to PTY load, helper presence and cleanup.
- Verify: `npx eslint apps/ptah-electron/scripts/rebuild-native.js apps/ptah-electron/scripts/verify-packed-native.js`; inspect exact manifest/lock dependency agreement. No Nx/packaging/install/rebuild invocation in implementation lanes under this task's check policy.
- Accept: changes make native compatibility testable without executing hooks during ordinary quota lookup. Actual packaged/native smoke validation is a release gate, not a result claimed by this plan.

### B7 — Electron bundle and packaging gates (4 files; E)
- Write: E/project.json, E/electron-builder.yml, E/scripts/validate-deps.js, E/src/config/worker-host-packaging.spec.ts.
- Read: project.json:30-90,313-350,520-535; builder:52-100,190-215; validate-deps.js:103-159; packaging spec:1-180. Depends B6.
- Add separate PTY worker bundle with node-pty external; declare runtime dependency coverage, unpack native binding and platform helper executables/DLLs; validate main and PTY worker externals. Ensure detached worker-host distribution does not accidentally load Electron-ABI native addons.
- Verify: `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/config/worker-host-packaging.spec.ts`
- Verify: `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`; `npx eslint apps/ptah-electron/scripts/validate-deps.js apps/ptah-electron/src/config/worker-host-packaging.spec.ts`.
- Accept: structural tests cover externalization/unpacking and worker artifact paths; no assertion that these replace a real Electron package smoke run.

### B8 — Electron implementation and root (6 files; E)
- Write: E/src/services/platform/electron-usage-pty-probe.ts and .spec.ts; E/src/services/platform/usage-pty.worker.ts; E/src/services/platform/usage-pty.worker.spec.ts; E/src/di/phase-2-libraries.ts; E/src/di/expected-resolvable.ts.
- Read: phase-2-libraries.ts:245-275,295-315; expected-resolvable.ts:100-120; platform-core process-spawner.interface.ts:1-90; agent-sdk/helpers/off-thread-process-spawner.ts:1-180 and source companion:1-140. Depends B4–B7.
- Keep native PTY startup off Electron's main thread. Use packaged worker module, not eval/source strings; Zod for worker messages. Parent watchdog owns cleanup. Resolve CLI wrappers without shell, bind local owner epoch and expose only probe(request), never generic terminal write.
- Verify: `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath <the two new specs>`
- Verify: `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`; `npx eslint <the six write files>`.
- Accept: only `/usage` is submitted once after recognized ready state; cancellation/shutdown kill descendants, no renderer freeze/window, missing native module gives explicit failure. Electron local probe stays local to its resolved credential store.

### B9 — CLI composition and refusal (2 files; H)
- Write: H/src/lib/container.ts; H/src/lib/container.usage-pty.spec.ts (new).
- Read: container.ts:730-765; worker-host.entry.ts:1-5; H/jest.config.cjs:1-80. Depends B5.
- Bind refusing port explicitly in CLI composition; detached worker-host follows its CLI container. Do not route a local Electron PTY to an unrelated worker-host owner. A future remote PTY transport needs separate capability/ABI negotiation; this PR refuses it explicitly.
- Verify: `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/container.usage-pty.spec.ts` (existing config is .cjs, not an invented .ts).
- Verify: `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`; `npx eslint <the two write files>`.
- Accept: CLI direct readers and provider lanes work without node-pty being loaded; unsupported-host is observable and never becomes room.

## Composition roots
- Electron `phase-2-libraries.ts:262`: shared registrar first installs a refusal default; override token with singleton Electron adapter before PLAN_USAGE_SERVICE resolves. Add USAGE_PTY_PROBE to `expected-resolvable.ts` and assert real adapter resolution in B8 tests. No new registration in platform-core.
- CLI `container.ts:746`: explicitly bind refusal after shared registration and before service resolution; test direct readers still resolve. platform-cli needs no concrete PTY import. Detached worker-host uses this refusal, avoiding an unimplemented remote PTY protocol or ABI mismatch.
- A/src/lib/di/register.ts factory owns coordinator injection; port/token contract remains host-neutral and exported through existing A/T public barrels. No new Nx library, tags or alias changes required.

## Tests
- Use only the per-batch Jest/tsc/eslint commands above; `<write files>` and `<specs>` mean the explicit set in that batch, never a directory glob. For tsc errors outside changed projects, report baseline separately rather than broadening checks.
- Direct-reader fixtures: login/API-key, custom auth, current 200 Grok shape, prepaid malformed/positive/zero, 401/403/402, missing ACP token, refresh-invalid-grant, local server absent, LS schema/account mismatch. All HTTP/process interfaces are mocked; no model requests.
- PTY fixtures must cover split escapes, cursor overwrite, truncation, localized/ambiguous output, resets absent, model scope absent, startup trust/login prompts, unsupported CLI versions, forged/error text, partial terminal redraws and non-usage screens.
- Lifecycle/clock tests: cold 11 s cap, caller abort before launch/during read, worker crash/hang, descendant cleanup, last-waiter cancellation, single flight, bounded concurrency, auth epoch changes, stale timestamps, cache/backoff retry boundaries, no bypass on refresh, direct success suppresses fallback.
- Provider exhaustion tests must exercise the exact supplied 402 wording, isolated owner/epoch, unknown reset, existing positive-credit clearance request ordering and expired evidence yielding unknown. Never label estimated usage or absent sources as confirmed room.
- Later release validation must run a real packaged Electron/native PTY smoke on supported OS/architecture and confirm no orphan CLI/helper processes; not run or authorized as a lane command here. Failure keeps the capability unavailable, never enables a pipe/print fallback.

## Risks
- Login billing now succeeds; diagnosing the old “API key” label requires the running host's environment/auth epoch/cache provenance, unavailable here. Do not force a wrong fix to match an old symptom. The earlier 402 remains supplied historical evidence, not a freshly generated or newly timestamped observation.
- Missing Antigravity OAuth/LS is environmental; this PR cannot promise known room on every host. PTY remains unknown until an installed version's interactive screen and command handler are verified. No user-reserved product choice blocks writing this plan.
- Native dependency adds build-tool/prebuild, Electron ABI, helper executable and Windows cleanup work. Native/package validation cannot be proven by tsc or source inspection and remains a release gate.
- Private provider endpoints/UI output may change. Version allowlisting, strict schemas and backoff intentionally trade availability for trustworthy limits. CLI identity changes while probing must invalidate results.

## Decisions
| Decision | Options | Evidence / cost | Reversible |
| --- | --- | --- | --- |
| Repair readers before PTY | Direct-only / PTY-only / ordered chain | User decision 2; current Grok HTTP 200, absent Antigravity sources. Keep working direct sources and improve reason mapping. | Yes |
| Recommend node-pty for local Electron | node-pty / Windows ConPTY bridge / no PTY | No PTY dependency in manifests/lock. node-pty requires B6–B8, native runtime rebuild/probe, externalization, unpacking and cleanup tests. Reuses a PTY abstraction across supported hosts; exact release compatibility still needs validation. | Yes, capability can refuse |
| Do not implement a bespoke ConPTY bridge | ConPTY native binding or helper executable / node-pty | ConPTY still needs native/helper packaging, IPC, cancellation/security review and Windows-specific testing; it does not remove terminal emulation/ownership costs and adds a second OS implementation path. Existing pipe spawner is not a PTY. | Yes |
| No PTY is safe but incomplete | Ship direct repair + exhaustion only / enabled validated PTY | Lowest dependency cost, but absent Antigravity direct sources remain unknown; acceptable degraded state when version/native validation fails, not a claim of full fallback coverage. | Yes |
| Keep outer 12 s, budget within it | Raise global lookup / bound this chain | Shared evidence-precedence.ts:17-38; avoids extending every agent-list wait; 11 s chain includes cleanup. Slow cold starts return unknown. | Yes |
| Reuse ledger and targeted classifier repair | Duplicate evidence service / existing pipeline | Existing 402 matcher and credits clearance already exist. Exact leading-status wording is the demonstrated gap; existing reset/clear policy remains authoritative. | Yes |
| Standalone CLI/worker-host explicitly refuse PTY in PR1 | Remote protocol now / capability refusal | CLI continuity required; remote PTY/credential routing and Node-vs-Electron ABI multiply scope. Electron-local PTY enabled only with verified local ownership. | Yes |

## Lane-introduced constraints
- No source, credential or configuration files changed in this lane; only this deliverable. No git mutations, builds, serve, tests, e2e, Nx or npm-run-verify commands executed. Read-only diagnostics used argument-array-safe Node/PowerShell APIs with sub-20 s network/process allowances and no model prompts.
- Implementation rules: no any, no `as unknown as`, no non-null assertions hiding errors; `catch (error: unknown)` with Error checks; Zod on external files/network/process/worker payloads; injected Logger with redacted metadata only. Cross-spawn/which + argument arrays for ordinary processes, never shell:true; node-pty's dedicated spawn API for terminal creation. Files under 700 lines; split helpers rather than grow existing god files.
- Implementation lanes run only focused Jest, tsc and eslint commands specified per batch; never npm run verify or nx. New/changed terminal UI is not a renderer feature; no Angular/template work is in scope.
- Ptah file search was used; native PowerShell/rg supplied targeted literal reads and diagnostics. CLI-native skill discovery was unavailable (Ptah harness skill search is not this CLI's skill loader); no skill was required or applied. No UI/design implementation or screenshot claim.

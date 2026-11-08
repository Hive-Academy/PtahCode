# Agent report

## Changes and root causes

- N2: `getAgentBudgetState` matched a stopped state using a registry teammate name that can outlive the stop. The lookup now uses the recorded stopped identity only for stopped states, while live registry names apply only to active states. [subagent-budget-monitor.ts:781](../../../libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts). Regression: same-name replacement with old registry record, [spec:469](../../../libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts).
- N3: `stopInFlight` was set before handoff preparation, but budget state remained running until the dispatcher call. The lookup now reports pending and stopped throughout preparation. [subagent-budget-monitor.ts:784](../../../libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts). Regression: deferred record write [spec:507](../../../libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts).
- N4: fallback transcript lookup used only the current workspace slug. It now checks every direct project directory beneath the real Claude projects root, keeping basename, realpath, containment, and regular-file checks. [subagent-budget-monitor.ts:312](../../../libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts). Regression: file in a different project after current-project file disappears [spec:433](../../../libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts).
- Flaky rescan: the spec slept 50 ms instead of awaiting its own rescan. It now awaits the index loading promise. [subagent-handoff-index.spec.ts:256](../../../libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-handoff-index.spec.ts).
- SubagentStop background: the SDK hook input has no background flag. The handler previously converted a missing registry record into `false`. It now reports `null` when unknown and the registry value when known. [subagent-hook-handler.ts:483](../../../libs/backend/agent-sdk/src/lib/helpers/subagent-hook-handler.ts); [spec:95](../../../libs/backend/agent-sdk/src/lib/helpers/subagent-hook-handler.spec.ts). A known background registry record still follows the background-completion branch.
- Redaction: a fixed long-flag list missed prefixed credential names and the camelCase key allowlist missed encryption/signing/auth/master keys. The patterns now cover credential-suffixed long flags and those key names, while preserving sortKey, primaryKey and token-budget. [subagent-budget-monitor.ts:226](../../../libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts), [line 271](../../../libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts); regressions [spec:374](../../../libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts). Regex matches are bounded to a single flag token and have no nested unbounded repetition.

## Decisions

- Unknown background status is reported as `null` because the SDK SubagentStop input does not expose it; this is reversible if the SDK adds a field. The alternatives were reporting false or guessing from unrelated hook fields. SDK type declaration and registry behavior support the chosen value.

## Verification

- Requested: `npm run verify -- -t lint,typecheck,test -p agent-sdk` — lint and typecheck passed. Full tests: 222 suites passed, 3 failed. Two failures were the known Windows symlink EPERM cases in `plugin-loader.service.capabilities` and `plugin-loader.service.session-notice`. The third suite exposed two budget-spec assertions, corrected after this run.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false` on the three changed specs — 3 suites and 242 tests passed after corrections.
- `ptah_get_diagnostics` scoped to changed TypeScript source and specs — zero errors and warnings after retry.
- No build, serve, dev, e2e, workspace-wide check, commit, or push.

## Live check needed

- Run a background subagent to completion in the host and confirm the registry-bound SubagentStop log reports `isBackground: true`. If the registry record has already disappeared, the log should report `null` and the SDK hook alone cannot recover the value.



## Round 1 fixes

- N4 lookup: `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:313-360` now uses async filesystem calls. It validates and returns the current workspace path before listing any projects; a root readdir error therefore cannot bypass a valid current path. Fallback selects the newest valid transcript by mtime, with path order as a tie breaker. Existing basename, traversal, realpath containment, and regular-file checks remain. `subagent-budget-monitor.spec.ts:455-484` covers current-project priority and newest fallback, while the preceding spec retains traversal and outside-root checks.
- N4 cache: `subagent-budget-monitor.ts:815-836,1463-1473` caches transcript lookup by current session id and agent id. Positive paths remain for the bounded 256-entry cache; misses expire after five seconds. The hook awaits async validation at `libs/backend/agent-sdk/src/lib/helpers/subagent-hook-handler.ts:439`. `subagent-budget-monitor.spec.ts:566-574` checks a missing result is reused across stop retries. The test harness injects the lookup at the filesystem boundary (`subagent-budget-monitor.ts:581`) to keep fake-timer specs deterministic.
- Redaction: `subagent-budget-monitor.ts:273` matches access-key, encryption-key and signing-key flag suffixes. `subagent-budget-monitor.spec.ts:382-386` tests equals and space forms with assembled fake values. Existing sortKey, primaryKey and token-budget preservation specs remain. The regex scans one flag token from an anchored `--` prefix without nested unbounded repetition.
- Preparation-failure steer: retained the existing retry behavior. During preparation the state is pending and a steer can be refused; if writing the handoff record fails, the state returns to none so the agent can continue and a later request can retry. Keeping a pending refusal after preparation fails would permanently block steering of an agent that was never stopped. `subagent-budget-monitor.spec.ts:548-564` pins this transition.

Verification: targeted Jest run for the monitor and hook specs passed (2 suites, 225 tests). The requested `npm run verify -- -t lint,typecheck,test -p agent-sdk` was started and is running; append final result below.

Round 1 verification result: `npm run verify -- -t lint,typecheck,test -p agent-sdk` completed with lint and typecheck passing. Full Jest run: 223 suites passed, 2 failed, 2 skipped; 5,599 tests passed, 2 failed, 5 skipped. Both failures are the known Windows symlink `EPERM` tests in `plugin-loader.service.capabilities.spec.ts` and `plugin-loader.service.session-notice.spec.ts`; no changed suite failed. `ptah_get_diagnostics` was also called after edits but its compiler check timed out; the passing project typecheck in `verify` is the authoritative result.

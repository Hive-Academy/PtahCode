# Batch A/B TTL regression fix

## Root cause

`libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:864` (before fix): `captureProgress()` called `this.registry.get(toolCallId)` on every subagent assistant sample, even when the message had no `transcript_path`. The executor TTL tests use a narrow registry stub without `get`; the call threw after state creation but before `count()` at line 980. Thus `weightedUsed` stayed 0. The TTL weighting function and executor TTL propagation were unchanged.

## Fix

Moved the registry lookup into the `typeof rawTranscript === 'string'` branch. Ordinary usage samples now reach `count()` and `weightedRequestTokens(usage, cacheTtl)` unchanged. No process environment TTL read was added. Only `subagent-budget-monitor.ts` was changed for this correction; the executor spec was not edited.

## Verification

Command: `npm run verify -- -t test -p agent-sdk -- --testPathPatterns="session-query-executor.service.spec|subagent-budget-monitor.spec" 2>&1 | Select-Object -Last 30`

Output:

```text
[verify 2026-11-07T17:25:09.104Z] starting verify test (agent-sdk)
 NX   1 task: 1 succeeded
 Run duration:      10.3s
 Cache:             0/1 hit (0%)
[verify 2026-11-07T17:25:23.557Z] lock released after 14.5s, exit code 0
```

The targeted agent-sdk test task passed. No other checks were run.

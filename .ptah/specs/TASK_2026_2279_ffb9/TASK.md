# TASK: Fix subagent budget handoff and monitor logic

**Type**: BUGFIX  
**Branch**: fix/subagent-budget-handoff  
**Status**: Implementation in progress (codex lane running)  
**Priority**: HIGH (prevents subagents from stopping when they exceed the configured budget)

## Problem Statement

Three subagent executions (from session c081d52b-afb1-41b7-af72-459c0ec58589) exceeded their allocated context budgets but did not stop immediately. The budget monitor logged handoff records but continued running the subagents past the threshold.

**Evidence**:
- Subagent 1: Reached 201,207 tokens (exceeded 150,000-token limit)
- Subagent 2: Reached 200,331 tokens (exceeded 150,000-token limit)  
- Subagent 3: Reached 129,970 tokens (below limit but warned at 85%)

## Root Cause Analysis

Three bugs were identified in the subagent budget system:

### Bug 1: Stop Threshold Too High (Priority: CRITICAL)
**File**: `libs/shared/src/lib/utils/agent-budget-policy.ts:110`

The policy's stop condition for 'budget' reason checks:
```typescript
contextTokens >= this.settings.handoffContextTokens * 2
```

This requires context tokens to reach **300,000** before triggering a stop, but the handoff threshold is **150,000**. The `* 2` multiplier is incorrect.

**Expected**: Should check `contextTokens >= this.settings.handoffContextTokens` (150,000)

**Impact**: Subagents exceeding the handoff threshold do not receive a 'budget' stop reason from the policy, leaving only the safety policy to trigger a stop (which may never fire).

### Bug 2: Handoff Not Triggering Stop (Priority: CRITICAL)
**File**: `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:657-664`

The monitor decides to stop based only on `state.policySnapshot.stopped`:
```typescript
const reason: StopReason | undefined = state.policySnapshot.stopped ? 'safety' : undefined;
if (!reason) {
  return;
}
```

The policy returns `handoff: true` when `contextTokens >= handoffContextTokens`, but this decision is not stored in the snapshot for later use. The monitor never checks this handoff decision.

**Expected**: Should also trigger a stop when `handoff: true`, with reason 'budget'.

**Impact**: Reaching the context token limit causes a warning but not a stop, allowing the subagent to continue running until another stop condition is met (or indefinitely).

### Bug 3: Unclear Stop Messages (Priority: MEDIUM)
**File**: Various in subagent-budget-monitor.ts

Stop messages do not clearly indicate which threshold triggered the action:
- Warning threshold: 85% of handoffContextTokens (127,500 for default 150,000)
- Handoff threshold: 100% of handoffContextTokens (150,000)
- Stop (weighted): When `stopWeightedTokens` exceeded
- Stop (safety): Duration, telemetry unavailable, etc.

Subagent 3 received a handoff at 129,970 tokens, which is confusing because that is below the 150,000 limit but above the 85% warning threshold (127,500).

**Expected**: Messages should state "warning at 85% threshold" vs "handoff at 100% threshold" vs "safety stop due to X".

## Measurements

**Initial Cache Burden**:
- System prompt, tool schemas, CLAUDE.md plus four imported analysis documents, and skills list
- Initial assistant response costs: **~109,000 tokens** (73% of 150,000-token limit)
- Working room for subagent: **~41,000 tokens** before warning threshold

This high initial cache burden leaves little room for the subagent to work before hitting the warning threshold (85%).

## Fixes Required

### Fix 1: Remove `* 2` from Stop Threshold
**File**: `libs/shared/src/lib/utils/agent-budget-policy.ts:110`
**Change**: Remove `* 2` multiplier from the contextTokens stop condition
**Before**:
```typescript
: total >= this.settings.stopWeightedTokens || (contextTokens !== undefined && contextTokens >= this.settings.handoffContextTokens * 2) ? 'budget' as const
```
**After**:
```typescript
: total >= this.settings.stopWeightedTokens || (contextTokens !== undefined && contextTokens >= this.settings.handoffContextTokens) ? 'budget' as const
```
**Tests**: Verify stopReason is 'budget' at exactly `handoffContextTokens`, not at `handoffContextTokens * 2`

### Fix 2: Handoff Decision Triggers Stop
**File**: `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:657-664`
**Change**: Add handoff decision as a stop trigger
**Before**:
```typescript
const reason: StopReason | undefined = state.policySnapshot.stopped ? 'safety' : undefined;
```
**After** (one of):
1. Store transition.handoff in state and check: `state.policySnapshot.stopped ? 'safety' : state.policySnapshot.handoff ? 'budget' : undefined`
2. Directly check: `state.contextTokens >= subagentHandoffTokens ? 'budget' : (state.policySnapshot.stopped ? 'safety' : undefined)`
3. Re-evaluate policy with contextTokens

**Tests**: Verify monitor stops immediately when contextTokens >= handoffContextTokens

### Fix 3: Clear Stop Messages
**File**: Various stop message locations
**Change**: Update messages to name the threshold (85%, 100%, weighted tokens, safety policy)
**Tests**: Verify messages clearly state which threshold triggered the stop

## Verification Requirements

After implementing fixes:

1. **Unit Tests** (must pass):
   - `npm run verify -- -t test -p agent-sdk,shared`
   - Budget policy tests verify stop threshold
   - Monitor tests verify handoff triggers stop

2. **Type Checking** (must pass):
   - `npm run verify -- -t typecheck -p agent-sdk,shared`

3. **Linting** (must pass):
   - `npm run verify -- -t lint -p agent-sdk,shared`

4. **Integration** (must not break):
   - Electron host continues working with budget monitor
   - CLI host (platform-cli, cli-engine) continues working
   - No changes to auth-providers or cli-agent-runtime quota/limits files

## Deliverables

- [ ] `implementation-status.md` - Summary of all changes and test results
- [ ] Modified source files committed to fix/subagent-budget-handoff branch
- [ ] Pull request opened with:
  - Clear title: "Fix subagent budget handoff and monitor logic"
  - Description including: bug analysis, fixes, verification results
  - Link to this task and measurement analysis

## Constraints

- **No breaking changes**: Electron and CLI hosts must continue working
- **No auth-providers/quota changes**: Leave `libs/backend/auth-providers/` and `libs/backend/cli-agent-runtime/` untouched
- **Verification scope**: Use `--related` to verify only affected projects, not the entire workspace
- **Code quality**: Follow project conventions, add tests, maintain type safety

---

**Analysis Date**: 2026-11-18  
**Lane Status**: Running (started 14:28 UTC, CLI session 01a1ef0f-a328-7362-81be-9843326d17e8)  
**Expected Completion**: ~30-45 minutes total (lane estimate + review + commit + PR)

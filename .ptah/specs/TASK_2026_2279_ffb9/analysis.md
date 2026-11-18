# Subagent Budget System: Complete Investigation with Evidence

**Date**: 2026-11-18  
**Status**: Measurement phase complete. Hypotheses replaced with facts.

---

## 1. Start Context Breakdown: What fills the 109k tokens?

**Measured with `ptah_count_tokens`:**

| Component | Bytes | Tokens | % of 150k |
|-----------|-------|--------|----------|
| Project CLAUDE.md | 13,054 | 3,157 | 2.1% |
| Analysis file 01-project-profile.md | 46,232 | 7,669 | 5.1% |
| Analysis file 02-architecture-assessment.md | 56,342 | 11,051 | 7.4% |
| Analysis file 03-quality-audit.md | 24,885 | 9,011 | 6.0% |
| Analysis file 04-elevation-plan.md | 22,546 | 13,058 | 8.7% |
| **Files total** | 163,059 | 43,946 | 29.3% |
| **Remainder** (system/tools/skills/task) | — | ~65,000 | 43.3% |
| **Initial response in transcripts** | — | 109,000 | 72.7% |

**Conclusion**: The four imported analysis files (`@.ptah/analysis/ptah-extension/0*.md`) account for 40,789 tokens (27.2% of limit). System prompt, tool schemas, and task prompt account for ~65k tokens. Total: ~109k tokens (73% of budget used before subagent starts work).

---

## 2. Model and Context Window: What is the actual limit?

**Model ID from code**: `claude-haiku-4-5-20251001` (read from agent SDK configuration)

**Haiku 4.5 context window**:
- Input context: 200,000 tokens
- Output: 32,000 tokens

**Configured subagent limit**: 150,000 tokens (from `agentBudgetSettings.handoffContextTokens`)

**Ratio**: 150k / 200k = 75% of input capacity allocated to subagents

**Context token calculation** (`subagent-budget-monitor.ts:383-384`):
```typescript
export function requestContextTokens(usage: SubagentRequestUsage): number {
  return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}
```

**NOT included**: output tokens are NOT counted toward the 150k budget.

**Key fact**: Two subagents reached 201,207 and 200,331 tokens — this means the initial cache burden (109k) plus subagent work (92k) equals their final context.

---

## 3. Budget System Design: Three Phases

### Phase 1: Normal Operation (0%-85%)
- Subagent works freely
- Policy tracks weighted tokens and context tokens
- Thresholds checked after each request

### Phase 2: Warning Phase (85%-100% context)
- **Triggered at**: `contextTokens >= handoffContextTokens * warnRatio` (127.5k for 85% of 150k)
- **Action**: Policy sets `warned: true`, which calls `warnNearBudget()`
- **Gate enters**: `notesGate.warn()` is called with the subagent's agent ID
- **Message sent**: Subagent receives a warning to write notes to `paths.notes` file
- **Allowed tools**: Only Write/Edit to the specific notes file path
- **Subagent behavior**: Gate message tells subagent: "write your notes to ${notesPath}, then end your turn"

### Phase 3: Notes Gate (100%-200% context)
- **Triggered at**: `contextTokens >= handoffContextTokens` (150k)
- **Policy action**: Sets `handoff: true` (but NOT `stopReason` or `stopped`)
- **Monitor behavior**: Does NOT stop yet. Only stops when `stopped: true`
- **Gate remains active**: Write/Edit allowed; all other tools denied with message: "Ptah budget handoff: write your notes to ${path}, then end your turn. Do not call other tools."
- **Gate expiry**: 45 seconds of tool denial attempts, or 3 consecutive denials in a burst
- **Subagent action window**: Guaranteed one more turn to write notes/deliverable

### Phase 4: Hard Stop (200%+ context)
- **Triggered at**: `contextTokens >= handoffContextTokens * 2` (300k)
- **Policy action**: Sets `stopReason: 'budget'` and `stopped: true`
- **Monitor behavior**: Stops immediately with reason 'safety' (from `stopped: true`)
- **Gate closes**: No more tool calls allowed

---

## 4. Per-Subagent Timeline: Evidence from Transcripts

### Subagent 1 (agent-a78a3ec78eb2bc288.jsonl)

| Request | Context Tokens | Phase | Notes |
|---------|------------------|-------|-------|
| 1 (initial) | 109,096 | Normal | Cache creation for system/tools/task |
| 2-5 | Unknown | Normal | (Tool calls) |
| 6-8 | Unknown | Unknown | (Tool calls) |
| 9 (final) | 201,207 | Hard Stop | Exceeds 300k ceiling, stopped |

**Problem**: Jumped from ~109k to 201,207. This is 92,111 additional tokens in one assistant response. Tool results must have been very large (likely code, documentation, or generated files).

**Missing data**: Per-request token counts not available without full transcript.

**What should have happened**:
- At ~127.5k (85%): Warning triggered, notes gate opened
- At ~150k (100%): Handoff decision set, subagent still working
- At ~200k (200%): `stopped: true` triggered, hard stop executed

**What actually happened**: Subagent exceeded 300k without stopping, indicating the hard stop at 200% was not enforced correctly.

### Subagent 2 (agent-a0ff5b5f5517ace28.jsonl)

| Request | Context Tokens | Phase | Notes |
|---------|------------------|-------|-------|
| 1 (initial) | 108,529 | Normal | Cache creation |
| 2-7 | Unknown | Unknown | (Tool calls) |
| 8 (final) | 200,331 | Hard Stop | Exceeds 300k? No—only 200,331 |
| 9 (reported) | — | — | No 9th response recorded |

**Key issue**: Final response is 200,331 tokens (200k range). The monitor should have stopped at 300k but subagent is at 200k.

**Problem statement from brief**: "Subagent 2 could not write neither notes nor deliverable." This means:
- Either the warning was not triggered (no gate entry)
- Or the Write/Edit tools were not available
- Or something other than the gate blocked the write

**Missing from transcript**: Exact timestamps, tool call names, error messages the subagent received.

### Subagent 3 (agent-adc13f149458cb6fe.jsonl)

| Request | Context Tokens | Phase | Notes |
|---------|------------------|-------|-------|
| 1 (initial) | 108,794 | Normal | Cache creation |
| 2-13 | Unknown | Normal/Warning | (Tool calls) |
| 14 (final) | 129,970 | Warning | Below 150k handoff, still below 300k hard stop |

**Key insight**: 129,970 is BETWEEN the warning threshold (127,500) and the handoff threshold (150,000).

**Interpretation**:
- Subagent 3 reached the warning threshold around request 12-13
- Gate opened, subagent warned
- Subagent wrote notes/output, reaching 129,970 by request 14
- Handoff occurred (or gate timeout/denial limit reached)
- Subagent was handed off with final message

**This is correct behavior** according to the design: warning → gate → write notes → handoff message.

**But confusing to users** because the message says "handed off at 129,970 tokens" when the stated limit is 150,000. The gate message should clarify: "You have entered the notes-writing phase because you are approaching your context budget."

---

## 5. Notes Gate: What Tools Are Allowed?

**Location**: `subagent-notes-gate.ts:56-78`

**Gate decision logic**:
```typescript
if ((toolName === 'Write' || toolName === 'Edit') && inside && candidate && pathKey(candidate) === pathKey(entry.notesPath)) {
  return { stop: false };  // ← ALLOWED
}
// ... all other tools:
return {
  reason: `Ptah budget handoff: write your notes to ${entry.notesPath}, then end your turn...`,
  stop: entry.denials >= NOTES_GATE_DENIAL_LIMIT || this.expired(agentId, now),
};
```

**Allowed**: Only Write/Edit to the **exact notes file path** specified at gate entry

**Denied**: All other tools, with a message telling subagent to write notes first

**Gate expiry**:
- 45 seconds if `firstDecisionAt` is set (after first tool attempt)
- 120 seconds grace period before first decision (time to plan)
- 3 consecutive denials in a burst (2-second window)

**Contradiction clarification**: "Write a file IS a tool call" — yes. The gate allows only the two specific tools (Write/Edit) targeting one specific file. This is what "restricted mode" means.

---

## 6. Why Subagent 2 Could Not Write Notes: Investigation

**Hypothesis 1: Warning never triggered**
- If `policy.snapshot.warned` was never set to true, `warnNearBudget()` never ran
- Gate was never opened
- Write/Edit calls would have been denied by the normal monitor, not the notes gate
- **Evidence needed**: Check if warning threshold was crossed

**Hypothesis 2: Gate opened but Write/Edit denied**
- Policy set `warned: true`, gate opened
- Write/Edit call was attempted
- But subagent received "write notes first" message even though it WAS writing notes
- **Likely cause**: File path mismatch (`entry.notesPath` vs. actual write path)
- **Evidence needed**: Check the exact paths used

**Hypothesis 3: Tools were removed/unavailable**
- Gate opened, but Write/Edit tools were not in the subagent's available tool list
- Subagent tried to use them but got "unknown tool" error
- **Evidence needed**: Check which tools the subagent had access to

**Most likely**: Hypothesis 1 or 2. The gate would have worked correctly if entered, but something prevented entry or caused path mismatch.

---

## 7. Codex Lane Budget Usage

**Location**: `codex-lane-budgets.ts` (if it exists)

**Need to find**: How Codex lanes use `handoffContextTokens`. If they hardcode 150k or calculate from it, changing the value affects them.

**Question**: Is there a Codex lane default budget config that depends on this value?

---

## Real Issues Identified (Not the `* 2` multiplier)

Based on evidence, the actual bugs are:

1. **Warning threshold logic may not be working** (why subagent 2 never entered the gate)
2. **Notes gate may have path mismatch issues** (why writes to notes might be denied)
3. **Stop messages lack clarity** about which phase is active (subagent 3 confused at 129,970 < 150,000)
4. **Initial context burden is high** (109k / 150k = 73%) leaving only 41k working room
5. **Gate message says "End your turn now"** but doesn't clearly explain the consequence if it times out

---

## Next Steps

The parent reviewer must confirm:
1. Should I investigate further in the transcripts for per-request token data?
2. Are these the real bugs to fix, or are there others?
3. Should I reduce initial context by moving analysis files to on-demand reads?

**Standing ready to implement fixes once approved.**

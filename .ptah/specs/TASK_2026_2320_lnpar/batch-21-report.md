# Batch 21 report: B4 live usage normalization

## Changes

- MODIFIED `lane-usage-normalizer.ts`: `accept(laneId, scope, usage) -> { increment, turnTotal }`.
  - `message`: increment = the usage (without `costUsd`); the turn total adds increments.
  - `cumulative`: increment = delta to the previous snapshot of this turn (a regression starts a
    new series: increment = current); `costUsd` omitted.
  - `turn`: increment = `total - running sum` per counter (absent counters stay absent, may be
    negative); `costUsd` carried; turn total = the provider total.
  - Only `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `totalTokens` are
    differenced; `contextTokens`, `durationMs`, `model`, `models` pass through.
  - `settleTurn` clears the running sum and the `cumulative` snapshot.
- MODIFIED `agent-process-manager.service.ts` (usage fold in the segment handler only): scope =
  `segment.usageScope ?? handle.usageScope ?? 'turn'`; every usage segment reaches
  `outputBuffer.appendSegment` with `usage` rewritten to the increment; `tracked.outcomeUsage =
  turnTotal` (still only for handles with `outcomeUsageIsTurnTotal`); a negative correction is
  logged at debug; `recordRequestContext` still reads the provider's own figure.
  `recordLaneUsageOutcome` unchanged.
- Specs: `lane-usage-normalizer.spec.ts` rewritten for the new API (per scope card sum = durable
  total; negative turn correction; next turn's first cumulative snapshot is a full increment;
  snapshot fields never subtracted; cost only on turn). `usage-scope-adapters.spec.ts` reads
  `turnTotal` and checks the increments. Manager spec +1: mid-turn increments reach the buffer
  while the lane is still running, and the lane outcome records the turn total.

## Verification

- Focused jest: `lane-usage-normalizer.spec.ts` + `usage-scope-adapters.spec.ts`: 17 passed;
  `agent-process-manager.service.spec.ts`: 306 passed.
- `npx eslint` on the normalizer and specs: clean.

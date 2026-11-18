# Code logic review: batch 2 (fix items 4 and 5)

**Score: 5/10. Verdict: REVISE**

Method: I read `git diff` and the untracked files, and ran the two new specs (7/7 pass). I did not run nx or verify. Line numbers are in the working copy. For `subagent-context-limit.ts` and `subagent-successor-lineage.ts` they are approximate, because the files are dense.

The core math is right: `min(setting, floor(0.9 * window))` makes the setting a cap, and an unknown window falls back to the setting. Three things are wrong:
- The window is unknown in the incident scenario, so the cap does not apply there.
- The successor guard can be trivially bypassed.
- The guard's tests do not exercise the production path.

## Findings

### F1. HIGH: the window is usually unknown for the first subagent, so the setting still applies
- **Evidence:** `subagent-context-limit.ts` ~L13-38. `settings()` resolves the window with `resolveContextCapacity({route, model})` plus `this.windows`. `pricing.utils.ts` `resolveContextCapacity` returns a window only from the `getDiscoveredContextWindow(model, providerId)` catalog, or from the `sdkContextWindow` passed to `observe()`.
  - `observe()` learns the SDK window only from a `result` message's `modelUsage`. That message arrives at the end of the parent turn (`session-query-executor.service.ts` L341).
  - The subagent runs inside that same turn. In a fresh session the first subagent therefore sees `tokens: null` and uses the full setting (450k or 650k on a 200k window). That is the incident.
  - A native route with `providerId: 'anthropic'` has no discovered catalog unless it was registered earlier.
- **Impact:** item 4 only works from the second parent turn, or on proxy routes with a discovered catalog. The spec only checks `observe` followed by `settings`, never the first-turn order.
- **Fix:** read the window earlier.
  - Seed `windows` from the SDK init or `system` message or `supportedModels` data, or from a per-turn usage event.
  - Or add a verified fallback. The user chose "unknown means the setting", so a static fallback must be an explicit decision. A cheaper option is to warn once (not debug) that the window is unknown and the cap is not applied.
- **Test:** add a first-turn case with no prior `result` and assert what happens.

### F2. MEDIUM: the window is keyed by `[route, model]`, so a parent window can be applied to a subagent
- **Evidence:** `subagent-context-limit.ts` ~L13-26 and ~L28-34. The `modelUsage` window comes from the parent's `result`, keyed by model id.
  - If the parent runs `model[1m]` (window 1M) and a subagent runs the same base model at 200k, they collide. A 1M window gives `min(setting, 900k)`, which is the setting. This is the wrong-window case.
  - The route is `rec.capacityRoute`, which belongs to the session. A subagent can use a different model or provider via an override and still be matched against the session route.
- **Fix:** key by the exact model string from the assistant message, including any variant suffix. Skip the window when the entry is ambiguous, meaning the same key reported different windows within a turn.
  - Alternatively, use the smaller of the observed windows for that key.
  - Document that the route is session-scoped.

### F3. MEDIUM: the lineage guard is bypassable with plain text, and the "reduced scope" check is not validated
- **Evidence:** `subagent-successor-lineage.ts` `reduction = /^Ptah reduced scope: (\S.+)$/m`, in `readPredecessor` and `guardSuccessor`.
  - Any non-empty text after the prefix lifts the guard, including "Ptah reduced scope: x".
  - It also clears ancestry: `readPredecessor` returns `undefined`, so the chain history is lost.
  - The model controls the prompt, so it can omit the `Ptah predecessor handoff:` line entirely. `predecessorPath` is prompt-driven, so unlinked relaunch is never blocked.
- **Impact:** the "enforceable spawn-path guard" in root-cause item 5 is only advisory. The relaunch loop persists whenever the model omits the link.
- **Fix:** enforce lineage from the monitor, not the prompt.
  - Keep an in-memory map per session, keyed by teammate name or task description hash, of the last exhausted record. Deny an Agent/Task call matching the same scope without a reduction.
  - Require the reduction to differ from the predecessor prompt. For example, require a measurable smaller initial context (`initialContext` is already recorded but never used) instead of accepting any text.

### F4. MEDIUM: `completedDeliverable` is always false when no deliverables are declared, which can wrongly exhaust a productive successor
- **Evidence:** `subagent-budget-monitor.ts` L1773 calls `deliverables.completed(..., task?.deliverables ?? [], ...)`. `subagent-deliverables.ts` `completed()` returns `declared.some(...)`, which is `false` for an empty list.
  - A successor with no declared deliverables that wrote real files looks unproductive.
  - With `requestCount <= previous.requestCount` it is then marked exhausted, and the next relaunch is denied.
- **Impact:** this can block legitimate Agent/Task calls.
- **Fix:** treat any successful in-workspace Write/Edit before the warning as productive when nothing is declared, i.e. `paths.size > 0` excluding the notes file.
- **Test gap:** the spec only covers the declared-deliverable case.

### F5. MEDIUM: `getAgentBudgetState.budgetReached` still uses the raw setting
- **Evidence:** `subagent-budget-monitor.ts` ~L973 uses `new AgentBudgetPolicy(this.config.getAgentBudgetSettings())`, unlike the neighbouring L990, which got the effective limit.
- **Impact:** for a 200k window with a 450k setting, `budgetReached` stays false after the effective 180k is crossed. Callers that use it for the stop and resume decision see inconsistent limits.
- **Fix:** use `contextLimits.settings(config, state)` here too.

### F6. LOW-MEDIUM: ancestry is forgeable and the file read is unbounded
- **Evidence:** `readPredecessor` reads any workspace file ending `.handoff.md`, with no size cap. It then parses the last `Ptah lineage:` line.
  - Containment (`insideNotesWorkspace`, which resolves symlinks) and zod validation are correct.
  - A workspace file the agent can write can supply `exhausted:false` or `true`.
  - The record is not verified against the registry or a real record path.
- **Fix:** restrict the path to the record directory, or to records the monitor wrote, e.g. a `Set` of written record paths per session. Cap the read size, e.g. 256 KB.

### F7. LOW: silent fail-open paths
- **Evidence:**
  - `readPredecessor` returns `undefined` on schema mismatch or a missing marker with no log. Only caught errors log, and only at `debug`.
  - `guardSuccessor` passes silently when `workspaceOf` is `undefined`.
  - The hook's no-session branch (`subagent-budget-hooks.ts` L42-69) never calls `checkNotesTool` for a spawn.
- **Fix:** log at `warn` once per session when a linked predecessor cannot be read, so the loss of protection is visible.

### F8. LOW: lineage fields are partly dead, and some data is lost
- **Evidence:** `initialContext` is recorded but not used in `successorLineage`. A safety stop without warning records `warningReached:false`, which resets the chain.
- **Fix:** use `initialContext` in the exhaustion decision, as planned in item 5, or remove it.

### F9. LOW: the spawn-hook test does not prove the production path
- **Evidence:** `subagent-successor-lineage.spec.ts`, test "loads explicit ancestry...". The monitor passed to `createSubagentBudgetHooks` is a stub `checkNotesTool` that calls `guardSuccessor`.
  - The real `SubagentBudgetMonitor.checkNotesTool` (L685-690) is never run.
  - The `workspaceOf` resolution after rekey is never exercised.
  - The monitor's `prepareHandoff` lineage write (L1770-1773) is not covered by any test.
  - The effective threshold reaching `nearBudgetWarning` and `handoffMessage` is not covered.
- **Fix:** add a spec using the real monitor: stop a warned subagent, read the written record, then spawn with the link and assert denial. Add one for a subagent model change that resets the cap.

## Checked and OK

- **Cap math:** `min(setting, max(1, floor(0.9*window)))` is correct. Smaller settings are preserved, and the warning scales through `AgentBudgetPolicy(effective)`.
- **Model change:** a model change on the same state clears and recomputes the window, so it is not stale. Callers without a message reuse the state's window.
- **Unknown model or route:** it falls back to the setting. The tests cover other-provider, native/proxy mismatch and an unknown model.
- **State leak:** `windows` is capped at 4096 entries with FIFO eviction. `contextWindow`/`model` live on per-subagent state, which is released with the session.
- **`deliverables.finish` change:** it still runs at the other gate-finish sites (L883, L929, L1133, L1643). Session release (L1120) clears the rest. No leak found.
- **JSON validation:** the lineage JSON and the `result` and `assistant` shapes go through zod. Workspace containment and the `.handoff.md` suffix are enforced.
- **Notes turn:** `notes-gate` ends on the notes write or the time-based timeout, not on a count. The batch does not add a count.
- **Last marker wins:** this resists injected earlier `Ptah lineage:` lines in task text, because the real marker is appended last.

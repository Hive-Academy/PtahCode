# Failure diagnosis (verify -p auth-providers,ptah-electron)

## 1. @ptah-extension/auth-providers:test
Summary: 1 failed, 2707 passed (2718 total).
- FAIL src/lib/quota/plan-usage.service.spec.ts (12.2 s)
  - ● PlanUsageService › dispatch and merge › resolves the stored OpenCode Go credential for its reader
    - thrown: "Exceeded timeout of 5000 ms for a test."
    - Add a timeout value to this test to increase the timeout...
    - Cause: same timeout (spec around line 496)
- Cause guess: slow test under machine load (file took 12 s).
- (a) Related to the edits? NO. The edited codex-account-usage spec passes. plan-usage spec is untouched.
- (b) Timeout flake? YES (5000 ms timeout, no assertion failure).
- (c) Not a Windows root-cause failure. Re-run only this spec to confirm:
  npm run verify -- -t test -p auth-providers -- --testPathPatterns=plan-usage.service

## 2. ptah-electron:test
Summary: 1 failed, 1934 passed (1938 total).
- FAIL src/services/git-watcher.stress.spec.ts (104 s, very slow)
  - ● GitWatcherService — incident stress tests ST-1 / ST-1b (TASK_2026_437) › ST-1b: recursive delete under pkgs/big/ settles to a bounded refresh/overflow shape (AC-2)
    - expect(received).toHaveLength(expected)
    - Expected length: 1
    - Received length: 0  (spec line 158: expect(cyclesAfterOverflow).toHaveLength(overflowBatches.length))
- Cause guess: timing race in a stress test with real filesystem watching. Under load, the
  refresh cycle after overflow had not happened when the assertion ran.
- (a) Related to the edits? NO. review-lane-gateway.spec.ts did not fail (junction change works).
- (b) Load/timing flake? LIKELY YES (104 s runtime, count 0 = event not seen yet).
  It may also be a real Windows watcher issue. Re-run the spec alone to decide:
  npm run verify -- -t test -p ptah-electron -- --testPathPatterns=git-watcher.stress
- (c) If it fails again alone: it is a pre-existing Windows failure in the git-watcher
  stress spec (cycle after overflow). Inspect git-watcher.stress.spec.ts:140-160 and the
  watcher service overflow/rebuild path.

## Verdict
Neither failure relates to the two edited specs. Both look like load flakes.
Re-run each spec alone to confirm.

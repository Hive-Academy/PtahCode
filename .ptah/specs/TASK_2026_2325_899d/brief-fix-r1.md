# Fix round 1 briefs — TASK_2026_2325_899d (P1 review)

Read first: TF/lane-brief-common.md (short, binding). TF/code-logic-review.md has the triage table.
Each finding is described in full in TF/code-logic-review-p1-<A|B|C>.md (read your IDs there).
Fix only your IDs, in only your files. Add or update a spec for each fix. Do not weaken asserts.

## F1 — A1, C3 (agent-sdk + rpc-handlers runner)
Files: libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts + .spec.ts,
libs/backend/agent-sdk/src/lib/internal-query/internal-query.types.ts (+ internal-query.service.ts
only if the field must pass through), libs/backend/rpc-handlers/src/lib/harness/ai/
harness-llm-runner.service.ts + .spec.ts.
- A1: carry the resolved Setup `providerId` with the one-shot input (for example on the auth
  override or the dispatch route) and prefer it over `getActiveProviderId(env)` in
  `onProviderSubmit`. Keep the hostname heuristic only as fallback for callers without it. The
  harness runner passes the snapshot providerId. Specs: ollama-cloud through the local daemon
  (shares 127.0.0.1:11434 with ollama), ollama-cloud direct (ollama.com), custom base URL.
- C3: in the runner catch block, `timed-out` only when submitted && aborted; `pre-dispatch-error`
  when !submitted && aborted; keep `queue-timed-out` via InternalQueryQueueTimeoutError.
Checks: jest on the 2 specs (+ internal-query.service.spec.ts if touched) per project config;
tsc for agent-sdk and rpc-handlers tsconfig.lib.json; eslint on changed files.

## F2 — B1, B2, B4, B5 (lane-routing + agent-generation)
Files: libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts + .spec.ts,
libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts + .spec.ts,
libs/backend/agent-generation/src/lib/services/content-generation.service.ts + .spec.ts.
- B1: on the System One path a reasonless Install pick is unresolved (item goes to Normal), not
  an `itemRejections` entry, and does not make the stage `failed/invalid-output`. A healthy
  System One answer gives `status: 'used'` with `pairUsed` and no items. Update the spec at
  `skill-ranking-caller.service.spec.ts:395-421`. D26 still applies (no invented reasons).
- B2: in `prepareItem`, an item with empty/missing evidence has no eligible candidates, so it is
  filtered out before dispatch and goes to Normal. If no item is left, do not dispatch.
- B3 is disputed (plan rule): do not change the deprecated regex.
- B4: remove `resolveGuidanceRoute` if no caller exists (search libs and apps, specs included);
  else make it use `resolveSetup`.
- B5: log at `warn` when content generation runs without a `setupSnapshot` (non-Setup path).
Checks: jest on the 3 specs; tsc for lane-routing and agent-generation; eslint on changed files.

## F3 — A2, A3, A4, A5 (platform-core + shared + auth-providers)
Files: libs/backend/platform-core/src/file-settings-manager.ts + .spec.ts,
libs/shared/src/lib/utils/skill-document.ts + .spec.ts,
libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts + .spec.ts (A5 only
if a fix is needed).
- A2: in `setMany`, call each watcher in try/catch (log, continue) so a throwing watcher cannot
  reject a committed batch. Spec: throwing watcher, setMany resolves, values readable.
  Coordinator amendment C1 stays: `set()` unchanged.
- A3: document the setMany vs later set() ordering in the setMany doc comment. No code change.
- A4: escape `\` before `"` in name and description, and newlines in name. Spec with a trailing
  backslash and `C:\path`. Existing fixtures without `\` must stay byte-identical (keep the
  harness-fs byte-identity spec green: run
  libs/backend/rpc-handlers/src/lib/harness/io/harness-fs.service.spec.ts too).
- A5: read the proxy pool code. If `acquire` reuses one instance per (workspace, provider), write
  that evidence in the report and change nothing. Else add a check-only path for state reads.
Checks: jest on the touched specs + the harness-fs spec; tsc for shared, platform-core,
auth-providers; eslint on changed files.

## F4 — C1, C2, C4, C6, C7 (rpc-handlers handlers and services)
Files: libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts + .spec.ts,
libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts + .spec.ts,
libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.ts + .spec.ts.
- C1: after a successful `commitSetupPair`, never throw. Catch the second resolution; return
  `{ committed, commitSeq, state }` with a non-throwing state (for example `unavailable` with a
  safe cause). Spec: "post-commit resolution failure still returns the committed receipt".
- C2: the backstop fallbacks of `runJudgeWithDeadline` label Decision `failed` (not `skipped`)
  when Decision may have run; keep the stage categories fixed and safe.
- C4: before serialization, replace control characters (\r, \t, other C0) in the AI description
  with a space. (F3 makes the shared serializer escape `\`.)
- C6: `buildReasons` array `.max(10)`.
- C7: `SETUP_MODEL_INVALID` message names the stored Setup provider ID when known (not a secret).
Checks: jest on the 3 specs plus libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts; tsc for
rpc-handlers; eslint on changed files.

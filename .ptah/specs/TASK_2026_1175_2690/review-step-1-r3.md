# Review step 1, round 3

Reviewer: other-family review lane. Scope: fixes for N1-N4 from `review-step-1-r2.md`, and the
report `fix-2-review-result.md`.

Method: read-only. This lane could not run `git diff HEAD` (the tool asked for approval). The
lane read the changed files directly. It did not run `npm run verify`, `nx`, Jest or tsc. The
lane accepts the coordinator gate results (census 0, degradation audit 0, validate-skill 0,
manifest:check 0, skill copies identical) and the focused checks in the fix report.

## Verdict

**APPROVE**, with minor findings. No blocker. No major finding.

## Status of round 2 findings

| ID | Status | Evidence |
|----|--------|----------|
| N1 | Fixed | `retired-agent-origin.ts:16-38` reads the wizard origin store and compares hashes. The mirror calls it at `user-layer-mirror.service.ts:2339` (legacy seed) and `:2494` (scope seed). Sync calls it at `workspace-target.ts:455`. No path reads a sidecar for retirement now. |
| N2 | Fixed | `workspace-target.ts:661-665` skips the removal of every base agent entry with a retired name. An old provider copy stays. |
| N3 | Fixed | `agent-role-resolver.service.ts:75-80` gives `Role "<role>" is retired. Use the "implement" phase instead.` `decisions.md:21` and `built-in-agents.md:38` record option 1 and the spawn behavior. |
| N4 | Fixed | `index.mdx:10` says "such as testing, UI review, or research". |

## Answers to the coordinator questions

### (a) Duplicated store-format read

Acceptable for this step. The direction of dependency is correct: `agent-generation` imports
`harness-sync`, so `harness-sync` cannot import `WizardAgentOriginStore`. The copy matches the
real store: same path (`.ptah/setup-wizard/agent-origins.json`), same `version: 1`, same entry
schema (`wizard-agent-origin.store.ts:43-53`), and the same hash (`contentSourceHash` in
`source-hash.ts:74-76`: CRLF to LF, `sha256:<hex>`). The only difference is the key rule
(`z.string()` here, `z.string().min(1)` in the store). This difference has no effect.

The risk is drift. See finding R3-1 for a low-cost fix.

### (b) Is `harnessRoot` correct at each call site

Yes, at all three sites.

- **Scope seed** (`user-layer-mirror.service.ts:2494`): `dirname(dirname(agentSourceDir))`.
  The only producer of `agentSourceDir` is `agent-sync-gate.ts:190`, which gives
  `join(harnessRoot, '.claude', 'agents')`. So the result is `harnessRoot`. The derivation is
  fragile, see R3-3.
- **Legacy seed** (`:2339`): `workspaceRoot` is `sources.workspaceRoot`, which
  `agent-sync-gate.ts:191` sets to `harnessRoot`.
- **Sync** (`workspace-target.ts:455`): `workspaceRoot` comes from the reconciler, which uses
  `resolveHarnessWorkspaceRoot(cwd)` (`harness-reconciler.service.ts:182,203,283`).
- The wizard records with the same `harnessRoot` (`wizard-generation-rpc.handlers.ts:1036`).
  So a worktree and the main checkout read one store.

### (c) Does the source-clone hash rule break a case

No case loses capability. Every mismatch keeps the agent active (fail open). Known effects:

- **Sync, clone not rebased yet.** The wizard wrote v1, the mirror cloned v1, then the wizard
  wrote v2 and recorded the v2 hash. The clone is still v1, so the hashes differ. The agent
  syncs to `.codex` and `.opencode` until a rebase. Retired roles are no longer generated, so
  this case occurs only for data from before this change. Acceptable.
- **Workspace file deleted, clone kept.** `readFileSync` throws, the check returns `false`, and
  the clone still syncs. This is the fail-open direction. Acceptable.
- **Legacy seed.** The source file and the workspace file are the same path, so the second hash
  is redundant. The flat legacy clone itself is not hashed. If the user edited only the flat
  clone, it is not seeded into the new scope. The flat original stays on disk (`:2302`), so no
  data is lost. Acceptable. See R3-4.

### (d) N2 reap skip

Correct for the goal. A retired Ptah agent is not desired, and the skip keeps its old provider
copy, so tracked `.codex/agents` and `.opencode/agent` files are not deleted.

Side effect: a user who deletes their own same-name agent keeps a stale provider copy. The
manifest no longer owns it after the pass, so later passes treat it as a foreign file. This
is the safe direction. See R3-5.

## New findings

### R3-1 (minor): the store format exists in two places with no shared contract

- Evidence: `retired-agent-origin.ts:7-13` and `wizard-agent-origin.store.ts:38-53`.
  `retired-agent-origin.spec.ts:30` builds its own hash, so a change in the store format or in
  `contentSourceHash` does not fail any test.
- Fix, choose one:
  1. Move `WIZARD_STATE_DIR`, `AGENT_ORIGINS_FILE` and `AgentOriginsFileSchema` into
     `harness-sync` (or `libs/shared`). Make `wizard-agent-origin.store.ts` import them.
     `agent-generation` already depends on `harness-sync`, so the direction is legal.
  2. Minimum: add one spec in `agent-generation` that writes a file with CRLF line ends,
     records it through `WizardAgentOriginStore.recordWritten(harnessRoot, slug,
     await store.hashWrittenFile(file))`, and asserts `isRetiredPtahAgent(...) === true`.

### R3-2 (minor): the new files are untracked

- Evidence: `git status` shows `?? libs/backend/harness-sync/src/lib/targets/retired-agent-origin.ts`
  and `?? .../retired-agent-origin.spec.ts`. `libs/backend/harness-sync/src/index.ts:347`
  exports the new file. `git diff HEAD` does not show these files.
- Fix: stage both files by explicit path in the commit. If they are missed, the
  `harness-sync` and `agent-generation` builds fail.

### R3-3 (nit): fragile root derivation in `mirrorAgents`

- Evidence: `user-layer-mirror.service.ts:2494` uses `dirname(dirname(agentSourceDir))`.
  This is correct only while `agentSourceDir` is `<root>/.claude/agents`.
- Fix: pass `sources.workspaceRoot` into `mirrorAgents` (the caller at `:472` has it), the same
  as the legacy seed does.

### R3-4 (nit): silent failure and repeated reads

- Evidence: `retired-agent-origin.ts:35-37` catches every error with no log. The function reads
  and parses the store again for each retired slug, with sync I/O in async paths.
- Fix: optional. Return a reason (`'no-store' | 'invalid' | 'mismatch' | 'retired'`) so callers
  can log through their injected `Logger` at debug level. The read count is at most three per
  pass, so the cost is low.

### R3-5 (nit): N2 also keeps a stale copy of a user-authored agent

- Evidence: `workspace-target.ts:661-665` checks only the name.
- Fix: no code change needed. Add one sentence to `built-in-agents.md:38`: "A provider copy of
  an agent with a retired name is not deleted when the source is removed."

### R3-6 (nit): formatting

- Evidence: lines over the print width at `retired-agent-origin.ts:9,24`,
  `workspace-target.ts:455`, `user-layer-mirror.service.ts:2339,2494`,
  `agent-role-resolver.service.ts:55,73`.
- Fix: run Prettier on these files (lint-staged will do it at commit).

## Strict TS rules

No `any`, no `@ts-ignore`, no `as unknown as`, and no `console.*` in the new or changed code
that this lane read. The store boundary uses Zod (`retired-agent-origin.ts:7-13`). The empty
catch has a `degradation-audit` marker.

## Electron and CLI

`isRetiredPtahAgent` uses only `fs`, `path`, `crypto` and `zod`. It has no host dependency, so
Electron, `platform-cli` and `cli-engine` get the same behavior.

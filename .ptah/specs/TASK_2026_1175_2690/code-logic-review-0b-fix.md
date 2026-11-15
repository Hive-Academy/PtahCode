# Code logic review: 0b fix batch (working-tree diff)

Reviewer: CLI lane, read-only. Only this file was written.
Checks run: `npx tsc --noEmit --project libs/backend/skill-synthesis/tsconfig.lib.json` (exit 0) and `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json` (exit 0). No Jest run (the coordinator gate runs tests).
Deferred and not reported again: C4 history filter, D7 CLI DI spec, D2 host wiring of the clone-active predicate.

## Verdict: CHANGES

The gate fix for D1 is correct. One major gap remains: the enhancer capability-loss guard compares raw `machineCapabilities` and not the effective capabilities. An enhancer proposal can upgrade a version 1 `design.md` clone to version 2 with `machineCapabilities: []`, and the browser gate is then lost (N1). The D6 fix is not reachable through the RPC path (N2).

---

## Findings table

| Finding | Closed | Evidence |
|---|---|---|
| D1 browser gate lost when the field is absent | Partly. Gate: yes. Enhancer guard: no (see N1) | Resolver refuses v2 without the field: `libs/backend/lane-routing/src/lib/contracts/phase-definition-resolver.ts:104-106`. Gate uses the legacy table for v1: `route-decide.service.ts:333-337`. Read or parse failure keeps the `??=` legacy fallback: `route-decide.service.ts:357` area. Shared schema has the same v2 rule: `libs/shared/src/lib/types/phase-dispatch.schema.ts:28-35`. Validator: `scripts/validate-orchestration-skill.ts:256`. Enhancer guard: `skill-enhancer.service.ts:959-961` (gap N1). |
| D2 disabled or partial clone wins | Partial clone: yes. Disabled clone: deferred (host wiring) | Per-file fallback to the plugin: `phase-definition-file.reader.ts:19-22`. Predicate seam with default `() => true`: `:13`. |
| D3 gate log hides the error code | Yes | `route-decide.service.ts:346` |
| D4 "reader unavailable" log noise | Yes | `route-decide.service.ts:350-355` (one time per service instance) |
| D5 writer creates a clone without `SKILL.md` | Yes | `safeClone` requires the clone folder and `SKILL.md`: `user-layer-skill-phase-writer.ts:62-65`, called at `:70` and `:101` |
| D6 revert fails when `phases/` is missing | Writer: yes. End to end through RPC: no (see N2) | `user-layer-skill-phase-writer.ts:110` adds `mkdir`. The RPC pre-check refuses first: `skill-clone-file-path.ts:40` |
| C1 symlinked parent on write | Yes, with a small residual window (see S1) | `user-layer-skill-phase-writer.ts:70-82` checks clone, `SKILL.md`, `.history`, `phases`, target under the slug lock, again after `mkdir`. RPC helper: `skill-clone-file-path.ts:33-47` |
| C2 revert reads a file outside history | Yes, with the same residual window | `user-layer-skill-phase-writer.ts:101-113` checks history root, snapshot folder, snapshot `phases`, source (twice), target |
| C3 apply overwrites edits made after preview | Yes for phase files | Hash check inside `withSlugLock`, before the snapshot: `user-layer-skill-phase-writer.ts:74-77`. Enhancer passes `formatSourceHash(proposal.currentBody)`: `skill-enhancer.service.ts:592`, refuses with `stale-proposal`: `:606-608`. Both sides read with `'utf8'` and hash with the same `formatSourceHash`, so the hashes agree. `SKILL.md` and agent/command applies have no stale check (C3 noted this as older behavior, not a regression). |

---

## Confirmed new defects

### N1. major: the enhancer guard allows a v1 to v2 upgrade that drops the effective browser requirement

- `libs/backend/skill-synthesis/src/lib/skill-enhancer.service.ts:959-961`.
- The guard compares `current.machineCapabilities` with `candidate.machineCapabilities`. For a version 1 file without the field, the resolver returns `[]` (`phase-definition-resolver.ts:110`). But the gate gives version 1 `design` and `visual-review` the legacy value `['browser']` (`route-decide.service.ts:333-337`).
- Failure path: a user clone has a version 1 `phases/design.md` with no `machineCapabilities`. The effective gate value is `['browser']`. An LLM proposal changes it to `version: 2` with `machineCapabilities: []`. `candidate.version < current.version` is false. `current.machineCapabilities` is `[]`, so the subset check passes. Preview (`:489`) and apply (`:570-576`) accept the proposal. After the write, the gate reads version 2 `[]`, and design routes to a lane without a browser.
- This is the exact D1 scenario (a pre-commit user clone plus an enhancer proposal), so D1 is not fully closed.
- Fix: compute the effective capabilities with one shared helper for both the gate and the guard. For example, export `effectiveMachineCapabilities(definition)` from lane-routing: v1 gives the legacy table, v2 gives `machineCapabilities`. Use it at `route-decide.service.ts:333-340` and at `skill-enhancer.service.ts:961`. Add a spec: current v1 `design.md` without the field plus candidate v2 `[]` gives `invalid-candidate`.

### N2. minor: the D6 writer fix cannot be reached through RPC, and `getHistoryBody` now throws for a snapshot without `phases/`

- `libs/backend/rpc-handlers/src/lib/handlers/skill-synthesis/skill-clone-file-path.ts:37-40`. When the parent folder of the target does not exist and it is not the clone folder, the helper returns `null`.
- Revert: `skillSynthesis:revertEnhancement` calls `assertSkillFileTarget` on the live clone (`skills-synthesis-rpc.handlers.ts:553`, `:1639`). If the user deleted `phases/`, the RPC throws `INVALID_PARAMS` before the writer runs. The `mkdir` at `user-layer-skill-phase-writer.ts:110` is never used from the UI.
- History body: `skillSynthesis:getHistoryBody` calls the helper with the snapshot folder (`skills-synthesis-rpc.handlers.ts:506-512`). Before this change, a snapshot without `phases/` returned `{ body: null }` (the `existsSync` check at `:527`). Now it throws `INVALID_PARAMS`. With C4 deferred, the UI shows every snapshot under every phase row, so an old snapshot now gives an error and not "no body".
- Fix: when the parent does not exist, walk up to the nearest existing ancestor. Check that the ancestor is not a link and that its real path is inside the real clone root. Then return the target. The writer already rechecks under the lock.

### N3. minor: the stale result types are hidden at the host adapter

- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-mirror.service.ts:1148` declares `writeEnhancedSkillFile(...): Promise<{ slug; historyTs: string | null; currentContentHash }>`. `writeSkillPhaseFile` now can return `{ stale: true, ... }`. TypeScript accepts this because the stale object is structurally assignable. At run time the `stale` flag survives, so the enhancer check works. But the mirror method type does not show the stale case. A later direct caller of the mirror would not see it.
- Fix: declare the return type as `WriteSkillFileResult | StaleSkillFileResult`, or as `ReturnType<typeof writeSkillPhaseFile>`.

### N4. minor: the guard misreports a broken current file as a refused candidate

- `skill-enhancer.service.ts:959-968`. If the current phase file does not parse (user edit error), `resolvePhaseDefinition(currentBody)` throws. The catch logs "phase candidate refused by the phase contract" and returns `false`. The enhancer can never propose a repair for a broken file, and the log blames the candidate.
- Fix: parse the current body in a separate `try`. When it fails, skip the comparison (and use the plugin file or the legacy table as the baseline for capability loss), and log a clear message.

### N5. nit: the stale result `currentContentHash` has a different meaning

- `user-layer-skill-phase-writer.ts:76` returns `formatSourceHash(liveBody)` (one file). In the success result, `currentContentHash` is `computeSourceHash(cloneDir)` (the whole folder). No caller reads it now. Rename the field in `StaleSkillFileResult` (for example `liveBodyHash`) or document it.

---

## Items checked with no defect found

- Capability matrix at the gate for a request that omits `requiredCapabilities`, `design` and `visual-review`:
  - v1 file: legacy `['browser']` (`route-decide.service.ts:333-337`).
  - v2 file without the field: resolver throws `INVALID_SCHEMA`, catch, legacy `['browser']`.
  - Missing clone file: reader falls back to the plugin file (v2 `[browser]`).
  - Missing plugin file or unreadable file: `readFile` throws, catch, legacy `['browser']`.
  - No reader (VS Code): legacy `['browser']`.
- Stale check placement: inside `ops.withSlugLock`, before `snapshotDirToHistory`. No snapshot is taken for a stale apply.
- Back-compat: `SKILL.md` and agent/command applies do not pass `expectedBodyHash`. `'stale' in written` is false for their results. `resolveSkillCloneFilePath` for `SKILL.md`: the parent is the clone folder, so a missing `SKILL.md` still returns the target.
- v1/v2 schema parity: the resolver (`phase-definition-resolver.ts:9,16,104-111`) and the shared dispatch schema (`phase-dispatch.schema.ts:18,25,28-35`) have the same version union, the same optional field, the same v2 rule and the same `[]` default.
- The dispatch schema now has a `.transform`. All `z.toJSONSchema` calls in `vscode-lm-tools` use `io: 'input'` (`session-tools.ts:52`, `route-tools.ts:94`, and others), so the transform does not break MCP schema generation.
- Validator against resolver: both accept versions 1 and 2, both require the field for v2, both refuse unknown tokens. The validator is not stricter or looser for these rules.
- Swallowed errors: the RPC helper catch (`skill-clone-file-path.ts:44-47`) returns `null`, and the caller logs and throws `INVALID_PARAMS`. The gate catch logs `code`. No new silent catch found.
- `isCloneActive` failure: a throw propagates out of `read()`, and the gate uses the legacy table.

## Speculation (not confirmed)

- S1. Residual TOCTOU: the writer checks `phases/` and the target, then calls `writeTextAtomic` and `copyFileAtomic`. A process outside Ptah can swap a folder for a link between the last `safePath` and the rename. The window is now small and needs local write access to the user layer. A complete fix needs handle-based access (`open` with `O_NOFOLLOW` on the parent), which Node does not give for folders. Accept as a residual risk or document it.
- S2. A version 1 file that declares `machineCapabilities` explicitly (for example `batch` with `[browser]`) is ignored at the gate, which uses the legacy table for all v1 files (`route-decide.service.ts:333-337`). The validator accepts this file without a warning. Consider: for v1, use the field when it is present, else the legacy table. Or let the validator warn that v1 ignores the field.
- S3. `snapshotDirToHistory` copies the whole clone folder. This review did not trace whether it follows links inside the clone (for example a linked `references/` folder). This was out of the fix scope.

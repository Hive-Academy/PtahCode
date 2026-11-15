# Code logic review: step 0b fix D

## Verdict: APPROVE

Both review threads close. The findings below are low or medium and do not block the push. Fix F1 and F2 if the team wants parity with the harness. I did not run `tsc` or `jest`. I rely on the implementer report for those results.

## Findings

| # | Severity | File:line | Issue | Fix |
|---|----------|-----------|-------|-----|
| F1 | Medium | `libs/backend/harness-sync/src/lib/sources/orchestration-phase-sources.ts:38` (`manifestStore.load`) | `ManagedManifestStore.load` (`manifest-store/managed-manifest.ts:142-165`) returns an empty manifest when the file is missing or damaged. An empty manifest hides the harness ownership record. A harness-written copy at `.claude/skills/orchestration` then counts as workspace-owned. It wins over the active-clone check, so a stale copy of a disabled or unselected clone can return. The task brief says a failure of the skill policy must throw. This path does not throw. | Treat an empty manifest plus an existing directory as unknown only when a `.ptah/harness` state exists. Alternatively add a check that the directory content matches the user clone. Document the limit if you accept it. |
| F2 | Low | `orchestration-phase-sources.ts:22-33` | The harness builder (`harness-manifest.builder.ts:~510`) also drops clones with a retired skills.sh source ref (`isRetiredSkillsShSourceRef`). `isCloneActive` does not copy that rule. A retired `orchestration` clone stays active. The threads did not ask for this rule. | Add the retired-ref check, or record the gap as accepted. |
| F3 | Low | `phase-2-libraries.ts:372` and `container.ts:~852` | When the workspace provider returns `undefined`, the factory uses `process.cwd()`. `resolveHarnessWorkspaceRoot` returns an unmarked cwd unchanged. A `.claude/skills/orchestration` folder in an arbitrary cwd then counts as workspace-owned. The harness reconciler has the same cwd fallback, so this is consistent. | Return `undefined` from `workspaceSkillsRoot` when no workspace is open. The reader already accepts `undefined`. |
| F4 | Low | `orchestration-phase-sources.ts:41-47` | The `..` prefix test (`startsWith('..')`) reports a false "outside" for a target folder named `..foo` inside the source root. The harness helper `isInsideRoot` (`targets/link-ownership.ts:60-64`) has the same flaw, so the behavior matches. Also `realpathSync(skillRoot)` resolves the target, but `userSkillsRoot` and `pluginsRoot` are not resolved. A junction at `~/.ptah` then defeats the check. The harness helper has the same limit. | Prefer to import `isMigratableLink` or `isInsideRoot` from `targets/link-ownership.ts`. This removes the duplicate rule. It also adds the `readlink` fallback. |
| F5 | Low | `orchestration-phase-sources.ts:36-47` | `lstatSync` and `realpathSync` can throw on a race or a permission error. The error propagates through the reader and `route-decide.service.ts:339` catches it. The result is the legacy browser fallback. This is safe, but it hides a single bad folder behind a warning. A dangling link does not throw, because `existsSync` returns `false` first (line 36). | Optional: catch the error and return `false`. This keeps the route on the plugin file. |
| F6 | Low | `orchestration-phase-sources.spec.ts` | Test gaps: no case for a symlink into `pluginsRoot`. No case for a symlink to an outside folder (must be owned). No case for plugin-origin rules (`disabledPluginIds`, opt-out plugin, overlay path unknown or missing). No case for a dangling link. No case for a manifest `load` throw. No case that the `.ptah-managed` entry of another kind does not block ownership. | Add the cases. The origin rules are the most valuable. |
| F7 | Low | `phase-definition-file.reader.spec.ts` | No test that an unowned workspace skill (`isWorkspaceOwned` returns `false`) falls back to the clone. No test that a workspace predicate error rejects. No test for `workspaceSkillsRoot` returning `undefined`. | Add three short cases. |

## Thread closure

1. Thread 1 (reader used clones that were disabled or not selected): closed. `isCloneActive` (`orchestration-phase-sources.ts:22-33`) applies the same rules as the harness: `disabledSkillIds` (builder line ~516), the `selected` allowlist (~528), the plugin origin gate (`plugin-origin-gate.ts:123-145`: disabled plugin, opt-out plugin, overlay known and missing). `policyUnknown` throws (line 25). The reader calls the predicate before every clone read (`phase-definition-file.reader.ts:28`).
2. Thread 2 (workspace-owned skill ignored): closed. The reader checks the workspace skill first, per phase file (`reader.ts:19-27`). Ownership means not in the manifest as `kind: 'skill'`, and not a link into the user skills root or plugins root. This matches the `claude-target.ts:674-687` classification. Unmanaged real folders are foreign (not touched). Links into source roots are migratable (harness would remove them).

## Edge cases

- No workspace root: see F3. No throw.
- Workspace root is a file: `existsSync(join(file, '.claude', ...))` is `false`, so the workspace skill is skipped. The clone path then uses `sourceResolver.resolve(file)`. I did not verify how the resolver reacts. The resolver reports `policyUnknown` on a read failure (`plugin-config-source-resolver.ts:304`), which throws and gives the legacy fallback.
- Broken symlink: handled, see F5.
- Manifest load failure: see F1. `load` never throws.
- Windows case and drive: `path.relative` on win32 is case-insensitive. A different drive gives an absolute result, and `isAbsolute` catches it (line 46). Correct. See F4 for the realpath limit.

## DI

- `registerHarnessSyncServices` runs before the reader registration in both hosts (`phase-2-libraries.ts:311` before `:367`, `cli-engine/container.ts:803` before `:848`). It registers `MANIFEST_STORE`, `SOURCE_RESOLVER` and `SKILL_SYNC_GATE` as `useValue` (`harness-sync/src/lib/di/register.ts:144-182`).
- The factory resolves the tokens lazily. `registerLaneRoutingServices` reads the reader through `optional(...)` (`lane-routing/src/lib/di/register.ts:173`) inside its own factory. The harness tokens exist at that time. No ordering defect.
- Import direction: `lane-routing` imports nothing from `harness-sync` (grep: no match). Only the host composition roots import both. Both libs carry the tags `scope:extension` and `type:feature`. No rule breaks.

## Silent failures

- No swallowed error in the new code. The `isCloneActive` and `isWorkspaceOwned` errors reach `route-decide.service.ts:339`, which logs a warning with the error name and uses the legacy table.
- The only silent path is F1 (the manifest store logs a warning and returns empty).

## Checked, no defect

- Precedence order in the reader: workspace, clone, plugin, per phase file.
- Reader throws on an unknown phase kind (`reader.ts:15`).
- `isCloneActive` is evaluated only when the clone phase file exists? No: it is evaluated first (`reader.ts:28`). The cost is one resolver call per read. This is a performance matter only.
- Workspace root is evaluated on each call, so a multi-folder switch works.
- Selection and disabled rules do not apply to a workspace-owned skill. This is correct because the user owns that folder.
- `policyUnknown` throw is covered by a test (`orchestration-phase-sources.spec.ts`, "throws when policy is unknown").
- Export from `harness-sync/src/index.ts` is correct. `resolveHarnessWorkspaceRoot` is already exported (`index.ts:99`).
- Both host factories are identical in policy.

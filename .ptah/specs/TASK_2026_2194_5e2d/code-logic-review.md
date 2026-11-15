# Code logic review: ptah-core default

Verdict: **CHANGES REQUESTED** (score 6/10)

Scope: `plugin-loader.service.ts`, `plugin-loader.service.spec.ts`, `plugin-catalog-panel.component.ts`, `plugin-catalog-panel.component.spec.ts`. I did not run the specs. I read the code paths.

## Read paths checked

| Path | Applies default? |
| --- | --- |
| `getWorkspacePluginConfig` (`plugin-loader.service.ts:1187`) | Yes. Electron mirror (`plugin-activation.ts:290,349`) and UI read use it. |
| `resolveCurrentPluginPaths` (`:2011`) | Yes. |
| `getEffectivePluginConfig` (`:1344`) | Yes, but see F1. |
| `readWorkspaceLayer` (`:1220,1244`) | Returns `saved:false`. Callers apply the default. |
| `getDisabledSkillIds` (`:1606`) | Not affected. No skill default is needed. |

An explicit entry in `disabledPluginIds` is honored by `overlayPathsFor` (`:2019-2023`).
The filter is applied to the enabled list, so a core entry in both lists stays off.

## Findings

### F1 (High): the saved-workspace filter removes core opt-ins from ancestor and global layers
`plugin-loader.service.ts:1344-1352`. When the workspace is saved and its own list has no core,
the code removes `ptah-core` from `layered.enabledPluginIds`. `layerAncestorConfigs` and
`layerGlobalItems` add core there only when a farther layer chose "on". The farther layer is not a
default. It is an explicit user choice that is valid before this change (workspace ?? global ??
default, `:194`).

Result: a user with a saved workspace config and a global or ancestor "on" for core loses core.
This is a regression. It also breaks the documented layering contract.

Fix: do not filter. Layers already record explicit choices. Apply the default only when no layer
recorded core: call `withCoreDefault(layered, saved)` and skip the filter. For a saved workspace,
`withCoreDefault` already returns the config unchanged. The saved-empty case then stays off because
no layer adds core. Add a test: saved workspace with `enabledPluginIds: []` plus a global item
`ptah-core: on` must resolve to core on. Add one test for an ancestor "on".

### F2 (Medium): an unrelated workspace write records core as "on" and hides a global "off"
`getWorkspacePluginConfig` now adds `ptah-core` for an unsaved workspace. The capability resolver
(`capability-resolver.service.ts:~670-690`) and `activateExternalPlugin`
(`plugin-rpc.handlers.ts:~990`) use it as the write base, without global layering. Any write, for
example toggling one skill, saves `ptah-core` in `enabledPluginIds`. A global "off" for core was
then overridden, because the workspace layer wins. Also, the user did not choose this.

Fix: keep a raw reader for write bases (`saved` flag or a `{ applyDefault: false }` option) and
use it in the write callers. Then the first write records only the user choice. Core becomes
a saved "off" after any write, because a saved list without core is off. Handle this: when
the raw base is unsaved, the save must include core in `enabledPluginIds` unless a global or
explicit deny exists. Add a test for it.

### F3 (Medium): callers that save a list without core silently turn core off
`harness-rpc.handlers.ts:951` builds the list from `getWorkspacePluginConfig`, so it keeps core
now. Any other caller that sends its own `enabledPluginIds` (CLI paths, older flows) turns an
unsaved workspace into a saved workspace without core. Core is then off with no deny entry and
no user action. This is the same hidden rule as the "saved empty" case.

Fix: confirm each caller of `saveWorkspacePluginConfig` takes its base from
`getWorkspacePluginConfig`. Add a test: save from an unsaved workspace with a payload that has no
core, then assert the decision. If the product intent is "core stays on unless denied", then the
default must also apply to saved lists without a deny entry. Raise this with the task owner.

### F4 (Low): the UI persists the deny even when core was never on
`plugin-catalog-panel.component.ts:1026-1029`. It pushes core to `disabledPluginIds` when core is
available and not selected. This is correct for the unticked case. A ticked-again core is not in
the list, so the deny clears. That is correct. Risk: `availablePlugins()` may be empty while it
loads, so a save before the load completes drops the deny. Add a guard on the load state, or
add a test.

### F5 (Low): tests missing
- No test for the ancestor layer or the global layer with the default (F1).
- No test for `saveWorkspacePluginConfig` round trip from an unsaved workspace (F2, F3).
- No test that a global "off" for core wins over the default (`layerGlobalItems` path).
- Frontend spec updated, but it did not run (`spawn EPERM`). It has no test for
  "core ticked": assert `disabledPluginIds` stays `[]`.
- No test that a corrupt stored config (`parsePluginConfig` returns null) does not enable core.
  The code path returns `status: 'error'` before the default. This is correct. Pin it.

## Decisions

- Default only on an unsaved workspace (`stored == null`). Options: default on empty list, or only
  on unsaved. Evidence: saved empty lists are valid choices. Reversible.
- `getWorkspacePluginConfig` uses `stored != null` (`:1188`), and `readWorkspaceLayer` uses
  `undefined|null` (`:1243`). Both agree.

## What is correct

- Electron mirror and SDK `options.plugins` path use the shared service, so the default is
  consistent for them.
- Explicit core deny wins in `withCoreDefault` and in `overlayPathsFor`.
- Corrupt or unreadable storage does not enable core.

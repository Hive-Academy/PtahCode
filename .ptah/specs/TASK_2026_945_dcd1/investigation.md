# Investigation: model dropdown is not tied to the session of its tab

## Single source of truth today
There is none. Four values compete:
1. `ModelStateService.currentModel()` - one global signal (`libs/frontend/core/src/lib/services/model-state.service.ts`).
2. `tab.overrideModel` - per tab, set only by the canvas tile path.
3. `tab.agentOrigin.model` - the model of a child started by `ptah_session_start`
   (`tab-manager.service.ts:1408`). Nothing reads it.
4. `tab.sessionModel` - read by the selector, but `applyLoadedSessionStats`
   (`tab-manager.service.ts:2840`) has no production caller, so it is always unset.

Display (`model-selector.component.ts:286`): `override ?? sessionModel ?? global`.
Send (`message-sender.service.ts:640, 795, 948`): `override ?? global`. They disagree.

## Cause of defect 1 (change Fable -> Opus has no effect)
- `selectModel` (`model-selector.component.ts:371-387`) in a tile (`SESSION_CONTEXT` present, which is
  every Electron view) only calls `tabManager.setOverrideModel`. It never tells the live session.
- The tab forwards the override as `params.model` of `chat:continue`. A live session ignores it:
  `SdkAgentAdapter.resumeSession` returns the existing stream at `sdk-agent-adapter.ts:1359-1407`, and the
  live send `sendMessageToSession` (`chat-session.service.ts:2084`) takes no model.
  Only a cold resume reads `params.model` (`chat-session.service.ts:2883-2885`).
- In the main panel (no context) the change goes to the GLOBAL signal, so it changes every tab that has
  no override.

## Cause of defect 2 (child shows "Default (recommended)", then runs on Fable)
- The child tab is built with `agentOrigin.model = 'haiku'` (`tab-manager.service.ts:1408`), but the dropdown
  does not read it.
- `freezeSessionOverrides` (`canvas-session-overrides.ts:25-37`) seeds `overrideModel` with the GLOBAL
  model (`default`), not with the session model. The dropdown therefore shows the global default.
- On a cold resume (turn 3) the backend uses `params.model || selectedModel.get()`
  (`chat-session.service.ts:2885`): the frozen global value, not the Haiku pin.

## Cause of defect 3 (effort)
Same shape. `effort-selector.component.ts:250-262` reads `overrideEffort` or the global
`EffortStateService`, and ignores `agentOrigin.effort`. `freezeSessionOverrides` seeds the global effort.
Live sessions ignore `params.effort` the same way.

## Fix
- Frontend: one resolver `resolveTabModel/Effort(tab, global)` = `override ?? agentOrigin ?? sessionModel ?? global`,
  used by the selectors and by every send site. The selectors always write the per-tab override
  and never the global value. `freezeSessionOverrides` seeds from the resolver, not from the global.
- Backend: a live `chat:continue` applies a differing `params.model` / `params.effort` to the live query
  (`setSessionModel` / `setSessionEffort`) before the turn is sent.

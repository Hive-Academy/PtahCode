# Batch 27 report: B8b ACP lane handle and Grok/agy manifests

## Task 27.0

- agy still builds its handle through `createProviderSessionLaneHandle` with `profile:
  antigravityAcpProfile` (`antigravity-cli.adapter.ts:409-410`). The handle's `diagnostic` branch
  (`laneStderrLine` / `redactLaneStderr`) is unchanged. No `fallback` / `delegate` reference.
  `antigravity-cli.adapter.ts` untouched.

## Changes

- MODIFIED `provider-session/provider-session-lane-handle.ts`:
  - `continue(message, content?)`: images and files become ACP content blocks through
    `toAcpPromptContent` (images `{ mimeType, data }`, files `{ path, name: base name }`); text
    alone stays a string. Images while `promptCapabilities.image` is not advertised reject and
    send nothing. Logs counts only.
  - `applyTurnSettings`: `session.setModel` / `session.setEffort`; `false` -> `LaneTurnSettingRefusal`
    "{CLI} did not accept the model "x"." / "... the effort level "x"."; no session -> refusal.
    `appliesAt: 'next-turn'`. The ACP error detail itself goes out through the session's own
    error path; no stderr text in any new output.
  - `turnInputSupport()`: images from `promptCapabilities.image` ("{CLI} did not advertise image
    input."); skills supported only when an advertised command has a `SKILL.md` path, else
    "{CLI} advertises no skills to lanes."
  - `listTurnOptions()`: `getModels()` (default -> `currentModel`), efforts = `EFFORT_LEVELS` the
    profile maps to a non-model config entry, commands from `getAvailableCommands()` grouped by
    `acpLaneCommandOption` (`SKILL.md` -> skill) and filtered by `profile.hiddenLaneCommands`.
  - New exports `acpLaneManifestSections(profile, promptReason)` (turnInput model/effort
    next-turn, images `onSteer: false`, files reference, commands with `blocked =
    profile.hiddenLaneCommands`, skills; usage turn-end "{CLI} reports token usage when the turn
    ends."; prompts unsupported with the manifest's reason) and `acpLaneCommandOption`.
- MODIFIED `grok-cli.adapter.ts`: manifest spreads the sections; `turnInput.commands.blocked` =
  `grokAcpProfile.hiddenLaneCommands` (`['always-approve']`), the static source live and restored
  records share (binding P5 note).
- MODIFIED `antigravity-acp-lane.ts`: manifest spreads the sections for `antigravityAcpProfile`
  (blocked `[]`; prompts reason = its `ask` reason).
- MODIFIED `libs/backend/acp-runtime/src/index.ts`: `export type { AcpAvailableCommand }` (Batch 16
  open item). `readAvailableCommands` is not needed and stays internal.
- Specs:
  - lane handle spec +7: content blocks (and the Req 4.3 contract helper); unadvertised images
    refused; settings via `session/set_config_option`; model refusal text; Grok fixture split
    into 54 entries (40 skills), `always-approve` absent; agy fixture 13 commands and no skills;
    turn-usage semantics (below).
  - `grok-cli.adapter.spec.ts` +6: sections; `/always-approve on`, `  /always-approve`,
    `\n/Always-Approve off`, `/ALWAYS-APPROVE` refused by `turnInputRefusal` on live and restored
    Grok capabilities (blocked carried on both); `please /always-approve`, `/always-approved`,
    `/compact` not refused.
  - CREATED `antigravity-acp-lane.spec.ts`: manifest sections, no hidden commands, messaging.

## Binding P5 note

- Grok `commands.blocked` is wired from the profile; refusal spec added (above).
- Usage: the ACP handle declares `usageScope: 'turn'`; the no-spawner failure handle declares
  none, and the manager's fold falls back to `turn`. The spec runs both through
  `LaneUsageNormalizer`: a turn total becomes a full increment, and after `settleTurn` the next
  turn's total is again a full increment.
- `agent-message-dispatcher.ts`, `agent-message-coordinator.service.ts`,
  `agent-message-envelope.store.ts`, `agent-permission-responder.ts` not edited.

## Verification

- Focused jest: lane handle spec 86 passed; grok adapter, agy ACP lane, agy adapter ACP and agy
  adapter specs: 4 suites, 108 passed.
- `npx eslint` on the 7 files: 0 problems.

## Open items

- ACP efforts list every lane effort the profile maps; Grok's `reasoning_effort` option values
  are not read (the session exposes no getter for non-model config options), so a value Grok
  does not offer is skipped by the runtime with an info, and `setEffort` returns false -> refusal.

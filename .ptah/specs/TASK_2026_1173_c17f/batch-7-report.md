# Batch 7 report

## Files changed

- `libs/frontend/chat/src/lib/components/organisms/native-codex-control-reason.ts` (new)
- `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts`
- `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.spec.ts`
- `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane.component.ts`
- `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane.component.spec.ts`
- `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.scope.spec.ts`

## UI behavior

| Surface | Native Codex without taskId | Claude and taskId-bearing Codex |
| --- | --- | --- |
| Inline bubble | Shows description/path, live badge including paused, structured failure, disabled send and stop, visible reason; background action unavailable | Existing send, stop and background behavior retained |
| Subagent lane | Shows path, status and structured failure; disabled send and stop with visible reason; composer receives no SDK context or parent session to prevent send/follow-up routing | Existing tray actions and composer routing retained |
| Monitor scope | Native record remains associated with parent session, including terminal state | Existing session scoping retained |

Disabled reason: **Native Codex subagents do not support send or stop from Ptah yet.**

Usage: Existing stats adapter maps absent usage to unknown; no usage values were added. No background entries were added.

## Tests added

- Inline native running and failed rendering, disabled controls, no SDK dispatch; existing Claude control tests retained.
- Lane native running and failed rendering, disabled controls, no steer/stop; existing Claude tray test retained.
- Monitor owner tab versus another tab and completed visibility.

## Checks

- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json`: exit 1 with many existing spec and dependent-library type errors. A filtered rerun found only the pre-existing `subagent-lane.component.spec.ts:61` fixture-map type error among the three changed specs; no errors in added lines.
- `npx eslint libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.spec.ts libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane.component.ts libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane.component.spec.ts libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.scope.spec.ts libs/frontend/chat/src/lib/components/organisms/native-codex-control-reason.ts`: exit 0 (12 existing warnings, 0 errors).
- `ptah_get_diagnostics` scoped to the three changed source files: unavailable while TypeScript check was still running; retry needed.
- Jest intentionally not run in lane per task instruction.
- Visual screenshot not taken; Electron integration rendering is assigned to orchestrator by implementation plan.

## Template changes

Yes. Inline templates in `inline-agent-bubble.component.ts` and `subagent-lane.component.ts` changed; no separate `.html` files. Run typecheck-templates.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Native control gate uses `agentType === 'codex'` and absent `taskId` | Gate all Codex; gate only native | Batch contract and existing SDK taskId routing | Yes |
| Native lane passes null context and session to composer | Edit composer outside write set; use existing unavailable mode | Composer can otherwise send a follow-up through parent session | Yes |
| Keep existing unknown stats adapter | Add new usage display; retain adapter | `subagentLaneStats` maps absent usage to null | Yes |


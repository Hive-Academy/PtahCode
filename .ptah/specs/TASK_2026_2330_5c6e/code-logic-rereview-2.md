# Code logic re-review 2 — `TASK_2026_2330_5c6e`

| Metric | Value |
| --- | --- |
| Overall score | 8/10 |
| Verdict | APPROVED |
| New findings | 0 |

The prior four triggers no longer produce a successful plain turn or a wiped model list. The score stays under 9 because a fresh Codex lane spawn still starts the task when a leading slash does not resolve (`codex-app-server-lane.adapter.ts:956-968`). That path is a spawn prompt, not a catalog-admitted command, and refusing it would reject tasks such as `/usr/bin …`. It stays above 7 because admission, first chat message, built-in collision, and catalog failure are each closed in code.

No skill body was loaded. This lane has no skill-load tool, and the review contract was in the task prompt. No tests or diagnostics were run.

## Prior findings

| # | Severity | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Blocking | Fixed | Admission and resolution both compare the full token case-insensitively (`lane-command-filter.ts:16-17,61-64`, `codex-context.ts:996-1002`). A raw retry passes `refresh: true` (`agent-message-dispatcher.ts:164`, `agent-message-coordinator.service.ts:603-611`). `prepareContinuation` throws `LaneTurnInputRefusal` before `runTurn` when fresh resolution is missing or throws (`codex-app-server-lane.adapter.ts:917-925,1048-1062`). The process manager applies that refusal before `turnSeq` / `status` change, and only when the handle exposes `prepareContinuation` (`agent-process-manager.service.ts:3479-3488`). |
| 2 | Serious | Fixed | A new chat's first prompt is classified before `turn`. An enabled skill is attached. A built-in or unresolved command throws `unsupported-command` and does not call `startTurn` (`codex-chat-adapter.ts:408-417,513-518`). `chat-session.service.ts:1005-1008` maps that code to `CODEX_UNSUPPORTED_OPTION`. `startSession` still launches through the adapter (`chat-session.service.ts:1244-1248`). |
| 3 | Moderate | Fixed | `isChatBuiltinCommand` covers the reserved set, lowercased (`chat-builtin-commands.ts:2-8`). The router calls it only inside `execution.runtime === 'codex-app-server'`, before skill invocation, and still compacts `/compact` ahead of that check (`chat-slash-command-router.service.ts:403-425`). Importers are that router and `codex-chat-adapter.ts` only, plus the shared re-export. Claude, ACP, and agy follow-ups still reach `executeSlashCommand` (`chat-slash-command-router.service.ts:440`). |
| 4 | Moderate | Fixed | Live and stopped reads use `Promise.allSettled`. A rejected `model/list` is rethrown (`codex-app-server-lane.adapter.ts:1023-1027`, `codex-app-server-lane-catalog.ts:33-37`). A rejected `skills/list` keeps the model rows and sets `unavailableReason` on the live catalog (`codex-app-server-lane.adapter.ts:1039-1040`) or omits skills on the stopped catalog (`codex-app-server-lane.adapter.ts:318-319`). |

## Checks requested with the fixes

- Shared built-ins do not change Claude, ACP, or agy routing. The helper is not on those branches.
- Case folding does not break plugin-qualified names. Match is full-alias equality after `toLowerCase`, so `example:review` is not `review`. Aliases stay `name`, `pluginId:name`, and `pluginId` without `@version` (`codex-context.ts:1016-1019`). The runtime spec resolves `/PTAH-CORE:ORCHESTRATION` to the catalog skill.
- `prepareContinuation` is implemented only by the Codex lane handle. Other lanes still call `continue`.
- Model-list failure still fails the catalog read. Skill failure does not.

## Five logic questions

1. Silent failure: an admitted raw skill with a failed fresh lookup now refuses before `startTurn`. A discovery throw on a follow-up chat skill leaves `invokeSkillCommand` via `safe` (`codex-chat-adapter.ts:1010-1013,1379-1387`) instead of sending plain text.
2. Unexpected user action: `/REVIEW` as the first Codex chat message or as a follow-up is the built-in refusal. `/example:review` still attempts skill invocation. `/SESSION-HANDOFF` on a live lane resolves or refuses before the turn record changes.
3. Wrong input: letter case and `plugin:name` use one full-token rule. A stale raw retry reloads the catalog and refuses when the name is gone.
4. Dependency failure: `skills/list` rejection keeps models and efforts. `model/list` rejection still throws. Unsupported `skills/list` still yields an empty skill list (`codex-context.ts:1021-1024`).
5. Unspecified case: a brand-new lane whose task merely starts with `/` and matches no enabled skill still runs that task as text (`codex-app-server-lane.adapter.ts:956-968`). Resume of that shape refuses. That split preserves ordinary spawn text.

## Decisions

- Fresh-spawn slash text that does not resolve stays a task, not a finding. Options were to treat it as the old blocking bug, or as spawn text. Evidence: only resume and `prepareContinuation` use `resolveRawSkill`; admission is a separate dispatcher path. Reversible.

## Verification

Read the uncommitted diff for the eight cited files and the new `chat-builtin-commands.ts`, plus the dispatcher refresh call and the router branch around the helper. CI verifies. No Nx or `npm run verify`.

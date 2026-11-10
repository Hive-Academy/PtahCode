# Skill invocation audit — live trial findings

Date: 2026-11-10. Build: `main` at `f26db123d`, Electron dev (`Ptah Dev` profile).
Trial workspace: `D:\projects\task-manager-trial` (empty folder).
Flow: Setup hub → New project → brief (internal tool, Node / TypeScript,
"Recommend for me", constraint "Use an Nx workspace") → Continue.
Session: `f5bf3131-a1cb-4bd9-bf80-0e8e812c208c`
(`~/.claude/projects/D--projects-task-manager-trial/`).
Video: `%TEMP%\ptah-trial\setup-hub-trial-part1.mp4` (4 min 18 s, not committed).

## F1 — The seed prompt names skills that the workspace does not have (primary)

- `harness:start-new-project` builds a seed prompt that tells the agent to use
  `saas-workspace-initializer`, then `ddd-architecture`, then
  `nx-workspace-architect`.
- The agent called `Skill` three times (`saas-workspace-initializer`,
  `init-saas`, `ptah-nx-saas:saas-workspace-initializer`). None resolved a
  skill. It then searched the disk with six `Glob` calls and continued without
  the skills ("The skill files aren't on this machine").
- Cause: `.ptah/harness/state.json` of the new workspace holds
  `"skillSyncMode": "selected", "enabledSkillSlugs": []`. The reconciler wrote
  7 commands to `.claude/commands` and 0 skills (`expected: 7, found: 7`).
  - `SkillSyncGate.resolve` derives `selected` + the skills the workspace
    already owns, which is none for a new folder
    (`libs/backend/harness-sync/src/lib/state/skill-sync-gate.ts:105-123`).
  - `registerStartNewProject` enables the bundled plugin (`ptah-nx-saas`) and
    reconciles, but it never adds the plugin's skills to the allowlist
    (`libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:844-884`).
    `SkillSyncGate.keepSelected` exists and is used only by the skills.sh
    handlers.
  - `resolveAvailableSkillIds` reports the skills as available because the
    plugin is active (`harness-rpc.handlers.ts:810-826`), so the seed prompt
    names them. Plugin state and skill sync state disagree.
  - `ddd-architecture` lives in `ptah-core`, which the flow did not enable.
- The skill files exist on the machine: `~/.ptah/user/skills/` and
  `~/.ptah/plugins/ptah-nx-saas/skills/`.
- Effect outside the hub: any workspace without a recorded selection gets no
  bundled skills. Only the commands arrive. This agrees with the report that
  only `orchestration` (invoked by hand through `/orchestrate`) is used.

## F2 — The started session is not visible

After Continue, the app shows the chat home. The Sessions panel shows
"No sessions", `0 / 9 running`. The session runs in the backend and waits on
`AskUserQuestion`. The only entry point is the notification bell
("Question needs an answer"). The wizard steps "Proposal" and "Review" did not
appear.

## F3 — Smaller defects seen

- Selected chips in the brief (`aria-pressed="true"`,
  `bg-base-content text-base-100`) look the same as unselected chips in the
  default dark theme.
- The hub shows "Claude Code is not installed" in the dev profile, while the
  session started and ran on Claude.
- The card titles are the click targets (`article h2 a::after` overlay). The
  visible "Start a project" label is a `span`, not a control.
- `chat:start` took 5.4 s. `analytics:spendSummary` took 30 s.
- `[WizardWebviewLifecycle] Error disposing webview: {}` on start.
- Three harness plugins have no `SKILL.md`
  (`ptah-harness-qaa-elhamour-art-direction`, `-r3f-scene-patterns`,
  `-webgl-asset-pipeline`).

## Spot-check of the research lane report

Checked against `main` at `f26db123d`:

- Confirmed: `PTAH_CORE_SYSTEM_PROMPT` makes orchestration the mandatory
  entry point (`ptah-core-prompt.ts:155-202`).
- Confirmed: `strategies.md` names domain skills only in `SAAS_INIT`
  (lines 297-381). `agent-catalog.md` has two "skill" mentions.
- Confirmed: only `ptah-core` has `isDefault: true`
  (`plugin-loader.service.ts:323`). Lines 346, 370, 390, 400 are `false`.
- Confirmed: `PTAH_LANE_POLICY` names `impeccable`
  (`cli-adapter.utils.ts:428`). No bundled plugin has that skill.
- Confirmed: `ddd-architecture` is in `ptah-core`. `nx-workspace-architect`
  and `saas-workspace-initializer` are in `ptah-nx-saas`.
- Correction: `_shared/tooling-precedence.md` does not forbid all unassigned
  skills. It permits a skill whose description matches the task and the
  repository evidence. It forbids a load only because of the stack or the
  name. The effect is still a weak trigger, because no brief assigns a skill.

## Open

- The trial session still waits for the first discovery answer.
- The corrections in `skill-invocation-research.md` are not implemented.

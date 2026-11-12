# Research report - six open technical points

Read-only research. Worktree `phase-workflow`. No build, test or lint ran. Status: all six points written. The orchestrator addendum at the end of this file has the measured results and the corrections.

## Summary

| Point | Answer | Confidence | Open |
|---|---|---|---|
| P1 | Plugin copy `plugins/ptah-core/skills/orchestration` ships and is validated; `.claude` copy is a drifting tracked copy; no copy step; 5 files differ, both sides hold unique edits | high | no (merge needed) |
| P2 | Prediction: child has `ptah_browser_*` (privileged session token); `subagentPtahTools` concerns subagents only | medium | yes (measure) |
| P3 | Child runs on chat runtime: `claude-sdk` or `codex-app-server` (Electron); no CLI/Ptah-CLI branch | high | partly (profile list) |
| P5 | `batches.md` executor: one regex parser for harvest (`parseBatchVerdicts`); no routing consumer | high | no |
| P9 | Only the Claude target copies bytes; Codex/Copilot/Cursor/Antigravity transform frontmatter | high | no |
| P10 | Repository proves only policy text; Codex lane turns skill instructions off; public docs support name-load for most CLIs | low-medium | yes (measure) |

## P1 - Authored orchestration skill copy

**Answer.** The plugin copy `plugins/ptah-core/skills/orchestration/**` is the shipped copy and the de-facto authored copy. `.claude/skills/orchestration/**` is a tracked, drifting copy with no consumer found. No step copies one to the other. 5 of 9 files differ, and each side holds content the other lacks.

**Evidence.**
- `scripts/generate-content-manifest.js:25,135-138` walks `plugins/` to build the content manifest. `.github/workflows/publish-electron.yml:308-318` runs `npm run manifest:check`. `libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.ts:307-316` lists the bundled plugin `ptah-core`. Only the plugin tree ships to users.
- `scripts/validate-orchestration-skill.ts:148-154` (SKILL_ROOT = plugin path), `libs/backend/vscode-lm-tools/src/lib/code-execution/lane-rule-single-home.spec.ts:17-19` and `libs/backend/task-specs/project.json:37` (test input) read the plugin copy only.
- Search of `scripts/`, `tools/`, `package.json`, `apps/*/project.json`, `.github/workflows`, `libs/backend/harness-sync/src` and `plugin-loader.service.ts` for `plugins/ptah-core` or a write to `.claude/skills/orchestration`: no copy step found. `harness-state-store.ts:82-83` only names `.claude/skills/*` as a user-layer sync destination (see P9).
- `git check-ignore` gives no match and `git ls-files` lists `.claude/skills/orchestration/*`: the `.claude` copy is tracked.
- `git log`: `.claude` copy last commits `457df337b` (2026-11-10), `22cc44b41` (11-09), `b6ef5ff04` (11-09). Plugin copy: `61d3e1165` (11-11), `e4119eda3` (11-10, "deliver and route skills"), `457df337b`. Both copies receive edits; history shows no single direction.

| File | Newer copy (last commit) | Difference |
|---|---|---|
| `SKILL.md` | both (.claude 11-09, plugin 11-10) | `.claude` has the in_review/close-out and harvest bullets (diff lines 70-74). Plugin has the "Skill routing" / `Required Skills:` bullet (lines 136-140). |
| `references/agent-catalog.md` | plugin (11-10 vs 11-07) | Plugin adds the `Required Skills:` line and a skill-routing section (61 lines). `.claude` keeps older table text. |
| `references/git-standards.md` | .claude (11-09 vs 11-02) | `.claude` adds the in_review/done and cleanup-authorization paragraph (8 lines). |
| `references/strategies.md` | plugin (11-10 vs 10-19) | Plugin adds the skill-routing paragraph and a `humanize-library` note (15 lines). |
| `references/task-tracking.md` | .claude (11-09 vs 11-08) | `.claude` adds the close-out journal paragraph (11 lines). |

**What stays open.** Whether a tool outside this repository writes the `.claude` copy (none found here). The 5 files need a manual merge: each side has unique content.

**Recommendation for the program.** Phase 0: declare `plugins/ptah-core/skills/**` the single authored source (it ships, and 3 readers use it). Merge the `.claude`-only paragraphs (SKILL.md close-out bullets, git-standards, task-tracking) into the plugin copy. Then delete `.claude/skills/orchestration`, or generate it from the plugin copy with a drift check in the same CI step as `manifest:check`.

## P2 - Tool list of a child session

**Answer.** PREDICTION: a child session in Electron has the `ptah_browser_*` tools, because its main thread gets a `privileged` session token and `privileged` permits every tool class. The flag `subagentPtahTools: 'unavailable'` concerns SDK Task subagents inside the child, not the child's main thread. Browser tools are absent only if (a) the MCP server is not running, (b) `browser` is in `agentOrchestration.disabledMcpNamespaces`, or (c) the caller capability is `read-only` or `lane-report`. A child gets none of (c).

**Evidence.**
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-caller-policy.ts:104-113` (`toolClass`): names that start with `ptah_browser_` are class `browser-control`. `:131-140` (`isToolPermitted`): `privileged` returns true. Other capabilities get only class `read` (plus 3 `lane-report` tools).
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1443-1465`: the child launch passes `mcpServerRunning = codeExecutionMcp.getPort() !== null` and `mcpServersOverride: undefined` to `launchSdkSession`. No special caller class is set.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:2243-2248`: no MCP map when `mcpServerRunning` is false. `:2272-2288`: the token has `kind: 'session'`, `capability: 'privileged'`. `:2294-2299`: the `ptah` HTTP server entry carries it as a bearer header. So a child gets the same token type as a top-level session.
- `mcp-core/protocol-dispatcher.ts:539-542`: `tools/list` filters with `isToolPermitted`. `:583,660-668`: browser tools are dropped only when `disabled.has('browser')`. `:964-969`: no capability value means `privileged`.
- `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts:400-408`: the Codex chat path also issues `capability: 'privileged'`.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:752-777` (`retainMcpRoot`): on a failed root retention it logs and keeps `subagentPtahTools: 'unavailable'`; the child still starts. `libs/backend/platform-core/src/interfaces/mcp-subagent-root-registrar.interface.ts:1-13` states the reason: Task subagents read `<cwd>/.mcp.json`, and a child worktree is not an open folder.
- Contrast: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1043-1052` issues `privileged` to CLI lanes, except `antigravity` (`lane-report`, so no browser tools). `mcp-http/mcp-caller-token-registry.ts:545-548`: external workspace tokens are `privileged` only under setting `full`; home tokens are always `read-only`.

**What stays open.** (1) The real Electron `tools/list` of a child (the orchestrator measures it). (2) Whether the Electron browser backend works for a worktree cwd: tools are listed without checking the backend (`protocol-dispatcher.ts:660`), so a call may fail at run time. (3) The user's value of `disabledMcpNamespaces` (default `[]`, `libs/backend/platform-core/src/file-settings-keys.ts:385`). (4) Subagents inside a child depend on `.mcp.json` retention.

**Recommendation for the program.** Phase 2 capability routing must probe the effective list for the real session, not infer it from a phase name. Use `subagentPtahTools` only as the signal for second-level subagents. A visual-review phase may run in a child in Electron if the measurement confirms the tools. Keep a CLI-lane fallback when `browser` is disabled.

## P3 - Providers that can run a child session

**Answer.** A child runs on the chat runtime, not the CLI-lane runtime. Two runtimes exist: `claude-sdk` and `codex-app-server` (native Codex, Electron only). The workspace's active provider and the account gate choose between them. There is no system-CLI branch (copilot, cursor, gemini, ...) and no Ptah-CLI branch for a child.

**Evidence.**
- `libs/backend/rpc-handlers/src/lib/chat/session/child-chat-session-host.adapter.ts:105-129`: `startChildSession` calls `session.startAgentChildSession` with the parent session, model, effort and the inherited permission level. A throw or `success: false` becomes `started: false` (with `accountRefusal` when present).
- `chat-session.service.ts:1432-1465`: the child path calls `gateAccount({ inheritedSource: true })`, then `launchSdkSession`. `:1503-1507`: parent level `plan` or none gives `ask`.
- `chat-session.service.ts:3135-3153`: with `inheritedSource` and an active auth method other than `claudeCli`, the gate validates the named account (`gateMainSessionAccount`). On native Claude the child takes the ambient route.
- `chat-session.service.ts:1724-1735`: `runtimeProfile.prepare(...)` picks the runtime; a provider mismatch throws `AuthRequiredError`. `:1754-1781`: `claude-sdk` receives `model`, `providerProfile` and optional `accountSelection`; `codex-app-server` receives a `seed` and starts through `withCodexStartLineage`. Codex does not use Claude plugin-config roots (comment at `:1771-1772`).
- `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts:180-190`: native Codex starts for a new session only if `hasNativeCodexCapability` and the active provider is `openai-codex` (`:297-317`). Consumer `lane` is always false (`:305-318`). `apps/ptah-electron/src/di/codex-runtime-composition.ts:91-94` sets `nativeCodex: true`; `routing-agent-adapter.ts:45`, `agent-sdk/.../wiring/codex-runtime-composition.ts:13`, `chat-runtime-profile.service.ts:109` and `gateway-chat-bridge.ts:238` set `false`.
- Same resolver `:266-270,530-534`: the Claude branch with active provider `openai-codex` throws `codexNativeRuntimeRequired` ("Use the Ptah desktop app (Electron) with native Codex enabled."). Otherwise it resolves a provider profile for the model (`:285-296`): native Claude or a profile with its own base URL/key.
- `chat-session.service.ts:1344-1395` (`resolveAgentChildModel`): a named account refuses a model choice (`model-catalog-unavailable`, "omit model"). Otherwise the model must be in the native Claude, provider-profile or default catalog (`invalid-model` / `model-catalog-unavailable`).
- Handoff doc comment `chat-session.service.ts:1509-1517`: "As with a child, there is no slash-command intercept and no Ptah-CLI branch."

**What stays open.** The list of provider profiles that `resolveProviderProfileForWorkspace` can return (provider registry; not enumerated). Whether the CLI host can start a child with Codex (`nativeCodex: false` there, so it is refused). Nothing was measured at run time.

**Recommendation for the program.** Phase 2: define the child executor as "chat runtime of the workspace's active provider". Do not promise a child on copilot, cursor or other system CLIs; route those to a CLI lane. In a Codex workspace in Electron the child runs on `codex-app-server`: the phase contract must not rely on Claude-only frontmatter denies or Claude plugin lineage there.

## P5 - Who reads the `executor` field of a batch

**Answer.** The task-level `executor` (a `task.md` frontmatter field) is parsed and stored, but nothing routes work from it. The batch-level executor in `batches.md` (`**Recommended Executor**: ...`) has exactly one code parser: `parseBatchVerdicts`, used after the task for skill-score harvest. No code reads it to route work. Routing is done by the orchestrator model, which passes the chosen executor to `ptah_route_decide` / `ptah_agent_spawn` as tool arguments.

**Evidence.**
- Task executor, not batch: `libs/shared/src/lib/types/task-spec.contract.ts:269` (`executor?: string` in the create input), `:404-405` (writes frontmatter `executor`); `libs/backend/task-specs/src/lib/task-writer.service.ts:421,525` (passes it to the writer); `task-frontmatter.ts:42,408-410,519` (zod schema and parse of the `task.md` frontmatter); `task-index.store.ts:345-358,399,433` (SQLite `executor` column, returned in the task summary). These read `task.md`, never `batches.md`.
- Only parser of the batch executor: `libs/backend/skill-synthesis/src/lib/spec-extractor.ts:221-233` (`parseBatchVerdicts`) splits `batches.md` on `## Batch`, matches `**Recommended Executor**:` with a regex, and `normalizeExecutor` (`:197-202`) reduces it to a slug. `:208-213` `detectStatus` reads COMPLETE/FAILED from the heading. Called at `:312-317` (`extractSpec`, harvest of finished tasks; reads `batches.md`, then legacy `tasks.md`). Result: per-slug pass/fail verdicts for skill scoring. It has no routing consumer.
- Other readers of `batches.md` only check that the file exists: `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts:166-184` (stage artifact `['batches.md','tasks.md']`) and `libs/frontend/tasks-ui/src/lib/services/task-folder-entries.ts:156`.
- Routing input is typed args, not a file: `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts:41-46` (`PinSchema`: `phaseId`, `executor`, `model`). `plugins/ptah-core/skills/orchestration/references/team-leader-modes.md:100-111` tells the team-leader to call `ptah_route_decide` with each batch as a phase and to pass the returned `model`/`tier` to the spawn. `:119` handles an unavailable recommended executor in text.

**What stays open.** I did not read `batches.md` format rules in full (`references/team-leader-modes.md` points to another file for the schema). A regex parser exists only for harvest; its field name `Recommended Executor` couples the template text to code.

**Recommendation for the program.** Phase 1: treat `**Recommended Executor**` as model-read text plus one harvest regex. If the program renames executors to phase/executor-neutral values (subagent, lane, child), change `normalizeExecutor` (`/^[a-z0-9]+(-[a-z0-9]+)*/`) and the `spec-extractor` tests in the same phase, or scorecard attribution breaks silently (see review finding 6). If routing must be enforced by code, add a real parser first; do not assume one exists.

## P9 - Do skills sync to each provider folder with no transform?

**Answer.** No. Only the Claude target copies bytes. All rival targets (Codex, Copilot, Cursor, Antigravity) rewrite the markdown of every skill file during the copy. The layout (folder per skill slug, same files) stays the same.

**Evidence.**
- `libs/backend/harness-sync/src/lib/targets/skill-transform.ts:1-23,114-127`: three rewrites for rival CLIs: drop frontmatter `allowed-tools`; quote an unquoted `description:` that contains `: `; force frontmatter `name` to the folder name (only for `SKILL.md`). Line-ending style is preserved. The header states "The Claude target does NOT use any of this - it copies bytes".
- `claude-target.ts:79` (`.claude/skills`), `:494` (`copyDirectory(write.source, absolute)`): byte copy. `copy-engine.ts:67-73` (`copyDirectory`), `:117-133` (`copyDirectoryTransformed`), `:166,237` (the transform applied to markdown while copying and while hashing).
- `workspace-target.ts:418-430`: skill entries are `transformed: true`; the manifest keeps source hash and output hash. `:1047` calls `copyDirectoryTransformed`.
- Destinations, from `rival-targets.ts:11-16` and the factories: Codex `.agents/skills` (`:116-127` `skillsDirRel`), Copilot `.github/skills`, Cursor `.cursor/skills`, Antigravity `.agents/skills` (co-owner of Codex, `workspace-target.ts:20-25`). OpenCode: no skill folder written; it reads `.claude/skills` and `.agents/skills` itself (`rival-targets.ts:34-40`). VS Code: none. Grok and Pi have no target (not in `rival-targets.ts`).
- `libs/backend/harness-sync/src/lib/gitignore/harness-state-store.ts:76-83` names the four skill roots `.claude/skills`, `.agents/skills`, `.github/skills`, `.cursor/skills` and the allowlist `skillSyncMode`/`enabledSkillSlugs` (`:92`).
- Agent transforms for contrast, `targets/transformers/transform-rules.ts:340-373` (`transformAgentContent`): rewrite frontmatter, tool references (AskUserQuestion, Task tool), slash commands, product names (Claude Code to CLI name), and strip internal imports. Skills get none of these body rewrites, only the 3 frontmatter fixes above, so a skill body that says "Task tool" or `/orchestrate` reaches Codex/Copilot/Cursor unchanged.

**What stays open.** I did not open the user-layer source (`~/.ptah/user/skills`) code. Whether a SKILL.md body that uses Claude-only wording works in rival CLIs is a content issue (see P10).

**Recommendation for the program.** Phase 1: write phase skills in executor-neutral wording, because bodies are copied verbatim to `.agents/skills`, `.github/skills`, `.cursor/skills`. Keep `name` equal to the folder name and avoid `allowed-tools` as a control. Phase 0/1: the program's own skills come from the bundled plugin copy, so the sync reads them through the user/plugin layers (P1). Not verified: whether `ptah-core` plugin skills enter the `.claude/skills` sync at all or only load through the plugin loader.

## P10 - Does each provider CLI load a skill by name on request?

**Answer.** Mixed. The repository itself only proves the lane policy text ("Load a matching skill through your CLI's own skill mechanism ... If skill discovery is unavailable, say so"). It has no test or adapter code that proves a skill loads by name for any CLI. The Codex lane turns skill instructions OFF. Public documentation says every listed CLI discovers `SKILL.md` folders and loads on demand.

**Repository evidence.**
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:426-432` (`PTAH_LANE_POLICY`): instructs the lane to load a matching skill through its own mechanism, and to report when discovery is unavailable. `:453` mentions `.claude/skills/agent-lanes/SKILL.md`.
- `cli-adapters/codex/codex-lane-config.builder.ts:102` pushes `skills.include_instructions=false`; `codex/codex-lane-profile.ts:176-188,203` sets `includeSkillInstructions: false` and lists `skills` in `suppressedTools`; specs `codex-config-rejection.spec.ts:39` and `codex-app-server-lane.adapter.spec.ts:476,1061` pin it. Meaning: the Codex lane gets no skill instruction block. Whether Codex still loads a skill named in the prompt is NOT confirmed.
- `pi-cli.adapter.ts:44-52`: `-a` trusts project `.pi/` config "so repo-level Pi skills/extensions are respected".
- `claude-cli.adapter.ts:199-204`: a named child reads skills from its certified cwd, config dir and setting sources (a skill guard scans them).
- `grep -i skill` over the cursor, opencode, antigravity, copilot-sdk and grok adapters: no hit.

| CLI | Where it finds skills (sync writes) | Loads by name? | Basis |
|---|---|---|---|
| claude (SDK lane, ptah-cli providers on the Claude engine) | `.claude/skills` (byte copy, P9) | Not confirmed for lanes; `claude-cli.adapter.ts:199-204` shows skill scanning only | not confirmed (repository shows scanning, no name-load test) |
| codex | `.agents/skills` (transformed) | Public docs: metadata at start, full SKILL.md loaded on use, `$` mention. Lane sets `skills.include_instructions=false` | public documentation (https://developers.openai.com/codex/skills); lane setting is repository evidence of a risk |
| copilot | `.github/skills` (transformed) | Docs: SKILL.md injected when Copilot chooses the skill | public documentation (https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills) |
| cursor | `.cursor/skills` (transformed) | Docs: loads at startup, `/` invoke; reads `.agents/skills`, `.claude/skills` | public documentation (https://cursor.com/docs/skills) |
| antigravity | `.agents/skills` (shared with codex) | Docs: workspace `.agents/skills` | public documentation (https://antigravity.google/docs/skills); the lane has only `lane-report` MCP (P2) |
| opencode | none written; reads `.claude/skills`, `.agents/skills` (`rival-targets.ts:34-40`) | Docs: skill tool takes a name, list in tool description | repository evidence for the folders (probe note), public documentation for by-name load (https://opencode.ai/docs/skills) |
| pi | none written; Pi reads `.pi/skills`, `.agents/skills` | Docs: `/skill:<name>`, auto-load | public documentation (https://pi.dev/docs/latest/skills); no Ptah target writes to it unless `.agents/skills` is filled by codex/antigravity target |
| grok | none written | Open-source grok-cli reads `.agents/skills`; xAI Grok Build reads `.grok/skills`, `.agents/skills`, `.claude` per a third-party guide | not confirmed (third-party sources only, two different products) |

**What stays open.** (1) Codex lane with `skills.include_instructions=false`: a by-name request may fail; only a spawn test can settle it. (2) Which Grok product the adapter drives and its skill path. (3) Whether a lane's working directory (a worktree) contains the synced skill folders: sync writes per workspace root, a git worktree may lack untracked `.agents/skills`. (4) No CLI was run.

**Recommendation for the program.** Phase 1/2: do not rely on by-name loading. Pass the skill's path or inline the essential text in the lane prompt, and keep "load these skills first" as a hint with the "say so if unavailable" fallback already in the lane policy. Add a spawn-time probe per CLI (one measured run) before Phase 2 depends on it. Decide whether Codex lanes need `skills.include_instructions` turned on for skill-bearing phases.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Plugin copy is the authored source (P1) | plugin copy; `.claude` copy; keep both | Ships via manifest; 3 readers; both copies have unique edits | Yes |
| Child browser tools: predict "present" (P2) | present; absent | Privileged token for the child; `isToolPermitted`; `subagentPtahTools` concerns subagents | Yes (measurement decides) |
| Child provider set = chat runtime only (P3) | chat runtime; lane runtime | Adapter calls `startAgentChildSession`; no system-CLI branch | Yes |
| Batch executor is not a routing input (P5) | text only; parsed | One regex parser for harvest; routing uses tool args | Yes |
| Skills are transformed for rival CLIs (P9) | byte copy; transform | `skill-transform.ts`, `copy-engine.ts` | Yes |
| Mark P10 CLI rows "not confirmed" where only third-party or no evidence exists | confirm from blogs; mark not confirmed | Rule: wrong confident answer is worse | Yes |

## Clarifications Needed

- P10: a measured spawn of each CLI (especially Codex lane with skill instructions off, and the Grok variant) is needed. The code cannot settle it.
- P2: the real `tools/list` of an Electron child is measured by the orchestrator.

## Orchestrator addendum (2026-11-12)

The orchestrator checked this report and measured the runtime points. Where this addendum and the
text above disagree, the addendum is correct.

- **P1, correction.** The `.claude/skills/orchestration` copy has a consumer. The sessions of this
  repository load it as a project skill. The plugin copy stays the authored source for users.
- **P2, measured (Electron, Claude SDK branch, one sample).** A child session listed the 11
  `ptah_browser_*` tools, and a call of `ptah_browser_status` was successful. See
  `evidence/child-session-tool-probe.md`. Not measured: the Codex app-server branch, and the
  `navigate` and `screenshot` calls. The lane claim about `antigravity` (`lane-report` capability,
  no browser tools, `agent-process-manager.service.ts:1043-1052`) was not checked by the
  orchestrator.
- **P5, P9, verified.** The orchestrator read `spec-extractor.ts:219-234` and
  `skill-transform.ts:1-23`. The statements are correct.
- **P10, measured.** `codex` lane: no skill mechanism, load by path only
  (`evidence/skill-load-probe-codex.md`). `Claude Api` lane: the `Skill` tool loads a skill of its
  list by name (`evidence/skill-load-probe-claude-api-2.md`), but the list has no workspace
  engineering skill, and `skillOverrides` refuses `agent-lanes` and `orchestration`
  (`evidence/skill-load-probe-claude-api.md`, `sdk-query-options-builder.ts:514-528`). The
  conclusion value `loads by path only` in the first `Claude Api` probe file is true for the two
  names of that probe only.
- **P10, worktree fact.** `.agents/` is git-ignored (`.gitignore:170`). A worktree has no
  `.agents/skills` folder. The two probes confirmed it: `.agents/skills`, `.github/skills`,
  `.cursor/skills` and `.codex/skills` do not exist in the worktree. `.claude/skills` is tracked
  and has 22 skill folders.
- **Not measured:** `grok`, `Glm` and `kimi code` (at limit on 2026-11-12), `antigravity` (limit
  unknown), `copilot`, `cursor`, `opencode`, `pi`.

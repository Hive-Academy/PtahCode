# Trial 2 — setup hub on the corrected build (Codex, gpt-6.1-terra)

Date: 2026-11-10. Build: branch `fix/skill-delivery-and-routing` at `0eeed7219`,
Electron dev. Workspace: `D:\projects\task-manager-trial-2` (empty folder).
Main agent: OpenAI Codex, `gpt-6.1-terra` (workspace override).
Flow: Setup hub → New project → brief (internal tool, Node / TypeScript,
"Recommend for me", constraint "Use an Nx workspace.") → Continue.
Codex session: `01a1c724-a23f-79e2-830b-028a13fbd6f6`.
Video: `%TEMP%\ptah-trial\setup-hub-trial-2-codex.mp4` (5 min 50 s, not committed).

## Confirmed: skill delivery (F1 is corrected)

- `harness:start-new-project` logged
  `Enabled bundled plugins for workspace: ["ptah-nx-saas","ptah-core"]`.
- `.ptah/harness/state.json`: `skillSyncMode: selected`, `enabledSkillSlugs`:
  `ddd-architecture`, `nx-workspace-architect`, `saas-workspace-initializer`.
- `.claude/skills` and `.agents/skills` each hold these three skills.
  The reconcile reported `expected: 19, found: 19, writeFailed: 0`.
- Codex read
  `.agents/skills/saas-workspace-initializer/references/stage-a-workflow.md`
  as its first action. No disk search and no failed skill call occurred.

## F4 — Codex asynchronous question is aborted at turn end (new, blocks the flow)

- Codex has no `AskUserQuestion` tool. It called `request_user_input_async`
  with four discovery questions. The tool returned `{"accepted":true}`.
- Codex then ended the turn ("I'll wait for your business discovery answers").
- Ptah mapped the call to an `AskUserQuestion` request and sent it to the
  renderer. At turn end, `SdkPermissionHandler` logged
  `AskUserQuestion aborted`, then
  `Codex user answer was not delivered {"code":"codex-user-input-undelivered","cause":"turn-ended"}`.
- Result: the question exists for approximately 2 s. The banner
  "Question needs an answer" stays, but the bell shows "All clear".
  The user cannot answer. The flow stops before the roadmap, the scaffold and
  the AI-team step.

## F2 — The started session is not visible (still present)

- After Continue, the app shows the workspace home with "1 sessions".
- The Sessions panel shows "No sessions yet". `session:list` reads
  `~/.claude/projects`, which has no folder for a Codex session
  (`[JsonlReader] Sessions directory not found`).
- No tab and no chat input exist for the session. The user cannot send the
  answers as a chat message.

## Not observed

- The AI-team step (`ptah.harness` `searchSkills`, `proposeConfig`). The flow
  stopped at the first discovery round because of F4 and F2.
- The wizard steps "Proposal" and "Review" did not appear.

## Smaller items

- The "Advanced · provider and model" section of the brief only shows text.
  It has no provider or model control.
- `analytics:spendSummary` took 27.6 s. `boot:getReadiness` had one RPC timeout.
- `[WizardWebviewLifecycle] Error disposing webview: {}` occurred again.

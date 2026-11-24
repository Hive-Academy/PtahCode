# Batch 13 report: canvas lane view uses main chat cards

## Changes

- MODIFIED `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-view.component.ts`
  - Removed the old permission strip with its plain Allow/Deny buttons, the `respond()` method and the `AgentPermissionResponder` injection.
  - Added `providers: [LanePermissionView]` and called `prompts.connect({ agent: this.selectedCli })` in the constructor. The prompt block in the CLI lane is the same one the agent card uses: the "Waiting for you" badge, the refusal notice, `ptah-permission-request-card` and `ptah-question-card` with `[laneLabel]`, and the resolved-status line. It sits where the strip was, in the lane column above the agent card. It shows only for the selected CLI lane, because `selectedCli` is undefined for every other lane kind.
  - `pendingQuestions` (the tab questions above non-orchestrator lanes) now leaves out any question with an `agentId`. A lane's question shows only in that lane, through `LanePermissionView.questions()`, never in another CLI lane or a sub-agent or background lane. Questions without an `agentId` (main session or sub-agent) are routed by tab as before.
  - New imports: `PermissionRequestCardComponent` (chat-ui), `PtahBadgeDirective` (ui), and `Check` and `LucideAngularModule` (lucide-angular).
- MODIFIED `canvas-lane-view.component.spec.ts`
  - The mocks now include `permissionBelongsToAgent`, `PermissionHandlerService.questionRequests` and `ChatStore.handleQuestionResponse`.
  - The old "owner responder for Allow and Deny" test is replaced by three tests that use the real cards:
    1. A Codex lane approval renders the main chat card with the lane label and "Waiting for you". Clicking Allow calls `respondLane('a', 'r', 'allow', undefined, undefined)`.
    2. Req 5.7: a Copilot-origin `AgentPermissionRequest` renders the same `PermissionRequestCardComponent`, with `request()` equal to `toLanePermissionRequest(req)` and the label "Copilot". Deny goes through `respondLane`.
    3. A question from lane A is routed to the tab, yet it does not show in lane B or in a sub-agent lane. It does show in lane A.

## Boundary check

Canvas and chat are both tagged `scope:webview` and `type:feature`. The rule in `eslint.config.mjs` lets `type:feature` depend on `type:feature`, and canvas already imports from `@ptah-extension/chat`. Nothing blocks this.

## Checks

- `npm run verify -- --related -p @ptah-extension/canvas`: 1 task succeeded, exit 0.
  - The spec was also run directly under the verify lock, so the counts are visible: 1 suite, 25 tests passed.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/canvas`: 2 tasks succeeded, exit 0.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: 1 task succeeded, exit 0.
- Logs are in `.ptah/tmp/w8-b13-{related,spec,lint,templates}.log`.

## Open

- Decision: questions without an `agentId` still show above every non-orchestrator lane, CLI lanes included, as before. This keeps a main-session question visible while a lane covers the transcript. A lane-asked question shows only in its own lane. This can be undone in one line.
- Position: the prompt list sits above the agent card, where the strip was, as the plan says. The agent card itself puts it above the composer. The Phase P4 visual review in Electron should confirm this placement.
- No files in `libs/frontend/chat` were touched.

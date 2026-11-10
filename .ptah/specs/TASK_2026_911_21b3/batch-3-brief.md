# Batch B3 brief — TASK_2026_911_21b3

Tool path and texts for "child session succession". Edit, do not explore. Read only the files
named here, plus a file that a type error names.

Worktree (stay inside): `D:\projects\ptah-extension\.claude-worktrees\fix-session-runtime-cap-handoff-39238e08cd52`
Folder `S` = `libs/backend/cli-agent-runtime/src/lib/session-children/`.

**Deliverable**: `.ptah/specs/TASK_2026_911_21b3/batch-3-report.md` — write a skeleton first,
fill it at the end: files changed, behavior, spec cases added, extra files read,
`## Decisions`, `## Not done`.

## Background

A "child session" is a chat session in its own git worktree that a parent session started with
`ptah_session_start`. Today `ptah_session_handoff` refuses a child caller (`child-session`), and
the host hard-stops a child at its runtime cap. New behavior: a SUCCESSION replaces the live
child with a successor child (new session, SAME worktree, branch and parent; it adopts the
running CLI lanes; fresh runtime cap). Other lanes write the spawner side IN PARALLEL in the
same worktree. Do not touch their files, and do not be surprised by their uncommitted changes.

Contract you code against (other batches add it to `S/session-spawner.port.ts`; it may not be
in the file yet — do NOT add it yourself, do NOT edit that file):

```ts
export interface SessionChildSuccessionRequest {
  readonly callerSessionId: string | undefined; // the child's tab id or SDK id
  readonly handoffPath: string;                 // absolute path of the handoff file
  readonly prompt: string;                      // continuation prompt
  readonly label?: string;
}
export type SessionChildSuccessionRefusalCode =
  | 'not-a-live-child' | 'succession-in-progress' | 'max-successions-reached'
  | 'chat-runtime-unavailable' | 'session-start-failed';
export type SessionChildSuccessionResult =
  | { readonly ok: true; readonly successor: SessionChildSnapshot; // has childSessionId, label, workspaceRoot, worktreePath
      readonly adoptedLanes: readonly string[]; readonly tabOpened: boolean }
  | { readonly ok: false; readonly refusal: SessionChildSuccessionRefusalCode; readonly detail: string };
// on ISessionSpawner:
succeed(request: SessionChildSuccessionRequest): Promise<SessionChildSuccessionResult>;
```

New settings (already read by the settings file; you only document them):
`agentSessions.runtimeWarnLeadMinutes` (default 10, 1..60, always below the cap),
`agentSessions.handoffGraceMinutes` (default 15, 1..120), `agentSessions.maxSuccessions`
(default 8, 0..50; 0 = no succession, the old stop). New terminal child status: `handed-off`.

Timeline to document: at `cap - warnLead` the host sends the child a message (finish the step,
write `HANDOFF.md`, call `ptah_session_handoff`). At the cap an idle child is succeeded at once.
A busy child is NOT interrupted: succession runs when its turn ends. At `cap + handoffGrace` a
still-busy turn is interrupted and a successor starts with a recovery prompt. Only when the
successor cannot start, or `maxSuccessions` is reached, the child ends `timed-out`; its lanes
move to the parent and the uncommitted work stays in the worktree. The parent gets one signal
that names the successor; the old child id keeps working with
`ptah_session_send/status/read/stop` (it forwards to the successor).

## Write set (only these)

1. `S/session-handoff.service.ts` + `S/session-handoff.service.spec.ts`
2. `S/session-handoff.port.ts` only if a doc comment or refusal text must change (no new
   result fields).
3. `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.ts` (tool
   descriptions, near lines 143-158) and `session-tool-handlers.ts` (near 320-352, 395-457),
   plus their specs `session-tools.spec.ts`, `session-handoff-ack.tool.spec.ts`, and any spec in
   `libs/backend/vscode-lm-tools` with an object that implements `ISessionSpawner` (add a
   `succeed` mock). Find those with ONE search for `ISessionSpawner` in
   `libs/backend/vscode-lm-tools/src`.
4. `.claude/skills/session-handoff/SKILL.md`
5. `.claude/skills/agent-lanes/SKILL.md` — only the section that covers child sessions
   (search `ptah_session_start`; if no such section exists, skip and report).
6. `apps/ptah-docs/src/content/docs/agents/agent-sessions.md` (settings table near line 92,
   statuses, a short "Runtime cap and automatic handoff" section).

## Changes

### 1. `SessionHandoffService.guardAndStart` (lines 283-349)

- Add an optional LAST constructor parameter:
  `@inject(CLI_AGENT_RUNTIME_TOKENS.SESSION_SPAWNER, { isOptional: true }) private readonly spawner: ISessionSpawner | null = null`.
  First check `S/session-spawner.service.ts` constructor (top ~120 lines only) and
  `libs/backend/cli-agent-runtime/src/lib/di/register.ts` lines 395-420: if the spawner injects
  the handoff service (a DI cycle) or is not a singleton, do NOT inject it; instead resolve it
  lazily at call time from `this.container` the way `lookupHost()` does, and report this.
- Replace the `child-session` refusal block (302-310). For a child caller:
  1. No spawner → keep the `child-session` refusal with the old text.
  2. Keep the `mcp-unavailable` check, then `checkHandoffFile(request.handoffPath)` as today.
  3. `await this.spawner.succeed({ callerSessionId: request.callerSessionId, handoffPath,
     prompt: request.prompt, label: request.label })` (use the same resolved absolute handoff
     path the top-level flow passes on).
  4. Map ok → `SessionHandoffResult` ok: `tabId` = `successor.childSessionId`, `label`,
     `workspaceRoot`, `cwd` = `successor.worktreePath`, `tabOpened`, `adoptedLanes`,
     `adoptedChildSessions: []`.
  5. Map refusals to EXISTING `SessionHandoffRefusal` codes (read the union in
     `session-handoff.port.ts`; no new code): `succession-in-progress` → `already-handed-off`;
     `not-a-live-child` → `unattributed-caller`; `chat-runtime-unavailable` → same;
     `session-start-failed` → the code the top-level flow uses for a failed start;
     `max-successions-reached` → `child-session` with the spawner's detail. Always pass the
     spawner's `detail` through.
  A child succession does NOT use the top-level bookkeeping (`inFlight`, `handedOff`,
  `adoptWork`, `bindPendingChain`, the armed caller stop, the ack store): the spawner retires
  the predecessor. Put the child branch in its own small private method.
- Spec: child caller + spawner ok → mapped result, `spawner.succeed` called once with the
  request, no top-level start; each refusal mapping; child caller without a spawner → old
  refusal; missing handoff file → the file refusal and `succeed` not called; a top-level caller
  is unchanged.

### 2. vscode-lm-tools

- `ptah_session_handoff` description: a child session may call it; the successor continues in
  the same worktree and branch, receives the running lanes, and the parent is notified. Remove
  a sentence that says a child is refused. Keep descriptions short (they cost tokens in every
  session).
- `ptah_session_handoff_ack` description + handler: a successor of a CHILD session does not
  need the ack. Check what the handler/service returns today when a child-session successor
  calls it; make that a harmless, clearly worded result (no error loop). Report what you found.
- Result text of the handoff handler for a child: say "successor child session <tabId> started
  in the same worktree; finish your turn now, this session ends when the turn ends".
- `ptah_session_status` / `ptah_session_start` texts: mention status `handed-off` and the
  `succeededBy` id where statuses are listed.
- Update spec assertions that match the changed texts.

### 3. Skills and docs (plain, short sentences, active voice)

- `session-handoff/SKILL.md`: remove or replace any statement that a child session cannot hand
  off. Add: in a child session the same steps apply; write `HANDOFF.md` in the task folder
  (else the worktree root); leave uncommitted work in place (never stash/revert); list running
  lane agent ids in the file; do not call `ptah_session_handoff_ack` in the successor; a host
  runtime-cap warning is a trigger for this skill.
- `agent-lanes/SKILL.md` child-session section: 3-5 lines on the timeline above and the
  `handed-off` signal (verdict `unverified`, names the successor; keep using the old id or the
  new one).
- `agent-sessions.md`: three new settings rows, status `handed-off`, the timeline section, and
  correct the `maxRuntimeMinutes` row (the cap starts a handoff; it is not a hard stop).

## Rules

- TypeScript strict: no `any`, no `@ts-ignore`, no `as unknown as`. No `console.*`. Read the
  first 80 lines of a spec file before you add to it, and follow its style.
- You cannot run Jest, lint or typecheck in your sandbox. Do NOT run `npm`, `npx`, `nx`, build,
  serve, dev, e2e or package commands. The orchestrator runs
  `npm run verify -- -p cli-agent-runtime,vscode-lm-tools`. Never workspace-wide checks.
- Product focus is the Electron host; these libs are host-neutral and must stay so.
- Git: never commit, push, restore, checkout, stash, reset or clean. A change you did not make
  belongs to another writer: report it, never revert it.
- Reply: `WROTE: <absolute deliverable path>` plus one headline line, nothing else.

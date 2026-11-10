# Batch B4 brief — TASK_2026_911_21b3

Add an END CAUSE to the session-end signal of `libs/backend/agent-sdk`, and pass the right cause
at every place that ends a chat session. Narrow task: follow the call chain, do not explore.

Worktree (stay inside): `D:\projects\ptah-extension\.claude-worktrees\fix-session-runtime-cap-handoff-39238e08cd52`

**Deliverable**: `.ptah/specs/TASK_2026_911_21b3/batch-4-report.md` — write a skeleton first.
Final content: files changed; the CALL-SITE TABLE (below); spec cases added; extra files read;
`## Decisions`; `## Not done`.

## Background

A "child session" (a chat session in a git worktree, run by `SessionSpawnerService` in
`libs/backend/cli-agent-runtime`) subscribes to `SessionEndCallbackRegistry`. When a child's SDK
session ends and does not come back in 30 s, the spawner marks the child `ended`. Today
`SessionEndPayload` (`libs/backend/agent-sdk/src/lib/helpers/session-end-callback-registry.ts:22`)
is `{ sessionId, workspaceRoot }`: the spawner cannot tell a user stop from a fault. Another
batch makes the spawner start a successor session on every cause EXCEPT a user stop, a workspace
close and a host shutdown. So a user stop that reaches the spawner with the wrong cause would
restart a session the user stopped: classify user stops with care. Other lanes edit
`libs/backend/cli-agent-runtime/src/lib/session-children/**` and `libs/backend/vscode-lm-tools/**`
in the same worktree now: do NOT edit those folders, never revert their changes.

## Contract (exact)

In `session-end-callback-registry.ts`:

```ts
import { z } from 'zod'; // confirm zod is already a dependency of agent-sdk (one search); if not, report and use a hand-written guard

export const SESSION_END_CAUSES = [
  'user-stop',        // stop button, chat abort RPC, tab/session close or delete by the user
  'parent-stop',      // another session or the host supervisor stopped it on purpose (spawner stop/cap, handoff predecessor stop, gateway)
  'stream-exit',      // the stream loop ended without a user stop
  'provider-error',   // provider/auth/transport error ended the session
  'config-reinit',    // settings or auth change re-initialized the adapter and disposed sessions
  'workspace-close',  // the workspace folder was closed or switched
  'compaction-abort', // compaction dwell/abort path
  'host-shutdown',    // extension/app deactivation
  'unknown',
] as const;
export const SessionEndCauseSchema = z.enum(SESSION_END_CAUSES);
export type SessionEndCause = z.infer<typeof SessionEndCauseSchema>;
/** Any value → a cause; an invalid or missing value is `unknown`. */
export function parseSessionEndCause(value: unknown): SessionEndCause;

export interface SessionEndPayload {
  sessionId: string;
  workspaceRoot: string;
  /** Why the session ended. `unknown` when the ending code path gave none. */
  cause: SessionEndCause;
}
```

- `notifyAll` accepts `{ sessionId, workspaceRoot, cause?: unknown }`-shaped input from callers
  and delivers a payload whose `cause` went through `parseSessionEndCause` (this is the
  boundary). Subscribers always get a valid cause.
- Export the new symbols from the agent-sdk public `src/index.ts` next to the existing
  `SessionEndPayload` export.

## Plumbing

Add an OPTIONAL trailing `cause?: SessionEndCause` parameter (default `'unknown'`) through the
chain that reaches `notifyAll`. Start at
`libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts`
(`endSession`, `endRecord`, `disposeAllSessions`, near lines 306-398), then
`helpers/session-lifecycle-manager.ts` (`endSession` 758 and 964, `disposeAllSessions` 786/807),
then `sdk-agent-adapter.ts` (`endSession`, `interruptSession`, `requestConfigReinit` near
415-436, `reset`, `dispose`), then the `IAgentAdapter` interface that declares
`endSession`/`interruptSession` (optional parameter, so other implementers keep compiling;
update other implementers only when the compiler would fail). Keep all existing behavior and
ordering: this batch changes only the cause value.

Then classify EVERY caller. Find them with these searches only (paths + lines):
`\.endSession\(`, `\.interruptSession\(`, `disposeAllSessions\(`, `requestConfigReinit\(` in
`libs/**/src/**/*.ts` and `apps/**/src/**/*.ts`, spec files excluded. For each call site pass
the cause that matches its trigger. Known sites from the investigation:

| Site | Cause |
| --- | --- |
| chat abort / stop RPC handler, tab close, session delete (rpc-handlers) | `user-stop` |
| `chat-stream-broadcaster.service.ts` ~449-454 (stream loop exit) and ~389-405 (zero-event cleanup) | `stream-exit` (or `provider-error` when the branch handles an error) |
| NoActivityWatchdog abort | `stream-exit` |
| `sdk-agent-adapter.ts` `requestConfigReinit` → dispose all | `config-reinit` |
| workspace folder close (~`sdk-agent-adapter.ts:974` or lifecycle manager ~807) | `workspace-close` |
| compaction dwell abort | `compaction-abort` |
| adapter `dispose` / deactivation | `host-shutdown` |
| `session-children/session-spawner.service.ts`, `session-handoff.service.ts:716` | DO NOT EDIT (other batch); list them as `parent-stop (other batch)` |
| `gateway-chat-bridge.ts:762` | read 20 lines around it and decide; `parent-stop` unless it is a user command |

A site you cannot classify from 30 lines of context stays `unknown`: list it with the reason.
When the same function serves a user stop and a non-user path, add the optional `cause`
parameter to that function and pass it from ITS callers (one level up, then stop).

**CALL-SITE TABLE** in the report: file:line, function, trigger, cause passed, confidence.

## Specs

- `session-end-callback-registry.spec.ts` (create if absent, style of a neighbor spec):
  `parseSessionEndCause` for each valid value, invalid string, non-string, undefined;
  `notifyAll` delivers `unknown` for a missing or invalid cause and the given cause otherwise.
- `session-control` / lifecycle-manager specs: `endSession(id)` notifies `unknown`;
  `endSession(id, 'user-stop')` notifies `user-stop`; `disposeAllSessions('config-reinit')`
  notifies that cause for each session. Add to the existing spec files (read the first 80 lines
  for the harness).
- Update existing assertions that compare the whole payload object (`toEqual({ sessionId,
  workspaceRoot })`): search `notifyAll` in `libs/backend/**/*.spec.ts` once and fix those
  OUTSIDE `cli-agent-runtime/src/lib/session-children` and `vscode-lm-tools`.
- For two or three high-value call sites (chat abort RPC → `user-stop`, stream exit →
  `stream-exit`, config re-init → `config-reinit`), extend the existing spec of that file with
  one assertion on the cause argument, when such a spec exists.

## Rules

- TypeScript strict: no `any`, no `@ts-ignore`, no `as unknown as` in new code. No
  `console.*`. Do not import `vscode` or `electron` into host-neutral libs.
- You cannot run Jest, lint or typecheck in your sandbox. Do NOT run `npm`, `npx`, `nx`, build,
  serve, dev, e2e or package commands. The orchestrator runs
  `npm run verify -- -p agent-sdk,rpc-handlers,...` (list every Nx project you edited in the
  report: read `project.json` `name` of each lib you touch). Never workspace-wide checks.
- Product focus is the Electron host: when a call site exists per host, do Electron first and
  keep VS Code and the CLI compiling.
- Git: never commit, push, restore, checkout, stash, reset or clean. Report a change you did
  not make; never revert it.
- Reply: `WROTE: <absolute deliverable path>` plus one headline line, nothing else.

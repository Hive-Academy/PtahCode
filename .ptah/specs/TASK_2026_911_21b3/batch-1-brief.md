# Batch B1 brief — TASK_2026_911_21b3

Types, settings, registry and pure helpers for "child session succession". Edit, do not
explore. Read only the files named here, plus a file that a type error names.

Worktree (stay inside): `D:\projects\ptah-extension\.claude-worktrees\fix-session-runtime-cap-handoff-39238e08cd52`
All source paths below are relative to `libs/backend/cli-agent-runtime/src/lib/session-children/`.

**Deliverable**: `.ptah/specs/TASK_2026_911_21b3/batch-1-report.md` — write a skeleton first,
fill it at the end: files changed, each exported symbol added (name + signature), extra files
read, `## Decisions`, `## Not done`.

## Background

A "child session" is a chat session in its own git worktree, tracked by `SessionChildRegistry`
and run by `SessionSpawnerService`. Today a child is hard-stopped at its runtime cap. The fix: a
SUCCESSION replaces a live child (the predecessor) with a successor child: a new session (new
tab id) in the SAME worktree and branch under the SAME parent. The predecessor ends with the new
terminal status `handed-off`. This batch adds only the building blocks. A later batch changes
`session-spawner.service.ts`: DO NOT edit that file, `session-handoff.service.ts`, or anything
outside the write set.

## Write set (only these files)

1. `session-child-settings.ts` + `session-child-settings.spec.ts`
2. `session-spawner.port.ts`
3. `session-child.registry.ts` + `session-child.registry.spec.ts`
4. NEW `session-child-succession.ts` + NEW `session-child-succession.spec.ts`
5. `session-child-contract.ts` + `session-child-contract.spec.ts`
6. `index.ts` (same folder) — export the new file's symbols the way the other files are exported.

## Changes

### 1. Settings

Add three exported `IntegerSetting` constants (style of `SESSION_CHILD_MAX_RUNTIME_MINUTES`) and
three fields on `SessionChildSettings`, read in `readSessionChildSettings`:

- `SESSION_CHILD_RUNTIME_WARN_LEAD_MINUTES`: key `agentSessions.runtimeWarnLeadMinutes`,
  fallback 10, min 1, max 60 → field `runtimeWarnLeadMinutes`. After the read, clamp it to at
  most `maxRuntimeMinutes - 1` (and at least 1).
- `SESSION_CHILD_HANDOFF_GRACE_MINUTES`: key `agentSessions.handoffGraceMinutes`, fallback 15,
  min 1, max 120 → field `handoffGraceMinutes`.
- `SESSION_CHILD_MAX_SUCCESSIONS`: key `agentSessions.maxSuccessions`, fallback 8, min 0,
  max 50 → field `maxSuccessions`.

Update the file header comment (it says "four" settings). Spec: defaults, clamps, wrong type →
fallback, the warn-lead clamp against a small `maxRuntimeMinutes` (5 → 4).

### 2. Port (`session-spawner.port.ts`)

- Add `'handed-off'` to `SessionChildStatus` and to the `Extract` list of
  `SessionChildTerminalStatus`.
- `SessionChildSnapshot`: add optional readonly fields with doc comments: `succeeds?: string`
  (child id of the predecessor this child continues), `succeededBy?: string` (child id of the
  successor that continues this child), `successionCount?: number` (successions before this
  child in its chain; absent = 0).
- `SessionChildSettle['status']` (find the type in this file): add `'handed-off'`.
- Add and export:

```ts
/** Why a succession runs. */
export type SessionChildSuccessionCause =
  | 'child-handoff' // the child called ptah_session_handoff
  | 'runtime-cap' // the cap was reached and the child was idle or its turn ended
  | 'runtime-cap-interrupted'; // the handoff grace expired and the turn was interrupted

export interface SessionChildSuccessionRequest {
  /** The child's MCP routing id (tab id or SDK id), from the transport. */
  readonly callerSessionId: string | undefined;
  /** Absolute path of the handoff file the child wrote. */
  readonly handoffPath: string;
  /** The continuation prompt the child composed. */
  readonly prompt: string;
  readonly label?: string;
}

export type SessionChildSuccessionRefusalCode =
  | 'not-a-live-child'
  | 'succession-in-progress'
  | 'max-successions-reached'
  | 'chat-runtime-unavailable'
  | 'session-start-failed';

export type SessionChildSuccessionResult =
  | {
      readonly ok: true;
      readonly successor: SessionChildSnapshot;
      readonly adoptedLanes: readonly string[];
      readonly tabOpened: boolean;
    }
  | {
      readonly ok: false;
      readonly refusal: SessionChildSuccessionRefusalCode;
      readonly detail: string;
    };
```

Do NOT add a method to `ISessionSpawner` in this batch.

- Find usages of `SessionChildStatus`, `SessionChildTerminalStatus` and the literal
  `'timed-out'` across `libs` and `apps` (one search each, paths + lines only). Fix a broken
  exhaustive `switch` / `Record<…>` only when the file is in the write set. List ALL other hits
  (file:line) in the report under `## Status usages outside the write set` (the next batch
  needs them).

### 3. Registry (`session-child.registry.ts`)

- Add `'succeeds' | 'succeededBy' | 'successionCount'` to the keys `MutableRecordFields` omits.
- Add three public methods with doc comments, in the style of the file (records are replaced,
  never mutated in place):

```ts
/**
 * Replace a live child with its successor in one synchronous step. The
 * predecessor ends as `handed-off` with `reason` and `succeededBy`; the
 * successor is stored with `succeeds` and `successionCount` = predecessor's + 1.
 * No reservation is consumed: the successor takes the predecessor's slot, so
 * `liveCount()` is unchanged. Throws when the predecessor is unknown or already
 * terminal, or when the successor id is in use (spawner bugs).
 */
succeed(predecessorId: string, successor: SessionChildRecord, reason: string, endedAt?: string):
  { readonly predecessor: SessionChildRecord; readonly successor: SessionChildRecord };

/**
 * Undo `succeed` after a failed successor start: remove the successor and make
 * the predecessor live again (terminal status, endedAt, endReason and
 * succeededBy cleared; removed from the ended order). Returns the restored
 * predecessor, or undefined when the pair is not a recorded succession.
 */
revertSuccession(predecessorId: string, successorId: string): SessionChildRecord | undefined;

/**
 * The newest record in the succession chain that starts at `id` (tab id or SDK
 * id): follows `succeededBy` until a record without one. Returns the record
 * itself when it has no successor, undefined when `id` is unknown. A link to a
 * pruned record ends the walk at the last known record. At most 64 hops.
 */
resolveLatest(id: string | undefined): SessionChildRecord | undefined;
```

- In `succeed`, prune the ended history only after both writes.
- Keep `markEnded` idempotence: after `succeed`, `markEnded(predecessorId, …)` must not change
  the `handed-off` status or reason.
- Spec cases: `succeed` keeps `liveCount`, sets all link fields and the count, throws on the
  three bad inputs; `reserveSlot(max)` sees the same count after `succeed`; `revertSuccession`
  restores a live predecessor and removes the successor (`get(successorId)` undefined, SDK id
  index clean); `resolveLatest` across a 3-long chain, by SDK id, for an unknown id, and after a
  revert; `markEnded` after `succeed` is a no-op.

### 4. NEW `session-child-succession.ts` (pure functions: no DI, no fs, no timers)

Header comment: what a succession is (Background paragraph); the spawner owns the state machine.

```ts
export const SESSION_CHILD_HANDOFF_FILE = 'HANDOFF.md';
/** Where a child writes its handoff file: its task folder when it has one, else its worktree root. */
export function sessionChildHandoffPath(
  child: Pick<SessionChildRecord, 'taskFolder' | 'worktreePath'>,
): string;
/** Delay from the start of a child to its runtime warning, in ms (never negative). */
export function runtimeWarnDelayMs(
  settings: Pick<SessionChildSettings, 'maxRuntimeMinutes' | 'runtimeWarnLeadMinutes'>,
): number;
/** The peer message the host sends to a child ahead of its runtime cap. */
export function renderRuntimeCapWarning(input: {
  readonly minutesLeft: number;
  readonly graceMinutes: number;
  readonly handoffPath: string;
}): string;
/** The task text of a successor child (goes after the child contract). */
export function renderSuccessorTask(input: {
  readonly predecessorId: string;
  readonly cause: SessionChildSuccessionCause;
  readonly originalTask: string;
  readonly handoffPath: string;
  readonly handoffExists: boolean;
  readonly adoptedLanes: readonly string[];
  /** The continuation prompt of a child-handoff; absent for a host-driven succession. */
  readonly prompt?: string;
}): string;
/** The predecessor's end reason. */
export function successionEndReason(
  successorId: string,
  cause: SessionChildSuccessionCause,
): string;
```

`taskFolder` on the record: check in `session-spawner.service.ts`, function `resolveChildPaths`
(near line 1453, READ ONLY, about 40 lines), whether it is absolute or relative to the worktree,
and resolve accordingly with `node:path`.

Text requirements (plain, imperative, ASCII, no markdown headings):

- `renderRuntimeCapWarning`: the session reaches its runtime cap in `minutesLeft` minutes; it
  is NOT interrupted now. Instructions: (1) finish the current step, do not start a new one;
  (2) commit verified work if a commit is due, leave other work uncommitted in the worktree;
  (3) write the handoff file at `handoffPath` (state, done, remaining steps, running lanes and
  their agent ids, verify state, open decisions); (4) call the `ptah_session_handoff` tool with
  that path and a continuation prompt. A successor session then continues in the same worktree
  and branch and receives the running lanes. Without a handoff the host starts a successor by
  itself, at the latest `graceMinutes` minutes after the cap.
- `renderSuccessorTask`: first line "You continue the work of child session <predecessorId>"
  plus the cause in words. The worktree and branch are the same and can contain uncommitted
  work that MUST be kept (never revert, restore, stash or clean it). When `handoffExists`:
  "Read <handoffPath> first". Otherwise: "No handoff file exists: inspect `git status`,
  `git diff` and the task folder to rebuild the state". For `runtime-cap-interrupted`: the
  previous turn was interrupted mid-step, so the last command may need to run again. List the
  adopted lane ids (or say there are none) and say their completion signals now arrive in this
  session. Say not to call `ptah_session_handoff_ack`. Then `prompt`, when present, under
  "Continuation prompt from the previous session:". Then "Original task:" + `originalTask`.
- `successionEndReason`: e.g.
  `handed off to child session <id> (<cause in words>); work continues in the same worktree`.

Spec: every branch of the texts (contains checks, not snapshots), path resolution with and
without a task folder, delay math.

### 5. Contract (`session-child-contract.ts`)

Read the file. Add ONE short paragraph to the rendered contract (and a spec assertion): the
session has a runtime cap and a usage budget; when the host warns about either, or when
`/session-handoff` runs, the session must finish its current step, write `HANDOFF.md` and call
`ptah_session_handoff`; a successor session then continues the task in the same worktree; a
child must not ignore the warning. If the contract contains a sentence that says a child cannot
hand off, replace it. Keep the rest of the contract byte-identical (other specs match on it).

## Rules

- TypeScript strict: no `any`, no `@ts-ignore`, no `as unknown as`. Kebab-case files. No
  `console.*`. Immutable record style of the registry.
- You cannot run Jest, lint or typecheck in your sandbox. Do NOT run `npm`, `npx`, `nx`, build,
  serve, dev, e2e or package commands. The orchestrator runs
  `npm run verify -- -p cli-agent-runtime`. Read the first 60 lines of a spec file before you
  add to it, and follow its style.
- Product focus is the Electron host; this lib is host-neutral and must stay so.
- Git: never commit, push, restore, checkout, stash, reset or clean. Report a change you did
  not make; never revert it.
- Reply: `WROTE: <absolute deliverable path>` plus one headline line, nothing else.

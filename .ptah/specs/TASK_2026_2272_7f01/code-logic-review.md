# Code Logic Review — `TASK_2026_2272_7f01`

Scope: the cron agent MCP tools (uncommitted changes in `feat/cron-agent-tools`).
I read these files: `cron.tools.ts` (whole file), the `mcp-caller-policy.ts` diff against `main`,
`cron-tool-policy.ts` (whole file) and `cron-job.service.ts` (whole file, partly in outline).
I also read the call sites needed to trace the write path:
`sdk-permission-handler.ts:675-720, 1450-1475`, `protocol-dispatcher.ts:835-855`,
`sdk-query-options-builder.ts:2368-2386`, and a grep of `cron-namespace.builder.ts`.
I ran no tests, builds or typechecks; the task brief does not allow them.

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 2              |
| Moderate issues     | 1              |
| Failure modes found | 3              |

Why 7 and not 8: no write path skips approval or the caller policy. But the approval prompt can show the
user something false (an update shows a workspace change that is not happening) or too little to
recognise the job (toggle and run_now show only the id). The user's approval is the main control
of this feature, so these two count as Serious. Why not 6: the controls themselves are correct
and enforced at several layers.

## Five logic questions

### 1. How does this fail silently?

- An update approval shows the line `Workspace: the workspace of this session (default)` when the
  call does not change the workspace. It shows the same line when `workspaceRoot: null` removes
  the workspace. The user approves a change they did not see correctly
  (`cron-tool-policy.ts:117-120`, used for update at `:151`).
- A create call without `workspaceRoot` falls back to `deps.getWorkspaceRoot() ?? null`
  (`cron-namespace.builder.ts:315-316`). In that case the job is stored with no workspace, but
  the approval prompt said "the workspace of this session".

### 2. What user action produces unexpected behaviour?

- The user approves "Enable scheduled job 01J…" or "Run scheduled job 01J… now" without seeing the
  job's name or prompt (`cron-tool-policy.ts:152-162`; the limit is stated at `:16-18`). A model
  that names the wrong id gets an approval the user cannot check.

### 3. What input data produces a wrong answer?

- `ptah_cron_update` with `workspaceRoot: null` or with no `workspaceRoot`: the prompt text is
  wrong (see 1).
- An update that changes only `timezone` shows `Timezone: …`. That is correct.

### 4. What happens when a dependency fails?

- `handlerFor` (`cron.tools.ts:269-275`) awaits the namespace call with no try/catch. The namespace
  turns validation and not-found errors into `refused` results (`cron-namespace.builder.ts:205-211`),
  but rethrows any other error (`:213`), for example a SQLite failure. That error reaches the
  dispatcher as a thrown error, not as a `refused` result. This review did not read whether the
  dispatcher returns it as a coded MCP error, so it is not counted as a finding.
- `runNow` is called without the abort signal of the tool call (`cron-namespace.builder.ts:368`),
  although `CronJobService.runNow` accepts one (`cron-job.service.ts:387-391`). See Moderate.

### 5. What is missing that the requirements never mentioned?

- The five write-tool names are hard-coded in four lists: `cron.tools.ts:37-43`,
  `cron-tool-policy.ts:26-32`, `mcp-caller-policy.ts` `AGENT_CONTROL_TOOLS` and `CRON_WRITE_TOOLS`.
  The `cron.tools.ts` header says one spec compares two of these lists. I did not confirm that
  any spec covers the caller-policy lists. A sixth write tool added to only some lists would keep
  the approval prompt and lose the caller-policy deny, or the reverse.

## Failure modes

### Approval text misstates an update's workspace

- Trigger: `ptah_cron_update` without `workspaceRoot`, or with `workspaceRoot: null`.
- Symptom: the prompt shows `Workspace: the workspace of this session (default)`.
- Evidence: `cron-tool-policy.ts:117-120` (`describeJobFields`, shared by create and update);
  `:151`. On update, an absent field means "unchanged" and `null` means "clear"
  (`cron-job.service.ts:62`, `cron-namespace.builder.ts:344-345`).
- Current handling: the create-only default text is shown for update calls too.
- Recommendation: give `describeJobFields` a mode. For update: no line when the field is absent,
  `Workspace: removed (none)` for `null`, the path for a string. Add a spec for the absent and
  `null` cases.

### Id-only approvals cannot be checked by the user

- Trigger: `ptah_cron_toggle` with `enabled: true`, or `ptah_cron_run_now`.
- Symptom: the user sees only an opaque job id. Approving it starts an unattended run of a
  prompt the user does not see.
- Evidence: `cron-tool-policy.ts:141-162`; the limit is stated at `:16-18`, because agent-sdk
  cannot import cron-scheduler.
- Current handling: the gap is documented and accepted.
- Recommendation: add the job's name and its stored prompt (or a preview) to the approval text
  without a library dependency. For example, inject a `describeJob(id)` lookup port into the
  permission handler, bound in the Electron composition root. Or have the tool input carry the
  name and have the namespace check that it matches the stored job before it runs.

### Create approval shows a fallback workspace that may not exist

- Trigger: `ptah_cron_create` without `workspaceRoot` while the session has no workspace root.
- Symptom: the prompt says "the workspace of this session", but the job is stored with
  `workspaceRoot: null`.
- Evidence: `cron-tool-policy.ts:118-120`; `cron-namespace.builder.ts:315-316`.
- Recommendation: refuse the create when no workspace can be resolved, or word the prompt
  "the session's workspace, or none if the session has none".

## Blocking issues

None. The write path is protected at three layers:

1. The dispatcher denies any write tool unless the caller's credential carries
   `cronWriteApproval: true` (`protocol-dispatcher.ts:847-853`,
   `mcp-caller-policy.ts` `isCronWriteDenied`). Only the interactive SDK credential sets this flag
   (`sdk-query-options-builder.ts:2382`), and it also sets `capability: 'privileged'`.
2. The write tools are in `AGENT_CONTROL_TOOLS`, so read-only callers fail `isToolPermitted` first.
3. The permission handler checks cron write tools before every auto-approval path. It denies
   them when there is an unattended policy or a CLI lane (`sdk-permission-handler.ts:687-697`)
   and otherwise always asks the user. "Always Allow" stores no rule for them (`:1460`).

The tool list hides the write tools from callers that would be denied (`effective-tool-list.ts:111`).
Called through `execute_code`, the `ptah.cron` write methods return `WRITE_NEEDS_TOOL`
(`cron-namespace.builder.ts:248-252`), so they do not bypass the gate. Input passes through zod
`.strict()` schemas (`cron.tools.ts:71-154`) and then through `CronJobService` validation:
type checks, length caps, the reserved `handler:` prefix (`cron-job.service.ts:107-114`), and an
absolute workspace path with no `..` segments (`:131-152`).

## Serious issues

### Update approval shows a wrong workspace line

- File: `libs/backend/agent-sdk/src/lib/permission/cron-tool-policy.ts:117-120, 151`
- Scenario: any update call that does not set `workspaceRoot`, or that sets it to `null`.
- Impact: the user approves after reading a false description of the change.
- Fix: as in the failure mode above.

### Toggle and run_now approvals are not informed consent

- File: `libs/backend/agent-sdk/src/lib/permission/cron-tool-policy.ts:152-162`
- Scenario: a model enables or runs a job; the prompt shows only its id.
- Impact: the approval gate exists but gives the user nothing to judge. The requirement that a
  human approves each change is met in form only.
- Fix: as in the failure mode above.

## Moderate and minor issues

- Moderate: `runNow` does not pass the tool call's abort signal
  (`cron-namespace.builder.ts:368`). `CronJobService.runNow` accepts one
  (`cron-job.service.ts:387`) and awaits `scheduler.runNow`. If the scheduler waits for the run
  to finish, a cancelled tool call keeps the run going, and the tool call blocks for the whole
  run. I did not read whether `scheduler.runNow` returns before the run finishes.
- Minor: the write-tool names are listed four times with no spec that checks the caller-policy
  lists against the others (`mcp-caller-policy.ts`, the `AGENT_CONTROL_TOOLS` additions and
  `CRON_WRITE_TOOLS`). Build the two `mcp-caller-policy.ts` sets from `CRON_MUTATING_TOOL_NAMES`
  in `cron.tools.ts`, or add a parity spec.
- Minor: `delete` returns `false` and `runNow` returns `null` for a malformed id
  (`cron-job.service.ts:375-392`), while `update` throws a validation error for the same input
  (`:337`). The zod schema only requires `min(1)`, so a malformed id reaches the service. The
  namespace maps `false`/`null` to refusals (`cron-namespace.builder.ts:372-407`), so the agent
  still gets an answer, but the refusal reason may differ from the one `update` gives.

## Data flow

1. The model calls `mcp__ptah__ptah_cron_create`. The SDK permission handler checks cron write
   tools first: it denies when the session is unattended or a CLI lane, and otherwise prompts
   the user. OK, but the prompt text has the gaps above.
2. The HTTP MCP dispatcher checks the capability, the phase and then `isCronWriteDenied`. OK.
3. `handlerFor` runs zod `.strict()` `safeParse` and returns a `refused` result on bad input. OK.
4. The namespace reads the session id (and refuses without one) and resolves the default
   workspace. Gap: the default can become `null` while the prompt promised the session's
   workspace.
5. `CronJobService` validates every field and stores the job with `createdBy`. OK.
6. The DTO is serialized as JSON to the agent. Errors other than validation and not-found are
   rethrown (`ns:213`) and leave as a thrown error, not a `refused` result.

## Requirements fulfilment

| Requirement                              | Status   | Gap                                                    |
| ---------------------------------------- | -------- | ------------------------------------------------------ |
| Nine tools (4 read, 5 write)             | COMPLETE | —                                                      |
| Writes need user approval                | PARTIAL  | The prompt can be wrong (update) or uninformative (toggle, run_now) |
| Read-only and unattended callers denied writes | COMPLETE | Three independent layers                         |
| Input validated before the service       | COMPLETE | zod schemas plus service checks                        |
| Errors returned to the agent as `refused` | PARTIAL | Unexpected errors are rethrown (not confirmed as a defect) |

Implicit requirements not addressed: cancelling a run_now tool call does not reach the run;
nothing checks that the four lists of write-tool names agree.

## Edge cases

| Case                                    | Handled | How                    | Concern                     |
| --------------------------------------- | ------- | ---------------------- | --------------------------- |
| `handler:` prompt from the agent        | YES     | `cron-job.service.ts:107-114` | —                    |
| `..` in `workspaceRoot`                 | YES     | Raw segment check `:147`  | —                        |
| Update with `workspaceRoot: null`       | PARTIAL | The service clears it  | The approval text is wrong  |
| Create with no session id               | YES     | `NO_SESSION` refusal   | —                           |
| CLI lane calls a write tool             | YES     | The dispatcher and the permission handler both deny | — |
| "Always Allow" on a cron prompt         | YES     | No rule is stored (`:1460`) | —                      |
| Cancelling run_now                      | NO      | The signal is not passed | Possible long block       |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM. The namespace builder and the dispatcher's error mapping were read only in part.
- Top risk: the user approves cron changes from prompt text that is wrong or too thin to judge.
- What a robust implementation would add: update-aware approval text; the job's name and prompt
  in toggle and run_now approvals through an injected lookup; the abort signal passed to
  `runNow`; one list of write-tool names, or a parity spec.

## Resolution (coordinator, 2026-11-18)

- Update prompt workspace: fixed. `describeJobFields` takes a `create`/`update` mode. An update
  without `workspaceRoot` shows no workspace line; `workspaceRoot: null` shows "none". Two new
  cases in `cron-tool-policy.spec.ts`.
- Toggle/run_now prompt shows only the job id: known limit (agent-sdk cannot import
  cron-scheduler). Follow-up in the PR.
- run_now abort signal: the tool layer has no abort signal, and the existing `cron:runNow` RPC
  handler also calls without one. Follow-up in the PR.
- Nits (create default can be empty, write-tool names in four places, unexpected errors
  rethrown): follow-ups; no change in this PR.

# Live check: `agy --settings '{"toolPermission":"strict"}' acp` in `default` mode

Date: 2026-11-22. agy 1.5.14 (`initialize` agentInfo "Antigravity ACP Server"
1.5.14), model `gemini-4-hydrogen-low`, `@agentclientprotocol/sdk` 1.7.0 from
the repo `node_modules`. Windows 11, launched from PowerShell with `node`.
The workspace was an empty temp folder (`<user>/AppData/Local/Temp/agy-strict-*`),
deleted after the run. Billed turns: 2. No `agy.exe` process was left running
(`Win32_Process` count 0).

## Method

The probe script (scratchpad `agy-s2-probe/strict.mjs`, not kept in the repo):

1. Spawn `agy --settings {"toolPermission":"strict"} acp`, with the flag before
   the subcommand. `agy acp --settings` is rejected with the usage text, so
   this is the only form that starts.
2. Call `initialize`, then `session/new` (modes `default`, `accept-edits`,
   `auto`, `plan`; current `default`), then `session/set_mode default` and
   `session/set_config_option model gemini-4-hydrogen-low`.
3. Use a client that implements `session/request_permission`. It logs the full
   request and answers with the `reject_once` option. It also logs every
   `tool_call` and `tool_call_update`, and records whether
   `strict-probe.txt` exists at that moment.
4. Turn 1: "Create a file named strict-probe.txt containing the word hi."
5. Turn 2: "Run the shell command `echo strict-shell-probe` in the terminal
   and tell me its output. Do not create or edit any file."

## Results

### Turn 1: file write

| Time | Event |
| --- | --- |
| +4.4 s | `tool_call` kind `edit`, status `in_progress`, title "File strict-probe.txt"; file absent |
| +5.6 s | `tool_call_update` kind `edit`, status `completed`; file present |
| +7.3 s | prompt ended `end_turn`; `session/request_permission` count 0; workspace `["strict-probe.txt"]` |

agy replied "Created strict-probe.txt containing `hi`."

- **No `request_permission` arrived.** The write went through without asking.
- **The file exists afterwards.** Nothing was rejected, because nothing was asked.

### Turn 2: shell command

| Time | Event |
| --- | --- |
| +10.4 s | `tool_call` kind `execute`, title "echo strict-shell-probe", then `tool_call_update` status `pending` |
| +10.4 s | `session/request_permission` #1 (see below) |
| +10.4 s | client answered `deny` (`reject_once`); `tool_call_update` status `failed` |
| +10.4 s | prompt ended `end_turn`, empty reply |

The request:

```json
{
  "toolCall": {
    "kind": "execute",
    "title": "echo strict-shell-probe",
    "status": "pending",
    "rawInput": {
      "CommandLine": "echo strict-shell-probe",
      "WaitMsBeforeAsync": 5000,
      "toolSummary": "Echo strict-shell-probe"
    }
  },
  "options": [
    { "optionId": "allow", "name": "Allow", "kind": "allow_once" },
    { "optionId": "deny", "name": "Deny", "kind": "reject_once" }
  ]
}
```

- **The shell command asked first.** Rejecting it failed the tool call, and the command did not run.

### What the agy log shows

agy wrote the ACP server log of this run to `<user>/.gemini/antigravity-cli/log/acp-server-*.log`.

- It records `mode set to default`, the model switch, and the app data
  directory (`cliDir=""`).
- It has no line about `--settings`, `toolPermission` or `strict`. The probe
  therefore cannot show whether `agy acp` loaded the `--settings` value at
  all.

## Control: stock setting (no turn spent)

The TASK_2026_2297 live test of 2026-11-21 is recorded in
`libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts`
lines 83-88 (added in f121bc744). Under the stock `toolPermission`, `default`
mode wrote a workspace file with no `session/request_permission`. The
2297 records hold no stock-setting shell-command result, so this probe
cannot tell whether `strict` caused the shell prompt. The 1.5.14 changelog
says `default` asks before commands "per your permission settings".

## Conclusion

The `--settings` value before `acp` does not make agy 1.5.14 ask before
each file write in ACP `default` mode. The write went through exactly as
under the stock setting. Shell commands do send `session/request_permission`
with allow-once and reject-once options, and a reject stops the command.

So the `--settings` route does not give Manual mode per-write approval.
Two things stay unknown: whether `acp` ignores `--settings`, and whether
`strict` itself does not cover in-workspace edits over ACP. Telling them
apart would need a turn with `toolPermission: strict` in the user's own
`settings.json`. That would write the user's global agy settings, a choice
reserved for the user. No code was changed.

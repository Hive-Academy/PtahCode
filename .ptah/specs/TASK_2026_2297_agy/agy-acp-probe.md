# agy ACP probe: chat instructions and file content (lane A)

Date: 2026-11-21. Binary: Antigravity CLI `agy` 1.5.14 (`agy acp`, Windows).
Model for the paid run: `gemini-4-hydrogen-low` only. Two prompts in total.

## Question

How does a Ptah chat deliver its instructions (system prompt) to an `agy acp`
session, and does a `resource_link` built from a host path reach the agent?

## Static evidence

- `initialize` advertises the hook:
  `agentCapabilities._meta.antigravity.systemPrompt.append: true`
  (fixture `libs/backend/acp-runtime/src/lib/__fixtures__/antigravity-p2-handshake.ndjson`).
- `agy acp --help` documents no system-prompt flag.
- Strings in the agy 1.5.14 binary name the request-side shape and its
  validation:
  - `Ignoring unsupported systemPrompt format in _meta.antigravity (expected object, got %T)`
  - `Ignoring invalid systemPrompt in _meta.antigravity: missing 'append' key`
  - `Ignoring invalid systemPrompt in _meta.antigravity: 'append' key must be a string, got %T`

  So the client sends `_meta.antigravity.systemPrompt.append: "<text>"`; the
  text is appended to agy's own system prompt. Any other shape is ignored.

## Live probe

Spec: `libs/backend/acp-runtime/src/lib/live/agy-chat-runtime.live.spec.ts`
(gated, `PTAH_LIVE_AGY=1`). It opens a session through
`createAcpProviderSessionRuntime` with `antigravityAcpProfile`, permission
`ask`, a temp working directory and the model above.

1. `session/new` carried
   `_meta: { antigravity: { systemPrompt: { append: "End every reply with the exact token MARMALADE-58." } } }`
   and no prompt prefix. Prompt: "Say hello in three words." The reply ended
   with `MARMALADE-58`. Result: the hook is honoured on `session/new`.
2. Prompt: "What is the code word in the attached file? Reply with the code
   word only." plus a `resource_link` whose URI came from `pathToFileURL` of
   the temp file's Windows path (`file:///C:/Users/dev/AppData/Local/Temp/.../note.txt`
   shape). The reply was the file's code word. Result: agy reads a
   `file://` resource link from a Windows path.

Outcome: 1 test passed, no `error` events.

## Decision

- Antigravity: instructions go in `session/new` `_meta.antigravity.systemPrompt.append`
  when `initialize` advertises `systemPrompt.append: true`
  (`antigravityInstructionsMeta`).
- Fallback, and every profile without `instructionsMeta` (Grok, later
  OpenCode): a `<ptah-session-instructions>` block in front of the first
  prompt of a new session.
- A resumed or loaded session never receives the instructions again.

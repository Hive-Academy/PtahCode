# B5a revision round 1

1. Explicit output-style selections now use the same normalizer as persisted selections. Blank and `default` bypass discovery even when a different style is stored. Names are trimmed before discovery. See `output-style-session-activation.service.ts:165` and `output-style-session-activation.service.spec.ts:98`.
2. Full prompts assert that the style name and body are mutually exclusive before resolution. Ambient runs retain the SDK flag when prompt injection is unavailable. Named runs whose activation service or admitted resources are unavailable emit a warning and omit the unresolved style. Matching named resources can inject the body, which suppresses the flag. See `sdk-query-options-builder.ts:1448` and `sdk-query-options-builder.spec.ts:1556`, `:3155`.
3. Inactive main-chat resume, continue, and slash relaunch request `preset: 'enhanced'` on Claude SDK runs with enabled, nonblank guidance. The workspace resolver supplies guidance only when enabled. Continue and slash use the available surface/profile flags and child registry. See `chat-session.service.ts:3510`, `chat-slash-command-router.service.ts:420`, `chat-session.ptah-ui-flag.spec.ts:221`, and `chat-slash-command-router.accounts.spec.ts:215`.
4. The legacy opt-out inference now requires a nonblank saved prompt. Whitespace-only legacy state can enable newly generated guidance. See `enhanced-prompts.service.ts:746` and `enhanced-prompts.service.spec.ts:1742`.
5. The environment probe handles synchronous launch exceptions, forwards the session abort signal, and keeps the two-second git timeout. Shell names are trimmed, with `ComSpec` and then `unknown` as fallbacks. See `sdk-query-options-builder.ts:1117` and `sdk-query-options-builder.spec.ts:1620` for ENOENT, abort, exit 128, timeout, and synchronous throw cases.
6. Restored the skill shorthand, they/them default, and private-details guidance. The assembled static prompt is 10,210 characters against the 16,000-character budget. See `ptah-full-prompt.ts:17` and `:25`.
7. Added focused coverage for built-in and named style decisions, phase and skill fallback, pre-resolved bodies, named resources reaching the builder, Apps/child/handoff exclusions, write rollback and serialization, and the SDK boundary and static prompt stability. A dedicated case exercises the localhost preset route with a pre-resolved global body. See also `output-style-session-activation.service.spec.ts:106`, `sdk-query-options-builder.spec.ts:1576`, `:1593`, `session-query-executor.accounts.spec.ts:1092`, `chat-session-agent-child.spec.ts:903`, `:1016`, `enhanced-prompts.service.spec.ts:333`, `:1743`, and `ptah-full-prompt.spec.ts:7`.

## Files changed

- `libs/backend/agent-sdk/src/lib/helpers/` — `sdk-query-options-builder.ts`, `sdk-query-options-builder.spec.ts`, `session-lifecycle/session-query-executor.accounts.spec.ts`
- `libs/backend/agent-sdk/src/lib/prompt-harness/` — `ptah-full-prompt.ts`, `ptah-full-prompt.spec.ts`
- `libs/backend/agent-generation/src/lib/services/enhanced-prompts/` — `enhanced-prompts.service.ts`, `enhanced-prompts.service.spec.ts`
- `libs/backend/output-styles/src/lib/` — `output-style-session-activation.service.ts`, `output-style-session-activation.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/` — `chat-session.service.ts`, `chat-session.ptah-ui-flag.spec.ts`, `chat-session-agent-child.spec.ts`, `chat-slash-command-router.service.ts`, `chat-slash-command-router.accounts.spec.ts`

## Tools

The Ptah dependency graph was still indexing. Used Ptah grep where the index returned matches and PowerShell and ripgrep for targeted worktree reads. Native Codex skill discovery exposed no matching lane skill. Read the repository's agent-lanes skill from `.claude/skills`.

## Checks

| Check | Actual result |
| --- | --- |
| Shared dependency readiness | Failed after all 15 one-minute polls. At the last poll, `D:/projects/PtahCode/node_modules/@angular-eslint/eslint-plugin/package.json` existed and `D:/projects/PtahCode/node_modules/.bin/jest.cmd` was still absent. |
| Focused Jest for output-styles, agent-generation, agent-sdk, and rpc-handlers | Blocked by the dependency gate. No Jest invocation ran. |
| `npx tsc --noEmit --project <project>/tsconfig.lib.json` for the four changed projects | Blocked by the dependency gate. No TypeScript invocation ran. |
| `npx eslint <changed files>` | Blocked by the dependency gate. No ESLint invocation ran. |
| Static prompt size | Measured the rendered prompt using Node's TypeScript stripping with the current shared tool-guidance renderer. **10,210 / 16,000 characters**. |

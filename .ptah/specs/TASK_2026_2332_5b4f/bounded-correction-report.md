# Bounded correction report

| Item | Fix file:line | Test title |
|---|---|---|
| 1 | `nav/inspect.ts:45` | `lists bounded workspace glob paths with correct empty and continuation output`; `uses the default workspace excludes for list walks`; `normalizes safe list pattern %s before provider search`; `accepts a second registered workspace root` |
| 2 | `glob-pattern-validation.ts:10`; `protocol-dispatcher.ts:1182`; `nav/inspect.ts:113` | `rejects unsafe search pattern %s before walking`; `rejects unsafe list pattern %s before listing`; `passes valid search pattern %s through to the provider`; `normalizes safe list pattern %s before provider search` |
| 3 | `nav/grep.ts:508` | `uses type when glob is explicitly undefined and validates type entries`; `accepts Grep native aliases and emits the alias note`; `clamps head_limit and gives clear validation errors` |
| 4 | `cli-adapter.utils.ts:451` | `has one stable canary and the required tool table` |
| 5 | `tool-description.builder.ts:507` documents the existing clamp; canonical `maxLines` handling was unchanged. | `keeps the eager set at its measured size` |

## Verification

- **vscode-lm-tools Jest:** 12 suites; 9 passed, 3 failed only at the known Windows symlink creation `EPERM` cases; 872 passed, 21 skipped, 3 failed of 896 tests; 4 snapshots passed. Log: `.ptah/tmp/fix3-vscode-lm-tools.log`.
- **shared Jest:** 1 suite passed; 76 passed, 0 failed. Log: `.ptah/tmp/fix3-shared.log`.
- **cli-agent-runtime Jest:** 1 suite passed; 119 passed, 0 failed. Log: `.ptah/tmp/fix3-cli-agent-runtime.log`.
- **agent-sdk Jest:** 1 suite passed; 7 passed, 0 failed. Log: `.ptah/tmp/fix3-agent-sdk.log`.
- **TypeScript:** `npx.cmd tsc --noEmit -p` passed for lib and spec tsconfigs of vscode-lm-tools, shared, cli-agent-runtime, and agent-sdk (8 configurations).
- **ESLint:** `npx.cmd eslint` on changed tracked files and untracked library TypeScript files; 0 errors, 105 warnings overall, 0 warnings on lines added in `git diff main -U0`.
- **Caps:** the eager tool definition suite passed with its existing 26,792 character cap. The description change remains inside that cap. The existing lane policy byte budget assertion (3,400 bytes) passed; the policy remains within the requested 3,500 byte ceiling. The 400 line clamp is documented in the tool description.

## Not done

None. The only Jest failures are the three expected Windows symlink `EPERM` tests noted above.

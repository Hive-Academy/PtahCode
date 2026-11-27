# Batch 4 — Antigravity lane permission and attribution

Spawn and resume parent permission lookups consult the registered provider-session adapter when Codex does not own the caller. PtahAPIBuilder uses the same provider-session lookup to resolve a bound tab to a live session ID for lane parent identity and attribution. An unresolved bound spawn is capped to Plan. A resume can retain its persisted ceiling when the parent is no longer live.

Regression coverage includes each live level, an unknown caller, the resume fallback, and PtahAPIBuilder's Antigravity tab-to-session and parent-level callbacks.

Verification command

```sh
npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools
```

Lint and typecheck passed for both projects. The complete CLI runtime test target passed. The VS Code tools run passed 134 suites and reported one compile failure in the new builder test harness. The harness now supplies the optional constructor arguments and spies on the shared resolver. The focused retry passed all 36 builder tests.

```sh
npm run verify -- -t test -p @ptah-extension/vscode-lm-tools -- --output-style=static --testPathPatterns=ptah-api-builder.service.spec.ts --runInBand
```

Commit `0749c6db6`.

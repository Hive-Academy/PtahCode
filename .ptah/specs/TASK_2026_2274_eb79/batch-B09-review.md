# B09 review - bots prefix gate

**Verdict: APPROVED.** **Score: 10/10.**

Review family: claude (coordinator, in-process). Implementer family: codex.

## Findings

None.

## Checks

- `libs/backend/vscode-core/src/messaging/rpc-handler.ts:73` adds `'bots:'` in the same style as
  the other prefixes. No handler, manifest or `rpc.types.ts` entry is added, so no bot method is
  active until B08.
- `bots-prefix.spec.ts` proves that `bots:list` registers and dispatches. It also proves that
  `bot:x`, `botsx:y`, `BOTS:list` and `malicious:hack` are rejected and not registered.
- Coordinator: `npm run verify -- -t lint,typecheck -p vscode-core` (2 tasks succeeded) and
  `npm run verify -- --related -p vscode-core` (1 task succeeded).
- Lane: manifest and allowlist specs (45 tests) and the CLI surface spec (20 tests) pass unchanged.

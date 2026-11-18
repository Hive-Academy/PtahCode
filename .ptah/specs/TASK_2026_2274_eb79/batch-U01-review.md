# Batch U01 review — bots-ui configuration and BotsClient

Review family: claude (implementer: codex)

Score: 9/10
Verdict: APPROVED

## Defects

1. Low, optional: `libs/frontend/bots-ui/src/lib/bots-client.ts:14` — the doc comment says the client
   retains error codes, but the class has no code that does this. The retention comes from `RpcResult`
   (`errorCode`). Fix: reword to "Returns RpcResult unchanged so errorCode stays available."
   This is a comment only. It does not block approval.

No blocking defect found.

## Evidence for each acceptance criterion

- Strict flags: `tsconfig.json:6-10,15-21` set strict, noImplicitOverride, noImplicitReturns,
  noFallthroughCasesInSwitch, strictTemplates, strictInjectionParameters, strictInputAccessModifiers.
  The file is identical to `cron-scheduler-ui/tsconfig.json`.
- Tags: `project.json:7` has `scope:webview`, `type:feature`, `platform:angular`. This matches the reference.
- Alias: `tsconfig.base.json:37` maps `@ptah-extension/bots-ui` to `libs/frontend/bots-ui/src/index.ts`.
  The barrel file does not exist yet. This is correct for this batch (no barrel allowed).
- nx.json: lines 224 and 315 include `libs/frontend/bots-ui/**/*`.
- Jest: `jest.config.ts:4` reuses `<rootDir>/../ui/src/test-setup.ts`. `tsconfig.spec.json:11` lists the
  same file. No generated setup file exists.
- Method names: all 11 strings in `bots-client.ts` (list, get, create, update, set-enabled, archive,
  restore, delete, preview-import, upload-avatar, get-avatar) match the 11 names in
  `bots-rpc.handlers.ts:14-24` and the keys in `rpc-bots.schemas.ts:322-358`.
- Param shape: each method uses `BotsRpcMethods[<method>]['params']` (z.input). This matches the wire
  contract and keeps schema defaults.
- Result types: each result type matches the schema map. Writes use BotsWriteResult (create, update,
  set-enabled, archive, restore). Delete uses BotsDeleteResult. The other results map one to one.
- Error codes: the client returns `Promise<RpcResult<...>>` from `rpc.call` without change.
  `RpcResult.errorCode` is preserved.
- No `any`, no `as unknown as`, no `!`. No page, store or barrel import.

## Check results

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`: passed, no output.
- `npx eslint libs/frontend/bots-ui/jest.config.ts libs/frontend/bots-ui/src/lib/bots-client.ts`: passed,
  no output.
- Not run (lane rule): Jest, Angular template typecheck. No spec or template exists in this batch.

## Residual notes

- `uploadAvatar` and `getAvatar` pass any size of payload through the client. Size limits belong to the
  server schema and to a later UI batch.
- The `tsc` run uses plain tsc, not `ngc`. The project `typecheck` target uses `ngc`. The file has no
  Angular template, so the risk is low.

Review family: claude (implementer: codex)

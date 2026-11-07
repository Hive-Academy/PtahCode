# rpc-handlers main-green followups

## Baseline

Scoped command: `PTAH_VERIFY_SLOTS=1 PTAH_VERIFY_MIN_FREE_GB=8 npm run verify -- -p rpc-handlers` (PowerShell environment form). Nx lint and typecheck: **2/2 passed**. Jest: **13 suites failed, 225 passed; 36 tests failed, 8 skipped, 6252 passed**. Full Jest output: `C:\Users\abdal\.nx\d60e02896ae18ad9\cache\terminalOutputs\812797723107355318`.

## Failure analysis

| Failing suite | Root cause and evidence | Verdict and fix |
|---|---|---|
| `skills-synthesis-rpc.handlers.spec.ts` | At line 3270, root expected the fixture repo but got the parent temp directory. Fixture at 3255 had `.git` only; the temp parent contains `.ptah`. Shared root resolver checks `.ptah` before `.git` (`harness-sync/workspace-root.ts:79-81`, e107e6f893). | Test fixture isolation; added repo `.ptah`. Spec history: 3e0d1bd96. |
| `plugin-rpc.handlers.spec.ts` | Same ancestor marker collision at line 1681; fixture at 1661 had `.git` only. | Test fixture isolation; added repo `.ptah`. Spec history: 4f6bca120. |
| `wizard-generation-checkpoint.service.spec.ts` | `isTrusted` at line 295 rejects the fixture root because its resolver sees the ancestor temp `.ptah` (`wizard-generation-checkpoint.service.ts:353`). | Test fixture isolation; added root `.ptah`. Spec history: e55e7c962. |
| `install-scope-migration.fixtures.spec.ts` | Three assertions at 271, 337, 390 initially receive `completed` because workspace normalization misses the fixture reconciler's per-workspace plans. Fixture `makeGitWorkspace` at 120 had `.git` only beneath temp parent `.ptah`. Follow-up Jest reached the plans and exposed Windows ledger-key expectations at 278/344; product serializes these with POSIX slashes. | Test fixture isolation and expectation; added `.ptah` to workspaces and compare ledger keys with POSIX serialization. Spec history: 8fd439795. |
| `chat-session-policy-roots.spec.ts` | At line 248, expected mixed slash strings while product returns physical Windows paths. Follow-up Jest reached a directory alias at 271 whose symlink creation raises `EPERM` on Windows. | Test fixture; use `join` for workspace and child paths and a Windows junction for the directory alias. Spec history: 8cdb176b7. |
| `chat-session-resume-activate.spec.ts` | At line 367, expected `.../my-repo/ancestor`, actual normalized `...\\my-repo\\ancestor`. | Test fixture; use `join` for root and stored ancestor. Spec history: a3c2990dc; service history: d7375a01d. |
| `chat-session-session-folder.spec.ts` | At line 369, expected mixed slash ancestor; actual normalized Windows path. | Test fixture; use `join` for workspace and child. Spec history: 805cfcbcb; service history: d7375a01d. |
| `plugin-rpc.handlers.session-notice.spec.ts` | At line 129, fixture hardcodes `/tmp/...`; product resolves that to a Windows drive path. | Test fixture; use `resolve` and `join`. Spec history: 78bda4795. |
| `install-scope-migration.service.spec.ts` | Symlink setup at 509 raises `EPERM` on this Windows host. `chmod(0o000)` and `chmod(0o555)` do not deny access on Windows, so assertions at 995 and 1436 fail. Ledger path keys at 1041/1076/1093 are POSIX serialized by product. | Test environment/fixture; use a junction for the root alias, inject nonregular Dirent for file link and EACCES for access and atomic ledger write on Windows, and expect POSIX ledger keys. Spec history: d720768ec. |
| `skills-sh-source-root.service.spec.ts` | File `fs.symlink` at 779 raises `EPERM` before ownership verifier runs. | Test environment/fixture; inject the nonregular Dirent returned by a file link on Windows, retain real symlink on POSIX, and use junction for root alias. Spec history: 557eff874. |
| `chat-session-agent-child.spec.ts` | Directory `symlinkSync` at 403 raises `EPERM` before child launch logic runs. Follow-up Jest exposed five expectations comparing mixed slash fixture constants with normalized Windows paths (415/449/492/508/715). | Test environment/fixture; use a junction on Windows and `join` for root, worktree, app, and handoff fixture paths. Spec history: 8cdb176b7; service history: d7375a01d. |
| `session-folder.spec.ts` | Directory `symlink` at lines 88 and 95 raises `EPERM`; Windows chmod at 133 cannot deny access. | Test environment/fixture; use junctions and inject access EACCES on Windows. Spec history: 0547874dc. |
| `file-view-rpc.handlers.spec.ts` | File link creation in policy mock at line 146 raises `EPERM`; handler catches it and returns `unreadable` instead of reaching the expected outside-root check. | Test environment/fixture; inject escaped `realpath` for the opened-file verification branch on Windows; retain real link on POSIX. Spec history: 3ec146e52. |

## Files changed

- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-policy-roots.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-resume-activate.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-session-folder.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/plugin-rpc.handlers.session-notice.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/skills-synthesis-rpc.handlers.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/plugin-rpc.handlers.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-checkpoint.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/install-scope/install-scope-migration.fixtures.spec.ts`
- `libs/backend/rpc-handlers/src/lib/install-scope/install-scope-migration.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/skills-sh/skills-sh-source-root.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/session-folder.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-agent-child.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/file-view-rpc.handlers.spec.ts`

## Decisions

- Product path normalization is retained; test expectations now use the host path API.
- `.ptah` fixture markers make the intended workspace root explicit under an ambient temp `.ptah` marker. The shared resolver's marker precedence is outside this lane's scope.
- The ambient ancestor marker is `C:\Users\abdal\AppData\Local\Temp\.ptah`, which contains harness manifests and MCP output written by Ptah; it was left intact, and fixture roots declare their own `.ptah` marker for hermetic resolution.
- Windows directory aliases use junctions. File-link and permission tests inject the filesystem result at the product boundary on Windows while POSIX continues to use real symlinks and chmod.
- Did not weaken assertions, skip tests, alter timeouts or baselines, or touch indexing files owned by another lane.
- No installed local Jest skill matched this work; skill discovery was available and checked.

## Final suite outcome

The plain scoped verify completed with exit code 0. Its Jest output is `C:\Users\abdal\.nx\d60e02896ae18ad9\cache\terminalOutputs\2139676226739650689`.

| Initially failing suite | Status | Post-change evidence |
|---|---|---|
| `skills-synthesis-rpc.handlers.spec.ts` | Fixed | Passed in full Jest run; fixture marker at `handlers/skills-synthesis-rpc.handlers.spec.ts:3255`. |
| `plugin-rpc.handlers.spec.ts` | Fixed | Passed in full Jest run; fixture marker at `handlers/plugin-rpc.handlers.spec.ts:1661`. |
| `wizard-generation-checkpoint.service.spec.ts` | Fixed | Passed in full Jest run; fixture marker in `handlers/wizard-generation-checkpoint.service.spec.ts`. |
| `install-scope-migration.fixtures.spec.ts` | Fixed | Focused Jest exposed POSIX ledger keys at 278/344; after key fix, passed in full run. |
| `chat-session-policy-roots.spec.ts` | Fixed | Focused Jest exposed directory symlink `EPERM` at 271; junction fix passed in full run. |
| `chat-session-resume-activate.spec.ts` | Fixed | Passed in focused and full Jest runs. |
| `chat-session-session-folder.spec.ts` | Fixed | Passed in focused and full Jest runs. |
| `plugin-rpc.handlers.session-notice.spec.ts` | Fixed | Passed in focused and full Jest runs. |
| `install-scope-migration.service.spec.ts` | Fixed | Focused Jest exposed notice ledger key at 1548; after key fix, passed in full run. |
| `skills-sh-source-root.service.spec.ts` | Fixed | Windows nonregular entry and junction cases passed in focused and full Jest runs. |
| `chat-session-agent-child.spec.ts` | Fixed | Focused Jest exposed five mixed-separator expectations; normalized fixtures passed in full run. |
| `session-folder.spec.ts` | Fixed | Windows junction and access-denial cases passed in focused and full Jest runs. |
| `file-view-rpc.handlers.spec.ts` | Fixed | Windows escaped-realpath branch passed in focused and full Jest runs. |

## Verification and remaining work

Final command: `PTAH_VERIFY_SLOTS=1 PTAH_VERIFY_MIN_FREE_GB=8 npm run verify -- -p rpc-handlers`.

| Check | Result |
|---|---|
| Lint | **1 passed, 0 failed** (`NX 2 tasks: 2 succeeded`, combined lint/typecheck phase) |
| Typecheck | **1 passed, 0 failed** (same phase) |
| Jest | **238 suites passed, 0 failed; 6,288 tests passed, 0 failed, 8 skipped** (`2139676226739650689`) |

The first focused verify was cancelled before execution while queued behind other lanes. The second focused command passed `--testPathPatterns` through the wrapper to all targets: lint and typecheck rejected that Jest-only option (logs `17422401135779118336` and `7579997504873428934`). Its Jest phase ran 14 suites: 10 passed, 4 failed; 512 tests passed, 9 failed, 1 skipped (log `11018674404401247498`). Those remaining fixture failures were corrected before the passing plain scoped verify.

No product change outside this lane was needed. On Windows, `handlers/file-view-rpc.handlers.spec.ts:139-174` exercises the escaped-realpath guard through an injected filesystem result; the physical file-symlink race itself is exercised by the same test on POSIX, where creation is permitted. The existing eight skipped tests were not changed.


## Revision 1

Finding 7 review: Windows filesystem injections now identify the exact path that the real OS condition would affect. Unrelated calls continue to the captured real implementation. POSIX cases still use real file links and permissions.

| Injection | Before | After | Evidence |
|---|---|---|---|
| `session-folder.spec.ts` child `access` denial | First `access` call failed regardless of path. | Only the saved child path rejects with `EACCES`; all other paths call real `access`. | The same `SESSION_FOLDER_UNAVAILABLE` assertion is retained. |
| `session-folder.spec.ts` Windows mode `stat` | First `stat` call received synthetic mode. | Only the child path receives mode `0o40666`; all other paths call real `stat`. | The readable-directory assertion is retained. |
| `file-view-rpc.handlers.spec.ts` escaped `realpath` | First `realpath` call returned the outside path. | Only the opened inside target returns the outside path; root and all other paths use real `realpath`. | Both RPC methods retain `outside-roots` and `externalOpenAllowed: false` assertions. The physical file-link race remains POSIX-only; Windows exercises the escaped-realpath product branch. |
| `skills-sh-source-root.service.spec.ts` nonregular `Dirent` | Replaced an entry by directory and basename. | Replaces only an entry whose full path matches the named link; unrelated directories and entries pass through real `readdir`. | Both unproven/not-regular-file assertions are retained. Windows covers the verifier branch, while POSIX covers a real file symlink. |
| `install-scope-migration.service.spec.ts` nonregular `Dirent` | Replaced an entry by directory and basename. | Replaces only the full named link path; unrelated directories and entries pass through real `readdir`. | The ledger and retirement assertions are retained. Windows covers the verifier branch, while POSIX covers a real file symlink. |
| `install-scope-migration.service.spec.ts` metadata `lstat`, ledger `mkdirSync`, workspace `stat` | Already matched the metadata, migrations directory, or workspace path respectively. | No injection change needed; each forwards other paths to the real function. | Reviewed the three spy implementations. |
| `chat-session-agent-child.spec.ts` directory alias | Real directory link on POSIX and junction on Windows. | No injection used. | Reviewed the alias fixture; physical identity assertion remains. |

### Revision 1 verify

- Focused command: `PTAH_VERIFY_SLOTS=1 PTAH_VERIFY_MIN_FREE_GB=8 npm run verify -- -t test -p rpc-handlers -- --testPathPatterns=(session-folder|file-view-rpc.handlers|skills-sh-source-root.service|install-scope-migration.service)\.spec\.ts$` — exit 0; **5 suites passed, 174 tests passed, 0 failed**. Nx terminal output: `C:\Users\abdal\.nx\d60e02896ae18ad9\cache\terminalOutputs\9526244486484505759`.
- Scoped command: `PTAH_VERIFY_SLOTS=1 PTAH_VERIFY_MIN_FREE_GB=8 npm run verify -- -t lint,typecheck -p rpc-handlers` — lint succeeded; typecheck failed on `libs/backend/rpc-handlers/src/lib/handlers/indexing-rpc.handlers.ts:80`, TS2367 (`IndexingPipeline` compared with `"both"`). This file is owned by another lane and was not edited here. Typecheck output: `C:\Users\abdal\.nx\d60e02896ae18ad9\cache\terminalOutputs\10226832133523771469`.
- The Windows Dirent proxies still demonstrate only the verifier's `not-regular-file` branch. A real file-symlink path is demonstrated on POSIX, where creation is permitted; Windows file-link privilege is absent on this machine.


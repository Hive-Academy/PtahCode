# Code logic re-review: B7b

Score: 38/100. Verdict: **Blocker**. The hash check rejects changed bytes, but the inner install already propagates them. The score is above a foundation failure because the handler checks hashes and reports partial progress; it is below a sound pass because consent can be bypassed during propagation.

| Check | Result | Evidence |
| --- | --- | --- |
| a. Mismatch cleanup | **Fail** | The mismatch branch deletes the installed path, invalidates caches, and throws a typed `RpcUserError` before consent or selection (`setup-rpc.handlers.ts:1311-1328`). It checks a resolved path under the resolved plugins root (`:1305-1310`). But `skillsSh:install` has already propagated the changed bytes (`skills-sh-rpc.handlers.ts:417-448`), so deletion does not prove that active provider copies were removed. |
| b. Partial install | **Pass** | The catch stores the failed skill and reason, then breaks (`setup-rpc.handlers.ts:1330-1341`). A first failure returns the empty list (`:1343-1344`). A later failure still saves the earlier slugs and propagates them (`:1345-1367`); the later failure case is tested (`setup-rpc-skill-install.spec.ts:251-285`). |
| c. Parse and logs | **Pass** | Zod parses `result.data` (`setup-rpc.handlers.ts:1287-1291`). The loop catch sends an `Error` to `logger.error` (`:1330-1334`). No silent loop catch was found. |
| d. Preview binding | **Fail** | `decisions.md` says the server stages and hashes submitted content, then hashes the installed copy. Code does both (`setup-rpc.handlers.ts:1256-1281,1311`). This does not close the race: the inner install propagates before that second hash check (`skills-sh-rpc.handlers.ts:431-448`). |
| e. Other risks | **Fail** | The inner install replaces an existing slug (`skills-sh-source-root.service.ts:328-334`). On mismatch the wizard deletes that slug (`setup-rpc.handlers.ts:1319`), so a prior install is lost. The catch also returns raw `error.message` to the caller (`:1335-1339`); CLI or file errors may include local paths. |

## Findings

- **Blocker:** An unapproved changed skill can become active before the hash check. `skillsSh:install` propagates at `skills-sh-rpc.handlers.ts:431-448`; the wizard compares hashes only after its return at `setup-rpc.handlers.ts:1311`. The mismatch cleanup removes the source path but does not run a new propagation, so provider copies can remain active.
- **Serious:** An existing skill is removed on a failed update. The source root installer deletes the old slug before moving the new one (`skills-sh-source-root.service.ts:328-334`); mismatch cleanup deletes the new slug (`setup-rpc.handlers.ts:1319`). The old bytes are not restored. Existing metadata can still list the removed slug (`skills-sh-source-root.service.ts:336-356`).
- **Minor:** The failed result exposes raw error text (`setup-rpc.handlers.ts:1335-1339`). A stage or filesystem error can reveal a local path. Use fixed client copy and keep details in the log.

## Verification

Command: `npm run verify -- -t test -p @ptah-extension/rpc-handlers` (PowerShell output filtered to last 40 lines). Result: exit 0; Nx reported **1 task succeeded, 1 cached** after the verifier lock released. The 40-line tail did not show the "Running target test for 1 projects" header because Jest config warnings filled the tail, so that exact header was not independently visible. This was a cache hit, not a fresh test run. The mocked install in `setup-rpc-skill-install.spec.ts:69-80` does not test the inner propagation race.

## Decisions

- Treat the inner propagation as active use of the installed bytes. Evidence: `skills-sh-rpc.handlers.ts:431-448`. This is reversible by moving hash validation before propagation or delaying propagation until validation.

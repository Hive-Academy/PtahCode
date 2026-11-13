# Code logic review: B7c

Score: 88/100. Verdict: **Pass with notes** (Approve).

The earlier blocker is closed. Unapproved staged bytes are no longer propagated. `verifyStaged` runs after the staged content hash and before mkdir, rm, move, metadata write, and provider propagation. A rejection leaves the old slug and its metadata byte-identical.

Reviewed commit `e96e2fc72` on disk. Backend files match that commit. The decision paragraph is a worktree edit on top of the commit. Its text matches the code.

| Check | Result | Evidence |
| --- | --- | --- |
| 1. Unapproved bytes stay inactive | **Pass** | The source-root installer hashes the staged tree, then calls `verifyStaged`, then creates the skills directory, removes the old slug, moves the staged slug, and writes metadata (`skills-sh-source-root.service.ts:324-365`). The handler propagates only after that install returns success (`skills-sh-rpc.handlers.ts:435-449`). A throw from the verifier skips those writes. The `finally` block deletes only the staging directory (`skills-sh-source-root.service.ts:390-392`). The rejection test keeps the old `SKILL.md` and metadata byte-identical (`skills-sh-source-root.service.spec.ts:171-207`). |
| 2. Mismatch, missing script consent, and a foreign slug are rejected | **Pass** | The wizard callback rejects a slug list that is not exactly the requested skill (`setup-rpc.handlers.ts:1261-1266`), a submitted hash that differs from `computeContentHash` of the staged directory (`:1268-1277`), and a script skill with neither a matching record nor stored consent (`:1279-1287`). `computeContentHash` returns lowercase hex (`skill-consent.service.ts:82-93`). The compare lowercases the submitted hash (`setup-rpc.handlers.ts:1273`). The same staged directory is the directory that moves (`skills-sh-source-root.service.ts:333-342`). |
| 3. Client text is safe | **Pass** | `SkillsShRpcHandlers.install` rethrows `RpcUserError` (`skills-sh-rpc.handlers.ts:469-472`). The wizard puts that message in `reason` and uses `Skill install failed.` for every other error (`setup-rpc.handlers.ts:1301-1306`). A test feeds an error that contains a local path and expects the fixed sentence (`setup-rpc-skill-install.spec.ts:279-316`). |
| 4. Partial progress | **Pass** | The loop records `failedSkill` and `reason`, then breaks (`setup-rpc.handlers.ts:1296-1308`). An empty `installed` list returns `success: false` and does not select or propagate (`:1311-1312`). A later failure still selects and propagates the earlier slugs and returns `success: false` with `failedSkill` and `reason` (`:1313-1335`). The partial test covers that path (`setup-rpc-skill-install.spec.ts:266-322`). `logger.error` receives a real `Error` (`setup-rpc.handlers.ts:1297-1299`). |
| 5. Public install contract and `container.resolve` | **Pass** | `skillsSh:install` delegates to `install(params)` with no verifier (`skills-sh-rpc.handlers.ts:357-360`). The public test still expects the two-argument source-root call (`skills-sh-rpc.handlers.spec.ts:387-399`). `container.resolve(SkillsShRpcHandlers)` (`setup-rpc.handlers.ts:1252`) is acceptable. The same file already resolves collaborators through `resolveService` (`:180-182`). Electron registers the handler as a singleton (`apps/ptah-electron/src/di/phase-4-handlers.ts:213`), so the wizard uses the live instance. Constructor injection would match the composition-root rule more closely. It is not required for this fix. |
| 6. Tests prove checks 1-4 | **Pass** | Mismatch leaves the existing copy byte-identical, writes no consent record, and does not propagate (`setup-rpc-skill-install.spec.ts:194-228` and `skills-sh-source-root.service.spec.ts:171-207`). Script refusal returns the consent sentence and does not propagate (`setup-rpc-skill-install.spec.ts:158-169`). The first failure returns `installed: []` and the fixed reason (`:251-263`). The suite is not weaker. Old tests expected the inner install not to be called. That assertion no longer fits, because the verifier runs inside install. The new tests assert bytes, consent, propagation, and the fixed client text. Two branches have no direct test: a staged slug that differs from the request, and stored consent with no submitted record. |
| 7. Other risks | **Pass** | See notes. None re-open the blocker. |

## Findings

No Blocker. No Serious finding.

- **Note:** A skill with no consent record and no scripts is not bound to a preview hash (`setup-rpc.handlers.ts:1273-1288`). The decision requires a hash match for a submitted hash, and requires a record or stored consent only for script skills (`decisions.md:88-90`). A script package still fails closed when the record is absent and `canInstall` is false.
- **Note:** When the installer returns `success: false`, the wizard discards `result.error` and returns `Skill install failed.` (`setup-rpc.handlers.ts:1291-1306`). The handler already logs that error at warn level (`skills-sh-rpc.handlers.ts:439-445`). The client does not receive a path. This is the required client contract.
- **Note:** Two installs of the same slug can pass verification and then both remove and move the target. There is no install lock. This is a residual race. It does not let a failed hash check publish bytes.
- **Note:** `decisions.md` section "B7b consent preview binding" matches the new order. That paragraph is not inside commit `e96e2fc72`.

## Earlier blocker

Closed. The old path propagated inside `skillsSh:install` and hashed a second copy afterward. The wizard now passes a verifier into the shared install pipeline. The source-root service runs that verifier before it changes the live root. Provider propagation runs only after a successful return.

## Verification

Command: `npm run verify -- -t test -p @ptah-extension/rpc-handlers`

Result: exit 0. Fresh run, not a cache hit (`Cache: 0/1 hit`). Nx reported `Running target test for project @ptah-extension/rpc-handlers` and listed that one project. It then reported `Successfully ran target test for project @ptah-extension/rpc-handlers`. Run duration 6m 28s.

## Review method

Read the business-logic review command, then `git show e96e2fc72` and the current handler, installer, consent service, specs, and decision text. No source file was edited.

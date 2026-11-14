# B7 code-logic fixes

- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:1052` applies the registered skill selection relevance gate to recommendations.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:1134` validates resolved staged paths against their root and logs missing file errors separately from other failures.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:1295` compares the hash of the installed source-root skill with the staged, consented hash before recording consent or saving the selection.
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-consent.service.ts:74` logs scan and store read failures, rejects links and paths outside the package, and detects extensionless shebang scripts.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skill-install.spec.ts:166` covers changed bytes fetched during installation; the install fixture now writes an installed source-root skill.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skills-stubs.spec.ts:86` supplies the selection service in the recommendation fixture.
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-services.spec.ts:122` covers shebang detection.
- `apps/ptah-electron/src/di/rpc-surface.spec.ts:55` and `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts:175` assert consent-install RPC composition.

Verification: direct rpc-handlers library and spec TypeScript checks passed; three changed rpc-handlers Jest suites passed using the project config and one process; `npm run validate-skill` passed with 0 errors; `git diff --check` passed. The requested scoped `npm run verify` could not load Nx plugins because process spawn returned EPERM. The role census stopped at `git ls-files failed: undefined` in this environment. The normal Jest invocation also hit Nx plugin spawn EPERM.

No commit or push was made. Local skill discovery found no installed matching skill, so no skill could be loaded through the CLI skill mechanism.

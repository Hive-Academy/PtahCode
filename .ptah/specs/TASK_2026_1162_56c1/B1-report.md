# B1: Setup wizard skill RPC stubs

Implemented the four new skill RPC contracts, Zod request schemas, and handler registrations. Existing agent RPC registrations remain intact. Added a focused registration and validation spec.

## Files

- `libs/shared/src/lib/types/rpc.types.ts`: request/response contracts, supporting skill types, method registry entries, and runtime method names.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts`: four request schemas.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`: four typed handlers that validate input and return stubs.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc-skills-stubs.spec.ts`: registration, stub response, and invalid parameter assertions.

## Verification

- `npx ts-node --transpile-only tools/role-census/check-role-census.ts`: passed; no increases.
- `npm run validate-skill`: passed; 0 errors, 0 warnings.
- `npm run verify -- -p rpc-handlers,shared`: initial lint/typecheck phase had 3 passing tasks and a shared lint failure. The B1 lint errors were fixed; the run's long test phase was stopped after the known failure.
- `npx nx run-many -t lint typecheck -p rpc-handlers shared --parallel=1 --output-style=static`: shared lint and typecheck, plus rpc-handlers lint, passed (warnings only). Rpc-handlers typecheck is blocked by an unrelated concurrent B5 edit: `libs/backend/agent-generation/src/lib/services/skill-consent.service.ts:70` contains an unterminated string literal.
- Targeted Jest spec: 1 suite, 2 tests passed with `--coverage=false --maxWorkers=2`.
- `git diff --check`: passed.

Skill invocation was unavailable in this lane: the connected Ptah tool inventory exposes skill search for harness configuration, but no skill invocation mechanism.

I attempted to notify the parent session about the B5 syntax error through `ptah_agent_report`; delivery was refused because the parent inbox was full.

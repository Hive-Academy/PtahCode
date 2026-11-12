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
- `npm run verify -- -p rpc-handlers,shared`: pending shared verification slot.
- Targeted Jest spec: pending.
- `git diff --check`: passed.

Skill invocation was unavailable in this lane: the connected Ptah tool inventory exposes skill search for harness configuration, but no skill invocation mechanism.

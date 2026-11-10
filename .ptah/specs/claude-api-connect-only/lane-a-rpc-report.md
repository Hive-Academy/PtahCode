## Changed files

- `libs/shared/src/lib/types/rpc.types.ts`: Added the typed RPC contract and method-name registry entry.
- `libs/shared/src/lib/types/rpc/host-source-registry.baseline.ts`: Added the host method baseline entry.
- `libs/backend/rpc-handlers/src/lib/handlers/auth-rpc.schema.ts`: Added strict, trimmed Zod validation.
- `libs/backend/rpc-handlers/src/lib/handlers/auth/api-key-methods.ts`: Added secret-only write/delete and cache invalidation.
- `libs/backend/rpc-handlers/src/lib/handlers/auth-rpc.handlers.ts`: Registered the new method through the shared auth facade.
- `libs/backend/rpc-handlers/src/lib/handlers/auth-rpc.handlers.spec.ts`: Added write, delete, malformed input, cache, and isolation coverage.

## RPC contract

`auth:setDirectAnthropicApiKey`: params `{ apiKey: string | null }`; result `{ success: boolean; error?: string }`. A nonempty string is trimmed and limited to 512 characters. `null` deletes. Invalid requests return `{ success: false, error: 'Invalid API key request.' }`. Successful requests return `{ success: true }`. Store failures return a fixed message without the key.

## Registration and guards updated

`AuthRpcHandlers.METHODS`, facade registration, shared `RPC_METHOD_NAMES`, and host source baseline updated. Existing shared `auth:` allowlist prefix already covers it. Searched apps and other guard specs for `auth:setApiKey`; no additional enumerated sibling entry was found.

## Verification

`npm run verify -- -p rpc-handlers,shared`: lint/typecheck 4/4 passed. Test targets 0/2 passed: rpc-handlers 111 suites passed, 129 failed (2915 tests passed, 6 skipped) because Jest maps `marked` to missing `node_modules/marked/lib/marked.umd.js` in this worktree; shared 148 suites passed, 1 failed (4213 tests passed) because the concurrent `anthropic-api-lane-entry.spec.ts:25` has TS2345 (`string | undefined`). The new RPC spec was among suites blocked by the missing module.

## Decisions

Used the existing direct `apiKey` secret slot. This RPC does not change route settings, files, adapter state, or environment. Cache invalidation uses the direct Anthropic connection ID and auth status cache. Input and storage failures use fixed error text and never log the key.

## Open points

The focused RPC spec could not execute due to the missing `marked` module mapping; the shared provider spec failure belongs to the concurrent lane. The frontend and CLI lanes are implementing their corresponding behavior concurrently. Skill loader was unavailable in this CLI tool list; proceeded with repository patterns and native inspection. Investigation citations used for this implementation were checked against this worktree, including `auth:saveSettings` direct slot and cache behavior and `auth:setApiKey` result convention.

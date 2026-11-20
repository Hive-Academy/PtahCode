Verdict: APPROVED
Review family: claude (implementer: codex)

## Defects

1. Minor, `libs/shared/src/lib/types/rpc-bots.schemas.ts:195-198` (plan L143, L113-115). `BotsGetResultSchema.record` is `BotRecordSchema`, which is schema V2 only. `bots:get` with a `revision` can read an old immutable snapshot. Plan L115 says old snapshots stay in their original version. A V1 snapshot would fail result validation unless B03/B05 migrate it to V2 before the reply. Smallest correction: no change now. B03/B05 must migrate before the reply, or the result record must use `BotDefinitionSchema`. Record the choice in the B05 brief.

No Critical or Major defect found.

## Checked and correct

- Strictness: all objects use `z.strictObject`. Create and update reject client-set id, revision, origin, createdAt, archivedAt, enabled and executionAvailable (spec L121-135). Update rejects `source` (spec L223-231).
- Runtime union (plan L91-97): default carries no provider. Main and lane are strict. Mixed kinds are rejected. `cli:'ptah-cli'` is rejected. Id patterns match plan L97. Unknown providers, CLIs and ptah-cli ids parse and round-trip (spec L145-184). Model is trimmed, 1-200 chars. Effort is at most 64 chars.
- Avatar union (plan L103): icon allowlist of five lowercase names, image by UUID only. Path, URL and extra fields are rejected (spec L242-250).
- Origin: `wizard-generated` with optional `generationId` is allowed as a create hint only. Origin is not in the editable schema. `manual` is rejected as a hint.
- Version dispatch: `BotDefinitionSchema` is a discriminated union on `schemaVersion`. 0, 3, '2' and a missing version fail at the `schemaVersion` path. V1 has the legacy runtime, no avatar, no origin.
- Create defaults (runtime default, private memory, ask, empty skills) apply to create only. Update requires runtime. Defaults do not reach stored-row schemas.
- Error codes: the seven BOT_* codes are present in `rpc-error-codes.types.ts`. Existing codes are untouched.
- Registry: `RPC_METHOD_NAMES` and the method registry are unchanged. The diff shows only `index.ts` exports, the error codes and two aliases. `BotsRpcSchemas` holds the eleven DTO pairs only.
- `tsconfig.base.json`: only `@ptah-extension/bots` and `@ptah-extension/bots-ui` were added.
- DTO inference: `z.output` types, and `BotsRpcMethods` uses `z.input` for params. No `any`, `as unknown as` or non-null `!` in the three files (grep).
- File sizes: 83, 352 and 312 lines, all under 700.
- Avatar bytes: `BOT_AVATAR_MAX_BYTES` is 2097152, equal to the `0076_bots.ts` CHECK. Media types png/jpeg/webp match the DB CHECK. Base64 is bounded before decode, with canonical padding and trailing-bit checks.
- Migration agreement: scope kinds `user` and `workspace` match. Workspace scope requires a root, and the user scope has none. The 36-char id CHECK accepts all UUIDs that `z.uuid()` accepts. Retention keep/purge maps to `retain_memory` and `retain_history`. Tombstone and `archivedAt` semantics fit the schemas.
- Tests: jest run passed, 38 of 38. The spec has real rejection cases (blank text, extra keys, mixed runtimes, unsafe avatars, bad base64, bad versions), not only happy paths.
- Not run by me: typecheck and lint (the coordinator runs them).

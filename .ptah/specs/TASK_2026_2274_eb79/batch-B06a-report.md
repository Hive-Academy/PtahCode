# B06a — Avatar validation helpers

Implemented bounded host-neutral avatar admission. No Electron, vscode, filesystem, URL handling, DI registration or self-barrel import.

## Files

- `libs/backend/bots/src/lib/bot-avatar-validation.ts` (217 lines): validator, typed result and stable refusal union.
- `libs/backend/bots/src/lib/bot-avatar-validation.spec.ts` (366 lines): 85 passing cases with byte-built PNG/JPEG/WebP headers, boundary sizes, canonical base64, MIME/signatures, dimensions and malformed/truncated headers.
- This required report. No other files edited; no git commands run. Concurrent lane changes were not reverted or edited.

## Public API

```ts
validateBotAvatarUpload(input: {
  mediaType: unknown;
  dataBase64: unknown;
}): BotAvatarValidationResult

type BotAvatarValidationResult =
  | { ok: true; mediaType: BotAvatarMediaType; bytes: Uint8Array;
      width: number; height: number }
  | { ok: false; code: BotAvatarRefusalCode; message: string };
```

`BotAvatarRefusalCode` and `BotAvatarValidationResult` are exported directly from the helper for B06 consumption.

## Refusal codes

- `AVATAR_UNSUPPORTED_MEDIA_TYPE`: outside the shared PNG/JPEG/WebP enum.
- `AVATAR_EMPTY`: empty input string.
- `AVATAR_TOO_LARGE`: encoded cap or decoded 2 MiB cap exceeded, before byte allocation.
- `AVATAR_INVALID_BASE64`: wrong input type, alphabet, whitespace, padding, length or trailing bits.
- `AVATAR_SIGNATURE_MISMATCH`: unrecognized signature or claimed MIME disagreement.
- `AVATAR_INVALID_HEADER`: malformed, truncated or unsupported raster header, including JPEG work-budget exhaustion.
- `AVATAR_DIMENSIONS_EXCEEDED`: zero dimension, dimension above 4096, or area above 16,000,000 pixels.

## Decisions

- Interpret 16 megapixels as 16,000,000 pixels (decimal megapixels); the alternative 16 * 1024 * 1024 is already implied by the 4096-square dimension cap. Reversible policy constant.
- Reuse shared `BOT_AVATAR_MAX_BYTES`, `BotAvatarMediaTypeSchema` and `BotAvatarMediaType`. Derive the encoded cap exactly as the RPC schema does. Keep ordered checks locally to provide stable, specific refusal codes and prove refusal before decoding.
- Inspected `file-rpc.handlers.ts:252` and its shared `image-media-type.ts` helper. Re-implement the small signature check on already-decoded bytes: the existing resolver permits fallback/corrected MIME and the shared sniffer decodes base64 again. No rpc-handlers dependency. This is a reversible local implementation choice, not a new module or boundary.
- JPEG scanning has a 256-marker/fill-byte budget plus per-segment bounds; all SOFn except DHT C4, JPG C8 and DAC CC provide dimensions. WebP accepts VP8 key-frame, VP8L version 0 and still-image VP8X headers, rejecting animation/reserved flags. Unsupported variants fail closed.
- Admission inspects bounded headers only, as required. It does not decode pixels, verify PNG CRCs, or guarantee complete raster decodability. Renderer load errors remain the later renderer's responsibility. Test fixtures exercise headers without allocating pixels.
- Revision 1: keep exact RIFF size equality intentionally, failing closed on disagreement or trailing bytes (review #3). The alternative would allow trailing bytes; strict admission follows the existing parser policy and is reversible.

## Checks

- PASS (exit 0): `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json` — no diagnostics.
- PASS (exit 0): `npx eslint libs/backend/bots/src/lib/bot-avatar-validation.ts libs/backend/bots/src/lib/bot-avatar-validation.spec.ts` — no diagnostics.
- PASS (exit 0): `npx prettier --check libs/backend/bots/src/lib/bot-avatar-validation.ts libs/backend/bots/src/lib/bot-avatar-validation.spec.ts` — All matched files use Prettier code style.
- PASS (exit 0): `npx jest --config libs/backend/bots/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/bots/src/lib/bot-avatar-validation.spec.ts` — 1 suite passed, 85 tests passed, 16.833 s.
- Scoped `ptah_get_diagnostics` called twice after edits: both reported unavailable because its TypeScript check was still running after 45 s (two files unchecked). Native scoped tsc above passed; Jest also compiled the spec successfully.

## Limitations / anything not done

- No outstanding implementation work within B06a. B06 integration, public barrel export and DI are intentionally owned by other batches.
- Skill discovery/loading is not available through this lane's host tools/catalogue; task and repository instructions were followed directly.
- No workspace-wide checks, nx, npm run verify, builds or git commands run.

## Revision 1

All requested changes implemented; exported function signatures and result type shape are unchanged. Only the two authorized source/spec files and this report were modified by this lane. Current sizes: helper 271 lines; spec 470 lines. Other lanes' files were not touched.

- Review #1 (Medium): `bot-avatar-validation.ts:121` checks chunk header/payload/even-padding bounds; `:134` reads VP8/VP8L dimensions at the checked chunk offset; `:186` scans at most 16 following chunks, skipping ALPH/ICCP; `:197` requires equality with the VP8X canvas. Missing, unsupported, truncated, oversized or disagreeing inner chunks return the existing stable `AVATAR_INVALID_HEADER`. Tests at `bot-avatar-validation.spec.ts:259` cover matching VP8 and VP8L with odd-length padded metadata, and a 1x1 canvas containing a 16383x16383 bitstream; `:280` covers missing/truncated/unsupported chunks and the scan budget. Existing VP8X fixtures now include a matching inner image.
- Review #2 (Low): `bot-avatar-validation.ts:267` returns `Uint8Array.from(bytes)`, an owned copy. `bot-avatar-validation.spec.ts:233` asserts zero byte offset, exact backing-buffer byte length and preserved bytes. Existing successful-result expectations now compare with Uint8Array values.
- Review #4 (Low): `bot-avatar-validation.spec.ts:244` tests every shortened VP8/VP8L/VP8X prefix after rewriting RIFF size to the actual shortened buffer, exercising inner chunk bounds. The older truncation test name now explicitly describes unchanged declared sizes.
- Review #3 (Low): `bot-avatar-validation.ts:168` comments the intentional exact RIFF size rule; `bot-avatar-validation.spec.ts:298` covers trailing bytes and size disagreement. Decision recorded under `## Decisions` above.

Real check results after Revision 1 edits:

- PASS (exit 0): `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json` — no output/diagnostics.
- PASS (exit 0): `npx eslint libs/backend/bots/src/lib/bot-avatar-validation.ts libs/backend/bots/src/lib/bot-avatar-validation.spec.ts` — no output/diagnostics.
- PASS (exit 0): `npx prettier --check libs/backend/bots/src/lib/bot-avatar-validation.ts libs/backend/bots/src/lib/bot-avatar-validation.spec.ts` — `All matched files use Prettier code style!`
- PASS (exit 0): `npx jest --config libs/backend/bots/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/bots/src/lib/bot-avatar-validation.spec.ts` — `Test Suites: 1 passed, 1 total`; `Tests: 93 passed, 93 total`; `Time: 7.825 s`.
- PASS: scoped `ptah_get_diagnostics` on both files — TypeScript compiler, errors 0, warnings 0, coverage clean.

No outstanding Revision 1 items. No git commands, nx, npm run verify or unrelated checks were run.

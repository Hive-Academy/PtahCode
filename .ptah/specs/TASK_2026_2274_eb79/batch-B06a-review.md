# Review B06a: avatar validation helpers

**Verdict: APPROVED**
**Score: 8 / 10**

Scope: whole of `bot-avatar-validation.ts` (217 lines) and its spec (366 lines). I traced every index and DataView access by hand. I did not write scratch probes.

## Five logic questions
1. Bounds: every read is guarded. PNG needs 33 bytes. JPEG checks `offset`, segment length and SOF component count. WebP checks chunk length against the buffer before any variant read (VP8 needs 30 bytes, VP8L 25, VP8X 30).
2. Overflow: JS numbers. The largest product is about 2.8e14 (VP8X), so there is no precision loss. The 14-bit and 24-bit fields decode correctly and add 1 for VP8L and VP8X.
3. Order: the encoded length, charset, padding and trailing bits are checked, then the decoded length, and only then `Buffer.from`. The spec proves this with a spy.
4. Loops: the JPEG loop runs at most 256 times. Fill bytes use the same budget. Segment length < 2 is refused.
5. Leaks: refusal messages are fixed strings. No bytes are logged.

## Findings

1. **Medium** `bot-avatar-validation.ts:143-153`. For VP8X the code reads only the canvas size of the VP8X chunk. It does not read the inner VP8, VP8L or ALPH chunk. A file can declare 1x1 in VP8X and carry a 16383x16383 VP8L bitstream. A downstream decoder (renderer, Discord) can then decode a larger image than the 16 MP limit allows. Fix: for VP8X, parse the next chunk header at offset 30 (length bound check), read its dimensions, and require them to equal the canvas size. Add a test.
2. **Low** `bot-avatar-validation.ts:186`. `Buffer.from(data, 'base64')` can return a view into the shared Node pool for small inputs. The result type is `Uint8Array`. A consumer that uses `bytes.buffer` would read unrelated memory. Fix: return `Uint8Array.from(buffer)`, or document that `.buffer` must not be used. The spec at line 91 compares with `toEqual`, so check that it still passes.
3. **Low** `bot-avatar-validation.ts:122`. The RIFF size must equal `bytes.length - 8` exactly. Valid files with an odd RIFF size or trailing bytes are refused. This is a safe direction, but it can refuse a real avatar. Fix: accept `riffSize + 8 <= bytes.length` if you want less strict behavior, or keep it and note it as intended.
4. **Low** `bot-avatar-validation.spec.ts:200-204`. "refuses every truncated header prefix" for WebP always fails at the RIFF size check (line 122 of the source). It does not exercise the chunk bounds checks. The test name claims more than it proves. Fix: add truncated cases with a corrected RIFF size.
5. **Info** `bot-avatar-validation.ts:91-92`. A real JPEG with more than 256 fill bytes before SOF is refused. This is a safe direction and is documented by the test at line 278.

## Checks run
- jest `bot-avatar-validation.spec.ts`: 1 suite passed, 85 tests passed.
- `tsc --noEmit -p libs/backend/bots/tsconfig.lib.json`: no errors (exit 0).
- eslint on both files: no output, no errors.

## Re-review (revision 1)

**Final verdict: APPROVED**

### State of the first findings
1. Medium (VP8X inner chunk dimensions): **Fixed.** `bot-avatar-validation.ts:174-201` scans the chunks after VP8X. It skips ALPH and ICCP, and requires the first other chunk to be VP8 or VP8L with dimensions equal to the canvas size. Spec lines 259-288 cover the match, the padded metadata, missing, truncated, unsupported and 17-chunk cases.
2. Low (Buffer pool view): **Fixed.** `bot-avatar-validation.ts:267` returns `Uint8Array.from(bytes)`, a copy. Spec line 233 tests it.
3. Low (exact RIFF size): **Kept as decided.** The comment is present at `bot-avatar-validation.ts:168`.
4. Low (WebP truncation test): **Fixed.** Spec lines 243-250 truncate each variant and correct the RIFF size, so the chunk bounds checks run.

### Hunt in the new VP8X scan
- `webpChunkEnd` (lines 121-132) needs 8 header bytes, then compares the padded length to the remaining bytes. Arithmetic is in doubles, so a 32-bit length cannot overflow. An odd final chunk without the pad byte is refused. This is safe.
- Every chunk advances by at least 8 bytes, and the loop has a 16-chunk limit. No unbounded loop.
- `webpBitstreamDimensions` is called only after `webpChunkEnd` passed. VP8 reads payload+0..9 with length >= 10. VP8L reads payload+0..4 with length >= 5. No read past the buffer.
- VP8 uses 14 bits without +1. VP8L and VP8X use +1. The canvas comparison is consistent, because VP8X stores size - 1.
- The non-extended path accepts only VP8 or VP8L as the first chunk.

### New findings
None. The code is 271 lines and the spec is 470 lines.

Info: chunk order is not enforced (ICCP after ALPH is accepted). The check is admission only, so this is acceptable.

### Checks run
- jest `bot-avatar-validation.spec.ts`: 1 suite passed, 93 tests passed.
- `tsc --noEmit -p libs/backend/bots/tsconfig.lib.json`: no errors (exit 0).
- eslint on both files: no output, no errors.

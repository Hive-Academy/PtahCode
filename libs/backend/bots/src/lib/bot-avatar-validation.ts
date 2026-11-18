import {
  BOT_AVATAR_MAX_BYTES,
  BotAvatarMediaTypeSchema,
  type BotAvatarMediaType,
} from '@ptah-extension/shared';

const MAX_ENCODED_LENGTH = 4 * Math.ceil(BOT_AVATAR_MAX_BYTES / 3);
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16_000_000;
const MAX_JPEG_MARKERS = 256;
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export type BotAvatarRefusalCode =
  | 'AVATAR_UNSUPPORTED_MEDIA_TYPE'
  | 'AVATAR_EMPTY'
  | 'AVATAR_TOO_LARGE'
  | 'AVATAR_INVALID_BASE64'
  | 'AVATAR_SIGNATURE_MISMATCH'
  | 'AVATAR_INVALID_HEADER'
  | 'AVATAR_DIMENSIONS_EXCEEDED';

export type BotAvatarValidationResult =
  | {
      ok: true;
      mediaType: BotAvatarMediaType;
      bytes: Uint8Array;
      width: number;
      height: number;
    }
  | { ok: false; code: BotAvatarRefusalCode; message: string };

interface Dimensions {
  width: number;
  height: number;
}

function refuse(
  code: BotAvatarRefusalCode,
  message: string,
): BotAvatarValidationResult {
  return { ok: false, code, message };
}

function matches(
  bytes: Uint8Array,
  offset: number,
  expected: number[],
): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

// Local byte checks mirror the attachment precedent without its MIME fallback
// or second base64 decode. Claimed MIME must agree here, never be corrected.
function signature(bytes: Uint8Array): BotAvatarMediaType | null {
  if (matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (matches(bytes, 0, [255, 216, 255])) return 'image/jpeg';
  if (
    matches(bytes, 0, [82, 73, 70, 70]) &&
    matches(bytes, 8, [87, 69, 66, 80])
  )
    return 'image/webp';
  return null;
}

function pngDimensions(bytes: Uint8Array, view: DataView): Dimensions | null {
  if (
    bytes.length < 33 ||
    view.getUint32(8) !== 13 ||
    !matches(bytes, 12, [73, 72, 68, 82]) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] > 1
  )
    return null;
  const depths: Record<number, readonly number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (!depths[bytes[25]]?.includes(bytes[24])) return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array, view: DataView): Dimensions | null {
  let offset = 2;
  for (let count = 0; count < MAX_JPEG_MARKERS; count++) {
    if (offset >= bytes.length || bytes[offset++] !== 255) return null;
    // Fill bytes consume the same finite work budget as markers.
    if (bytes[offset] === 255) continue;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++];
    if (marker === 0 || marker === 0xd8 || marker === 0xd9 || marker === 0xda)
      return null;
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = view.getUint16(offset);
    if (length < 2 || length > bytes.length - offset) return null;
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      if (length < 8) return null;
      const components = bytes[offset + 7];
      if (components === 0 || length !== 8 + 3 * components) return null;
      return {
        width: view.getUint16(offset + 5),
        height: view.getUint16(offset + 3),
      };
    }
    offset += length;
  }
  return null;
}

function webpChunkEnd(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
): number | null {
  if (bytes.length - offset < 8) return null;
  const length = view.getUint32(offset + 4, true);
  const paddedLength = length + (length % 2);
  return paddedLength <= bytes.length - offset - 8
    ? offset + 8 + paddedLength
    : null;
}

function webpBitstreamDimensions(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
): Dimensions | null {
  // Callers have checked the complete chunk, including its even padding.
  const length = view.getUint32(offset + 4, true);
  const payload = offset + 8;
  if (matches(bytes, offset, [86, 80, 56, 32])) {
    if (
      length < 10 ||
      (bytes[payload] & 1) !== 0 ||
      !matches(bytes, payload + 3, [157, 1, 42])
    )
      return null;
    return {
      width: view.getUint16(payload + 6, true) & 0x3fff,
      height: view.getUint16(payload + 8, true) & 0x3fff,
    };
  }
  if (matches(bytes, offset, [86, 80, 56, 76])) {
    if (
      length < 5 ||
      bytes[payload] !== 47 ||
      (bytes[payload + 4] & 0xe0) !== 0
    )
      return null;
    const bits = view.getUint32(payload + 1, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

function webpDimensions(bytes: Uint8Array, view: DataView): Dimensions | null {
  // Intentionally fail closed on RIFF size disagreement, including trailing bytes.
  if (bytes.length < 20 || view.getUint32(4, true) !== bytes.length - 8)
    return null;
  const end = webpChunkEnd(bytes, view, 12);
  if (end === null) return null;
  const length = view.getUint32(16, true);
  if (matches(bytes, 12, [86, 80, 56, 88])) {
    // Extended still-image header only; animation and reserved bits unsupported.
    if (
      length !== 10 ||
      (bytes[20] & 0xc3) !== 0 ||
      !matches(bytes, 21, [0, 0, 0])
    )
      return null;
    const uint24 = (offset: number): number =>
      bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
    const canvas = { width: uint24(24) + 1, height: uint24(27) + 1 };
    let offset = end;
    for (let count = 0; count < 16; count++) {
      const next = webpChunkEnd(bytes, view, offset);
      if (next === null) return null;
      if (
        matches(bytes, offset, [65, 76, 80, 72]) ||
        matches(bytes, offset, [73, 67, 67, 80])
      ) {
        offset = next;
        continue;
      }
      const image = webpBitstreamDimensions(bytes, view, offset);
      return image?.width === canvas.width && image.height === canvas.height
        ? canvas
        : null;
    }
    return null;
  }
  return webpBitstreamDimensions(bytes, view, 12);
}

/** Admission only: bounded raster headers, no pixel decode or integrity guarantee. */
export function validateBotAvatarUpload(input: {
  mediaType: unknown;
  dataBase64: unknown;
}): BotAvatarValidationResult {
  const mediaType = BotAvatarMediaTypeSchema.safeParse(input.mediaType);
  if (!mediaType.success)
    return refuse('AVATAR_UNSUPPORTED_MEDIA_TYPE', 'Use PNG, JPEG or WebP.');
  const data = input.dataBase64;
  if (typeof data !== 'string')
    return refuse('AVATAR_INVALID_BASE64', 'Expected canonical base64.');
  if (data.length === 0) return refuse('AVATAR_EMPTY', 'The avatar is empty.');
  // Refuse before scanning or allocating any decoded storage.
  if (data.length > MAX_ENCODED_LENGTH)
    return refuse('AVATAR_TOO_LARGE', 'The avatar exceeds 2 MiB.');
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
    return refuse('AVATAR_INVALID_BASE64', 'Expected canonical base64.');
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const last = ALPHABET.indexOf(data.charAt(data.length - padding - 1));
  if (
    last < 0 ||
    (padding === 2 && last % 16 !== 0) ||
    (padding === 1 && last % 4 !== 0)
  )
    return refuse('AVATAR_INVALID_BASE64', 'Expected canonical base64.');
  const decodedLength = (data.length / 4) * 3 - padding;
  if (decodedLength > BOT_AVATAR_MAX_BYTES)
    return refuse('AVATAR_TOO_LARGE', 'The avatar exceeds 2 MiB.');
  const bytes = Buffer.from(data, 'base64');
  if (signature(bytes) !== mediaType.data)
    return refuse(
      'AVATAR_SIGNATURE_MISMATCH',
      'The image signature does not match its media type.',
    );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dimensions =
    mediaType.data === 'image/png'
      ? pngDimensions(bytes, view)
      : mediaType.data === 'image/jpeg'
        ? jpegDimensions(bytes, view)
        : webpDimensions(bytes, view);
  if (!dimensions)
    return refuse(
      'AVATAR_INVALID_HEADER',
      'The raster header is malformed, truncated or unsupported.',
    );
  const { width, height } = dimensions;
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_PIXELS
  )
    return refuse(
      'AVATAR_DIMENSIONS_EXCEEDED',
      'Use dimensions 1–4096 and at most 16,000,000 pixels.',
    );
  return {
    ok: true,
    mediaType: mediaType.data,
    bytes: Uint8Array.from(bytes),
    width,
    height,
  };
}

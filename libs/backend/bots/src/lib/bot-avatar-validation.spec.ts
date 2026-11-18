import { BOT_AVATAR_MAX_BYTES } from '@ptah-extension/shared';
import {
  validateBotAvatarUpload,
  type BotAvatarRefusalCode,
} from './bot-avatar-validation';

function png(width = 1, height = 1): Buffer {
  const bytes = Buffer.alloc(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

function jpeg(width = 1, height = 1, marker = 0xc0): Buffer {
  const bytes = Buffer.from([
    255,
    216,
    255,
    marker,
    0,
    11,
    8,
    0,
    0,
    0,
    0,
    1,
    1,
    0x11,
    0,
  ]);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  return bytes;
}

function webp(variant = 'VP8 ', width = 1, height = 1): Buffer {
  const length = variant === 'VP8L' ? 5 : 10;
  const bytes = Buffer.alloc(20 + length + (length % 2));
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WEBP', 8, 'ascii');
  bytes.write(variant, 12, 'ascii');
  bytes.writeUInt32LE(length, 16);
  if (variant === 'VP8 ') {
    bytes.set([157, 1, 42], 23);
    bytes.writeUInt16LE(width, 26);
    bytes.writeUInt16LE(height, 28);
  } else if (variant === 'VP8L') {
    bytes[20] = 47;
    bytes.writeUInt32LE(((height - 1) * 16384 + width - 1) >>> 0, 21);
  } else {
    bytes.writeUIntLE(width - 1, 24, 3);
    bytes.writeUIntLE(height - 1, 27, 3);
  }
  if (variant === 'VP8X') {
    const extended = Buffer.concat([
      bytes,
      webp('VP8L', width, height).subarray(12),
    ]);
    extended.writeUInt32LE(extended.length - 8, 4);
    return extended;
  }
  return bytes;
}

function extendedWebp(width: number, height: number, chunks: Buffer[]): Buffer {
  const bytes = Buffer.concat([
    webp('VP8X', width, height).subarray(0, 30),
    ...chunks,
  ]);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  return bytes;
}

function metadataChunk(tag: string, length: number): Buffer {
  const bytes = Buffer.alloc(8 + length + (length % 2));
  bytes.write(tag, 0, 'ascii');
  bytes.writeUInt32LE(length, 4);
  return bytes;
}

function validate(bytes: Uint8Array, mediaType = 'image/png') {
  return validateBotAvatarUpload({
    mediaType,
    dataBase64: Buffer.from(bytes).toString('base64'),
  });
}

function expectRefusal(
  dataBase64: unknown,
  code: BotAvatarRefusalCode,
  mediaType: unknown = 'image/png',
): void {
  expect(validateBotAvatarUpload({ mediaType, dataBase64 })).toEqual({
    ok: false,
    code,
    message: expect.any(String),
  });
}

describe('validateBotAvatarUpload', () => {
  it.each([
    ['PNG', 'image/png', png(2, 3)],
    ['JPEG', 'image/jpeg', jpeg(2, 3)],
    ['WebP VP8', 'image/webp', webp('VP8 ', 2, 3)],
    ['WebP VP8L', 'image/webp', webp('VP8L', 2, 3)],
    ['WebP VP8X', 'image/webp', webp('VP8X', 2, 3)],
  ])('admits %s dimensions and preserves bytes', (_name, mediaType, bytes) => {
    expect(validate(bytes, mediaType)).toEqual({
      ok: true,
      mediaType,
      bytes: Uint8Array.from(bytes),
      width: 2,
      height: 3,
    });
  });

  it.each(['image/gif', 'image/svg+xml', 'image/bmp', 'IMAGE/PNG', '', null])(
    'refuses unsupported media type %s',
    (mediaType) => {
      expectRefusal(
        png().toString('base64'),
        'AVATAR_UNSUPPORTED_MEDIA_TYPE',
        mediaType,
      );
    },
  );

  it('refuses empty and non-string data', () => {
    expectRefusal('', 'AVATAR_EMPTY');
    expectRefusal(null, 'AVATAR_INVALID_BASE64');
    expectRefusal(42, 'AVATAR_INVALID_BASE64');
  });

  it.each([
    ' Zg==',
    'Zg==\n',
    'Zg==\r\n',
    'Z g==',
    '-w==',
    '_w==',
    'Zg',
    'Zg=',
    'Zg===',
    'Z=g=',
    '====',
    'A===',
    'Zh==',
    'Zm9=',
    'data:image/png;base64,AAAA',
    'https://example.com/a.png',
    'http://example.com/a.png',
    'file:///tmp/a.png',
    '/tmp/a.png',
    'C:\\avatars\\a.png',
    '<svg/>',
  ])('refuses noncanonical or textual data %s', (value) => {
    expectRefusal(value, 'AVATAR_INVALID_BASE64');
  });

  it('rejects oversized encoded data before decoding', () => {
    const decode = jest.spyOn(Buffer, 'from');
    try {
      expectRefusal(
        'A'.repeat(4 * Math.ceil(BOT_AVATAR_MAX_BYTES / 3) + 4),
        'AVATAR_TOO_LARGE',
      );
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });

  it('rejects excess decoded bytes even within the encoded length cap', () => {
    const data = Buffer.alloc(BOT_AVATAR_MAX_BYTES + 1).toString('base64');
    const decode = jest.spyOn(Buffer, 'from');
    try {
      expectRefusal(data, 'AVATAR_TOO_LARGE');
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });

  it('accepts the exact byte cap and canonical padding variants', () => {
    for (const length of [
      BOT_AVATAR_MAX_BYTES - 2,
      BOT_AVATAR_MAX_BYTES - 1,
      BOT_AVATAR_MAX_BYTES,
    ]) {
      const bytes = Buffer.alloc(length);
      bytes.set(png());
      expect(validate(bytes).ok).toBe(true);
    }
  });

  it.each([
    ['image/png', jpeg()],
    ['image/jpeg', png()],
    ['image/webp', png()],
    ['image/png', Buffer.from('GIF89a')],
    ['image/png', Buffer.from('<svg/>')],
    ['image/png', Buffer.from('https://example.com/avatar.png')],
    ['image/png', Buffer.from('C:\\avatars\\a.png')],
  ])('requires matching magic bytes for %s', (mediaType, bytes) => {
    expect(validate(bytes, mediaType)).toMatchObject({
      ok: false,
      code: 'AVATAR_SIGNATURE_MISMATCH',
    });
  });

  it.each([
    ['image/png', png()],
    ['image/jpeg', jpeg()],
    ['image/webp', webp()],
    ['image/webp', webp('VP8L')],
    ['image/webp', webp('VP8X')],
  ])(
    'refuses shortened buffers without rewriting declared sizes for %s',
    (mediaType, bytes) => {
      for (let length = 1; length < bytes.length; length++) {
        expect(validate(bytes.subarray(0, length), mediaType).ok).toBe(false);
      }
    },
  );

  it('returns owned bytes without exposing the Node pool', () => {
    const result = validate(png());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes.byteOffset).toBe(0);
      expect(result.bytes.buffer.byteLength).toBe(result.bytes.byteLength);
      expect(result.bytes).toEqual(Uint8Array.from(png()));
    }
  });

  it.each(['VP8 ', 'VP8L', 'VP8X'])(
    'checks %s chunk bounds after truncation with corrected RIFF size',
    (variant) => {
      const bytes = webp(variant);
      for (let length = 12; length < bytes.length; length++) {
        const truncated = Buffer.from(bytes.subarray(0, length));
        truncated.writeUInt32LE(length - 8, 4);
        expect(validate(truncated, 'image/webp')).toMatchObject({
          ok: false,
          code: 'AVATAR_INVALID_HEADER',
        });
      }
    },
  );

  it.each(['VP8 ', 'VP8L'])(
    'requires matching VP8X and inner %s dimensions with padded metadata',
    (variant) => {
      const bytes = extendedWebp(2, 3, [
        metadataChunk('ICCP', 3),
        metadataChunk('ALPH', 1),
        webp(variant, 2, 3).subarray(12),
      ]);
      expect(validate(bytes, 'image/webp')).toMatchObject({
        ok: true,
        width: 2,
        height: 3,
      });
      expect(
        validate(
          extendedWebp(1, 1, [webp(variant, 16383, 16383).subarray(12)]),
          'image/webp',
        ),
      ).toMatchObject({ ok: false, code: 'AVATAR_INVALID_HEADER' });
    },
  );

  it('refuses missing, truncated, unsupported or unbounded VP8X inner chunks', () => {
    const image = webp('VP8L').subarray(12);
    const chunks = [
      [],
      [metadataChunk('ICCP', 1)],
      [image.subarray(0, 7)],
      [image.subarray(0, image.length - 1)],
      [metadataChunk('JUNK', 2), image],
      [...Array.from({ length: 16 }, () => metadataChunk('ICCP', 0)), image],
    ];
    for (const inner of chunks) {
      expect(validate(extendedWebp(1, 1, inner), 'image/webp')).toMatchObject({
        ok: false,
        code: 'AVATAR_INVALID_HEADER',
      });
    }
  });

  it('intentionally refuses RIFF size disagreement and trailing bytes', () => {
    const bytes = webp();
    expect(
      validate(Buffer.concat([bytes, Buffer.from([0, 0])]), 'image/webp'),
    ).toMatchObject({ ok: false, code: 'AVATAR_INVALID_HEADER' });
    bytes.writeUInt32LE(bytes.length, 4);
    expect(validate(bytes, 'image/webp')).toMatchObject({
      ok: false,
      code: 'AVATAR_INVALID_HEADER',
    });
  });

  it.each([
    [0, 1],
    [1, 0],
    [4097, 1],
    [1, 4097],
    [4096, 4096],
    [4001, 4000],
  ])('refuses dimensions %s x %s', (width, height) => {
    for (const [mediaType, bytes] of [
      ['image/png', png(width, height)],
      ['image/jpeg', jpeg(width, height)],
      ['image/webp', webp('VP8 ', width, height)],
    ] as const) {
      expect(validate(bytes, mediaType)).toMatchObject({
        ok: false,
        code: 'AVATAR_DIMENSIONS_EXCEEDED',
      });
    }
  });

  it.each([
    [4096, 1],
    [1, 4096],
    [4000, 4000],
  ])('accepts boundary dimensions %s x %s', (width, height) => {
    expect(validate(png(width, height)).ok).toBe(true);
  });

  it('checks PNG IHDR length, type and encoding fields', () => {
    for (const [offset, value] of [
      [11, 12],
      [12, 0],
      [24, 3],
      [25, 1],
      [26, 1],
      [27, 1],
      [28, 2],
    ]) {
      const bytes = png();
      bytes[offset] = value;
      expect(validate(bytes)).toMatchObject({
        ok: false,
        code: 'AVATAR_INVALID_HEADER',
      });
    }
  });

  it.each([0, 1, 65535])('bounds JPEG segment length %s', (length) => {
    const bytes = Buffer.from([255, 216, 255, 0xe0, 0, 0]);
    bytes.writeUInt16BE(length, 4);
    expect(validate(bytes, 'image/jpeg')).toMatchObject({
      ok: false,
      code: 'AVATAR_INVALID_HEADER',
    });
  });

  it('skips metadata, DHT, JPG and DAC before SOF', () => {
    const bytes = Buffer.concat([
      Buffer.from([255, 216, 255, 0xe0, 0, 4, 0, 0]),
      ...[0xc4, 0xc8, 0xcc].map((marker) => Buffer.from([255, marker, 0, 2])),
      jpeg().subarray(2),
    ]);
    expect(validate(bytes, 'image/jpeg').ok).toBe(true);
  });

  it.each([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ])('reads SOF marker %s', (marker) =>
    expect(validate(jpeg(1, 1, marker), 'image/jpeg').ok).toBe(true),
  );

  it('bounds marker count and fill-byte scanning', () => {
    for (const prefix of [
      Buffer.from([255, 1]),
      Buffer.from([255, 0xe0, 0, 2]),
      Buffer.from([255]),
    ]) {
      const bytes = Buffer.concat([
        Buffer.from([255, 216]),
        ...Array.from({ length: 257 }, () => prefix),
        jpeg().subarray(2),
      ]);
      expect(validate(bytes, 'image/jpeg')).toMatchObject({
        ok: false,
        code: 'AVATAR_INVALID_HEADER',
      });
    }
  });

  it('handles fill bytes and standalone markers within budget', () => {
    const bytes = Buffer.concat([
      Buffer.from([255, 216, 255, 255, 1, 255, 0xd0]),
      jpeg().subarray(2),
    ]);
    expect(validate(bytes, 'image/jpeg').ok).toBe(true);
  });

  it.each([0, 0xd8, 0xd9, 0xda])(
    'rejects JPEG before SOF at marker %s',
    (marker) => {
      expect(
        validate(Buffer.from([255, 216, 255, marker]), 'image/jpeg').ok,
      ).toBe(false);
    },
  );

  it('rejects malformed SOF component lengths and missing markers', () => {
    for (const [offset, value] of [
      [2, 0],
      [5, 7],
      [11, 0],
      [11, 2],
    ]) {
      const bytes = jpeg();
      bytes[offset] = value;
      expect(validate(bytes, 'image/jpeg').ok).toBe(false);
    }
  });

  it('rejects WebP RIFF/chunk overflows, unsupported tags and invalid variant headers', () => {
    const mutations: Array<[string, number, number]> = [
      ['VP8 ', 4, 255],
      ['VP8 ', 16, 255],
      ['VP8 ', 16, 9],
      ['VP8 ', 12, 0],
      ['VP8 ', 20, 1],
      ['VP8 ', 23, 0],
      ['VP8L', 20, 0],
      ['VP8L', 24, 0x20],
      ['VP8L', 16, 4],
      ['VP8X', 16, 9],
      ['VP8X', 20, 2],
      ['VP8X', 20, 1],
      ['VP8X', 21, 1],
    ];
    for (const [variant, offset, value] of mutations) {
      const bytes = webp(variant);
      bytes[offset] = value;
      expect(validate(bytes, 'image/webp')).toMatchObject({
        ok: false,
        code: 'AVATAR_INVALID_HEADER',
      });
    }
  });

  it.each(['VP8L', 'VP8X'])(
    'enforces %s dimensions after adding one',
    (variant) => {
      expect(validate(webp(variant, 4096, 1), 'image/webp').ok).toBe(true);
      expect(validate(webp(variant, 4097, 1), 'image/webp')).toMatchObject({
        ok: false,
        code: 'AVATAR_DIMENSIONS_EXCEEDED',
      });
      expect(validate(webp(variant, 4096, 4096), 'image/webp')).toMatchObject({
        ok: false,
        code: 'AVATAR_DIMENSIONS_EXCEEDED',
      });
    },
  );
});

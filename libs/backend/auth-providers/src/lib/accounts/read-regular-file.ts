import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

function fileError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/**
 * UTF-8 content of a regular file of at most `maxBytes` bytes.
 *
 * A settings path can be a special file. A FIFO with no writer blocks a plain
 * `open` for ever, and each blocked call holds one libuv pool thread. This
 * reader opens with `O_NONBLOCK`, so the open returns at once. It then checks
 * the open handle, not the path, so a path swapped after an inspection cannot
 * pass. Anything that is not a regular file rejects with `EINVAL`, and content
 * above the limit rejects with `EFBIG`. A missing path keeps `ENOENT`.
 *
 * Windows has no `O_NONBLOCK` and no FIFO path; the flag is then 0.
 */
export async function readRegularFileUtf8(path: string, maxBytes: number): Promise<string> {
  const nonBlock = typeof constants.O_NONBLOCK === 'number' ? constants.O_NONBLOCK : 0;
  const handle = await open(path, constants.O_RDONLY | nonBlock);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw fileError('EINVAL', 'not a regular file');
    if (info.size > maxBytes) throw fileError('EFBIG', 'file above the size limit');
    // One byte above the limit shows a file that grew after the size check.
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > maxBytes) throw fileError('EFBIG', 'file above the size limit');
    return buffer.toString('utf8', 0, length);
  } finally {
    await handle.close();
  }
}

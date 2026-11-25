import type { CliOutputSegment, InlineImageAttachment } from '@ptah-extension/shared';

/** One image the user sent with a lane message, ready for an `<img>`. */
export interface LaneEchoImage {
  /** `data:` URL of an allowed raster type; Angular's URL sanitizer accepts it for `src`. */
  readonly src: string;
  readonly alt: string;
}

/** Raster types the echo shows; anything else (SVG included) is never rendered. */
const ECHO_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** Thumbnails drawn per message; the rest are counted in the last thumbnail's label. */
export const MAX_ECHO_IMAGES = 6;

const NO_IMAGES: readonly LaneEchoImage[] = [];
const NO_ECHO_MAP: ReadonlyMap<string, readonly LaneEchoImage[]> = new Map();
/** Validated images per segment object: segments are immutable, deltas append new ones. */
const validated = new WeakMap<CliOutputSegment, readonly LaneEchoImage[]>();

/** Key that joins a `user` echo segment to its echo message: send time and body. */
export function echoImageKey(sentAt: number, body: string): string {
  return `${sentAt}\u0000${body}`;
}

function toEchoImages(images: readonly InlineImageAttachment[]): readonly LaneEchoImage[] {
  const usable = images.filter(
    (image) =>
      typeof image?.data === 'string' &&
      typeof image.mediaType === 'string' &&
      ECHO_IMAGE_TYPES.has(image.mediaType.toLowerCase()) &&
      image.data.length > 0 &&
      BASE64.test(image.data),
  );
  const shown = usable.slice(0, MAX_ECHO_IMAGES);
  return shown.map((image, index) => ({
    src: `data:${image.mediaType.toLowerCase()};base64,${image.data}`,
    alt:
      index === shown.length - 1 && usable.length > shown.length
        ? `Image ${index + 1} of ${usable.length} you sent (${usable.length - shown.length} more not shown)`
        : `Image ${index + 1} of ${usable.length} you sent`,
  }));
}

/**
 * Images of each `user` echo segment, keyed by {@link echoImageKey}. Only live
 * deltas carry the bytes (persisted output drops them), so a reloaded lane
 * returns an empty map and its echoes show text only.
 */
export function laneEchoImages(
  segments: readonly CliOutputSegment[] | undefined,
): ReadonlyMap<string, readonly LaneEchoImage[]> {
  const byEcho = new Map<string, readonly LaneEchoImage[]>();
  for (const segment of segments ?? []) {
    if (segment.type !== 'user' || !segment.images?.length || segment.sentAt === undefined) continue;
    let images = validated.get(segment);
    if (!images) {
      images = toEchoImages(segment.images);
      validated.set(segment, images);
    }
    if (images.length > 0) byEcho.set(echoImageKey(segment.sentAt, segment.content), images);
  }
  return byEcho.size > 0 ? byEcho : NO_ECHO_MAP;
}

/** The images of one echo message, or none. */
export function echoImagesFor(
  map: ReadonlyMap<string, readonly LaneEchoImage[]>,
  timestamp: number,
  body: string | undefined,
): readonly LaneEchoImage[] {
  if (map.size === 0) return NO_IMAGES;
  return map.get(echoImageKey(timestamp, body ?? '')) ?? NO_IMAGES;
}

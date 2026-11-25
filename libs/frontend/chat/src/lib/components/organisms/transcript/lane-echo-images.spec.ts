import type { CliOutputSegment } from '@ptah-extension/shared';
import { MAX_ECHO_IMAGES, echoImagesFor, laneEchoImages } from './lane-echo-images';

const png = { data: 'iVBORw0KGgo=', mediaType: 'image/png' };

describe('laneEchoImages', () => {
  it('joins images to their echo by send time and body', () => {
    const segment: CliOutputSegment = { type: 'user', content: 'Look', sentAt: 10, images: [png] };
    const map = laneEchoImages([segment, { type: 'text', content: 'Reply' }]);
    expect(echoImagesFor(map, 10, 'Look')).toEqual([{ src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'Image 1 of 1 you sent' }]);
    expect(echoImagesFor(map, 11, 'Look')).toEqual([]);
    expect(echoImagesFor(map, 10, 'Other')).toEqual([]);
  });

  it('drops non-raster types and data that is not base64', () => {
    const map = laneEchoImages([{ type: 'user', content: 'x', sentAt: 1, images: [
      { data: 'PHN2Zy8+', mediaType: 'image/svg+xml' },
      { data: 'not base64!', mediaType: 'image/png' },
      { data: 'javascript:alert(1)', mediaType: 'image/jpeg' },
    ] }]);
    expect(map.size).toBe(0);
  });

  it('caps the thumbnails and says how many are not shown', () => {
    const images = Array.from({ length: MAX_ECHO_IMAGES + 2 }, () => png);
    const shown = echoImagesFor(laneEchoImages([{ type: 'user', content: 'many', sentAt: 2, images }]), 2, 'many');
    expect(shown).toHaveLength(MAX_ECHO_IMAGES);
    expect(shown.at(-1)?.alt).toContain('2 more not shown');
  });

  it('shows nothing for a reloaded lane whose output has no image bytes', () => {
    expect(laneEchoImages([{ type: 'user', content: 'Look', sentAt: 10 }]).size).toBe(0);
    expect(laneEchoImages(undefined).size).toBe(0);
  });
});

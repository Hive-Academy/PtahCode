import { embedInBatches, type FeatureExtractor } from './embed-batches';

/** A fake pipeline: text `tN` embeds to the 2-dim row [N, -N]. */
function fakeExtractor(withDims = true): jest.MockedFunction<FeatureExtractor> {
  return jest.fn<ReturnType<FeatureExtractor>, Parameters<FeatureExtractor>>(
    async (texts) => {
      const data = new Float32Array(texts.length * 2);
      texts.forEach((text, row) => {
        const n = Number(text.slice(1));
        data[row * 2] = n;
        data[row * 2 + 1] = -n;
      });
      return withDims ? { data, dims: [texts.length, 2] } : { data };
    },
  );
}

const texts = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `t${i + 1}`);

describe('embedInBatches', () => {
  it('makes one call per chunk and keeps the input order', async () => {
    const extract = fakeExtractor();
    const vectors = await embedInBatches(extract, texts(7), 3);
    expect(extract.mock.calls.map(([chunk]) => chunk.length)).toEqual([
      3, 3, 1,
    ]);
    expect(extract.mock.calls[0][1]).toEqual({
      pooling: 'mean',
      normalize: true,
    });
    expect(vectors).toEqual(texts(7).map((_, i) => [i + 1, -(i + 1)]));
  });

  it('makes no call for empty input', async () => {
    const extract = fakeExtractor();
    await expect(embedInBatches(extract, [], 3)).resolves.toEqual([]);
    expect(extract).not.toHaveBeenCalled();
  });

  it('splits a tensor without dims by the row count', async () => {
    const vectors = await embedInBatches(fakeExtractor(false), texts(2), 4);
    expect(vectors).toEqual([
      [1, -1],
      [2, -2],
    ]);
  });

  it('rejects when a later chunk fails', async () => {
    const extract = fakeExtractor();
    extract.mockImplementationOnce(async (chunk) => ({
      data: new Float32Array(chunk.length * 2),
      dims: [chunk.length, 2],
    }));
    extract.mockRejectedValueOnce(new Error('model crashed'));
    await expect(embedInBatches(extract, texts(4), 2)).rejects.toThrow(
      'model crashed',
    );
  });

  it('rejects a tensor whose row count does not match the chunk', async () => {
    const extract: FeatureExtractor = async () => ({
      data: new Float32Array(6),
      dims: [3, 2],
    });
    await expect(embedInBatches(extract, texts(2), 2)).rejects.toThrow(
      /for 2 texts/,
    );
  });

  it('rejects a batch size that is not a positive integer', async () => {
    await expect(embedInBatches(fakeExtractor(), texts(1), 0)).rejects.toThrow(
      RangeError,
    );
  });
});

/**
 * Batched feature extraction for the embedder worker.
 *
 * One transformers.js pipeline call per chunk of texts instead of one per
 * text: the call returns a single `[rows, dim]` tensor whose `data` is the
 * rows laid end to end, which is split back into one vector per input.
 * Kept free of worker side effects so it can be tested without a worker.
 */

/** Texts per pipeline call. Symbol texts are short, so padding stays cheap. */
export const EMBED_BATCH_SIZE = 32;

/** The slice of a transformers.js `Tensor` this split reads. */
export interface FeatureTensor {
  readonly data: ArrayLike<number>;
  readonly dims?: readonly number[];
}

export type FeatureExtractor = (
  texts: string[],
  options: { pooling: string; normalize: boolean },
) => Promise<FeatureTensor>;

/**
 * Embed `texts` in chunks of `batchSize`. Returns one vector per input, in
 * input order. A failed chunk rejects the whole call, as a failed text did
 * before batching: the caller treats the request as failed and stores no
 * vectors for it.
 */
export async function embedInBatches(
  extract: FeatureExtractor,
  texts: readonly string[],
  batchSize: number = EMBED_BATCH_SIZE,
): Promise<number[][]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError(
      `embed batch size must be a positive integer, got ${batchSize}`,
    );
  }
  const out: number[][] = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const chunk = texts.slice(start, start + batchSize);
    const tensor = await extract(chunk, { pooling: 'mean', normalize: true });
    out.push(...splitRows(tensor, chunk.length));
  }
  return out;
}

/**
 * Split a pooled `[rows, dim]` tensor into `rows` vectors. A tensor whose
 * shape does not match the chunk is an error, never a silent misalignment
 * of vectors and texts.
 */
function splitRows(tensor: FeatureTensor, rows: number): number[][] {
  const total = tensor.data.length;
  const dim = tensor.dims?.[tensor.dims.length - 1] ?? total / rows;
  if (
    !Number.isInteger(dim) ||
    dim < 1 ||
    total !== rows * dim ||
    (tensor.dims !== undefined &&
      tensor.dims.length > 1 &&
      tensor.dims[0] !== rows)
  ) {
    throw new Error(
      `embedder returned a tensor of ${total} values (dims ${JSON.stringify(tensor.dims ?? null)}) for ${rows} texts`,
    );
  }
  const vectors: number[][] = [];
  for (let row = 0; row < rows; row++) {
    const vector = new Array<number>(dim);
    const offset = row * dim;
    for (let i = 0; i < dim; i++) vector[i] = tensor.data[offset + i];
    vectors.push(vector);
  }
  return vectors;
}

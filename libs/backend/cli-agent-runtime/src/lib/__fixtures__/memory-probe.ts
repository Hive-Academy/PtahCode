/** Stable, ample free memory for harnesses that do not exercise admission. */
export const ampleFreeMemory = (): number => 100 * 1024 ** 3;

/** Keep the lane queue specs' explicit override without reading host memory. */
export const laneTestFreeMemory = (): number => {
  const overrideGb = process.env['PTAH_VERIFY_FAKE_FREE_GB'];
  return overrideGb === undefined
    ? ampleFreeMemory()
    : Number(overrideGb) * 1024 ** 3;
};

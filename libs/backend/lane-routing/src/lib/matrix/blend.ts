import { BLEND_PRIOR_WEIGHT, SCORE_MAX, SCORE_MIN } from '../routing-constants';

/**
 * `round(100 * numerator / denominator)`, half away from zero.
 * `floor((200n + d) / (2d))` stays on integers. A product that does not fit
 * a safe integer is not derived.
 */
function roundPercent(
  numerator: number,
  denominator: number,
): number | undefined {
  return floorRatio(200 * numerator + denominator, 2 * denominator);
}

/** `round(100 * ((left/leftDen + right/rightDen) / 2))`. */
function roundMean(
  leftNum: number,
  leftDen: number,
  rightNum: number,
  rightDen: number,
): number | undefined {
  const left = scale(leftNum, rightDen);
  const right = scale(rightNum, leftDen);
  const denom = safeMul(leftDen, rightDen);
  if (left === undefined || right === undefined || denom === undefined) {
    return undefined;
  }
  return floorRatio(left + right + denom, 2 * denom);
}

/** `100 * count * otherDenominator`, or undefined when the product is unsafe. */
function scale(count: number, otherDenominator: number): number | undefined {
  const scaled = safeMul(100, count);
  if (scaled === undefined) return undefined;
  return safeMul(scaled, otherDenominator);
}

/**
 * One rate blended toward the prior (Requirement 8):
 * `round(100 * (s + k * prior / 100) / (n + k))`, half away from zero,
 * through `roundPercent(100*s + k*prior, 100*(n + k))`.
 */
export function blendedRate(
  successes: number,
  total: number,
  prior: number,
): number | undefined {
  const numerator = blendNumerator(successes, prior);
  const denominator = blendDenominator(total);
  if (numerator === undefined || denominator === undefined) {
    return undefined;
  }
  return roundPercent(numerator, denominator);
}

/** Both rates blended toward the prior, then combined by `roundMean`. */
export function blendedMean(
  deliverySuccesses: number,
  deliveryTotal: number,
  reviewSuccesses: number,
  reviewTotal: number,
  prior: number,
): number | undefined {
  const deliveryNumerator = blendNumerator(deliverySuccesses, prior);
  const deliveryDenominator = blendDenominator(deliveryTotal);
  const reviewNumerator = blendNumerator(reviewSuccesses, prior);
  const reviewDenominator = blendDenominator(reviewTotal);
  if (
    deliveryNumerator === undefined ||
    deliveryDenominator === undefined ||
    reviewNumerator === undefined ||
    reviewDenominator === undefined
  ) {
    return undefined;
  }
  return roundMean(
    deliveryNumerator,
    deliveryDenominator,
    reviewNumerator,
    reviewDenominator,
  );
}

/** `100 * s + k * prior`, or undefined when a product or the sum is unsafe. */
function blendNumerator(successes: number, prior: number): number | undefined {
  const successesScaled = safeMul(100, successes);
  const priorScaled = safeMul(BLEND_PRIOR_WEIGHT, prior);
  if (successesScaled === undefined || priorScaled === undefined) {
    return undefined;
  }
  return safeAdd(successesScaled, priorScaled);
}

/** `100 * (n + k)`, or undefined when the product is unsafe. */
function blendDenominator(total: number): number | undefined {
  return safeMul(100, total + BLEND_PRIOR_WEIGHT);
}

function floorRatio(
  numerator: number,
  denominator: number,
): number | undefined {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  ) {
    return undefined;
  }
  const score = Math.floor(numerator / denominator);
  if (score < SCORE_MIN || score > SCORE_MAX || !Number.isInteger(score)) {
    return undefined;
  }
  return score;
}

function safeMul(left: number, right: number): number | undefined {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    return undefined;
  }
  const product = left * right;
  if (!Number.isSafeInteger(product)) return undefined;
  return product;
}

/** Sum of two safe integers, or undefined when the sum is unsafe. */
function safeAdd(left: number, right: number): number | undefined {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    return undefined;
  }
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) return undefined;
  return sum;
}

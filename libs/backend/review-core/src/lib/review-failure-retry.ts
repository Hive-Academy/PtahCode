import type { ReviewFailureCode } from './review-failure';

/**
 * Failures that the same head reproduces on every attempt. They stop the automatic retries of that head.
 * A separate file, so the repository reads it without importing the classifier and its stage dependencies.
 */
export const NON_RETRYABLE_REVIEW_FAILURE_CODES: readonly ReviewFailureCode[] = ['diff-too-large'];

export type GitHubReviewErrorCode =
  | 'missing-token' | 'authentication' | 'permission' | 'rate-limit'
  | 'malformed-response' | 'http' | 'timeout' | 'publication-unavailable' | 'diff-too-large';

export class GitHubReviewError extends Error {
  constructor(
    readonly code: GitHubReviewErrorCode,
    message: string,
    readonly retryAt?: Date,
    /** HTTP status of a non-OK GitHub response, when one caused the error. */
    readonly status?: number,
    /** The `errors[].code` values of the GitHub error body, for example `too_large`. */
    readonly reasons: readonly string[] = [],
  ) {
    super(message);
    this.name = 'GitHubReviewError';
  }
}

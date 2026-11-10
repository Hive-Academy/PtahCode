import type { DependencyContainer } from 'tsyringe';
import { GithubReviewAdapter } from '../lib/github-review.adapter';
import { GithubReviewPublicationAdapter } from '../lib/github-review-publication.adapter';
import { GithubReviewStatusAdapter } from '../lib/github-review-status.adapter';
import { REVIEW_GITHUB_TOKENS } from './tokens';

export function registerReviewGithubServices(container: DependencyContainer): void {
  container.registerInstance(REVIEW_GITHUB_TOKENS.FETCH, fetch);
  container.registerSingleton(REVIEW_GITHUB_TOKENS.REVIEW_PORT, GithubReviewAdapter);
  container.registerSingleton(REVIEW_GITHUB_TOKENS.PUBLICATION_PORT, GithubReviewPublicationAdapter);
  container.registerSingleton(REVIEW_GITHUB_TOKENS.STATUS_PORT, GithubReviewStatusAdapter);
}

import type { GitHubReviewThread, RepoIdentity } from '@ptah-extension/review-contracts';

/** A top-level review comment of the bot with the bodies of the replies that the bot posted under it. */
export interface GitHubFindingThread extends GitHubReviewThread {
  replies: string[];
}

export interface GitHubFindingThreads {
  threads: GitHubFindingThread[];
  /** False when the comment scan stopped at its page limit. A caller must not treat such a result as complete. */
  complete: boolean;
}

/** Reads the finding threads of a pull request. One call reads the pull request comments one time. */
export interface IGitHubFindingThreadPort {
  listFindingThreads(repo: RepoIdentity, number: number): Promise<GitHubFindingThreads>;
}

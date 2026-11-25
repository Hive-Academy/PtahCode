import { relative } from 'node:path';
import type { RepoIdentity } from '@ptah-extension/review-contracts';
import type { ReviewStageEnvironment } from '../stages/context-stage.runner';

export interface RepositoryWorkspaceFolderInput {
  environment: Pick<ReviewStageEnvironment, 'resolve' | 'checkoutRoot'>;
  repo: RepoIdentity;
  /** Registered workspace folders, in their registration order. */
  folders: readonly string[];
  realpath: (path: string) => Promise<string>;
}

/** The registered workspace folder that is the checkout of the repository, or null when that checkout is not open. */
export async function findRepositoryWorkspaceFolder(input: RepositoryWorkspaceFolderInput): Promise<string | null> {
  const { environment, repo, folders, realpath } = input;
  let checkout: string;
  try {
    // An old run stays readable after its repository is disabled: checkoutRoot does not examine the settings.
    checkout = environment.checkoutRoot
      ? await environment.checkoutRoot(repo)
      : (await environment.resolve(repo)).repoRoot;
  } catch (_error: unknown) {
    // degradation-audit: reported — a null root makes the renderer tell the operator that the repository is not open.
    return null;
  }
  const real = await Promise.allSettled(folders.map((folder) => realpath(folder)));
  // path.relative compares without case on Windows, as the file system does.
  const index = real.findIndex((item) => item.status === 'fulfilled' && relative(item.value, checkout) === '');
  return index === -1 ? null : folders[index];
}

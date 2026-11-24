import { resolve } from 'node:path';
import type { RepoIdentity } from '@ptah-extension/review-contracts';
import type { ReviewRoots } from '../stages/context-stage.runner';
import { findRepositoryWorkspaceFolder } from './repository-workspace-folder';

const repo: RepoIdentity = { owner: 'Hive-Academy', name: 'PtahCode' };
const checkout = resolve('/work/ptah');
const other = resolve('/work/other');
const roots = (repoRoot: string): ReviewRoots => ({ repoRoot, attemptsRoot: resolve('/work/attempts') });
const identity = async (path: string): Promise<string> => path;

describe('findRepositoryWorkspaceFolder', () => {
  it('matches the checkout root and returns the folder string as registered', async () => {
    const environment = { resolve: jest.fn(), checkoutRoot: jest.fn(async () => checkout) };
    const realpath = jest.fn(async (path: string) => (path === 'link-to-ptah' ? checkout : path));
    await expect(findRepositoryWorkspaceFolder({ environment, repo, folders: [other, 'link-to-ptah'], realpath }))
      .resolves.toBe('link-to-ptah');
    expect(environment.resolve).not.toHaveBeenCalled();
  });

  it('falls back to resolve when the environment has no checkoutRoot', async () => {
    const environment = { resolve: jest.fn(async () => roots(checkout)) };
    await expect(findRepositoryWorkspaceFolder({ environment, repo, folders: [checkout], realpath: identity }))
      .resolves.toBe(checkout);
  });

  it('gives null when the checkout cannot be found', async () => {
    const environment = { resolve: jest.fn(), checkoutRoot: jest.fn(async () => { throw new Error('not open'); }) };
    await expect(findRepositoryWorkspaceFolder({ environment, repo, folders: [checkout], realpath: identity }))
      .resolves.toBeNull();
  });

  it('skips a folder whose realpath rejects', async () => {
    const environment = { resolve: jest.fn(async () => roots(checkout)) };
    const realpath = jest.fn(async (path: string) => { if (path === 'gone') throw new Error('ENOENT'); return checkout; });
    await expect(findRepositoryWorkspaceFolder({ environment, repo, folders: ['gone', 'present'], realpath }))
      .resolves.toBe('present');
  });

  it('picks the one matching folder of two and gives null when none matches', async () => {
    const environment = { resolve: jest.fn(async () => roots(checkout)) };
    await expect(findRepositoryWorkspaceFolder({ environment, repo, folders: [other, checkout], realpath: identity }))
      .resolves.toBe(checkout);
    await expect(findRepositoryWorkspaceFolder({ environment, repo, folders: [other], realpath: identity }))
      .resolves.toBeNull();
  });
});

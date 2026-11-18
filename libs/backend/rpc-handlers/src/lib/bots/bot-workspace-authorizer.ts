import { inject, injectable } from 'tsyringe';
import * as path from 'node:path';
import {
  PLATFORM_TOKENS,
  type IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import {
  BotDomainError,
  type BotWorkspaceAuthorizationPort,
} from '@ptah-extension/bots';
import { sameWorkspaceRoot } from '../utils/workspace-authorization';

/** Lexical exact-root authorization; does not claim realpath containment. */
@injectable()
export class BotWorkspaceAuthorizer implements BotWorkspaceAuthorizationPort {
  constructor(
    @inject(PLATFORM_TOKENS.WORKSPACE_PROVIDER)
    private readonly workspace: Pick<IWorkspaceProvider, 'getWorkspaceFolders'>,
  ) {}

  async authorize(root: string): Promise<string> {
    const paths = process.platform === 'win32' ? path.win32 : path;
    if (
      !paths.isAbsolute(root) ||
      root.trim() !== root ||
      root.includes('\0') ||
      root.split(/[\\/]+/).includes('..')
    ) {
      throw new BotDomainError(
        'UNAUTHORIZED_WORKSPACE',
        'An absolute open workspace root without traversal is required.',
      );
    }
    const open = this.workspace
      .getWorkspaceFolders()
      .find((folder) => sameWorkspaceRoot(folder, root));
    if (!open)
      throw new BotDomainError(
        'UNAUTHORIZED_WORKSPACE',
        'Workspace is not open.',
      );
    return open;
  }
}

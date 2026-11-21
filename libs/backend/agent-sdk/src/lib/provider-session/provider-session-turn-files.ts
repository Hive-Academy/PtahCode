import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ProviderTurnInput } from '@ptah-extension/provider-session-contracts';
import { ProviderSessionChatAdapterError } from './provider-session-chat-adapter-error';

/** Resolves a path to its canonical form, following links (`fs.promises.realpath`). */
export type ProviderSessionRealpath = (path: string) => Promise<string>;

type TurnFile = NonNullable<ProviderTurnInput['files']>[number];

/**
 * The file references of one turn, confined to the session's workspace. The
 * runtime sends each one as a resource link that the agent reads on its own,
 * outside Ptah's tool approval, so a reference outside the workspace, through
 * a link that leaves it, or to a missing file is refused before the prompt,
 * whichever surface sent it (the renderer or a peer session).
 */
export async function confineTurnFiles(
  files: readonly string[],
  workspacePath: string,
  realpath: ProviderSessionRealpath,
): Promise<TurnFile[]> {
  if (files.length === 0) return [];
  const root = await canonical(resolve(workspacePath), realpath);
  const confined: TurnFile[] = [];
  for (const file of files) {
    if (file.includes('\0')) throw refused();
    const path = resolve(workspacePath, file);
    // Lexical check first, so a path outside never reaches the filesystem.
    if (!inside(resolve(workspacePath), path)) throw refused();
    const real = await canonical(path, realpath);
    if (!inside(root, real)) throw refused();
    // The checked canonical path is sent, so the agent never re-resolves a
    // link that could be swapped after this check; the name stays the one
    // the user referenced.
    confined.push({ path: real, name: basename(path) });
  }
  return confined;
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel === '' ||
    (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

async function canonical(
  path: string,
  realpath: ProviderSessionRealpath,
): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    // A missing or unreadable reference is refused, never sent for the agent
    // to fail on; the cause stays on the error, the path never reaches a log.
    throw refused(error);
  }
}

function refused(cause?: unknown): ProviderSessionChatAdapterError {
  return new ProviderSessionChatAdapterError('unsupported-option', 'files', {
    option: 'files',
    ...(cause === undefined ? {} : { cause }),
  });
}

import type { CodexContext, CodexModelInfo } from '@ptah-extension/codex-runtime';
import type { Logger } from '@ptah-extension/vscode-core';

const CATALOG_TIMEOUT_MS = 8_000;
// Leave time for catalog startup and cleanup before the coordinator's 5 s deadline.
const SKILL_CATALOG_TIMEOUT_MS = 3_000;

export async function listCodexLaneSkills(
  context: CodexContext,
  workingDirectory?: string,
  deadline = Date.now() + SKILL_CATALOG_TIMEOUT_MS,
): Promise<readonly string[]> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Codex skill catalog timed out');
  return context.listSkillCommands?.(workingDirectory, remaining) ?? [];
}

interface CodexLaneCatalog {
  readonly models: readonly CodexModelInfo[];
  readonly skills?: readonly string[];
}

/** Bounds both catalog startup and listing, including a context opened after timeout. */
export async function readCodexLaneCatalog(
  open: () => Promise<CodexContext>,
  logger: Logger,
  workingDirectory?: string,
): Promise<CodexLaneCatalog> {
  const skillDeadline = Date.now() + SKILL_CATALOG_TIMEOUT_MS;
  let timedOut = false;
  let context: CodexContext | undefined;
  let closing: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const closeOnce = (opened: CodexContext): Promise<void> => {
    closing ??= opened.close();
    return closing;
  };
  const operation = (async (): Promise<CodexLaneCatalog> => {
    const opened = await open();
    context = opened;
    if (timedOut) {
      await closeOnce(opened);
      throw new Error('Codex model catalog timed out');
    }
    try {
      const [models, skills] = await Promise.allSettled([
        opened.listModels(),
        workingDirectory ? listCodexLaneSkills(opened, workingDirectory, skillDeadline) : [],
      ]);
      if (models.status === 'rejected') throw models.reason;
      return { models: models.value, ...(skills.status === 'fulfilled' ? { skills: skills.value } : {}) };
    } finally {
      await closeOnce(opened);
    }
  })();
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          if (context) {
            void closeOnce(context).catch((error: unknown) => {
              logger.warn('[CodexAppServerLaneAdapter] Timed-out catalog context close failed', {
                errorClass: error instanceof Error ? error.constructor.name : typeof error,
              });
            });
          }
          reject(new Error('Codex model catalog timed out'));
        }, CATALOG_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

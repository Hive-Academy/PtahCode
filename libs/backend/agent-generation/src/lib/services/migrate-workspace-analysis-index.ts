import type { DependencyContainer } from 'tsyringe';
import { PLATFORM_TOKENS, type IWorkspaceProvider } from '@ptah-extension/platform-core';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { AGENT_GENERATION_TOKENS } from '../di/tokens';
import type { AnalysisClaudeMdLinker } from './analysis-claude-md-linker';

/** Startup boundary: resolution and filesystem failures must remain non-fatal. */
export async function migrateWorkspaceAnalysisIndex(
  container: DependencyContainer,
  workspaceRoot?: string,
): Promise<void> {
  let logger: Logger | undefined;
  try {
    logger = container.resolve<Logger>(TOKENS.LOGGER);
    const root = workspaceRoot ?? container.resolve<IWorkspaceProvider>(
      PLATFORM_TOKENS.WORKSPACE_PROVIDER,
    ).getWorkspaceRoot();
    if (!root || !container.isRegistered(AGENT_GENERATION_TOKENS.ANALYSIS_CLAUDE_MD_LINKER)) return;
    const linker = container.resolve<AnalysisClaudeMdLinker>(
      AGENT_GENERATION_TOKENS.ANALYSIS_CLAUDE_MD_LINKER,
    );
    await linker.migrateLegacyBlock(root);
  } catch (error: unknown) {
    // degradation-audit: reported — startup continues even if DI resolution fails.
    logMigrationFailure(logger, error);
  }
}

/** The log call itself must not throw into startup (a partial logger has no debug). */
function logMigrationFailure(logger: Logger | undefined, error: unknown): void {
  if (typeof logger?.debug !== 'function') return;
  try {
    logger.debug('Could not start CLAUDE.md analysis index migration', {
      error: error instanceof Error ? error.message : String(error),
    });
  } catch (logError: unknown) {
    // degradation-audit: reported — a failing logger must not stop startup.
    void logError;
  }
}

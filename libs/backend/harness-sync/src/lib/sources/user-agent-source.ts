import { promises as nodeFs, type Dirent } from 'fs';
import { join } from 'path';
import {
  AGENT_ORIGINS_FILE,
  AgentOriginsFileSchema,
  WIZARD_STATE_DIR,
} from '../targets/agent-origins-file';
import { wizardAgentHash } from './wizard-agent-hash';

export interface UserAgentFileSystem {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>;
}

export interface UserAgentLog {
  warn(message: string, detail?: unknown): void;
  error(message: string, error: Error): void;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function realError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Workspace agent files that cannot be proved to be unchanged wizard output. */
export async function userAgentFiles(
  workspaceRoot: string,
  log: UserAgentLog,
  fs: UserAgentFileSystem = nodeFs,
): Promise<string[]> {
  const agentsDir = join(workspaceRoot, '.claude', 'agents');
  let recorded: Record<string, { hash: string }> = {};
  try {
    const raw = await fs.readFile(
      join(workspaceRoot, WIZARD_STATE_DIR, AGENT_ORIGINS_FILE),
      'utf8',
    );
    const parsed = AgentOriginsFileSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) {
      log.warn('Invalid agent origin store', parsed.error);
      return [];
    }
    recorded = parsed.data.agents;
  } catch (error) {
    if (!isMissing(error)) {
      if (error instanceof SyntaxError) {
        log.warn('Invalid agent origin store', error);
      } else {
        log.error('Cannot read agent origin store', realError(error));
      }
      return [];
    }
  }
  let entries: Dirent[];
  try {
    entries = await fs.readdir(agentsDir, { withFileTypes: true });
  } catch (error) {
    if (!isMissing(error)) {
      log.error('Cannot list workspace agents', realError(error));
    }
    return [];
  }
  const selected: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const origin = recorded[entry.name.slice(0, -3)];
    if (origin === undefined) {
      selected.push(entry.name);
      continue;
    }
    try {
      const content = await fs.readFile(join(agentsDir, entry.name), 'utf8');
      if (wizardAgentHash(content) !== origin.hash) selected.push(entry.name);
    } catch (error) {
      log.error(
        'Cannot hash workspace agent; treating it as user-written',
        realError(error),
      );
      selected.push(entry.name);
    }
  }
  return selected;
}

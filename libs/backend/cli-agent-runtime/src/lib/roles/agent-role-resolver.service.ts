import { createHash } from 'crypto';
import { isAbsolute, join } from 'path';
import { inject, injectable } from 'tsyringe';
import {
  FileType,
  PLATFORM_TOKENS,
  type IFileSystemProvider,
} from '@ptah-extension/platform-core';
import {
  AGENT_ORIGINS_FILE,
  AgentOriginsFileSchema,
  WIZARD_STATE_DIR,
  extractFrontmatterDescription,
  resolveHarnessWorkspaceRoot,
  stripFrontmatter,
  type AgentOrigins,
} from '@ptah-extension/harness-sync';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import {
  isRetiredRole,
  phaseKindForRole,
  type AgentRoleDefinition,
} from '@ptah-extension/shared';

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isNotFound(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: unknown }).code === 'ENOENT';
  }
  return error instanceof Error && error.message.includes('ENOENT');
}

type RoleFileSystem = Pick<
  IFileSystemProvider,
  'exists' | 'readDirectory' | 'readFile'
>;
type RoleLogger = Pick<Logger, 'warn' | 'error'>;

export const MAX_ROLE_BYTES = 64 * 1024;

const ROLE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ROLE_FILE_EXTENSION = '.md';

export type AgentRoleErrorCode =
  | 'invalid_role_name'
  | 'no_roles'
  | 'unknown_role'
  | 'empty_role'
  | 'role_too_large'
  | 'role_read_failed'
  | 'no_workspace';

export class AgentRoleError extends Error {
  readonly availableRoles: string[];

  constructor(
    readonly code: AgentRoleErrorCode,
    message: string,
    availableRoles: readonly string[] = [],
  ) {
    super(message);
    this.name = 'AgentRoleError';
    this.availableRoles = [...availableRoles];
  }
}

@injectable()
export class AgentRoleResolver {
  constructor(
    @inject(PLATFORM_TOKENS.FILE_SYSTEM_PROVIDER)
    private readonly fileSystem: RoleFileSystem,
    @inject(TOKENS.LOGGER) private readonly logger: RoleLogger,
  ) {}

  /**
   * The roles a caller may name: every file in the agents directory, except
   * a retired built-in role that the setup wizard wrote and nobody changed.
   */
  async listRoles(workspaceRoot: string): Promise<string[]> {
    this.assertWorkspaceRoot(workspaceRoot);
    const harnessRoot = resolveHarnessWorkspaceRoot(workspaceRoot);
    const agentsDir = this.agentsDirFor(harnessRoot);
    const files = await this.listRoleFiles(agentsDir);
    const hidden = await this.hiddenRetiredRoles(harnessRoot, agentsDir, files);
    return files
      .filter((file) => !hidden.has(file.role))
      .map((file) => file.role);
  }

  async resolve(
    workspaceRoot: string,
    role: string,
  ): Promise<AgentRoleDefinition> {
    if (!ROLE_NAME_PATTERN.test(role)) {
      throw new AgentRoleError(
        'invalid_role_name',
        `Invalid role name ${JSON.stringify(role)}. A role name starts with a letter or digit and contains only letters, digits, ".", "_" or "-" (at most 100 characters).`,
      );
    }

    this.assertWorkspaceRoot(workspaceRoot);
    const harnessRoot = resolveHarnessWorkspaceRoot(workspaceRoot);
    const agentsDir = this.agentsDirFor(harnessRoot);
    const roleFiles = await this.listRoleFiles(agentsDir);
    const hidden = await this.hiddenRetiredRoles(
      harnessRoot,
      agentsDir,
      roleFiles,
    );
    const userFiles = roleFiles.filter((file) => !hidden.has(file.role));
    const availableRoles = userFiles.map((file) => file.role);

    if (hidden.has(role)) {
      throw new AgentRoleError(
        'unknown_role',
        `Role "${role}" is retired. Use the "${phaseKindForRole(role)}" phase instead.`,
        availableRoles,
      );
    }

    if (userFiles.length === 0) {
      throw new AgentRoleError(
        'no_roles',
        `No roles are defined for workspace ${harnessRoot}: ${agentsDir} has no role files. Create an agent file in .claude/agents/. Spawning without "role" is valid.`,
      );
    }

    const match = userFiles.find((file) => file.role === role);
    if (!match) {
      throw new AgentRoleError(
        'unknown_role',
        `Unknown role "${role}" for workspace ${harnessRoot}. Available roles: ${availableRoles.join(', ')}.`,
        availableRoles,
      );
    }

    const sourcePath = join(agentsDir, match.fileName);
    let raw: string;
    try {
      raw = await this.fileSystem.readFile(sourcePath);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new AgentRoleError(
        'role_read_failed',
        `Failed to read role "${role}" from ${sourcePath} (workspace ${harnessRoot}): ${reason}. Available roles: ${availableRoles.join(', ')}.`,
        availableRoles,
      );
    }

    const body = stripFrontmatter(raw);
    if (body.trim() === '') {
      throw new AgentRoleError(
        'empty_role',
        `Role "${role}" at ${sourcePath} (workspace ${harnessRoot}) has no content after its frontmatter. Available roles: ${availableRoles.join(', ')}.`,
        availableRoles,
      );
    }

    const bytes = Buffer.byteLength(body, 'utf8');
    if (bytes > MAX_ROLE_BYTES) {
      throw new AgentRoleError(
        'role_too_large',
        `Role "${role}" at ${sourcePath} (workspace ${harnessRoot}) is ${bytes} bytes; the limit is ${MAX_ROLE_BYTES} bytes. Available roles: ${availableRoles.join(', ')}.`,
        availableRoles,
      );
    }

    const description = extractFrontmatterDescription(raw);
    return {
      name: match.role,
      ...(description !== undefined ? { description } : {}),
      body,
      sourcePath,
      bytes,
    };
  }

  private assertWorkspaceRoot(workspaceRoot: string): void {
    if (workspaceRoot.trim() === '' || !isAbsolute(workspaceRoot)) {
      throw new AgentRoleError(
        'no_workspace',
        `No workspace folder is open (received ${JSON.stringify(workspaceRoot)}), so roles cannot be resolved. Spawning without "role" is valid.`,
      );
    }
  }

  private agentsDirFor(harnessRoot: string): string {
    return join(harnessRoot, '.claude', 'agents');
  }

  /**
   * Retired built-in slugs whose file the setup wizard wrote and nobody
   * changed. Only a retired slug with an origin entry is hashed. A file
   * without origin evidence is user-written and stays visible.
   */
  private async hiddenRetiredRoles(
    harnessRoot: string,
    agentsDir: string,
    files: Array<{ role: string; fileName: string }>,
  ): Promise<Set<string>> {
    const hidden = new Set<string>();
    const candidates = files.filter((file) => isRetiredRole(file.role));
    if (candidates.length === 0) {
      return hidden;
    }
    const origins = await this.readOrigins(harnessRoot);
    for (const file of candidates) {
      const origin = origins[file.role];
      if (!origin) {
        continue;
      }
      const hash = await this.hashRoleFile(join(agentsDir, file.fileName));
      if (hash !== null && hash === origin.hash) {
        hidden.add(file.role);
      }
    }
    return hidden;
  }

  private async hashRoleFile(sourcePath: string): Promise<string | null> {
    try {
      const raw = await this.fileSystem.readFile(sourcePath);
      const content = raw.replace(/\r\n/g, '\n');
      return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
    } catch (error: unknown) {
      if (!isNotFound(error)) {
        this.logger.error(
          `[AgentRoleResolver] Failed to read ${sourcePath} for origin check`,
          toError(error),
        );
      }
      return null;
    }
  }

  private async readOrigins(harnessRoot: string): Promise<AgentOrigins> {
    const storePath = join(harnessRoot, WIZARD_STATE_DIR, AGENT_ORIGINS_FILE);
    try {
      const raw = await this.fileSystem.readFile(storePath);
      const parsed = AgentOriginsFileSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        this.logger.warn(
          `[AgentRoleResolver] Ignored invalid origin store ${storePath}: ${parsed.error.message}`,
        );
        return {};
      }
      return parsed.data.agents;
    } catch (error: unknown) {
      if (!isNotFound(error)) {
        this.logger.error(
          `[AgentRoleResolver] Failed to read origin store ${storePath}`,
          toError(error),
        );
      }
      return {};
    }
  }

  private async listRoleFiles(
    agentsDir: string,
  ): Promise<Array<{ role: string; fileName: string }>> {
    try {
      if (!(await this.fileSystem.exists(agentsDir))) {
        return [];
      }
      const entries = await this.fileSystem.readDirectory(agentsDir);
      return entries
        .filter(
          (entry) =>
            entry.type === FileType.File &&
            entry.name.endsWith(ROLE_FILE_EXTENSION),
        )
        .map((entry) => ({
          role: entry.name.slice(0, -ROLE_FILE_EXTENSION.length),
          fileName: entry.name,
        }))
        .sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new AgentRoleError(
        'role_read_failed',
        `Failed to list roles in ${agentsDir}: ${reason}.`,
      );
    }
  }
}

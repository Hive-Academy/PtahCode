import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isRetiredRole } from '@ptah-extension/shared';
import {
  AGENT_ORIGINS_FILE,
  AgentOriginsFileSchema,
  WIZARD_STATE_DIR,
} from './agent-origins-file';

/** Only an unchanged wizard-written agent is retired from mirror and sync. */
export function isRetiredPtahAgent(
  harnessRoot: string,
  slug: string,
  sourceFile: string,
): boolean {
  if (!isRetiredRole(slug)) return false;
  try {
    const raw = readFileSync(
      join(harnessRoot, WIZARD_STATE_DIR, AGENT_ORIGINS_FILE),
      'utf8',
    );
    const parsed = AgentOriginsFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return false;
    const recorded = parsed.data.agents[slug]?.hash;
    if (recorded === undefined) return false;
    const hash = (file: string): string => {
      const content = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
    };
    const workspaceFile = join(harnessRoot, '.claude', 'agents', `${slug}.md`);
    return recorded === hash(workspaceFile) && recorded === hash(sourceFile);
  } catch {
    // degradation-audit: optional-capability - an unreadable origin store or source cannot prove wizard ownership.
    return false;
  }
}

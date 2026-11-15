import { join } from 'path';
import { z } from 'zod';

/** Directory under the harness root that holds setup-wizard bookkeeping. */
export const WIZARD_STATE_DIR = join('.ptah', 'setup-wizard');
export const AGENT_ORIGINS_FILE = 'agent-origins.json';
export const AGENT_ORIGINS_VERSION = 1;

export const AgentOriginEntrySchema = z.object({
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  writtenAt: z.number().int().nonnegative(),
});

export const AgentOriginsFileSchema = z.object({
  version: z.literal(AGENT_ORIGINS_VERSION),
  agents: z.record(z.string().min(1), AgentOriginEntrySchema),
});

export type AgentOriginEntry = z.infer<typeof AgentOriginEntrySchema>;
export type AgentOriginsFile = z.infer<typeof AgentOriginsFileSchema>;
export type AgentOrigins = AgentOriginsFile['agents'];

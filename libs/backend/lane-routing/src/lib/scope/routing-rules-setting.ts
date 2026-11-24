import { z } from 'zod';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import {
  PHASE_KINDS,
  ROUTING_RULES_SETTING_KEY,
  TASK_TYPES,
  type PhaseKind,
  type RoutingRule,
  type RoutingRuleMatchValue,
  type TaskType,
} from '@ptah-extension/shared';
import {
  PhaseShapeSchema,
  type PhaseShape,
} from '../contracts/route-decide-args.schema';
import {
  ModelEffortSchema,
  ModelTierSchema,
  type ModelTier,
} from '../contracts/route-decide-result.schema';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import { ROUTING_RULE_ID_PATTERN } from '../routing-constants';

export const MAX_ROUTING_RULES = 64;
export const MAX_ROUTING_RULE_SELECTORS = 32;

/** One id rule for the reader and the `user-rule:<id>` exclusion schema. */
const RULE_ID_PATTERN = ROUTING_RULE_ID_PATTERN;
const MAX_DIAGNOSTIC_REASON_CHARS = 160;

const TIER_ORDER: Readonly<Record<ModelTier, number>> = {
  haiku: 0,
  sonnet: 1,
  opus: 2,
};

const RoleValueSchema = z.string().trim().min(1).max(64);
const SelectorListSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(MAX_ROUTING_RULE_SELECTORS);

function oneOrMany<T extends z.ZodTypeAny>(schema: T) {
  return z.union([
    schema,
    z.array(schema).min(1).max(MAX_ROUTING_RULE_SELECTORS),
  ]);
}

const RoutingRuleMatchSchema = z
  .object({
    kind: oneOrMany(z.enum(PHASE_KINDS)).optional(),
    shape: oneOrMany(PhaseShapeSchema).optional(),
    taskType: oneOrMany(z.enum(TASK_TYPES)).optional(),
    role: oneOrMany(RoleValueSchema).optional(),
  })
  .strict();

const RoutingRuleSetSchema = z
  .object({
    minTier: ModelTierSchema.optional(),
    maxTier: ModelTierSchema.optional(),
    effort: ModelEffortSchema.optional(),
    prefer: SelectorListSchema.optional(),
    exclude: SelectorListSchema.optional(),
  })
  .strict();

const RoutingRuleSchema = z
  .object({
    id: z.string().regex(RULE_ID_PATTERN, 'id must match [A-Za-z0-9._-]{1,64}'),
    match: RoutingRuleMatchSchema,
    set: RoutingRuleSetSchema,
  })
  .strict();

export interface RoutingRulesReadResult {
  readonly rules: RoutingRule[];
  readonly diagnostics: string[];
}

export interface RoutingRuleMatchPhase {
  readonly kind: PhaseKind;
  readonly shape?: PhaseShape;
  readonly role?: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ruleLabel(rawEntry: unknown, index: number): string {
  if (isPlainRecord(rawEntry) && typeof rawEntry['id'] === 'string') {
    const id = rawEntry['id'];
    if (RULE_ID_PATTERN.test(id)) {
      return id;
    }
  }
  return String(index);
}

function sanitizeReason(reason: string): string {
  const cleaned = reason.replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= MAX_DIAGNOSTIC_REASON_CHARS) {
    return cleaned;
  }
  return `${cleaned.slice(0, MAX_DIAGNOSTIC_REASON_CHARS - 3)}...`;
}

function formatZodFailure(error: z.ZodError): string {
  const first = error.issues[0];
  if (first === undefined) {
    return 'invalid rule';
  }
  const path = first.path.length > 0 ? `${first.path.join('.')}: ` : '';
  return sanitizeReason(`${path}${first.message}`);
}

function hasAnySetField(set: RoutingRule['set']): boolean {
  return (
    set.minTier !== undefined ||
    set.maxTier !== undefined ||
    set.effort !== undefined ||
    set.prefer !== undefined ||
    set.exclude !== undefined
  );
}

/**
 * Validates raw configuration for `ptah.agentOrchestration.routingRules`.
 * Invalid rules are dropped and reported while valid siblings stay in order.
 */
export function readRoutingRules(raw: unknown): RoutingRulesReadResult {
  if (raw === undefined) {
    return { rules: [], diagnostics: [] };
  }
  if (!Array.isArray(raw)) {
    return {
      rules: [],
      diagnostics: ['routing rules setting must be an array'],
    };
  }

  const rules: RoutingRule[] = [];
  const diagnostics: string[] = [];
  const seenIds = new Set<string>();

  const limit = Math.min(raw.length, MAX_ROUTING_RULES);
  if (raw.length > MAX_ROUTING_RULES) {
    diagnostics.push(
      `routing rules list truncated to ${MAX_ROUTING_RULES} entries`,
    );
  }

  for (let index = 0; index < limit; index += 1) {
    const entry: unknown = raw[index];
    const parsed = RoutingRuleSchema.safeParse(entry);
    if (!parsed.success) {
      diagnostics.push(
        `routing rule ${ruleLabel(entry, index)}: ${formatZodFailure(parsed.error)}`,
      );
      continue;
    }

    const rule: RoutingRule = parsed.data;
    if (!hasAnySetField(rule.set)) {
      diagnostics.push(
        `routing rule ${rule.id}: set must specify at least one field`,
      );
      continue;
    }
    if (
      rule.set.minTier !== undefined &&
      rule.set.maxTier !== undefined &&
      TIER_ORDER[rule.set.minTier] > TIER_ORDER[rule.set.maxTier]
    ) {
      diagnostics.push(
        `routing rule ${rule.id}: minTier ${rule.set.minTier} is above maxTier ${rule.set.maxTier}`,
      );
      continue;
    }
    if (seenIds.has(rule.id)) {
      diagnostics.push(`routing rule ${rule.id}: duplicate id`);
      continue;
    }

    seenIds.add(rule.id);
    rules.push(rule);
  }

  return { rules, diagnostics };
}

function matchesField<T>(
  expected: RoutingRuleMatchValue<T> | undefined,
  actual: T | undefined,
): boolean {
  if (expected === undefined) {
    return true;
  }
  if (actual === undefined) {
    return false;
  }
  return Array.isArray(expected)
    ? (expected as readonly T[]).includes(actual)
    : expected === actual;
}

/**
 * Returns the first rule whose match fields all match the phase (AND across
 * fields, OR inside an array field; an empty match object matches every phase).
 */
export function matchRoutingRule(
  phase: RoutingRuleMatchPhase,
  taskType: TaskType,
  rules: readonly RoutingRule[],
): RoutingRule | undefined {
  return rules.find(
    (rule) =>
      matchesField(rule.match.kind, phase.kind) &&
      matchesField(rule.match.shape, phase.shape) &&
      matchesField(rule.match.taskType, taskType) &&
      matchesField(rule.match.role, phase.role),
  );
}

/** Reads and validates `ptah.agentOrchestration.routingRules` for each routing decision. */
export class RoutingRulesSetting {
  constructor(
    private readonly workspace: IWorkspaceProvider,
    private readonly logger: LaneRoutingLogger,
  ) {}

  read(): RoutingRulesReadResult {
    try {
      const raw = this.workspace.getConfiguration<unknown>(
        'ptah',
        ROUTING_RULES_SETTING_KEY,
      );
      return readRoutingRules(raw);
    } catch (error: unknown) {
      // degradation-audit: reported - unreadable settings fall back to no routing rules and report one diagnostic.
      this.logger.warn('Routing rules setting read failed', {
        code: error instanceof Error ? error.name : 'UNKNOWN',
      });
      return {
        rules: [],
        diagnostics: ['routing rules setting could not be read'],
      };
    }
  }
}

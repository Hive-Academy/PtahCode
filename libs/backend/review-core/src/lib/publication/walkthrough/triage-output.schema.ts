import { z } from 'zod';
import { cut } from './walkthrough-text';

/** A repository-relative path the model names. Absolute and parent-escaping paths are rejected. */
const RepoPathSchema = z.string().trim().min(1).max(300)
  .refine((value) => !/^(?:[A-Za-z]:|[\\/])/.test(value) && !value.split(/[\\/]/).includes('..'),
    'Path must be repository-relative');

/** Over-long text is cut, not rejected: a cosmetic deviation must not lose the review. */
const text = (max: number) => z.string().trim().min(1).transform((value) => cut(value, max));

/** A list longer than `max` keeps its first `max` items. */
const list = <T extends z.ZodType>(item: T, max: number) => z.array(item).transform((items) => items.slice(0, max));

/** Paths that are not repository-relative are dropped, never shown. */
const pathList = z.array(z.unknown()).transform((items) => items
  .flatMap((item) => { const parsed = RepoPathSchema.safeParse(item); return parsed.success ? [parsed.data] : []; })
  .slice(0, 20));

export const TriageRiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type TriageRiskLevel = z.infer<typeof TriageRiskLevelSchema>;

export const TriageChangeTypeSchema = z.enum(['feature', 'fix', 'refactor', 'docs', 'test', 'chore', 'mixed']);
export type TriageChangeType = z.infer<typeof TriageChangeTypeSchema>;

const AreaSchema = z.object({
  name: text(60),
  paths: pathList,
  summary: text(200),
  details: list(text(240), 4),
});

const RiskSchema = z.object({ title: text(100), detail: text(300), verify: text(200) });

const ApiChangeSchema = z.object({
  symbol: text(100),
  change: z.enum(['added', 'changed', 'removed']),
  impact: text(200),
  callers: list(text(120), 5),
});

const DiagramSchema = z.object({
  title: text(80),
  participants: z.array(z.object({ id: text(40), label: text(40) })).min(2).max(8),
  steps: z.array(z.object({ from: text(40), to: text(40), label: text(80) })).min(1).max(16),
});

/**
 * Structured triage result. The model returns data; the renderer owns every character of layout.
 * The schema is tolerant: unknown keys are ignored, over-long text is cut, bad paths are dropped,
 * and an unusable diagram is left out. Anything else still fails and selects a safe fallback render.
 */
export const TriageOutputSchema = z.object({
  schemaVersion: z.literal(1),
  summary: text(400),
  changeType: TriageChangeTypeSchema.catch('mixed'),
  risk: z.object({ level: TriageRiskLevelSchema, reason: text(160) }),
  areas: list(AreaSchema, 10).refine((items) => items.length > 0, 'At least one area is required'),
  risks: list(RiskSchema, 8),
  apiChanges: list(ApiChangeSchema, 10),
  tests: z.object({ summary: text(240), gaps: list(text(160), 5) }),
  /** A bad diagram is dropped, not fatal: the diagram is optional. */
  diagram: z.unknown().transform((value) => { const parsed = DiagramSchema.safeParse(value); return parsed.success ? parsed.data : undefined; }).optional(),
});
export type TriageOutput = z.infer<typeof TriageOutputSchema>;
export type TriageDiagram = z.infer<typeof DiagramSchema>;

/** What the publication stage holds: structured triage, or the text of an earlier-format attempt. */
export type TriageContent =
  | { readonly kind: 'structured'; readonly triage: TriageOutput }
  | { readonly kind: 'legacy'; readonly text: string }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** Byte order mark. Some editors and tools put it at the start of a JSON file. */
const BOM = String.fromCharCode(0xfeff);

const TriageJsonSchema = z.string().transform((raw, ctx): unknown => {
  try { return JSON.parse(raw.startsWith(BOM) ? raw.slice(1) : raw); } catch (error: unknown) {
    ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Invalid JSON' });
    return z.NEVER;
  }
}).pipe(TriageOutputSchema);

export type TriageParseResult =
  | { readonly ok: true; readonly triage: TriageOutput }
  | { readonly ok: false; readonly issues: string };

/** Parses `triage.json`. A failure names the schema paths only, never the model text. Never throws. */
export function parseTriageOutputDetailed(raw: string): TriageParseResult {
  const parsed = TriageJsonSchema.safeParse(raw);
  if (parsed.success) return { ok: true, triage: parsed.data };
  const issues = parsed.error.issues.slice(0, 6)
    .map((issue) => issue.path.map(String).join('.') || '<root>').join(', ');
  return { ok: false, issues };
}

/** Returns the parsed triage, or null for invalid JSON or a schema mismatch. Never throws. */
export function parseTriageOutput(raw: string): TriageOutput | null {
  const parsed = parseTriageOutputDetailed(raw);
  return parsed.ok ? parsed.triage : null;
}

/** The earlier walkthrough.md format needs these three headings. */
export function hasLegacyHeadings(text: string): boolean {
  return /^#{1,3} Observed behavior\s*$/mi.test(text) && /^#{1,3} Inferred risks\s*$/mi.test(text) &&
    /^#{1,3} Risk map\s*$/mi.test(text);
}

import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { normalizeWorkspaceRoot } from '@ptah-extension/platform-core';
import {
  PERSISTENCE_TOKENS,
  type SqliteConnectionService,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import { PHASE_KINDS, ROLE_PHASE_ALIASES, type PhaseKind } from '@ptah-extension/shared';
import type { SkillRegistryKind } from './skill-registry.store';

/**
 * Subject kind of a grade. `phase` grades (migration 0075) key on the phase
 * kind of a lane row of any executor kind; the slug is the phase kind.
 */
export type GradeSubjectKind = SkillRegistryKind | 'phase';

export interface SkillTaskGrade {
  readonly taskId: string;
  readonly subjectKind: GradeSubjectKind;
  readonly subjectSlug: string;
  readonly attributionKey: string;
  readonly runId: string | null;
  readonly verdict: 'pass' | 'fail';
  readonly sourceFile: string | null;
  readonly sourceDigest: string | null;
  readonly evidenceSource: string;
  readonly workspaceRoot: string | null;
  readonly gradedAt: number;
  readonly findingsRef: string | null;
  /** Phase kind of the graded lane row (0075). Null or absent on legacy rows. */
  readonly phaseKind?: PhaseKind | null;
  /** Executor kind of the graded lane row (0075). Null or absent on legacy rows. */
  readonly executorKind?: string | null;
}

/**
 * One phase scorecard input row. `legacy` rows are role grades whose slug is in
 * `ROLE_PHASE_ALIASES`; they are read through the alias and never rewritten.
 */
export interface PhaseGradeAggregate extends SkillTaskGradeAggregate {
  readonly phaseKind: PhaseKind;
  readonly legacy: boolean;
  /** The role slugs whose legacy grades were read through the alias. */
  readonly aliasedRoles: readonly string[];
}

export interface SkillTaskGradeAggregate {
  readonly graded: number;
  readonly passed: number;
  readonly successRate: number | null;
}

export interface GradeAttribution {
  readonly kind: GradeSubjectKind;
  readonly slug: string;
  readonly runId: string | null;
  readonly sessionId: string | null;
  readonly attributionKey: string;
  readonly finalReview: 'approved' | 'rejected' | null;
  readonly phaseKind: PhaseKind | null;
  readonly executorKind: string | null;
}

const KindSchema = z.enum(['skill', 'agent', 'command', 'phase']);
/** An unknown stored phase kind reads as null; it never fails the row. */
const PhaseKindColumnSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value): PhaseKind | null => toPhaseKind(value ?? null));
const AttributionRowSchema = z.object({
  kind: KindSchema,
  slug: z.string(),
  run_id: z.string().nullable(),
  session_id: z.string().nullable(),
  attribution_key: z.string(),
  final_review: z.enum(['approved', 'rejected']).nullable(),
  workspace_root: z.string().nullable(),
  phase_kind: PhaseKindColumnSchema,
  executor_kind: z.string().nullable().optional().transform((value) => value ?? null),
});
type RawAttribution = z.infer<typeof AttributionRowSchema>;

function toPhaseKind(value: string | null): PhaseKind | null {
  return PHASE_KINDS.find((kind) => kind === value) ?? null;
}

/** Role slugs that read as legacy rows of one phase kind. */
export function rolesForPhase(phaseKind: PhaseKind): string[] {
  return Object.entries(ROLE_PHASE_ALIASES)
    .filter(([, phase]) => phase === phaseKind)
    .map(([role]) => role)
    .sort();
}

export function groupGradeAttributions(rows: readonly RawAttribution[]): GradeAttribution[] {
  const grouped = new Map<string, RawAttribution | null>();
  for (const row of rows) {
    const key = `${row.kind}:${row.slug}:${row.attribution_key}`;
    if (!grouped.has(key)) grouped.set(key, row);
    else {
      const previous = grouped.get(key);
      if (!previous || !row.run_id || previous.session_id !== row.session_id) grouped.set(key, null);
    }
  }
  return [...grouped.values()].filter((row): row is RawAttribution => row !== null).map((row) => ({
    kind: row.kind, slug: row.slug, runId: row.run_id, sessionId: row.session_id,
    attributionKey: row.attribution_key, finalReview: row.final_review,
    phaseKind: row.phase_kind, executorKind: row.executor_kind,
  }));
}

const AggregateRowSchema = z.object({ graded: z.number(), passed: z.number() });
const PruneRowSchema = z.object({
  subject_kind: KindSchema,
  subject_slug: z.string(),
  attribution_key: z.string(),
});
const GradeRowSchema = z.object({
  task_id: z.string(),
  subject_kind: KindSchema,
  subject_slug: z.string(),
  attribution_key: z.string(),
  run_id: z.string().nullable(),
  verdict: z.enum(['pass', 'fail']),
  source_file: z.string().nullable(),
  source_digest: z.string().nullable(),
  evidence_source: z.string(),
  workspace_root: z.string().nullable(),
  graded_at: z.number(),
  findings_ref: z.string().nullable(),
  phase_kind: PhaseKindColumnSchema,
  executor_kind: z.string().nullable().optional().transform((value) => value ?? null),
});

@injectable()
export class SkillTaskGradeStore {
  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(PERSISTENCE_TOKENS.SQLITE_CONNECTION)
    private readonly connection: SqliteConnectionService,
  ) {}

  private get db(): SqliteDatabase {
    return this.connection.db;
  }

  private parseRow<T>(schema: z.ZodType<T>, row: unknown): T {
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      this.logger.warn('[skill-synthesis] invalid task grade row');
      throw new Error('Invalid task grade row');
    }
    return parsed.data;
  }

  /**
   * Insert or update one grade. A conflicting row is updated only when it has
   * no workspace root yet (legacy 0056 backfill, adopted here) or the same
   * normalized root; a row owned by another workspace is never overwritten.
   * Returns false when the write was refused for that reason.
   */
  upsert(grade: SkillTaskGrade): boolean {
    const result = this.db.prepare(`INSERT INTO skill_task_grades (
      task_id, subject_kind, subject_slug, attribution_key, run_id, verdict,
      source_file, source_digest, evidence_source, workspace_root, graded_at, findings_ref,
      phase_kind, executor_kind
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id, subject_kind, subject_slug, attribution_key) DO UPDATE SET
      run_id = excluded.run_id,
      phase_kind = excluded.phase_kind,
      executor_kind = excluded.executor_kind,
      verdict = excluded.verdict,
      source_file = excluded.source_file,
      source_digest = excluded.source_digest,
      evidence_source = excluded.evidence_source,
      workspace_root = excluded.workspace_root,
      graded_at = excluded.graded_at,
      findings_ref = excluded.findings_ref
    WHERE skill_task_grades.workspace_root IS NULL
      OR skill_task_grades.workspace_root = excluded.workspace_root`).run(
      grade.taskId, grade.subjectKind, grade.subjectSlug, grade.attributionKey,
      grade.runId, grade.verdict, grade.sourceFile, grade.sourceDigest,
      grade.evidenceSource, grade.workspaceRoot === null ? null : normalizeWorkspaceRoot(grade.workspaceRoot),
      grade.gradedAt, grade.findingsRef, grade.phaseKind ?? null, grade.executorKind ?? null,
    );
    return result.changes > 0;
  }

  /**
   * Only exact task or uniquely linked session facts are eligible.
   *
   * Three sources: skill invocation events (skill, agent or command), role lane
   * rows (`executor_kind = 'subagent'` with a registered agent role) and phase
   * lane rows (any executor kind with a `phase_kind`; subject kind `phase`, slug
   * = the phase kind). One lane row can give a role and a phase attribution. Both
   * are written as separate subjects; the phase scorecard reads only one of them
   * (see `getPhaseAggregates`), so the row is never counted twice in one total.
   */
  findAttributions(taskId: string, workspaceRoot: string): GradeAttribution[] {
    const normalizedRoot = normalizeWorkspaceRoot(workspaceRoot);
    const rows = this.db.prepare(`SELECT
      CASE WHEN e.source = 'subagent' THEN 'agent'
           WHEN e.source = 'slash-command' THEN 'command' ELSE 'skill' END AS kind,
      e.skill_slug AS slug, e.run_id, e.session_id,
      CASE WHEN e.run_id IS NOT NULL THEN 'run:' || e.run_id ELSE 'event:' || e.id END AS attribution_key,
      l.final_review, e.workspace_root, l.phase_kind, l.executor_kind
      FROM skill_invocation_events e
      LEFT JOIN lane_outcome_records l ON l.run_id = e.run_id
      WHERE e.source IN ('subagent', 'tool-use', 'slash-command')
        AND e.skill_slug <> ''
        AND EXISTS (SELECT 1 FROM skill_registry registry
          WHERE registry.slug = e.skill_slug AND registry.kind =
            CASE WHEN e.source = 'subagent' THEN 'agent'
              WHEN e.source = 'slash-command' THEN 'command' ELSE 'skill' END)
        AND (e.task_id = ? OR (e.task_id IS NULL AND EXISTS (
          SELECT 1 FROM session_task_links s
          WHERE s.workspace_root = e.workspace_root AND s.session_id = e.session_id AND s.task_id = ?
            AND NOT EXISTS (SELECT 1 FROM session_task_links other
              WHERE other.workspace_root = s.workspace_root AND other.session_id = s.session_id
                AND other.task_id <> s.task_id)
        )))`).all(taskId, taskId).map((row) => this.parseRow(AttributionRowSchema, row))
      .filter((row) => row.workspace_root !== null && normalizeWorkspaceRoot(row.workspace_root) === normalizedRoot);
    const laneRows = this.db.prepare(`SELECT 'agent' AS kind, role AS slug,
      run_id, subagent_session_id AS session_id, 'run:' || run_id AS attribution_key,
      final_review, workspace_root, phase_kind, executor_kind FROM lane_outcome_records
      WHERE task_id = ? AND role IS NOT NULL AND role <> ''
        AND EXISTS (SELECT 1 FROM skill_registry registry
          WHERE registry.slug = lane_outcome_records.role AND registry.kind = 'agent')
        AND executor_kind = 'subagent'`).all(taskId).map((row) => this.parseRow(AttributionRowSchema, row))
      .filter((row) => row.workspace_root !== null && normalizeWorkspaceRoot(row.workspace_root) === normalizedRoot);
    for (const row of laneRows) {
      if (!rows.some((event) => event.kind === row.kind && event.slug === row.slug && event.run_id === row.run_id)) rows.push(row);
    }
    // Phase rows: every executor kind. An unknown phase kind reads as null and is dropped.
    const phaseRows = this.db.prepare(`SELECT 'phase' AS kind, phase_kind AS slug,
      run_id, subagent_session_id AS session_id, 'run:' || run_id AS attribution_key,
      final_review, workspace_root, phase_kind, executor_kind FROM lane_outcome_records
      WHERE (task_id = ? OR (task_id IS NULL AND parent_session_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM session_task_links s
        WHERE s.workspace_root = lane_outcome_records.workspace_root
          AND s.session_id = lane_outcome_records.parent_session_id AND s.task_id = ?
          AND NOT EXISTS (SELECT 1 FROM session_task_links other
            WHERE other.workspace_root = s.workspace_root AND other.session_id = s.session_id
              AND other.task_id <> s.task_id)
      ))) AND phase_kind IS NOT NULL AND phase_kind <> ''`).all(taskId, taskId)
      .map((row) => this.parseRow(AttributionRowSchema, row))
      .filter((row) => row.phase_kind !== null
        && row.workspace_root !== null && normalizeWorkspaceRoot(row.workspace_root) === normalizedRoot);
    rows.push(...phaseRows);
    return groupGradeAttributions(rows);
  }

  removeAbsent(taskId: string, workspaceRoot: string, keys: readonly string[]): number {
    // An empty keep-list means all current attributions were skipped; remove stale non-spec grades.
    const normalizedRoot = normalizeWorkspaceRoot(workspaceRoot);
    const rows = this.db.prepare(`SELECT subject_kind, subject_slug, attribution_key FROM skill_task_grades
      WHERE task_id = ? AND workspace_root = ? AND evidence_source NOT LIKE 'spec:%'`).all(taskId, normalizedRoot)
      .map((row) => this.parseRow(PruneRowSchema, row));
    const keep = new Set(keys);
    const remove = this.db.prepare(`DELETE FROM skill_task_grades
      WHERE task_id = ? AND workspace_root = ? AND subject_kind = ? AND subject_slug = ? AND attribution_key = ?
        AND evidence_source NOT LIKE 'spec:%'`);
    let removed = 0;
    for (const row of rows) if (!keep.has(`${row.subject_kind}:${row.subject_slug}:${row.attribution_key}`))
      removed += remove.run(taskId, normalizedRoot, row.subject_kind, row.subject_slug, row.attribution_key).changes;
    return removed;
  }

  /** True when a grade exists for the task and slug; scoped to one workspace when a root is given. */
  hasGradeForTask(taskId: string, slug: string, kind?: GradeSubjectKind, workspaceRoot?: string): boolean {
    const root = workspaceRoot === undefined ? null : normalizeWorkspaceRoot(workspaceRoot);
    const row = this.db.prepare(`SELECT 1 FROM skill_task_grades
      WHERE task_id = ? AND subject_slug = ? AND (? IS NULL OR subject_kind = ?)
        AND (? IS NULL OR workspace_root = ?) LIMIT 1`)
      .get(taskId, slug, kind ?? null, kind ?? null, root, root);
    return row !== undefined;
  }

  /**
   * Phase scorecard inputs for one workspace. For each phase kind it returns one
   * current row (`subject_kind = 'phase'`) and, when legacy grades exist, one
   * legacy row: role grades whose slug maps to the phase in `ROLE_PHASE_ALIASES`.
   * A role grade is excluded when its run has a phase grade, including a
   * subagent run stored with either raw or prefixed agent ID. Paired raw and
   * prefixed agent grades count once in legacy totals; stored rows are unchanged.
   */
  getPhaseAggregates(workspaceRoot: string | null): PhaseGradeAggregate[] {
    if (!workspaceRoot) return [];
    const normalizedRoot = normalizeWorkspaceRoot(workspaceRoot);
    const current = this.db.prepare(`SELECT COUNT(*) AS graded,
      COALESCE(SUM(CASE WHEN verdict = 'pass' THEN 1 ELSE 0 END), 0) AS passed
      FROM skill_task_grades INDEXED BY idx_skill_task_grades_subject
      WHERE subject_kind = 'phase' AND subject_slug = ? AND workspace_root = ?`);
    const legacy = this.db.prepare(`SELECT COUNT(*) AS graded,
      COALESCE(SUM(CASE WHEN g.verdict = 'pass' THEN 1 ELSE 0 END), 0) AS passed
      FROM skill_task_grades g INDEXED BY idx_skill_task_grades_subject
      WHERE g.subject_kind = 'agent' AND g.subject_slug = ? AND g.workspace_root = ?
        AND NOT EXISTS (SELECT 1 FROM skill_task_grades p
          WHERE p.subject_kind = 'phase' AND p.task_id = g.task_id
            AND p.workspace_root = g.workspace_root
            AND (p.attribution_key = g.attribution_key OR
              (g.attribution_key LIKE 'run:%' AND g.attribution_key NOT LIKE 'run:subagent:%'
                AND p.attribution_key = 'run:subagent:' || substr(g.attribution_key, 5))))
        AND NOT EXISTS (SELECT 1 FROM skill_task_grades g2
          WHERE g.attribution_key LIKE 'run:%' AND g.attribution_key NOT LIKE 'run:subagent:%'
            AND g2.subject_kind = 'agent' AND g2.task_id = g.task_id
            AND g2.workspace_root = g.workspace_root AND g2.subject_slug = g.subject_slug
            AND g2.attribution_key = 'run:subagent:' || substr(g.attribution_key, 5))`);
    const result: PhaseGradeAggregate[] = [];
    for (const phaseKind of PHASE_KINDS) {
      const row = this.parseRow(AggregateRowSchema, current.get(phaseKind, normalizedRoot));
      result.push(toPhaseAggregate(phaseKind, false, [], row.graded, row.passed));
      let graded = 0;
      let passed = 0;
      const aliasedRoles: string[] = [];
      for (const role of rolesForPhase(phaseKind)) {
        const roleRow = this.parseRow(AggregateRowSchema, legacy.get(role, normalizedRoot));
        if (roleRow.graded === 0) continue;
        aliasedRoles.push(role);
        graded += roleRow.graded;
        passed += roleRow.passed;
      }
      if (graded > 0) result.push(toPhaseAggregate(phaseKind, true, aliasedRoles, graded, passed));
    }
    return result;
  }

  getAggregates(kind: GradeSubjectKind, slugs: readonly string[], workspaceRoot: string | null): Map<string, SkillTaskGradeAggregate> {
    const result = new Map<string, SkillTaskGradeAggregate>();
    const normalizedRoot = workspaceRoot ? normalizeWorkspaceRoot(workspaceRoot) : null;
    const stmt = this.db.prepare(`SELECT COUNT(*) AS graded,
      COALESCE(SUM(CASE WHEN verdict = 'pass' THEN 1 ELSE 0 END), 0) AS passed
      FROM skill_task_grades INDEXED BY idx_skill_task_grades_subject
      WHERE subject_kind = ? AND subject_slug = ? AND workspace_root = ?`);
    for (const slug of slugs) {
      const row = this.parseRow(AggregateRowSchema, stmt.get(kind, slug, normalizedRoot));
      result.set(slug, {
        graded: row.graded,
        passed: row.passed,
        successRate: row.graded > 0 ? row.passed / row.graded : null,
      });
    }
    return result;
  }

  listRecent(kind: GradeSubjectKind, slug: string, limit: number, workspaceRoot: string | null): SkillTaskGrade[] {
    const normalizedRoot = workspaceRoot ? normalizeWorkspaceRoot(workspaceRoot) : null;
    const rows = this.db.prepare(`SELECT * FROM skill_task_grades
      INDEXED BY idx_skill_task_grades_subject
      WHERE subject_kind = ? AND subject_slug = ? AND workspace_root = ?
      ORDER BY graded_at DESC LIMIT ?`).all(kind, slug, normalizedRoot, limit)
      .map((row) => this.parseRow(GradeRowSchema, row));
    return rows.map((row) => ({
      taskId: row.task_id,
      subjectKind: row.subject_kind,
      subjectSlug: row.subject_slug,
      attributionKey: row.attribution_key,
      runId: row.run_id,
      verdict: row.verdict,
      sourceFile: row.source_file,
      sourceDigest: row.source_digest,
      evidenceSource: row.evidence_source,
      workspaceRoot: row.workspace_root,
      gradedAt: row.graded_at,
      findingsRef: row.findings_ref,
      phaseKind: row.phase_kind,
      executorKind: row.executor_kind,
    }));
  }
}

function toPhaseAggregate(
  phaseKind: PhaseKind,
  legacy: boolean,
  aliasedRoles: readonly string[],
  graded: number,
  passed: number,
): PhaseGradeAggregate {
  return { phaseKind, legacy, aliasedRoles, graded, passed, successRate: graded > 0 ? passed / graded : null };
}

/**
 * Graph view of the memory store for `memory:graph`: the selected memories as
 * nodes, and three kinds of undirected edges between them.
 *
 * - `semantic`: exact pairwise cosine similarity over the selected nodes
 *   only. `scopedVectorCandidates` is not used here: it post-filters a global
 *   top-N and would drop neighbors of the selected nodes on a large database.
 * - `subject` and `session`: one chain per group ordered by creation time
 *   (n - 1 edges), not a clique.
 *
 * `buildMemoryGraph` is synchronous and has no collaborators besides the
 * database, so the search worker and the in-process fallback share it. The
 * pairwise step is O(n²·384); callers on the main thread pass
 * `semantic: false`.
 */
import {
  MEMORY_GRAPH_LIMITS,
  type MemoryGraphEdgeKind,
  type MemoryGraphEdgeWire,
  type MemoryGraphNodeWire,
  type MemoryGraphParams,
  type MemoryGraphResult,
  type MemoryKindWire,
  type MemoryTierWire,
} from '@ptah-extension/shared';
import type { SqliteDatabase } from '@ptah-extension/persistence-sqlite';

/** Dimension of `memory_chunks_vec.embedding` (`vec0(embedding FLOAT[384])`). */
const EMBEDDING_DIMENSIONS = 384;
const EMBEDDING_BYTES = EMBEDDING_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT;
/** Ids per `IN (…)` list, below SQLite's default bound-parameter limit. */
const VECTOR_READ_BATCH = 400;
const ALL_EDGE_KINDS: readonly MemoryGraphEdgeKind[] = [
  'semantic',
  'subject',
  'session',
];

export interface ResolvedMemoryGraphParams {
  /**
   * `undefined` = no workspace filter, `null` = rows without a workspace,
   * a string = that workspace. The RPC handler resolves `scope` into this.
   */
  readonly workspaceRoot?: string | null;
  /** `null` = all tiers. */
  readonly tiers: readonly MemoryTierWire[] | null;
  /** `null` = all kinds. */
  readonly kinds: readonly MemoryKindWire[] | null;
  readonly pinnedOnly: boolean;
  readonly sessionId: string | null;
  readonly createdFrom: number | null;
  readonly createdTo: number | null;
  readonly maxNodes: number;
  readonly edgeKinds: readonly MemoryGraphEdgeKind[];
  readonly k: number;
  readonly minSimilarity: number;
}

export interface BuildMemoryGraphOptions {
  readonly params: ResolvedMemoryGraphParams;
  /** False skips the vector step: sqlite-vec is off, or this is the main thread. */
  readonly semantic: boolean;
  /** `performance.now()` clock. Past it the semantic step is abandoned. */
  readonly deadlineMs?: number;
  /** Called once when the semantic step was requested but did not finish. */
  readonly onSemanticUnavailable?: (reason: string) => void;
}

function clamp(
  value: number | undefined,
  range: {
    readonly min: number;
    readonly max: number;
    readonly default: number;
  },
  integer: boolean,
): number {
  if (value === undefined || !Number.isFinite(value)) return range.default;
  const n = integer ? Math.floor(value) : value;
  return Math.max(range.min, Math.min(range.max, n));
}

/** Apply defaults and clamps. An empty filter array means "all". */
export function resolveMemoryGraphParams(
  p: MemoryGraphParams,
): ResolvedMemoryGraphParams {
  return {
    workspaceRoot: p.workspaceRoot,
    tiers: p.tiers?.length ? p.tiers : null,
    kinds: p.kinds?.length ? p.kinds : null,
    pinnedOnly: p.pinnedOnly ?? false,
    sessionId: p.sessionId ?? null,
    createdFrom: p.createdFrom ?? null,
    createdTo: p.createdTo ?? null,
    maxNodes: clamp(p.maxNodes, MEMORY_GRAPH_LIMITS.maxNodes, true),
    edgeKinds: p.edgeKinds?.length ? p.edgeKinds : ALL_EDGE_KINDS,
    k: clamp(p.k, MEMORY_GRAPH_LIMITS.k, true),
    minSimilarity: clamp(
      p.minSimilarity,
      MEMORY_GRAPH_LIMITS.minSimilarity,
      false,
    ),
  };
}

interface NodeRow {
  id: string;
  subject: string | null;
  content: string;
  tier: MemoryTierWire;
  kind: MemoryKindWire;
  salience: number;
  hits: number;
  pinned: number;
  session_id: string | null;
  workspace_root: string | null;
  created_at: number;
  last_used_at: number;
}

/** Code-unit order: stable across hosts, unlike `localeCompare`. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function edge(
  a: string,
  b: string,
  kind: MemoryGraphEdgeKind,
  weight: number,
): MemoryGraphEdgeWire {
  return a < b
    ? { source: a, target: b, kind, weight }
    : { source: b, target: a, kind, weight };
}

function compareEdges(a: MemoryGraphEdgeWire, b: MemoryGraphEdgeWire): number {
  return (
    b.weight - a.weight ||
    compareIds(a.source, b.source) ||
    compareIds(a.target, b.target)
  );
}

function selectNodes(
  db: SqliteDatabase,
  p: ResolvedMemoryGraphParams,
): { nodes: MemoryGraphNodeWire[]; totalMatching: number } {
  const conditions = ['quarantined_at IS NULL'];
  const values: (string | number)[] = [];
  const inList = (column: string, items: readonly string[]): void => {
    conditions.push(`${column} IN (${items.map(() => '?').join(',')})`);
    values.push(...items);
  };
  if (p.workspaceRoot === null) {
    conditions.push('workspace_root IS NULL');
  } else if (p.workspaceRoot !== undefined) {
    conditions.push('workspace_root = ?');
    values.push(p.workspaceRoot);
  }
  if (p.tiers?.length) inList('tier', p.tiers);
  if (p.kinds?.length) inList('kind', p.kinds);
  if (p.pinnedOnly) conditions.push('pinned = 1');
  if (p.sessionId !== null) {
    conditions.push('session_id = ?');
    values.push(p.sessionId);
  }
  if (p.createdFrom !== null) {
    conditions.push('created_at >= ?');
    values.push(p.createdFrom);
  }
  if (p.createdTo !== null) {
    conditions.push('created_at <= ?');
    values.push(p.createdTo);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const count = db
    .prepare(`SELECT COUNT(*) AS total FROM memories ${where}`)
    .get(...values) as { total: number } | undefined;
  const rows = db
    .prepare(
      `SELECT id, subject, content, tier, kind, salience, hits, pinned,
              session_id, workspace_root, created_at, last_used_at
         FROM memories ${where}
        ORDER BY pinned DESC, salience DESC, last_used_at DESC, id ASC
        LIMIT ?`,
    )
    .all(...values, p.maxNodes) as NodeRow[];
  const nodes = rows.map((r): MemoryGraphNodeWire => ({
    id: r.id,
    subject: r.subject,
    preview: r.content.slice(0, MEMORY_GRAPH_LIMITS.previewChars),
    tier: r.tier,
    kind: r.kind,
    salience: r.salience,
    hits: r.hits,
    pinned: r.pinned === 1,
    sessionId: r.session_id,
    workspaceRoot: r.workspace_root,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
  return { nodes, totalMatching: count?.total ?? nodes.length };
}

function chainEdges(
  nodes: readonly MemoryGraphNodeWire[],
  kind: 'subject' | 'session',
): MemoryGraphEdgeWire[] {
  const groups = new Map<string, MemoryGraphNodeWire[]>();
  for (const node of nodes) {
    const key =
      kind === 'subject' ? node.subject?.trim().toLowerCase() : node.sessionId;
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(node);
    else groups.set(key, [node]);
  }
  const edges: MemoryGraphEdgeWire[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.createdAt - b.createdAt || compareIds(a.id, b.id));
    for (let i = 1; i < group.length; i++) {
      edges.push(edge(group[i - 1].id, group[i].id, kind, 1));
    }
  }
  return edges;
}

/** Unit mean chunk vector per node, in node order; `null` without vectors. */
function readNodeVectors(
  db: SqliteDatabase,
  nodes: readonly MemoryGraphNodeWire[],
  deadlineMs: number | undefined,
): (Float32Array | null)[] {
  const sums = new Map<string, Float32Array>();
  for (let offset = 0; offset < nodes.length; offset += VECTOR_READ_BATCH) {
    // The vector read is the slow part for large graphs: check the deadline
    // before each batch, not only in the similarity loop.
    if (deadlineMs !== undefined && performance.now() >= deadlineMs) {
      throw new SemanticDeadlineError();
    }
    const ids = nodes
      .slice(offset, offset + VECTOR_READ_BATCH)
      .map((n) => n.id);
    const rows = db
      .prepare(
        `SELECT c.memory_id AS memoryId, v.embedding AS embedding
           FROM memory_chunks c
           JOIN memory_chunks_vec v ON v.rowid = c.rowid
          WHERE c.memory_id IN (${ids.map(() => '?').join(',')})`,
      )
      .all(...ids) as { memoryId: string; embedding: unknown }[];
    for (const row of rows) {
      const blob = row.embedding;
      if (!Buffer.isBuffer(blob) || blob.byteLength !== EMBEDDING_BYTES)
        continue;
      let sum = sums.get(row.memoryId);
      if (!sum) {
        sum = new Float32Array(EMBEDDING_DIMENSIONS);
        sums.set(row.memoryId, sum);
      }
      for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
        sum[i] += blob.readFloatLE(i * Float32Array.BYTES_PER_ELEMENT);
      }
    }
  }
  return nodes.map((node) => {
    // The mean and the sum have the same direction, so normalizing the sum
    // gives the unit mean vector.
    const vector = sums.get(node.id);
    if (!vector) return null;
    let squared = 0;
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++)
      squared += vector[i] * vector[i];
    if (squared === 0) return null;
    const norm = Math.sqrt(squared);
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) vector[i] /= norm;
    return vector;
  });
}

class SemanticDeadlineError extends Error {
  constructor() {
    super('deadline passed during the similarity step');
    this.name = 'SemanticDeadlineError';
  }
}

function semanticEdges(
  db: SqliteDatabase,
  nodes: readonly MemoryGraphNodeWire[],
  p: ResolvedMemoryGraphParams,
  deadlineMs: number | undefined,
): MemoryGraphEdgeWire[] {
  const vectors = readNodeVectors(db, nodes, deadlineMs);
  const neighbors: { index: number; weight: number }[][] = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    if (deadlineMs !== undefined && performance.now() >= deadlineMs) {
      throw new SemanticDeadlineError();
    }
    const a = vectors[i];
    if (!a) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = vectors[j];
      if (!b) continue;
      let dot = 0;
      for (let d = 0; d < EMBEDDING_DIMENSIONS; d++) dot += a[d] * b[d];
      if (dot < p.minSimilarity) continue;
      const weight = Math.min(1, dot);
      neighbors[i].push({ index: j, weight });
      neighbors[j].push({ index: i, weight });
    }
  }
  const unique = new Map<string, MemoryGraphEdgeWire>();
  for (let i = 0; i < neighbors.length; i++) {
    const ranked = neighbors[i].sort(
      (x, y) =>
        y.weight - x.weight || compareIds(nodes[x.index].id, nodes[y.index].id),
    );
    for (const next of ranked.slice(0, p.k)) {
      const e = edge(
        nodes[i].id,
        nodes[next.index].id,
        'semantic',
        next.weight,
      );
      unique.set(`${e.source}\0${e.target}`, e);
    }
  }
  return [...unique.values()].sort(compareEdges);
}

export function buildMemoryGraph(
  db: SqliteDatabase,
  o: BuildMemoryGraphOptions,
): MemoryGraphResult {
  const p = o.params;
  const { nodes, totalMatching } = selectNodes(db, p);
  const edgeCap = MEMORY_GRAPH_LIMITS.edgeCapFactor * p.maxNodes;

  // Chain edges are at most 2·(n − 1), below the cap of 6·n, and they are
  // cheap. They are kept first so a dense semantic layer cannot push the
  // subject and session structure out of the result.
  const chains: MemoryGraphEdgeWire[] = [];
  if (p.edgeKinds.includes('subject')) {
    chains.push(...chainEdges(nodes, 'subject').sort(compareEdges));
  }
  if (p.edgeKinds.includes('session')) {
    chains.push(...chainEdges(nodes, 'session').sort(compareEdges));
  }
  const keptChains = chains.slice(0, edgeCap);

  let semantic: MemoryGraphEdgeWire[] = [];
  let semanticAvailable = o.semantic;
  if (o.semantic && p.edgeKinds.includes('semantic') && nodes.length >= 2) {
    try {
      semantic = semanticEdges(db, nodes, p, o.deadlineMs);
    } catch (error: unknown) {
      // A missing vec table, a vec read error or the deadline: the nodes and
      // the chain edges are still a useful answer.
      semanticAvailable = false;
      o.onSemanticUnavailable?.(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    nodes,
    edges: [...semantic.slice(0, edgeCap - keptChains.length), ...keptChains],
    totalMatching,
    capped: totalMatching > nodes.length,
    semanticAvailable,
    edgeCap,
  };
}

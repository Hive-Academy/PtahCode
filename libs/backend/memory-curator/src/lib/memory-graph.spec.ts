import 'reflect-metadata';
import {
  adaptSqliteDatabase,
  requireSqliteOpener,
} from './retention/retention-sqlite.test-support';
import { buildMemoryGraph, resolveMemoryGraphParams } from './memory-graph';

const db = adaptSqliteDatabase(requireSqliteOpener().open(':memory:'));
db.exec(`CREATE TABLE memories (id TEXT, workspace_root TEXT, tier TEXT, kind TEXT, subject TEXT, content TEXT, salience REAL, hits INTEGER, pinned INTEGER, session_id TEXT, created_at INTEGER, last_used_at INTEGER, quarantined_at INTEGER);
CREATE TABLE memory_chunks (rowid INTEGER PRIMARY KEY, memory_id TEXT);
CREATE TABLE memory_chunks_vec (rowid INTEGER PRIMARY KEY, embedding BLOB);`);
function add(
  id: string,
  root: string | null,
  subject: string | null,
  session: string | null,
  created: number,
  pinned = 0,
): void {
  db.prepare(
    'INSERT INTO memories VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)',
  ).run(
    id,
    root,
    'recall',
    'fact',
    subject,
    `content ${id}`,
    0.5,
    0,
    pinned,
    session,
    created,
    created,
  );
}
add('a', null, 'Topic', 's', 1);
db.prepare('UPDATE memories SET content = ? WHERE id = ?').run(
  'x'.repeat(200),
  'a',
);
add('b', '/work', ' topic ', 's', 2, 1);
add('c', '/work', 'TOPIC', 's', 3);
add('q', '/work', null, null, 4);
db.prepare('UPDATE memories SET quarantined_at = 1 WHERE id = ?').run('q');
const graph = (
  params: Parameters<typeof resolveMemoryGraphParams>[0] = {},
  semantic = false,
  deadlineMs?: number,
) =>
  buildMemoryGraph(db, {
    params: resolveMemoryGraphParams(params),
    semantic,
    deadlineMs,
  });

describe('memory graph', () => {
  afterAll(() => db.close());
  it('handles tri-state workspace scope, ordering, quarantine, and caps', () => {
    expect(graph().nodes.map((n) => n.id)).toEqual(['b', 'c', 'a']);
    expect(graph().nodes[2].preview).toHaveLength(160);
    expect(graph({ workspaceRoot: null }).nodes.map((n) => n.id)).toEqual([
      'a',
    ]);
    expect(graph({ workspaceRoot: '/work' }).nodes.map((n) => n.id)).toEqual([
      'b',
      'c',
    ]);
    expect(graph({ maxNodes: 1 }).totalMatching).toBe(3);
    expect(graph({ maxNodes: 1 }).capped).toBe(true);
    expect(graph({ maxNodes: 0.4 }).edgeCap).toBe(6);
    expect(
      resolveMemoryGraphParams({ maxNodes: 1500.9, k: 0.4 }).maxNodes,
    ).toBe(1500);
    expect(resolveMemoryGraphParams({ k: 0.4 }).k).toBe(1);
  });
  it('filters, chains, and keeps undirected edges unique per kind', () => {
    expect(graph({ tiers: [], kinds: [], edgeKinds: [] }).nodes).toHaveLength(
      3,
    );
    expect(graph({ pinnedOnly: true }).nodes.map((n) => n.id)).toEqual(['b']);
    expect(
      graph({ sessionId: 's', createdFrom: 2, createdTo: 2 }).nodes.map(
        (n) => n.id,
      ),
    ).toEqual(['b']);
    expect(graph({ tiers: ['core'] }).nodes).toHaveLength(0);
    expect(graph({ kinds: ['event'] }).nodes).toHaveLength(0);
    const result = graph({ edgeKinds: ['subject', 'session'] });
    expect(result.edges.filter((e) => e.kind === 'subject')).toHaveLength(2);
    expect(result.edges.filter((e) => e.kind === 'session')).toHaveLength(2);
    expect(result.edges.every((e) => e.source < e.target)).toBe(true);
    expect(
      new Set(result.edges.map((e) => `${e.kind}:${e.source}:${e.target}`))
        .size,
    ).toBe(result.edges.length);
    expect(result.semanticAvailable).toBe(false);
  });
  it('computes cosine from 384-dimensional BLOBs and ranks semantic edges first', () => {
    const embedding = (x: number, y: number): Buffer => {
      const buffer = Buffer.alloc(384 * 4);
      buffer.writeFloatLE(x, 0);
      buffer.writeFloatLE(y, 4);
      return buffer;
    };
    for (const [rowid, id, vector] of [
      [1, 'a', embedding(1, 0)],
      [2, 'b', embedding(1, 0)],
      [3, 'c', embedding(0, 1)],
    ] as const) {
      db.prepare('INSERT INTO memory_chunks VALUES (?, ?)').run(rowid, id);
      db.prepare('INSERT INTO memory_chunks_vec VALUES (?, ?)').run(
        rowid,
        vector,
      );
    }
    const result = graph({ minSimilarity: 0.75, k: 1 }, true);
    expect(result.semanticAvailable).toBe(true);
    expect(result.edges[0]).toEqual({
      source: 'a',
      target: 'b',
      kind: 'semantic',
      weight: 1,
    });
    expect(result.edges.filter((e) => e.kind === 'semantic')).toHaveLength(1);
  });
  it('keeps the chain edges when semantic edges fill the cap', () => {
    const embedding = Buffer.alloc(384 * 4);
    embedding.writeFloatLE(1, 0);
    for (let i = 0; i < 13; i++) {
      const id = `extra-${i}`;
      add(id, '/work', 'Topic', 's', i + 10);
      db.prepare('INSERT INTO memory_chunks VALUES (?, ?)').run(i + 4, id);
      db.prepare('INSERT INTO memory_chunks_vec VALUES (?, ?)').run(
        i + 4,
        embedding,
      );
    }
    const result = graph({ maxNodes: 16, k: 32 }, true);
    const count = (kind: string) =>
      result.edges.filter((e) => e.kind === kind).length;
    expect(result.edgeCap).toBe(96);
    expect(result.edges).toHaveLength(96);
    expect(count('subject')).toBe(15);
    expect(count('session')).toBe(15);
    expect(count('semantic')).toBe(66);
    const weights = result.edges
      .filter((e) => e.kind === 'semantic')
      .map((e) => e.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    expect(result.edges[0].kind).toBe('semantic');
  });
  it('averages the chunk vectors of one memory and skips a malformed blob', () => {
    const local = adaptSqliteDatabase(requireSqliteOpener().open(':memory:'));
    local.exec(`CREATE TABLE memories (id TEXT, workspace_root TEXT, tier TEXT, kind TEXT, subject TEXT, content TEXT, salience REAL, hits INTEGER, pinned INTEGER, session_id TEXT, created_at INTEGER, last_used_at INTEGER, quarantined_at INTEGER);
CREATE TABLE memory_chunks (rowid INTEGER PRIMARY KEY, memory_id TEXT);
CREATE TABLE memory_chunks_vec (rowid INTEGER PRIMARY KEY, embedding BLOB);`);
    const vec = (x: number, y: number): Buffer => {
      const buffer = Buffer.alloc(384 * 4);
      buffer.writeFloatLE(x, 0);
      buffer.writeFloatLE(y, 4);
      return buffer;
    };
    const rows: [string, Buffer[]][] = [
      ['m1', [vec(1, 0), vec(0, 1)]],
      ['m2', [vec(Math.SQRT1_2, Math.SQRT1_2)]],
      ['m3', [vec(1, 0), Buffer.alloc(8)]],
      ['m4', []],
    ];
    let rowid = 1;
    for (const [id, vectors] of rows) {
      local
        .prepare(
          'INSERT INTO memories VALUES (?, NULL, ?, ?, NULL, ?, 0.5, 0, 0, NULL, 1, 1, NULL)',
        )
        .run(id, 'recall', 'fact', id);
      for (const vector of vectors) {
        local.prepare('INSERT INTO memory_chunks VALUES (?, ?)').run(rowid, id);
        local
          .prepare('INSERT INTO memory_chunks_vec VALUES (?, ?)')
          .run(rowid, vector);
        rowid++;
      }
    }
    const reasons: string[] = [];
    const result = buildMemoryGraph(local, {
      params: resolveMemoryGraphParams({ minSimilarity: 0.5, k: 8 }),
      semantic: true,
      onSemanticUnavailable: (reason) => reasons.push(reason),
    });
    local.close();
    const weightOf = (a: string, b: string) =>
      result.edges.find((e) => e.source === a && e.target === b)?.weight;
    expect(weightOf('m1', 'm2')).toBeCloseTo(1, 5);
    expect(weightOf('m1', 'm3')).toBeCloseTo(Math.SQRT1_2, 5);
    expect(weightOf('m2', 'm3')).toBeCloseTo(Math.SQRT1_2, 5);
    expect(
      result.edges.some((e) => e.source === 'm4' || e.target === 'm4'),
    ).toBe(false);
    expect(result.semanticAvailable).toBe(true);
    expect(reasons).toEqual([]);
  });
  it('reports vec as available when semantic edges are not requested', () => {
    expect(graph({ edgeKinds: ['subject'] }, true).semanticAvailable).toBe(
      true,
    );
    expect(
      graph({ edgeKinds: ['subject'] }, true).edges.every(
        (e) => e.kind === 'subject',
      ),
    ).toBe(true);
  });
  it('reports the reason when the semantic step does not finish', () => {
    const reasons: string[] = [];
    const result = buildMemoryGraph(db, {
      params: resolveMemoryGraphParams({}),
      semantic: true,
      deadlineMs: -1,
      onSemanticUnavailable: (reason) => reasons.push(reason),
    });
    expect(result.semanticAvailable).toBe(false);
    expect(result.edges.some((e) => e.kind === 'semantic')).toBe(false);
    expect(result.edges.some((e) => e.kind === 'subject')).toBe(true);
    expect(reasons).toHaveLength(1);
  });
  it('degrades semantic when vec table is unavailable or deadline passes', () => {
    expect(graph({}, true, -1).semanticAvailable).toBe(false);
    db.exec('DROP TABLE memory_chunks_vec');
    expect(graph({}, true).semanticAvailable).toBe(false);
  });
});

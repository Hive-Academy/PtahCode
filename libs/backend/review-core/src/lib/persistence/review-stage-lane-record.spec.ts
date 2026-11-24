import { z } from 'zod';
import type { SqliteDatabase } from '@ptah-extension/persistence-sqlite';
import {
  REVIEW_LANE_POOL_MAX, REVIEW_STAGE_USAGE_RUNS_MAX, ReviewLaneFallbackSchema, ReviewLaneIdSchema, ReviewModelIdSchema,
} from '@ptah-extension/review-contracts';
import type { ReviewLaneRunUsage } from '../lanes/review-lane-usage';
import type { ReviewLaneUse } from '../lanes/review-lane.runner';
import { aggregateReviewUsage } from '../usage/review-usage-total';
import {
  beginLaneRun, mergeLaneRun, parseStageLaneDocument, readStageLaneRecords, type ReviewStageLaneDocument,
} from './review-stage-lane-record';

/** Copy of the lane-record reader before usage existed (NFR a). */
const preChangeLaneRecordSchema = z.string().transform((text): unknown => JSON.parse(text) as unknown)
  .pipe(z.object({ version: z.literal(1), lane: ReviewLaneIdSchema.nullable(), model: ReviewModelIdSchema.nullable(),
    fallback: z.array(ReviewLaneFallbackSchema).max(REVIEW_LANE_POOL_MAX + 1) }));

const use = (lane: string, family = lane): ReviewLaneUse => ({ lane, model: `${lane}-model`, family, fallback: [] });
const usage = (inputTokens: number, costUsd: number | null = 0.1): ReviewLaneRunUsage => ({
  inputTokens, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd, model: null, partial: false,
});

function fullDocument(): ReviewStageLaneDocument {
  let doc: ReviewStageLaneDocument | null = null;
  for (let index = 0; index < REVIEW_STAGE_USAGE_RUNS_MAX; index++) doc = mergeLaneRun(beginLaneRun(doc), use('claude'), usage(1));
  if (!doc) throw new Error('unreachable');
  return doc;
}

describe('lane record merge', () => {
  it('ends a begun run with its usage', () => {
    const doc = mergeLaneRun(beginLaneRun(null), use('claude'), usage(10));
    expect(doc).toEqual({ version: 1, lane: 'claude', model: 'claude-model', family: 'claude', fallback: [],
      usage: { runs: [{ ...usage(10), ended: true }] } });
  });

  it('drops the pending run when save has no run, keeping the lane', () => {
    const doc = mergeLaneRun(beginLaneRun(null), use('codex'), undefined);
    expect(doc).toMatchObject({ lane: 'codex', usage: { runs: [] } });
  });

  it('keeps the stored lane when save has none', () => {
    const doc = mergeLaneRun(mergeLaneRun(beginLaneRun(null), use('codex'), usage(1)), null, undefined);
    expect(doc).toMatchObject({ lane: 'codex', family: 'codex' });
  });

  it('lets the latest lane win', () => {
    const first = mergeLaneRun(beginLaneRun(null), use('claude'), usage(1));
    const second = mergeLaneRun(beginLaneRun(first), use('gemini'), usage(2));
    expect(second).toMatchObject({ lane: 'gemini', model: 'gemini-model', family: 'gemini' });
    expect(second.usage?.runs.map((run) => run.inputTokens)).toEqual([1, 2]);
  });

  it('writes no usage key for a save without run on a document without usage', () => {
    expect(mergeLaneRun(null, use('claude'), undefined)).toEqual({ version: 1, lane: 'claude', model: 'claude-model',
      family: 'claude', fallback: [] });
  });

  it('marks a full list overflowed on begin and on save without growing it (F9)', () => {
    const begun = beginLaneRun(fullDocument());
    expect(begun.usage?.runs).toHaveLength(REVIEW_STAGE_USAGE_RUNS_MAX);
    expect(begun.usage?.overflow).toBe(true);
    const saved = mergeLaneRun(begun, use('claude'), usage(5));
    expect(saved.usage?.runs).toHaveLength(REVIEW_STAGE_USAGE_RUNS_MAX);
    expect(saved.usage?.overflow).toBe(true);
  });

  it('converges when two owners interleave begin and save', () => {
    let doc = beginLaneRun(null);
    doc = beginLaneRun(doc);
    doc = mergeLaneRun(doc, use('claude'), usage(1));
    doc = beginLaneRun(doc);
    doc = mergeLaneRun(doc, use('codex'), usage(2));
    expect(doc.usage?.runs.filter((run) => run.ended)).toHaveLength(2);
    expect(doc.usage?.runs.filter((run) => !run.ended)).toHaveLength(1);
  });

  it('round-trips through parse and is read by the pre-change reader (NFR a)', () => {
    const doc = mergeLaneRun(beginLaneRun(null), use('claude'), usage(3));
    const text = JSON.stringify(doc);
    expect(parseStageLaneDocument(text)).toEqual(doc);
    expect(preChangeLaneRecordSchema.parse(text)).toEqual({ version: 1, lane: 'claude', model: 'claude-model', fallback: [] });
    expect(preChangeLaneRecordSchema.parse(JSON.stringify(beginLaneRun(null)))).toEqual({ version: 1, lane: null, model: null, fallback: [] });
  });

  it('parses an unreadable usage as an overflowed empty list and an unreadable lane part as none', () => {
    const text = JSON.stringify({ version: 1, lane: 'claude', model: null, family: 'claude', fallback: [], usage: { runs: 'bad' } });
    expect(parseStageLaneDocument(text)).toMatchObject({ lane: 'claude', usage: { runs: [], overflow: true } });
    expect(parseStageLaneDocument('{not json')).toBeNull();
    expect(parseStageLaneDocument(null)).toBeNull();
  });
});

describe('readStageLaneRecords', () => {
  let db: SqliteDatabase;
  beforeEach(() => {
    const Database = require('better-sqlite3') as new (path: string) => SqliteDatabase;
    db = new Database(':memory:');
    db.exec(`CREATE TABLE review_stages (attempt_id TEXT, stage TEXT, ordinal INTEGER, outcome TEXT)`);
  });
  afterEach(() => db.close());
  const insert = (stage: string, ordinal: number, outcome: unknown): void => {
    db.prepare(`INSERT INTO review_stages VALUES ('a1', ?, ?, ?)`)
      .run(`checkpoint:lane:${stage}`, ordinal, typeof outcome === 'string' ? outcome : JSON.stringify(outcome));
  };

  it('reads lane parts and runs, and the runs sum per stage', () => {
    let doc = mergeLaneRun(beginLaneRun(null), use('claude'), usage(10, 0.2));
    doc = mergeLaneRun(beginLaneRun(doc), use('claude'), usage(5, 0.3));
    insert('triage', 1, doc);
    insert('lens:security-privacy', 0, { version: 1, lane: 'codex', model: null, family: 'codex', fallback: [] });
    const records = readStageLaneRecords(db, 'a1');
    expect(records.get('lens:security-privacy#0')).toEqual({ lane: 'codex', model: null, fallback: [], runs: [] });
    const triage = records.get('triage#1');
    expect(triage).toMatchObject({ lane: 'claude', model: 'claude-model' });
    expect(aggregateReviewUsage(triage?.runs ?? [])).toMatchObject({ inputTokens: 15, costUsd: 0.5, runs: 2, tokensPartial: false });
  });

  it('keeps the lane part of a document with corrupt usage and counts one unknown partial run', () => {
    insert('verification', 0, { version: 1, lane: 'gemini', model: null, family: 'gemini', fallback: [], usage: { runs: [{ bad: 1 }] } });
    const record = readStageLaneRecords(db, 'a1').get('verification#0');
    expect(record).toMatchObject({ lane: 'gemini' });
    expect(aggregateReviewUsage(record?.runs ?? [])).toMatchObject({ runs: 1, tokensPartial: true, costPartial: true });
  });

  it('counts an overflowed list as one more unknown run', () => {
    insert('triage', 0, beginLaneRun(fullDocument()));
    const record = readStageLaneRecords(db, 'a1').get('triage#0');
    expect(aggregateReviewUsage(record?.runs ?? [])).toMatchObject({ runs: REVIEW_STAGE_USAGE_RUNS_MAX + 1, tokensPartial: true });
  });

  it('skips a document whose lane part is unreadable', () => {
    insert('verification', 3, '{not json');
    expect(readStageLaneRecords(db, 'a1').size).toBe(0);
  });
});

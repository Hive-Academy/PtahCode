/** `table-size` worker command: pure function driven by an injected database. */
import {
  asTableSizeResponse,
  isTableSizeRequest,
  performTableSizeReport,
  type TableSizeDatabase,
  type TableSizeRequest,
} from './table-size-protocol';

const REQUEST: TableSizeRequest = {
  id: 7,
  type: 'table-size',
  dbPath: 'fixture.sqlite',
  topN: 2,
};

interface Seen {
  sql: string[];
  params: unknown[][];
  closed: boolean;
}

function newSeen(): Seen {
  return { sql: [], params: [], closed: false };
}

function fakeDb(
  top: unknown[],
  total: unknown[],
  seen: Seen,
): TableSizeDatabase & { close: () => void } {
  return {
    prepare: (sql: string) => {
      seen.sql.push(sql);
      return {
        all: (...params: unknown[]) => {
          seen.params.push(params);
          return sql.includes('GROUP BY') ? top : total;
        },
      };
    },
    close: () => {
      seen.closed = true;
    },
  };
}

describe('performTableSizeReport', () => {
  it('returns rows in query order, the total, and only reads', () => {
    const seen = newSeen();
    const opened: string[] = [];
    let t = 0;
    const response = performTableSizeReport(
      {
        openReadOnly: (p) => {
          opened.push(p);
          return fakeDb(
            [
              { name: 'big', bytes: 9000, pages: 3 },
              { name: 'small', bytes: 100, pages: 1 },
            ],
            [{ bytes: 12345 }],
            seen,
          );
        },
        now: () => (t += 5),
      },
      REQUEST,
    );
    expect(opened).toEqual(['fixture.sqlite']);
    expect(response.status).toBe('ok');
    expect(response.id).toBe(7);
    expect(response.totalBytes).toBe(12345);
    expect(response.tables.map((x) => x.name)).toEqual(['big', 'small']);
    expect(response.durationMs).toBe(5);
    expect(seen.params[0]).toEqual([2]);
    expect(seen.sql.every((s) => /^SELECT /.test(s))).toBe(true);
    expect(seen.sql.join(' ')).not.toMatch(/VACUUM|DELETE|INSERT|UPDATE|DROP/i);
    expect(seen.closed).toBe(true);
  });

  it('returns a typed unavailable result when dbstat is missing', () => {
    const response = performTableSizeReport(
      {
        openReadOnly: () => ({
          prepare: () => {
            throw new Error('no such table: dbstat');
          },
        }),
        now: () => 0,
      },
      REQUEST,
    );
    expect(response).toMatchObject({
      status: 'unavailable',
      totalBytes: 0,
      tables: [],
    });
    expect(response.detail).toBe('dbstat-missing');
  });

  it('maps an open failure to unavailable without throwing', () => {
    const response = performTableSizeReport(
      {
        openReadOnly: () => {
          throw new Error('unable to open /private/profile/database.sqlite');
        },
        now: () => 0,
      },
      REQUEST,
    );
    expect(response.status).toBe('unavailable');
    expect(response.detail).toBe('open-failed');
    expect(JSON.stringify(response)).not.toContain('/private/profile');
  });
});

describe('table-size request and response guards', () => {
  it('accepts only a well-formed request', () => {
    expect(isTableSizeRequest(REQUEST)).toBe(true);
    expect(isTableSizeRequest({ ...REQUEST, topN: 0 })).toBe(false);
    expect(isTableSizeRequest({ ...REQUEST, dbPath: '' })).toBe(false);
    expect(isTableSizeRequest({ ...REQUEST, type: 'check' })).toBe(false);
  });

  it('narrows replies', () => {
    const ok = performTableSizeReport(
      {
        openReadOnly: () => fakeDb([], [{ bytes: 0 }], newSeen()),
        now: () => 0,
      },
      REQUEST,
    );
    expect(asTableSizeResponse(ok)).toEqual(ok);
    expect(asTableSizeResponse({ type: 'backup' })).toBeNull();
    expect(asTableSizeResponse(null)).toBeNull();
    expect(asTableSizeResponse({ ...ok, detail: '/private/profile/database.sqlite' })).toBeNull();
  });
});

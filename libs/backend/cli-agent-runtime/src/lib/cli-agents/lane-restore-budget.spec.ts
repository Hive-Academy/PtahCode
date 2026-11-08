import { laneRecordsForSession, previousResumeRecord } from './lane-restore';
import type { TrackedAgent } from './tracked-agent';

it('selects the latest matching CLI session and orders its lane records', () => {
  const records = [
    { info: { cli: 'codex', cliSessionId: 's', startedAt: '2026-01-02T00:00:00Z' } },
    { info: { cli: 'codex', cliSessionId: 's', startedAt: '2026-01-01T00:00:00Z' } },
    { info: { cli: 'claude', cliSessionId: 's', startedAt: '2026-01-03T00:00:00Z' } },
  ] as TrackedAgent[];
  expect(previousResumeRecord(records, 'codex', 's')).toBe(records[0].info);
  expect(previousResumeRecord(records, 'codex', 'other')).toBeUndefined();
  expect(laneRecordsForSession(records, 's')).toEqual([records[1], records[0], records[2]]);
});

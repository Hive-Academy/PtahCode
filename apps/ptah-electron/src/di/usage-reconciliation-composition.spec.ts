import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Keep this lifecycle guard independent of the full DI graph and native modules.
it('never starts transcript reconciliation in either production host', () => {
  for (const path of [
    join(__dirname, 'container.ts'),
    join(__dirname, '../../../../libs/backend/cli-engine/src/lib/container.ts'),
  ]) {
    const composition = readFileSync(path, 'utf8');
    expect(composition).not.toMatch(/usageReconciliationService\.start\(/);
    expect(composition).not.toContain('setAfterPass');
    expect(composition).toContain('resolve(RepositoryIdentityBackfillService).start()');
    if (path === join(__dirname, 'container.ts')) {
      expect(composition).toContain('resolve(RepositoryIdentityBackfillService).stop()');
    }
    expect(composition).toContain('TASK_2026_2254_b94b');
  }
});

it('stops CLI backfill through the common shutdown helper', () => {
  const shutdown = readFileSync(join(__dirname, '../../../../libs/backend/cli-engine/src/lib/bootstrap/shutdown-host-runtime.ts'), 'utf8');
  expect(shutdown).toContain("disposeSubsystem(container, RepositoryIdentityBackfillService, 'repository identity backfill', 'stop')");
});

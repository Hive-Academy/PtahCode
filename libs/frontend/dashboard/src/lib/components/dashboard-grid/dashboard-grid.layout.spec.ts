import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const components = join(__dirname, '..');
const grid = readFileSync(join(components, 'dashboard-grid/dashboard-grid.component.html'), 'utf8');
const usage = readFileSync(
  join(components, 'usage-dashboard/usage-dashboard.component.html'),
  'utf8',
);

describe('dashboard grid layout', () => {
  it('uses the shared page header with chat navigation and one toolbar', () => {
    expect(grid).toContain('title="Dashboard"');
    expect(grid).toContain('backLabel="Back to chat"');
    expect(grid).toContain('(back)="navigateBack()"');
    expect(grid.match(/<ptah-dashboard-toolbar/g)).toHaveLength(1);
    expect(usage).not.toContain('Usage range in days');
  });

  it('orders the rows: KPI strip, plan limits, charts, tables, then skills', () => {
    const kpis = usage.indexOf('<ptah-usage-kpi-strip');
    const limits = usage.indexOf('select="[dashboardLimits]"');
    const charts = usage.indexOf('usage-chart-row');
    const tables = usage.indexOf('usage-table-row');
    expect(kpis).toBeGreaterThan(-1);
    expect(limits).toBeGreaterThan(kpis);
    expect(charts).toBeGreaterThan(limits);
    expect(tables).toBeGreaterThan(charts);

    const usageAt = grid.indexOf('<ptah-usage-dashboard');
    expect(grid.indexOf('<ptah-plan-limits-panel dashboardLimits')).toBeGreaterThan(usageAt);
    expect(grid.indexOf('<ptah-skill-selection-card')).toBeGreaterThan(usageAt);
    expect(grid).not.toContain('<ptah-builders-card');
    expect(grid).not.toContain('Open Command Center');
    expect(grid).not.toContain('<ptah-harness-card');
  });
});

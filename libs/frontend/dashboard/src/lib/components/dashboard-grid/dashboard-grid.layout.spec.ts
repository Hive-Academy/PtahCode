import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const components = join(__dirname, '..');
const grid = readFileSync(
  join(components, 'dashboard-grid/dashboard-grid.component.html'),
  'utf8',
);
const analytics = readFileSync(
  join(components, 'analytics-card/analytics-card.component.html'),
  'utf8',
);

describe('dashboard grid layout', () => {
  it('uses the shared page header with chat navigation', () => {
    expect(grid).toContain('title="Dashboard"');
    expect(grid).toContain('backLabel="Back to chat"');
    expect(grid).toContain('(back)="navigateBack()"');
  });
  it('places provider limits before analytics and leaves the route card off this page', () => {
    const limits = grid.indexOf('<ptah-provider-account-card');
    const selection = grid.indexOf('<ptah-skill-selection-card');
    const usage = grid.indexOf('<ptah-analytics-card');
    expect(limits).toBeGreaterThan(grid.indexOf('<ptah-page-header'));
    expect(selection).toBeGreaterThan(limits);
    expect(usage).toBeGreaterThan(selection);
    expect(grid).not.toContain('Open Command Center');
    expect(grid).not.toContain('<ptah-harness-card');
    expect(analytics).not.toContain('ptah-provider-account-card');
  });
});

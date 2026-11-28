import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { formatLocalCommandOutput } from '@ptah-extension/shared/mcp-apps-contracts';
import { renderPtahUiBlock } from '@ptah-extension/shared/mcp-apps-contracts/surface';
import { dashboardJsonBytes } from '@ptah-extension/shared/testing';
import { SurfaceRendererComponent } from './surface-renderer.component';

function renderCommand(command: 'usage' | 'context'): HTMLElement {
  const raw = readFileSync(resolve(
    __dirname, '../../../../../shared/src/lib/local-command/__fixtures__', `${command}.txt`,
  ), 'utf8');
  const fence = formatLocalCommandOutput(raw);
  const body = /^```ptah-ui\n([\s\S]*)```$/.exec(fence)?.[1];
  if (body === undefined) throw new Error(`Expected a ptah-ui fence for /${command}`);
  const result = renderPtahUiBlock(body, {
    surfaceId: `fixture-${command}`,
    snapshot: null,
    countBytes: dashboardJsonBytes,
  });
  if (!result.ok) throw new Error(result.reason);
  const fixture = TestBed.createComponent(SurfaceRendererComponent);
  const renderFailed = jest.fn();
  fixture.componentInstance.renderFailed.subscribe(renderFailed);
  fixture.componentRef.setInput('renderable', result.content);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  for (const toggle of element.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]')) {
    toggle.click();
    fixture.detectChanges();
  }
  expect(renderFailed).not.toHaveBeenCalled();
  return element;
}

describe('Local command output through the surface renderer', () => {
  it('renders /usage contributor rows and top groups with icons', () => {
    const element = renderCommand('usage');
    expect(element.querySelector('ptah-dashboard-leaderboard h3')?.textContent).toBe('Contributors (% of usage)');
    expect(element.querySelectorAll('ptah-dashboard-leaderboard li').length).toBeGreaterThan(1);
    expect(element.querySelector('ptah-dashboard-leaderboard ol[aria-label="MCP servers"]')?.textContent).toContain('ptah');
    expect(element.querySelector('ptah-dashboard-leaderboard lucide-angular svg')).not.toBeNull();
  });

  it('renders /context category widths, token leaderboards and the memory table', () => {
    const element = renderCommand('context');
    const meter = element.querySelector('ptah-dashboard-meter');
    expect(meter?.querySelector('h3')?.textContent).toBe('Estimated usage by category');
    expect(meter?.querySelectorAll('[role="img"] span')).toHaveLength(12);
    expect(meter?.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('Free space: 921.5k');
    expect(element.querySelectorAll('ptah-dashboard-leaderboard')).toHaveLength(3);
    expect(element.querySelector('ptah-dashboard-leaderboard li')?.textContent).toContain('ptah_agent_spawn');
    expect(element.querySelector('ptah-dashboard-table tbody')?.textContent).toContain('Project');
  });
});

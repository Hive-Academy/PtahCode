import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'table.component.ts'), 'utf8');

function ruleBody(selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) return '';
  return source.slice(start + selector.length + 2, source.indexOf('}', start));
}

describe('ptah-table control cell styles', () => {
  it('keeps the toggle at its own width (width: auto collapsed it to 2 px)', () => {
    const toggle = ruleBody('.ptah-table-control-cell [ptahToggle]');
    expect(toggle).toContain('height: var(--ptah-control-h-sm);');
    expect(toggle).not.toMatch(/(^|[\s;])width:/);
  });

  it('keeps width: auto on select controls only', () => {
    expect(ruleBody('.ptah-table-control-cell [ptahSelect]')).toContain('width: auto;');
  });

  it('holds no feature test id', () => {
    expect(source).not.toContain('data-testid=');
  });
});

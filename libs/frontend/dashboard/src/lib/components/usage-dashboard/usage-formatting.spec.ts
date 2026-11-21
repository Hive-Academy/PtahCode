/**
 * Table formats of the Usage tab: a real cost or share never reads as
 * zero, lower bounds keep their "≥", relative ages stay short, and inline
 * bar widths stay honest (0 for unknown, visible for any positive value).
 */
import {
  barWidthPercent,
  formatCostCell,
  formatCount,
  formatRelativeAge,
  formatShare,
  formatTableUsd,
  formatTokenCount,
  repositoryDisplayName,
} from './usage-formatting';

describe('usage table formatting', () => {
  it('formats table costs with cents and keeps sub-cent costs non-zero', () => {
    expect(formatTableUsd(1234.5)).toBe('$1,234.50');
    expect(formatTableUsd(0)).toBe('$0.00');
    expect(formatTableUsd(0.0034)).toBe('$0.0034');
    expect(formatTableUsd(0.01)).toBe('$0.01');
  });

  it('labels unknown, lower-bound and exact cost cells', () => {
    expect(formatCostCell(null, false)).toBe('—');
    expect(formatCostCell(null, true, 'Unpriced')).toBe('Unpriced');
    expect(formatCostCell(3, true)).toBe('≥ $3.00');
    expect(formatCostCell(3, false)).toBe('$3.00');
  });

  it('never shows a positive share as 0% or a partial share as 100%', () => {
    expect(formatShare(null)).toBe('—');
    expect(formatShare(0)).toBe('0%');
    expect(formatShare(0.0004)).toBe('<0.1%');
    expect(formatShare(0.001)).toBe('0.1%');
    expect(formatShare(0.343)).toBe('34.3%');
    expect(formatShare(0.9996)).toBe('>99.9%');
    expect(formatShare(1)).toBe('100%');
  });

  it('spells out exact token counts for cell titles', () => {
    expect(formatTokenCount(12_345)).toBe('12,345 tokens');
    expect(formatTokenCount(1)).toBe('1 token');
    expect(formatCount(1_200_424_998)).toBe('1,200,424,998');
    expect(formatCount(0)).toBe('0');
  });

  it('derives a short repository name from a path or remote id', () => {
    expect(repositoryDisplayName('/home/me/work/ptah-extension')).toBe('ptah-extension');
    expect(repositoryDisplayName('/home/me/work/ptah-extension.git/')).toBe('ptah-extension');
    expect(repositoryDisplayName('C:\\work\\repo-a')).toBe('repo-a');
    expect(repositoryDisplayName('git@github.com:org/repo.git')).toBe('repo');
    expect(repositoryDisplayName('repo-a')).toBe('repo-a');
    // Nothing usable left: keep the id so the tile never renders blank.
    expect(repositoryDisplayName('.git')).toBe('.git');
  });

  it('formats a short relative age against the summary time', () => {
    const now = '2026-10-20T12:00:00.000Z';
    expect(formatRelativeAge('2026-10-20T11:59:30.000Z', now)).toBe('Just now');
    expect(formatRelativeAge('2026-10-20T13:00:00.000Z', now)).toBe('Just now');
    expect(formatRelativeAge('2026-10-20T11:48:00.000Z', now)).toBe('12m ago');
    expect(formatRelativeAge('2026-10-20T07:00:00.000Z', now)).toBe('5h ago');
    expect(formatRelativeAge('2026-10-17T12:00:00.000Z', now)).toBe('3d ago');
    expect(formatRelativeAge('2026-09-01T12:00:00.000Z', now)).toBe('Sep 1');
    expect(formatRelativeAge('not-a-date', now)).toBe('—');
    expect(formatRelativeAge('2026-10-20T11:00:00.000Z', '')).toBe('—');
  });

  it('sizes inline bars against their maximum', () => {
    expect(barWidthPercent(5, 10)).toBe(50);
    expect(barWidthPercent(10, 10)).toBe(100);
    expect(barWidthPercent(20, 10)).toBe(100);
    // A positive value stays visible; unknown, zero or no maximum draws nothing.
    expect(barWidthPercent(0.001, 10)).toBe(2);
    expect(barWidthPercent(null, 10)).toBe(0);
    expect(barWidthPercent(0, 10)).toBe(0);
    expect(barWidthPercent(-1, 10)).toBe(0);
    expect(barWidthPercent(5, 0)).toBe(0);
    expect(barWidthPercent(Number.NaN, 10)).toBe(0);
  });
});

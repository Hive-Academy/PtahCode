import type { SurfaceIconToken } from '../../mcp-apps-contracts/surface-catalog';
import type { UsageReport, UsageWindow } from './local-command.types';
import {
  escapePtahUi,
  formatPercentValue,
  formatPtahUiNumber,
  percentTone,
  PtahUiWriter,
} from './ptah-ui-writer';

const MAX_CONTRIBUTORS = 10;
const MAX_TOP_ROWS_PER_GROUP = 8;
const MAX_TOP_GROUPS = 6;
const MAX_LIMIT_CARDS = 4;
const CONTRIBUTOR_LABEL_LENGTH = 48;

function topIcon(kind: string): SurfaceIconToken {
  switch (kind.toLowerCase()) {
    case 'skills': return 'skill';
    case 'subagents': return 'agent';
    case 'mcp servers': return 'server';
    default: return 'info';
  }
}

function writeWindow(writer: PtahUiWriter, window: UsageWindow): void {
  const title = escapePtahUi(window.title);
  if (!title) return;
  const stats: string[] = [];
  if (window.requests !== null)
    stats.push(`Requests | ${formatPtahUiNumber(window.requests)}`);
  if (window.sessions !== null)
    stats.push(`Sessions | ${formatPtahUiNumber(window.sessions)}`);

  const contributors = window.contributors
    .slice(0, MAX_CONTRIBUTORS)
    .map((c) => ({
      label: escapePtahUi(c.label, CONTRIBUTOR_LABEL_LENGTH),
      value: formatPtahUiNumber(c.pct),
    }))
    .filter((p) => p.label);

  const groups = window.tops
    .map((top) => {
      const rows = top.items.flatMap((item) => {
        const label = escapePtahUi(item.name);
        return label ? [{ label, pct: item.pct }] : [];
      });
      return { title: escapePtahUi(top.kind), top, rows };
    })
    .filter((group) => group.title && group.rows.length > 0);
  const shownGroups = groups.slice(0, MAX_TOP_GROUPS);
  const hiddenRows = groups.reduce(
    (total, { top, rows }, index) => total + top.more
      + (index < MAX_TOP_GROUPS ? Math.max(0, rows.length - MAX_TOP_ROWS_PER_GROUP) : rows.length),
    0,
  );

  if (stats.length === 0 && contributors.length === 0 && shownGroups.length === 0)
    return;
  writer.line(0, `section ${title}`);
  if (stats.length > 0) {
    writer.line(1, 'stats');
    for (const stat of stats) writer.line(2, stat);
  }
  if (contributors.length > 0) {
    writer.line(1, 'leaderboard Contributors (% of usage)');
    for (const { label, value } of contributors)
      writer.line(2, `- ${label} | ${value}`);
  }
  if (shownGroups.length > 0) {
    writer.line(1, 'leaderboard Top contributors');
    for (const { title, top, rows } of shownGroups) {
      writer.line(2, `group ${topIcon(top.kind)} ${title}`);
      for (const { label, pct } of rows.slice(0, MAX_TOP_ROWS_PER_GROUP))
        writer.line(2, `- ${label} | ${formatPtahUiNumber(pct)}`);
    }
    if (hiddenRows > 0) writer.line(1, `note info +${hiddenRows} more`);
  }
}

/**
 * Renders a usage report as a ptah-ui fence body (no fence lines), or `null`
 * when nothing in it can be shown.
 */
export function renderUsagePtahUi(report: UsageReport): string | null {
  const writer = new PtahUiWriter();
  writer.line(0, 'title Claude usage');

  const limits = report.limits.filter((limit) => escapePtahUi(limit.label));
  if (limits.length > 0) {
    writer.line(0, `grid ${Math.min(limits.length, MAX_LIMIT_CARDS)}`);
    for (const limit of limits.slice(0, MAX_LIMIT_CARDS)) {
      writer.line(1, `card ${escapePtahUi(limit.label)}`);
      const window = escapePtahUi(limit.window) || 'Used';
      writer.line(
        2,
        `progress ${window} | ${formatPercentValue(limit.pct)} | ${percentTone(limit.pct)}`,
      );
      const reset = limit.reset ? escapePtahUi(limit.reset) : '';
      if (reset) writer.line(2, `badge neutral ${reset}`);
    }
  }
  if (limits.length > MAX_LIMIT_CARDS) {
    writer.line(0, 'table');
    writer.line(1, 'Limit | Used | Reset');
    for (const limit of limits.slice(MAX_LIMIT_CARDS)) {
      const reset = escapePtahUi(limit.reset ?? '') || '—';
      writer.line(
        1,
        `${escapePtahUi(limit.label)} | ${formatPercentValue(limit.pct)}% | ${reset}`,
      );
    }
  }

  for (const window of report.windows) writeWindow(writer, window);

  for (const note of report.notes) {
    const text = escapePtahUi(note, 160);
    if (text) writer.line(0, `note info ${text}`);
  }
  return writer.itemCount > 0 ? writer.body() : null;
}

import type { UsageReport, UsageWindow } from './local-command.types';
import {
  escapePtahUi,
  formatPercentValue,
  formatPtahUiNumber,
  percentTone,
  PtahUiWriter,
} from './ptah-ui-writer';

const MAX_CONTRIBUTORS = 10;
const MAX_TOP_ROWS = 12;
const MAX_GRID_COLUMNS = 4;
const CHART_LABEL_LENGTH = 48;

function writeWindow(writer: PtahUiWriter, window: UsageWindow): void {
  const title = escapePtahUi(window.title);
  if (!title) return;
  const stats: string[] = [];
  if (window.requests !== null)
    stats.push(`Requests | ${formatPtahUiNumber(window.requests)}`);
  if (window.sessions !== null)
    stats.push(`Sessions | ${formatPtahUiNumber(window.sessions)}`);

  const points = window.contributors
    .slice(0, MAX_CONTRIBUTORS)
    .map((c) => ({
      label: escapePtahUi(c.label, CHART_LABEL_LENGTH),
      value: formatPtahUiNumber(c.pct),
    }))
    .filter((p) => p.label);

  const rows: string[] = [];
  for (const top of window.tops) {
    const kind = escapePtahUi(top.kind);
    if (!kind) continue;
    for (const item of top.items) {
      const name = escapePtahUi(item.name);
      if (name) rows.push(`${kind} | ${name} | ${formatPtahUiNumber(item.pct)}%`);
    }
    if (top.more > 0)
      rows.push(`${kind} | +${formatPtahUiNumber(top.more)} more | —`);
  }
  const shownRows = rows.slice(0, MAX_TOP_ROWS);
  const hiddenRows = rows.length - shownRows.length;

  if (stats.length === 0 && points.length === 0 && shownRows.length === 0)
    return;
  writer.line(0, `section ${title}`);
  if (stats.length > 0) {
    writer.line(1, 'stats');
    for (const stat of stats) writer.line(2, stat);
  }
  if (points.length > 0) {
    writer.line(1, 'chart bar Contributors (% of usage)');
    for (const point of points) writer.line(2, `${point.label} | ${point.value}`);
  }
  if (shownRows.length > 0) {
    writer.line(1, 'table');
    writer.line(2, 'Top | Name | Share');
    for (const row of shownRows) writer.line(2, row);
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
    writer.line(0, `grid ${Math.min(limits.length, MAX_GRID_COLUMNS)}`);
    for (const limit of limits) {
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

  for (const window of report.windows) writeWindow(writer, window);

  for (const note of report.notes) {
    const text = escapePtahUi(note, 160);
    if (text) writer.line(0, `note info ${text}`);
  }
  return writer.itemCount > 0 ? writer.body() : null;
}

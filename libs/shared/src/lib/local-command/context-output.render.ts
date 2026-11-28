import { SURFACE_METER_MAX_SEGMENTS } from '../../mcp-apps-contracts/surface-catalog';
import type {
  ContextItem,
  ContextMemoryFile,
  ContextReport,
} from './local-command.types';
import {
  escapePtahUi,
  formatPercentValue,
  formatPtahUiNumber,
  percentTone,
  PtahUiWriter,
} from './ptah-ui-writer';

const MAX_ROWS = 8;
const FREE_SPACE = 'free space';
const AUTOCOMPACT_BUFFER = 'autocompact buffer';

function byTokens<T extends { readonly tokens: { readonly value: number } }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => b.tokens.value - a.tokens.value);
}

/** Drops the `mcp__<server>__` prefix the server column already shows. */
function shortToolName(item: ContextItem): string {
  const prefix = item.source ? `mcp__${item.source}__` : '';
  return prefix && item.name.startsWith(prefix)
    ? item.name.slice(prefix.length)
    : item.name;
}

function writeTable(
  writer: PtahUiWriter,
  heading: string,
  header: string,
  rows: readonly string[],
): void {
  if (rows.length === 0) return;
  const shown = rows.slice(0, MAX_ROWS);
  writer.line(0, `accordion ${heading} (${rows.length})`);
  writer.line(1, 'table');
  writer.line(2, header);
  for (const row of shown) writer.line(2, row);
  if (rows.length > shown.length)
    writer.line(1, `note info +${rows.length - shown.length} more`);
}

function writeLeaderboard(
  writer: PtahUiWriter,
  heading: string,
  items: readonly ContextItem[],
  name: (item: ContextItem) => string,
): void {
  const rows = byTokens(items)
    .map((item) => ({ label: escapePtahUi(name(item)), item }))
    .filter((row) => row.label);
  if (rows.length === 0) return;
  const total = rows.reduce((sum, { item }) => sum + item.tokens.value, 0);
  writer.line(0, `accordion ${heading} (${rows.length})`);
  writer.line(1, 'leaderboard');
  for (const { label, item } of rows.slice(0, MAX_ROWS)) {
    const share = formatPercentValue(total > 0 ? (item.tokens.value / total) * 100 : 0);
    const value = escapePtahUi(item.tokens.text);
    const detail = escapePtahUi(item.source ?? '');
    writer.line(2, `- ${label} | ${share} | ${value}${detail ? ` | ${detail}` : ''}`);
  }
  if (rows.length > MAX_ROWS)
    writer.line(1, `note info +${rows.length - MAX_ROWS} more`);
}

function memoryRows(files: readonly ContextMemoryFile[]): string[] {
  return byTokens(files)
    .map((file) => ({
      type: escapePtahUi(file.type),
      tokens: escapePtahUi(file.tokens.text),
    }))
    .filter((row) => row.type)
    .map((row) => `${row.type} | ${row.tokens}`);
}

/**
 * Renders a context report as a ptah-ui fence body (no fence lines), or
 * `null` when nothing in it can be shown. Memory file paths are never shown.
 */
export function renderContextPtahUi(report: ContextReport): string | null {
  const writer = new PtahUiWriter();
  writer.line(0, 'title Context usage');

  const free = report.categories.find(
    (category) => category.name.toLowerCase() === FREE_SPACE,
  );
  const stats: string[] = [];
  const model = report.model ? escapePtahUi(report.model) : '';
  if (model) stats.push(`Model | ${model}`);
  if (report.used && report.total)
    stats.push(
      `Used | ${escapePtahUi(report.used.text)} / ${escapePtahUi(report.total.text)}`,
    );
  else if (report.used) stats.push(`Used | ${escapePtahUi(report.used.text)}`);
  if (report.usedPct !== null)
    stats.push(`Used % | ${formatPtahUiNumber(report.usedPct)}%`);
  if (free) stats.push(`Free | ${escapePtahUi(free.tokens.text)}`);
  if (stats.length > 0) {
    writer.line(0, 'stats');
    for (const stat of stats) writer.line(1, stat);
  }
  if (report.usedPct !== null)
    writer.line(
      0,
      `progress Context window | ${formatPercentValue(report.usedPct)} | ${percentTone(report.usedPct)}`,
    );

  const segments = report.categories
    .map((category) => ({ label: escapePtahUi(category.name, 48), category }))
    .filter((segment) => segment.label);
  if (segments.length > 0) {
    writer.line(0, 'meter Estimated usage by category');
    const shown = segments.slice(0, SURFACE_METER_MAX_SEGMENTS);
    for (const { label, category } of shown) {
      const normalized = category.name.toLowerCase();
      const muted = normalized === FREE_SPACE || normalized === AUTOCOMPACT_BUFFER;
      writer.line(
        1,
        `${label} | ${formatPtahUiNumber(category.tokens.value)} | ${escapePtahUi(category.tokens.text)}${muted ? ' | muted' : ''}`,
      );
    }
    if (segments.length > shown.length)
      writer.line(0, `note info +${segments.length - shown.length} more categories`);
  }

  writeLeaderboard(writer, 'MCP tools', report.mcpTools, shortToolName);
  writeLeaderboard(writer, 'Custom agents', report.customAgents, (item) => item.name);
  writeTable(
    writer,
    'Memory files',
    'Type | Tokens',
    memoryRows(report.memoryFiles),
  );
  writeLeaderboard(writer, 'Skills', report.skills, (item) => item.name);

  return writer.itemCount > 0 ? writer.body() : null;
}

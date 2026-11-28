import type {
  ContextCategory,
  ContextItem,
  ContextMemoryFile,
  ContextReport,
  TokenCount,
} from './local-command.types';
import {
  cleanText,
  normaliseCommandText,
  parsePercent,
  parseTokens,
} from './local-command-text';

const REPORT_HEADING = /^#{1,3}\s*Context Usage\s*$/i;
const SECTION_HEADING = /^#{2,4}\s+(.+?)\s*$/;
const MODEL_LINE = /^\*\*Model:\*\*\s*(.+)$/;
/** `**Tokens:** 45.5k / 1m (5%)` */
const TOKENS_LINE =
  /^\*\*Tokens:\*\*\s*(\S+)\s*\/\s*(\S+)(?:\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\))?/;
const TABLE_SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

interface Table {
  readonly heading: string;
  readonly header: readonly string[];
  readonly rows: string[][];
}

/** Splits a markdown table row on unescaped pipes; `\|` stays a literal pipe. */
function splitRow(line: string): string[] {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === '\\' && body[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (char === '|') {
      cells.push(cleanText(cell));
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cleanText(cell));
  return cells;
}

function tokenCount(text: string | undefined): TokenCount | null {
  if (text === undefined) return null;
  const value = parseTokens(text);
  return value === null ? null : { value, text: cleanText(text) };
}

function columnIndex(header: readonly string[], ...names: string[]): number {
  return header.findIndex((cell) =>
    names.some((name) => cell.toLowerCase() === name),
  );
}

function readCategories(table: Table): ContextCategory[] {
  const name = columnIndex(table.header, 'category');
  const tokens = columnIndex(table.header, 'tokens');
  const pct = columnIndex(table.header, 'percentage', '%');
  if (name < 0 || tokens < 0) return [];
  const out: ContextCategory[] = [];
  for (const row of table.rows) {
    const count = tokenCount(row[tokens]);
    if (!row[name] || !count) continue;
    out.push({
      name: row[name],
      tokens: count,
      pct: pct >= 0 && row[pct] !== undefined ? parsePercent(row[pct]) : null,
    });
  }
  return out;
}

function readItems(table: Table, sourceNames: string[]): ContextItem[] {
  const tokens = columnIndex(table.header, 'tokens');
  const source = columnIndex(table.header, ...sourceNames);
  if (tokens < 0) return [];
  const name = table.header.findIndex(
    (_cell, index) => index !== tokens && index !== source,
  );
  if (name < 0) return [];
  const out: ContextItem[] = [];
  for (const row of table.rows) {
    const count = tokenCount(row[tokens]);
    if (!row[name] || !count) continue;
    out.push({
      name: row[name],
      source: source >= 0 && row[source] ? row[source] : null,
      tokens: count,
    });
  }
  return out;
}

function readMemoryFiles(table: Table): ContextMemoryFile[] {
  const type = columnIndex(table.header, 'type');
  const tokens = columnIndex(table.header, 'tokens');
  if (type < 0 || tokens < 0) return [];
  const out: ContextMemoryFile[] = [];
  for (const row of table.rows) {
    const count = tokenCount(row[tokens]);
    // The path column is never read: it carries the user's home directory.
    if (row[type] && count) out.push({ type: row[type], tokens: count });
  }
  return out;
}

function collectTables(lines: readonly string[]): Table[] {
  const tables: Table[] = [];
  let heading = '';
  let current: Table | null = null;
  let pendingHeader: string[] | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const section = SECTION_HEADING.exec(trimmed);
    if (section) {
      heading = cleanText(section[1]);
      current = null;
      pendingHeader = null;
      continue;
    }
    if (!trimmed.startsWith('|')) {
      current = null;
      pendingHeader = null;
      continue;
    }
    if (TABLE_SEPARATOR.test(trimmed)) {
      if (pendingHeader) {
        current = { heading, header: pendingHeader, rows: [] };
        tables.push(current);
        pendingHeader = null;
      }
      continue;
    }
    const cells = splitRow(trimmed);
    if (current) current.rows.push(cells);
    else pendingHeader = cells.map((cell) => cell.toLowerCase());
  }
  return tables;
}

/**
 * Parses Claude Code `/context` stdout (its markdown form). Returns `null`
 * when the `Context Usage` heading or every data line is missing. Never throws.
 */
export function parseContextOutput(text: string): ContextReport | null {
  if (typeof text !== 'string' || !text) return null;
  const lines = normaliseCommandText(text);
  if (!lines.some((line) => REPORT_HEADING.test(line.trim()))) return null;

  let model: string | null = null;
  let used: TokenCount | null = null;
  let total: TokenCount | null = null;
  let usedPct: number | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const modelMatch = MODEL_LINE.exec(trimmed);
    if (modelMatch) model = cleanText(modelMatch[1]) || null;
    const tokensMatch = TOKENS_LINE.exec(trimmed);
    if (tokensMatch) {
      used = tokenCount(tokensMatch[1]);
      total = tokenCount(tokensMatch[2]);
      usedPct = tokensMatch[3] !== undefined ? Number(tokensMatch[3]) : null;
    }
  }

  const report: ContextReport = {
    kind: 'context',
    model,
    used,
    total,
    usedPct,
    categories: [],
    mcpTools: [],
    customAgents: [],
    memoryFiles: [],
    skills: [],
  };
  const sections: {
    categories: ContextCategory[];
    mcpTools: ContextItem[];
    customAgents: ContextItem[];
    memoryFiles: ContextMemoryFile[];
    skills: ContextItem[];
  } = {
    categories: [],
    mcpTools: [],
    customAgents: [],
    memoryFiles: [],
    skills: [],
  };
  for (const table of collectTables(lines)) {
    const heading = table.heading.toLowerCase();
    if (table.header.includes('category'))
      sections.categories.push(...readCategories(table));
    else if (heading.startsWith('mcp tools'))
      sections.mcpTools.push(...readItems(table, ['server']));
    else if (heading.startsWith('custom agents'))
      sections.customAgents.push(...readItems(table, ['source']));
    else if (heading.startsWith('memory files'))
      sections.memoryFiles.push(...readMemoryFiles(table));
    else if (heading.startsWith('skills'))
      sections.skills.push(...readItems(table, ['source']));
  }

  if (!used && sections.categories.length === 0) return null;
  return { ...report, ...sections };
}

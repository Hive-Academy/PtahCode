/**
 * Compact, lossless text for an AST analysis result (TASK_2026_559 Batch 20.2p).
 *
 * `JSON.stringify` of an analysis result repeats every field name on every
 * function, class, import and export record; on a function-heavy file that
 * made the answer only ~30% smaller in tokens than reading the file, short of
 * the "40-60% fewer tokens" the MCP prompt promises. This format keeps the
 * result valid JSON with the same top-level keys in the same order (so parse
 * status and coverage stay first), and writes each list of records as a table:
 *
 *   "functions":[["name","parameters","startLine","endLine"],["load",["id"],3,9]]
 *
 * - The first row names the columns: the union of the record fields, in the
 *   order they first appear. Every following row is one record.
 * - A `null` cell, or a row shorter than the header, means the record does not
 *   have that field (the same thing `JSON.stringify` expresses by omitting an
 *   `undefined` field).
 * - A list that cannot be tabulated without ambiguity — a record that is not a
 *   plain object, or has a real `null` value — is written unchanged as an
 *   array of objects. An empty list stays `[]`.
 *
 * Nothing else changes: nested values (parameter lists, imported symbols,
 * coverage) are written exactly as `JSON.stringify` writes them.
 */

type JsonRecord = Record<string, unknown>;

/** How {@link formatAstAnalysisResult} bounds its text. */
export interface AstResultFormatOptions {
  /**
   * Whether a candidate text is small enough. Omitted: the whole result is
   * written. When the whole text does not fit, list keys are cut at a record
   * boundary, the last list first, until the text fits.
   */
  readonly fits?: (text: string) => boolean;
  /** One line written as `hint` after `truncated` when a list was cut. */
  readonly hint?: string;
}

/** Rows shown of a cut list, and how many it had. */
interface ShownOfTotal {
  shown: number;
  total: number;
  /** Names of the cut records, comma-separated, so a cut list still names them. */
  omittedNames?: string;
}

/** Most cut-record names listed, and most characters they may take. */
const OMITTED_NAMES_MAX = 150;
const OMITTED_NAMES_MAX_CHARS = 1800;

/** `a,b,c` of the `name` fields of `list` past `shown`; `undefined` when none. */
function omittedNamesOf(
  list: readonly unknown[],
  shown: number,
): string | undefined {
  const names: string[] = [];
  let chars = 0;
  for (const record of list.slice(shown)) {
    const name =
      typeof record === 'object' && record !== null && 'name' in record
        ? record.name
        : undefined;
    if (typeof name !== 'string' || name === '') {
      continue;
    }
    if (
      names.length >= OMITTED_NAMES_MAX ||
      chars + name.length + 1 > OMITTED_NAMES_MAX_CHARS
    ) {
      names.push('…');
      break;
    }
    names.push(name);
    chars += name.length + 1;
  }
  return names.length > 0 ? names.join(',') : undefined;
}

/**
 * Serialise `result` with each list of records written as a table.
 *
 * With `options.fits`, a text that does not fit is shortened at record
 * boundaries: the last list key loses trailing records first (the longest
 * prefix that fits, by binary search), then the list before it, and so on.
 * Each cut list is named in `"truncated":{"<key>":{"shown":N,"total":M}}`,
 * followed by `hint`, both placed right before the first list key so they
 * survive any later cut. When even every list emptied does not fit, the
 * shortest form (all lists empty) is returned; the caller's budget decides.
 */
export function formatAstAnalysisResult(
  result: object,
  options: AstResultFormatOptions = {},
): string {
  const entries = Object.entries(result);
  const full = serialise(entries, new Map(), options.hint);
  const fits = options.fits;
  if (!fits || fits(full)) {
    return full;
  }
  const listKeys = entries
    .filter(([, value]) => Array.isArray(value))
    .map(([key]) => key);
  const shown = new Map<string, ShownOfTotal>();
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      shown.set(key, { shown: value.length, total: value.length });
    }
  }
  const render = (): string => serialise(entries, shown, options.hint);
  for (let i = listKeys.length - 1; i >= 0; i--) {
    const entry = shown.get(listKeys[i]);
    if (!entry || entry.total === 0) {
      continue;
    }
    // Largest row count that fits, with the earlier lists still whole.
    let low = 0;
    let high = entry.total - 1;
    entry.shown = 0;
    if (!fits(render())) {
      continue;
    }
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      entry.shown = mid;
      if (fits(render())) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    entry.shown = low;
    return render();
  }
  return render();
}

/** The JSON text with `shown` cuts applied and the truncation note placed. */
function serialise(
  entries: readonly [string, unknown][],
  shown: ReadonlyMap<string, ShownOfTotal>,
  hint: string | undefined,
): string {
  const truncated: Record<string, ShownOfTotal> = {};
  for (const [key, entry] of shown) {
    if (entry.shown < entry.total) {
      const list = entries.find(([entryKey]) => entryKey === key)?.[1];
      const omittedNames = Array.isArray(list)
        ? omittedNamesOf(list, entry.shown)
        : undefined;
      truncated[key] = {
        shown: entry.shown,
        total: entry.total,
        ...(omittedNames ? { omittedNames } : {}),
      };
    }
  }
  const isCut = Object.keys(truncated).length > 0;
  const out: JsonRecord = {};
  let noted = false;
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      if (isCut && !noted) {
        out['truncated'] = truncated;
        if (hint !== undefined) {
          out['hint'] = hint;
        }
        noted = true;
      }
      const cut = shown.get(key);
      const list = cut ? value.slice(0, cut.shown) : value;
      out[key] = tabulate(list) ?? list;
    } else {
      out[key] = value;
    }
  }
  return JSON.stringify(out);
}

/** Header row plus one row per record, or `undefined` when not tabulable. */
function tabulate(list: readonly unknown[]): unknown[][] | undefined {
  if (list.length === 0 || !list.every(isTabulableRecord)) {
    return undefined;
  }
  const columns: string[] = [];
  for (const record of list) {
    for (const [field, value] of Object.entries(record)) {
      if (value !== undefined && !columns.includes(field)) {
        columns.push(field);
      }
    }
  }
  const rows = list.map((record) => {
    const row = columns.map((field) => record[field] ?? null);
    while (row.length > 0 && row[row.length - 1] === null) {
      row.pop();
    }
    return row;
  });
  return [columns, ...rows];
}

/** A plain object none of whose fields holds a real `null`. */
function isTabulableRecord(value: unknown): value is JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return false;
  }
  return Object.values(value).every((field) => field !== null);
}

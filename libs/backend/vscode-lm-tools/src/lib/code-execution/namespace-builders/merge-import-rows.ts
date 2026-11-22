/**
 * Import row merge for presentation (TASK_2026_2299).
 *
 * The TS/JS import query yields one row per captured name, so
 * `import { injectable, inject } from 'tsyringe'` reaches a caller as several
 * rows of one source, one of them with no symbol at all. This merge runs only
 * where results are shown; the dependency graph keeps reading the service's
 * own rows.
 *
 * Rules:
 * - A row is merged only when it has no keys besides `source`,
 *   `importedSymbols`, `isDefault` and `isNamespace` (the TS/JS shape). A row
 *   with any other field (`kind`, `line`, `scopePath`, aliases...) carries a
 *   per-statement contract and passes unchanged.
 * - Mergeable rows of one source become one row at the place of the first:
 *   the default symbol first, then the other symbols in order, each once.
 *   `isDefault` / `isNamespace` are kept when any merged row had them.
 * - A row without symbols is dropped when its source has symbols; a source
 *   with no symbols at all stays as one `{ source }` row.
 */

export interface ImportRowShape {
  source: string;
  importedSymbols?: string[];
  isDefault?: boolean;
  isNamespace?: boolean;
}

const MERGEABLE_KEYS: ReadonlySet<string> = new Set([
  'source',
  'importedSymbols',
  'isDefault',
  'isNamespace',
]);

function isMergeable(row: ImportRowShape): boolean {
  return Object.keys(row).every((key) => MERGEABLE_KEYS.has(key));
}

interface MergeGroup {
  defaults: string[];
  others: string[];
  isDefault: boolean;
  isNamespace: boolean;
}

export function mergeImportRows<T extends ImportRowShape>(rows: T[]): T[] {
  const groups = new Map<string, MergeGroup>();
  // Each output slot is either a pass-through row or the source of a group.
  const slots: Array<{ row: T } | { source: string }> = [];

  for (const row of rows) {
    if (!isMergeable(row)) {
      slots.push({ row });
      continue;
    }
    const existing = groups.get(row.source);
    const group: MergeGroup = existing ?? {
      defaults: [],
      others: [],
      isDefault: false,
      isNamespace: false,
    };
    if (!existing) {
      groups.set(row.source, group);
      slots.push({ source: row.source });
    }
    const symbols = row.importedSymbols ?? [];
    symbols.forEach((symbol, index) => {
      // A default row lists its default name first (`X` of `import X, {a}`).
      const target = row.isDefault && index === 0 ? group.defaults : group.others;
      if (!group.defaults.includes(symbol) && !group.others.includes(symbol)) {
        target.push(symbol);
      }
    });
    group.isDefault ||= row.isDefault === true;
    group.isNamespace ||= row.isNamespace === true;
  }

  return slots.map((slot) => {
    if ('row' in slot) return slot.row;
    const group = groups.get(slot.source) as MergeGroup;
    const symbols = [...group.defaults, ...group.others];
    const merged: ImportRowShape = { source: slot.source };
    if (symbols.length > 0) merged.importedSymbols = symbols;
    if (group.isDefault) merged.isDefault = true;
    if (group.isNamespace) merged.isNamespace = true;
    // The merged row has only keys of the mergeable shape, which every T
    // shares (T adds no required key a mergeable row could have held).
    return merged as T;
  });
}

type ModelRow = { value: string; resolvedModel?: string };
export type ModelPickerGroup = 'primary' | 'other';

const withoutContextSuffix = (value: string): string =>
  value.replace(/\[[^\]]+\]$/, '').toLowerCase();

/**
 * Use the final SDK alias as the boundary between current and pinned rows.
 *
 * A catalog with fewer than two alias rows stays flat (all rows primary).
 * One alias row is not enough evidence of the alias-then-pinned layout, and
 * a boundary there would leave one visible row in the picker.
 */
export function modelPickerGroups(
  rows: readonly ModelRow[],
): ModelPickerGroup[] {
  const aliases = rows.flatMap((row, index) =>
    row.value.toLowerCase() === 'default' ||
    (row.resolvedModel !== undefined &&
      withoutContextSuffix(row.value) !==
        withoutContextSuffix(row.resolvedModel))
      ? [index]
      : [],
  );
  const lastAlias =
    aliases.length >= 2 ? aliases[aliases.length - 1] : rows.length - 1;
  return rows.map((_, index) => (index <= lastAlias ? 'primary' : 'other'));
}

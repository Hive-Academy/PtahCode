/** JSON-shaped values: object key order is irrelevant; array order is meaningful. */
export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value: unknown, index: number) =>
        deepEqual(value, right[index]),
      )
    );
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a)
    .filter((key) => a[key] !== undefined)
    .sort();
  const otherKeys = Object.keys(b)
    .filter((key) => b[key] !== undefined)
    .sort();
  return (
    keys.length === otherKeys.length &&
    keys.every(
      (key, index) => key === otherKeys[index] && deepEqual(a[key], b[key]),
    )
  );
}

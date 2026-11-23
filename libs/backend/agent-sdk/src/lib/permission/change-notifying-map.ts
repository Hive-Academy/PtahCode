/**
 * A `Map` that calls `onChange` after its membership changed (a new key, a
 * removed key, or a clear of a non-empty map). Overwriting an existing key
 * does not notify. The callback runs synchronously and must not throw; the
 * owner wraps it.
 *
 * It lets the permission handler publish "a prompt is pending" without
 * touching each of its scattered `delete` sites, and without a second
 * tracker that could drift from `pendingRequests`.
 */
export class ChangeNotifyingMap<K, V> extends Map<K, V> {
  constructor(private readonly onChange: () => void) {
    super();
  }

  override set(key: K, value: V): this {
    const added = !this.has(key);
    super.set(key, value);
    if (added) this.onChange();
    return this;
  }

  override delete(key: K): boolean {
    const removed = super.delete(key);
    if (removed) this.onChange();
    return removed;
  }

  override clear(): void {
    const hadEntries = this.size > 0;
    super.clear();
    if (hadEntries) this.onChange();
  }
}

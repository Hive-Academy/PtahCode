import { computed, signal } from '@angular/core';
import type { BotFailure } from './bot-error-messages';

export type AvatarState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly dataUrl: string }
  | { readonly status: 'error'; readonly error: BotFailure };
export const BOT_AVATAR_CACHE_LIMIT = 64;
/** Budget for retained UTF-16 image data, in addition to the settled-entry cap. */
export const BOT_AVATAR_CACHE_BYTES = 12 * 1024 * 1024;
function avatarBytes(state: AvatarState): number {
  return state.status === 'ready' ? state.dataUrl.length * 2 : 0;
}

/** Store-owned cache; loading tokens and staged-image protection share its lifetime. */
export class BotAvatarCache {
  private readonly _entries = signal<ReadonlyMap<string, AvatarState>>(
    new Map(),
  );
  private readonly avatarSequence = new Map<string, number>();
  private avatarCounter = 0;
  private _stagedImageId: string | null = null;

  public readonly entries = this._entries.asReadonly();
  public readonly bytes = computed(() =>
    [...this._entries().values()].reduce(
      (bytes, state) => bytes + avatarBytes(state),
      0,
    ),
  );

  public get stagedImageId(): string | null {
    return this._stagedImageId;
  }
  public clearStaged(): void {
    this._stagedImageId = null;
  }

  public stage(imageId: string, state: AvatarState): void {
    this.avatarSequence.delete(imageId);
    this._stagedImageId = imageId;
    this.cacheAvatar(imageId, state);
  }

  public beginLoad(imageId: string): number {
    const token = ++this.avatarCounter;
    this.avatarSequence.set(imageId, token);
    this.cacheAvatar(imageId, { status: 'loading' });
    return token;
  }

  public finishLoad(imageId: string, token: number, state: AvatarState): void {
    if (this.avatarSequence.get(imageId) !== token) return;
    this.avatarSequence.delete(imageId);
    this.cacheAvatar(imageId, state);
  }

  private cacheAvatar(id: string, state: AvatarState): void {
    const cache = new Map(this._entries());
    cache.delete(id);
    cache.set(id, state);
    let bytes = [...cache.values()].reduce(
      (total, entry) => total + avatarBytes(entry),
      0,
    );
    let settled = [...cache.values()].filter(
      (entry) => entry.status !== 'loading',
    ).length;
    while (settled > BOT_AVATAR_CACHE_LIMIT || bytes > BOT_AVATAR_CACHE_BYTES) {
      const oldest = [...cache].find(
        ([key, entry]) =>
          key !== id &&
          key !== this._stagedImageId &&
          entry.status !== 'loading',
      )?.[0];
      if (oldest === undefined) break; // Pending reads and protected images cannot be evicted.
      const entry = cache.get(oldest);
      if (entry) bytes -= avatarBytes(entry);
      settled--;
      cache.delete(oldest);
      this.avatarSequence.delete(oldest);
    }
    this._entries.set(cache);
  }
}

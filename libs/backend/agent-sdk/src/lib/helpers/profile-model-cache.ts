import { createHash } from 'node:crypto';
import type { ProviderProfile } from '@ptah-extension/shared';
import type { ModelInfo } from '../types/sdk-types/claude-sdk.types';

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 16;

/** In-memory catalog for isolated workspace profiles. Keys contain no credentials. */
export class ProfileModelCache {
  private readonly entries = new Map<string, { models: ModelInfo[]; expires: number }>();
  private readonly pending = new Map<string, Promise<ModelInfo[]>>();
  private generation = 0;

  clear(): void {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
  }

  get(profile: ProviderProfile, fetch: () => Promise<ModelInfo[]>): Promise<ModelInfo[]> {
    const identity = JSON.stringify({
      providerId: profile.providerId,
      baseUrl: profile.baseUrl,
      authEnv: Object.entries(profile.authEnv).sort(([a], [b]) => a.localeCompare(b)),
    });
    const key = createHash('sha256').update(identity).digest('hex');
    const cached = this.entries.get(key);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.models);
    if (cached) this.entries.delete(key);
    const running = this.pending.get(key);
    if (running) return running;

    const generation = this.generation;
    const promise = fetch();
    this.pending.set(key, promise);
    void promise.then(
      (models) => {
        if (generation !== this.generation || models.length === 0) return;
        this.entries.delete(key);
        this.entries.set(key, { models, expires: Date.now() + TTL_MS });
        while (this.entries.size > MAX_ENTRIES) {
          const oldest = this.entries.keys().next().value;
          if (oldest === undefined) break;
          this.entries.delete(oldest);
        }
      },
      () => { /* Rejection belongs to the caller; failed probes are never cached. */ },
    ).finally(() => {
      if (this.pending.get(key) === promise) this.pending.delete(key);
    });
    return promise;
  }
}

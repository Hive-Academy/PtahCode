/**
 * Permission Rule Store — owns the in-memory `permissionRules` map.
 *
 * Extracted from `sdk-permission-handler.ts` as .
 *
 * This is a plain class composed internally by `SdkPermissionHandler` — no DI
 * token and no `@injectable()` decorator. A future wave can add persistence
 * (save/load to disk) without touching the decision path or UI bridge.
 *
 * Library-internal; not re-exported.
 */

import type { Logger } from '@ptah-extension/vscode-core';
import type { PermissionRule } from '@ptah-extension/shared';

export class PermissionRuleStore {
  /**
   * Stored "Always Allow" permission rules
   * Maps sessionId and toolName to PermissionRule.
   */
  private readonly rules = new Map<string, PermissionRule>();

  constructor(private readonly logger: Logger) {}

  private key(toolName: string, sessionId: string): string {
    return `${sessionId}\u0000${toolName}`;
  }

  setRule(toolName: string, sessionId: string, rule: PermissionRule): void {
    this.rules.set(this.key(toolName, sessionId), rule);
  }

  getRule(toolName: string, sessionId?: string): PermissionRule | null {
    return sessionId ? this.rules.get(this.key(toolName, sessionId)) ?? null : null;
  }

  hasRule(toolName: string): boolean {
    return Array.from(this.rules.keys()).some((key) => key.endsWith(`\u0000${toolName}`));
  }

  clearRule(toolName: string): boolean {
    let deleted = false;
    for (const key of this.rules.keys()) {
      if (key.endsWith(`\u0000${toolName}`)) deleted = this.rules.delete(key) || deleted;
    }
    if (deleted) {
      this.logger.info(
        `[SdkPermissionHandler] Cleared permission rule for tool: ${toolName}`,
      );
    }
    return deleted;
  }

  clearAll(): void {
    const count = this.rules.size;
    this.rules.clear();
    this.logger.info(
      `[SdkPermissionHandler] Cleared all ${count} permission rules`,
    );
  }

  listRules(): PermissionRule[] {
    return Array.from(this.rules.values());
  }

  get size(): number {
    return this.rules.size;
  }
}

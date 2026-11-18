import { Injectable, computed, signal } from '@angular/core';
import type {
  PtahInstrumentBandSegment,
  PtahInstrumentBandTone,
} from '@ptah-extension/ui';

/** The sections of the Advanced page that the instrument band summarizes, in band order. */
export type AdvancedOverviewId =
  | 'membership'
  | 'agent-behaviour'
  | 'output-style'
  | 'mcp-server'
  | 'claude-tools'
  | 'setup';

/** What one section reports about itself. Only loaded data is reported (spec 2a). */
export interface AdvancedOverviewEntry {
  readonly value: string;
  readonly meta?: string;
  readonly tone: PtahInstrumentBandTone;
}

/** The band label and the element that a band segment moves focus to. */
const SEGMENTS: readonly {
  readonly id: AdvancedOverviewId;
  readonly label: string;
  readonly targetId: string;
}[] = [
  { id: 'membership', label: 'Membership', targetId: 'advanced-membership' },
  {
    id: 'agent-behaviour',
    label: 'Agent behaviour',
    targetId: 'advanced-agent-behaviour',
  },
  { id: 'output-style', label: 'Output style', targetId: 'advanced-output-style' },
  { id: 'mcp-server', label: 'MCP server', targetId: 'advanced-mcp-server' },
  {
    id: 'claude-tools',
    label: 'Claude Code tools',
    targetId: 'advanced-claude-tools',
  },
  { id: 'setup', label: 'Setup', targetId: 'advanced-setup' },
];

/**
 * Page-scoped summary of the Advanced sections for the instrument band. Each section component
 * writes its own entry with `report()` once its data has loaded and clears it with `clear()`
 * while it loads or shows an error, so the band bar is idle (neutral) for that section.
 * Provided by `AdvancedSettingsComponent`; a section that renders elsewhere injects it optionally.
 */
@Injectable()
export class AdvancedOverviewStore {
  private readonly entries = signal<
    Readonly<Partial<Record<AdvancedOverviewId, AdvancedOverviewEntry>>>
  >({});

  /** One band segment per section. A section without an entry shows "Not loaded" with an idle bar. */
  readonly segments = computed<readonly PtahInstrumentBandSegment[]>(() => {
    const entries = this.entries();
    return SEGMENTS.map((segment) => {
      const entry = entries[segment.id];
      return {
        id: segment.id,
        label: segment.label,
        targetId: segment.targetId,
        value: entry?.value ?? 'Not loaded',
        meta: entry?.meta,
        tone: entry?.tone ?? 'idle',
      };
    });
  });

  report(id: AdvancedOverviewId, entry: AdvancedOverviewEntry): void {
    const current = this.entries()[id];
    if (
      current &&
      current.value === entry.value &&
      current.meta === entry.meta &&
      current.tone === entry.tone
    ) {
      return;
    }
    this.entries.update((entries) => ({ ...entries, [id]: entry }));
  }

  clear(id: AdvancedOverviewId): void {
    if (!(id in this.entries())) return;
    this.entries.update((entries) => {
      const next = { ...entries };
      delete next[id];
      return next;
    });
  }
}

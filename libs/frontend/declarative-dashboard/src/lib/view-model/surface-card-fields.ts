import {
  SURFACE_ICON_TOKENS,
  SURFACE_LEADERBOARD_MAX_ENTRIES,
  SURFACE_LEADERBOARD_MAX_GROUPS,
  SURFACE_METER_MAX_SEGMENTS,
  SURFACE_LIMITS,
  type SurfaceLeaderboardGroup,
  type SurfaceMeterSegment,
} from '@ptah-extension/shared/mcp-apps-contracts/surface';

const ICON_TOKENS: ReadonlySet<unknown> = new Set(SURFACE_ICON_TOKENS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBoundedText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= SURFACE_LIMITS.maxStringLength;
}

export function isSurfaceCardTitle(value: unknown): boolean {
  return value === undefined || isBoundedText(value);
}

function isLabel(value: unknown): boolean {
  return isBoundedText(value) && value.length > 0;
}

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isEntry(value: unknown): boolean {
  return isRecord(value) && isLabel(value['label']) && isAmount(value['share'])
    && value['share'] <= 100 && isSurfaceCardTitle(value['value']) && isSurfaceCardTitle(value['detail']);
}

export function isSurfaceLeaderboardGroups(value: unknown): value is readonly SurfaceLeaderboardGroup[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > SURFACE_LEADERBOARD_MAX_GROUPS) return false;
  let count = 0;
  for (const group of value) {
    if (!isRecord(group) || !isSurfaceCardTitle(group['title'])
      || (group['icon'] !== undefined && !ICON_TOKENS.has(group['icon']))) return false;
    const entries = group['entries'];
    if (!Array.isArray(entries) || entries.length === 0) return false;
    count += entries.length;
    if (count > SURFACE_LEADERBOARD_MAX_ENTRIES) return false;
    for (const entry of entries) {
      if (!isEntry(entry)) return false;
    }
  }
  return true;
}

export function isSurfaceMeterSegments(value: unknown): value is readonly SurfaceMeterSegment[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > SURFACE_METER_MAX_SEGMENTS) return false;
  for (const segment of value) {
    if (!isRecord(segment) || !isLabel(segment['label']) || !isAmount(segment['amount'])
      || !isSurfaceCardTitle(segment['value'])
      || (segment['muted'] !== undefined && typeof segment['muted'] !== 'boolean')) return false;
  }
  return true;
}

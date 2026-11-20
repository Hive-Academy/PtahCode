// Migration 0076 — bots phase 1 (TASK_2026_2274_eb79): bot records, immutable
// revision snapshots and avatar image assets.
// bots holds the current record. A hard delete keeps a tombstone row
// (definition_json NULL, deleted_at set, both retention choices set).
// bot_revisions holds every full snapshot. It never cascades from bots.
// bot_avatar_images holds validated raster bytes. A staged upload has no owner
// and an expiry. A claimed image has one owner and no expiry.
// Enum-like values are checked here as the last guard. The application
// validates the JSON documents with Zod before it writes them.
// SECURITY: SQL MUST stay static. No template interpolation.
export const sql = `
CREATE TABLE IF NOT EXISTS bots (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  revision INTEGER NOT NULL CHECK (revision > 0),
  definition_json TEXT NULL,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('user', 'workspace')),
  workspace_root TEXT NULL,
  name TEXT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER NULL,
  deleted_at INTEGER NULL,
  retain_memory INTEGER NULL CHECK (retain_memory IS NULL OR retain_memory IN (0, 1)),
  retain_history INTEGER NULL CHECK (retain_history IS NULL OR retain_history IN (0, 1)),
  CHECK (
    (scope_kind = 'user' AND workspace_root IS NULL)
    OR (scope_kind = 'workspace' AND workspace_root IS NOT NULL AND length(workspace_root) > 0)
  ),
  CHECK (
    (deleted_at IS NULL AND definition_json IS NOT NULL AND name IS NOT NULL
      AND retain_memory IS NULL AND retain_history IS NULL)
    OR (deleted_at IS NOT NULL AND definition_json IS NULL AND enabled = 0
      AND retain_memory IS NOT NULL AND retain_history IS NOT NULL)
  ),
  CHECK (deleted_at IS NOT NULL OR archived_at IS NULL OR enabled = 0)
);

CREATE INDEX IF NOT EXISTS idx_bots_scope_list
  ON bots (scope_kind, workspace_root, archived_at, deleted_at, name, id);

CREATE TABLE IF NOT EXISTS bot_revisions (
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  definition_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (bot_id, revision)
);

CREATE TABLE IF NOT EXISTS bot_avatar_images (
  image_id TEXT NOT NULL PRIMARY KEY CHECK (length(image_id) = 36),
  media_type TEXT NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes BLOB NOT NULL CHECK (
    typeof(bytes) = 'blob' AND length(bytes) > 0 AND length(bytes) <= 2097152
  ),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('user', 'workspace')),
  workspace_root TEXT NULL,
  owner_bot_id TEXT NULL REFERENCES bots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NULL,
  CHECK (
    (scope_kind = 'user' AND workspace_root IS NULL)
    OR (scope_kind = 'workspace' AND workspace_root IS NOT NULL AND length(workspace_root) > 0)
  ),
  CHECK (
    (owner_bot_id IS NULL AND expires_at IS NOT NULL)
    OR (owner_bot_id IS NOT NULL AND expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_bot_avatar_images_staging
  ON bot_avatar_images (scope_kind, workspace_root, expires_at)
  WHERE owner_bot_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_bot_avatar_images_owner
  ON bot_avatar_images (owner_bot_id)
  WHERE owner_bot_id IS NOT NULL;
`;

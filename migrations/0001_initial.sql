CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  audit_channel_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permission_definitions (
  permission_key TEXT PRIMARY KEY,
  value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'integer', 'power')),
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS server_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_protected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (guild_id, name)
);

CREATE INDEX IF NOT EXISTS idx_server_groups_guild
  ON server_groups (guild_id, sort_order, name);

CREATE TABLE IF NOT EXISTS server_group_permissions (
  server_group_id INTEGER NOT NULL,
  permission_key TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'integer', 'power')),
  int_value INTEGER,
  bool_value INTEGER,
  grant_value INTEGER NOT NULL DEFAULT 0,
  negated INTEGER NOT NULL DEFAULT 0,
  skip INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (server_group_id, permission_key),
  FOREIGN KEY (server_group_id) REFERENCES server_groups (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_server_group_permissions_key
  ON server_group_permissions (permission_key);

CREATE TABLE IF NOT EXISTS server_group_members (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  server_group_id INTEGER NOT NULL,
  assigned_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id, server_group_id),
  FOREIGN KEY (server_group_id) REFERENCES server_groups (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_server_group_members_user
  ON server_group_members (guild_id, user_id);

CREATE TABLE IF NOT EXISTS client_permissions (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'integer', 'power')),
  int_value INTEGER,
  bool_value INTEGER,
  grant_value INTEGER NOT NULL DEFAULT 0,
  negated INTEGER NOT NULL DEFAULT 0,
  skip INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_client_permissions_user
  ON client_permissions (guild_id, user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_guild
  ON audit_logs (guild_id, created_at);

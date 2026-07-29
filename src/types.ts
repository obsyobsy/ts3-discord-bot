export interface Env {
  DB: D1Database;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_TOKEN: string;
  DASHBOARD_ADMIN_TOKEN?: string;
}

export type PermissionValueType = "boolean" | "integer" | "power";

export interface PermissionDefinition {
  key: string;
  type: PermissionValueType;
  description: string;
}

export interface PermissionInput {
  key: string;
  type: PermissionValueType;
  intValue: number | null;
  boolValue: boolean | null;
  grantValue: number;
  negated: boolean;
  skip: boolean;
}

export interface PermissionRow {
  permission_key: string;
  value_type: PermissionValueType;
  int_value: number | null;
  bool_value: number | null;
  grant_value: number;
  negated: number;
  skip: number;
  source_type?: string;
  source_name?: string;
}

export interface EffectivePermission {
  key: string;
  type: PermissionValueType;
  intValue: number | null;
  boolValue: boolean | null;
  grantValue: number;
  negated: boolean;
  skip: boolean;
  sources: string[];
}

export interface ServerGroup {
  id: number;
  guild_id: string;
  name: string;
  role_id: string | null;
  sort_order: number;
  is_protected: number;
}

export interface DiscordInteraction {
  id: string;
  application_id: string;
  token: string;
  type: number;
  guild_id?: string;
  channel_id?: string;
  member?: {
    user: {
      id: string;
      username?: string;
    };
    permissions?: string;
  };
  data?: {
    name: string;
    options?: DiscordOption[];
  };
}

export interface DiscordOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: DiscordOption[];
}

export interface CommandContext {
  env: Env;
  interaction: DiscordInteraction;
  guildId: string;
  actorUserId: string;
}

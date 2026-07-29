import { PERMISSION_DEFINITIONS, SEED_SERVER_GROUPS } from "./constants";
import type { Env, PermissionInput, PermissionRow, PermissionValueType, ServerGroup } from "./types";

export async function seedGuild(env: Env, guildId: string, actorUserId: string): Promise<void> {
  await ensurePermissionDefinitions(env.DB);
  await env.DB.prepare(
    "INSERT INTO guild_settings (guild_id) VALUES (?) ON CONFLICT(guild_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP"
  ).bind(guildId).run();

  for (const group of SEED_SERVER_GROUPS) {
    const serverGroup = await upsertServerGroup(
      env.DB,
      guildId,
      group.name,
      group.sortOrder,
      group.protected
    );

    for (const permission of group.permissions) {
      await setServerGroupPermission(env.DB, serverGroup.id, permission);
    }
  }

  const root = await getServerGroupByName(env.DB, guildId, "Root");
  if (!root) {
    throw new Error("Root group was not created");
  }

  await addServerGroupMember(env.DB, guildId, actorUserId, root.id, actorUserId);
}

export async function ensurePermissionDefinitions(db: D1Database): Promise<void> {
  for (const definition of PERMISSION_DEFINITIONS) {
    await db.prepare(
      `INSERT INTO permission_definitions (permission_key, value_type, description)
       VALUES (?, ?, ?)
       ON CONFLICT(permission_key) DO UPDATE SET value_type = excluded.value_type, description = excluded.description`
    ).bind(definition.key, definition.type, definition.description).run();
  }
}

export async function countServerGroups(db: D1Database, guildId: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM server_groups WHERE guild_id = ?")
    .bind(guildId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function upsertServerGroup(
  db: D1Database,
  guildId: string,
  name: string,
  sortOrder: number,
  protectedGroup: boolean
): Promise<ServerGroup> {
  await db.prepare(
    `INSERT INTO server_groups (guild_id, name, sort_order, is_protected)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, name) DO UPDATE SET sort_order = excluded.sort_order, is_protected = excluded.is_protected`
  ).bind(guildId, name, sortOrder, protectedGroup ? 1 : 0).run();

  const group = await getServerGroupByName(db, guildId, name);
  if (!group) {
    throw new Error(`Server Group not found after upsert: ${name}`);
  }

  return group;
}

export async function createServerGroup(
  db: D1Database,
  guildId: string,
  name: string,
  sortOrder: number
): Promise<ServerGroup> {
  await db.prepare(
    "INSERT INTO server_groups (guild_id, name, sort_order, is_protected) VALUES (?, ?, ?, 0)"
  ).bind(guildId, name, sortOrder).run();

  const group = await getServerGroupByName(db, guildId, name);
  if (!group) {
    throw new Error(`Server Group not found after create: ${name}`);
  }

  return group;
}

export async function deleteServerGroup(db: D1Database, groupId: number): Promise<void> {
  await db.prepare("DELETE FROM server_group_permissions WHERE server_group_id = ?").bind(groupId).run();
  await db.prepare("DELETE FROM server_group_members WHERE server_group_id = ?").bind(groupId).run();
  await db.prepare("DELETE FROM server_groups WHERE id = ?").bind(groupId).run();
}

export async function bindServerGroupRole(
  db: D1Database,
  groupId: number,
  roleId: string
): Promise<void> {
  await db.prepare("UPDATE server_groups SET role_id = ? WHERE id = ?")
    .bind(roleId, groupId)
    .run();
}

export async function getServerGroupByName(
  db: D1Database,
  guildId: string,
  name: string
): Promise<ServerGroup | null> {
  return await db.prepare(
    "SELECT id, guild_id, name, role_id, sort_order, is_protected FROM server_groups WHERE guild_id = ? AND lower(name) = lower(?)"
  ).bind(guildId, name).first<ServerGroup>();
}

export async function getServerGroupById(
  db: D1Database,
  guildId: string,
  id: number
): Promise<ServerGroup | null> {
  return await db.prepare(
    "SELECT id, guild_id, name, role_id, sort_order, is_protected FROM server_groups WHERE guild_id = ? AND id = ?"
  ).bind(guildId, id).first<ServerGroup>();
}

export async function listServerGroups(db: D1Database, guildId: string): Promise<ServerGroup[]> {
  const result = await db.prepare(
    "SELECT id, guild_id, name, role_id, sort_order, is_protected FROM server_groups WHERE guild_id = ? ORDER BY sort_order DESC, name ASC"
  ).bind(guildId).all<ServerGroup>();
  return result.results ?? [];
}

export async function setServerGroupPermission(
  db: D1Database,
  serverGroupId: number,
  input: PermissionInput
): Promise<void> {
  await db.prepare(
    `INSERT INTO server_group_permissions (
       server_group_id, permission_key, value_type, int_value, bool_value, grant_value, negated, skip
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(server_group_id, permission_key) DO UPDATE SET
       value_type = excluded.value_type,
       int_value = excluded.int_value,
       bool_value = excluded.bool_value,
       grant_value = excluded.grant_value,
       negated = excluded.negated,
       skip = excluded.skip`
  ).bind(
    serverGroupId,
    input.key,
    input.type,
    input.intValue,
    input.boolValue === null ? null : input.boolValue ? 1 : 0,
    input.grantValue,
    input.negated ? 1 : 0,
    input.skip ? 1 : 0
  ).run();
}

export async function getServerGroupPermissions(
  db: D1Database,
  serverGroupId: number
): Promise<PermissionRow[]> {
  const result = await db.prepare(
    `SELECT permission_key, value_type, int_value, bool_value, grant_value, negated, skip
     FROM server_group_permissions
     WHERE server_group_id = ?
     ORDER BY permission_key ASC`
  ).bind(serverGroupId).all<PermissionRow>();
  return result.results ?? [];
}

export async function getServerGroupPermission(
  db: D1Database,
  serverGroupId: number,
  key: string
): Promise<PermissionRow | null> {
  return await db.prepare(
    `SELECT permission_key, value_type, int_value, bool_value, grant_value, negated, skip
     FROM server_group_permissions
     WHERE server_group_id = ? AND permission_key = ?`
  ).bind(serverGroupId, key).first<PermissionRow>();
}

export async function removeServerGroupPermission(
  db: D1Database,
  serverGroupId: number,
  key: string
): Promise<void> {
  await db.prepare(
    "DELETE FROM server_group_permissions WHERE server_group_id = ? AND permission_key = ?"
  ).bind(serverGroupId, key).run();
}

export async function addServerGroupMember(
  db: D1Database,
  guildId: string,
  userId: string,
  serverGroupId: number,
  actorUserId: string
): Promise<void> {
  await db.prepare(
    `INSERT INTO server_group_members (guild_id, user_id, server_group_id, assigned_by_user_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, user_id, server_group_id) DO UPDATE SET assigned_by_user_id = excluded.assigned_by_user_id`
  ).bind(guildId, userId, serverGroupId, actorUserId).run();
}

export async function removeServerGroupMember(
  db: D1Database,
  guildId: string,
  userId: string,
  serverGroupId: number
): Promise<void> {
  await db.prepare(
    "DELETE FROM server_group_members WHERE guild_id = ? AND user_id = ? AND server_group_id = ?"
  ).bind(guildId, userId, serverGroupId).run();
}

export async function getUserServerGroups(
  db: D1Database,
  guildId: string,
  userId: string
): Promise<ServerGroup[]> {
  const result = await db.prepare(
    `SELECT sg.id, sg.guild_id, sg.name, sg.role_id, sg.sort_order, sg.is_protected
     FROM server_group_members sgm
     JOIN server_groups sg ON sg.id = sgm.server_group_id
     WHERE sgm.guild_id = ? AND sgm.user_id = ?
     ORDER BY sg.sort_order DESC, sg.name ASC`
  ).bind(guildId, userId).all<ServerGroup>();
  return result.results ?? [];
}

export async function getUserPermissionRows(
  db: D1Database,
  guildId: string,
  userId: string
): Promise<PermissionRow[]> {
  let groups = await getUserServerGroups(db, guildId, userId);
  if (groups.length === 0) {
    const guest = await getServerGroupByName(db, guildId, "Guest");
    groups = guest ? [guest] : [];
  }

  const rows: PermissionRow[] = [];
  for (const group of groups) {
    const permissions = await getServerGroupPermissions(db, group.id);
    rows.push(
      ...permissions.map((permission) => ({
        ...permission,
        source_type: "server_group",
        source_name: group.name
      }))
    );
  }

  const directPermissions = await getClientPermissions(db, guildId, userId);
  rows.push(
    ...directPermissions.map((permission) => ({
      ...permission,
      source_type: "client",
      source_name: `client:${userId}`
    }))
  );

  return rows;
}

export async function getClientPermissions(
  db: D1Database,
  guildId: string,
  userId: string
): Promise<PermissionRow[]> {
  const result = await db.prepare(
    `SELECT permission_key, value_type, int_value, bool_value, grant_value, negated, skip
     FROM client_permissions
     WHERE guild_id = ? AND user_id = ?
     ORDER BY permission_key ASC`
  ).bind(guildId, userId).all<PermissionRow>();
  return result.results ?? [];
}

export async function getClientPermission(
  db: D1Database,
  guildId: string,
  userId: string,
  key: string
): Promise<PermissionRow | null> {
  return await db.prepare(
    `SELECT permission_key, value_type, int_value, bool_value, grant_value, negated, skip
     FROM client_permissions
     WHERE guild_id = ? AND user_id = ? AND permission_key = ?`
  ).bind(guildId, userId, key).first<PermissionRow>();
}

export async function setClientPermission(
  db: D1Database,
  guildId: string,
  userId: string,
  input: PermissionInput
): Promise<void> {
  await db.prepare(
    `INSERT INTO client_permissions (
       guild_id, user_id, permission_key, value_type, int_value, bool_value, grant_value, negated, skip
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, user_id, permission_key) DO UPDATE SET
       value_type = excluded.value_type,
       int_value = excluded.int_value,
       bool_value = excluded.bool_value,
       grant_value = excluded.grant_value,
       negated = excluded.negated,
       skip = excluded.skip`
  ).bind(
    guildId,
    userId,
    input.key,
    input.type,
    input.intValue,
    input.boolValue === null ? null : input.boolValue ? 1 : 0,
    input.grantValue,
    input.negated ? 1 : 0,
    input.skip ? 1 : 0
  ).run();
}

export async function removeClientPermission(
  db: D1Database,
  guildId: string,
  userId: string,
  key: string
): Promise<void> {
  await db.prepare(
    "DELETE FROM client_permissions WHERE guild_id = ? AND user_id = ? AND permission_key = ?"
  ).bind(guildId, userId, key).run();
}

export async function getPermissionDefinition(
  db: D1Database,
  key: string
): Promise<{ permission_key: string; value_type: PermissionValueType; description: string } | null> {
  return await db.prepare(
    "SELECT permission_key, value_type, description FROM permission_definitions WHERE permission_key = ?"
  ).bind(key).first<{ permission_key: string; value_type: PermissionValueType; description: string }>();
}

export async function listPermissionDefinitions(
  db: D1Database
): Promise<Array<{ permission_key: string; value_type: PermissionValueType; description: string }>> {
  const result = await db.prepare(
    "SELECT permission_key, value_type, description FROM permission_definitions ORDER BY permission_key ASC"
  ).all<{ permission_key: string; value_type: PermissionValueType; description: string }>();
  return result.results ?? [];
}

export async function hasOtherGroupWithRole(
  db: D1Database,
  guildId: string,
  userId: string,
  roleId: string,
  excludedGroupId: number
): Promise<boolean> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS count
     FROM server_group_members sgm
     JOIN server_groups sg ON sg.id = sgm.server_group_id
     WHERE sgm.guild_id = ? AND sgm.user_id = ? AND sg.role_id = ? AND sg.id != ?`
  ).bind(guildId, userId, roleId, excludedGroupId).first<{ count: number }>();
  return (row?.count ?? 0) > 0;
}

export async function setAuditChannel(db: D1Database, guildId: string, channelId: string): Promise<void> {
  await db.prepare(
    `INSERT INTO guild_settings (guild_id, audit_channel_id)
     VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET audit_channel_id = excluded.audit_channel_id, updated_at = CURRENT_TIMESTAMP`
  ).bind(guildId, channelId).run();
}

export async function getAuditChannel(db: D1Database, guildId: string): Promise<string | null> {
  const row = await db.prepare("SELECT audit_channel_id FROM guild_settings WHERE guild_id = ?")
    .bind(guildId)
    .first<{ audit_channel_id: string | null }>();
  return row?.audit_channel_id ?? null;
}

export async function writeAudit(
  db: D1Database,
  guildId: string,
  actorUserId: string,
  action: string,
  targetUserId: string | null,
  details: unknown
): Promise<void> {
  await db.prepare(
    `INSERT INTO audit_logs (guild_id, actor_user_id, action, target_user_id, details_json)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(guildId, actorUserId, action, targetUserId, JSON.stringify(details)).run();
}

export async function exportGuildConfig(db: D1Database, guildId: string): Promise<unknown> {
  const groups = await listServerGroups(db, guildId);
  const groupsWithPermissions = [];
  for (const group of groups) {
    groupsWithPermissions.push({
      ...group,
      permissions: await getServerGroupPermissions(db, group.id)
    });
  }

  const memberships = await db.prepare(
    `SELECT user_id, server_group_id, assigned_by_user_id, created_at
     FROM server_group_members
     WHERE guild_id = ?
     ORDER BY created_at ASC`
  ).bind(guildId).all();

  const clientPermissions = await db.prepare(
    `SELECT user_id, permission_key, value_type, int_value, bool_value, grant_value, negated, skip, created_at
     FROM client_permissions
     WHERE guild_id = ?
     ORDER BY user_id ASC, permission_key ASC`
  ).bind(guildId).all();

  return {
    version: 1,
    guildId,
    exportedAt: new Date().toISOString(),
    serverGroups: groupsWithPermissions,
    memberships: memberships.results ?? [],
    clientPermissions: clientPermissions.results ?? []
  };
}

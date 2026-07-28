import { PermissionKeys } from "./constants";
import {
  getPermissionDefinition,
  getServerGroupPermission,
  getServerGroupPermissions,
  getUserPermissionRows
} from "./db";
import type { EffectivePermission, PermissionInput, PermissionRow, PermissionValueType, ServerGroup } from "./types";

export async function getEffectivePermissions(
  db: D1Database,
  guildId: string,
  userId: string
): Promise<Map<string, EffectivePermission>> {
  const rows = await getUserPermissionRows(db, guildId, userId);
  const permissions = new Map<string, EffectivePermission>();

  for (const row of rows) {
    mergePermission(permissions, row);
  }

  return permissions;
}

function mergePermission(permissions: Map<string, EffectivePermission>, row: PermissionRow): void {
  const key = row.permission_key;
  const source = `${row.source_type ?? "unknown"}:${row.source_name ?? "unknown"}`;
  const existing = permissions.get(key);

  if (row.negated) {
    permissions.set(key, {
      key,
      type: row.value_type,
      intValue: row.value_type === "boolean" ? null : 0,
      boolValue: row.value_type === "boolean" ? false : null,
      grantValue: Math.max(existing?.grantValue ?? 0, row.grant_value),
      negated: true,
      skip: Boolean(row.skip || existing?.skip),
      sources: [...(existing?.sources ?? []), `${source} negated`]
    });
    return;
  }

  if (existing?.negated) {
    existing.sources.push(source);
    existing.grantValue = Math.max(existing.grantValue, row.grant_value);
    return;
  }

  if (!existing) {
    permissions.set(key, {
      key,
      type: row.value_type,
      intValue: row.value_type === "boolean" ? null : row.int_value ?? 0,
      boolValue: row.value_type === "boolean" ? Boolean(row.bool_value) : null,
      grantValue: row.grant_value,
      negated: false,
      skip: Boolean(row.skip),
      sources: [source]
    });
    return;
  }

  if (row.value_type === "boolean") {
    existing.boolValue = Boolean(existing.boolValue || row.bool_value);
  } else {
    existing.intValue = Math.max(existing.intValue ?? 0, row.int_value ?? 0);
  }

  existing.grantValue = Math.max(existing.grantValue, row.grant_value);
  existing.skip = Boolean(existing.skip || row.skip);
  existing.sources.push(source);
}

export function hasBooleanPermission(
  permissions: Map<string, EffectivePermission>,
  key: string
): boolean {
  return permissions.get(key)?.boolValue === true;
}

export function getPowerPermission(
  permissions: Map<string, EffectivePermission>,
  key: string
): number {
  return permissions.get(key)?.intValue ?? 0;
}

export async function getGroupNeededPower(
  db: D1Database,
  group: ServerGroup,
  key: string
): Promise<number> {
  const permission = await getServerGroupPermission(db, group.id, key);
  return permission?.int_value ?? 0;
}

export async function denyReasonForGroupMembershipChange(
  db: D1Database,
  guildId: string,
  actorUserId: string,
  targetGroup: ServerGroup,
  action: "add" | "remove"
): Promise<string | null> {
  const permissions = await getEffectivePermissions(db, guildId, actorUserId);
  const actorPowerKey =
    action === "add" ? PermissionKeys.GROUP_MEMBER_ADD_POWER : PermissionKeys.GROUP_MEMBER_REMOVE_POWER;
  const neededPowerKey =
    action === "add" ? PermissionKeys.GROUP_NEEDED_MEMBER_ADD_POWER : PermissionKeys.GROUP_NEEDED_MEMBER_REMOVE_POWER;

  const actorPower = getPowerPermission(permissions, actorPowerKey);
  const neededPower = await getGroupNeededPower(db, targetGroup, neededPowerKey);

  if (actorPower < neededPower) {
    return `Permesso negato: hai ${actorPowerKey}=${actorPower}, ma il gruppo "${targetGroup.name}" richiede ${neededPowerKey}=${neededPower}.`;
  }

  return null;
}

export async function denyReasonForGroupModification(
  db: D1Database,
  guildId: string,
  actorUserId: string,
  targetGroup: ServerGroup
): Promise<string | null> {
  const permissions = await getEffectivePermissions(db, guildId, actorUserId);
  const actorPower = getPowerPermission(permissions, PermissionKeys.GROUP_MODIFY_POWER);
  const neededPower = await getGroupNeededPower(db, targetGroup, PermissionKeys.GROUP_NEEDED_MODIFY_POWER);

  if (actorPower < neededPower) {
    return `Permesso negato: hai ${PermissionKeys.GROUP_MODIFY_POWER}=${actorPower}, ma "${targetGroup.name}" richiede ${PermissionKeys.GROUP_NEEDED_MODIFY_POWER}=${neededPower}.`;
  }

  return null;
}

export async function denyReasonForPermissionWrite(
  db: D1Database,
  guildId: string,
  actorUserId: string,
  existingPermission: PermissionRow | null,
  requestedGrantValue: number
): Promise<string | null> {
  const permissions = await getEffectivePermissions(db, guildId, actorUserId);

  if (hasBooleanPermission(permissions, PermissionKeys.PERMISSION_MODIFY_POWER_IGNORE)) {
    return null;
  }

  const actorPower = getPowerPermission(permissions, PermissionKeys.PERMISSION_MODIFY_POWER);
  const neededPower = Math.max(existingPermission?.grant_value ?? 0, requestedGrantValue);

  if (actorPower < neededPower) {
    return `Permesso negato: hai ${PermissionKeys.PERMISSION_MODIFY_POWER}=${actorPower}, ma serve almeno ${neededPower}.`;
  }

  return null;
}

export async function parsePermissionInput(
  db: D1Database,
  key: string,
  rawValue: string,
  grantValue: number,
  negated: boolean,
  skip: boolean
): Promise<PermissionInput> {
  const definition = await getPermissionDefinition(db, key);
  const inferredType = inferPermissionType(key, rawValue);
  const type: PermissionValueType = definition?.value_type ?? inferredType;

  if (type === "boolean") {
    const boolValue = parseBoolean(rawValue);
    if (boolValue === null) {
      throw new Error(`Il permesso "${key}" richiede true o false.`);
    }

    return {
      key,
      type,
      boolValue,
      intValue: null,
      grantValue,
      negated,
      skip
    };
  }

  const intValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(intValue)) {
    throw new Error(`Il permesso "${key}" richiede un numero intero.`);
  }

  return {
    key,
    type,
    boolValue: null,
    intValue,
    grantValue,
    negated,
    skip
  };
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "si", "sì", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

function inferPermissionType(key: string, rawValue: string): PermissionValueType {
  if (key.startsWith("b_")) {
    return "boolean";
  }

  if (key.startsWith("i_")) {
    return "power";
  }

  return parseBoolean(rawValue) === null ? "integer" : "boolean";
}

export function formatEffectivePermission(permission: EffectivePermission | undefined, key: string): string {
  if (!permission) {
    return `\`${key}\` non impostato. Valore effettivo: \`0/false\`.`;
  }

  const value = permission.type === "boolean" ? String(permission.boolValue) : String(permission.intValue ?? 0);
  const flags = [
    `grant=${permission.grantValue}`,
    permission.negated ? "negated=true" : null,
    permission.skip ? "skip=true" : null
  ].filter(Boolean).join(", ");

  return `\`${key}\` = \`${value}\` (${flags})\nSorgenti: ${permission.sources.join(", ")}`;
}

export async function formatGroupPermissions(db: D1Database, group: ServerGroup): Promise<string> {
  const permissions = await getServerGroupPermissions(db, group.id);
  if (permissions.length === 0) {
    return "Nessun permesso impostato.";
  }

  return permissions.map((permission) => {
    const value = permission.value_type === "boolean" ? Boolean(permission.bool_value) : permission.int_value ?? 0;
    return `\`${permission.permission_key}\` = \`${value}\` grant=${permission.grant_value}${permission.negated ? " negated" : ""}${permission.skip ? " skip" : ""}`;
  }).join("\n");
}

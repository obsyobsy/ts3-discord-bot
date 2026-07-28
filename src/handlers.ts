import { InteractionResponseType, PermissionKeys } from "./constants";
import {
  addServerGroupMember,
  bindServerGroupRole,
  countServerGroups,
  createServerGroup,
  deleteServerGroup,
  exportGuildConfig,
  getAuditChannel,
  getClientPermission,
  getClientPermissions,
  getServerGroupByName,
  getServerGroupPermission,
  getUserServerGroups,
  hasOtherGroupWithRole,
  listServerGroups,
  removeClientPermission,
  removeServerGroupMember,
  seedGuild,
  setAuditChannel,
  setClientPermission,
  setServerGroupPermission,
  writeAudit
} from "./db";
import { addDiscordRole, interactionMessage, json, removeDiscordRole, sendAuditMessage } from "./discord";
import {
  denyReasonForGroupMembershipChange,
  denyReasonForGroupModification,
  denyReasonForPermissionWrite,
  formatEffectivePermission,
  formatGroupPermissions,
  getEffectivePermissions,
  hasBooleanPermission,
  parsePermissionInput
} from "./permissions";
import type { CommandContext, DiscordInteraction, DiscordOption, Env, PermissionInput } from "./types";

const DISCORD_PERMISSION_ADMINISTRATOR = 1n << 3n;
const DISCORD_PERMISSION_MANAGE_GUILD = 1n << 5n;

export async function handleInteraction(interaction: DiscordInteraction, env: Env): Promise<Response> {
  if (interaction.type === 1) {
    return json({ type: InteractionResponseType.PONG });
  }

  if (!interaction.guild_id || !interaction.member?.user?.id) {
    return interactionMessage("Questo bot funziona solo dentro un server Discord.", true);
  }

  const context: CommandContext = {
    env,
    interaction,
    guildId: interaction.guild_id,
    actorUserId: interaction.member.user.id
  };

  const commandName = interaction.data?.name;
  try {
    switch (commandName) {
      case "setup":
        return await handleSetup(context);
      case "servergroup":
        return await handleServerGroup(context);
      case "clientperm":
        return await handleClientPerm(context);
      case "perm":
        return await handlePerm(context);
      case "sync":
        return await handleSync(context);
      case "audit":
        return await handleAudit(context);
      case "backup":
        return await handleBackup(context);
      default:
        return interactionMessage("Comando non riconosciuto.", true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return interactionMessage(`Errore: ${message}`, true);
  }
}

async function handleSetup(context: CommandContext): Promise<Response> {
  const { subcommand } = subcommandOf(context.interaction);
  if (subcommand !== "seed") {
    return interactionMessage("Subcomando setup non riconosciuto.", true);
  }

  const groupCount = await countServerGroups(context.env.DB, context.guildId);
  if (groupCount > 0 && !(await actorHasBoolean(context, PermissionKeys.SERVERGROUP_CREATE))) {
    return interactionMessage("Setup già eseguito. Serve il permesso di creare Server Group per rilanciarlo.", true);
  }

  if (groupCount === 0 && !hasDiscordAdminLike(context.interaction)) {
    return interactionMessage("Il primo setup può essere eseguito solo da un amministratore Discord.", true);
  }

  await seedGuild(context.env, context.guildId, context.actorUserId);
  await audit(context, "setup.seed", context.actorUserId, { seededBy: context.actorUserId });
  return interactionMessage("Setup completato. Gruppi base creati e Root assegnato a te nel database del bot.", true);
}

async function handleServerGroup(context: CommandContext): Promise<Response> {
  const { subcommand, options } = subcommandOf(context.interaction);

  switch (subcommand) {
    case "list":
      return await listGroups(context);
    case "info":
      return await groupInfo(context, requireString(options, "name"));
    case "create":
      return await groupCreate(context, requireString(options, "name"), optionalInteger(options, "sort_order") ?? 0);
    case "delete":
      return await groupDelete(context, requireString(options, "name"));
    case "bind-role":
      return await groupBindRole(context, requireString(options, "name"), requireString(options, "role"));
    case "set-perm":
      return await groupSetPermission(
        context,
        requireString(options, "group"),
        requireString(options, "key"),
        requireString(options, "value"),
        optionalInteger(options, "grant") ?? 0,
        optionalBoolean(options, "negated") ?? false,
        optionalBoolean(options, "skip") ?? false
      );
    case "add-member":
      return await groupAddMember(context, requireString(options, "user"), requireString(options, "group"));
    case "remove-member":
      return await groupRemoveMember(context, requireString(options, "user"), requireString(options, "group"));
    default:
      return interactionMessage("Subcomando servergroup non riconosciuto.", true);
  }
}

async function listGroups(context: CommandContext): Promise<Response> {
  const groups = await listServerGroups(context.env.DB, context.guildId);
  if (groups.length === 0) {
    return interactionMessage("Nessun Server Group configurato. Esegui `/setup seed`.", true);
  }

  const lines = groups.map((group) => {
    const role = group.role_id ? `<@&${group.role_id}>` : "nessun ruolo";
    return `- **${group.name}** sort=${group.sort_order}, role=${role}${group.is_protected ? ", protected" : ""}`;
  });
  return interactionMessage(lines.join("\n"), true);
}

async function groupInfo(context: CommandContext, name: string): Promise<Response> {
  const group = await mustGetGroup(context, name);
  const role = group.role_id ? `<@&${group.role_id}>` : "nessun ruolo";
  const permissions = await formatGroupPermissions(context.env.DB, group);
  return interactionMessage(`**${group.name}**\nsort=${group.sort_order}, role=${role}, protected=${Boolean(group.is_protected)}\n\n${truncate(permissions, 1650)}`, true);
}

async function groupCreate(context: CommandContext, name: string, sortOrder: number): Promise<Response> {
  if (!(await actorHasBoolean(context, PermissionKeys.SERVERGROUP_CREATE))) {
    return interactionMessage(`Permesso negato: manca \`${PermissionKeys.SERVERGROUP_CREATE}\`.`, true);
  }

  validateGroupName(name);
  const group = await createServerGroup(context.env.DB, context.guildId, name, sortOrder);
  await setDefaultNeededPowers(context.env.DB, group.id, Math.max(0, sortOrder));
  await audit(context, "servergroup.create", null, { group: name, sortOrder });
  return interactionMessage(`Server Group "${name}" creato. Imposta i permessi con \`/servergroup set-perm\`.`, true);
}

async function groupDelete(context: CommandContext, name: string): Promise<Response> {
  if (!(await actorHasBoolean(context, PermissionKeys.SERVERGROUP_DELETE))) {
    return interactionMessage(`Permesso negato: manca \`${PermissionKeys.SERVERGROUP_DELETE}\`.`, true);
  }

  const group = await mustGetGroup(context, name);
  if (group.is_protected) {
    return interactionMessage("Questo gruppo è protetto e non può essere eliminato.", true);
  }

  const denyReason = await denyReasonForGroupModification(context.env.DB, context.guildId, context.actorUserId, group);
  if (denyReason) {
    return interactionMessage(denyReason, true);
  }

  await deleteServerGroup(context.env.DB, group.id);
  await audit(context, "servergroup.delete", null, { group: group.name });
  return interactionMessage(`Server Group "${group.name}" eliminato.`, true);
}

async function groupBindRole(context: CommandContext, name: string, roleId: string): Promise<Response> {
  if (!(await actorHasBoolean(context, PermissionKeys.DISCORD_ROLE_BIND))) {
    return interactionMessage(`Permesso negato: manca \`${PermissionKeys.DISCORD_ROLE_BIND}\`.`, true);
  }

  const group = await mustGetGroup(context, name);
  const denyReason = await denyReasonForGroupModification(context.env.DB, context.guildId, context.actorUserId, group);
  if (denyReason) {
    return interactionMessage(denyReason, true);
  }

  await bindServerGroupRole(context.env.DB, group.id, roleId);
  await audit(context, "servergroup.bind_role", null, { group: group.name, roleId });
  return interactionMessage(`Server Group "${group.name}" collegato al ruolo <@&${roleId}>.`, true);
}

async function groupSetPermission(
  context: CommandContext,
  groupName: string,
  key: string,
  rawValue: string,
  grantValue: number,
  negated: boolean,
  skip: boolean
): Promise<Response> {
  const group = await mustGetGroup(context, groupName);

  const modifyDenyReason = await denyReasonForGroupModification(context.env.DB, context.guildId, context.actorUserId, group);
  if (modifyDenyReason) {
    return interactionMessage(modifyDenyReason, true);
  }

  const existingPermission = await getServerGroupPermission(context.env.DB, group.id, key);
  const permissionDenyReason = await denyReasonForPermissionWrite(
    context.env.DB,
    context.guildId,
    context.actorUserId,
    existingPermission,
    grantValue
  );
  if (permissionDenyReason) {
    return interactionMessage(permissionDenyReason, true);
  }

  const input = await parsePermissionInput(context.env.DB, key, rawValue, grantValue, negated, skip);
  await setServerGroupPermission(context.env.DB, group.id, input);
  await audit(context, "servergroup.set_perm", null, { group: group.name, permission: input });
  return interactionMessage(`Permesso \`${key}\` aggiornato su "${group.name}".`, true);
}

async function groupAddMember(context: CommandContext, userId: string, groupName: string): Promise<Response> {
  const group = await mustGetGroup(context, groupName);
  const denyReason = await denyReasonForGroupMembershipChange(context.env.DB, context.guildId, context.actorUserId, group, "add");
  if (denyReason) {
    return interactionMessage(denyReason, true);
  }

  await addServerGroupMember(context.env.DB, context.guildId, userId, group.id, context.actorUserId);
  let roleWarning = "";
  if (group.role_id) {
    try {
      await addDiscordRole(context.env, context.guildId, userId, group.role_id, `TS3-like Server Group add: ${group.name}`);
    } catch (error) {
      roleWarning = `\nAttenzione: gruppo salvato nel database, ma Discord non ha applicato il ruolo. ${shortError(error)}`;
    }
  }

  await audit(context, "servergroup.add_member", userId, { group: group.name, roleId: group.role_id });
  return interactionMessage(`<@${userId}> aggiunto a "${group.name}".${roleWarning}`, true);
}

async function groupRemoveMember(context: CommandContext, userId: string, groupName: string): Promise<Response> {
  const group = await mustGetGroup(context, groupName);
  const denyReason = await denyReasonForGroupMembershipChange(context.env.DB, context.guildId, context.actorUserId, group, "remove");
  if (denyReason) {
    return interactionMessage(denyReason, true);
  }

  await removeServerGroupMember(context.env.DB, context.guildId, userId, group.id);
  let roleWarning = "";
  if (group.role_id && !(await hasOtherGroupWithRole(context.env.DB, context.guildId, userId, group.role_id, group.id))) {
    try {
      await removeDiscordRole(context.env, context.guildId, userId, group.role_id, `TS3-like Server Group remove: ${group.name}`);
    } catch (error) {
      roleWarning = `\nAttenzione: gruppo rimosso dal database, ma Discord non ha rimosso il ruolo. ${shortError(error)}`;
    }
  }

  await audit(context, "servergroup.remove_member", userId, { group: group.name, roleId: group.role_id });
  return interactionMessage(`<@${userId}> rimosso da "${group.name}".${roleWarning}`, true);
}

async function handleClientPerm(context: CommandContext): Promise<Response> {
  const { subcommand, options } = subcommandOf(context.interaction);

  switch (subcommand) {
    case "set":
      return await clientPermSet(
        context,
        requireString(options, "user"),
        requireString(options, "key"),
        requireString(options, "value"),
        optionalInteger(options, "grant") ?? 0,
        optionalBoolean(options, "negated") ?? false,
        optionalBoolean(options, "skip") ?? false
      );
    case "remove":
      return await clientPermRemove(context, requireString(options, "user"), requireString(options, "key"));
    case "list":
      return await clientPermList(context, requireString(options, "user"));
    default:
      return interactionMessage("Subcomando clientperm non riconosciuto.", true);
  }
}

async function clientPermSet(
  context: CommandContext,
  userId: string,
  key: string,
  rawValue: string,
  grantValue: number,
  negated: boolean,
  skip: boolean
): Promise<Response> {
  const existing = await getClientPermission(context.env.DB, context.guildId, userId, key);
  const denyReason = await denyReasonForPermissionWrite(
    context.env.DB,
    context.guildId,
    context.actorUserId,
    existing,
    grantValue
  );
  if (denyReason) {
    return interactionMessage(denyReason, true);
  }

  const input = await parsePermissionInput(context.env.DB, key, rawValue, grantValue, negated, skip);
  await setClientPermission(context.env.DB, context.guildId, userId, input);
  await audit(context, "clientperm.set", userId, { permission: input });
  return interactionMessage(`Permesso diretto \`${key}\` impostato su <@${userId}>.`, true);
}

async function clientPermRemove(context: CommandContext, userId: string, key: string): Promise<Response> {
  const existing = await getClientPermission(context.env.DB, context.guildId, userId, key);
  const denyReason = await denyReasonForPermissionWrite(
    context.env.DB,
    context.guildId,
    context.actorUserId,
    existing,
    existing?.grant_value ?? 0
  );
  if (denyReason) {
    return interactionMessage(denyReason, true);
  }

  await removeClientPermission(context.env.DB, context.guildId, userId, key);
  await audit(context, "clientperm.remove", userId, { key });
  return interactionMessage(`Permesso diretto \`${key}\` rimosso da <@${userId}>.`, true);
}

async function clientPermList(context: CommandContext, userId: string): Promise<Response> {
  const permissions = await getClientPermissions(context.env.DB, context.guildId, userId);
  if (permissions.length === 0) {
    return interactionMessage(`<@${userId}> non ha permessi diretti.`, true);
  }

  const lines = permissions.map((permission) => {
    const value = permission.value_type === "boolean" ? Boolean(permission.bool_value) : permission.int_value ?? 0;
    return `\`${permission.permission_key}\` = \`${value}\` grant=${permission.grant_value}`;
  });

  return interactionMessage(truncate(lines.join("\n"), 1900), true);
}

async function handlePerm(context: CommandContext): Promise<Response> {
  const { subcommand, options } = subcommandOf(context.interaction);
  if (subcommand !== "check") {
    return interactionMessage("Subcomando perm non riconosciuto.", true);
  }

  const userId = requireString(options, "user");
  const key = requireString(options, "key");
  const permissions = await getEffectivePermissions(context.env.DB, context.guildId, userId);
  return interactionMessage(formatEffectivePermission(permissions.get(key), key), true);
}

async function handleSync(context: CommandContext): Promise<Response> {
  const { subcommand, options } = subcommandOf(context.interaction);
  if (subcommand !== "user") {
    return interactionMessage("Subcomando sync non riconosciuto.", true);
  }

  if (!(await actorHasBoolean(context, PermissionKeys.DISCORD_ROLE_SYNC))) {
    return interactionMessage(`Permesso negato: manca \`${PermissionKeys.DISCORD_ROLE_SYNC}\`.`, true);
  }

  const userId = requireString(options, "user");
  const groups = await getUserServerGroups(context.env.DB, context.guildId, userId);
  const roleIds = groups.map((group) => group.role_id).filter((roleId): roleId is string => Boolean(roleId));
  let applied = 0;
  let failed = 0;

  for (const roleId of roleIds) {
    try {
      await addDiscordRole(context.env, context.guildId, userId, roleId, "TS3-like sync");
      applied += 1;
    } catch {
      failed += 1;
    }
  }

  await audit(context, "sync.user", userId, { roleIds });
  return interactionMessage(`Sync completato per <@${userId}>. Ruoli applicati: ${applied}. Falliti: ${failed}.`, true);
}

async function handleAudit(context: CommandContext): Promise<Response> {
  const { subcommand, options } = subcommandOf(context.interaction);
  if (subcommand !== "set-channel") {
    return interactionMessage("Subcomando audit non riconosciuto.", true);
  }

  if (!(await actorHasBoolean(context, PermissionKeys.AUDIT_MANAGE)) && !hasDiscordAdminLike(context.interaction)) {
    return interactionMessage(`Permesso negato: manca \`${PermissionKeys.AUDIT_MANAGE}\`.`, true);
  }

  const channelId = requireString(options, "channel");
  await setAuditChannel(context.env.DB, context.guildId, channelId);
  await audit(context, "audit.set_channel", null, { channelId });
  return interactionMessage(`Canale audit impostato su <#${channelId}>.`, true);
}

async function handleBackup(context: CommandContext): Promise<Response> {
  const { subcommand } = subcommandOf(context.interaction);
  if (subcommand !== "export") {
    return interactionMessage("Subcomando backup non riconosciuto.", true);
  }

  if (!(await actorHasBoolean(context, PermissionKeys.BACKUP_EXPORT))) {
    return interactionMessage(`Permesso negato: manca \`${PermissionKeys.BACKUP_EXPORT}\`.`, true);
  }

  const backup = await exportGuildConfig(context.env.DB, context.guildId);
  const jsonBackup = JSON.stringify(backup, null, 2);
  if (jsonBackup.length > 1800) {
    return interactionMessage("Backup generato, ma troppo grande per un messaggio Discord. Usa D1 export o aggiungi upload file nella prossima fase.", true);
  }

  await audit(context, "backup.export", null, {});
  return interactionMessage(`\`\`\`json\n${jsonBackup}\n\`\`\``, true);
}

async function setDefaultNeededPowers(db: D1Database, serverGroupId: number, power: number): Promise<void> {
  const permissions: PermissionInput[] = [
    {
      key: PermissionKeys.GROUP_NEEDED_MODIFY_POWER,
      type: "power",
      intValue: power,
      boolValue: null,
      grantValue: power,
      negated: false,
      skip: false
    },
    {
      key: PermissionKeys.GROUP_NEEDED_MEMBER_ADD_POWER,
      type: "power",
      intValue: power,
      boolValue: null,
      grantValue: power,
      negated: false,
      skip: false
    },
    {
      key: PermissionKeys.GROUP_NEEDED_MEMBER_REMOVE_POWER,
      type: "power",
      intValue: power,
      boolValue: null,
      grantValue: power,
      negated: false,
      skip: false
    }
  ];

  for (const permission of permissions) {
    await setServerGroupPermission(db, serverGroupId, permission);
  }
}

async function actorHasBoolean(context: CommandContext, key: string): Promise<boolean> {
  const permissions = await getEffectivePermissions(context.env.DB, context.guildId, context.actorUserId);
  return hasBooleanPermission(permissions, key);
}

async function mustGetGroup(context: CommandContext, name: string) {
  const group = await getServerGroupByName(context.env.DB, context.guildId, name);
  if (!group) {
    throw new Error(`Server Group non trovato: ${name}`);
  }
  return group;
}

async function audit(
  context: CommandContext,
  action: string,
  targetUserId: string | null,
  details: unknown
): Promise<void> {
  await writeAudit(context.env.DB, context.guildId, context.actorUserId, action, targetUserId, details);

  const auditChannel = await getAuditChannel(context.env.DB, context.guildId);
  if (auditChannel) {
    try {
      await sendAuditMessage(
        context.env,
        auditChannel,
        `TS3Bot audit: \`${action}\` by <@${context.actorUserId}>${targetUserId ? ` target <@${targetUserId}>` : ""}`
      );
    } catch {
      // The database audit log is the source of truth; Discord message logging is best-effort.
    }
  }
}

function subcommandOf(interaction: DiscordInteraction): { subcommand: string | undefined; options: DiscordOption[] } {
  const option = interaction.data?.options?.[0];
  return {
    subcommand: option?.name,
    options: option?.options ?? []
  };
}

function requireString(options: DiscordOption[], name: string): string {
  const value = options.find((option) => option.name === name)?.value;
  if (typeof value !== "string") {
    throw new Error(`Opzione mancante: ${name}`);
  }
  return value;
}

function optionalInteger(options: DiscordOption[], name: string): number | null {
  const value = options.find((option) => option.name === name)?.value;
  return typeof value === "number" ? value : null;
}

function optionalBoolean(options: DiscordOption[], name: string): boolean | null {
  const value = options.find((option) => option.name === name)?.value;
  return typeof value === "boolean" ? value : null;
}

function hasDiscordAdminLike(interaction: DiscordInteraction): boolean {
  const permissions = BigInt(interaction.member?.permissions ?? "0");
  return Boolean(
    permissions & DISCORD_PERMISSION_ADMINISTRATOR ||
    permissions & DISCORD_PERMISSION_MANAGE_GUILD
  );
}

function validateGroupName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 64) {
    throw new Error("Il nome gruppo deve avere tra 2 e 64 caratteri.");
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 20)}\n... output troncato`;
}

function shortError(error: unknown): string {
  if (error instanceof Error) {
    return truncate(error.message, 240);
  }
  return "Errore sconosciuto.";
}

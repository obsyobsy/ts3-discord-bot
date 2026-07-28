import type { PermissionDefinition, PermissionInput } from "./types";

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2
} as const;

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4
} as const;

export const MessageFlags = {
  EPHEMERAL: 1 << 6
} as const;

export const PermissionKeys = {
  SERVERGROUP_CREATE: "b_virtualserver_servergroup_create",
  SERVERGROUP_DELETE: "b_virtualserver_servergroup_delete",
  CHANNELGROUP_CREATE: "b_virtualserver_channelgroup_create",
  CHANNELGROUP_DELETE: "b_virtualserver_channelgroup_delete",
  GROUP_MODIFY_POWER: "i_group_modify_power",
  GROUP_NEEDED_MODIFY_POWER: "i_group_needed_modify_power",
  GROUP_MEMBER_ADD_POWER: "i_group_member_add_power",
  GROUP_NEEDED_MEMBER_ADD_POWER: "i_group_needed_member_add_power",
  GROUP_MEMBER_REMOVE_POWER: "i_group_member_remove_power",
  GROUP_NEEDED_MEMBER_REMOVE_POWER: "i_group_needed_member_remove_power",
  PERMISSION_MODIFY_POWER: "i_permission_modify_power",
  PERMISSION_MODIFY_POWER_IGNORE: "b_permission_modify_power_ignore",
  AUDIT_VIEW: "b_auditlog_view",
  AUDIT_MANAGE: "b_auditlog_manage",
  BACKUP_EXPORT: "b_backup_export",
  BACKUP_IMPORT: "b_backup_import",
  DISCORD_ROLE_BIND: "b_discord_role_bind",
  DISCORD_ROLE_SYNC: "b_discord_role_sync"
} as const;

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: PermissionKeys.SERVERGROUP_CREATE, type: "boolean", description: "Crea Server Group" },
  { key: PermissionKeys.SERVERGROUP_DELETE, type: "boolean", description: "Elimina Server Group" },
  { key: PermissionKeys.CHANNELGROUP_CREATE, type: "boolean", description: "Crea Channel Group" },
  { key: PermissionKeys.CHANNELGROUP_DELETE, type: "boolean", description: "Elimina Channel Group" },
  { key: PermissionKeys.GROUP_MODIFY_POWER, type: "power", description: "Potere modifica gruppi" },
  { key: PermissionKeys.GROUP_NEEDED_MODIFY_POWER, type: "power", description: "Potere richiesto per modificare il gruppo" },
  { key: PermissionKeys.GROUP_MEMBER_ADD_POWER, type: "power", description: "Potere aggiunta membri ai gruppi" },
  { key: PermissionKeys.GROUP_NEEDED_MEMBER_ADD_POWER, type: "power", description: "Potere richiesto per aggiungere membri al gruppo" },
  { key: PermissionKeys.GROUP_MEMBER_REMOVE_POWER, type: "power", description: "Potere rimozione membri dai gruppi" },
  { key: PermissionKeys.GROUP_NEEDED_MEMBER_REMOVE_POWER, type: "power", description: "Potere richiesto per rimuovere membri dal gruppo" },
  { key: PermissionKeys.PERMISSION_MODIFY_POWER, type: "power", description: "Potere modifica permessi" },
  { key: PermissionKeys.PERMISSION_MODIFY_POWER_IGNORE, type: "boolean", description: "Ignora grant value sui permessi" },
  { key: PermissionKeys.AUDIT_VIEW, type: "boolean", description: "Visualizza audit log" },
  { key: PermissionKeys.AUDIT_MANAGE, type: "boolean", description: "Configura audit log" },
  { key: PermissionKeys.BACKUP_EXPORT, type: "boolean", description: "Esporta configurazione" },
  { key: PermissionKeys.BACKUP_IMPORT, type: "boolean", description: "Importa configurazione" },
  { key: PermissionKeys.DISCORD_ROLE_BIND, type: "boolean", description: "Collega gruppi a ruoli Discord" },
  { key: PermissionKeys.DISCORD_ROLE_SYNC, type: "boolean", description: "Sincronizza ruoli Discord" }
];

function bool(key: string, value: boolean, grantValue = 0): PermissionInput {
  return { key, type: "boolean", boolValue: value, intValue: null, grantValue, negated: false, skip: false };
}

function power(key: string, value: number, grantValue = value): PermissionInput {
  return { key, type: "power", intValue: value, boolValue: null, grantValue, negated: false, skip: false };
}

export const SEED_SERVER_GROUPS = [
  {
    name: "Root",
    sortOrder: 100,
    protected: true,
    permissions: [
      bool(PermissionKeys.SERVERGROUP_CREATE, true, 100),
      bool(PermissionKeys.SERVERGROUP_DELETE, true, 100),
      bool(PermissionKeys.CHANNELGROUP_CREATE, true, 100),
      bool(PermissionKeys.CHANNELGROUP_DELETE, true, 100),
      power(PermissionKeys.GROUP_MODIFY_POWER, 100, 100),
      power(PermissionKeys.GROUP_NEEDED_MODIFY_POWER, 100, 100),
      power(PermissionKeys.GROUP_MEMBER_ADD_POWER, 100, 100),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_ADD_POWER, 100, 100),
      power(PermissionKeys.GROUP_MEMBER_REMOVE_POWER, 100, 100),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_REMOVE_POWER, 100, 100),
      power(PermissionKeys.PERMISSION_MODIFY_POWER, 100, 100),
      bool(PermissionKeys.PERMISSION_MODIFY_POWER_IGNORE, true, 100),
      bool(PermissionKeys.AUDIT_VIEW, true, 100),
      bool(PermissionKeys.AUDIT_MANAGE, true, 100),
      bool(PermissionKeys.BACKUP_EXPORT, true, 100),
      bool(PermissionKeys.BACKUP_IMPORT, true, 100),
      bool(PermissionKeys.DISCORD_ROLE_BIND, true, 100),
      bool(PermissionKeys.DISCORD_ROLE_SYNC, true, 100)
    ]
  },
  {
    name: "Server Admin",
    sortOrder: 90,
    protected: true,
    permissions: [
      bool(PermissionKeys.SERVERGROUP_CREATE, true, 90),
      bool(PermissionKeys.SERVERGROUP_DELETE, true, 90),
      power(PermissionKeys.GROUP_MODIFY_POWER, 90, 90),
      power(PermissionKeys.GROUP_NEEDED_MODIFY_POWER, 95, 95),
      power(PermissionKeys.GROUP_MEMBER_ADD_POWER, 90, 90),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_ADD_POWER, 95, 95),
      power(PermissionKeys.GROUP_MEMBER_REMOVE_POWER, 90, 90),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_REMOVE_POWER, 95, 95),
      power(PermissionKeys.PERMISSION_MODIFY_POWER, 90, 90),
      bool(PermissionKeys.AUDIT_VIEW, true, 90),
      bool(PermissionKeys.AUDIT_MANAGE, true, 90),
      bool(PermissionKeys.BACKUP_EXPORT, true, 90),
      bool(PermissionKeys.DISCORD_ROLE_BIND, true, 90),
      bool(PermissionKeys.DISCORD_ROLE_SYNC, true, 90)
    ]
  },
  {
    name: "Admin",
    sortOrder: 80,
    protected: false,
    permissions: [
      power(PermissionKeys.GROUP_MODIFY_POWER, 75, 75),
      power(PermissionKeys.GROUP_NEEDED_MODIFY_POWER, 85, 85),
      power(PermissionKeys.GROUP_MEMBER_ADD_POWER, 80, 80),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_ADD_POWER, 85, 85),
      power(PermissionKeys.GROUP_MEMBER_REMOVE_POWER, 80, 80),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_REMOVE_POWER, 85, 85),
      power(PermissionKeys.PERMISSION_MODIFY_POWER, 70, 70),
      bool(PermissionKeys.AUDIT_VIEW, true, 70),
      bool(PermissionKeys.BACKUP_EXPORT, true, 70),
      bool(PermissionKeys.DISCORD_ROLE_BIND, true, 70),
      bool(PermissionKeys.DISCORD_ROLE_SYNC, true, 70)
    ]
  },
  {
    name: "Moderator",
    sortOrder: 60,
    protected: false,
    permissions: [
      power(PermissionKeys.GROUP_MODIFY_POWER, 30, 30),
      power(PermissionKeys.GROUP_NEEDED_MODIFY_POWER, 65, 65),
      power(PermissionKeys.GROUP_MEMBER_ADD_POWER, 60, 60),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_ADD_POWER, 65, 65),
      power(PermissionKeys.GROUP_MEMBER_REMOVE_POWER, 60, 60),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_REMOVE_POWER, 65, 65),
      power(PermissionKeys.PERMISSION_MODIFY_POWER, 20, 20),
      bool(PermissionKeys.DISCORD_ROLE_SYNC, true, 20)
    ]
  },
  {
    name: "Helper",
    sortOrder: 35,
    protected: false,
    permissions: [
      power(PermissionKeys.GROUP_MODIFY_POWER, 0, 0),
      power(PermissionKeys.GROUP_NEEDED_MODIFY_POWER, 45, 45),
      power(PermissionKeys.GROUP_MEMBER_ADD_POWER, 35, 35),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_ADD_POWER, 45, 45),
      power(PermissionKeys.GROUP_MEMBER_REMOVE_POWER, 35, 35),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_REMOVE_POWER, 45, 45),
      power(PermissionKeys.PERMISSION_MODIFY_POWER, 0, 0)
    ]
  },
  {
    name: "Member",
    sortOrder: 10,
    protected: false,
    permissions: [
      power(PermissionKeys.GROUP_NEEDED_MODIFY_POWER, 10, 10),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_ADD_POWER, 10, 10),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_REMOVE_POWER, 10, 10)
    ]
  },
  {
    name: "Guest",
    sortOrder: 0,
    protected: false,
    permissions: [
      power(PermissionKeys.GROUP_NEEDED_MODIFY_POWER, 0, 0),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_ADD_POWER, 0, 0),
      power(PermissionKeys.GROUP_NEEDED_MEMBER_REMOVE_POWER, 0, 0)
    ]
  }
] as const;

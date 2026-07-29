import {
  ensurePermissionDefinitions,
  getServerGroupById,
  getServerGroupPermission,
  getServerGroupPermissions,
  listPermissionDefinitions,
  listServerGroups,
  removeServerGroupPermission,
  setServerGroupPermission,
  writeAudit
} from "./db";
import { json } from "./discord";
import { parsePermissionInput } from "./permissions";
import type { Env } from "./types";

interface DashboardPermissionPayload {
  guildId?: string;
  groupId?: number;
  key?: string;
  value?: string;
  grantValue?: number;
  negated?: boolean;
  skip?: boolean;
}

export async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/dashboard") {
    return dashboardPage();
  }

  if (!url.pathname.startsWith("/api/dashboard")) {
    return new Response("Not found", { status: 404 });
  }

  if (!isDashboardAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (request.method === "GET" && url.pathname === "/api/dashboard/state") {
      return await dashboardState(url, env);
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard/group-permissions") {
      return await dashboardGroupPermissions(url, env);
    }

    if (request.method === "PUT" && url.pathname === "/api/dashboard/group-permissions") {
      return await dashboardSetGroupPermission(request, env);
    }

    if (request.method === "DELETE" && url.pathname === "/api/dashboard/group-permissions") {
      return await dashboardRemoveGroupPermission(request, env);
    }

    return json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown dashboard error";
    return json({ error: message }, { status: 400 });
  }
}

function isDashboardAuthorized(request: Request, env: Env): boolean {
  if (!env.DASHBOARD_ADMIN_TOKEN) {
    return false;
  }

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${env.DASHBOARD_ADMIN_TOKEN}`) {
    return true;
  }

  return request.headers.get("x-dashboard-token") === env.DASHBOARD_ADMIN_TOKEN;
}

async function dashboardState(url: URL, env: Env): Promise<Response> {
  const guildId = requiredSearchParam(url, "guildId");
  await ensurePermissionDefinitions(env.DB);

  const [groups, definitions] = await Promise.all([
    listServerGroups(env.DB, guildId),
    listPermissionDefinitions(env.DB)
  ]);

  return json({ guildId, groups, definitions });
}

async function dashboardGroupPermissions(url: URL, env: Env): Promise<Response> {
  const guildId = requiredSearchParam(url, "guildId");
  const groupId = requiredNumberSearchParam(url, "groupId");
  const group = await mustGetGroup(env, guildId, groupId);
  const permissions = await getServerGroupPermissions(env.DB, group.id);

  return json({ group, permissions });
}

async function dashboardSetGroupPermission(request: Request, env: Env): Promise<Response> {
  const payload = await readPermissionPayload(request);
  const group = await mustGetGroup(env, payload.guildId, payload.groupId);
  const existing = await getServerGroupPermission(env.DB, group.id, payload.key);
  const grantValue = payload.grantValue ?? existing?.grant_value ?? 0;
  const permission = await parsePermissionInput(
    env.DB,
    payload.key,
    payload.value,
    grantValue,
    payload.negated ?? false,
    payload.skip ?? false
  );

  await setServerGroupPermission(env.DB, group.id, permission);
  await writeAudit(env.DB, payload.guildId, "dashboard", "dashboard.servergroup.set_perm", null, {
    group: group.name,
    permission
  });

  return json({ ok: true, group, permission });
}

async function dashboardRemoveGroupPermission(request: Request, env: Env): Promise<Response> {
  const payload = await readPermissionPayload(request);
  const group = await mustGetGroup(env, payload.guildId, payload.groupId);

  await removeServerGroupPermission(env.DB, group.id, payload.key);
  await writeAudit(env.DB, payload.guildId, "dashboard", "dashboard.servergroup.remove_perm", null, {
    group: group.name,
    key: payload.key
  });

  return json({ ok: true });
}

async function readPermissionPayload(request: Request): Promise<Required<DashboardPermissionPayload>> {
  const payload = await request.json<DashboardPermissionPayload>();
  if (!payload.guildId || !payload.groupId || !payload.key) {
    throw new Error("guildId, groupId and key are required.");
  }

  return {
    guildId: payload.guildId,
    groupId: payload.groupId,
    key: payload.key,
    value: payload.value ?? "0",
    grantValue: payload.grantValue ?? 0,
    negated: payload.negated ?? false,
    skip: payload.skip ?? false
  };
}

async function mustGetGroup(env: Env, guildId: string, groupId: number) {
  const group = await getServerGroupById(env.DB, guildId, groupId);
  if (!group) {
    throw new Error("Server Group not found.");
  }
  return group;
}

function requiredSearchParam(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function requiredNumberSearchParam(url: URL, name: string): number {
  const value = Number.parseInt(requiredSearchParam(url, name), 10);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number.`);
  }
  return value;
}

function dashboardPage(): Response {
  return new Response(DASHBOARD_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TS3 Discord Permissions</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --surface: #ffffff;
      --surface-2: #eef2f7;
      --line: #d8dee8;
      --text: #1f2937;
      --muted: #65758b;
      --accent: #2563eb;
      --accent-strong: #1d4ed8;
      --danger: #b42318;
      --ok: #047857;
      --shadow: 0 14px 36px rgba(15, 23, 42, 0.08);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.4;
    }

    header {
      border-bottom: 1px solid var(--line);
      background: var(--surface);
    }

    .topbar {
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(220px, 1fr) minmax(180px, 260px) minmax(180px, 260px) auto;
      align-items: end;
      max-width: 1280px;
      margin: 0 auto;
      padding: 16px;
    }

    h1 {
      margin: 0 0 2px;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .subtitle {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }

    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }

    input,
    select {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      color: var(--text);
      padding: 8px 10px;
      font: inherit;
    }

    input[type="checkbox"] {
      width: 18px;
      min-height: 18px;
      padding: 0;
    }

    button {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--surface);
      color: var(--text);
      padding: 8px 12px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
    }

    button.primary:hover {
      background: var(--accent-strong);
    }

    button.danger {
      border-color: #f3b4ae;
      color: var(--danger);
    }

    main {
      max-width: 1280px;
      margin: 0 auto;
      padding: 16px;
    }

    .layout {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }

    .panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .panel-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: var(--surface-2);
    }

    h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0;
    }

    .group-list {
      display: grid;
      padding: 8px;
      gap: 6px;
    }

    .group-button {
      display: grid;
      gap: 2px;
      width: 100%;
      border-color: transparent;
      background: transparent;
      text-align: left;
    }

    .group-button.active {
      border-color: #b7c7f4;
      background: #eef4ff;
    }

    .group-meta {
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
    }

    .toolbar {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) 150px 120px auto;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: #fff;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 880px;
    }

    th,
    td {
      border-bottom: 1px solid var(--line);
      padding: 9px 10px;
      text-align: left;
      vertical-align: middle;
    }

    th {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      background: #f8fafc;
    }

    td.key {
      width: 34%;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    td.description {
      color: var(--muted);
      font-size: 12px;
      min-width: 170px;
    }

    .value-input {
      min-width: 110px;
    }

    .grant-input {
      max-width: 86px;
    }

    .flags {
      display: flex;
      gap: 10px;
      align-items: center;
      white-space: nowrap;
    }

    .flags label {
      display: inline-flex;
      grid-template-columns: none;
      align-items: center;
      gap: 5px;
      color: var(--text);
      font-size: 12px;
      font-weight: 650;
    }

    .row-actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }

    .status {
      min-height: 24px;
      padding: 10px 14px;
      color: var(--muted);
      font-size: 13px;
      border-top: 1px solid var(--line);
      background: #fff;
    }

    .status.ok {
      color: var(--ok);
    }

    .status.error {
      color: var(--danger);
    }

    .empty {
      padding: 18px 14px;
      color: var(--muted);
    }

    @media (max-width: 900px) {
      .topbar,
      .layout,
      .toolbar {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="topbar">
      <div>
        <h1>TS3 Discord Permissions</h1>
        <p class="subtitle">Server Group permissions dashboard</p>
      </div>
      <label>
        Guild ID
        <input id="guildId" autocomplete="off" placeholder="Discord server ID">
      </label>
      <label>
        Admin token
        <input id="token" type="password" autocomplete="current-password" placeholder="DASHBOARD_ADMIN_TOKEN">
      </label>
      <button id="loadBtn" class="primary">Carica</button>
    </div>
  </header>

  <main>
    <div class="layout">
      <section class="panel">
        <div class="panel-head">
          <h2>Server Group</h2>
        </div>
        <div id="groups" class="group-list">
          <div class="empty">Inserisci Guild ID e token.</div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2 id="selectedTitle">Permessi</h2>
        </div>

        <div class="toolbar">
          <label>
            Cerca
            <input id="filter" placeholder="permission key">
          </label>
          <label>
            Tipo
            <select id="typeFilter">
              <option value="">Tutti</option>
              <option value="boolean">Boolean</option>
              <option value="integer">Integer</option>
              <option value="power">Power</option>
            </select>
          </label>
          <label>
            Vista
            <select id="setFilter">
              <option value="">Tutti</option>
              <option value="set">Impostati</option>
              <option value="unset">Non impostati</option>
            </select>
          </label>
          <button id="reloadBtn">Aggiorna</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Permesso</th>
                <th>Descrizione</th>
                <th>Valore</th>
                <th>Grant</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="permissionRows">
              <tr><td colspan="6" class="empty">Seleziona un gruppo.</td></tr>
            </tbody>
          </table>
        </div>
        <div id="status" class="status">Pronto.</div>
      </section>
    </div>
  </main>

  <script>
    const state = {
      guildId: localStorage.getItem("ts3dash.guildId") || "",
      token: localStorage.getItem("ts3dash.token") || "",
      groups: [],
      definitions: [],
      selectedGroup: null,
      permissions: new Map()
    };

    const el = {
      guildId: document.getElementById("guildId"),
      token: document.getElementById("token"),
      loadBtn: document.getElementById("loadBtn"),
      reloadBtn: document.getElementById("reloadBtn"),
      groups: document.getElementById("groups"),
      selectedTitle: document.getElementById("selectedTitle"),
      permissionRows: document.getElementById("permissionRows"),
      filter: document.getElementById("filter"),
      typeFilter: document.getElementById("typeFilter"),
      setFilter: document.getElementById("setFilter"),
      status: document.getElementById("status")
    };

    el.guildId.value = state.guildId;
    el.token.value = state.token;

    el.loadBtn.addEventListener("click", loadState);
    el.reloadBtn.addEventListener("click", reloadSelectedGroup);
    el.filter.addEventListener("input", renderPermissions);
    el.typeFilter.addEventListener("change", renderPermissions);
    el.setFilter.addEventListener("change", renderPermissions);

    async function loadState() {
      state.guildId = el.guildId.value.trim();
      state.token = el.token.value.trim();
      localStorage.setItem("ts3dash.guildId", state.guildId);
      localStorage.setItem("ts3dash.token", state.token);

      if (!state.guildId || !state.token) {
        setStatus("Guild ID e token sono obbligatori.", "error");
        return;
      }

      setStatus("Caricamento...");
      const data = await apiGet("/api/dashboard/state?guildId=" + encodeURIComponent(state.guildId));
      state.groups = data.groups;
      state.definitions = data.definitions;
      renderGroups();

      if (state.groups.length > 0) {
        await selectGroup(state.groups[0].id);
      } else {
        setStatus("Nessun Server Group trovato. Esegui /setup seed su Discord.", "error");
      }
    }

    function renderGroups() {
      el.groups.textContent = "";

      if (state.groups.length === 0) {
        el.groups.innerHTML = '<div class="empty">Nessun gruppo.</div>';
        return;
      }

      for (const group of state.groups) {
        const button = document.createElement("button");
        button.className = "group-button" + (state.selectedGroup?.id === group.id ? " active" : "");
        button.type = "button";
        button.addEventListener("click", () => selectGroup(group.id));
        button.innerHTML = '<strong></strong><span class="group-meta"></span>';
        button.querySelector("strong").textContent = group.name;
        button.querySelector(".group-meta").textContent =
          "sort=" + group.sort_order + " role=" + (group.role_id || "none") + (group.is_protected ? " protected" : "");
        el.groups.appendChild(button);
      }
    }

    async function selectGroup(groupId) {
      const data = await apiGet(
        "/api/dashboard/group-permissions?guildId=" +
          encodeURIComponent(state.guildId) +
          "&groupId=" +
          encodeURIComponent(groupId)
      );
      state.selectedGroup = data.group;
      state.permissions = new Map(data.permissions.map((permission) => [permission.permission_key, permission]));
      el.selectedTitle.textContent = "Permessi: " + state.selectedGroup.name;
      renderGroups();
      renderPermissions();
      setStatus("Gruppo caricato.", "ok");
    }

    async function reloadSelectedGroup() {
      if (!state.selectedGroup) {
        setStatus("Seleziona un gruppo.", "error");
        return;
      }
      await selectGroup(state.selectedGroup.id);
    }

    function renderPermissions() {
      if (!state.selectedGroup) {
        el.permissionRows.innerHTML = '<tr><td colspan="6" class="empty">Seleziona un gruppo.</td></tr>';
        return;
      }

      const filter = el.filter.value.trim().toLowerCase();
      const typeFilter = el.typeFilter.value;
      const setFilter = el.setFilter.value;
      const rows = state.definitions
        .filter((definition) => !filter || definition.permission_key.toLowerCase().includes(filter))
        .filter((definition) => !typeFilter || definition.value_type === typeFilter)
        .filter((definition) => {
          const isSet = state.permissions.has(definition.permission_key);
          return !setFilter || (setFilter === "set" ? isSet : !isSet);
        });

      el.permissionRows.textContent = "";

      if (rows.length === 0) {
        el.permissionRows.innerHTML = '<tr><td colspan="6" class="empty">Nessun permesso corrisponde ai filtri.</td></tr>';
        return;
      }

      for (const definition of rows) {
        el.permissionRows.appendChild(permissionRow(definition));
      }
    }

    function permissionRow(definition) {
      const existing = state.permissions.get(definition.permission_key);
      const value = existing
        ? existing.value_type === "boolean"
          ? String(Boolean(existing.bool_value))
          : String(existing.int_value ?? 0)
        : definition.value_type === "boolean"
          ? "false"
          : "0";

      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="key"></td>' +
        '<td class="description"></td>' +
        '<td></td>' +
        '<td></td>' +
        '<td></td>' +
        '<td class="row-actions"></td>';

      tr.children[0].textContent = definition.permission_key;
      tr.children[1].textContent = definition.description || definition.value_type;

      const valueInput = document.createElement(definition.value_type === "boolean" ? "select" : "input");
      valueInput.className = "value-input";
      valueInput.dataset.field = "value";
      if (definition.value_type === "boolean") {
        valueInput.innerHTML = '<option value="true">true</option><option value="false">false</option>';
      } else {
        valueInput.type = "number";
        valueInput.step = "1";
      }
      valueInput.value = value;
      tr.children[2].appendChild(valueInput);

      const grantInput = document.createElement("input");
      grantInput.className = "grant-input";
      grantInput.dataset.field = "grant";
      grantInput.type = "number";
      grantInput.step = "1";
      grantInput.value = String(existing?.grant_value ?? 0);
      tr.children[3].appendChild(grantInput);

      const flags = document.createElement("div");
      flags.className = "flags";
      flags.innerHTML =
        '<label><input type="checkbox" data-field="negated"> negated</label>' +
        '<label><input type="checkbox" data-field="skip"> skip</label>';
      flags.querySelector('[data-field="negated"]').checked = Boolean(existing?.negated);
      flags.querySelector('[data-field="skip"]').checked = Boolean(existing?.skip);
      tr.children[4].appendChild(flags);

      const save = document.createElement("button");
      save.className = "primary";
      save.type = "button";
      save.textContent = "Salva";
      save.addEventListener("click", () => savePermission(definition, tr));

      const reset = document.createElement("button");
      reset.className = "danger";
      reset.type = "button";
      reset.textContent = "Rimuovi";
      reset.disabled = !existing;
      reset.addEventListener("click", () => removePermission(definition));

      tr.children[5].append(save, reset);
      return tr;
    }

    async function savePermission(definition, row) {
      if (!state.selectedGroup) {
        return;
      }

      const payload = {
        guildId: state.guildId,
        groupId: state.selectedGroup.id,
        key: definition.permission_key,
        value: row.querySelector('[data-field="value"]').value,
        grantValue: Number.parseInt(row.querySelector('[data-field="grant"]').value || "0", 10),
        negated: row.querySelector('[data-field="negated"]').checked,
        skip: row.querySelector('[data-field="skip"]').checked
      };

      await apiWrite("PUT", "/api/dashboard/group-permissions", payload);
      setStatus("Permesso salvato: " + definition.permission_key, "ok");
      await reloadSelectedGroup();
    }

    async function removePermission(definition) {
      if (!state.selectedGroup) {
        return;
      }

      await apiWrite("DELETE", "/api/dashboard/group-permissions", {
        guildId: state.guildId,
        groupId: state.selectedGroup.id,
        key: definition.permission_key
      });
      setStatus("Permesso rimosso: " + definition.permission_key, "ok");
      await reloadSelectedGroup();
    }

    async function apiGet(path) {
      const response = await fetch(path, {
        headers: {
          authorization: "Bearer " + state.token
        }
      });
      return readJsonResponse(response);
    }

    async function apiWrite(method, path, body) {
      const response = await fetch(path, {
        method,
        headers: {
          authorization: "Bearer " + state.token,
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
      return readJsonResponse(response);
    }

    async function readJsonResponse(response) {
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.error || "Errore richiesta.", "error");
        throw new Error(data.error || "Request failed");
      }
      return data;
    }

    function setStatus(message, kind) {
      el.status.textContent = message;
      el.status.className = "status" + (kind ? " " + kind : "");
    }
  </script>
</body>
</html>`;

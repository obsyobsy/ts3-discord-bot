import { InteractionResponseType, MessageFlags } from "./constants";
import type { Env } from "./types";

const DISCORD_API = "https://discord.com/api/v10";

export function interactionMessage(content: string, ephemeral = true): Response {
  return json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: ephemeral ? MessageFlags.EPHEMERAL : undefined
    }
  });
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

export async function discordApi(env: Env, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bot ${env.DISCORD_TOKEN}`);
  headers.set("content-type", "application/json");

  const response = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord API ${response.status}: ${body}`);
  }

  return response;
}

export async function addDiscordRole(
  env: Env,
  guildId: string,
  userId: string,
  roleId: string,
  reason: string
): Promise<void> {
  await discordApi(env, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: "PUT",
    headers: {
      "x-audit-log-reason": encodeURIComponent(reason).slice(0, 512)
    }
  });
}

export async function removeDiscordRole(
  env: Env,
  guildId: string,
  userId: string,
  roleId: string,
  reason: string
): Promise<void> {
  await discordApi(env, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: "DELETE",
    headers: {
      "x-audit-log-reason": encodeURIComponent(reason).slice(0, 512)
    }
  });
}

export async function sendAuditMessage(
  env: Env,
  channelId: string | null,
  content: string
): Promise<void> {
  if (!channelId) {
    return;
  }

  await discordApi(env, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content })
  });
}

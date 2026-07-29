import { verifyDiscordRequest } from "./crypto";
import { handleDashboard } from "./dashboard";
import { interactionMessage } from "./discord";
import { handleInteraction } from "./handlers";
import type { DiscordInteraction, Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/dashboard" || url.pathname.startsWith("/api/dashboard")) {
      return await handleDashboard(request, env);
    }

    if (request.method === "GET") {
      return new Response("TS3-like Discord bot is online.");
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const verification = await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY);
    if (!verification.ok) {
      return new Response("Bad request signature", { status: 401 });
    }

    let interaction: DiscordInteraction;
    try {
      interaction = JSON.parse(verification.body) as DiscordInteraction;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    try {
      return await handleInteraction(interaction, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto";
      return interactionMessage(`Errore interno: ${message}`, true);
    }
  }
};

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const commands = JSON.parse(await fs.readFile(path.join(root, "commands.json"), "utf8"));

const mode = process.argv[2] ?? "guild";
const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token) {
  throw new Error("Missing DISCORD_TOKEN environment variable.");
}

if (!applicationId) {
  throw new Error("Missing DISCORD_APPLICATION_ID environment variable.");
}

if (mode === "guild" && !guildId) {
  throw new Error("Missing DISCORD_GUILD_ID environment variable for guild command registration.");
}

const endpoint = mode === "global"
  ? `https://discord.com/api/v10/applications/${applicationId}/commands`
  : `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`;

const response = await fetch(endpoint, {
  method: "PUT",
  headers: {
    authorization: `Bot ${token}`,
    "content-type": "application/json"
  },
  body: JSON.stringify(commands)
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Discord command registration failed: ${response.status} ${body}`);
}

const registered = await response.json();
console.log(`Registered ${registered.length} ${mode} command(s).`);

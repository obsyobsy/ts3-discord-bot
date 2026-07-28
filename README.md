# TS3-like Discord Bot

Bot Discord serverless che replica la logica dei Server Group di TeamSpeak 3 usando:

- Discord Slash Commands via HTTP Interactions
- Cloudflare Workers
- Cloudflare D1
- TypeScript

Il sistema non sostituisce i ruoli Discord: li usa come output. La fonte della verita e il database del bot.

## Funzioni incluse

- Server Group globali stile TS3
- `power`, `needed power`, `grant value`, `negated`, `skip`
- Membership dei gruppi salvata in D1
- Collegamento Server Group -> ruolo Discord
- Permessi diretti sul client
- Diagnostica permessi effettivi
- Audit log su database e canale Discord
- Export JSON base della configurazione

## Setup gratuito senza usare il PC come server

Il bot gira su Cloudflare Workers, non sul tuo computer. GitHub serve solo a conservare il codice e far partire deploy/automazioni.

### Flusso cloud consigliato

```text
GitHub repository -> GitHub Actions -> Cloudflare Workers + D1 -> Discord
```

Il PC non deve restare acceso.

### Secret da configurare su GitHub

Nel repository GitHub vai in:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

Aggiungi:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
DISCORD_TOKEN
DISCORD_APPLICATION_ID
DISCORD_GUILD_ID
```

### Secret da configurare su Cloudflare Worker

Nel dashboard Cloudflare del Worker aggiungi:

```text
DISCORD_PUBLIC_KEY
DISCORD_TOKEN
```

### GitHub Actions incluse

```text
Deploy Cloudflare Worker
Apply D1 Migrations
Register Discord Commands
```

Usale dalla tab **Actions** del repository.

## Setup gratuito da PC, opzionale

Prerequisito locale: Node.js 22 o superiore. Wrangler attuale richiede Node 22+.

### 1. Crea l'app Discord

1. Apri <https://discord.com/developers/applications>.
2. Crea una nuova application.
3. Vai in **Bot** e crea il bot.
4. Copia il **bot token**.
5. Vai in **General Information** e copia la **Public Key**.
6. Invita il bot nel server con scope:
   - `bot`
   - `applications.commands`
7. Permessi bot minimi:
   - `Manage Roles`
   - `Send Messages`
   - `View Channels`

Nota: il ruolo del bot deve stare sopra tutti i ruoli che dovra assegnare.

### 2. Installa dipendenze locali

```powershell
npm install
```

### 3. Crea il database D1

```powershell
npx wrangler login
npx wrangler d1 create ts3-discord-bot
```

Copia il `database_id` generato dentro `wrangler.toml`.

Poi applica la migrazione:

```powershell
npm run db:migrate:remote
```

Per test locale:

```powershell
npm run db:migrate:local
```

### 4. Configura i secret Cloudflare

```powershell
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_TOKEN
```

### 5. Deploy del Worker

```powershell
npm run deploy
```

Cloudflare restituira un URL tipo:

```text
https://ts3-discord-bot.<tuo-subdomain>.workers.dev
```

### 6. Imposta endpoint Discord

Nel Developer Portal Discord:

1. Vai in **General Information**.
2. Inserisci l'URL del Worker in **Interactions Endpoint URL**.
3. Salva.

Discord inviera un `PING`; il Worker rispondera automaticamente.

### 7. Registra i comandi slash

Per sviluppo, registra i comandi solo nel tuo server:

```powershell
$env:DISCORD_TOKEN="token_bot"
$env:DISCORD_APPLICATION_ID="application_id"
$env:DISCORD_GUILD_ID="server_id"
npm run register:guild
```

Per produzione globale:

```powershell
$env:DISCORD_TOKEN="token_bot"
$env:DISCORD_APPLICATION_ID="application_id"
npm run register:global
```

## Primo uso nel server

Esegui da Discord:

```text
/setup seed
```

Questo crea:

- Root
- Server Admin
- Admin
- Moderator
- Helper
- Member
- Guest

e assegna `Root` all'utente che esegue il setup.

Poi collega i gruppi ai ruoli Discord:

```text
/servergroup bind-role name:Admin role:@Admin
/servergroup bind-role name:Moderator role:@Moderator
/servergroup bind-role name:Helper role:@Helper
```

Assegna un gruppo:

```text
/servergroup add-member user:@Mario group:Moderator
```

Controlla un permesso:

```text
/perm check user:@Mario key:i_group_member_add_power
```

## Comandi principali

```text
/servergroup list
/servergroup info name:Admin
/servergroup create name:VIP sort_order:20
/servergroup delete name:VIP
/servergroup bind-role name:VIP role:@VIP
/servergroup set-perm group:VIP key:i_group_needed_member_add_power value:20 grant:20
/servergroup add-member user:@Mario group:VIP
/servergroup remove-member user:@Mario group:VIP

/clientperm set user:@Mario key:i_group_member_add_power value:70 grant:70
/clientperm list user:@Mario
/clientperm remove user:@Mario key:i_group_member_add_power

/sync user user:@Mario
/audit set-channel channel:#audit-log
/backup export
```

## Limiti Discord

Il motore permessi e TS3-like, ma Discord applica comunque i suoi vincoli:

- il bot non puo assegnare ruoli sopra il proprio ruolo piu alto;
- il bot deve avere `Manage Roles`;
- il server owner Discord non e modificabile dal bot;
- se un admin cambia ruoli manualmente, usa `/sync user` per riallineare dal database del bot verso Discord.

## Prossime fasi

La base attuale implementa Server Group e Client Permissions. Le prossime fasi naturali sono:

- Channel Group
- Channel Permissions
- Channel Client Permissions
- import backup
- ruoli temporanei con scadenza
- dashboard web

## Riferimenti

- Discord Interactions: <https://docs.discord.com/developers/interactions/receiving-and-responding>
- Discord Application Commands: <https://docs.discord.com/developers/docs/interactions/slash-commands>
- Cloudflare Workers TypeScript: <https://developers.cloudflare.com/workers/languages/typescript/>
- Cloudflare D1 Worker API: <https://developers.cloudflare.com/d1/worker-api/>

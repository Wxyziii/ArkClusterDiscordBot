# ARK Cluster Discord Bot

Discord.js v14 bot for ARK Smart Cluster Manager. Bot connects outbound to Discord and talks to manager API over Tailscale.

## Environment

Copy `.env.example` for local dev, or create `/etc/ark-cluster-discord-bot/bot.env` on Ubuntu. Never commit real secrets.

Required:

- `DISCORD_APPLICATION_ID`
- `DISCORD_PUBLIC_KEY`
- `DISCORD_TOKEN`
- `MANAGER_API_BASE`
- `MANAGER_API_TOKEN`

Optional:

- `DISCORD_GUILD_ID` for fast guild command registration
- `DISCORD_ADMIN_ROLE_ID` to restrict admin commands by role
- `DISCORD_STATUS_CHANNEL_ID`
- `DISCORD_DASHBOARD_ENABLED`
- `DISCORD_DASHBOARD_CATEGORY`
- `DISCORD_DASHBOARD_STATE`
- `DISCORD_DASHBOARD_REFRESH_SECS`

## Invite

OAuth2 scopes: `bot`, `applications.commands`.

Recommended bot permissions: View Channels, Send Messages, Embed Links, Read Message History, Manage Channels. Manage Channels is needed only for auto-creating the `ARK Cluster` dashboard category/channels.

## Commands

Everyone: `/status`, `/maps`, `/players`, `/travel`, `/resources`, `/backups`, `/runtime`, `/help`.

Admin: `/start`, `/stop`, `/restart`, `/backup`, `/home`, `/config`, `/mods`, `/update`, `/debug raw`.

Bot never starts servers directly. All changes go through manager API and obey manager capability/safety checks.

## Build

```bash
npm ci
npm run check
npm run build
```

Register commands:

```bash
npm run register
```

Run:

```bash
npm start
```

## Ubuntu Service

Install to `/opt/ark-cluster-discord-bot`, env to `/etc/ark-cluster-discord-bot/bot.env`, service file to `/etc/systemd/system/ark-cluster-discord-bot.service`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ark-cluster-discord-bot.service
sudo systemctl status ark-cluster-discord-bot.service --no-pager
```

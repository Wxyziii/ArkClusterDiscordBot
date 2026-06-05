import "dotenv/config";

export type BotConfig = {
  discordToken: string;
  applicationId: string;
  publicKey: string;
  guildId?: string;
  managerApiBase: string;
  managerApiToken: string;
  adminRoleId?: string;
  statusChannelId?: string;
  dashboardEnabled: boolean;
  dashboardCategoryName: string;
  dashboardStatePath: string;
  dashboardRefreshSecs: number;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

export function loadConfig(): BotConfig {
  return {
    discordToken: required("DISCORD_TOKEN"),
    applicationId: required("DISCORD_APPLICATION_ID"),
    publicKey: required("DISCORD_PUBLIC_KEY"),
    guildId: process.env.DISCORD_GUILD_ID,
    managerApiBase: process.env.MANAGER_API_BASE ?? "http://100.68.7.42:8788",
    managerApiToken: required("MANAGER_API_TOKEN"),
    adminRoleId: process.env.DISCORD_ADMIN_ROLE_ID,
    statusChannelId: process.env.DISCORD_STATUS_CHANNEL_ID,
    dashboardEnabled: process.env.DISCORD_DASHBOARD_ENABLED !== "false",
    dashboardCategoryName: process.env.DISCORD_DASHBOARD_CATEGORY ?? "ARK Cluster",
    dashboardStatePath: process.env.DISCORD_DASHBOARD_STATE ?? "/var/lib/ark-cluster-discord-bot/state.json",
    dashboardRefreshSecs: Number(process.env.DISCORD_DASHBOARD_REFRESH_SECS ?? 60)
  };
}

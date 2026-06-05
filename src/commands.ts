import {
  ChatInputCommandInteraction,
  GuildMember,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder
} from "discord.js";
import type { BotConfig } from "./config.js";
import { compact, ManagerClient } from "./manager.js";

type Handler = (interaction: ChatInputCommandInteraction, manager: ManagerClient, config: BotConfig) => Promise<void>;

export const commandData: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder().setName("status").setDescription("Show cluster status"),
  new SlashCommandBuilder().setName("maps").setDescription("Show ARK maps"),
  new SlashCommandBuilder().setName("players").setDescription("Show online players"),
  new SlashCommandBuilder()
    .setName("travel")
    .setDescription("Request travel map")
    .addStringOption((o) => o.setName("map").setDescription("Map key or alias").setRequired(true)),
  new SlashCommandBuilder().setName("resources").setDescription("Show host resources"),
  new SlashCommandBuilder().setName("backups").setDescription("Show backups"),
  new SlashCommandBuilder().setName("runtime").setDescription("Show ARK runtime readiness"),
  new SlashCommandBuilder().setName("help").setDescription("Show commands"),
  new SlashCommandBuilder()
    .setName("start")
    .setDescription("Admin: start slot")
    .addStringOption((o) => o.setName("slot").setDescription("home/travel-a/travel-b").setRequired(true)),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Admin: stop slot")
    .addStringOption((o) => o.setName("slot").setDescription("home/travel-a/travel-b").setRequired(true)),
  new SlashCommandBuilder()
    .setName("restart")
    .setDescription("Admin: restart slot")
    .addStringOption((o) => o.setName("slot").setDescription("home/travel-a/travel-b").setRequired(true)),
  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Admin: backup slot")
    .addStringOption((o) => o.setName("slot").setDescription("home/travel-a/travel-b").setRequired(true)),
  new SlashCommandBuilder()
    .setName("home")
    .setDescription("Admin: home controls")
    .addSubcommand((s) => s.setName("start").setDescription("Start Home"))
    .addSubcommand((s) => s.setName("standby").setDescription("Request Home standby")),
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Admin: shared config")
    .addSubcommand((s) =>
      s.setName("get").setDescription("Get masked shared config").addStringOption((o) => o.setName("key").setDescription("Optional key"))
    )
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Set safe shared config key")
        .addStringOption((o) => o.setName("file").setDescription("Game.ini or GameUserSettings.ini").setRequired(true))
        .addStringOption((o) => o.setName("key").setDescription("Config key").setRequired(true))
        .addStringOption((o) => o.setName("value").setDescription("Config value").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("mods")
    .setDescription("Admin: mods")
    .addSubcommand((s) => s.setName("list").setDescription("List mods"))
    .addSubcommand((s) => s.setName("add").setDescription("Add mod").addStringOption((o) => o.setName("workshop_id").setDescription("Workshop id").setRequired(true)))
    .addSubcommand((s) => s.setName("enable").setDescription("Enable mod").addStringOption((o) => o.setName("workshop_id").setDescription("Workshop id").setRequired(true)))
    .addSubcommand((s) => s.setName("disable").setDescription("Disable mod").addStringOption((o) => o.setName("workshop_id").setDescription("Workshop id").setRequired(true)))
    .addSubcommand((s) => s.setName("remove").setDescription("Remove mod").addStringOption((o) => o.setName("workshop_id").setDescription("Workshop id").setRequired(true)))
    .addSubcommand((s) => s.setName("reorder").setDescription("Show reorder backend state")),
  new SlashCommandBuilder()
    .setName("update")
    .setDescription("Admin: maintenance")
    .addSubcommand((s) => s.setName("ark").setDescription("Dry-run ARK update workflow"))
].map((c) => c.toJSON());

export const handlers: Record<string, Handler> = {
  status: read("/api/status"),
  maps: read("/api/servers"),
  players: read("/api/players"),
  resources: read("/api/resources"),
  backups: read("/api/backups"),
  runtime: read("/api/runtime"),
  help: async (i) => {
    await i.reply("Commands: /status /maps /players /travel /resources /backups /runtime /config /mods /update plus admin /start /stop /restart /backup /home.");
  },
  travel: async (i, m) => {
    const map = i.options.getString("map", true);
    await replyJson(i, await m.post("/api/travel/request", { map, source: "discord", actor: i.user.tag }));
  },
  start: guardedAction("start"),
  stop: guardedAction("stop"),
  restart: guardedAction("restart"),
  backup: guardedAction("backup"),
  home: async (i, m, c) => {
    requireAdmin(i, c);
    const sub = i.options.getSubcommand();
    const path = sub === "start" ? "/api/servers/home/actions/start" : "/api/servers/home/actions/stop";
    await replyJson(i, await m.post(path, { confirm: true, strongConfirm: true, reason: sub === "start" ? "discord_home_start" : "manual_admin_override" }));
  },
  config: async (i, m, c) => {
    requireAdmin(i, c);
    const sub = i.options.getSubcommand();
    if (sub === "get") return replyJson(i, await m.get("/api/config"));
    await replyJson(
      i,
      await m.post("/api/config/set", {
        file: i.options.getString("file", true),
        key: i.options.getString("key", true),
        value: i.options.getString("value", true),
        confirm: true,
        reason: "discord_config_set"
      })
    );
  },
  mods: async (i, m, c) => {
    requireAdmin(i, c);
    const sub = i.options.getSubcommand();
    if (sub === "list" || sub === "reorder") return replyJson(i, await m.get("/api/mods"));
    await replyJson(i, await m.post(`/api/mods/${sub}`, { workshopId: i.options.getString("workshop_id", true), confirm: true }));
  },
  update: async (i, m, c) => {
    requireAdmin(i, c);
    await replyJson(i, await m.post("/api/maintenance/update/ark", { dryRun: true, reason: "discord_update_dry_run" }));
  }
};

function read(path: string): Handler {
  return async (i, m) => replyJson(i, await m.get(path));
}

function guardedAction(action: string): Handler {
  return async (i, m, c) => {
    requireAdmin(i, c);
    const slot = i.options.getString("slot", true);
    await replyJson(i, await m.post(`/api/servers/${slot}/actions/${action}`, { confirm: true, strongConfirm: action !== "start", reason: `discord_${action}` }));
  };
}

async function replyJson(i: ChatInputCommandInteraction, value: unknown): Promise<void> {
  await i.reply({ content: `\`\`\`json\n${compact(value)}\n\`\`\``, ephemeral: true });
}

function requireAdmin(i: ChatInputCommandInteraction, config: BotConfig): void {
  if (!config.adminRoleId) return;
  const member = i.member as GuildMember | null;
  if (!member?.roles.cache.has(config.adminRoleId)) throw new Error("admin role required");
}

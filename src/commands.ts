import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  GuildMember,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder
} from "discord.js";
import type { ColorResolvable } from "discord.js";
import type { BotConfig } from "./config.js";
import { compact, ManagerClient, ManagerError } from "./manager.js";

type Handler = (interaction: ChatInputCommandInteraction, manager: ManagerClient, config: BotConfig) => Promise<void>;
type Row = Record<string, any>;

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
    .addStringOption((o) => o.setName("slot").setDescription("home or configured on-demand slot id").setRequired(true)),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Admin: stop slot")
    .addStringOption((o) => o.setName("slot").setDescription("home or configured on-demand slot id").setRequired(true)),
  new SlashCommandBuilder()
    .setName("restart")
    .setDescription("Admin: restart slot")
    .addStringOption((o) => o.setName("slot").setDescription("home or configured on-demand slot id").setRequired(true)),
  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Admin: backup slot")
    .addStringOption((o) => o.setName("slot").setDescription("home or configured on-demand slot id").setRequired(true)),
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
    .addSubcommand((s) => s.setName("ark").setDescription("Dry-run ARK update workflow")),
  new SlashCommandBuilder()
    .setName("debug")
    .setDescription("Admin: raw manager response")
    .addSubcommand((s) =>
      s
        .setName("raw")
        .setDescription("Fetch raw endpoint")
        .addStringOption((o) => o.setName("endpoint").setDescription("/api/status, /api/servers, /health, ...").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("node")
    .setDescription("Node management")
    .addSubcommand((s) => s.setName("status").setDescription("Show all cluster nodes status"))
    .addSubcommand((s) =>
      s
        .setName("invite")
        .setDescription("Admin: create node pairing invite")
        .addStringOption((o) => o.setName("name").setDescription("Node display name").setRequired(true))
        .addIntegerOption((o) => o.setName("ttl").setDescription("Code TTL in minutes (default 15)"))
    )
    .addSubcommand((s) =>
      s
        .setName("revoke")
        .setDescription("Admin: revoke a node token")
        .addStringOption((o) => o.setName("node").setDescription("Node ID").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("details")
        .setDescription("Admin: full node diagnostics")
        .addStringOption((o) => o.setName("node").setDescription("Node ID").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("travelnode")
    .setDescription("Travel session management")
    .addSubcommand((s) => s.setName("status").setDescription("Show active travel sessions"))
    .addSubcommand((s) =>
      s
        .setName("close")
        .setDescription("Admin: close a travel session (save → backup → stop)")
        .addStringOption((o) => o.setName("node").setDescription("Node ID").setRequired(false))
        .addStringOption((o) => o.setName("session").setDescription("Session ID").setRequired(false))
    )
    .addSubcommand((s) =>
      s
        .setName("forceclose")
        .setDescription("Admin: force-close a travel session (no save)")
        .addStringOption((o) => o.setName("node").setDescription("Node ID").setRequired(false))
        .addStringOption((o) => o.setName("session").setDescription("Session ID").setRequired(false))
    )
].map((c) => c.toJSON());

export const handlers: Record<string, Handler> = {
  status: async (i, m) => replyEmbed(i, statusEmbed(await m.get<Row>("/api/status"))),
  maps: async (i, m) => replyEmbed(i, mapsEmbed(await m.get<Row[]>("/api/servers"))),
  players: async (i, m) => replyEmbed(i, playersEmbed(await m.get<Row>("/api/players"))),
  resources: async (i, m) => replyEmbed(i, resourcesEmbed(await m.get<Row>("/api/resources"))),
  backups: async (i, m) => replyEmbed(i, backupsEmbed(await m.get<Row>("/api/backups"))),
  runtime: async (i, m) => replyEmbed(i, runtimeEmbed(await m.get<Row>("/api/runtime"))),
  help: async (i) => replyEmbed(i, helpEmbed()),
  travel: async (i, m) => {
    const map = i.options.getString("map", true);
    let value: unknown;
    try {
      value = await m.post("/api/travel/request", {
        map,
        source: "discord",
        actor: i.user.tag,
        actorDiscordId: i.user.id
      });
    } catch (err) {
      if (!(err instanceof ManagerError) || !err.payload) throw err;
      value = err.payload;
    }
    await replyEmbed(i, travelEmbed(asRow(value)));
  },
  start: guardedAction("start"),
  stop: guardedAction("stop"),
  restart: guardedAction("restart"),
  backup: guardedAction("backup"),
  home: async (i, m, c) => {
    requireAdmin(i, c);
    const sub = i.options.getSubcommand();
    const path = sub === "start" ? "/api/servers/home/actions/start" : "/api/servers/home/actions/stop";
    const value = await m.post<Row>(path, { confirm: true, strongConfirm: true, reason: sub === "start" ? "discord_home_start" : "manual_admin_override" });
    await replyEmbed(i, actionEmbed(value, `Home ${sub}`));
  },
  config: async (i, m, c) => {
    requireAdmin(i, c);
    const sub = i.options.getSubcommand();
    if (sub === "get") {
      await replyEmbed(i, configEmbed(await m.get<Row>("/api/config"), i.options.getString("key")));
      return;
    }
    const value = await m.post<Row>("/api/config/set", {
      file: i.options.getString("file", true),
      key: i.options.getString("key", true),
      value: i.options.getString("value", true),
      confirm: true,
      reason: "discord_config_set"
    });
    await replyEmbed(i, actionEmbed(value, "Config update"));
  },
  mods: async (i, m, c) => {
    requireAdmin(i, c);
    const sub = i.options.getSubcommand();
    if (sub === "list" || sub === "reorder") {
      await replyEmbed(i, modsEmbed(await m.get<Row>("/api/mods")));
      return;
    }
    const value = await m.post<Row>(`/api/mods/${sub}`, { workshopId: i.options.getString("workshop_id", true), confirm: true });
    await replyEmbed(i, actionEmbed(value, `Mod ${sub}`));
  },
  update: async (i, m, c) => {
    requireAdmin(i, c);
    await replyEmbed(i, maintenanceEmbed(await m.post<Row>("/api/maintenance/update/ark", { dryRun: true, reason: "discord_update_dry_run" })));
  },
  debug: async (i, m, c) => {
    requireAdmin(i, c);
    const endpoint = i.options.getString("endpoint", true).trim();
    if (!endpoint.startsWith("/api/") && endpoint !== "/health") throw new Error("endpoint must start with /api/ or be /health");
    await i.reply({ content: `\`\`\`json\n${compact(await m.get(endpoint), 1800)}\n\`\`\``, ephemeral: true });
  },
  node: async (i, m, c) => {
    const sub = i.options.getSubcommand();
    if (sub === "status") {
      await replyEmbed(i, nodesEmbed(await m.get<Row>("/api/nodes")));
      return;
    }
    requireAdmin(i, c);
    if (sub === "invite") {
      const name = i.options.getString("name", true);
      const ttl = i.options.getInteger("ttl") ?? 15;
      const value = await m.post<Row>("/api/nodes/pair/start", { name, createdBy: i.user.tag, ttlMins: ttl });
      await replyEmbed(i, pairInviteEmbed(value));
      return;
    }
    if (sub === "revoke") {
      const nodeId = i.options.getString("node", true);
      const value = await m.post<Row>(`/api/nodes/${nodeId}/revoke`, { confirm: true });
      await replyEmbed(i, actionEmbed(value, `Revoke node ${nodeId}`));
      return;
    }
    if (sub === "details") {
      const nodeId = i.options.getString("node", true);
      const value = await m.get<Row>(`/api/nodes/${nodeId}`);
      await replyEmbed(i, nodeDetailEmbed(nodeId, value));
      return;
    }
  },
  travelnode: async (i, m, c) => {
    const sub = i.options.getSubcommand();
    if (sub === "status") {
      await replyEmbed(i, travelSessionsEmbed(await m.get<Row>("/api/travel/status")));
      return;
    }
    requireAdmin(i, c);
    const nodeId = i.options.getString("node") ?? undefined;
    const sessionId = i.options.getString("session") ?? undefined;
    if (sub === "close") {
      const value = await m.post<Row>("/api/travel/close", { nodeId, sessionId });
      await replyEmbed(i, actionEmbed(value, "Travel close"));
      return;
    }
    if (sub === "forceclose") {
      const value = await m.post<Row>("/api/travel/force-close", { nodeId, sessionId, force: true });
      await replyEmbed(i, actionEmbed(value, "Travel force-close"));
      return;
    }
  }
};

function guardedAction(action: string): Handler {
  return async (i, m, c) => {
    requireAdmin(i, c);
    const slot = i.options.getString("slot", true);
    const value = await m.post<Row>(`/api/servers/${slot}/actions/${action}`, { confirm: true, strongConfirm: action !== "start", reason: `discord_${action}` });
    await replyEmbed(i, actionEmbed(value, `${slot} ${action}`));
  };
}

async function replyEmbed(i: ChatInputCommandInteraction, embed: EmbedBuilder, ephemeral = true): Promise<void> {
  await i.reply({ embeds: [embed], ephemeral });
}

function baseEmbed(title: string, color: ColorResolvable = Colors.Blurple): EmbedBuilder {
  return new EmbedBuilder().setTitle(title).setColor(color).setTimestamp(new Date());
}

function statusEmbed(status: Row): EmbedBuilder {
  const cluster = asRow(status.cluster);
  const pressure = asRow(status.resourcePressure);
  return baseEmbed(`ARK Cluster · ${text(cluster.name, "Status")}`, Colors.Green)
    .setDescription(`Manager ${text(asRow(status.manager).status)} · Discord ${text(asRow(status.discord).status)} · Tailscale ${text(asRow(status.tailscale).status)}`)
    .addFields(
      { name: "Players", value: playerTotal(status), inline: true },
      { name: "Running maps", value: String(status.runningMaps ?? 0), inline: true },
      { name: "RAM", value: `${text(pressure.label)} (${status.resourcePressure?.ramPct ?? "?"}%)`, inline: true },
      { name: "Travel policy", value: `${cluster.maxTravelServers ?? "?"} max · empty shutdown ${cluster.emptyShutdownMins ?? "?"} min`, inline: false }
    );
}

function mapsEmbed(maps: Row[]): EmbedBuilder {
  const lines = maps.slice(0, 12).map((m) => `**${text(m.name)}** · ${mapAssignment(m)} · ${text(m.state)} · ${playerLine(m)}${connectionLine(m)}`);
  return baseEmbed("ARK Maps", Colors.Green).setDescription(lines.length ? lines.join("\n") : "No maps returned.");
}

function playersEmbed(value: Row): EmbedBuilder {
  const players = asRows(value.players);
  const lines = players.slice(0, 15).map((p) => `**${text(p.name)}** · ${text(p.map)} · lvl ${p.level ?? "?"} · ${p.connectedMins ?? 0}m`);
  return baseEmbed("ARK Players", players.length ? Colors.Green : Colors.Grey).setDescription(lines.length ? lines.join("\n") : `No player rows returned. Source: ${text(value.source)}`);
}

function resourcesEmbed(value: Row): EmbedBuilder {
  const sample = asRow(value.sample);
  const derived = asRow(value.derived);
  const load = asRow(value.loadAverage);
  return baseEmbed("Host Resources", Colors.Blurple).addFields(
    { name: "RAM", value: `${derived.ramPct ?? "?"}% · ${sample.ramAvailableGb ?? "?"} GB free`, inline: true },
    { name: "CPU", value: `${derived.cpuPct ?? sample.cpuPct ?? "?"}%`, inline: true },
    { name: "Disk", value: `${derived.diskPct ?? "?"}% · ${sample.diskFreeGb ?? "?"} GB free`, inline: true },
    { name: "Load", value: `${load.one ?? sample.load1 ?? "?"} / ${load.five ?? sample.load5 ?? "?"} / ${load.fifteen ?? sample.load15 ?? "?"}`, inline: false }
  );
}

function backupsEmbed(value: Row): EmbedBuilder {
  const backups = asRows(value.backups);
  const lines = backups.slice(0, 10).map((b) => `**${text(b.map)}** · ${text(b.type)} · ${text(b.status)} · ${text(b.createdAt ?? b.created)}`);
  return baseEmbed("Backups", Colors.Green).setDescription(lines.length ? lines.join("\n") : "No backups returned.");
}

function runtimeEmbed(value: Row): EmbedBuilder {
  return baseEmbed("Runtime Readiness", value.ready ? Colors.Green : Colors.Orange).addFields(
    runtimeField("SteamCMD", value.steamcmd),
    runtimeField("ARK server", value.arkServer),
    runtimeField("Shared config", value.sharedConfig),
    runtimeField("Cluster dir", value.clusterDir),
    runtimeField("Backup root", value.backupRoot)
  );
}

function runtimeField(name: string, value: unknown) {
  const row = asRow(value);
  return { name, value: `${row.ok ? "ok" : "check"} · ${text(row.path ?? row.message)}`, inline: false };
}

function travelEmbed(value: Row): EmbedBuilder {
  const titleMap = text(value.resolvedMapName ?? value.requestedMap, "request");
  const embed = baseEmbed(`Travel · ${titleMap}`, value.accepted ? Colors.Green : Colors.Orange)
    .setDescription(text(value.userMessage ?? value.reason, "No reason returned."))
    .addFields(
      { name: "Status", value: text(value.status), inline: true },
      { name: "Requested map", value: text(value.requestedMap, "none"), inline: true },
      { name: "Resolved map", value: text(value.resolvedMapName ?? value.resolvedMap, "none"), inline: true }
    );
  if (value.connectionAvailable) {
    const connAddr = value.publicConnectionAddress ?? value.connectionAddress;
    const queryAddr = value.publicQueryAddress ?? value.queryAddress;
    embed.addFields(
      { name: "Game connect", value: text(connAddr), inline: true },
      { name: "Steam favorites/query", value: text(queryAddr), inline: true }
    );
  }
  return embed;
}

function configEmbed(value: Row, key: string | null): EmbedBuilder {
  const shared = asRow(value.shared);
  const game = text(value.gameIni);
  const gus = text(value.gameUserSettingsIni);
  const lines = key ? [...game.split("\n"), ...gus.split("\n")].filter((line) => line.toLowerCase().startsWith(`${key.toLowerCase()}=`)) : [];
  const desc = key ? (lines.length ? lines.join("\n") : `No masked value found for ${key}.`) : `Shared config: ${text(shared.sharedConfigDir)}`;
  return baseEmbed("Shared Config", Colors.Blurple).setDescription(trunc(desc, 1800));
}

function modsEmbed(value: Row): EmbedBuilder {
  const mods = asRows(value.mods);
  const lines = mods.slice(0, 12).map((m) => `**${text(m.name, `Workshop ${m.workshopId}`)}** · ${m.workshopId} · ${m.enabled ? "enabled" : "disabled"} · ${text(m.status)}`);
  return baseEmbed("Mods", value.mutable ? Colors.Green : Colors.Grey)
    .setDescription(lines.length ? lines.join("\n") : "No mod records yet.")
    .addFields({ name: "Mutations", value: value.mutable ? "enabled" : "disabled by manager", inline: true });
}

function maintenanceEmbed(value: Row): EmbedBuilder {
  return baseEmbed("ARK Update Dry-run", Colors.Orange)
    .setDescription(text(value.detail, "Dry-run returned."))
    .addFields({ name: "Job", value: text(value.jobId), inline: true }, { name: "Status", value: text(value.status), inline: true });
}

function actionEmbed(value: Row, title: string): EmbedBuilder {
  return baseEmbed(title, value.accepted === false ? Colors.Orange : Colors.Green)
    .setDescription(text(value.message ?? value.result ?? value.detail ?? "Action returned."))
    .addFields({ name: "Result", value: text(value.result ?? value.status ?? value.action ?? "ok"), inline: true });
}

function helpEmbed(): EmbedBuilder {
  return baseEmbed("ARK Bot Commands", Colors.Blurple).setDescription(
    [
      "`/status` `/maps` `/players` `/travel` `/resources` `/backups` `/runtime`",
      "Admin: `/start` `/stop` `/restart` `/backup` `/home` `/config` `/mods` `/update` `/debug raw`"
    ].join("\n")
  );
}

function requireAdmin(i: ChatInputCommandInteraction, config: BotConfig): void {
  if (!config.adminRoleId) return;
  const member = i.member as GuildMember | { roles?: string[] } | null;
  if (member instanceof GuildMember && member.roles.cache.has(config.adminRoleId)) return;
  if (Array.isArray(member?.roles) && member.roles.includes(config.adminRoleId)) return;
  throw new Error("admin role required");
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" ? (value as Row) : {};
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(asRow) : [];
}

function text(value: unknown, fallback = "unknown"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function playerTotal(status: Row): string {
  return status.players === null || status.players === undefined
    ? text(status.playerCountSource, "unavailable")
    : String(status.players);
}

function playerLine(row: Row): string {
  const max = row.maxPlayers ?? "capacity unknown";
  if (row.playerCountSource === "rcon") return `${row.players ?? 0}/${max}`;
  if (["not_running", "stopped"].includes(String(row.playerCountSource))) return `0/${max}`;
  const reason = text(row.unavailableReason ?? row.nextAction, "players unavailable");
  return `players unavailable/${max} (${reason})`;
}

function connectionLine(row: Row): string {
  if (!row.connectionAvailable) return "";
  const state = String(row.state ?? "");
  if (!["Online", "Ready", "Starting"].includes(state)) return "";
  const connAddr = row.publicConnectionAddress ?? row.connectionAddress;
  const queryAddr = row.publicQueryAddress ?? row.queryAddress;
  return ` · connect ${text(connAddr)} · query ${text(queryAddr)}`;
}

function mapAssignment(row: Row): string {
  if (row.launchReady && !row.configured && row.assignment === "Unassigned") return "Available destination";
  return text(row.assignment);
}

function nodesEmbed(value: Row): EmbedBuilder {
  const nodes = asRows(value.nodes);
  if (!nodes.length) {
    return baseEmbed("Cluster Nodes", Colors.Grey).setDescription("No nodes registered. Use `/node invite` to pair a node.");
  }
  const lines = nodes.map((n) => {
    const statusIcon = n.status === "online" ? "🟢" : n.status === "busy" ? "🟡" : n.status === "not_ready" ? "🟠" : "🔴";
    const ram = n.available_ram_mb ? `${Math.round(n.available_ram_mb / 1024)}GB free` : "RAM unknown";
    const map = n.current_map ? ` · ${text(n.current_map)}` : "";
    const share = n.cluster_share_mounted ? "share ✓" : "share ✗";
    const mods = n.mods_valid ? "mods ✓" : "mods ✗";
    return `${statusIcon} **${text(n.display_name)}** (\`${text(n.id)}\`) · ${text(n.status)}${map} · ${ram} · ${share} · ${mods}`;
  });
  return baseEmbed("Cluster Nodes", Colors.Blurple).setDescription(lines.join("\n"));
}

function pairInviteEmbed(value: Row): EmbedBuilder {
  return baseEmbed("Node Pairing Invite", Colors.Green)
    .setDescription(`Pairing code: \`${text(value.code)}\`\nExpires: ${text(value.expiresAt)}`)
    .addFields(
      { name: "Node name", value: text(value.suggestedName), inline: true },
      { name: "TTL", value: `${text(value.ttlMins)} min`, inline: true },
      { name: "Instructions", value: "Run `setup.ps1`, enter manager URL and this code.", inline: false }
    );
}

function nodeDetailEmbed(nodeId: string, value: Row): EmbedBuilder {
  const node = asRow(value.node);
  const session = asRow(value.activeSession);
  return baseEmbed(`Node: ${text(node.display_name, nodeId)}`, Colors.Blurple)
    .addFields(
      { name: "Status", value: text(node.status), inline: true },
      { name: "Type", value: text(node.node_type), inline: true },
      { name: "Tailscale IP", value: text(node.tailscale_ip, "unknown"), inline: true },
      { name: "Version", value: text(node.version, "unknown"), inline: true },
      { name: "RAM", value: node.available_ram_mb ? `${Math.round(node.available_ram_mb / 1024)}/${Math.round((node.total_ram_mb ?? 0) / 1024)} GB` : "unknown", inline: true },
      { name: "Last heartbeat", value: text(node.last_heartbeat, "never"), inline: true },
      { name: "Cluster share", value: node.cluster_share_mounted ? "mounted ✓" : "not mounted ✗", inline: true },
      { name: "ARK installed", value: node.ark_server_installed ? "yes ✓" : "no ✗", inline: true },
      { name: "Mods valid", value: node.mods_valid ? "yes ✓" : "no ✗", inline: true },
      { name: "Config valid", value: node.config_valid ? "yes ✓" : "no ✗", inline: true },
      { name: "Ports free", value: node.ports_free ? "yes ✓" : "no ✗", inline: true },
      { name: "Last error", value: text(node.last_error, "none"), inline: false }
    )
    .addFields(session.id ? [{ name: "Active session", value: `${text(session.map_name)} · ${text(session.status)} · since ${text(session.started_at)}`, inline: false }] : []);
}

function travelSessionsEmbed(value: Row): EmbedBuilder {
  const sessions = asRows(value.sessions);
  const nodes = asRows(value.nodes);
  if (!sessions.length) {
    return baseEmbed("Travel Sessions", Colors.Grey).setDescription("No active travel sessions.");
  }
  const lines = sessions.map((s) => {
    const node = nodes.find((n) => n.id === s.node_id);
    const nodeName = node ? text(node.display_name) : text(s.node_id);
    const statusIcon = s.status === "ready" ? "🟢" : s.status === "starting" ? "🟡" : s.status === "closing" ? "🟠" : "🔵";
    return `${statusIcon} **${text(s.map_name)}** on **${nodeName}** · ${text(s.status)} · since ${text(s.started_at).slice(0, 16)}`;
  });
  return baseEmbed("Travel Sessions", Colors.Green).setDescription(lines.join("\n"));
}

function trunc(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 20)}\n...truncated` : value;
}

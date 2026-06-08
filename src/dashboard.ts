import {
  ChannelType,
  Client,
  Colors,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits,
  TextChannel
} from "discord.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BotConfig } from "./config.js";
import { ManagerClient } from "./manager.js";

type DashboardKey = "status" | "travel" | "nodes" | "players" | "logs" | "admin";
type Row = Record<string, any>;
type DashboardState = {
  guildId?: string;
  categoryId?: string;
  channels: Partial<Record<DashboardKey, string>>;
  messages: Partial<Record<DashboardKey, string>>;
  updatedAt?: string;
};

const PANELS: Array<{ key: DashboardKey; name: string; topic: string }> = [
  { key: "status", name: "ark-status", topic: "ARK cluster status panel" },
  { key: "travel", name: "ark-travel", topic: "ARK travel slot panel" },
  { key: "nodes", name: "ark-nodes", topic: "ARK external travel nodes" },
  { key: "players", name: "ark-players", topic: "ARK online players panel" },
  { key: "logs", name: "ark-logs", topic: "ARK recent manager events" },
  { key: "admin", name: "ark-admin", topic: "ARK admin/runtime panel" }
];

export async function startDashboard(client: Client<true>, manager: ManagerClient, config: BotConfig): Promise<void> {
  if (!config.dashboardEnabled) return;
  const state = await readState(config.dashboardStatePath);
  const update = async () => {
    try {
      await updateDashboard(client, manager, config, state);
    } catch (err) {
      console.error(`Dashboard update failed: ${safeMessage(err)}`);
    }
  };
  await update();
  const intervalMs = Math.max(30, config.dashboardRefreshSecs) * 1000;
  setInterval(update, intervalMs).unref();
}

async function updateDashboard(client: Client<true>, manager: ManagerClient, config: BotConfig, state: DashboardState): Promise<void> {
  const guild = await resolveGuild(client, config);
  if (!guild) {
    console.warn("Dashboard skipped: no guild found");
    return;
  }
  await guild.channels.fetch();
  const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  const canManage = !!me?.permissions.has(PermissionFlagsBits.ManageChannels);
  const category = canManage ? await findOrCreateCategory(guild, config, state) : null;

  state.guildId = guild.id;
  for (const panel of PANELS) {
    const channel = await findOrCreatePanelChannel(guild, config, state, panel.key, panel.name, panel.topic, category?.id, canManage);
    if (!channel) continue;
    const embed = await buildPanelEmbed(panel.key, manager);
    const messageId = await upsertMessage(channel, state.messages[panel.key], embed);
    state.channels[panel.key] = channel.id;
    state.messages[panel.key] = messageId;
  }
  state.updatedAt = new Date().toISOString();
  await writeState(config.dashboardStatePath, state);
}

async function resolveGuild(client: Client<true>, config: BotConfig): Promise<Guild | null> {
  if (config.guildId) return client.guilds.fetch(config.guildId).catch(() => null);
  return client.guilds.cache.first() ?? null;
}

async function findOrCreateCategory(guild: Guild, config: BotConfig, state: DashboardState) {
  const saved = state.categoryId ? await guild.channels.fetch(state.categoryId).catch(() => null) : null;
  if (saved?.type === ChannelType.GuildCategory) return saved;
  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === config.dashboardCategoryName);
  if (existing?.type === ChannelType.GuildCategory) {
    state.categoryId = existing.id;
    return existing;
  }
  const created = await guild.channels.create({ name: config.dashboardCategoryName, type: ChannelType.GuildCategory });
  state.categoryId = created.id;
  return created;
}

async function findOrCreatePanelChannel(
  guild: Guild,
  config: BotConfig,
  state: DashboardState,
  key: DashboardKey,
  name: string,
  topic: string,
  categoryId: string | undefined,
  canManage: boolean
): Promise<TextChannel | null> {
  const savedId = state.channels[key] ?? (key === "status" ? config.statusChannelId : undefined);
  const saved = savedId ? await guild.channels.fetch(savedId).catch(() => null) : null;
  if (saved?.type === ChannelType.GuildText) return saved;

  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === name);
  if (existing?.type === ChannelType.GuildText) return existing;
  if (!canManage) {
    console.warn(`Dashboard channel missing and Manage Channels unavailable: ${name}`);
    return null;
  }
  const created = await guild.channels.create({ name, type: ChannelType.GuildText, parent: categoryId, topic });
  return created.type === ChannelType.GuildText ? created : null;
}

async function upsertMessage(channel: TextChannel, messageId: string | undefined, embed: EmbedBuilder): Promise<string> {
  if (messageId) {
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) {
      await message.edit({ embeds: [embed] });
      return message.id;
    }
  }
  const sent = await channel.send({ embeds: [embed] });
  return sent.id;
}

async function buildPanelEmbed(key: DashboardKey, manager: ManagerClient): Promise<EmbedBuilder> {
  try {
    if (key === "status") return statusPanel(await manager.get<Row>("/api/status"));
    if (key === "travel") return travelPanel(await manager.get<Row>("/api/travel"));
    if (key === "nodes") return nodesPanel(await manager.get<Row>("/api/nodes"), await manager.get<Row>("/api/travel/status"));
    if (key === "players") return playersPanel(await manager.get<Row>("/api/players"));
    if (key === "logs") return logsPanel(await manager.get<Row>("/api/activity"));
    return adminPanel(await manager.get<Row>("/api/runtime"), await manager.get<Row>("/api/capabilities"));
  } catch (err) {
    return new EmbedBuilder().setTitle(`ARK ${key}`).setColor(Colors.Red).setDescription(`Manager error: ${safeMessage(err)}`).setTimestamp(new Date());
  }
}

function statusPanel(status: Row): EmbedBuilder {
  const cluster = asRow(status.cluster);
  const pressure = asRow(status.resourcePressure);
  return new EmbedBuilder()
    .setTitle(`ARK Cluster · ${text(cluster.name)}`)
    .setColor(Colors.Green)
    .setDescription(`Manager ${text(asRow(status.manager).status)} · Discord ${text(asRow(status.discord).status)} · Tailscale ${text(asRow(status.tailscale).status)}`)
    .addFields(
      { name: "Players", value: playerTotal(status), inline: true },
      { name: "Running maps", value: String(status.runningMaps ?? 0), inline: true },
      { name: "RAM pressure", value: `${text(pressure.label)} (${pressure.ramPct ?? "?"}%)`, inline: true }
    )
    .setTimestamp(new Date());
}

function travelPanel(travel: Row): EmbedBuilder {
  const slots = asRows(travel.slots);
  const slotFields = slots.length
    ? slots.map(slotStateField)
    : [{ name: "Slots", value: "No slot state returned.", inline: false }];
  return new EmbedBuilder()
    .setTitle("ARK Travel")
    .setColor(travel.enabled ? Colors.Green : Colors.Grey)
    .setDescription(text(travel.blockReason, "Travel scheduler ready."))
    .addFields(
      ...slotFields,
      { name: "Idle shutdown", value: `${Math.round(Number(travel.idleShutdownSecs ?? 0) / 60)} min`, inline: true }
    )
    .setTimestamp(new Date());
}

function playersPanel(value: Row): EmbedBuilder {
  const players = asRows(value.players);
  return new EmbedBuilder()
    .setTitle("ARK Players")
    .setColor(players.length ? Colors.Green : Colors.Grey)
    .setDescription(players.length ? players.slice(0, 20).map((p) => `**${text(p.name)}** · ${text(p.map)} · lvl ${p.level ?? "?"}`).join("\n") : `No player rows returned. Source: ${text(value.source)}`)
    .setTimestamp(new Date());
}

function logsPanel(value: Row): EmbedBuilder {
  const rows = asRows(value.recent ?? value.activity);
  return new EmbedBuilder()
    .setTitle("ARK Recent Events")
    .setColor(Colors.Blurple)
    .setDescription(rows.length ? rows.slice(0, 12).map((r) => `**${text(r.severity)}** · ${text(r.source)} · ${text(r.message)}`).join("\n") : "No recent events.")
    .setTimestamp(new Date());
}

function adminPanel(runtime: Row, caps: Row): EmbedBuilder {
  const capLines = Object.entries(caps)
    .filter(([, value]) => value && typeof value === "object" && "enabled" in (value as Row))
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${(value as Row).enabled ? "on" : "off"}`);
  return new EmbedBuilder()
    .setTitle("ARK Admin")
    .setColor(runtime.ready ? Colors.Green : Colors.Orange)
    .setDescription([`Runtime: ${runtime.ready ? "ready" : "check"}`, ...capLines].join("\n"))
    .setTimestamp(new Date());
}

function nodesPanel(nodesData: Row, travelData: Row): EmbedBuilder {
  const nodes = asRows(nodesData.nodes);
  const sessions = asRows(travelData.sessions);
  if (!nodes.length) {
    return new EmbedBuilder()
      .setTitle("ARK Travel Nodes")
      .setColor(Colors.Grey)
      .setDescription("No nodes paired. Use `/node invite` to pair a Windows travel node.")
      .setTimestamp(new Date());
  }
  const lines = nodes.map((n) => {
    const icon = n.status === "online" ? "🟢" : n.status === "busy" ? "🟡" : n.status === "not_ready" ? "🟠" : "🔴";
    const ram = n.available_ram_mb ? `${Math.round(n.available_ram_mb / 1024)}GB free` : "RAM?";
    const session = sessions.find((s: Row) => s.node_id === n.id && !["closed", "error"].includes(String(s.status)));
    const mapLine = session ? ` · **${text(session.map_name)}** ${text(session.status)}` : (n.current_map ? ` · ${text(n.current_map)}` : "");
    const checks = [
      n.cluster_share_mounted ? "share✓" : "share✗",
      n.mods_valid ? "mods✓" : "mods✗",
      n.config_valid ? "cfg✓" : "cfg✗"
    ].join(" ");
    return `${icon} **${text(n.display_name)}** · ${text(n.status)}${mapLine} · ${ram} · ${checks}`;
  });
  const sessionLines = sessions.length
    ? sessions.map((s: Row) => {
        const node = nodes.find((n) => n.id === s.node_id);
        return `> ${text(s.map_name)} on ${node ? text(node.display_name) : text(s.node_id)} · ${text(s.status)}`;
      })
    : [];
  const desc = [...lines, ...(sessionLines.length ? ["", "**Active sessions:**", ...sessionLines] : [])].join("\n");
  const anyBusy = nodes.some((n) => n.status === "busy");
  const anyOnline = nodes.some((n) => ["online", "busy"].includes(String(n.status)));
  return new EmbedBuilder()
    .setTitle("ARK Travel Nodes")
    .setColor(anyBusy ? Colors.Yellow : anyOnline ? Colors.Green : Colors.Grey)
    .setDescription(desc || "No data.")
    .setTimestamp(new Date());
}

function slotStateField(value: unknown) {
  const slot = asRow(value);
  const map = asRow(slot.map);
  const name = slot.role === "Home" ? "Home" : "On-demand slot";
  const body = map.name
    ? `${text(map.name)} · ${text(map.state)} · ${playerLine(map)}${connectionLine(map)}`
    : `${text(slot.mapKey, "unassigned")} · ${text(slot.systemd)} · players unavailable`;
  return { name, value: body, inline: false };
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
  return ` · connect ${text(row.connectionAddress)} · query ${text(row.queryAddress)}`;
}

async function readState(path: string): Promise<DashboardState> {
  try {
    return { channels: {}, messages: {}, ...JSON.parse(await readFile(path, "utf8")) };
  } catch {
    return { channels: {}, messages: {} };
  }
}

async function writeState(path: string, state: DashboardState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2));
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

function safeMessage(err: unknown): string {
  return err instanceof Error ? err.message.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]") : "unknown error";
}

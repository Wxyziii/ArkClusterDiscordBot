import { Client, Events, GatewayIntentBits } from "discord.js";
import { handlers } from "./commands.js";
import { loadConfig } from "./config.js";
import { startDashboard } from "./dashboard.js";
import { ManagerClient } from "./manager.js";

const config = loadConfig();
const manager = new ManagerClient(config);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`ARK bot ready as ${readyClient.user.tag}`);
  try {
    await manager.get("/health");
    console.log("Manager API reachable");
    await startDashboard(readyClient, manager, config);
  } catch (err) {
    console.error(`Manager API check failed: ${safeMessage(err)}`);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const handler = handlers[interaction.commandName];
  if (!handler) return;
  try {
    await handler(interaction, manager, config);
  } catch (err) {
    const message = safeMessage(err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
});

client.login(config.discordToken);

function safeMessage(err: unknown): string {
  return err instanceof Error ? err.message.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]") : "unknown error";
}

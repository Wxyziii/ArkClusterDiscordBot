import { REST, Routes } from "discord.js";
import { commandData } from "./commands.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const rest = new REST({ version: "10" }).setToken(config.discordToken);

const route = config.guildId
  ? Routes.applicationGuildCommands(config.applicationId, config.guildId)
  : Routes.applicationCommands(config.applicationId);

await rest.put(route, { body: commandData });
console.log(`Registered ${commandData.length} slash commands${config.guildId ? " for guild" : " globally"}`);

import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  SlashCommandBuilder,
  REST,
  Routes
} from "discord.js";

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  N8N_WEBHOOK_URL
} = process.env;

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN");
if (!CLIENT_ID) throw new Error("Missing CLIENT_ID");
if (!GUILD_ID) throw new Error("Missing GUILD_ID");
if (!N8N_WEBHOOK_URL) throw new Error("Missing N8N_WEBHOOK_URL");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

async function callN8n(payload) {
  const res = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    console.error("n8n returned non-JSON:", text);
    return {
      success: false,
      message: "n8n returned an invalid response."
    };
  }
}

function buildClaimPanel() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("claim_prize")
      .setLabel("Claim Prize")
      .setStyle(ButtonStyle.Success)
  );

  return {
    content:
      "🎁 **Claim Your Prize**\n\nIf you have a winner role, click below to submit your prize request.",
    components: [row]
  };
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("claimpanel")
      .setDescription("Post the GamersEra prize claim button panel")
      .toJSON()
  ];

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  console.log("🔄 Registering slash commands...");
  console.log("CLIENT_ID:", CLIENT_ID);
  console.log("GUILD_ID:", GUILD_ID);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Slash commands registered");
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Prize Bot Online: ${client.user.tag}`);

  try {
    await registerCommands();
  } catch (err) {
    console.error("❌ Failed to register slash commands:", err);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.content === "!claimpanel") {
    await message.channel.send(buildClaimPanel());
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "claimpanel") {
        await interaction.reply(buildClaimPanel());
        return;
      }
    }

    if (!interaction.isButton()) return;

    if (interaction.customId === "claim_prize") {
      await interaction.deferReply({ ephemeral: true });

      const member = await interaction.guild.members.fetch(interaction.user.id);
      const roleIds = member.roles.cache.map((role) => role.id);

      const result = await callN8n({
        action: "create_claim_token",
        discord_user_id: interaction.user.id,
        discord_username: interaction.user.username,
        role_ids: roleIds
      });

      if (!result.success) {
        return interaction.editReply(
          result.message || "❌ Failed to create your prize claim link."
        );
      }

      return interaction.editReply(
        `🎁 **Your prize claim link:**\n${result.claim_url}\n\nThis link is private to you.`
      );
    }
  } catch (err) {
    console.error("Interaction error:", err);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("❌ Something went wrong. Please try again later.");
    } else {
      await interaction.reply({
        content: "❌ Something went wrong. Please try again later.",
        ephemeral: true
      });
    }
  }
});

client.login(DISCORD_TOKEN);

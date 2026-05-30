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

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const N8N_WEBHOOK_URL = "https://gamersera.app.n8n.cloud/webhook/gamersera-prizes";

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN");
if (!CLIENT_ID) throw new Error("Missing CLIENT_ID");
if (!GUILD_ID) throw new Error("Missing GUILD_ID");

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
  console.log("➡️ Sending to n8n:", JSON.stringify(payload, null, 2));

  const res = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log("⬅️ n8n status:", res.status);
  console.log("⬅️ n8n response:", text);

  try {
    return JSON.parse(text);
  } catch {
    return { success: false, message: text || "n8n returned invalid response." };
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

      const roleIdsText = member.roles.cache
        .map((role) => String(role.id))
        .join(",");

      const result = await callN8n({
        action: "create_claim_token",
        discord_user_id: String(interaction.user.id),
        discord_username: interaction.user.username,
        role_ids_text: roleIdsText
      });

      if (!result.success || !result.claim_url) {
        return interaction.editReply(
          result.message || "❌ Failed to create your prize claim link."
        );
      }

      const claimButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Open Prize Claim Portal")
          .setStyle(ButtonStyle.Link)
          .setURL(result.claim_url)
      );

      return interaction.editReply({
        content: "🎁 Your prize claim portal is ready.",
        components: [claimButton]
      });
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

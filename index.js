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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

async function callN8n(payload) {
  const res = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return await res.json();
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("claimpanel")
      .setDescription("Post the GamersEra prize claim button panel")
      .toJSON()
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log("✅ Slash commands registered");
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Prize Bot Online: ${client.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "claimpanel") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("claim_prize")
          .setLabel("Claim Prize")
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({
        content:
          "🎁 **Claim Your Prize**\n\nIf you have a winner role, click below to submit your prize request.",
        components: [row]
      });

      return;
    }
  }

  if (!interaction.isButton()) return;

  if (interaction.customId === "claim_prize") {
    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const roleIds = member.roles.cache.map(role => role.id);

    const result = await callN8n({
      action: "create_claim_token",
      discord_user_id: interaction.user.id,
      discord_username: interaction.user.username,
      role_ids: roleIds
    });

    if (!result.success) {
      return interaction.editReply(
        "❌ Failed to create your prize claim link."
      );
    }

    return interaction.editReply(
      `🎁 Your prize claim link:\n${result.claim_url}\n\nThis link is private to you.`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);

import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return await res.json();
}

client.once(Events.ClientReady, () => {
  console.log(`✅ GamersEra Prize Bot online as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
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
      return interaction.editReply("❌ Could not create your prize claim link.");
    }

    return interaction.editReply(
      `🎁 Your prize claim link:\n${result.claim_url}\n\nThis link may expire, so submit your form as soon as possible.`
    );
  }

  if (interaction.customId === "post_claim_panel") {
    await interaction.deferReply({ ephemeral: true });

    const channel = await client.channels.fetch(process.env.PUBLIC_CLAIM_CHANNEL_ID);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_prize")
        .setLabel("Claim Prize")
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({
      content:
        "🎁 **Claim Your Prize**\n\nIf you have a winner role, click below to submit your prize request.",
      components: [row]
    });

    return interaction.editReply("✅ Claim button posted.");
  }
});

client.login(process.env.DISCORD_TOKEN);
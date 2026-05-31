import "dotenv/config";
import express from "express";
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
  Routes,
  EmbedBuilder
} from "discord.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;

const N8N_WEBHOOK_URL = "https://gamersera.app.n8n.cloud/webhook/gamersera-prizes";

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN");
if (!CLIENT_ID) throw new Error("Missing CLIENT_ID");
if (!GUILD_ID) throw new Error("Missing GUILD_ID");
if (!ADMIN_CHANNEL_ID) throw new Error("Missing ADMIN_CHANNEL_ID");

const app = express();
app.use(express.json({ limit: "10mb" }));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

function safe(value, fallback = "Not provided") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

async function callN8n(payload) {
  console.log("Sending to n8n:", JSON.stringify(payload, null, 2));

  const res = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log("n8n status:", res.status);
  console.log("n8n response:", text);

  try {
    return JSON.parse(text);
  } catch {
    return { success: false, message: text || "n8n returned invalid response." };
  }
}

function buildClaimPanel() {
  const embed = new EmbedBuilder()
    .setTitle("GamersEra Prize Claim")
    .setDescription("If you have a winner role, click the button below to submit your prize request.")
    .setColor(0x00ffae)
    .setFooter({ text: "Powered by AdsnRewards Competitive Systems" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("claim_prize")
      .setLabel("Claim Prize")
      .setStyle(ButtonStyle.Success)
  );

  return {
    embeds: [embed],
    components: [row]
  };
}

function buildClaimReadyEmbed() {
  return new EmbedBuilder()
    .setTitle("Prize Claim Portal Ready")
    .setDescription("Your private prize claim portal is ready. Click the button below to continue.")
    .setColor(0x00ffae)
    .setFooter({ text: "GamersEra Prize System" });
}

function buildAdminClaimEmbed(claim) {
  const embed = new EmbedBuilder()
    .setTitle("New Prize Claim")
    .setColor(0x14c8ff)
    .addFields(
      { name: "Claim Number", value: safe(claim.claim_number || claim.claim_id), inline: true },
      { name: "Status", value: safe(claim.status, "Pending"), inline: true },
      { name: "Discord User", value: safe(claim.discord_username), inline: true },
      { name: "Discord ID", value: safe(claim.discord_user_id), inline: true },
      { name: "Event", value: safe(claim.event_name), inline: true },
      { name: "Tournament", value: safe(claim.tournament_name), inline: true },
      { name: "Placement", value: safe(claim.placement_role), inline: true },
      { name: "Membership", value: safe(claim.membership_role), inline: true },
      { name: "Category", value: safe(claim.category), inline: true },
      { name: "Selected Prize", value: safe(claim.selected_prize), inline: true },
      { name: "Prize Value", value: safe(claim.prize_value), inline: true },
      { name: "Region", value: safe(claim.region), inline: true },
      { name: "Delivery Method", value: safe(claim.delivery_method), inline: true },
      { name: "PayPal Form Required", value: safe(claim.paypal_form_required, "No"), inline: true },
      { name: "Tournament Feedback", value: safe(claim.tournament_feedback, "None provided"), inline: false },
      { name: "PayPal Form", value: safe(claim.paypal_form_url, "Not required"), inline: false }
    )
    .setFooter({ text: "GamersEra Admin Claim Log" })
    .setTimestamp();

  return embed;
}

function buildUserClaimEmbed(claim) {
  return new EmbedBuilder()
    .setTitle("Prize Claim Submitted")
    .setDescription("Thank you for participating in GamersEra. Your prize request has been received and is now under review.")
    .setColor(0x00ffae)
    .addFields(
      { name: "Claim Number", value: safe(claim.claim_number || claim.claim_id), inline: true },
      { name: "Status", value: safe(claim.status, "Pending Review"), inline: true },
      { name: "Prize", value: safe(claim.selected_prize), inline: true },
      { name: "Prize Value", value: safe(claim.prize_value), inline: true }
    )
    .setFooter({ text: "You will receive updates through Discord." })
    .setTimestamp();
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

  console.log("Slash commands registered");
}

app.get("/", (req, res) => {
  res.json({ success: true, message: "GamersEra Prize Bot is running." });
});

app.post("/claim-submitted", async (req, res) => {
  try {
    const claim = req.body || {};

    const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);

    const adminButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`deliver_claim:${claim.claim_id}`)
        .setLabel("Mark Delivered")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reject_claim:${claim.claim_id}`)
        .setLabel("Reject Claim")
        .setStyle(ButtonStyle.Danger)
    );

    await adminChannel.send({
      embeds: [buildAdminClaimEmbed(claim)],
      components: [adminButtons]
    });

    try {
      const user = await client.users.fetch(String(claim.discord_user_id));
      await user.send({
        embeds: [buildUserClaimEmbed(claim)]
      });
    } catch (dmErr) {
      console.error("Could not DM user:", dmErr);
    }

    return res.json({ success: true, message: "Claim embeds sent." });
  } catch (err) {
    console.error("claim-submitted error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send claim embeds."
    });
  }
});

client.once(Events.ClientReady, async () => {
  console.log(`Prize Bot Online: ${client.user.tag}`);

  try {
    await registerCommands();
  } catch (err) {
    console.error("Failed to register slash commands:", err);
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
          result.message || "Failed to create your prize claim link."
        );
      }

      const claimButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Open Prize Claim Portal")
          .setStyle(ButtonStyle.Link)
          .setURL(result.claim_url)
      );

      return interaction.editReply({
        embeds: [buildClaimReadyEmbed()],
        components: [claimButton]
      });
    }

    if (interaction.customId.startsWith("deliver_claim:")) {
      const claimId = interaction.customId.split(":")[1];

      await interaction.reply({
        content: `Delivery action received for ${claimId}. We will connect this button to n8n next.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.customId.startsWith("reject_claim:")) {
      const claimId = interaction.customId.split(":")[1];

      await interaction.reply({
        content: `Reject action received for ${claimId}. We will connect this button to n8n next.`,
        ephemeral: true
      });

      return;
    }
  } catch (err) {
    console.error("Interaction error:", err);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("Something went wrong. Please try again later.");
    } else {
      await interaction.reply({
        content: "Something went wrong. Please try again later.",
        ephemeral: true
      });
    }
  }
});

client.login(DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});

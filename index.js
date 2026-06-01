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
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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

  return { embeds: [embed], components: [row] };
}

function buildClaimReadyEmbed() {
  return new EmbedBuilder()
    .setTitle("Prize Claim Portal Ready")
    .setDescription("Your private prize claim portal is ready. Click the button below to continue.")
    .setColor(0x00ffae)
    .setFooter({ text: "GamersEra Prize System" });
}

function buildAdminClaimEmbed(claim) {
  return new EmbedBuilder()
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
      { name: "Region", value: safe(claim.region), inline: true },
      { name: "Delivery Method", value: safe(claim.delivery_method), inline: true },
      { name: "PayPal Form Required", value: safe(claim.paypal_form_required, "No"), inline: true },
      { name: "Tournament Feedback", value: safe(claim.tournament_feedback, "None provided"), inline: false },
      { name: "PayPal Form", value: safe(claim.paypal_form_url, "Not required"), inline: false }
    )
    .setFooter({ text: "GamersEra Admin Claim Log" })
    .setTimestamp();
}

function buildUserClaimEmbed(claim) {
  return new EmbedBuilder()
    .setTitle("Prize Claim Submitted")
    .setDescription("Thank you for participating in GamersEra. Your prize request has been received and is now under review.")
    .setColor(0x00ffae)
    .addFields(
      { name: "Claim Number", value: safe(claim.claim_number || claim.claim_id), inline: true },
      { name: "Status", value: safe(claim.status, "Pending Review"), inline: true },
      { name: "Prize", value: safe(claim.selected_prize), inline: true }
    )
    .setFooter({ text: "You will receive updates through Discord." })
    .setTimestamp();
}

function buildAdminButtons(claimId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`deliver_claim:${claimId}`).setLabel("Mark Delivered").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject_claim:${claimId}`).setLabel("Reject Claim").setStyle(ButtonStyle.Danger)
  );
}

function buildDeliveredDoneButton(claimId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`delivered_done:${claimId}`).setLabel("Delivered").setStyle(ButtonStyle.Success).setDisabled(true)
  );
}

function buildRejectedDoneButton(claimId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rejected_done:${claimId}`).setLabel("Rejected").setStyle(ButtonStyle.Danger).setDisabled(true)
  );
}

function buildDeliveredModal(claimId) {
  const modal = new ModalBuilder().setCustomId(`deliver_modal:${claimId}`).setTitle("Mark Claim Delivered");

  const proofInput = new TextInputBuilder()
    .setCustomId("delivery_proof_url")
    .setLabel("Delivery Proof URL")
    .setPlaceholder("Paste proof link, screenshot URL, gift card proof, etc.")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(proofInput));
  return modal;
}

function buildRejectModal(claimId) {
  const modal = new ModalBuilder().setCustomId(`reject_modal:${claimId}`).setTitle("Reject Claim");

  const reasonInput = new TextInputBuilder()
    .setCustomId("reject_reason")
    .setLabel("Rejection Reason")
    .setPlaceholder("Explain why this claim is rejected.")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  return modal;
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName("claimpanel").setDescription("Post the GamersEra prize claim button panel").toJSON(),
    new SlashCommandBuilder().setName("template-create").setDescription("Create a new prize template").toJSON(),
    new SlashCommandBuilder().setName("template-list").setDescription("List all prize templates").toJSON(),
    new SlashCommandBuilder()
      .setName("template-activate")
      .setDescription("Activate a prize template")
      .addStringOption(option =>
        option.setName("template_id").setDescription("Template ID, example: TPL-001").setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder().setName("active-template").setDescription("Show the currently active prize template").toJSON(),
    new SlashCommandBuilder().setName("prize-add").setDescription("Add a prize to a template").toJSON(),
    new SlashCommandBuilder()
      .setName("prize-list")
      .setDescription("List prizes for a template")
      .addStringOption(option =>
        option.setName("template_id").setDescription("Template ID, example: TPL-001").setRequired(true)
      )
      .toJSON()
  ];

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("Slash commands registered");
}

app.get("/", (req, res) => {
  res.json({ success: true, message: "GamersEra Prize Bot is running." });
});

app.post("/claim-submitted", async (req, res) => {
  try {
    const claim = req.body || {};
    const claimId = claim.claim_id || claim.claim_number;

    if (!claimId) {
      return res.status(400).json({ success: false, message: "Missing claim_id." });
    }

    const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);

    await adminChannel.send({
      embeds: [buildAdminClaimEmbed(claim)],
      components: [buildAdminButtons(claimId)]
    });

    try {
      const user = await client.users.fetch(String(claim.discord_user_id));
      await user.send({ embeds: [buildUserClaimEmbed(claim)] });
    } catch (dmErr) {
      console.error("Could not DM user:", dmErr);
    }

    return res.json({ success: true, message: "Claim embeds sent." });
  } catch (err) {
    console.error("claim-submitted error:", err);
    return res.status(500).json({ success: false, message: "Failed to send claim embeds." });
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

      if (interaction.commandName === "template-create") {
        const modal = new ModalBuilder().setCustomId("template_create_modal").setTitle("Create Template");

        const templateName = new TextInputBuilder().setCustomId("template_name").setLabel("Template Name").setStyle(TextInputStyle.Short).setRequired(true);
        const eventName = new TextInputBuilder().setCustomId("event_name").setLabel("Event Name").setStyle(TextInputStyle.Short).setRequired(true);
        const tournamentName = new TextInputBuilder().setCustomId("tournament_name").setLabel("Tournament Name").setStyle(TextInputStyle.Short).setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(templateName),
          new ActionRowBuilder().addComponents(eventName),
          new ActionRowBuilder().addComponents(tournamentName)
        );

        await interaction.showModal(modal);
        return;
      }

      if (interaction.commandName === "template-list") {
        await interaction.deferReply({ ephemeral: true });

        const result = await callN8n({ action: "get_templates" });

        return interaction.editReply({
          content: "Templates:\n```json\n" + JSON.stringify(result, null, 2).slice(0, 1800) + "\n```"
        });
      }

      if (interaction.commandName === "active-template") {
        await interaction.deferReply({ ephemeral: true });

        const result = await callN8n({ action: "get_active_template" });

        return interaction.editReply({
          content: "Active Template:\n```json\n" + JSON.stringify(result, null, 2).slice(0, 1800) + "\n```"
        });
      }

      if (interaction.commandName === "template-activate") {
        await interaction.deferReply({ ephemeral: true });

        const templateId = interaction.options.getString("template_id");

        const result = await callN8n({
          action: "activate_template",
          template_id: templateId
        });

        return interaction.editReply(
          result.success
            ? `✅ Activated template ${templateId}`
            : `❌ ${result.message || "Failed to activate template."}`
        );
      }

      if (interaction.commandName === "prize-list") {
        await interaction.deferReply({ ephemeral: true });

        const templateId = interaction.options.getString("template_id");

        const result = await callN8n({
          action: "get_prizes",
          template_id: templateId
        });

        return interaction.editReply({
          content: "Prizes:\n```json\n" + JSON.stringify(result, null, 2).slice(0, 1800) + "\n```"
        });
      }

      if (interaction.commandName === "prize-add") {
        const modal = new ModalBuilder().setCustomId("prize_add_modal").setTitle("Add Prize");

        const templateId = new TextInputBuilder().setCustomId("template_id").setLabel("Template ID").setStyle(TextInputStyle.Short).setRequired(true);
        const prizeName = new TextInputBuilder().setCustomId("prize_name").setLabel("Prize Name").setStyle(TextInputStyle.Short).setRequired(true);
        const category = new TextInputBuilder().setCustomId("category").setLabel("Category").setPlaceholder("Gift Card or PayPal").setStyle(TextInputStyle.Short).setRequired(true);
        const placementRole = new TextInputBuilder().setCustomId("placement_role").setLabel("Placement Role").setPlaceholder("1st Place / 2nd Place / 3rd Place").setStyle(TextInputStyle.Short).setRequired(true);
        const paypalRequired = new TextInputBuilder().setCustomId("paypal_form_required").setLabel("PayPal Form Required?").setPlaceholder("Yes or No").setStyle(TextInputStyle.Short).setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(templateId),
          new ActionRowBuilder().addComponents(prizeName),
          new ActionRowBuilder().addComponents(category),
          new ActionRowBuilder().addComponents(placementRole),
          new ActionRowBuilder().addComponents(paypalRequired)
        );

        await interaction.showModal(modal);
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "template_create_modal") {
        await interaction.deferReply({ ephemeral: true });

        const result = await callN8n({
          action: "create_template",
          template_name: interaction.fields.getTextInputValue("template_name"),
          event_name: interaction.fields.getTextInputValue("event_name"),
          tournament_name: interaction.fields.getTextInputValue("tournament_name")
        });

        return interaction.editReply(
          result.success
            ? `✅ Template created successfully.\nTemplate ID: ${result.template_id || result.active_template_id || "Check n8n response"}`
            : `❌ ${result.message || "Failed to create template."}`
        );
      }

      if (interaction.customId === "prize_add_modal") {
        await interaction.deferReply({ ephemeral: true });

        const result = await callN8n({
          action: "add_prize",
          template_id: interaction.fields.getTextInputValue("template_id"),
          prize_name: interaction.fields.getTextInputValue("prize_name"),
          category: interaction.fields.getTextInputValue("category"),
          placement_role: interaction.fields.getTextInputValue("placement_role"),
          membership_role: "Normal",
          paypal_form_required: interaction.fields.getTextInputValue("paypal_form_required"),
          stock_status: "Available"
        });

        return interaction.editReply(
          result.success
            ? `✅ Prize added successfully.\nPrize ID: ${result.item_id || result.prize_id || "Check n8n response"}`
            : `❌ ${result.message || "Failed to add prize."}`
        );
      }

      if (interaction.customId.startsWith("deliver_modal:")) {
        const claimId = interaction.customId.split(":")[1];
        const deliveryProofUrl = interaction.fields.getTextInputValue("delivery_proof_url");

        await interaction.deferReply({ ephemeral: true });

        const result = await callN8n({
          action: "mark_claim_delivered",
          claim_id: claimId,
          admin_id: String(interaction.user.id),
          admin_name: interaction.user.username,
          delivery_proof_url: deliveryProofUrl
        });

        if (!result.success) {
          return interaction.editReply(result.message || "Failed to mark claim as delivered.");
        }

        try {
          await interaction.message.edit({ components: [buildDeliveredDoneButton(claimId)] });
        } catch (err) {
          console.error("Failed to update delivered button:", err);
        }

        return interaction.editReply(`Claim ${claimId} marked as delivered.`);
      }

      if (interaction.customId.startsWith("reject_modal:")) {
        const claimId = interaction.customId.split(":")[1];
        const reason = interaction.fields.getTextInputValue("reject_reason");

        await interaction.deferReply({ ephemeral: true });

        const result = await callN8n({
          action: "reject_claim",
          claim_id: claimId,
          admin_id: String(interaction.user.id),
          admin_name: interaction.user.username,
          reason
        });

        if (!result.success) {
          return interaction.editReply(result.message || "Failed to reject claim.");
        }

        try {
          await interaction.message.edit({ components: [buildRejectedDoneButton(claimId)] });
        } catch (err) {
          console.error("Failed to update rejected button:", err);
        }

        return interaction.editReply(`Claim ${claimId} rejected.`);
      }
    }

    if (!interaction.isButton()) return;

    if (interaction.customId === "claim_prize") {
      await interaction.deferReply({ ephemeral: true });

      const member = await interaction.guild.members.fetch(interaction.user.id);

      const roleIdsText = member.roles.cache.map((role) => String(role.id)).join(",");

      const result = await callN8n({
        action: "create_claim_token",
        discord_user_id: String(interaction.user.id),
        discord_username: interaction.user.username,
        role_ids_text: roleIdsText
      });

      if (!result.success || !result.claim_url) {
        return interaction.editReply(result.message || "Failed to create your prize claim link.");
      }

      const claimButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Open Prize Claim Portal").setStyle(ButtonStyle.Link).setURL(result.claim_url)
      );

      return interaction.editReply({
        embeds: [buildClaimReadyEmbed()],
        components: [claimButton]
      });
    }

    if (interaction.customId.startsWith("deliver_claim:")) {
      const claimId = interaction.customId.split(":")[1];
      await interaction.showModal(buildDeliveredModal(claimId));
      return;
    }

    if (interaction.customId.startsWith("reject_claim:")) {
      const claimId = interaction.customId.split(":")[1];
      await interaction.showModal(buildRejectModal(claimId));
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

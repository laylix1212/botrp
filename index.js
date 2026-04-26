const {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});

// ─── Config ───────────────────────────────────────────────────────────────────
const TARGET_GUILD_ID       = '1497882563891564599';
const WELCOME_CHANNEL_ID    = '1497903862886174832';
const RULES_CHANNEL_ID      = '1497904140498632824';
const TRANSCRIPT_CHANNEL_ID = '1497923167686230076';
const VERSION               = '1.0';

const ROLE_SUPPORT          = '1497907162158989352';

const ROLES_STAFF_ONLY      = [
  '1497890931536433172',
  '1497891406008680539',
  '1497891482743472158',
  '1497916279510536246',
];

const CATEGORIES = {
  question:      '1497906676324634756',
  report_joueur: '1497906704334061574',
  report_staff:  '1497906721509740544',
  demande_role:  '1497906794000023603',
};

const TYPE_CONFIG = {
  question:      { label: 'Question',       emoji: '❓', staffOnly: false },
  report_joueur: { label: 'Report Joueur',   emoji: '⚠️', staffOnly: false },
  report_staff:  { label: 'Report Staff',    emoji: '🔒', staffOnly: true  },
  demande_role:  { label: 'Demande de Rôle', emoji: '📝', staffOnly: true  },
};

// ticketData : clé = channelId
const ticketData = new Map();

// ─── Slash Commands ───────────────────────────────────────────────────────────
const commands = [
  { name: 'ping',        description: 'Vérifie si le bot est en ligne et affiche la latence.' },
  { name: 'panel-setup', description: 'Envoie le panel de tickets dans ce salon.' },
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('📡 Enregistrement des slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, TARGET_GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands enregistrées !');
  } catch (error) {
    console.error('❌ Erreur slash commands :', error);
  }
}

// ─── Statut alternant ─────────────────────────────────────────────────────────
let statusIndex = 0;
let cachedMemberCount = null;

async function fetchMemberCount() {
  try {
    const guild = await client.guilds.fetch(TARGET_GUILD_ID);
    cachedMemberCount = guild.memberCount;
  } catch (error) {
    console.error('❌ Erreur memberCount :', error);
  }
}

function updateStatus() {
  const statuses = [
    `${cachedMemberCount ?? '...'} membres`,
    `Version ${VERSION}`,
  ];
  const text = statuses[statusIndex % statuses.length];
  statusIndex++;
  client.user.setPresence({
    activities: [{ name: text, type: ActivityType.Watching }],
    status: 'online',
  });
  console.log(`🔄 Statut : ${text}`);
}

// ─── Bienvenue ────────────────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  try {
    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
    if (!channel) return;
    const memberCount = member.guild.memberCount;
    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('Bienvenue sur le serveur !')
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription(
        `Heureux de t'accueillir parmi nous, ${member} ! 👋\n\n` +
        `Tu es notre **${memberCount}ème membre** à nous rejoindre. 🎉\n\n` +
        `Avant de commencer, pense à lire le <#${RULES_CHANNEL_ID}> pour profiter du serveur dans les meilleures conditions. 📋`
      )
      .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() })
      .setTimestamp();
    await channel.send({ content: `${member}`, embeds: [embed] });
  } catch (error) {
    console.error('❌ Erreur bienvenue :', error);
  }
});

// ─── Création d'un ticket ─────────────────────────────────────────────────────
async function createTicket(interaction, type) {
  await interaction.deferReply({ ephemeral: true });

  const guild      = interaction.guild;
  const member     = interaction.member;
  const config     = TYPE_CONFIG[type];
  const categoryId = CATEGORIES[type];

  // Anti-doublon
  const existing = guild.channels.cache.find(
    (c) => c.topic === `opener:${member.id}:${type}`
  );
  if (existing) {
    return interaction.editReply({ content: `Tu as déjà un ticket ouvert : <#${existing.id}>` });
  }

  // Permissions
  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: member.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];

  if (config.staffOnly) {
    for (const roleId of ROLES_STAFF_ONLY) {
      permissionOverwrites.push({
        id: roleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      });
    }
  } else {
    permissionOverwrites.push({
      id: ROLE_SUPPORT,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  const ticketChannel = await guild.channels.create({
    name: `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: `opener:${member.id}:${type}`,
    permissionOverwrites,
  });

  ticketData.set(ticketChannel.id, {
    openerId:        member.id,
    openerTag:       member.user.tag,
    openerCreatedAt: member.user.createdAt,
    openerJoinedAt:  member.joinedAt,
    openerAvatar:    member.user.displayAvatarURL({ dynamic: true, size: 256 }),
    staffId:         null,
    staffTag:        null,
    type,
    label:           config.label,
    openedAt:        new Date(),
  });

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle(`${config.emoji} Ticket — ${config.label}`)
    .setDescription(
      `Bienvenue ${member}, ton ticket a bien été créé. 👋\n\n` +
      `Merci de **ne pas mentionner** les membres du staff et de **patienter**, ils reviendront vers toi dès que possible.\n\n` +
      `Décris ta demande avec un maximum de détails pour obtenir une réponse rapide.`
    )
    .setFooter({ text: guild.name, iconURL: guild.iconURL() })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('Prendre en charge')
      .setEmoji('✋')
      .setStyle(ButtonStyle.Primary),
  );

  await ticketChannel.send({
    content: `${member} — <@&${ROLE_SUPPORT}>`,
    embeds: [embed],
    components: [row],
  });

  await interaction.editReply({ content: `Ton ticket a été créé : <#${ticketChannel.id}> ✅` });
  console.log(`🎫 Ticket "${config.label}" ouvert par ${member.user.tag}`);
}

// ─── Transcript ───────────────────────────────────────────────────────────────
async function sendTranscript(guild, channel, data, closedBy) {
  const transcriptChannel = await guild.channels.fetch(TRANSCRIPT_CHANNEL_ID).catch(() => null);
  if (!transcriptChannel) return;

  // Récupérer tous les messages
  let allMessages = [];
  let lastId = null;
  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;
    allMessages = allMessages.concat([...batch.values()]);
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }
  allMessages.reverse();

  // Infos opener
  const opener = await guild.members.fetch(data.openerId).catch(() => null);
  const openerRoles = opener
    ? opener.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.name).join(', ') || 'Aucun'
    : 'Introuvable';

  // Infos staff
  const staffMember = data.staffId ? await guild.members.fetch(data.staffId).catch(() => null) : null;
  const staffRoles  = staffMember
    ? staffMember.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.name).join(', ') || 'Aucun'
    : 'N/A';

  const closedAt   = new Date();
  const durationMs = closedAt - data.openedAt;
  const dH         = Math.floor(durationMs / 3600000);
  const dM         = Math.floor((durationMs % 3600000) / 60000);
  const dS         = Math.floor((durationMs % 60000) / 1000);
  const durationStr = `${dH}h ${dM}m ${dS}s`;

  const fmt = (d) => d ? d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : 'Inconnu';
  const SEP  = '='.repeat(62);
  const sep2 = '-'.repeat(62);

  // ── Fichier .txt ──────────────────────────────────────────────────────────
  let txt = '';
  txt += `${SEP}\n`;
  txt += `         TRANSCRIPT DU TICKET — ${data.label.toUpperCase()}\n`;
  txt += `${SEP}\n\n`;

  txt += `-- INFORMATIONS GÉNÉRALES ${sep2.slice(26)}\n`;
  txt += `  Salon           : #${channel.name} (${channel.id})\n`;
  txt += `  Type            : ${data.label}\n`;
  txt += `  Ticket ID       : ${channel.id}\n`;
  txt += `  Ouvert le       : ${fmt(data.openedAt)}\n`;
  txt += `  Fermé le        : ${fmt(closedAt)}\n`;
  txt += `  Durée           : ${durationStr}\n`;
  txt += `  Nb de messages  : ${allMessages.length}\n\n`;

  txt += `-- MEMBRE ${sep2.slice(10)}\n`;
  txt += `  Nom             : ${data.openerTag}\n`;
  txt += `  ID              : ${data.openerId}\n`;
  txt += `  Compte créé le  : ${fmt(data.openerCreatedAt)}\n`;
  txt += `  A rejoint le    : ${fmt(data.openerJoinedAt)}\n`;
  txt += `  Rôles           : ${openerRoles}\n\n`;

  txt += `-- STAFF EN CHARGE ${sep2.slice(18)}\n`;
  txt += `  Nom             : ${data.staffTag ?? 'Non pris en charge'}\n`;
  txt += `  ID              : ${data.staffId  ?? 'N/A'}\n`;
  txt += `  Rôles           : ${staffRoles}\n`;
  txt += `  Fermé par       : ${closedBy.tag} (${closedBy.id})\n\n`;

  txt += `-- CONVERSATION ${sep2.slice(15)}\n\n`;

  for (const m of allMessages) {
    txt += `[${fmt(m.createdAt)}] ${m.author.tag} (ID: ${m.author.id})\n`;
    if (m.content)            txt += `  ${m.content}\n`;
    if (m.embeds.length > 0)  txt += `  [${m.embeds.length} embed(s)]\n`;
    m.attachments.forEach((a) => { txt += `  Pièce jointe : ${a.url}\n`; });
    txt += '\n';
  }

  txt += `${SEP}\n`;
  txt += `  Généré le : ${fmt(closedAt)} — ${guild.name}\n`;
  txt += `${SEP}\n`;

  const fileBuffer = Buffer.from(txt, 'utf-8');
  const fileName   = `transcript-${data.label.toLowerCase().replace(/\s+/g, '-')}-${channel.name}.txt`;

  // ── Embed résumé épuré ────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(0xC0392B)
    .setTitle(`Ticket fermé — Ticket ${data.label}`)
    .addFields(
      {
        name:   'Salon',
        value:  `#${channel.name} (\`${channel.id}\`)`,
        inline: false,
      },
      {
        name:   'Ouvert par',
        value:  `${data.openerTag}\n• ID : \`${data.openerId}\``,
        inline: true,
      },
      {
        name:   'Fermé par',
        value:  `${closedBy.tag}\n• ID : \`${closedBy.id}\``,
        inline: true,
      },
      {
        name:   'Pris en charge par',
        value:  data.staffTag ? `${data.staffTag}\n• ID : \`${data.staffId}\`` : 'Personne',
        inline: true,
      },
      {
        name:   'Ouvert le',
        value:  fmt(data.openedAt),
        inline: true,
      },
      {
        name:   'Durée',
        value:  durationStr,
        inline: true,
      },
      {
        name:   'Messages',
        value:  `${allMessages.length}`,
        inline: true,
      },
    )
    .setFooter({ text: `Ticket ID : ${channel.id}`, iconURL: guild.iconURL() })
    .setTimestamp();

  await transcriptChannel.send({
    embeds: [embed],
    files: [{ attachment: fileBuffer, name: fileName }],
  });

  console.log(`📁 Transcript envoyé pour le ticket ${channel.name}`);
}

// ─── Events ───────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
  await registerCommands();
  await fetchMemberCount();
  updateStatus();
  setInterval(fetchMemberCount, 30_000);
  setInterval(updateStatus, 5_000);
});

client.on('interactionCreate', async (interaction) => {

  // ── Slash commands ──
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'ping') {
      const latency = Math.round(client.ws.ping);
      return interaction.reply({
        content: `Pong ! Latence : **${latency}ms**`,
        ephemeral: true,
      });
    }

    if (interaction.commandName === 'panel-setup') {
      const embed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle('🎫 Support — Ouvrir un ticket')
        .setDescription(
          'Besoin d\'aide ? Sélectionne le type de ticket dans le menu ci-dessous.\n\n' +
          '❓ **Question** — Tu as une question générale sur le serveur ou le jeu.\n\n' +
          '⚠️ **Report Joueur** — Tu souhaites signaler le comportement d\'un joueur.\n\n' +
          '🔒 **Report Staff** — Tu souhaites signaler un membre du staff. *(confidentiel)*\n\n' +
          '📝 **Demande de Rôle** — Tu souhaites faire une demande de rôle spécifique.'
        )
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_select')
          .setPlaceholder('Sélectionne un type de ticket...')
          .addOptions([
            { label: 'Question',        description: 'Poser une question générale',               value: 'question',      emoji: '❓' },
            { label: 'Report Joueur',   description: 'Signaler un joueur',                        value: 'report_joueur', emoji: '⚠️' },
            { label: 'Report Staff',    description: 'Signaler un membre du staff (confidentiel)', value: 'report_staff',  emoji: '🔒' },
            { label: 'Demande de Rôle', description: 'Faire une demande de rôle',                 value: 'demande_role',  emoji: '📝' },
          ])
      );

      await interaction.channel.send({ embeds: [embed], components: [menu] });
      return interaction.reply({ content: 'Panel envoyé ✅', ephemeral: true });
    }
  }

  // ── Select menu ticket ──
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
    return createTicket(interaction, interaction.values[0]);
  }

  // ── Boutons ──
  if (interaction.isButton()) {

    // ── Prendre en charge ──
    if (interaction.customId === 'ticket_claim') {
      const channel = interaction.channel;
      const member  = interaction.member;
      const data    = ticketData.get(channel.id);

      if (!member.roles.cache.has(ROLE_SUPPORT)) {
        return interaction.reply({
          content: '❌ Seul le rôle **Support Ticket** peut prendre en charge un ticket.',
          ephemeral: true,
        });
      }

      if (data && data.staffId) {
        return interaction.reply({
          content: `❌ Ce ticket est déjà pris en charge par <@${data.staffId}>.`,
          ephemeral: true,
        });
      }

      if (data) {
        data.staffId  = member.id;
        data.staffTag = member.user.tag;
      }

      await channel.permissionOverwrites.edit(ROLE_SUPPORT, { SendMessages: false });
      await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel(`Pris en charge par ${member.user.username}`)
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Fermer le ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger),
      );

      await interaction.message.edit({ components: [disabledRow] });

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setDescription(
              `✋ **${member.user.tag}** a pris ce ticket en charge.\n\n` +
              `Seuls ${member} et le membre ayant ouvert le ticket peuvent désormais écrire.`
            )
            .setTimestamp(),
        ],
      });

      return interaction.reply({ content: '✅ Tu as pris ce ticket en charge.', ephemeral: true });
    }

    // ── Fermer le ticket ──
    if (interaction.customId === 'ticket_close') {
      const channel = interaction.channel;
      const member  = interaction.member;
      const data    = ticketData.get(channel.id);

      if (!data || data.staffId !== member.id) {
        return interaction.reply({
          content: '❌ Seul le membre du staff ayant pris ce ticket en charge peut le fermer.',
          ephemeral: true,
        });
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xC0392B)
            .setDescription(
              '🔒 Ticket en cours de fermeture...\n\n' +
              'Le transcript est en cours de génération, le salon sera supprimé dans **5 secondes**.'
            ),
        ],
      });

      await sendTranscript(interaction.guild, channel, data, member.user);

      setTimeout(async () => {
        await channel.delete().catch(() => null);
        ticketData.delete(channel.id);
      }, 5000);
    }
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

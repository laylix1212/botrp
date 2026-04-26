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
const TARGET_GUILD_ID     = '1497882563891564599';
const WELCOME_CHANNEL_ID  = '1497903862886174832';
const RULES_CHANNEL_ID    = '1497904140498632824';
const TRANSCRIPT_CHANNEL_ID = '1497923167686230076';
const VERSION             = '1.0';

const ROLE_SUPPORT        = '1497907162158989352';

const ROLES_STAFF_ONLY    = [
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
  question:      { label: 'Question',         emoji: '❓', staffOnly: false },
  report_joueur: { label: 'Report Joueur',     emoji: '⚠️', staffOnly: false },
  report_staff:  { label: 'Report Staff',      emoji: '🔒', staffOnly: true  },
  demande_role:  { label: 'Demande de Rôle',   emoji: '📝', staffOnly: true  },
};

// ticketData stocke les infos en mémoire : clé = channelId
// { openerId, openerTag, openerCreatedAt, staffId, staffTag, type, openedAt }
const ticketData = new Map();

// ─── Slash Commands ───────────────────────────────────────────────────────────
const commands = [
  {
    name: 'ping',
    description: 'Vérifie si le bot est en ligne et affiche la latence.',
  },
  {
    name: 'panel-setup',
    description: '📋 Envoie le panel de tickets dans ce salon.',
  },
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

  const guild  = interaction.guild;
  const member = interaction.member;
  const config = TYPE_CONFIG[type];
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

  // Stocker les données du ticket
  ticketData.set(ticketChannel.id, {
    openerId: member.id,
    openerTag: member.user.tag,
    openerCreatedAt: member.user.createdAt,
    openerJoinedAt: member.joinedAt,
    openerAvatar: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
    staffId: null,
    staffTag: null,
    type,
    label: config.label,
    openedAt: new Date(),
  });

  // Embed d'ouverture + bouton "Prendre en charge"
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

  // Formater la conversation
  const conversation = allMessages
    .map((m) => {
      const time = m.createdAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
      const attachments = m.attachments.size > 0
        ? `\n    📎 Pièces jointes : ${m.attachments.map((a) => a.url).join(', ')}`
        : '';
      const embeds = m.embeds.length > 0 ? `\n    📋 [Embed présent]` : '';
      return `[${time}] ${m.author.tag} : ${m.content || '*(aucun texte)*'}${attachments}${embeds}`;
    })
    .join('\n');

  // Infos opener
  const opener = await guild.members.fetch(data.openerId).catch(() => null);
  const openerRoles = opener
    ? opener.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.name).join(', ') || 'Aucun'
    : 'Introuvable';

  // Infos staff
  const staffMember = data.staffId
    ? await guild.members.fetch(data.staffId).catch(() => null)
    : null;
  const staffRoles = staffMember
    ? staffMember.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.name).join(', ') || 'Aucun'
    : 'N/A';

  const closedAt = new Date();
  const duration = Math.round((closedAt - data.openedAt) / 1000 / 60);

  const embed = new EmbedBuilder()
    .setColor(0xC0392B)
    .setTitle(`📁 Transcript — ${data.label}`)
    .setThumbnail(data.openerAvatar)
    .addFields(
      // ── Infos ticket ──
      { name: '━━━━━━━━━━━━━━━━━━━━━━ 🎫 Ticket', value: '\u200b', inline: false },
      { name: 'Type',            value: `${data.label}`,                                          inline: true },
      { name: 'Ouvert le',       value: data.openedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }), inline: true },
      { name: 'Fermé le',        value: closedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),       inline: true },
      { name: 'Durée',           value: `${duration} minute(s)`,                                  inline: true },
      { name: 'Messages',        value: `${allMessages.length}`,                                  inline: true },
      { name: 'Fermé par',       value: closedBy.tag,                                             inline: true },

      // ── Infos membre ──
      { name: '━━━━━━━━━━━━━━━━━━━━━━ 👤 Membre', value: '\u200b', inline: false },
      { name: 'Nom',             value: data.openerTag,                                           inline: true },
      { name: 'ID',              value: data.openerId,                                            inline: true },
      { name: 'Compte créé le',  value: data.openerCreatedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }), inline: true },
      { name: 'A rejoint le',    value: data.openerJoinedAt
          ? data.openerJoinedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
          : 'Inconnu',                                                                             inline: true },
      { name: 'Rôles',           value: openerRoles,                                              inline: false },

      // ── Infos staff ──
      { name: '━━━━━━━━━━━━━━━━━━━━━━ 🛡️ Staff en charge', value: '\u200b', inline: false },
      { name: 'Nom',             value: data.staffTag  ?? 'Non pris en charge',                  inline: true },
      { name: 'ID',              value: data.staffId   ?? 'N/A',                                 inline: true },
      { name: 'Rôles',           value: staffRoles,                                              inline: false },

      // ── Conversation ──
      { name: '━━━━━━━━━━━━━━━━━━━━━━ 💬 Conversation', value: '\u200b', inline: false },
    )
    .setFooter({ text: guild.name, iconURL: guild.iconURL() })
    .setTimestamp();

  // La conversation peut être longue : on la coupe en champs de 1024 chars
  const chunks = [];
  let current = '';
  for (const line of conversation.split('\n')) {
    if ((current + '\n' + line).length > 1020) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current) chunks.push(current);

  for (let i = 0; i < chunks.length; i++) {
    embed.addFields({
      name: i === 0 ? 'Messages' : '\u200b',
      value: `\`\`\`${chunks[i]}\`\`\``,
      inline: false,
    });
  }

  await transcriptChannel.send({ embeds: [embed] });
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
          'Besoin d\'aide ? Sélectionne le type de ticket qui correspond à ta demande dans le menu ci-dessous.\n\n' +
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
            { label: 'Question',        description: 'Poser une question générale',              value: 'question',      emoji: '❓' },
            { label: 'Report Joueur',   description: 'Signaler un joueur',                       value: 'report_joueur', emoji: '⚠️' },
            { label: 'Report Staff',    description: 'Signaler un membre du staff (confidentiel)', value: 'report_staff',  emoji: '🔒' },
            { label: 'Demande de Rôle', description: 'Faire une demande de rôle',                value: 'demande_role',  emoji: '📝' },
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

      // Seul le rôle Support Ticket peut prendre en charge
      if (!member.roles.cache.has(ROLE_SUPPORT)) {
        return interaction.reply({
          content: '❌ Seul le rôle **Support Ticket** peut prendre en charge un ticket.',
          ephemeral: true,
        });
      }

      // Déjà pris en charge ?
      if (data && data.staffId) {
        return interaction.reply({
          content: `❌ Ce ticket est déjà pris en charge par <@${data.staffId}>.`,
          ephemeral: true,
        });
      }

      // Mettre à jour les données
      if (data) {
        data.staffId  = member.id;
        data.staffTag = member.user.tag;
      }

      // Retirer SendMessages à tous les autres membres du rôle Support Ticket
      // (on le fait en retirant la permission au rôle et en l'ajoutant uniquement au staff qui prend)
      await channel.permissionOverwrites.edit(ROLE_SUPPORT, {
        SendMessages: false,
      });
      await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      // Mettre à jour l'embed du message original (désactiver le bouton)
      const originalMessage = interaction.message;
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

      await originalMessage.edit({ components: [disabledRow] });

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setDescription(`✋ **${member.user.tag}** a pris ce ticket en charge.\n\nSeuls ${member} et le membre ayant ouvert le ticket peuvent désormais écrire.`)
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

      // Seul le staff qui a pris le ticket peut fermer
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
            .setDescription('🔒 Ticket en cours de fermeture...\n\nLe transcript est en cours de génération, le salon sera supprimé dans **5 secondes**.'),
        ],
      });

      // Envoyer le transcript
      await sendTranscript(interaction.guild, channel, data, member.user);

      // Supprimer après 5 secondes
      setTimeout(async () => {
        await channel.delete().catch(() => null);
        ticketData.delete(channel.id);
      }, 5000);
    }
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

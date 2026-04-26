const {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// ─── Config ───────────────────────────────────────────────────────────────────
const TARGET_GUILD_ID    = '1497882563891564599';
const WELCOME_CHANNEL_ID = '1497903862886174832';
const RULES_CHANNEL_ID   = '1497904140498632824';
const VERSION            = '1.0';

const ROLE_SUPPORT       = '1497907162158989352';

// Rôles avec accès aux tickets report staff & demande de rôle
const ROLES_STAFF_ONLY   = [
  '1497890931536433172',
  '1497891406008680539',
  '1497891482743472158',
  '1497916279510536246',
];

// Catégories des tickets
const CATEGORIES = {
  question:      '1497906676324634756',
  report_joueur: '1497906704334061574',
  report_staff:  '1497906721509740544',
  demande_role:  '1497906794000023603',
};

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

// ─── Register Slash Commands ──────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('📡 Enregistrement des slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, TARGET_GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands enregistrées avec succès !');
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement des commandes :', error);
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
    console.error('❌ Erreur lors de la récupération des membres :', error);
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
    console.log(`👋 Bienvenue envoyé pour ${member.user.tag} (membre n°${memberCount})`);
  } catch (error) {
    console.error('❌ Erreur bienvenue :', error);
  }
});

// ─── Création d'un ticket ─────────────────────────────────────────────────────
async function createTicket(interaction, type) {
  const guild = interaction.guild;
  const member = interaction.member;

  const typeConfig = {
    question: {
      label: 'Question',
      emoji: '❓',
      category: CATEGORIES.question,
      staffOnly: false,
    },
    report_joueur: {
      label: 'Report Joueur',
      emoji: '⚠️',
      category: CATEGORIES.report_joueur,
      staffOnly: false,
    },
    report_staff: {
      label: 'Report Staff',
      emoji: '🔒',
      category: CATEGORIES.report_staff,
      staffOnly: true,
    },
    demande_role: {
      label: 'Demande de Rôle',
      emoji: '📝',
      category: CATEGORIES.demande_role,
      staffOnly: true,
    },
  };

  const config = typeConfig[type];

  // Vérifie si un ticket existe déjà pour ce membre
  const existing = guild.channels.cache.find(
    (c) => c.name === `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}` && c.parentId === config.category
  );
  if (existing) {
    return interaction.reply({
      content: `Tu as déjà un ticket ouvert : <#${existing.id}>`,
      ephemeral: true,
    });
  }

  // Construction des permissions du salon
  const permissionOverwrites = [
    {
      // @everyone n'a pas accès
      id: guild.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      // Le membre qui ouvre le ticket a accès
      id: member.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];

  if (config.staffOnly) {
    // Seuls les 4 rôles staff ont accès (pas le support ticket)
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
    // Le rôle Support Ticket a accès
    permissionOverwrites.push({
      id: ROLE_SUPPORT,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  // Création du salon
  const ticketChannel = await guild.channels.create({
    name: `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    type: ChannelType.GuildText,
    parent: config.category,
    permissionOverwrites,
  });

  // Embed d'ouverture du ticket
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

  // Mentions dans le message
  const mentionSupport = `<@&${ROLE_SUPPORT}>`;

  await ticketChannel.send({
    content: `${member} — ${mentionSupport}`,
    embeds: [embed],
  });

  await interaction.reply({
    content: `Ton ticket a été créé : <#${ticketChannel.id}> ✅`,
    ephemeral: true,
  });

  console.log(`🎫 Ticket "${config.label}" ouvert par ${member.user.tag}`);
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
            {
              label: 'Question',
              description: 'Poser une question générale',
              value: 'question',
              emoji: '❓',
            },
            {
              label: 'Report Joueur',
              description: 'Signaler un joueur',
              value: 'report_joueur',
              emoji: '⚠️',
            },
            {
              label: 'Report Staff',
              description: 'Signaler un membre du staff (confidentiel)',
              value: 'report_staff',
              emoji: '🔒',
            },
            {
              label: 'Demande de Rôle',
              description: 'Faire une demande de rôle',
              value: 'demande_role',
              emoji: '📝',
            },
          ])
      );

      await interaction.channel.send({ embeds: [embed], components: [menu] });
      await interaction.reply({ content: 'Panel envoyé ✅', ephemeral: true });
    }
  }

  // ── Select menu ticket ──
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
    const type = interaction.values[0];
    await createTicket(interaction, type);
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

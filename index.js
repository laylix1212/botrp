const { Client, GatewayIntentBits, ActivityType, REST, Routes } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const TARGET_GUILD_ID = '1497882563891564599';
const VERSION = '1.0';

// ─── Slash Commands ───────────────────────────────────────────────────────────
const commands = [
  {
    name: 'ping',
    description: 'Vérifie si le bot est en ligne et affiche la latence.',
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
    console.error(error);
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
    `${cachedMemberCount ?? '...'} Membres`,
    `Version ${VERSION}`,
  ];

  const text = statuses[statusIndex % statuses.length];
  statusIndex++;

  client.user.setPresence({
    activities: [
      {
        name: text,
        type: ActivityType.Watching,
      },
    ],
    status: 'online',
  });

  console.log(`🔄 Statut : ${text}`);
}

// ─── Events ───────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);

  await registerCommands();
  await fetchMemberCount();
  updateStatus();

  // Mise à jour du nombre de membres toutes les 30s
  setInterval(fetchMemberCount, 30_000);

  // Switch du statut toutes les 5 secondes
  setInterval(updateStatus, 5_000);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'ping') {
    const latency = Math.round(client.ws.ping);
    await interaction.reply({
      content: `Pong ! Latence : **${latency}ms**`,
      ephemeral: true,
    });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

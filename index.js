require('dotenv').config();
const fs = require('fs');
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
} = require('discord.js');

// ---- Config (voir fichier .env) ----
const {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID, // optionnel : si fourni, la commande slash est dispo instantanément sur ce serveur
    CHANNEL_ID,
    PALWORLD_API_URL,   // ex: http://IP:PORT/v1/api
    PALWORLD_ADMIN_PASSWORD,
    REFRESH_SECONDS = 60,
} = process.env;

const STATE_FILE = './message-id.json';

// ---- Discord client ----
const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

// ---- Appel générique à l'API REST Palworld (Basic Auth) avec retry automatique ----
async function palworldGetRaw(endpoint) {
    const auth = Buffer.from(`admin:${PALWORLD_ADMIN_PASSWORD}`).toString('base64');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(`${PALWORLD_API_URL}${endpoint}`, {
            headers: { Authorization: `Basic ${auth}` },
            signal: controller.signal,
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        return await res.json();
    } finally {
        clearTimeout(timeout);
    }
}

async function palworldGet(endpoint, { retries = 3, delayMs = 2000 } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await palworldGetRaw(endpoint);
        } catch (err) {
            lastErr = err;
            console.warn(`⚠️  Tentative ${attempt}/${retries} échouée sur ${endpoint} : ${err.message}`);
            if (attempt < retries) {
                await new Promise((r) => setTimeout(r, delayMs * attempt)); // backoff progressif
            }
        }
    }
    throw lastErr;
}

// ---- Couleur / statut visuel selon le taux de remplissage ----
function getStatusColor(current, max) {
    const ratio = max > 0 ? current / max : 0;
    if (ratio >= 0.9) return 0xe74c3c;   // rouge : presque plein
    if (ratio >= 0.5) return 0xf39c12;   // orange : bien rempli
    return 0x2ecc71;                     // vert : tranquille
}

// ---- Construction de l'embed principal (statut serveur) ----
function buildEmbed(info, metrics) {
    const uptimeH = Math.floor(metrics.uptime / 3600);
    const uptimeM = Math.floor((metrics.uptime % 3600) / 60);
    const color = getStatusColor(metrics.currentplayernum, metrics.maxplayernum);

    return new EmbedBuilder()
        .setTitle(`🐾 ${info.servername || 'Serveur Palworld'}`)
        .setDescription(`🟢 **En ligne**${info.description ? `\n${info.description}` : ''}`)
        .addFields(
            { name: '👥 Joueurs', value: `${metrics.currentplayernum} / ${metrics.maxplayernum}`, inline: true },
            { name: '📅 Jour in-game', value: `${metrics.days}`, inline: true },
            { name: '🏕️ Bases', value: `${metrics.basecampnum}`, inline: true },
            { name: '⚡ FPS serveur', value: `${metrics.serverfps}`, inline: true },
            { name: '⏱️ Uptime', value: `${uptimeH}h ${uptimeM}m`, inline: true },
            { name: '🔧 Version', value: `${info.version || 'N/A'}`, inline: true },
        )
        .setColor(color)
        .setFooter({ text: 'Dernière mise à jour' })
        .setTimestamp();
}

// ---- Embed "hors ligne" quand l'API ne répond plus ----
function buildOfflineEmbed(errMessage) {
    return new EmbedBuilder()
        .setTitle('🐾 Serveur Palworld')
        .setDescription(`🔴 **Hors ligne / injoignable**\n\`${errMessage}\``)
        .setColor(0x992d22)
        .setFooter({ text: 'Dernière tentative' })
        .setTimestamp();
}

// ---- Récupère (ou crée) le message à éditer ----
async function getOrCreateMessage(channel) {
    if (fs.existsSync(STATE_FILE)) {
        const { messageId } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        try {
            return await channel.messages.fetch(messageId);
        } catch {
            console.warn('Message précédent introuvable, un nouveau va être créé.');
        }
    }
    const msg = await channel.send({ content: 'Initialisation du statut du serveur...' });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ messageId: msg.id }));
    return msg;
}

// ---- Boucle de mise à jour du message principal ----
async function updateLoop(message) {
    try {
        const [info, metrics] = await Promise.all([
            palworldGet('/info'),
            palworldGet('/metrics'),
        ]);
        const embed = buildEmbed(info, metrics);
        await message.edit({ content: null, embeds: [embed] }); // .edit() = pas de notification
    } catch (err) {
        console.error('Échec final après retries :', err.message);
        await message.edit({ content: null, embeds: [buildOfflineEmbed(err.message)] }).catch(() => { });
    }
}

// ---- Commande slash /players ----
const commands = [
    new SlashCommandBuilder()
        .setName('players')
        .setDescription('Affiche la liste des joueurs actuellement connectés (visible que par toi)'),
].map((c) => c.toJSON());

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        if (GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log('Commande /players enregistrée (guild, instantané).');
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
            console.log('Commande /players enregistrée (globale, peut prendre jusqu\'à 1h).');
        }
    } catch (err) {
        console.error('Erreur enregistrement des commandes slash :', err);
    }
}

function buildPlayersEmbed(players) {
    if (!players || players.length === 0) {
        return new EmbedBuilder()
            .setTitle('👥 Joueurs connectés')
            .setDescription('Aucun joueur connecté actuellement.')
            .setColor(0x95a5a6);
    }

    const lines = players.map((p, i) => {
        const name = p.name || 'Inconnu';
        const level = p.level !== undefined ? ` (Niv. ${p.level})` : '';
        const ping = p.ping !== undefined ? ` — ${Math.round(p.ping)}ms` : '';
        return `**${i + 1}.** ${name}${level}${ping}`;
    });

    return new EmbedBuilder()
        .setTitle('👥 Joueurs connectés')
        .setDescription(lines.join('\n'))
        .setColor(0x3498db)
        .setFooter({ text: `${players.length} joueur(s) en ligne` })
        .setTimestamp();
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'players') return;

    await interaction.deferReply({ ephemeral: true }); // visible que par l'utilisateur

    try {
        const data = await palworldGet('/players');
        const players = data.players || data; // selon la forme exacte renvoyée par l'API
        const embed = buildPlayersEmbed(players);
        await interaction.editReply({ embeds: [embed] });
    } catch (err) {
        await interaction.editReply({
            content: `⚠️ Impossible de récupérer la liste des joueurs (${err.message})`,
        });
    }
});

client.once('clientReady', async () => {
    console.log(`Connecté en tant que ${client.user.tag}`);

    await registerCommands();

    const channel = await client.channels.fetch(CHANNEL_ID);
    const message = await getOrCreateMessage(channel);

    updateLoop(message);
    setInterval(() => updateLoop(message), Number(REFRESH_SECONDS) * 1000);
});

client.login(DISCORD_TOKEN);
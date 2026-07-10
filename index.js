require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// ---- Config (voir fichier .env) ----
const {
    DISCORD_TOKEN,
    CHANNEL_ID,
    PALWORLD_API_URL,   // ex: http://12.34.56.78:8212/v1/api
    PALWORLD_ADMIN_PASSWORD,
    REFRESH_SECONDS = 60,
} = process.env;

const STATE_FILE = './message-id.json';

// ---- Discord client ----
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// ---- Appel générique à l'API REST Palworld (Basic Auth) ----
async function palworldGet(endpoint) {
    const auth = Buffer.from(`admin:${PALWORLD_ADMIN_PASSWORD}`).toString('base64');
    const res = await fetch(`${PALWORLD_API_URL}${endpoint}`, {
        headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
        throw new Error(`Erreur API Palworld ${endpoint}: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

// ---- Construction de l'embed à partir des données du serveur ----
function buildEmbed(info, metrics) {
    const uptimeH = Math.floor(metrics.uptime / 3600);
    const uptimeM = Math.floor((metrics.uptime % 3600) / 60);

    return new EmbedBuilder()
        .setTitle(`🌴 ${info.servername || 'Serveur Palworld'}`)
        .setDescription(info.description || null)
        .addFields(
            { name: '👥 Joueurs', value: `${metrics.currentplayernum} / ${metrics.maxplayernum}`, inline: true },
            { name: '📅 Jour in-game', value: `${metrics.days}`, inline: true },
            { name: '🏕️ Bases', value: `${metrics.basecampnum}`, inline: true },
            { name: '⚡ FPS serveur', value: `${metrics.serverfps}`, inline: true },
            { name: '⏱️ Uptime', value: `${uptimeH}h ${uptimeM}m`, inline: true },
            { name: '🔧 Version', value: `${info.version || 'N/A'}`, inline: true },
        )
        .setColor(0x2ecc71)
        .setFooter({ text: `Dernière mise à jour` })
        .setTimestamp();
}

// ---- Récupère (ou crée) le message à éditer ----
async function getOrCreateMessage(channel) {
    // On tente de relire un ID de message déjà stocké (persiste entre les redémarrages du bot)
    if (fs.existsSync(STATE_FILE)) {
        const { messageId } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        try {
            return await channel.messages.fetch(messageId);
        } catch {
            console.warn('Message précédent introuvable, un nouveau va être créé.');
        }
    }

    // Aucun message existant valide -> on en crée un (une seule fois)
    const msg = await channel.send({ content: 'Initialisation du statut du serveur...' });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ messageId: msg.id }));
    return msg;
}

// ---- Boucle de mise à jour ----
async function updateLoop(message) {
    try {
        const [info, metrics] = await Promise.all([
            palworldGet('/info'),
            palworldGet('/metrics'),
        ]);
        const embed = buildEmbed(info, metrics);
        await message.edit({ content: null, embeds: [embed] }); // .edit() = pas de notification
    } catch (err) {
        console.error(err);
        await message.edit({
            content: `⚠️ Impossible de récupérer les informations du serveur (${err.message})`,
            embeds: [],
        }).catch(() => { });
    }
}

client.once('ready', async () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
    const channel = await client.channels.fetch(CHANNEL_ID);
    const message = await getOrCreateMessage(channel);

    updateLoop(message); // premier appel immédiat
    setInterval(() => updateLoop(message), Number(REFRESH_SECONDS) * 1000);
});

client.login(DISCORD_TOKEN);
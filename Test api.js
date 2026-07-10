// Script de test : vérifie que l'API REST Palworld répond bien
// Usage : node test-api.js

require('dotenv').config();

const { PALWORLD_API_URL, PALWORLD_ADMIN_PASSWORD } = process.env;

if (!PALWORLD_API_URL || !PALWORLD_ADMIN_PASSWORD) {
    console.error('❌ PALWORLD_API_URL ou PALWORLD_ADMIN_PASSWORD manquant dans le fichier .env');
    process.exit(1);
}

async function testEndpoint(endpoint) {
    const auth = Buffer.from(`admin:${PALWORLD_ADMIN_PASSWORD}`).toString('base64');
    const url = `${PALWORLD_API_URL}${endpoint}`;
    console.log(`\n➡️  Test de ${url}`);

    try {
        const res = await fetch(url, {
            headers: { Authorization: `Basic ${auth}` },
        });

        console.log(`   Statut HTTP : ${res.status} ${res.statusText}`);

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.log(`   Réponse brute : ${text}`);
            return false;
        }

        const data = await res.json();
        console.log('   ✅ Réponse JSON reçue :');
        console.log(JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`   ❌ Erreur de connexion : ${err.message}`);
        return false;
    }
}

(async () => {
    console.log('=== Test de connexion à l\'API REST Palworld ===');
    const okInfo = await testEndpoint('/info');
    const okMetrics = await testEndpoint('/metrics');

    console.log('\n=== Résumé ===');
    console.log(`/info    : ${okInfo ? '✅ OK' : '❌ échec'}`);
    console.log(`/metrics : ${okMetrics ? '✅ OK' : '❌ échec'}`);

    if (!okInfo || !okMetrics) {
        console.log('\nPistes si ça échoue :');
        console.log('- Vérifie que "Enable REST API" est bien coché sur Dathost et que le serveur a redémarré.');
        console.log('- Vérifie le port utilisé (souvent 8212, mais Dathost peut en remapper un autre).');
        console.log('- Vérifie le mot de passe admin (AdminPassword).');
        console.log('- Vérifie qu\'aucun firewall ne bloque ce port depuis ta machine.');
    }
})();
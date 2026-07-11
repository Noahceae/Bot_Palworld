# Palworld Status Bot

Bot Discord qui affiche en temps réel le statut d'un serveur Palworld en éditant un seul message (aucune notification envoyée), via l'[API REST officielle Palworld](https://tech.palworldgame.com/api/rest-api/palwold-rest-api).

## Fonctionnalités

- **Message auto-actualisé** : un seul message dans un salon, édité toutes les X secondes (pas de spam, pas de notification -- éditer un message Discord ne ping jamais).
- **Statut visuel** : couleur de l'embed selon le taux de remplissage du serveur (vert = tranquille / orange = bien rempli / rouge = presque plein).
- **Indicateur en ligne/hors ligne** : si l'API ne répond plus, le message bascule automatiquement en "Hors ligne" au lieu de planter.
- **Retry automatique** : chaque appel à l'API retente jusqu'à 3 fois (délai croissant) avant d'être considéré en échec, pour éviter les faux positifs sur un simple lag réseau.
- **Commande `/players`** : liste les joueurs connectés, visible uniquement par la personne qui tape la commande (réponse éphémère).

## Prérequis

- Node.js >= 18
- Un serveur Palworld avec l'option "Enable REST API" activée (Dathost ou autre hébergeur)
- Une application + bot créés sur le [Discord Developer Portal](https://discord.com/developers/applications)

## Configuration

1. Copie `.env.example` en `.env` :
   ```bash
   cp .env.example .env
   ```

2. Remplis les variables :

   | Variable | Où la trouver |
   |---|---|
   | `DISCORD_TOKEN` | Developer Portal > ton app > Bot > Reset/Copy Token |
   | `CLIENT_ID` | Developer Portal > ton app > General Information > Application ID |
   | `GUILD_ID` | Clic droit sur ton serveur Discord (mode développeur activé) > Copier l'identifiant. Permet à `/players` d'être dispo instantanément (sinon jusqu'à 1h en global) |
   | `CHANNEL_ID` | Clic droit sur le salon cible > Copier l'identifiant |
   | `PALWORLD_API_URL` | URL complète de l'API, format `http://IP:PORT/v1/api` |
   | `PALWORLD_ADMIN_PASSWORD` | `AdminPassword` défini dans les settings du serveur Palworld |
   | `REFRESH_SECONDS` | Intervalle de rafraîchissement du message (défaut: 60) |

Ne partage jamais ce fichier `.env` -- le `.gitignore` fourni l'exclut déjà de Git.

## Inviter le bot sur ton serveur

Sur le Developer Portal > OAuth2 > URL Generator :
- Coche le scope `bot` (et `applications.commands` pour la commande slash)
- Coche les permissions Send Messages, Embed Links, Read Message History
- Copie l'URL générée, ouvre-la, sélectionne ton serveur

Évite de donner le rôle Administrateur au bot -- ces permissions précises suffisent largement.

## Installation et lancement

```bash
npm install
node test-api.js   # vérifie la connexion à l'API Palworld avant de lancer le bot
npm start
```

## Déploiement (hébergement 24/7)

Le bot doit tourner en continu pour actualiser le message. Options testées :
- Railway (railway.app) -- déploiement via GitHub, variables d'environnement dans le panel
- bot-hosting.net -- hébergeur dédié aux bots Discord (peut être saturé selon les moments)

Dans tous les cas, configure les mêmes variables que `.env` directement dans le panel d'environnement de la plateforme (pas besoin d'uploader le `.env` lui-même).

## Structure du projet

```
.
├── index.js             # Bot principal (édition du message + commande /players)
├── test-api.js          # Script de test de connexion à l'API Palworld
├── package.json
├── .env.example         # Modèle de configuration
├── .gitignore
└── message-id.json      # Généré automatiquement, stocke l'ID du message édité
```

## Idées d'améliorations futures

- Alertes de connexion/déconnexion de joueurs
- Commandes admin (kick / ban / broadcast / save) via l'API Palworld
- Historique et graphique de fréquentation du serveur
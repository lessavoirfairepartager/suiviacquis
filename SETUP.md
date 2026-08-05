# Guide de configuration — Suivi Compétences

## Architecture

```
Navigateur ──► Supabase (PostgreSQL cloud) — données persistantes
            └► localStorage                — cache offline + fallback
Netlify     ──► héberge les fichiers HTML/JS/CSS
```

---

## Étape 1 — Créer un projet Supabase (5 minutes)

1. Aller sur **https://supabase.com** → "Start your project" → Se connecter avec GitHub ou email
2. Cliquer **"New project"**
3. Remplir :
   - **Name** : `suivi-competences` (ou ce que vous voulez)
   - **Database password** : choisissez un mot de passe fort (vous n'en aurez plus besoin)
   - **Region** : `West EU (Ireland)` — le plus proche de la France
4. Cliquer **"Create new project"** — attendre ~2 minutes

---

## Étape 2 — Créer la table (2 minutes)

1. Dans votre projet Supabase, aller dans **SQL Editor** (icône base de données dans le menu gauche)
2. Cliquer **"New query"**
3. Coller le contenu du fichier `supabase_setup.sql`
4. Cliquer **"Run"** (ou Ctrl+Entrée)
5. Vous devriez voir : `1 row` dans les résultats

---

## Étape 3 — Récupérer vos identifiants (1 minute)

1. Dans votre projet Supabase, aller dans **Settings** → **API** (menu gauche)
2. Copier :
   - **Project URL** → ressemble à `https://abcdefgh.supabase.co`
   - **anon / public key** → longue chaîne de caractères

---

## Étape 4 — Configurer l'application (1 minute)

Ouvrir le fichier `config.js` et remplacer :

```javascript
const SUPABASE_URL      = 'https://VOTRE-PROJET.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE-CLE-ANON-ICI';
```

Par vos vraies valeurs, exemple :

```javascript
const SUPABASE_URL      = 'https://abcdefghijklmno.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## Étape 5 — Déployer sur Netlify (2 minutes)

### Option A — Glisser-déposer (plus simple)
1. Aller sur **https://app.netlify.com**
2. "Add new site" → "Deploy manually"
3. **Glisser le dossier `suivi-competences/` entier** dans la zone de dépôt
4. Votre site est en ligne avec une URL comme `https://nom-aleatoire.netlify.app`

### Option B — Via GitHub (mises à jour automatiques)
1. Pousser ce dossier sur un repo GitHub (peut être privé)
2. Netlify : "Add new site" → "Import from Git" → choisir le repo
3. Build settings : tout laisser vide (pas de build command)
4. Déployer

### ⚠️ Important : redéployer après avoir modifié config.js
Si vous avez d'abord déployé sans Supabase, il faut redéployer après avoir rempli `config.js`.

---

## Test en local

Ouvrir `index.html` directement dans Chrome/Edge (double-clic).

> ⚠️ Sur certains navigateurs, `file://` bloque les requêtes vers Supabase (CORS).
> Si c'est le cas, utilisez un petit serveur local :
> ```
> npx serve .
> ```
> puis ouvrir `http://localhost:3000`

---

## Indicateur de synchronisation

L'indicateur dans la barre en haut à droite :

| Icône | Signification |
|-------|--------------|
| ⚪ | Mode local uniquement (Supabase non configuré) |
| 🔵 | Synchronisation en cours |
| 🟢 | Synchronisé avec Supabase |
| 🔴 | Erreur Supabase — données locales utilisées |

---

## Sauvegardes manuelles

En mode prof, bouton **⚙ Paramètres** :
- **⬇ Exporter toutes les données (.json)** — backup complet
- **⬆ Importer un backup (.json)** — restauration
- **🔄 Forcer la synchronisation** — resync manuel avec Supabase

**Recommandation** : faire un export JSON chaque fin de trimestre.

---

## Mot de passe par défaut

`prof1234` — à changer depuis le lien "Changer le mot de passe" dans le modal de connexion.

---

## Raccourcis clavier

- `Échap` : fermer le modal ou quitter le vidéoprojecteur

---

## Structure des fichiers

```
suivi-competences/
├── index.html          ← page principale
├── style.css           ← styles
├── config.js           ← ⚠️ À REMPLIR avec vos identifiants Supabase
├── db.js               ← couche données (Supabase + localStorage)
├── app.js              ← logique applicative
├── supabase_setup.sql  ← SQL à exécuter dans Supabase (une seule fois)
├── netlify.toml        ← configuration Netlify
└── SETUP.md            ← ce fichier
```

# Suivi Compétences

Outil de suivi des compétences par items pour enseignant.

## Structure des fichiers

```
suivi-competences/
├── index.html     ← page principale
├── style.css      ← styles
├── app.js         ← logique applicative
├── netlify.toml   ← config Netlify (optionnel)
└── README.md
```

## Déploiement  Netlify

### Option 1 — Glisser-déposer (le plus simple)

1. Aller sur https://app.netlify.com
2. "Add new site" → "Deploy manually"
3. Glisser le dossier `suivi-competences/` dans la zone de dépôt
4. Votre site est en ligne en 30 secondes avec une URL comme `https://quelque-chose.netlify.app`

### Option 2 — Via GitHub

1. Pousser ce dossier sur un repo GitHub
2. Sur Netlify : "Add new site" → "Import from Git"
3. Choisir le repo, laisser les paramètres par défaut (pas de build command)
4. Déployer

## Test en  local

Ouvrir `index.html` directement dans un navigateur (double-clic). 
Aucun serveur nécessaire — tout fonctionne en local.

## Connexion professeur

Mot de passe par défaut : **prof1234**
→ Changeable depuis le modal de connexion (lien "Changer le mot de passe")

## Fonctionnalités

### Mode élève (sans connexion)

* Lecture de toutes les données
* Cases T / A / E visibles
* Notes /10 par activité

### Mode professeur (après connexion)

* Créer/gérer classes, séquences, activités
* Ajouter des séances avec date
* Ajouter des items numérotés (ex: 1, 2, 3a, 3b)
* Cocher/décocher les items par élève
* Cycle présence : · → 🟢 présent → 🔴 absent → 🟠 exclu
* Cases T (travail) / A (attitude) / E (exclusion) par séance
* Verrouiller une activité (note définitive)
* Mode vidéoprojecteur (bouton ⊞)
* Export CSV par séquence

## Stockage

Les données sont stockées dans le `localStorage` du navigateur.
**Important** : les données sont liées au navigateur utilisé.
Pour partager entre deux machines, utilisez l'export/import (à venir).

## Raccourcis clavier

* `Échap` : fermer modal ou quitter le mode vidéoprojecteur


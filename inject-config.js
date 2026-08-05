/* =============================================
   inject-config.js — Script de build Netlify
   Injecte les variables d'environnement dans config.js
   Exécuté automatiquement par Netlify à chaque déploiement
============================================= */

const fs   = require('fs');
const path = require('path');

const url  = process.env.SUPABASE_URL      || '';
const key  = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.warn('⚠️  Variables SUPABASE_URL ou SUPABASE_ANON_KEY manquantes — mode local uniquement');
}

const config = `/* Configuration Supabase — généré automatiquement par Netlify */
const SUPABASE_URL      = '${url}';
const SUPABASE_ANON_KEY = '${key}';
`;

fs.writeFileSync(path.join(__dirname, 'config.js'), config);
console.log('✓ config.js généré' + (url ? ' avec Supabase' : ' sans Supabase (mode local)'));

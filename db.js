/* =============================================
   db.js v5 — Synchronisation robuste (réseau instable)
   - Authentification Supabase (email + mot de passe par prof)
   - Données isolées par prof (une ligne par user_id)
   - Code d'invitation pour créer un compte
   - isProfMode JAMAIS persisté

   REFONTE v5 (septembre 2026) — pensée pour le wifi du lycée qui coupe
   par micro-coupures. Principes :

   1. L'appareil est la référence. Chaque clic est écrit immédiatement en
      localStorage ET marqué "en attente d'envoi" (clé PENDING_KEY). Ce
      marqueur survit à un rechargement de page : une saisie non envoyée
      n'est plus jamais écrasée par la copie en ligne, même après F5.

   2. Fusion au lieu d'écrasement. On garde la dernière version confirmée
      par le serveur (la "base"). Si la copie en ligne a changé entre-temps
      (autre appareil), on fusionne : ce qui a changé ici + ce qui a changé
      là-bas. Rien n'est jeté.

   3. Écriture conditionnelle. On n'écrit en ligne que si la ligne n'a pas
      bougé depuis notre lecture ; sinon on relit, on refusionne, on réessaie.

   4. Délai maximal sur chaque requête (AbortController). Une requête qui
      reste pendue sur un wifi instable est coupée au bout de 15 s (lecture)
      ou 30 s (écriture) : l'indicateur ne reste plus bleu indéfiniment.

   5. Ré-essais automatiques avec délai croissant (2 s, 4 s, 8 s... 30 s),
      et immédiatement au retour du réseau (événement "online") ou quand on
      revient sur l'onglet. Plus besoin d'actualiser la page.

   6. Une coupure réseau ne fait plus repasser en mode élève. Si la session
      est vraiment perdue, on reste en mode prof, les saisies restent sur
      l'appareil (🔴) et partent dès la reconnexion.

   7. Les rappels onAuthStateChange ne font plus d'appel Supabase en
      direct (risque d'interblocage documenté du SDK) : tout est différé.

   Indicateur :
     🟢 tout est en ligne     🔵 envoi en cours
     🟠 enregistré sur cet appareil, envoi dès que le réseau le permet
     🟡 réseau indisponible, rien en attente
     🔴 session perdue (reconnexion via ⚙) — saisies gardées sur l'appareil
============================================= */

const STORE_KEY    = 'suiviComp_v5';
const PENDING_KEY  = 'suiviComp_v5_pending';  // présent = des saisies attendent d'être envoyées
const BASE_KEY     = 'suiviComp_v5_base';     // dernière version confirmée par le serveur
const BASE_TS_KEY  = 'suiviComp_v5_baseTs';   // son updated_at (tel que renvoyé par Supabase)
const OWNER_KEY    = 'suiviComp_v5_owner';    // user_id à qui appartiennent les données locales
const TAB_KEY      = 'suiviComp_v5_tab';      // identifiant de l'onglet actif

const ACTIVITY_GUARD_MS = 1500;  // pas de re-rendu imposé juste après un clic
const DEBOUNCE_MS       = 600;   // envoi 600 ms après le dernier clic...
const MAX_WAIT_MS       = 2500;  // ...et au plus tard 2,5 s pendant une saisie en rafale
const POLL_MS           = 30000; // vérification périodique quand tout va bien
const BACKOFF_MAX_MS    = 30000; // délai maximal entre deux ré-essais
const GET_TIMEOUT_MS    = 15000; // délai maximal d'une lecture
const WRITE_TIMEOUT_MS  = 30000; // délai maximal d'une écriture (envoi de toutes les données)

let _sb          = null;
window._sb       = null;
let _syncState   = 'local';
let _currentUser = null;
let _channel     = null;
let _explicitLogout = false;
let _sessionLost    = false;  // session perdue sans déconnexion volontaire
let _migrationCheck = false;  // 1er passage en v5 sur cet appareil
let _lastLocalActivity = 0;
let _editSeq     = 0;         // incrémenté à chaque saisie locale
let _inFlight    = false;
let _rerun       = false;
let _failCount   = 0;
let _syncTimer   = null, _syncTimerAt = 0;
let _debounceTimer = null, _maxWaitTimer = null;
let _watchersOn  = false;
let _renderQueued = false;
let _firstSyncDone = false;
let _inactiveTab = false;
const _tabId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function deactivateTab(){
  if (_inactiveTab) return;
  _inactiveTab = true;
  clearTimeout(_syncTimer); _syncTimer = null; _syncTimerAt = 0;
  clearTimeout(_debounceTimer); clearTimeout(_maxWaitTimer);
  _debounceTimer = _maxWaitTimer = null;
  if (typeof document === 'undefined' || !document.body || document.getElementById('tab-lock')) return;
  const ov = document.createElement('div');
  ov.id = 'tab-lock';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.9);color:#fff;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;' +
    'font:16px system-ui,sans-serif;text-align:center;padding:24px';
  ov.innerHTML = '<div style="font-size:42px">🗂️</div>' +
    '<div>Le suivi est ouvert dans un autre onglet ou une autre fenêtre.<br>' +
    'Pour ne pas mélanger les saisies, un seul onglet reste actif.</div>' +
    '<button style="font-size:16px;padding:10px 20px;border:0;border-radius:8px;cursor:pointer">Utiliser cet onglet</button>';
  ov.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(ov);
}

// ── Petits utilitaires localStorage (jamais d'exception) ───────────────────────
function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function lsSet(k,v){
  try { localStorage.setItem(k,v); return true; }
  catch(e){ console.warn('[DB] localStorage refuse', k, e && e.message); return false; }
}
function lsDel(k){ try { localStorage.removeItem(k); } catch(e){} }

function isPending(){ return isPendingTok(lsGet(PENDING_KEY)); }
// Le marqueur est un jeton unique par saisie : un autre onglet ne peut pas
// l'effacer par erreur s'il a été renouvelé entre-temps.
function isPendingTok(t){ return !!t && t !== '0'; }
function setPending(on){
  if (on) lsSet(PENDING_KEY, Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
  else lsDel(PENDING_KEY);
}
function getBaseTs(){ return lsGet(BASE_TS_KEY) || ''; }
function getBase(){
  try { const r = lsGet(BASE_KEY); return r ? JSON.parse(r) : null; }
  catch(e){ return null; }
}
function setBase(data, ts){
  // Si la base ne tient pas en localStorage, on s'en passe : la fusion
  // devient alors une union prudente (rien n'est perdu, seules des
  // suppressions faites sur un autre appareil pourraient réapparaître).
  if (!lsSet(BASE_KEY, JSON.stringify(data))) lsDel(BASE_KEY);
  if (ts) lsSet(BASE_TS_KEY, ts); else lsDel(BASE_TS_KEY);
}
function clearSyncKeys(){ [PENDING_KEY, BASE_KEY, BASE_TS_KEY, OWNER_KEY].forEach(lsDel); }

// Copie PROFONDE et "propre" (sans les champs techniques non partagés).
// Profonde, car app.js modifie D en place (D.classes[i]....) : une copie
// superficielle verrait ces modifications et fausserait la fusion.
function clean(d){
  const c = JSON.parse(JSON.stringify(d || {}));
  delete c.isProfMode; delete c._ts;
  return c;
}
function writeLocal(){ lsSet(STORE_KEY, JSON.stringify(Object.assign({}, D, { isProfMode:false }))); }

// Remplace D par une version venue du réseau / d'une fusion,
// SANS toucher au mode prof en cours (cause du retour intempestif en mode élève).
function adoptData(fresh, ts){
  const prof = !!(D && D.isProfMode);
  const d = JSON.parse(JSON.stringify(fresh));
  d.isProfMode = prof;
  d._ts = (ts && Date.parse(ts)) || Date.now();
  D = d;
  writeLocal();
}

// ── Fusion à trois voies (base / local / distant) ──────────────────────────────
// - objets : clé par clé ;
// - tableaux d'objets à id (classes, élèves, séquences, activités...) : élément
//   par élément, en suivant les id ;
// - vrai conflit sur une même valeur simple : l'appareil où l'on saisit gagne ;
// - supprimé d'un côté mais modifié de l'autre : on garde (on ne perd rien).
const UNK = { inconnu:true }; // "pas de base connue" (différent de "n'existait pas")

function isObj(x){ return x !== null && typeof x === 'object' && !Array.isArray(x); }
function deepEq(a,b){
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)){
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka){
    if (!Object.prototype.hasOwnProperty.call(b,k) || !deepEq(a[k], b[k])) return false;
  }
  return true;
}
function isIdArray(a){ return Array.isArray(a) && a.every(x => isObj(x) && x.id !== undefined && x.id !== null); }

function merge3(base, local, remote){
  if (deepEq(local, remote)) return local;
  if (base !== UNK && deepEq(local, base)) return remote;   // seul le distant a changé
  if (base !== UNK && deepEq(remote, base)) return local;   // seul le local a changé
  if (local === undefined) return remote;                  // supprimé ici, modifié là-bas : on garde
  if (remote === undefined) return local;                  // l'inverse
  if (isObj(local) && isObj(remote)){
    const out = {};
    const keys = new Set(Object.keys(local).concat(Object.keys(remote)));
    keys.forEach(k => {
      const b = base === UNK ? UNK : (isObj(base) ? base[k] : undefined);
      const v = merge3(b, local[k], remote[k]);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }
  if (isIdArray(local) && isIdArray(remote) &&
      (base === UNK || base === undefined || isIdArray(base))){
    return mergeById(base, local, remote);
  }
  return local;
}
function mergeById(base, local, remote){
  const bm = base === UNK ? null : new Map((base || []).map(x => [String(x.id), x]));
  const lm = new Map(local.map(x => [String(x.id), x]));
  const rm = new Map(remote.map(x => [String(x.id), x]));
  const out = [], seen = new Set();
  const take = id => {
    if (seen.has(id)) return;
    seen.add(id);
    const b = bm ? bm.get(id) : UNK;
    const v = merge3(b, lm.get(id), rm.get(id));
    if (v !== undefined) out.push(v);
  };
  local.forEach(x => take(String(x.id)));   // l'ordre local d'abord
  remote.forEach(x => take(String(x.id)));  // puis ce qui n'existe que là-bas
  return out;
}
window._merge3 = merge3; // exposé pour les tests

// ── fetch avec délai maximal (évite l'indicateur bleu figé) ────────────────────
function fetchAvecDelai(input, init){
  init = init || {};
  const method = String(init.method || 'GET').toUpperCase();
  const ms = (method === 'GET' || method === 'HEAD') ? GET_TIMEOUT_MS : WRITE_TIMEOUT_MS;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  if (init.signal){
    if (init.signal.aborted) ctrl.abort();
    else init.signal.addEventListener('abort', () => ctrl.abort(), { once:true });
  }
  return fetch(input, Object.assign({}, init, { signal: ctrl.signal }))
    .finally(() => clearTimeout(t));
}

// ── Rendu différé si l'utilisateur est en train de saisir ──────────────────────
function userBusy(){
  if (Date.now() - _lastLocalActivity < ACTIVITY_GUARD_MS) return true;
  const a = (typeof document !== 'undefined') ? document.activeElement : null;
  return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable));
}
function renderWhenIdle(){
  if (typeof render !== 'function' || _renderQueued) return;
  _renderQueued = true;
  const tick = () => {
    if (userBusy()){ setTimeout(tick, 1200); return; }
    _renderQueued = false;
    render();
  };
  tick();
}

// ── Initialisation ─────────────────────────────────────────────────────────────
async function initDB() {
  if (_sb) return;
  if (
    typeof SUPABASE_URL === 'undefined' ||
    SUPABASE_URL.includes('VOTRE-PROJET') ||
    typeof SUPABASE_ANON_KEY === 'undefined' ||
    SUPABASE_ANON_KEY.includes('VOTRE-CLE')
  ) {
    console.log('[DB] Mode local uniquement');
    setSyncState('local');
    return;
  }
  try {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { fetch: fetchAvecDelai }
    });
    window._sb = _sb;
    startWatchers();

    _sb.auth.onAuthStateChange((event, session) => {
      // IMPORTANT : aucun appel Supabase direct ici (interblocage possible du SDK).
      setTimeout(() => handleAuthEvent(event, session), 0);
    });

    let session = null;
    try { session = (await _sb.auth.getSession()).data.session; }
    catch(e){ console.warn('[DB] getSession:', e && e.message); }

    if (session) {
      await onLoggedIn(session.user, true);
    } else if (isPending()) {
      // Des saisies d'une session précédente n'ont pas été envoyées.
      setSyncState('disconnected');
      toast('🟠 Des saisies attendent d\'être envoyées — reconnectez-vous (⚙).');
    } else {
      setSyncState('synced');
    }
  } catch(e) {
    console.warn('[DB] Init failed:', e && e.message);
    setSyncState('error');
  }
}

function handleAuthEvent(event, session){
  if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
    onLoggedIn(session.user, false);
  } else if (event === 'TOKEN_REFRESHED' && session) {
    _currentUser = session.user;
    _sessionLost = false;
    scheduleSync(0);
  } else if (event === 'SIGNED_OUT') {
    if (_explicitLogout) return; // géré par logoutProfAuth()
    // Session vraiment perdue (jeton refusé par le serveur). On NE repasse
    // PAS en mode élève : les saisies continuent en local et partiront après
    // reconnexion.
    _currentUser = null;
    _sessionLost = true;
    setSyncState('disconnected');
    toast('🔌 Session expirée — vos saisies restent sur cet appareil. ⚙ pour vous reconnecter.');
  }
}

async function onLoggedIn(user, restored){
  if (!user) return;
  if (_currentUser && _currentUser.id === user.id && D.isProfMode && !_sessionLost) {
    scheduleSync(0); // déjà en place (événement en double)
    return;
  }
  const prevOwner = lsGet(OWNER_KEY);
  if (prevOwner && prevOwner !== user.id) {
    // Les données locales appartiennent à un autre compte : on ne les mélange pas.
    if (isPending()) {
      try { exportBackupJSON(); } catch(e){}
      toast('⚠️ Saisies non envoyées d\'un autre compte : sauvegarde .json téléchargée.');
    }
    clearSyncKeys();
    const prof = !!D.isProfMode;
    D = defaultData(); D.isProfMode = prof;
    writeLocal();
  } else if (!prevOwner && !getBaseTs()) {
    // Premier lancement de la v5 sur cet appareil : on ne sait pas si la copie
    // locale contient des saisies jamais envoyées par l'ancienne version.
    // On le décide à la première lecture (voir runSync).
    _migrationCheck = true;
  }
  lsSet(OWNER_KEY, user.id);
  _currentUser = user;
  _sessionLost = false;
  D.isProfMode = true;
  startRealtime();
  if (typeof render === 'function') render();
  await runSync();
  if (restored && _syncState === 'synced') toast('✓ Session restaurée — ' + (user.email || ''));
}

// ── Moteur de synchronisation ──────────────────────────────────────────────────
function scheduleSync(delay){
  if (!_sb || !_currentUser || _inactiveTab) return;
  delay = Math.max(0, delay);
  const at = Date.now() + delay;
  if (_syncTimer && _syncTimerAt <= at) return; // un passage plus proche est déjà prévu
  clearTimeout(_syncTimer);
  _syncTimerAt = at;
  _syncTimer = setTimeout(() => { _syncTimer = null; _syncTimerAt = 0; runSync(); }, delay);
}

async function runSync(){
  if (!_sb || !_currentUser || _inactiveTab) return;
  if (_inFlight) { _rerun = true; return; }
  if (typeof document !== 'undefined' && document.hidden && !isPending()) {
    scheduleSync(POLL_MS); // onglet caché et rien à envoyer : on ne consomme rien
    return;
  }
  _inFlight = true; _rerun = false;
  const uid = _currentUser.id;
  let ok = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('hors ligne');
    if (isPending()) setSyncState('syncing');

    for (let tour = 0; tour < 4 && !ok; tour++) {
      const lu = await _sb.from('app_data').select('data, updated_at')
        .eq('user_id', uid).maybeSingle();
      if (lu.error) throw lu.error;
      if (!_currentUser || _currentUser.id !== uid || _inactiveTab) return;
      const row = lu.data;
      const baseTs = getBaseTs();

      // Cas "migration" (1er passage en v5) : si la copie locale est plus
      // récente que la copie en ligne, elle contient des saisies non envoyées.
      if (_migrationCheck) {
        _migrationCheck = false;
        if (!row || (row.updated_at && (D._ts || 0) > Date.parse(row.updated_at) + 1000)) setPending(true);
      }

      if (!isPending()) {
        // Rien à envoyer : on récupère la version en ligne si elle a changé.
        if (row && row.data && row.updated_at !== baseTs) {
          if (userBusy()) { ok = true; _rerun = true; break; }
          const fresh = clean(row.data);
          const changed = !deepEq(fresh, clean(D));
          adoptData(fresh, row.updated_at);
          setBase(fresh, row.updated_at);
          if (changed) {
            renderWhenIdle();
            if (_firstSyncDone && baseTs) toast('↓ Données mises à jour depuis un autre appareil');
          }
        } else if (!row) {
          setPending(true); // rien en ligne : on envoie ce qu'on a
          continue;
        }
        ok = true;
        break;
      }

      // Des saisies attendent : fusion éventuelle puis écriture conditionnelle.
      const seq   = _editSeq;
      const tok   = lsGet(PENDING_KEY);
      const local = clean(D);
      let toSend  = local;
      if (row && row.data && row.updated_at !== baseTs) {
        const base = baseTs ? getBase() : null;
        toSend = merge3(base === null ? UNK : base, local, clean(row.data));
      }
      const nowIso = new Date().toISOString();
      let res;
      if (row) {
        res = await _sb.from('app_data')
          .update({ data: toSend, updated_at: nowIso })
          .eq('user_id', uid).eq('updated_at', row.updated_at)
          .select('updated_at');
      } else {
        res = await _sb.from('app_data')
          .insert({ user_id: uid, data: toSend, updated_at: nowIso })
          .select('updated_at');
        if (res.error && String(res.error.code) === '23505') continue; // créé ailleurs entre-temps
      }
      if (res.error) throw res.error;
      if (_inactiveTab) return;
      if (!res.data || !res.data.length) continue; // la ligne a bougé entre lecture et écriture : on refait
      const newTs = res.data[0].updated_at;
      setBase(toSend, newTs);

      if (_editSeq === seq && lsGet(PENDING_KEY) === tok) {
        if (!deepEq(toSend, local)) { adoptData(toSend, newTs); renderWhenIdle(); }
        setPending(false);
      } else {
        // Des clics ont eu lieu pendant l'envoi : on les ré-applique par-dessus.
        adoptData(merge3(local, clean(D), toSend), newTs);
        if (!deepEq(toSend, local)) renderWhenIdle();
        _rerun = true;
      }
      ok = true;
    }
  } catch(e) {
    console.warn('[DB] sync:', e && e.message);
    ok = false;
  } finally {
    _inFlight = false;
  }

  if (ok) {
    _failCount = 0;
    _firstSyncDone = true;
    setSyncState(_sessionLost ? 'disconnected' : (isPending() ? 'pending' : 'synced'));
    scheduleSync(isPending() ? 300 : (_rerun ? 2000 : POLL_MS));
  } else {
    _failCount++;
    const d = Math.min(BACKOFF_MAX_MS, 2000 * Math.pow(2, _failCount - 1)) + Math.random() * 1000;
    setSyncState(_sessionLost ? 'disconnected' : (isPending() ? 'pending' : 'offline'));
    scheduleSync(d);
  }
}

function startWatchers(){
  if (_watchersOn || typeof window === 'undefined') return;
  _watchersOn = true;
  window.addEventListener('online', () => { _failCount = 0; scheduleSync(0); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { _failCount = 0; scheduleSync(0); }
    else if (isPending()) runSync(); // on tente d'envoyer avant que l'onglet dorme
  });
  window.addEventListener('pagehide', () => { if (isPending()) runSync(); });
  // Un seul onglet actif à la fois : le dernier ouvert prend la main,
  // les autres se figent (sinon deux onglets s'écraseraient mutuellement).
  window.addEventListener('storage', e => {
    if (e.key === TAB_KEY && e.newValue && e.newValue !== _tabId) deactivateTab();
  });
  lsSet(TAB_KEY, _tabId);
  // Même si l'envoi n'aboutit pas à la fermeture, rien n'est perdu :
  // la saisie est en localStorage, marquée "en attente", et partira au
  // prochain chargement.
}

// ── Connexion ─────────────────────────────────────────────────────────────────
async function loginProf(email, password) {
  if (!_sb) return { ok: false, error: 'Supabase non configuré' };
  try {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = String(error.message || '');
      if (/fetch|network|abort|timeout/i.test(msg) || error.status === 0)
        return { ok: false, error: 'Réseau indisponible — réessayez dans un instant' };
      return { ok: false, error: 'Email ou mot de passe incorrect' };
    }
    await onLoggedIn(data.user, false);
    return { ok: true };
  } catch(e) {
    return { ok: false, error: 'Réseau indisponible — réessayez dans un instant' };
  }
}
window.loginProf = loginProf;

// ── Création de compte (code d'invitation requis) ─────────────────────────────
async function signupProf(email, password, inviteCode) {
  if (!_sb) return { ok: false, error: 'Supabase non configuré' };
  try {
    const { data: cfg } = await _sb
      .from('app_config').select('value').eq('key', 'invite_code').maybeSingle();
    const validCode = (cfg && cfg.value) || '';
    if (!validCode || inviteCode.trim() !== validCode) {
      return { ok: false, error: "Code d'invitation invalide" };
    }
    const { data, error } = await _sb.auth.signUp({ email, password });
    if (error) return { ok: false, error: error.message };
    return { ok: true, needsConfirm: !data.session };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}
window.signupProf = signupProf;

// ── Déconnexion ───────────────────────────────────────────────────────────────
async function logoutProfAuth() {
  // Dernière tentative d'envoi des saisies en attente
  if (_currentUser && isPending()) { await runSync(); }
  if (isPending()) {
    const go = confirm('Certaines saisies n\'ont pas encore pu être envoyées en ligne.\n\n' +
      'Un fichier de sauvegarde .json va être téléchargé. Se déconnecter quand même ?');
    if (!go) return;
    try { exportBackupJSON(); } catch(e){}
  }
  _explicitLogout = true;
  let signOutErr = null;
  try { if (_sb) signOutErr = (await _sb.auth.signOut()).error; }
  catch(e) { signOutErr = e; }
  if (signOutErr) {
    // Déconnexion hors ligne : on efface quand même la session stockée
    // (poste partagé du lycée : le compte ne doit pas rester ouvert).
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.indexOf('sb-') === 0 && k.indexOf('auth-token') > -1) localStorage.removeItem(k);
      });
    } catch(e){}
  }
  _currentUser = null;
  _sessionLost = false;
  clearTimeout(_syncTimer); _syncTimer = null; _syncTimerAt = 0;
  clearTimeout(_debounceTimer); clearTimeout(_maxWaitTimer);
  _debounceTimer = _maxWaitTimer = null;
  if (_channel && _sb) { try { _sb.removeChannel(_channel); } catch(e){} _channel = null; }
  D = defaultData();
  lsDel(STORE_KEY);
  clearSyncKeys();
  if (typeof render === 'function') render();
  setSyncState('local');
  toast('✓ Déconnecté');
  setTimeout(() => { _explicitLogout = false; }, 3000);
}
window.logoutProfAuth = logoutProfAuth;

function getCurrentUser() { return _currentUser; }
window.getCurrentUser = getCurrentUser;

// ── Sauvegarde (appelée par app.js à chaque modification) ─────────────────────
function saveData() {
  if (_inactiveTab) return; // onglet figé : l'autre onglet fait foi
  _lastLocalActivity = Date.now();
  _editSeq++;
  D._ts = Date.now();
  writeLocal();
  if (!_sb) return;
  if (!_currentUser && !_sessionLost) return; // pas connecté : mode local pur (élève)
  setPending(true);
  if (!_currentUser) { setSyncState('disconnected'); return; }
  setSyncState(_failCount ? 'pending' : 'syncing');
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    clearTimeout(_maxWaitTimer); _maxWaitTimer = null;
    scheduleSync(0);
  }, DEBOUNCE_MS);
  if (!_maxWaitTimer) {
    _maxWaitTimer = setTimeout(() => { _maxWaitTimer = null; scheduleSync(0); }, MAX_WAIT_MS);
  }
}

// ── Realtime : simple "sonnette" qui déclenche une lecture ─────────────────────
function startRealtime() {
  if (!_sb || !_currentUser) return;
  if (_channel) { try { _sb.removeChannel(_channel); } catch(e){} _channel = null; }
  const uid = _currentUser.id;
  try {
    _channel = _sb.channel('app_data_' + uid)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'app_data', filter: `user_id=eq.${uid}` },
        payload => {
          const ts = payload && payload.new && payload.new.updated_at;
          const b  = getBaseTs();
          if (ts && b && Date.parse(ts) === Date.parse(b)) return; // notre propre écriture
          scheduleSync(300);
        }
      ).subscribe();
  } catch(e) { console.warn('[DB] realtime:', e && e.message); }
}

// ── localStorage ──────────────────────────────────────────────────────────────
function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const d   = raw ? JSON.parse(raw) : defaultData();
    d.isProfMode = false;
    return d;
  } catch(e) {
    return defaultData();
  }
}

// ── Actions exposées ──────────────────────────────────────────────────────────
window.forceSyncFromSupabase = async function() {
  if (!_sb) { toast('⚠️ Mode local uniquement'); return; }
  if (!_currentUser) {
    toast('🔄 Tentative de reconnexion...');
    let session = null;
    try { session = (await _sb.auth.getSession()).data.session; } catch(e){}
    if (!session) {
      try { session = (await _sb.auth.refreshSession()).data.session; } catch(e){}
    }
    if (session) { await onLoggedIn(session.user, false); toast('✓ Reconnecté'); }
    else if (typeof openModal === 'function') openModal('login');
    else toast('⚠️ Non connecté');
    return;
  }
  _failCount = 0;
  await runSync();
  toast(_syncState === 'synced' ? '✓ Synchronisé'
      : _syncState === 'pending' ? '🟠 Réseau instable — saisies gardées, nouvel essai automatique'
      : '⚠️ Réseau indisponible — nouvel essai automatique');
};

function exportBackupJSON() {
  const backup = Object.assign({}, D, { _backup_date: new Date().toISOString(), _version: STORE_KEY });
  delete backup.isProfMode;
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `suivi-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('✓ Backup téléchargé');
}
window.exportBackupJSON = exportBackupJSON;

window.importBackupJSON = function() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = async function(e) {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.classes || !Array.isArray(data.classes)) {
        alert('Fichier JSON invalide.'); return;
      }
      if (!confirm(`Importer ${data.classes.length} classe(s) ?\nCela remplacera toutes vos données actuelles.`)) return;
      delete data._backup_date; delete data._version;
      data.isProfMode = !!D.isProfMode;
      D = data; saveData();
      nav = {screen:'home', classId:null, seqId:null};
      if (typeof render === 'function') render();
      toast('✓ Backup importé');
    } catch(err) { alert('Erreur import : ' + err.message); }
  };
  input.click();
};

// ── Indicateur sync ───────────────────────────────────────────────────────────
let syncState = 'local';
const SYNC_STATES = {
  local:        { dot:'⚪', tip:'Mode local',                                         cls:'sync-local'   },
  syncing:      { dot:'🔵', tip:'Envoi en cours...',                                   cls:'sync-syncing' },
  synced:       { dot:'🟢', tip:'Tout est enregistré en ligne',                        cls:'sync-ok'      },
  pending:      { dot:'🟠', tip:'Enregistré sur cet appareil — envoi automatique dès que le réseau le permet', cls:'sync-pending' },
  offline:      { dot:'🟡', tip:'Réseau indisponible — rien en attente',               cls:'sync-offline' },
  error:        { dot:'🔴', tip:'Erreur Supabase — vérifiez config.js',                cls:'sync-err'     },
  disconnected: { dot:'🔴', tip:'Session perdue — saisies gardées sur cet appareil. ⚙ pour se reconnecter', cls:'sync-err' },
};
function syncIndicatorHTML() {
  const s = SYNC_STATES[_syncState] || SYNC_STATES.local;
  return `<span id="sync-indicator" class="sync-dot ${s.cls}" title="${s.tip}">${s.dot}</span>`;
}
window.syncIndicatorHTML = syncIndicatorHTML;
function setSyncState(state) {
  syncState = state; _syncState = state;
  const el = (typeof document !== 'undefined') ? document.getElementById('sync-indicator') : null;
  if (!el) return;
  const s = SYNC_STATES[state] || SYNC_STATES.local;
  el.textContent = s.dot; el.title = s.tip; el.className = 'sync-dot ' + s.cls;
}

// ── defaultData ───────────────────────────────────────────────────────────────
function defaultData() {
  return { isProfMode:false, classes:[], _ts: Date.now() };
}

// ── Lancement ─────────────────────────────────────────────────────────────────
// Après le chargement de app.js (qui déclare D) : sinon une session restaurée
// très vite pourrait toucher D avant qu'il existe.
if (typeof document !== 'undefined' && document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', initDB);
else
  initDB();

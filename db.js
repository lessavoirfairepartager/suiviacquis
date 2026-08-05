/* =============================================
   db.js v4 — Authentification Supabase Auth
   - Email + mot de passe par prof
   - Données isolées par prof (une ligne par user_id)
   - Code d'invitation pour créer un compte
   - isProfMode JAMAIS persisté

   CORRECTIFS v4 :
   ✓ BUG 1 — Flush immédiat avant fermeture de l'onglet (visibilitychange hidden + pagehide)
   ✓ BUG 2 — Race condition push/sync : le timer de push est annulé avant toute lecture Supabase
   ✓ BUG 3 — Mode prof ne bloque plus les updates temps réel (comparaison de timestamps)
   ✓ BUG 4 — visibilitychange visible déclenche une vraie re-sync (pas juste l'indicateur)
   ✓ BUG 5 — render() appelé après un sync déclenché par le polling
   ✓ Debounce réduit de 1500ms à 400ms (moins de fenêtre de perte)
============================================= */

const STORE_KEY = 'suiviComp_v5';

let _sb          = null;
window._sb       = null;
let _syncState   = 'local';
let _saveTimer   = null;
let _channel     = null;
let _currentUser = null;
let _syncInProgress = false; // garde pour éviter les syncs concurrentes

// ── Initialisation ───────────────────────────────────────────────────────────
async function initDB() {
  if(_sb) return;
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
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window._sb = _sb;
    setSyncState('syncing');
    const { data: { session } } = await _sb.auth.getSession();
    if (session) {
      _currentUser = session.user;
      await syncFromSupabase(); // annule le saveTimer en interne (BUG 2)
      startRealtime();
      D.isProfMode = true;
      if (typeof render === 'function') render();
      toast('✓ Session restaurée — ' + (_currentUser.email || ''));
    } else {
      setSyncState('synced');
    }

    _sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        _currentUser = session.user;
        await syncFromSupabase();
        startRealtime();
        D.isProfMode = true;
        if (typeof render === 'function') render();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        // Rafraîchissement silencieux — on vérifie quand même si des données plus récentes existent
        if (_currentUser) {
          _checkAndSyncIfNewer();
        }
      } else if (event === 'SIGNED_OUT') {
        _currentUser = null;
        D.isProfMode = false;
        if (typeof render === 'function') render();
        setSyncState('local');
      }
    });

    // ── BUG 4 FIX : visibilitychange déclenche une vraie re-sync ──────────────
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && _sb && _currentUser) {
        // Retour sur l'onglet : vérifier si des données plus récentes existent
        _checkAndSyncIfNewer();
      }
      // ── BUG 1 FIX : flush immédiat avant que l'onglet soit masqué ────────
      if (document.visibilityState === 'hidden' && _saveTimer) {
        clearTimeout(_saveTimer);
        _saveTimer = null;
        pushToSupabase(); // fire-and-forget — mieux vaut essayer
      }
    });

    // ── BUG 1 FIX : flush sur navigation/fermeture ────────────────────────
    window.addEventListener('pagehide', () => {
      if (_saveTimer) {
        clearTimeout(_saveTimer);
        _saveTimer = null;
        pushToSupabase();
      }
    });

  } catch(e) {
    console.warn('[DB] Init failed:', e.message);
    setSyncState('error');
  }
}

// ── Vérification légère : sync seulement si Supabase est plus récent ─────────
async function _checkAndSyncIfNewer() {
  if (!_sb || !_currentUser || _syncInProgress) return;
  try {
    const { data } = await _sb
      .from('app_data')
      .select('updated_at')
      .eq('user_id', _currentUser.id)
      .maybeSingle();
    if (data) {
      const remoteTs = new Date(data.updated_at).getTime();
      if (remoteTs > (D._ts || 0)) {
        await syncFromSupabase();
        if (typeof render === 'function') render(); // BUG 5 FIX
      } else {
        setSyncState('synced');
      }
    }
  } catch(e) {
    console.warn('[DB] checkAndSync failed:', e.message);
  }
}

// ── Connexion ─────────────────────────────────────────────────────────────────
async function loginProf(email, password) {
  if (!_sb) return { ok: false, error: 'Supabase non configuré' };
  try {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: 'Email ou mot de passe incorrect' };
    _currentUser = data.user;
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}
window.loginProf = loginProf;

// ── Création de compte (code d'invitation requis) ─────────────────────────────
async function signupProf(email, password, inviteCode) {
  if (!_sb) return { ok: false, error: 'Supabase non configuré' };
  try {
    const { data: cfg } = await _sb
      .from('app_config').select('value').eq('key', 'invite_code').maybeSingle();
    const validCode = cfg?.value || '';
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
  // Flush d'abord les données en attente
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
    await pushToSupabase();
  }
  if (_sb) await _sb.auth.signOut();
  _currentUser = null;
  D = defaultData();
  try { localStorage.removeItem(STORE_KEY); } catch(e) {}
  if (_channel && _sb) { _sb.removeChannel(_channel); _channel = null; }
  if (typeof render === 'function') render();
  setSyncState('local');
  toast('✓ Déconnecté');
}
window.logoutProfAuth = logoutProfAuth;

function getCurrentUser() { return _currentUser; }
window.getCurrentUser = getCurrentUser;

// ── Sync depuis Supabase ──────────────────────────────────────────────────────
async function syncFromSupabase() {
  if (!_sb || !_currentUser) return;
  if (_syncInProgress) return; // évite les syncs concurrentes
  _syncInProgress = true;

  // ── BUG 2 FIX : annuler tout push en attente avant de lire ───────────────
  // Sans ça, un push de vieilles données peut écraser Supabase juste avant
  // qu'on lise, et on récupérerait alors nos propres vieilles données.
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }

  try {
    setSyncState('syncing');
    const { data, error } = await _sb
      .from('app_data').select('data, updated_at')
      .eq('user_id', _currentUser.id).maybeSingle();
    if (error) throw error;
    if (data && data.data) {
      const fresh = data.data;
      fresh._ts        = new Date(data.updated_at).getTime();
      fresh.isProfMode = false;
      D = fresh;
      localStorage.setItem(STORE_KEY, JSON.stringify(D));
    } else {
      // Aucune donnée distante → on pousse ce qu'on a en local
      await pushToSupabase();
    }
    setSyncState('synced');
  } catch(e) {
    console.warn('[DB] Sync failed:', e.message);
    setSyncState('error');
  } finally {
    _syncInProgress = false;
  }
}

// ── Push vers Supabase ────────────────────────────────────────────────────────
async function pushToSupabase() {
  if (!_sb || !_currentUser) return;
  try {
    D._ts = Date.now();
    const toSave = { ...D, isProfMode: false };
    const { error } = await _sb.from('app_data').upsert({
      user_id: _currentUser.id,
      data: toSave,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) throw error;
    setSyncState('synced');
  } catch(e) {
    console.warn('[DB] Push failed:', e.message);
    setSyncState('error');
  }
}

// ── Sauvegarde ────────────────────────────────────────────────────────────────
function saveData() {
  D._ts = D._ts || Date.now();
  const toLocal = { ...D, isProfMode: false };
  localStorage.setItem(STORE_KEY, JSON.stringify(toLocal));
  if (_sb && _currentUser) {
    setSyncState('syncing');
    clearTimeout(_saveTimer);
    // ── BUG 1 FIX : debounce réduit de 1500ms à 400ms ──────────────────────
    // Moins de fenêtre temporelle pour perdre des données si l'onglet se ferme
    _saveTimer = setTimeout(() => {
      _saveTimer = null;
      pushToSupabase();
    }, 400);
  }
}

// ── Realtime ──────────────────────────────────────────────────────────────────
function startRealtime() {
  if (!_sb || !_currentUser) return;
  if (_channel) { _sb.removeChannel(_channel); _channel = null; }

  _channel = _sb.channel('app_data_' + _currentUser.id)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'app_data',
        filter: `user_id=eq.${_currentUser.id}` },
      payload => {
        // ── BUG 3 FIX : on ne bloque plus en mode prof ───────────────────────
        // On accepte les mises à jour distantes si elles sont PLUS RÉCENTES
        // que l'état local, quelle que soit la valeur de isProfMode.
        // Cela permet la synchronisation multi-appareils même en mode prof.
        const remoteTs = new Date(payload.new.updated_at).getTime();
        if (remoteTs > (D._ts || 0)) {
          // Ne pas écraser si un push local est en cours (le push aura la priorité)
          if (_saveTimer) return;
          const fresh = payload.new.data;
          fresh._ts        = remoteTs;
          fresh.isProfMode = false; // isProfMode n'est jamais persisté
          D = fresh;
          localStorage.setItem(STORE_KEY, JSON.stringify(D));
          if (typeof render === 'function') render();
          toast('↓ Données synchronisées depuis un autre appareil');
        }
      }
    ).subscribe();

  // Polling de sécurité toutes les 30s (au lieu de 20s)
  // ── BUG 3 FIX + BUG 5 FIX : fonctionne aussi en mode prof, appelle render() ──
  setInterval(() => {
    if (!_sb || !_currentUser) return;
    if (_syncInProgress) return;
    if (_saveTimer) return; // un push local est en cours, pas besoin de puller
    _checkAndSyncIfNewer();
  }, 30000);
}

// ── localStorage ──────────────────────────────────────────────────────────────
function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const d   = raw ? JSON.parse(raw) : defaultData();
    d.isProfMode = false;
    return d;
  } catch {
    return defaultData();
  }
}

// ── Actions exposées ──────────────────────────────────────────────────────────
window.forceSyncFromSupabase = async function() {
  if (!_sb || !_currentUser) { toast('⚠️ Non connecté'); return; }
  await syncFromSupabase();
  if (typeof render === 'function') render();
  toast(_syncState === 'synced' ? '✓ Synchronisé' : '⚠️ Erreur de sync');
};

window.exportBackupJSON = function() {
  const backup = { ...D, _backup_date: new Date().toISOString(), _version: STORE_KEY };
  delete backup.isProfMode;
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `suivi-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('✓ Backup téléchargé');
};

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
      data.isProfMode = false;
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
function setSyncState(state) {
  syncState = state; _syncState = state;
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  const states = {
    local:   { dot:'⚪', tip:'Mode local',                cls:'sync-local'   },
    syncing: { dot:'🔵', tip:'Synchronisation...',        cls:'sync-syncing' },
    synced:  { dot:'🟢', tip:'Synchronisé avec Supabase', cls:'sync-ok'      },
    error:   { dot:'🔴', tip:'Erreur Supabase',           cls:'sync-err'     },
  };
  const s = states[state] || states.local;
  el.textContent = s.dot; el.title = s.tip; el.className = 'sync-dot ' + s.cls;
}

// ── defaultData ───────────────────────────────────────────────────────────────
function defaultData() {
  return { isProfMode:false, classes:[], _ts: Date.now() };
}

// ── Lancement ─────────────────────────────────────────────────────────────────
initDB();

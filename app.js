/* =============================================
   SUIVI DES ACQUIS — app.js v6
   - Items sur l'activité, séances = P/T/A/E
   - Note pondérée : extrapolation si absences
   - Moyenne de classe par activité
   - Niveau classe : 3ème ou BAC PRO
   - Compétences pré-définies par niveau, assignées par item
   - Vue globale : notes + niveaux de compétences par séquence
============================================= */

// STORE_KEY défini dans db.js

// ── Compétences pré-définies ─────────────────────────────────────────────────
const COMPETENCES = {
  // 3ᵉ Prépa-Métiers : 6 compétences du socle collège (cycle 4)
  '3pm': [
    {id:'CH', short:'CH', label:'Chercher',      color:'#dbeafe', text:'#1e40af'},
    {id:'MO', short:'MO', label:'Modéliser',     color:'#fce7f3', text:'#9d174d'},
    {id:'RE', short:'RE', label:'Représenter',   color:'#d1fae5', text:'#065f46'},
    {id:'RA', short:'RA', label:'Raisonner',     color:'#fef3c7', text:'#92400e'},
    {id:'CA', short:'CA', label:'Calculer',      color:'#ede9fe', text:'#5b21b6'},
    {id:'CO', short:'CO', label:'Communiquer',   color:'#ffedd5', text:'#9a3412'},
  ],
  // BAC PRO : 5 compétences de la voie professionnelle
  'bac_pro': [
    {id:'C1', short:'C1', label:"S'approprier",       color:'#dbeafe', text:'#1e40af'},
    {id:'C2', short:'C2', label:'Analyser / Raisonner', color:'#fce7f3', text:'#9d174d'},
    {id:'C3', short:'C3', label:'Réaliser',           color:'#d1fae5', text:'#065f46'},
    {id:'C4', short:'C4', label:'Valider',            color:'#fef3c7', text:'#92400e'},
    {id:'C5', short:'C5', label:'Communiquer',        color:'#ede9fe', text:'#5b21b6'},
  ],
  // CAP : 5 compétences de la voie professionnelle (mêmes intitulés, attendus allégés)
  'cap': [
    {id:'C1', short:'C1', label:"S'approprier",       color:'#dbeafe', text:'#1e40af'},
    {id:'C2', short:'C2', label:'Analyser / Raisonner', color:'#fce7f3', text:'#9d174d'},
    {id:'C3', short:'C3', label:'Réaliser',           color:'#d1fae5', text:'#065f46'},
    {id:'C4', short:'C4', label:'Valider',            color:'#fef3c7', text:'#92400e'},
    {id:'C5', short:'C5', label:'Communiquer',        color:'#ede9fe', text:'#5b21b6'},
  ],
};
// Sous-compétences détaillées (info-bulles) — reflètent les grilles officielles
const COMP_DETAILS = {
  '3pm': {
    CH:['Extraire, organiser l\u2019information utile','Chercher, expérimenter, tester'],
    MO:['Traduire une situation par un modèle','Utiliser, comprendre un modèle'],
    RE:['Choisir, produire une représentation','Passer d\u2019un registre à un autre'],
    RA:['Émettre une conjecture, argumenter','Mener un raisonnement logique'],
    CA:['Calculer, appliquer une technique','Contrôler la vraisemblance d\u2019un résultat'],
    CO:['Rendre compte à l\u2019oral ou à l\u2019écrit','Expliquer une démarche'],
  },
  'bac_pro': {
    C1:['Rechercher, extraire et organiser l\u2019information','Traduire des informations, des codages'],
    C2:['Émettre des conjectures, formuler des hypothèses','Proposer, choisir une méthode de résolution ou un protocole','Élaborer un algorithme'],
    C3:['Mettre en \u0153uvre une méthode, un algorithme ou un protocole (règles de sécurité)','Utiliser un modèle, représenter, calculer','Expérimenter, faire une simulation'],
    C4:['Exploiter et interpréter des résultats de façon critique et argumentée','Contrôler la vraisemblance d\u2019une conjecture, d\u2019une mesure','Valider un modèle ou une hypothèse','Mener un raisonnement logique et conclure'],
    C5:['Rendre compte d\u2019un résultat à l\u2019oral ou à l\u2019écrit','Expliquer une démarche'],
  },
  'cap': {
    C1:['Rechercher, extraire et organiser l\u2019information','Traduire des informations, des codages'],
    C2:['Émettre des conjectures, formuler des hypothèses','Choisir une méthode de résolution ou un protocole'],
    C3:['Mettre en \u0153uvre une méthode, un algorithme ou un protocole (règles de sécurité)','Utiliser un modèle, représenter, calculer','Expérimenter, utiliser une simulation'],
    C4:['Commenter un résultat ou des observations de façon critique et argumentée','Contrôler la vraisemblance d\u2019une conjecture, d\u2019une mesure','Valider une hypothèse','Mener un raisonnement logique et conclure'],
    C5:['Rendre compte d\u2019un résultat à l\u2019oral ou à l\u2019écrit','Expliquer une démarche'],
  },
};

// ── Niveaux d'acquisition (4 niveaux) ────────────────────────────────────────
const ACQ = [
  {id:'NA', label:'Non acquis',             bg:'#fee2e2', fg:'#991b1b', min:0  },
  {id:'PA', label:"En cours d'acquisition", bg:'#fef3c7', fg:'#92400e', min:25 },
  {id:'A',  label:'Acquis',                 bg:'#d1fae5', fg:'#065f46', min:50 },
  {id:'M',  label:'Maîtrisé',               bg:'#dcfce7', fg:'#14532d', min:75 },
];
function getAcqLevel(pct) {
  if (pct >= 75) return ACQ[3];
  if (pct >= 50) return ACQ[2];
  if (pct >= 25) return ACQ[1];
  return ACQ[0];
}
function getComps(cl) { return COMPETENCES[normNiveau(cl&&cl.niveau)]||COMPETENCES['bac_pro']; }
function getCompDetails(cl){ return COMP_DETAILS[normNiveau(cl&&cl.niveau)]||{}; }
// Info-bulle enrichie d'une compétence : intitulé + sous-compétences officielles
function compTip(cl, c){
  const det=(getCompDetails(cl)[c.id])||[];
  return det.length ? `${c.short} — ${c.label}\n• ${det.join('\n• ')}` : `${c.short} — ${c.label}`;
}

// Normalise le code de niveau d'une classe. Gère la rétro-compatibilité :
//  - ancien '3eme' (socle collège) → '3pm'
//  - valeurs inconnues/absentes → 'bac_pro'
function normNiveau(niv){
  if(niv==='3eme'||niv==='3pm') return '3pm';
  if(niv==='cap') return 'cap';
  return 'bac_pro';
}
// Un niveau utilise-t-il le socle commun DNB (domaines D1–D5) ? Uniquement 3PM.
function usesSocle(cl){ return normNiveau(cl&&cl.niveau)==='3pm'; }

// ── Socle commun collège — 5 domaines (uniquement 3PM) ──────────────────────
// Chaque domaine est alimenté par les compétences 3PM (CH/MO/RE/RA/CA/CO).
const SOCLE = [
  {id:'D1', label:'D1 — Langages pour penser et communiquer',
   desc:'Expression écrite et orale, raisonnement mathématique',
   comps: ['CO'],
   color:'#ffedd5', text:'#9a3412'},
  {id:'D2', label:'D2 — Méthodes et outils pour apprendre',
   desc:'Organiser son travail, utiliser des outils numériques et calculatoires',
   comps: ['CH','CA'],
   color:'#dbeafe', text:'#1e40af'},
  {id:'D3', label:'D3 — Formation de la personne et du citoyen',
   desc:'Esprit critique, argumentation, jugement',
   comps: ['RA'],
   color:'#ede9fe', text:'#5b21b6'},
  {id:'D4', label:'D4 — Systèmes naturels et systèmes techniques',
   desc:'Modélisation, représentation de phénomènes réels',
   comps: ['MO','RE'],
   color:'#d1fae5', text:'#065f46'},
  {id:'D5', label:'D5 — Représentations du monde et activité humaine',
   desc:'Modélisation de situations du monde réel',
   comps: ['MO'],
   color:'#fce7f3', text:'#9d174d'},
];

// Calcule le niveau socle d'un élève pour une séquence donnée (3PM uniquement)
function computeSocleAcq(cl, sq, stId) {
  const compLvls = computeCompAcq(cl, sq, stId);
  const result   = {};
  SOCLE.forEach(dom => {
    const values = dom.comps.map(cid => compLvls[cid]).filter(v => v !== null && v !== undefined);
    if (!values.length) { result[dom.id] = null; return; }
    const avgPct = values.reduce((a,b) => a + b.pct, 0) / values.length;
    result[dom.id] = { pct: avgPct, ...getAcqLevel(avgPct) };
  });
  return result;
}
// Bilan annuel du socle (toutes séquences confondues)
function computeSocleAcqAnnuelle(cl, stId) {
  const compLvls = computeCompAcqAnnuelle(cl, stId);
  const result   = {};
  SOCLE.forEach(dom => {
    const values = dom.comps.map(cid => compLvls[cid]).filter(v => v !== null && v !== undefined);
    if (!values.length) { result[dom.id] = null; return; }
    const avgPct = values.reduce((a,b) => a + b.pct, 0) / values.length;
    result[dom.id] = { pct: avgPct, ...getAcqLevel(avgPct) };
  });
  return result;
}

// ── Store — géré par db.js (Supabase + localStorage) ────────────────────────
// defaultData() et saveData() sont définis dans db.js
// D est chargé synchronement depuis localStorage au démarrage,
// puis mis à jour depuis Supabase en arrière-plan
let D = loadLocalData();
let nav = {screen:'home',classId:null,seqId:null};
let projActId = null;

// ── Spécialités Bac Pro avec groupements maths/PC ────────────────────────────
// SPECIALITES_BAC_PRO et SPES_GRP définis dans specialites.js

// Calcule les groupements effectifs d'une classe (union de toutes les spécialités)
function computeGroupements(cl) {
  if (!cl.specialites || !cl.specialites.length) return { grpsM: [], grpsPC: [] };
  const grpsM = new Set(), grpsPC = new Set();
  cl.specialites.forEach(nomSpe => {
    const spe = SPECIALITES_BAC_PRO.find(s => s.nom === nomSpe);
    if (spe) {
      if (spe.grpM) grpsM.add(spe.grpM);
      if (spe.grpPC && spe.grpPC !== '') grpsPC.add('SPÉ' + spe.grpPC);
    }
  });
  return { grpsM: [...grpsM].sort(), grpsPC: [...grpsPC].sort() };
}

// Badge HTML résumé des groupements (pour les cartes de classe)
const GRP_COLORS_M  = { A:'#93c5fd', B:'#86efac', C:'#fcd34d' };
const GRP_COLORS_PC = { 'SPÉ1':'#f472b6','SPÉ2':'#fb923c','SPÉ3':'#4ade80','SPÉ4':'#a78bfa','SPÉ5':'#2dd4bf','SPÉ6':'#f87171' };
function groupementsBadges(cl) {
  if (cl.niveau !== 'bac_pro') return '';
  const { grpsM, grpsPC } = computeGroupements(cl);
  if (!grpsM.length && !grpsPC.length) return '';
  let html = '<span style="display:flex;gap:3px;flex-wrap:wrap;margin-top:4px">';
  grpsM.forEach(g => {
    const c = GRP_COLORS_M[g] || '#6b7280';
    html += `<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:${c}30;color:${c};border:1px solid ${c}80;font-weight:600">M·${g}</span>`;
  });
  grpsPC.forEach(g => {
    const c = GRP_COLORS_PC[g] || '#6b7280';
    html += `<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:${c}30;color:${c};border:1px solid ${c}80;font-weight:600">PC·${g.replace('SPÉ','')}</span>`;
  });
  html += '</span>';
  return html;
}

// ── Utils ────────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2,9); }

// Retourne l'année scolaire courante ex: "2024-2025"
// Bascule au 1er septembre
function currentSchoolYear() {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}-${y+1}` : `${y-1}-${y}`;
}

// Année scolaire suivant l'année courante, ex: "2026-2027"
function nextSchoolYear() {
  const [a] = currentSchoolYear().split('-').map(Number);
  return `${a+1}-${a+2}`;
}

// Liste triée des années présentes dans les classes
function allSchoolYears() {
  const years = new Set(D.classes.map(cl => cl.annee || currentSchoolYear()));
  return [...years].sort().reverse(); // plus récente en premier
}

// Construit les <option> du sélecteur d'année scolaire : années déjà utilisées
// + année courante + année suivante (proposée d'office), triées, plus une entrée
// "Autre année…" qui ouvre une saisie libre (voir handleAnneeSelect).
function schoolYearOptionsHTML(selected) {
  const cy = currentSchoolYear(), ny = nextSchoolYear();
  const ay = new Set(allSchoolYears());
  ay.add(cy); ay.add(ny);
  if (selected) ay.add(selected);
  const list = [...ay].sort().reverse();
  let opts = list.map(y =>
    `<option value="${y}"${y===selected?' selected':''}>${y}</option>`
  ).join('');
  opts += `<option value="__custom__">➕ Autre année…</option>`;
  return opts;
}

// Gère le choix "Autre année…" dans un sélecteur d'année scolaire :
// demande une saisie libre, la valide, l'ajoute à la liste et la sélectionne.
window.handleAnneeSelect = function(sel) {
  if (sel.value !== '__custom__') return;
  const suggestion = nextSchoolYear();
  const prevValue = sel.dataset.prev || currentSchoolYear();
  let y = prompt('Année scolaire (format AAAA-AAAA) :', suggestion);
  if (!y || !y.trim()) { sel.value = prevValue; return; }
  y = y.trim();
  if (!/^\d{4}-\d{4}$/.test(y) || Number(y.slice(5)) !== Number(y.slice(0,4))+1) {
    alert('Format invalide. Exemple : 2026-2027 (deux années consécutives).');
    sel.value = prevValue; return;
  }
  const existing = [...sel.options].find(o => o.value === y);
  if (existing) { sel.value = y; }
  else {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    sel.insertBefore(opt, sel.querySelector('option[value="__custom__"]'));
    sel.value = y;
  }
  sel.dataset.prev = y;
};

// Affiche prénom uniquement en vue élève (RGPD), nom complet en mode prof
// Détection : mot tout en MAJUSCULES = NOM, mot Capitalisé = Prénom
// Gère les noms composés : "DE BLAISE Jean-Louis", "GODARD-LE FOLL Kateline"
function displayName(fullName, forProj) {
  if(D.isProfMode && !forProj) return esc(fullName||'');
  const parts = (fullName||'').trim().split(/\s+/);
  if(parts.length===1) return esc(parts[0]);
  // Mot "NOM" = entièrement majuscules et longueur > 1
  const isNom = w => w===w.toUpperCase() && w.length>1 && /[A-Z]/.test(w);
  const prenoms = parts.filter(w => !isNom(w));
  if(prenoms.length>0) return esc(prenoms.join(' '));
  return esc(parts[parts.length-1]); // fallback
}
function fmtDate(iso) {
  if(!iso) return '';
  const d=new Date(iso+'T00:00:00');
  return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'});
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toast(msg) {
  let t=document.getElementById('toast');
  if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t);}
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2600);
}

// ── Finders ──────────────────────────────────────────────────────────────────
function getClass(id)    { return D.classes.find(c=>c.id===id); }
function getSeq(cl,id)   { return (cl.sequences||[]).find(s=>s.id===id); }
function getAct(sq,id)   { return (sq.activities||[]).find(a=>a.id===id); }
function getSess(act,id) { return (act.sessions||[]).find(s=>s.id===id); }
function curClass()      { return getClass(nav.classId); }
function curSeq()        { const cl=curClass(); return cl?getSeq(cl,nav.seqId):null; }
function getSD(act,stId) {
  if(!act.studentData) act.studentData={};
  if(!act.studentData[stId]) act.studentData[stId]={checks:{},presence:{},tae:{}};
  const sd=act.studentData[stId];
  if(!sd.checks)   sd.checks={};
  if(!sd.presence) sd.presence={};
  if(!sd.tae)      sd.tae={};
  return sd;
}

// ── Groupes d'élèves (groupe1/groupe2, sections TRPM/MSPM…) ──────────────────
const GROUPE_COLORS=['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#6366f1','#a855f7','#ec4899','#64748b'];
function getGroupes(cl)      { return cl.groupes||[]; }
function getGroupe(cl,id)    { return getGroupes(cl).find(g=>g.id===id); }
function nextGroupeColor(cl) {
  const used=getGroupes(cl).map(g=>g.couleur);
  return GROUPE_COLORS.find(c=>!used.includes(c))||GROUPE_COLORS[getGroupes(cl).length%GROUPE_COLORS.length];
}
// Puces colorées à afficher devant le nom d'un élève (tableaux, listes)
function groupeDotsHTML(cl,st){
  const ids=st.groupeIds||[];
  if(!ids.length) return '';
  const dots=ids.map(id=>{
    const g=getGroupe(cl,id); if(!g) return '';
    return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${g.couleur};margin-right:2px;flex:none" title="${esc(g.nom)}"></span>`;
  }).join('');
  return dots?`<span style="display:inline-flex;align-items:center;vertical-align:middle;margin-right:3px">${dots}</span>`:'';
}
// Légende compacte des groupes définis (couleur + nom), pour décoder les puces sans survol
function groupesLegendHTML(cl){
  const gs=getGroupes(cl); if(!gs.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px">${gs.map(g=>
    `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:var(--bg3);border:1px solid var(--border);font-size:10px">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${g.couleur};flex:none"></span>${esc(g.nom)}
    </span>`).join('')}</div>`;
}
// Barre de filtre par groupe (légende cliquable) : filtre les tableaux/listes
// d'élèves sur la classe/séquence courante. "Tous" annule le filtre.
function groupesFilterHTML(cl){
  const gs=getGroupes(cl); if(!gs.length) return '';
  const f=nav.groupeFilter;
  let h=`<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px;align-items:center">`;
  h+=`<span style="font-size:10px;color:var(--text3)">Filtrer :</span>`;
  h+=`<span onclick="setGroupeFilter(null)" style="display:inline-flex;align-items:center;padding:2px 9px;border-radius:10px;cursor:pointer;font-size:10px;
    border:1px solid ${!f?'var(--blue)':'var(--border)'};background:${!f?'var(--blue)':'var(--bg3)'};color:${!f?'#fff':'var(--text2)'};font-weight:${!f?'600':'400'}">Tous</span>`;
  gs.forEach(g=>{
    const on=f===g.id;
    h+=`<span onclick="setGroupeFilter('${g.id}')" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;cursor:pointer;font-size:10px;
      border:1px solid ${g.couleur};background:${on?g.couleur:'var(--bg3)'};color:${on?'#fff':'var(--text2)'}">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${g.couleur};flex:none"></span>${esc(g.nom)}</span>`;
  });
  h+=`</div>`;
  return h;
}
window.setGroupeFilter=function(id){
  nav.groupeFilter=(nav.groupeFilter===id)?null:id;
  render();
};

// ── Élèves actifs / sortis (démission, exclusion, changement de section…) ────
const ARCHIVE_REASONS={demission:'Démission',exclusion:'Exclusion définitive',section:'Changement de section',autre:'Autre'};
function activeStudents(cl)   { return (cl.students||[]).filter(st=>!st.archived); }
function archivedStudents(cl) { return (cl.students||[]).filter(st=>st.archived); }
// Élèves actifs à afficher compte tenu du filtre de groupe en cours
function visibleStudents(cl){
  let sts=activeStudents(cl);
  if(nav.groupeFilter) sts=sts.filter(st=>(st.groupeIds||[]).includes(nav.groupeFilter));
  return sts;
}

// ── Score ────────────────────────────────────────────────────────────────────
function computeScore(act, stId) {
  const sd      = (act.studentData||{})[stId]||{};
  const pres    = sd.presence||{};
  const ch      = sd.checks||{};
  const items   = act.items||[];
  const sessions= act.sessions||[];
  if(items.length===0) return null;

  let absSess=0, presentSess=0;
  sessions.forEach(sess=>{
    const p=pres[sess.id]||'none';
    if(p==='absent') absSess++;
    else if(p==='present') presentSess++;
  });
  const totalSess  = sessions.length;
  const allAbsent  = totalSess>0 && absSess===totalSess;
  const validCount = items.filter(it=>!!ch[it.id]).length;
  const real       = (validCount/items.length)*10;

  // Pondérée : extrapolation si certaines séances absentes
  // pond = min(10, real × totalSéances / séancesPrésentes)
  let pond = null;
  if(presentSess>0 && absSess>0) {
    pond = Math.min(10, real*(totalSess/presentSess));
  }

  return {real, pond, validCount, total:items.length, absSess, presentSess, totalSess, allAbsent};
}

function scoreCls(v) {
  if(v===null||v===undefined) return 'score-na';
  if(v>=7) return 'score-hi';
  if(v>=5) return 'score-mid';
  return 'score-lo';
}
function scoreLbl(v) { return (v!==null&&v!==undefined)?v.toFixed(1):'—'; }

// ── Compétences : calcul par séquence ────────────────────────────────────────
// computeCompAcq : calcule les niveaux de compétences sur les N derniers items
// évalués pour chaque compétence, toutes séquences de la CLASSE confondues.
// "Dernier" = déterminé par la date de séance (ou ordre d'ajout si pas de date).
// Paramètre sq = séquence courante (pour contexte), cl = classe entière.
// ── Acquisition de compétences : calcul auto à partir des items cochés ───────
// Cœur du calcul, sur un ensemble de séquences donné (borne le "par séquence"
// vs "annuel"). Prend les N derniers items tagués par compétence (triés par
// date de séance) et calcule le % de réussite.
function computeCompAcqScoped(cl, stId, sequences, maxLast=3) {
  const comps = getComps(cl);
  const itemsByComp = {};
  comps.forEach(c=>{ itemsByComp[c.id]=[]; });

  (sequences||[]).forEach(sequence=>{
    (sequence.activities||[]).forEach((act,actIdx)=>{
      const sd       = (act.studentData||{})[stId]||{};
      const pres     = sd.presence||{};
      const ch       = sd.checks||{};
      const sessions = act.sessions||[];
      const allAbsent = sessions.length>0 && sessions.every(s=>(pres[s.id]||'none')==='absent');
      if(allAbsent) return;

      const lastSess = sessions.filter(s=>s.date).sort((a,b)=>b.date.localeCompare(a.date))[0];
      const refDate  = lastSess ? lastSess.date : ('0000-'+String(actIdx).padStart(4,'0'));

      (act.items||[]).forEach((item,itemIdx)=>{
        if(!item.compId || !itemsByComp[item.compId]) return;
        itemsByComp[item.compId].push({
          date:    refDate,
          itemIdx,
          checked: !!ch[item.id],
          actId:   act.id,
        });
      });
    });
  });

  const levels = {};
  comps.forEach(c=>{
    const items = itemsByComp[c.id];
    if(!items.length){ levels[c.id]=null; return; }
    items.sort((a,b)=> (b.date||'0000').localeCompare(a.date||'0000') || b.itemIdx-a.itemIdx);
    const last  = items.slice(0, maxLast);
    const val   = last.filter(i=>i.checked).length;
    const tot   = last.length;
    const pct   = (val/tot)*100;
    levels[c.id] = {pct, ...getAcqLevel(pct), val, tot,
                    info:`${val}/${tot} derniers items`};
  });
  return levels;
}
// Par séquence : une seule séquence
function computeCompAcq(cl, sq, stId, maxLast=3) {
  return computeCompAcqScoped(cl, stId, sq?[sq]:[], maxLast);
}
// Annuelle : toutes les séquences de la classe
function computeCompAcqAnnuelle(cl, stId, maxLast=3) {
  return computeCompAcqScoped(cl, stId, cl.sequences||[], maxLast);
}
// Par activité : ratio direct coché/total sur les items de CETTE activité
// uniquement (pas de fenêtre "N derniers", une activité a peu d'items).
function computeCompAcqActivite(act, stId, comps) {
  const ch = ((act.studentData||{})[stId]||{}).checks||{};
  const byComp = {};
  comps.forEach(c=>{ byComp[c.id]=[]; });
  (act.items||[]).forEach(item=>{
    if(!item.compId || !byComp[item.compId]) return;
    byComp[item.compId].push(!!ch[item.id]);
  });
  const levels={};
  comps.forEach(c=>{
    const arr=byComp[c.id];
    if(!arr.length){ levels[c.id]=null; return; }
    const val=arr.filter(Boolean).length, tot=arr.length, pct=(val/tot)*100;
    levels[c.id]={pct, ...getAcqLevel(pct), val, tot, info:`${val}/${tot} items de l'activité`};
  });
  return levels;
}

// ── Stars ────────────────────────────────────────────────────────────────────
const S_LABELS=['·','★★★★','★★★☆','★★☆☆','★☆☆☆'];
const S_TIPS  =['Non renseigné','Excellent','Bien','Moyen','Insuffisant'];
function starWidget(lv,actId,stId,sessId,key,canEdit,forProj) {
  const l=(lv===undefined||lv===null)?0:lv;
  const cls=`star-${l}${(!canEdit||forProj)?' star-readonly':''}`;
  const oc=(canEdit&&!forProj)?`onclick="cycleStar('${actId}','${stId}','${sessId}_${key}')" `:'';
  return `<div class="star-widget ${cls}" ${oc}title="${S_TIPS[l]}">${S_LABELS[l]}</div>`;
}

// ── Render ───────────────────────────────────────────────────────────────────
// Migration douce et idempotente des données (compat. anciennes versions).
// Appelée à chaque render : ne modifie/sauvegarde QUE si un vrai changement a
// eu lieu, donc quasi gratuite en régime normal.
function migrateData(){
  if(!D||!D.classes) return;
  let changed=false;
  D.classes.forEach(cl=>{
    // 1) niveau : ancien '3eme' → '3pm'
    if(cl.niveau==='3eme'){ cl.niveau='3pm'; changed=true; }
    if(!cl.niveau){ cl.niveau='bac_pro'; changed=true; }
    // 2) items tagués sur un ancien code de compétence
    const valid=getComps(cl).map(c=>c.id);
    // Remap des anciens codes Bac Pro (6 comp. → 5 comp.) et socle→pro
    const remap = normNiveau(cl.niveau)==='3pm'
      ? {C1:'CH',C2:'MO',C3:'RE',C4:'RA',C5:'CA',C6:'CO'}   // ancien tag pro sur une classe repassée 3PM
      : {C6:'C5', CH:'C1',MO:'C2',RE:'C3',RA:'C4',CA:'C5',CO:'C5'}; // ancien tag 6-comp/socle → 5-comp pro
    (cl.sequences||[]).forEach(sq=>{
      (sq.activities||[]).forEach(act=>{
        (act.items||[]).forEach(it=>{
          if(it.compId && valid.indexOf(it.compId)<0 && remap[it.compId]){
            it.compId=remap[it.compId]; changed=true;
          }
        });
        // 3) observations manuelles portant un ancien code de compétence
        if(act.manualComps){
          Object.keys(act.manualComps).forEach(stId=>{
            const mc=act.manualComps[stId]; if(!mc) return;
            Object.keys(mc).forEach(cid=>{
              if(valid.indexOf(cid)<0 && remap[cid]){
                const tgt=remap[cid];
                // si la cible existe déjà, on garde le niveau le plus élevé
                mc[tgt]=(mc[tgt]===undefined)?mc[cid]:Math.max(mc[tgt],mc[cid]);
                delete mc[cid]; changed=true;
              }
            });
          });
        }
      });
    });
  });
  if(changed && typeof saveData==='function') saveData();
}

function render() {
  migrateData();
  renderTopbar();
  const mc=document.getElementById('main-content');
  if(nav.screen==='home')       renderHome(mc);
  else if(nav.screen==='class') renderClass(mc);
  else if(nav.screen==='seq')   renderSeq(mc);
  updateFab();
}

// Activation mode prof :
//   Desktop  : triple-clic sur logo  OU  Ctrl+Shift+P
//   Mobile   : appui long sur logo (maintenir ~1 seconde)
let _logoClicks=0, _logoTimer=null;
let _pressTimer=null, _pressActive=false;

window.logoClick=function(){
  if(_pressActive) return; // appui long déjà géré
  _logoClicks++;
  clearTimeout(_logoTimer);
  if(_logoClicks>=3){ _logoClicks=0; openModal('login'); return; }
  _logoTimer=setTimeout(()=>{ _logoClicks=0; goHome(); },500);
};

// Appui long pour mobile
window.logoTouchStart=function(e){
  _pressActive=false;
  _pressTimer=setTimeout(()=>{
    _pressActive=true;
    e.preventDefault();
    if(D.isProfMode) logoutProf();
    else openModal('login');
  },800);
};
window.logoTouchEnd=function(){
  clearTimeout(_pressTimer);
};

function renderTopbar() {
  const bc=document.getElementById('breadcrumb');
  // Mise à jour du logo pour triple-clic
  const logoEl=document.querySelector('.logo');
  if(logoEl){
    logoEl.onclick      = window.logoClick;
    logoEl.ontouchstart = window.logoTouchStart;
    logoEl.ontouchend   = window.logoTouchEnd;
    logoEl.style.webkitUserSelect = 'none';
    logoEl.style.userSelect = 'none';
  }
  let bh='';
  if(nav.screen!=='home') bh+=`<button class="bc-btn" onclick="goHome()">Classes</button>`;
  if(nav.classId){const cl=getClass(nav.classId);if(cl){
    bh+=`<span class="bc-sep">›</span>`;
    if(nav.screen!=='class') bh+=`<button class="bc-btn" onclick="goClass('${cl.id}')">${esc(cl.name)}</button>`;
    else bh+=`<span style="padding:3px 6px;font-size:12px">${esc(cl.name)}</span>`;
  }}
  if(nav.seqId&&nav.classId){const cl=getClass(nav.classId);const sq=cl&&getSeq(cl,nav.seqId);
    if(sq) bh+=`<span class="bc-sep">›</span><span style="padding:3px 6px;font-size:12px">${esc(sq.name)}</span>`;
  }
  bc.innerHTML=bh;

  const tr=document.getElementById('topbar-right');
  let rh='';
  // Liens ressources (toujours visibles)
  rh+=`<a href="https://www.youtube.com/@partagerlessavoirfaire" target="_blank" class="btn btn-sm btn-icon" title="Tutoriels vidéo" style="text-decoration:none">▶</a>`;
  rh+=`<a href="https://outilslp.netlify.app/" target="_blank" class="btn btn-sm btn-icon" title="Outils à disposition" style="text-decoration:none">🧰</a>`;
  // Build grille_items URL with auth context
  let _grilleUrl='grille_items.html';
  if(D.isProfMode){
    // Store ownerCode in localStorage so grille can auto-login
    try{ const oc=localStorage.getItem('suiviAcquis_ownerCode')||'';
      if(oc) _grilleUrl='grille_items.html?mode=prof&oc='+encodeURIComponent(oc); }catch(e){}
  } else if(nav.classId){
    const _grcl=curClass();
    if(_grcl&&_grcl.viewCode) _grilleUrl='grille_items.html?classe='+encodeURIComponent(_grcl.viewCode);
  }
  rh+=`<a href="${_grilleUrl}" target="_blank" class="btn btn-sm" title="Grille des items — nouvel onglet" style="text-decoration:none;font-size:11px">⬛ Programme</a>`;
  if(D.isProfMode){
    if(nav.screen==='seq')   rh+=`<button class="btn btn-sm btn-primary" onclick="openModal('addActivity')">+ Activité</button>`;
    if(nav.screen!=='home')  rh+=`<button class="btn btn-sm" onclick="openModal('addSeq')">+ Séquence</button>`;
    if(nav.screen==='class') rh+=`<button class="btn btn-sm" onclick="openModal('addStudent')">+ Élèves</button>`;
    if(nav.screen==='seq')   rh+=`<button class="btn btn-sm btn-icon" title="Vidéoprojecteur" onclick="openProjector()">⊞</button>`;
    rh+=`<button class="btn btn-sm btn-icon" title="Paramètres" onclick="openModal('settings')">⚙</button>`;
    rh+=`<span class="badge" style="background:#fee2e2;color:#991b1b;border-color:#fca5a5">Prof</span>`;
    rh+=`<button class="btn btn-sm btn-danger" onclick="logoutProf()">✕</button>`;
  } else {
    if(nav.screen==='seq') rh+=`<button class="btn btn-sm btn-icon" title="Vidéoprojecteur" onclick="openProjector()">⊞</button>`;
    // PAS de bouton "Mode prof" visible — activation par triple-clic logo ou Ctrl+Shift+P
  }
  rh += `<span id="sync-indicator" class="sync-dot sync-local" title="Mode local">⚪</span>`;
  tr.innerHTML=rh;
  setSyncState(_syncState||'local');
}

// ── Home ─────────────────────────────────────────────────────────────────────
function renderHome(mc) {
  let h=`<div class="page">`;
  if(D.isProfMode){
    // ── Vue prof : toutes les classes ──────────────────────────────────────
    const years = allSchoolYears();
    const curY  = currentSchoolYear();
    if(!nav.anneeFilter) nav.anneeFilter = curY;
    // S'assurer que le filtre existe parmi les années dispo
    if(years.length && !years.includes(nav.anneeFilter)) nav.anneeFilter = years[0];

    // Sélecteur d'année
    h+=`<div class="section-hdr">
      <span class="section-title">Classes</span>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">`;
    years.forEach(y=>{
      const active = nav.anneeFilter===y;
      h+=`<button onclick="setAnneeFilter('${y}')" style="padding:3px 10px;border-radius:10px;font-size:11px;font-weight:${active?'600':'400'};border:1px solid ${active?'var(--blue)':'var(--border2)'};background:${active?'var(--blue-bg)':'var(--bg2)'};color:${active?'var(--blue)':'var(--text2)'};cursor:pointer;font-family:var(--font)">${y}</button>`;
    });
    h+=`</div></div>`;

    const filtered = D.classes.filter(cl=>(cl.annee||curY)===nav.anneeFilter);
    h+=`<div class="card-grid">`;
    filtered.forEach(cl=>{
      const niv = {'3pm':'3ᵉ PM','bac_pro':'BAC PRO','cap':'CAP'}[normNiveau(cl.niveau)]||'BAC PRO';
      h+=`<div class="card class-card" style="position:relative" onclick="goClass('${cl.id}')">
        <div class="class-card-name">${esc(cl.name)}</div>
        <div class="class-card-sub">${niv} · ${(cl.sequences||[]).length} séq. · ${activeStudents(cl).length} élèves</div>
        <div style="margin-top:6px;font-size:10px;color:var(--text3)">
          Code élèves : <span style="font-family:monospace;font-weight:600;color:var(--blue)">${cl.viewCode||'—'}</span>
        </div>
        ${groupementsBadges(cl)}
        <div style="position:absolute;bottom:8px;right:8px;display:flex;gap:4px" onclick="event.stopPropagation()">
          <button class="btn btn-xs" onclick="openModal('editClass','${cl.id}')" title="Modifier">✏</button>
          <button class="btn btn-xs" onclick="openModal('transferClass','${cl.id}')" title="Transférer à un collègue">🔁</button>
          <button class="btn btn-xs btn-danger" onclick="deleteItem('class','${cl.id}')" title="Supprimer la classe">🗑</button>
        </div>
      </div>`;
    });
    h+=`<div class="card card-add" onclick="openModal('addClass')"><div style="font-size:22px;font-weight:300">+</div><div style="font-size:11px">Nouvelle classe</div></div>`;
    // Bouton pour recevoir une classe via code de transfert
    h+=`<div style="margin-top:12px;text-align:right"><button class="btn btn-sm" onclick="openModal('claimTransfer')" style="font-size:11px">📥 Reprendre une classe d'un collègue</button></div>`;
    h+=`</div>`;
  } else {
    // ── Vue élève : saisie du code de classe ───────────────────────────────
    h+=`<div style="max-width:380px;margin:40px auto;text-align:center">
      <div style="font-size:32px;margin-bottom:12px">📚</div>
      <div style="font-size:18px;font-weight:600;margin-bottom:6px">Suivi des Acquis</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:24px">Entrez le code de votre classe pour consulter votre avancement.</div>
      <input class="form-input" id="class-code-input" placeholder="Code de la classe" maxlength="8"
        style="text-align:center;font-size:18px;font-weight:600;letter-spacing:4px;text-transform:uppercase;margin-bottom:12px"
        oninput="this.value=this.value.toUpperCase()"
        onkeydown="if(event.key==='Enter')enterClassCode()">
      <button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="enterClassCode()">Accéder à ma classe</button>
      <div id="code-err" style="color:var(--red);font-size:12px;margin-top:8px"></div>
      <div style="margin-top:32px;font-size:11px;color:var(--text3)">
        Code fourni par votre professeur<br>
        <a href="https://www.youtube.com/@partagerlessavoirfaire" target="_blank" style="color:var(--blue)">▶ Tutoriels</a>
        &nbsp;·&nbsp;
        <a href="https://outilslp.netlify.app/" target="_blank" style="color:var(--blue)">🧰 Outils</a>
      </div>
    </div>`;
    // Vérifier URL hash (#CODE)
    const hashCode = window.location.hash.slice(1).toUpperCase();
    if(hashCode) setTimeout(()=>{
      document.getElementById('class-code-input').value=hashCode;
      enterClassCode();
    },100);
  }
  h+=`</div>`;
  mc.innerHTML=h;
}

window.enterClassCode=async function(){
  const code=(document.getElementById('class-code-input').value||'').trim().toUpperCase();
  const errEl=document.getElementById('code-err');
  errEl.textContent='';

  // 1. Local
  let cl=D.classes.find(c=>(c.viewCode||'').toUpperCase()===code);
  if(cl){ sessionStorage.setItem('studentClassId',cl.id); goClass(cl.id); return; }

  // 2. Supabase (mode anonyme)
  if(window._sb){
    errEl.textContent='Recherche…';
    try{
      const {data,error}=await window._sb.rpc('find_class_by_view_code',{p_view_code:code});
      if(!error && data){
        if(!D.classes.find(c=>c.id===data.id)) D.classes.push(data);
        sessionStorage.setItem('studentClassId',data.id);
        setSyncState('synced');
        goClass(data.id);
        return;
      }
    }catch(e){ console.warn('[enterClassCode RPC]',e); }
    setSyncState('local');
  }

  errEl.textContent='Code incorrect — vérifiez avec votre professeur.';
};

// ── Class view ───────────────────────────────────────────────────────────────
function renderClass(mc) {
  const cl=getClass(nav.classId); if(!cl){goHome();return;}
  const seqs=cl.sequences||[], sts=visibleStudents(cl);
  const archived=archivedStudents(cl);
  let h=`<div class="page">`;
  // Afficher le code de la classe pour le prof
  if(D.isProfMode && cl.viewCode){
    const shareUrl=window.location.origin+window.location.pathname+'#'+cl.viewCode;
    const grpBadges=groupementsBadges(cl);
    h+=`<div class="info-banner" style="margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span>Code élèves : <strong style="font-family:monospace;font-size:15px;letter-spacing:2px">${cl.viewCode}</strong></span>
      <span style="color:var(--text3)">·</span>
      <span style="font-size:11px">URL : <a href="${shareUrl}" target="_blank" style="color:var(--blue)">${shareUrl}</a></span>
      <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>toast('✓ URL copiée'))" title="Copier l'URL">📋</button>
      <button class="btn btn-sm" onclick="openModal('editClass','${cl.id}')" title="Modifier la classe">✏ Modifier</button>
      ${grpBadges?`<span style="display:flex;align-items:center;gap:3px">${grpBadges}</span>`:''}
    </div>`;
  }
  h+=`<div class="section-hdr"><span class="section-title">Séquences</span><span class="badge">${seqs.length}</span></div>`;
  h+=`<div class="card-grid">`;
  seqs.forEach(sq=>{
    h+=`<div class="card class-card" style="position:relative" onclick="goSeq('${sq.id}')">`;
    if(D.isProfMode) h+=`<div style="position:absolute;top:8px;right:8px;display:flex;gap:2px" onclick="event.stopPropagation()">
      <button class="btn btn-xs btn-icon" onclick="renameItem('seq','${sq.id}')" title="Renommer">✏</button>
      <button class="btn btn-xs btn-icon" style="color:var(--red)" onclick="deleteItem('seq','${sq.id}')" title="Supprimer">✕</button>
    </div>`;
    h+=`<div class="class-card-name" style="font-size:13px;padding-right:48px">${esc(sq.name)}</div>
      <div class="class-card-sub">${(sq.activities||[]).length} activité(s)</div></div>`;
  });
  if(D.isProfMode) h+=`<div class="card card-add" onclick="openModal('addSeq')"><div style="font-size:22px;font-weight:300">+</div><div style="font-size:11px">Nouvelle séquence</div></div>`;
  h+=`</div>`;
  if(seqs.length>0&&sts.length>0){
    try { h+=renderGlobalView(cl); }
    catch(e){ console.error('[renderGlobalView]',e); h+=`<div class="no-data" style="color:var(--red)">Erreur d'affichage de la vue globale — ${esc(e.message)}</div>`; }
    try { h+=renderAnnualCompTable(cl); }
    catch(e){ console.error('[renderAnnualCompTable]',e); h+=`<div class="no-data" style="color:var(--red)">Erreur d'affichage du bilan annuel — ${esc(e.message)}</div>`; }
  }
  if(D.isProfMode){
    const activeCount=activeStudents(cl).length;
    h+=`<div class="section-hdr" style="margin-top:20px">
      <span class="section-title">Élèves</span>
      <span class="badge">${sts.length} élève${sts.length>1?'s':''}${nav.groupeFilter?` / ${activeCount}`:''}</span>
      <button class="btn btn-sm" style="margin-left:auto" onclick="openModal('manageGroupes')" title="Créer et affecter des groupes">🎨 Groupes</button>
    </div>`;
    h+=groupesFilterHTML(cl);
    h+=`<div class="student-pills">`;
    sts.forEach(st=>{
      h+=`<div class="student-pill">${groupeDotsHTML(cl,st)}${esc(st.name)}`;
      h+=`<button class="pill-del" onclick="openModal('archiveStudent','${st.id}')" title="Sortir cet élève (démission, exclusion, changement de section…)">📤</button>`;
      h+=`</div>`;
    });
    h+=`</div>`;
    if(archived.length>0){
      h+=`<div class="section-hdr" style="margin-top:14px">
        <span class="section-title" style="color:var(--text3)">Élèves sortis</span>
        <span class="badge">${archived.length}</span>
      </div>`;
      h+=`<div class="student-pills">`;
      archived.forEach(st=>{
        const reason=ARCHIVE_REASONS[st.archiveReason]||'Sorti';
        const d=st.archiveDate?fmtDate(st.archiveDate):'';
        const detail=[reason,d].filter(Boolean).join(' · ')+(st.archiveNote?` — ${esc(st.archiveNote)}`:'');
        h+=`<div class="student-pill" style="opacity:.65" title="${esc(detail)}">${esc(st.name)}
          <span style="font-size:9px;color:var(--text3);margin-left:4px">(${esc(reason)}${d?' · '+d:''})</span>
          <button class="pill-del" style="color:var(--green)" onclick="restoreStudent('${st.id}')" title="Réintégrer dans la classe">↩</button>
          <button class="pill-del" onclick="deleteItem('student','${st.id}')" title="Supprimer définitivement (perte des données)">🗑</button>
        </div>`;
      });
      h+=`</div>`;
    }
  }
  h+=`</div>`;
  mc.innerHTML=h;
}

// ── Global view ──────────────────────────────────────────────────────────────
function renderGlobalView(cl) {
  const sts=visibleStudents(cl), seqs=cl.sequences||[];
  const comps=getComps(cl);
  let h=`<div class="section-hdr"><span class="section-title">Vue globale des notes et compétences</span></div>`;
  h+=`<div class="card" style="overflow:hidden;margin-bottom:8px">`;
  h+=`<div class="seq-tabs-wrap" id="gv-tabs">`;
  seqs.forEach((sq,i)=>h+=`<button class="seq-tab${i===0?' active':''}" data-sqid="${sq.id}" onclick="switchGV('${sq.id}')">${esc(sq.name)}</button>`);
  h+=`</div>`;

  seqs.forEach((sq,si)=>{
    const acts=sq.activities||[];
    h+=`<div class="gv-panel" id="gvp-${sq.id}" style="${si!==0?'display:none':''}">`;
    if(!acts.length){h+=`<div class="no-data">Aucune activité.</div>`;h+=`</div>`;return;}

    const hasComps=acts.some(a=>(a.items||[]).some(it=>it.compId));

    h+=`<div class="table-scroll"><table><thead><tr>`;
    h+=`<th class="th-student">Élève</th>`;
    acts.forEach(act=>{
      h+=`<th style="font-size:10px;padding:4px 6px;min-width:65px">${esc(act.name)}</th>`;
      (act.qcmNotes||[]).forEach(q=>{
        h+=`<th style="font-size:10px;padding:4px 6px;min-width:60px;background:#f0fdf4;color:#166534">
          📝 ${esc(q.name)}<br>
          <span style="font-weight:400;font-size:9px">/${q.max}/10${q.date?' · '+fmtDate(q.date):''}</span>
        </th>`;
      });
    });
    if(hasComps) comps.forEach(c=>h+=`<th style="font-size:9px;padding:3px 5px;min-width:42px;background:${c.color};color:${c.text};cursor:help" title="${esc(compTip(cl,c))}">${c.short}</th>`);
    h+=`</tr></thead><tbody>`;

    const avgs=acts.map(act=>{
      const vals=sts.map(st=>{
        const _sdA=(act.studentData||{})[st.id]||{};
        if(_sdA.manualMark==='A'||_sdA.manualMark==='N') return null;
        const r=computeScore(act,st.id);
        return(r&&!r.allAbsent)?r.real:null;
      }).filter(v=>v!==null);
      const actAvg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
      const qcmAvgs=(act.qcmNotes||[]).map(q=>{
        const qvals=sts.map(st=>{
          const s=(q.scores||{})[st.id];
          return(s!==undefined&&s!==null&&s!=='A'&&s!=='N')?(s/q.max*10):null;
        }).filter(v=>v!==null);
        return qvals.length?qvals.reduce((a,b)=>a+b,0)/qvals.length:null;
      });
      return {actAvg,qcmAvgs};
    });

    sts.forEach(st=>{
      h+=`<tr><td class="td-student">${groupeDotsHTML(cl,st)}${displayName(st.name,false)}</td>`;
      acts.forEach(act=>{
        const _sdGV=(act.studentData||{})[st.id]||{};
        const mm=_sdGV.manualMark;
        if(mm==='A'){h+=`<td class="gv-score" style="color:#6b7280;background:#f3f4f6;font-weight:700">A</td>`;}
        else if(mm==='N'){h+=`<td class="gv-score" style="color:#92400e;background:#fef3c780;font-weight:700">N</td>`;}
        else{
          const res=computeScore(act,st.id);
          if(!res){h+=`<td class="gv-score score-na">—</td>`;}
          else if(res.allAbsent){h+=`<td class="gv-score" style="color:#6b7280;background:#f3f4f6;font-weight:700">A</td>`;}
          else{h+=`<td class="gv-score ${scoreCls(res.real)}">${scoreLbl(res.real)}</td>`;}
        }
        (act.qcmNotes||[]).forEach(q=>{
          const score=(q.scores||{})[st.id];
          const isA=score==='A', isN=score==='N', isSpecial=isA||isN;
          const on10=(!isSpecial&&score!==undefined&&score!==null)?(score/q.max*10):null;
          if(isA) h+=`<td class="gv-score" style="background:#f0fdf480;color:#6b7280;font-weight:700">A</td>`;
          else if(isN) h+=`<td class="gv-score" style="background:#f0fdf480;color:#92400e;font-weight:700">N</td>`;
          else h+=`<td class="gv-score ${on10!==null?scoreCls(on10):'score-na'}" style="background:#f0fdf480">${on10!==null?on10.toFixed(1):'—'}</td>`;
        });
      });
      if(hasComps){
        const lvls=computeCompAcq(cl,sq,st.id);
        comps.forEach(c=>{
          const lv=lvls[c.id];
          if(!lv){h+=`<td style="font-size:9px;text-align:center;color:var(--text3);background:${c.color}20">·</td>`;return;}
          h+=`<td style="font-size:10px;font-weight:700;text-align:center;background:${lv.bg};color:${lv.fg}" title="${lv.label} (${lv.pct.toFixed(0)}%)">${lv.id}</td>`;
        });
      }
      h+=`</tr>`;
    });

    h+=`<tr style="border-top:2px solid var(--border2);background:var(--bg3)">`;
    h+=`<td class="td-student" style="font-weight:600;font-style:italic;color:var(--text2)">Moyenne</td>`;
    avgs.forEach(a=>{
      if(a.actAvg===null){h+=`<td class="gv-score score-na">—</td>`;}
      else{h+=`<td class="gv-score ${scoreCls(a.actAvg)}" style="font-weight:700">${a.actAvg.toFixed(1)}</td>`;}
      a.qcmAvgs.forEach(qAvg=>{
        if(qAvg===null){h+=`<td class="gv-score score-na" style="background:#f0fdf480">—</td>`;}
        else{h+=`<td class="gv-score ${scoreCls(qAvg)}" style="font-weight:700;background:#f0fdf480">${qAvg.toFixed(1)}</td>`;}
      });
    });
    if(hasComps) comps.forEach(()=>h+=`<td></td>`);
    h+=`</tr>`;

    h+=`</tbody></table></div>`;

    const hasSocle=usesSocle(cl) && acts.some(a=>(a.items||[]).some(it=>it.compId));
    if(hasSocle){
      const domLabel='Domaines du socle commun (DNB)';
      h+=`<div style="padding:12px 14px 0">
        <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:8px;display:flex;align-items:center;gap:10px">
          ${domLabel}
          <button class="btn btn-xs" onclick="exportLivret('${cl.id}','${sq.id}')" style="font-size:10px">📋 Export Livret</button>
        </div>
        <div class="table-scroll"><table>
        <thead><tr><th class="th-student">Élève</th>`;
      SOCLE.forEach(dom=>h+=`<th style="font-size:9px;padding:3px 5px;min-width:48px;background:${dom.color};color:${dom.text}" title="${esc(dom.desc)}">${dom.id}</th>`);
      h+=`</tr></thead><tbody>`;
      sts.forEach(st=>{
        const sLvls=computeSocleAcq(cl,sq,st.id);
        h+=`<tr><td class="td-student">${groupeDotsHTML(cl,st)}${displayName(st.name,false)}</td>`;
        SOCLE.forEach(dom=>{
          const lv=sLvls[dom.id];
          if(!lv){h+=`<td style="font-size:9px;text-align:center;color:var(--text3)">·</td>`;return;}
          h+=`<td style="font-size:10px;font-weight:700;text-align:center;background:${lv.bg};color:${lv.fg};cursor:help"
              title="${dom.label}\n${lv.label} (${lv.pct.toFixed(0)}%)">${lv.id}</td>`;
        });
        h+=`</tr>`;
      });
      h+=`</tbody></table></div></div>`;
    }

    h+=`</div>`;
  });
  h+=`</div>`;
  return h;
}

// ── Bilan annuel des compétences (toutes séquences confondues) ──────────────
function renderAnnualCompTable(cl) {
  const sts=visibleStudents(cl);
  const comps=getComps(cl);
  const hasComps=(cl.sequences||[]).some(sq=>(sq.activities||[]).some(a=>(a.items||[]).some(it=>it.compId)));
  if(!hasComps||!sts.length) return '';
  const showSocle=usesSocle(cl);
  let h=`<div class="section-hdr" style="margin-top:14px">
    <span class="section-title">Bilan annuel des compétences</span>
    <span style="font-size:10px;color:var(--text3);margin-left:8px">3 derniers items par compétence, toutes séquences confondues</span>
  </div>`;
  h+=`<div class="card" style="overflow:hidden;margin-bottom:8px"><div class="table-scroll"><table><thead><tr><th class="th-student">Élève</th>`;
  comps.forEach(c=>h+=`<th style="font-size:9px;padding:3px 5px;min-width:42px;background:${c.color};color:${c.text};cursor:help" title="${esc(compTip(cl,c))}">${c.short}</th>`);
  h+=`</tr></thead><tbody>`;
  sts.forEach(st=>{
    const lvls=computeCompAcqAnnuelle(cl,st.id);
    h+=`<tr><td class="td-student">${groupeDotsHTML(cl,st)}${displayName(st.name,false)}</td>`;
    comps.forEach(c=>{
      const lv=lvls[c.id];
      if(!lv){h+=`<td style="font-size:9px;text-align:center;color:var(--text3)">·</td>`;return;}
      h+=`<td style="font-size:10px;font-weight:700;text-align:center;background:${lv.bg};color:${lv.fg};cursor:help" title="${esc(c.label)}\n${lv.label} (${lv.pct.toFixed(0)}%) — ${lv.info}">${lv.id}</td>`;
    });
    h+=`</tr>`;
  });
  h+=`</tbody></table></div></div>`;
  if(showSocle){
    h+=`<div style="padding:0 0 8px"><div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:8px">Domaines du socle commun (DNB) — bilan annuel</div>
      <div class="card" style="overflow:hidden"><div class="table-scroll"><table><thead><tr><th class="th-student">Élève</th>`;
    SOCLE.forEach(dom=>h+=`<th style="font-size:9px;padding:3px 5px;min-width:48px;background:${dom.color};color:${dom.text}" title="${esc(dom.desc)}">${dom.id}</th>`);
    h+=`</tr></thead><tbody>`;
    sts.forEach(st=>{
      const sLvls=computeSocleAcqAnnuelle(cl,st.id);
      h+=`<tr><td class="td-student">${groupeDotsHTML(cl,st)}${displayName(st.name,false)}</td>`;
      SOCLE.forEach(dom=>{
        const lv=sLvls[dom.id];
        if(!lv){h+=`<td style="font-size:9px;text-align:center;color:var(--text3)">·</td>`;return;}
        h+=`<td style="font-size:10px;font-weight:700;text-align:center;background:${lv.bg};color:${lv.fg};cursor:help" title="${dom.label}\n${lv.label} (${lv.pct.toFixed(0)}%)">${lv.id}</td>`;
      });
      h+=`</tr>`;
    });
    h+=`</tbody></table></div></div></div>`;
  }
  return h;
}

window.switchGV=function(sqId){
  document.querySelectorAll('.gv-panel').forEach(p=>p.style.display='none');
  document.querySelectorAll('#gv-tabs .seq-tab').forEach(t=>t.classList.toggle('active',t.dataset.sqid===sqId));
  const p=document.getElementById('gvp-'+sqId);if(p)p.style.display='';
};

// ── Seq view ─────────────────────────────────────────────────────────────────
function renderSeq(mc) {
  const cl=curClass(),sq=curSeq();
  if(!cl){goHome();return;} if(!sq){goClass(nav.classId);return;}
  const sts=visibleStudents(cl),acts=sq.activities||[];
  let h='';
  h+=`<div class="seq-tabs-wrap">`;
  (cl.sequences||[]).forEach(s=>h+=`<button class="seq-tab${s.id===nav.seqId?' active':''}" onclick="goSeq('${s.id}')">${esc(s.name)}</button>`);
  if(D.isProfMode) h+=`<button class="seq-tab seq-tab-more" onclick="openModal('addSeq')" title="Nouvelle séquence">+</button>`;
  h+=`</div><div class="page">`;
  h+=groupesFilterHTML(cl);
  if(!acts.length) h+=`<div class="no-data">Aucune activité.${D.isProfMode?' Cliquez sur "+ Activité".':''}</div>`;
  else acts.forEach(act=>{
    try { h+=renderActivity(act,sts,cl,false); }
    catch(e){ console.error('[renderActivity]',e); h+=`<div class="act-block"><div class="act-header"><span class="act-name">${esc(act.name)}</span></div><div class="no-data" style="color:var(--red)">Erreur : ${esc(e.message)}</div></div>`; }
  });
  h+=`</div>`;
  mc.innerHTML=h;
}

// ── Activity ─────────────────────────────────────────────────────────────────
function renderActivity(act,sts,cl,forProj) {
  const isLocked=!!act.locked, canEdit=D.isProfMode&&!isLocked&&!forProj;
  const sessions=act.sessions||[], items=act.items||[];
  let h=`<div class="act-block"><div class="act-header">`;
  h+=`<span class="act-name">${esc(act.name)}</span>`;
  if(isLocked) h+=`<span class="locked-tag">🔒 Terminée</span>`;
  if(D.isProfMode&&!forProj){
    h+=`<button class="lock-btn" onclick="toggleLock('${act.id}')" title="${isLocked?'Déverrouiller':'Verrouiller'}">${isLocked?'🔓':'🔒'}</button>`;
    h+=`<div class="act-hdr-right">`;
    if(!isLocked){
      h+=`<button class="btn btn-sm" onclick="openModal('addSession','${act.id}')">+ Séance</button>`;
      h+=`<button class="btn btn-sm" onclick="openModal('addItems','${act.id}')">+ Items</button>`;
      h+=`<button class="btn btn-sm" onclick="openModal('tagProg','${act.id}')" title="Lier des items du programme">🔗 Items</button>`;
    }
    h+=`<button class="btn btn-xs btn-icon" onclick="renameItem('act','${act.id}')" title="Renommer">✏</button>`;
    h+=`<button class="btn btn-xs btn-icon" style="color:var(--red)" onclick="deleteItem('act','${act.id}')" title="Supprimer">✕</button>`;
    h+=`</div>`;
  }
  h+=`</div>`;
  if(isLocked) h+=`<div class="act-locked-bar">🔒 Activité verrouillée — notes définitives.</div>`;
  // ── Items programme liés ─────────────────────────────────────────────
  const progItems=act.progItems||[];
  if(progItems.length>0){
    h+=`<div class="prog-tags-bar">`;
    h+=`<span class="prog-tags-lbl">📌 Items&nbsp;:</span>`;
    progItems.forEach(pi=>{
      h+=`<span class="prog-tag" title="${esc(pi.contenu)}">${esc(pi.code)}`;
      if(canEdit) h+=`<span class="prog-tag-del" onclick="removeProgItem('${act.id}','${pi.code}')">×</span>`;
      h+=`</span>`;
    });
    h+=`</div>`;
  }
  if(!sessions.length&&!items.length)
    h+=`<div class="no-data" style="padding:20px">Aucune séance ni item.${canEdit?' Ajoutez une séance et des items.':''}</div>`;
  else h+=renderActTable(act,sts,cl,forProj);

  // ── Notes ponctuelles QCM ──────────────────────────────────────────────────
  const qcms=act.qcmNotes||[];
  if(qcms.length>0||(canEdit&&!isLocked)){
    h+=`<div style="border-top:1px solid var(--border);padding:10px 14px;background:var(--bg3)">`;
    h+=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:${qcms.length?'8':'0'}px">`;
    h+=`<span style="font-size:11px;font-weight:600;color:var(--text2)">📝 Notes ponctuelles</span>`;
    if(canEdit) h+=`<button class="btn btn-xs" onclick="openModal('addQCM','${act.id}')">+ Ajouter</button>`;
    h+=`</div>`;
    if(qcms.length>0){
      h+=`<div class="table-scroll"><table><thead><tr>`;
      h+=`<th class="th-student">Élève</th>`;
      qcms.forEach((q,qi)=>{
        h+=`<th style="font-size:10px;padding:4px 6px;min-width:60px">
          ${esc(q.name)}<br>
          <span style="font-weight:400;font-size:9px">/${q.max}${q.date?' · '+fmtDate(q.date):''}</span>
          ${canEdit?`<br><span style="cursor:pointer;color:var(--red);font-size:8px" onclick="deleteQCM('${act.id}','${q.id}')">✕</span>`:''}
        </th>`;
        h+=`<th style="font-size:9px;padding:3px 4px;min-width:38px;background:#f0fdf4;color:#166534">/10</th>`;
      });
      h+=`</tr></thead><tbody>`;
      sts.forEach(st=>{
        h+=`<tr><td class="td-student">${groupeDotsHTML(cl,st)}${displayName(st.name,false)}</td>`;
        qcms.forEach(q=>{
          const score=(q.scores||{})[st.id];
          const isA=score==='A', isN=score==='N', isSpecial=isA||isN;
          const on10=(!isSpecial&&score!==undefined&&score!==null)?(score/q.max*10):null;
          h+=`<td style="padding:2px 4px;text-align:center;min-width:70px">`;
          if(canEdit){
            h+=`<div style="display:flex;align-items:center;gap:2px;justify-content:center">`;
            if(!isSpecial){
              h+=`<input type="number" min="0" max="${q.max}" value="${score!==undefined&&score!==null?score:''}"
                style="width:38px;border:1px solid var(--border2);border-radius:4px;padding:2px 3px;font-size:11px;text-align:center;background:var(--bg2);color:var(--text)"
                onchange="setQCMScore('${act.id}','${q.id}','${st.id}',this.value)" placeholder="—">`;
            } else {
              h+=`<span style="width:38px;text-align:center;font-size:13px;font-weight:700;color:${isA?'#6b7280':'#92400e'}">${score}</span>`;
            }
            h+=`<button onclick="setQCMScore('${act.id}','${q.id}','${st.id}','A');render()" title="Absent"
              style="font-size:9px;padding:1px 4px;border-radius:3px;border:1px solid ${isA?'#6b7280':'var(--border2)'};background:${isA?'#e5e7eb':'var(--bg2)'};color:#6b7280;cursor:pointer;font-weight:${isA?'700':'400'}">A</button>`;
            h+=`<button onclick="setQCMScore('${act.id}','${q.id}','${st.id}','N');render()" title="Non noté"
              style="font-size:9px;padding:1px 4px;border-radius:3px;border:1px solid ${isN?'#92400e':'var(--border2)'};background:${isN?'#fef3c7':'var(--bg2)'};color:#92400e;cursor:pointer;font-weight:${isN?'700':'400'}">N</button>`;
            if(isSpecial){
              h+=`<button onclick="setQCMScore('${act.id}','${q.id}','${st.id}','');render()" title="Effacer"
                style="font-size:9px;padding:1px 4px;border-radius:3px;border:1px solid var(--border2);background:var(--bg2);color:var(--red);cursor:pointer">×</button>`;
            }
            h+=`</div>`;
          } else {
            if(isA) h+=`<span style="font-size:11px;color:#6b7280;font-weight:700">A</span>`;
            else if(isN) h+=`<span style="font-size:11px;color:#92400e;font-weight:700">N</span>`;
            else h+=`<span style="font-size:11px">${score!==undefined&&score!==null?score:'—'}</span>`;
          }
          h+=`</td>`;
          h+=`<td class="td-score ${on10!==null?scoreCls(on10):'score-na'}" style="font-size:10px">`;
          if(isA) h+=`<span style="color:#6b7280;font-weight:700">A</span>`;
          else if(isN) h+=`<span style="color:#92400e;font-weight:700">N</span>`;
          else h+=on10!==null?on10.toFixed(1):'—';
          h+=`</td>`;
        });
        h+=`</tr>`;
      });
      h+=`</tbody></table></div>`;
    }
    h+=`</div>`;
  }

  h+=`</div>`;
  return h;
}

// ── Activity table : Élève(n) | S1(P T A E) | S2... | items... | Note ───────
function renderActTable(act,sts,cl,forProj) {
  const sessions=act.sessions||[], items=act.items||[];
  const canEdit=D.isProfMode&&!act.locked&&!forProj;
  const comps=getComps(cl);

  function countPresents(sessId){
    return sts.filter(st=>{const p=((act.studentData||{})[st.id]||{}).presence;return p&&(p[sessId]==='present'||p[sessId]==='retard');}).length;
  }

  let h=`<div class="table-scroll"><table><thead>`;

  // Ligne 1 header
  h+=`<tr class="tr-sess-top">`;
  h+=`<th class="th-student" rowspan="2">Élève<br><span style="font-weight:400;font-size:10px;color:var(--text3)">(${sts.length})</span></th>`;
  sessions.forEach((sess,si)=>{
    const bl=si>0?'border-left:2px solid #93c5fd':'';
    h+=`<th colspan="4" style="${bl}">`;
    h+=esc(sess.name||'S'+(si+1));
    if(sess.date) h+=`<br><span style="font-weight:400;font-size:9px">${fmtDate(sess.date)}</span>`;
    if(canEdit) h+=` <button class="btn btn-xs btn-icon" style="padding:0 3px;font-size:10px;vertical-align:middle"
        onclick="renameItem('sess','${sess.id}','${act.id}')" title="Renommer">✏</button>
      <button class="btn btn-xs btn-icon" style="padding:0 3px;font-size:10px;vertical-align:middle;color:var(--red)"
        onclick="deleteItem('sess','${sess.id}','${act.id}')" title="Supprimer">✕</button>`;
    h+=`</th>`;
  });
  if(items.length>0||canEdit){
    const span=items.length+(canEdit?1:0);
    h+=`<th colspan="${span}" style="border-left:2px solid #6ee7b7;background:#f0fdf4;color:#166534">Items (${items.length})</th>`;
  }
  // Colonnes observations de compétences (auto-suggéré + modifiable à la main)
  const hasManualComps=true; // toujours visible si des compétences existent
  if(hasManualComps){
    h+=`<th colspan="${comps.length}" style="border-left:2px solid #a78bfa;background:#f5f3ff;color:#5b21b6;font-size:10px">
      Obs. compétences${canEdit?` <span style="font-size:8px;color:var(--text3)" title="Suggestion automatique d'après les items cochés de cette activité (halo léger) ; clic = observation manuelle, cycle NA→PA→A→M">auto + clic pour modifier</span>`:''}
    </th>`;
  }
  h+=`<th rowspan="2" colspan="2" class="th-score-group" style="min-width:74px">Note<br>/10</th></tr>`;

  // Ligne 2 header
  h+=`<tr class="tr-sub-hdr">`;
  sessions.forEach((sess,si)=>{
    const np=countPresents(sess.id);
    const bl=si>0?'border-left:2px solid #93c5fd':'';
    h+=`<th style="${bl}" title="Présents/${sts.length}">${np}</th>`;
    h+=`<th title="Travail">T</th><th title="Attitude">A</th><th title="Exclusion">E</th>`;
  });
  items.forEach((item,ii)=>{
    const bl=ii===0?'border-left:2px solid #6ee7b7':'';
    // Badge compétence sur l'item
    const comp=item.compId?comps.find(c=>c.id===item.compId):null;
    h+=`<th class="th-item" style="${bl}" title="${esc(item.label)}">`;
    h+=esc(item.label);
    if(comp) h+=`<br><span style="font-size:8px;background:${comp.color};color:${comp.text};border-radius:3px;padding:0 3px;cursor:${canEdit?'pointer':'default'}"
        ${canEdit?`onclick="cycleItemComp('${act.id}','${item.id}')"`:''}>${comp.short}</span>`;
    else if(canEdit) h+=`<br><span style="font-size:8px;color:var(--text3);cursor:pointer" onclick="cycleItemComp('${act.id}','${item.id}')" title="Assigner une compétence">+comp</span>`;
    if(canEdit) h+=`<br><span style="cursor:pointer;color:var(--red);font-size:8px" onclick="deleteItem('item','${item.id}','${act.id}')" title="Supprimer">✕</span>`;
    h+=`</th>`;
  });
  if(canEdit) h+=`<th class="th-item" style="min-width:20px;padding:0;border-left:${items.length===0?'2px solid #6ee7b7':'none'}">
    <div style="width:20px;height:100%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--blue);font-size:14px;font-weight:600"
      onclick="addItemInline('${act.id}')" title="Ajouter un item">+</div></th>`;
  // Sous-colonnes compétences
  comps.forEach((comp,ci)=>{
    h+=`<th class="th-item" style="font-size:9px;padding:2px 3px;${ci===0?'border-left:2px solid #a78bfa':''};background:${comp.color};color:${comp.text};cursor:help" title="${esc(compTip(cl,comp))}">${comp.short}</th>`;
  });
  h+=`</tr></thead><tbody>`;

  // Corps : élèves
  sts.forEach(st=>{
    const _sd=(act.studentData||{})[st.id]||{};
    const pres=_sd.presence||{}, ch=_sd.checks||{}, tae=_sd.tae||{};
    const allAbsent=sessions.length>0&&sessions.every(s=>['absent','exclu','none'].includes(pres[s.id]||'none')&&(pres[s.id]||'none')!=='retard');

    h+=`<tr><td class="td-student">${groupeDotsHTML(cl,st)}${displayName(st.name,false)}</td>`;

    sessions.forEach((sess,si)=>{
      const p=pres[sess.id]||'none';
      const bl=si>0?'style="border-left:2px solid #93c5fd"':'';
      const pIcon=p==='present'?'🟢':p==='absent'?'🔴':p==='retard'?'🟡':p==='exclu'?'🟠':'·';
      const pCls =p==='present'?'pres-present':p==='absent'?'pres-absent':p==='retard'?'pres-retard':p==='exclu'?'pres-exclu':'';
      h+=`<td class="td-pres" ${bl}>`;
      if(canEdit) h+=`<button class="pres-btn ${pCls}" onclick="cyclePresence('${act.id}','${st.id}','${sess.id}')">${pIcon}</button>`;
      else        h+=`<div class="pres-btn ${pCls}" style="cursor:default">${pIcon}</div>`;
      h+=`</td>`;

      const tKey=`${sess.id}_t`, tLv=tae[tKey]!==undefined?tae[tKey]:(p==='present'?1:0);
      h+=`<td class="td-star">${starWidget(tLv,act.id,st.id,sess.id,'t',canEdit,forProj)}</td>`;
      const aKey=`${sess.id}_a`, aLv=tae[aKey]!==undefined?tae[aKey]:(p==='present'?1:0);
      h+=`<td class="td-star">${starWidget(aLv,act.id,st.id,sess.id,'a',canEdit,forProj)}</td>`;
      const eKey=`${sess.id}_e`, eOn=!!tae[eKey];
      h+=`<td class="td-star">`;
      if(canEdit) h+=`<div class="star-widget ${eOn?'star-4':''}" onclick="toggleTAE('${act.id}','${st.id}','${eKey}')" title="${eOn?'Exclu':'Pas exclu'}">${eOn?'E':'·'}</div>`;
      else        h+=`<div class="star-widget star-readonly ${eOn?'star-4':''}" style="cursor:default">${eOn?'E':''}</div>`;
      h+=`</td>`;
    });

    const itemBg=allAbsent?'background:var(--red-bg)':'';
    items.forEach((item,ii)=>{
      const ok=!!ch[item.id];
      const bl=ii===0?'border-left:2px solid #6ee7b7':'';
      h+=`<td class="td-item" style="${bl};${itemBg}">`;
      if(canEdit&&!allAbsent)
        h+=`<div class="td-item-inner" onclick="toggleCheck('${act.id}','${st.id}','${item.id}')"><div class="cb ${ok?'on':''}"></div></div>`;
      else
        h+=`<div class="td-item-inner" style="cursor:default"><div class="cb ${ok&&!allAbsent?'on':''} ${allAbsent?'disabled':''}"></div></div>`;
      h+=`</td>`;
    });
    if(canEdit) h+=`<td style="width:20px;background:var(--bg3)"></td>`;

    // Colonnes observations de compétences : valeur manuelle si renseignée,
    // sinon suggestion automatique calculée sur les items de CETTE activité
    // (halo léger + légère transparence = suggestion, pas une observation
    // confirmée ; clic = démarre/poursuit une observation manuelle).
    const manComps = ((act.manualComps||{})[st.id]||{});
    const autoLvls = computeCompAcqActivite(act, st.id, comps);
    comps.forEach((comp,ci)=>{
      const lvlIdx  = manComps[comp.id]; // undefined = pas d'observation manuelle
      const isManual= lvlIdx!==undefined;
      const acqObj  = isManual ? ACQ[lvlIdx] : null;
      const auto    = !isManual ? autoLvls[comp.id] : null;
      const shown   = acqObj || auto;
      const bg      = shown ? shown.bg : 'transparent';
      const fg      = shown ? shown.fg : 'var(--text3)';
      const isAuto  = !isManual && !!auto;
      const ring    = isAuto ? `box-shadow:inset 0 0 0 1.5px ${auto.fg}66;` : '';
      const label   = isManual ? `${comp.label} : ${acqObj.label} (observation manuelle)`
                    : auto     ? `${comp.label} : suggestion auto — ${auto.label} (${auto.pct.toFixed(0)}%, ${auto.info})`
                    : `${comp.label} : non renseigné`;
      h+=`<td style="width:28px;height:30px;padding:0;${ci===0?'border-left:2px solid #a78bfa':''}">`;
      if(canEdit){
        h+=`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:9px;font-weight:700;background:${bg};color:${fg};${ring}${isAuto?'opacity:.8':''}"
          onclick="cycleManualComp('${act.id}','${st.id}','${comp.id}')"
          title="${esc(label)} (clic pour ${isManual?'changer':'confirmer/modifier'})"
          >${shown?shown.id:'·'}</div>`;
      } else {
        h+=`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;background:${bg};color:${fg};${isAuto?'opacity:.8':''}"
          title="${esc(label)}"
          >${shown?shown.id:''}</div>`;
      }
      h+=`</td>`;
    });

    // Score
    const res=computeScore(act,st.id);
    const manualMark=_sd.manualMark;
    const btnA=`<button onclick="setManualMark('${act.id}','${st.id}','A')" title="Marquer Absent"
      style="font-size:8px;padding:0 3px;border-radius:3px;border:1px solid var(--border2);background:var(--bg2);color:#6b7280;cursor:pointer;line-height:1.4">A</button>`;
    const btnN=`<button onclick="setManualMark('${act.id}','${st.id}','N')" title="Marquer Non noté"
      style="font-size:8px;padding:0 3px;border-radius:3px;border:1px solid var(--border2);background:var(--bg2);color:#92400e;cursor:pointer;line-height:1.4">N</button>`;
    const btnX=`<button onclick="setManualMark('${act.id}','${st.id}','')" title="Effacer"
      style="font-size:8px;padding:0 3px;border-radius:3px;border:1px solid var(--border2);background:var(--bg2);color:var(--red);cursor:pointer;line-height:1.4">×</button>`;
    const anBtns=canEdit?`<div style="display:flex;gap:1px;justify-content:center;margin-top:2px">${btnA}${btnN}</div>`:'';

    if(manualMark==='A'||manualMark==='N'){
      const isMA=manualMark==='A';
      h+=`<td colspan="2" class="td-score" style="color:${isMA?'#6b7280':'#92400e'};background:${isMA?'#f3f4f6':'#fef3c7'};font-weight:700;text-align:center">
        ${manualMark}${canEdit?` ${btnX}`:''}
      </td>`;
    } else if(!res){
      h+=`<td class="td-score score-na">${anBtns||'—'}</td>`;
      h+=`<td class="td-score score-na" style="font-size:9px">—</td>`;
    } else if(res.allAbsent){
      h+=`<td class="td-score" style="color:#6b7280;background:#f3f4f6;font-weight:700" title="Absent à toutes les séances">A</td>`;
      h+=`<td class="td-score score-na" style="font-size:9px">—</td>`;
    } else {
      h+=`<td class="td-score ${scoreCls(res.real)}" title="Note /10">${scoreLbl(res.real)}${anBtns}</td>`;
      if(res.pond!==null){
        h+=`<td class="td-score ${scoreCls(res.pond)}" style="font-size:10px;opacity:.9"
            title="Note pondérée : extrapolation sur ${res.totalSess} séances (${res.absSess} abs)">${scoreLbl(res.pond)}<span style="font-size:8px;display:block;font-weight:400">${res.absSess}abs</span></td>`;
      } else {
        h+=`<td class="td-score score-na" style="font-size:9px;color:var(--text3)">—</td>`;
      }
    }
    h+=`</tr>`;
  });

  // Ligne moyenne de classe
  const classVals=sts.map(st=>{
    const _sdC=(act.studentData||{})[st.id]||{};
    if(_sdC.manualMark==='A'||_sdC.manualMark==='N') return null;
    const r=computeScore(act,st.id);
    return(r&&!r.allAbsent)?r.real:null;
  }).filter(v=>v!==null);
  const classAvg=classVals.length?classVals.reduce((a,b)=>a+b,0)/classVals.length:null;
  h+=`<tr style="border-top:2px solid var(--border2);background:var(--bg3)">`;
  h+=`<td class="td-student" style="font-weight:600;font-style:italic;color:var(--text2)">Moy. classe</td>`;
  sessions.forEach(()=>h+=`<td colspan="4"></td>`);
  items.forEach(()=>h+=`<td></td>`);
  if(canEdit) h+=`<td></td>`;
  if(classAvg!==null){
    h+=`<td class="td-score ${scoreCls(classAvg)}" style="font-weight:700">${classAvg.toFixed(1)}</td>`;
    h+=`<td class="td-score score-na" style="font-size:9px">—</td>`;
  } else {
    h+=`<td class="td-score score-na">—</td><td class="td-score score-na">—</td>`;
  }
  h+=`</tr>`;

  h+=`</tbody></table></div>`;
  return h;
}

// ── Projector ────────────────────────────────────────────────────────────────
function openProjector() {
  const cl=curClass(),sq=curSeq(); if(!cl||!sq) return;
  const acts=sq.activities||[]; if(!acts.length){toast('Aucune activité');return;}
  projActId=projActId&&acts.find(a=>a.id===projActId)?projActId:acts[0].id;
  const ov=document.createElement('div');
  ov.id='projector'; ov.className='projector-overlay projector-content';
  let h=`<div class="projector-topbar">
    <div class="proj-title">${esc(cl.name)} — ${esc(sq.name)}</div>
    <button class="proj-close" onclick="closeProjector()">✕ Fermer</button>
  </div><div class="projector-act-tabs">`;
  acts.forEach(a=>h+=`<button class="proj-act-tab${a.id===projActId?' active':''}" onclick="switchProjAct('${a.id}')">${esc(a.name)}</button>`);
  h+=`</div><div id="proj-body">`;
  const act=acts.find(a=>a.id===projActId);
  if(act) h+=renderActivity(act,visibleStudents(cl),cl,true);
  h+=`</div>`;
  ov.innerHTML=h; document.body.appendChild(ov); document.body.style.overflow='hidden';
}
window.switchProjAct=function(actId){
  projActId=actId;
  const cl=curClass(),sq=curSeq(); if(!cl||!sq) return;
  document.querySelectorAll('.proj-act-tab').forEach(t=>t.classList.toggle('active',t.getAttribute('onclick').includes(`'${actId}'`)));
  const body=document.getElementById('proj-body');
  const act=(sq.activities||[]).find(a=>a.id===actId);
  if(body&&act) body.innerHTML=renderActivity(act,visibleStudents(cl),cl,true);
};
window.closeProjector=function(){
  const el=document.getElementById('projector'); if(el)el.remove();
  document.body.style.overflow='';
};

// ── Actions ──────────────────────────────────────────────────────────────────
window.toggleCheck=function(actId,stId,itemId){
  if(!D.isProfMode) return;
  const sq=curSeq(); if(!sq) return;
  const act=getAct(sq,actId); if(!act||act.locked) return;
  const sd=getSD(act,stId); sd.checks[itemId]=!sd.checks[itemId];
  saveData(); render();
};
window.cyclePresence=function(actId,stId,sessId){
  if(!D.isProfMode) return;
  const sq=curSeq(); if(!sq) return;
  const act=getAct(sq,actId); if(!act||act.locked) return;
  const sd=getSD(act,stId);
  const cyc={none:'present',present:'absent',absent:'retard',retard:'exclu',exclu:'none'};
  sd.presence[sessId]=cyc[sd.presence[sessId]||'none'];
  saveData(); render();
};
window.cycleStar=function(actId,stId,taeKey){
  if(!D.isProfMode) return;
  const sq=curSeq(); if(!sq) return;
  const act=getAct(sq,actId); if(!act||act.locked) return;
  const sd=getSD(act,stId);
  sd.tae[taeKey]=((sd.tae[taeKey]||0)+1)%5;
  saveData(); render();
};
window.toggleTAE=function(actId,stId,taeKey){
  if(!D.isProfMode) return;
  const sq=curSeq(); if(!sq) return;
  const act=getAct(sq,actId); if(!act||act.locked) return;
  const sd=getSD(act,stId); sd.tae[taeKey]=!sd.tae[taeKey];
  saveData(); render();
};
window.toggleLock=function(actId){
  if(!D.isProfMode) return;
  const sq=curSeq(); if(!sq) return;
  const act=getAct(sq,actId); if(!act) return;
  act.locked=!act.locked; saveData(); render();
  toast(act.locked?'🔒 Activité verrouillée':'🔓 Activité déverrouillée');
};
window.cycleItemComp=function(actId,itemId){
  if(!D.isProfMode) return;
  const sq=curSeq(); if(!sq) return;
  const act=getAct(sq,actId); if(!act||act.locked) return;
  const item=(act.items||[]).find(it=>it.id===itemId); if(!item) return;
  const cl=curClass();
  const comps=getComps(cl);
  const ids=[null,...comps.map(c=>c.id)];
  const cur=ids.indexOf(item.compId||null);
  item.compId=ids[(cur+1)%ids.length];
  saveData(); render();
};
// ── Actions QCM ─────────────────────────────────────────────────────────────
window.setQCMScore=function(actId,qcmId,stId,val){
  if(!D.isProfMode) return;
  const sq=curSeq(); if(!sq) return;
  const act=getAct(sq,actId); if(!act||act.locked) return;
  if(!act.qcmNotes) act.qcmNotes=[];
  const q=act.qcmNotes.find(x=>x.id===qcmId); if(!q) return;
  if(!q.scores) q.scores={};
  if(val==='A'||val==='N'){
    q.scores[stId]=val;
  } else {
    const num=parseFloat(val);
    if(val===''||val===null||isNaN(num)){ delete q.scores[stId]; }
    else { q.scores[stId]=Math.min(q.max,Math.max(0,num)); }
  }
  saveData();
};
window.deleteQCM=function(actId,qcmId){
  if(!D.isProfMode) return;
  if(!confirm('Supprimer cette note ?')) return;
  const sq=curSeq(); if(!sq) return;
  const act=getAct(sq,actId); if(!act) return;
  act.qcmNotes=(act.qcmNotes||[]).filter(q=>q.id!==qcmId);
  saveData(); render();
};
window.setManualMark=function(actId,stId,val){
  if(!D.isProfMode) return;
  const sq=curSeq(); if(!sq) return;
  const act=getAct(sq,actId); if(!act||act.locked) return;
  const sd=getSD(act,stId);
  if(val==='A'||val==='N'){ sd.manualMark=val; }
  else { delete sd.manualMark; }
  saveData(); render();
};

window.cycleManualComp=function(actId,stId,compId){
  if(!D.isProfMode) return;
  const sq=curSeq(); if(!sq) return;
  const act=getAct(sq,actId); if(!act||act.locked) return;
  if(!act.manualComps) act.manualComps={};
  if(!act.manualComps[stId]) act.manualComps[stId]={};
  const cur = act.manualComps[stId][compId];
  // Cycle : undefined→(suggestion auto si dispo, sinon NA)→…→M→undefined
  if(cur===undefined){
    const cl=curClass();
    const auto = cl ? computeCompAcqActivite(act,stId,getComps(cl))[compId] : null;
    const autoIdx = auto ? ACQ.findIndex(a=>a.id===auto.id) : -1;
    act.manualComps[stId][compId]=autoIdx>=0?autoIdx:0;
  }
  else if(cur>=3) delete act.manualComps[stId][compId];
  else act.manualComps[stId][compId]=cur+1;
  saveData(); render();
};

window.addItemInline=function(actId){
  if(!D.isProfMode) return;
  const sq=curSeq(); if(!sq) return;
  const act=getAct(sq,actId); if(!act||act.locked) return;
  if(!act.items) act.items=[];
  const nextNum=act.items.length+1;
  const label=prompt('Numéro / libellé du nouvel item :',''+nextNum);
  if(!label||!label.trim()) return;
  act.items.push({id:uid(),label:label.trim(),compId:null});
  saveData(); render(); toast('✓ Item ajouté');
};

// ── Rename / Delete ──────────────────────────────────────────────────────────
window.renameItem=function(type,id,parentId){
  const newName=prompt('Nouveau nom :'); if(!newName||!newName.trim()) return;
  const name=newName.trim(),cl=curClass();
  if(type==='seq'){const sq=getSeq(cl,id);if(sq){sq.name=name;saveData();render();toast('✓ Renommé');}}
  else if(type==='act'){const sq=curSeq();const act=getAct(sq,id);if(act){act.name=name;saveData();render();toast('✓ Renommé');}}
  else if(type==='sess'){const sq=curSeq();const act=getAct(sq,parentId);const sess=getSess(act,id);if(sess){sess.name=name;saveData();render();toast('✓ Renommé');}}
};
window.restoreStudent=function(id){
  const cl=curClass(); if(!cl) return;
  const st=(cl.students||[]).find(s=>s.id===id); if(!st) return;
  st.archived=false;
  delete st.archiveReason; delete st.archiveDate; delete st.archiveNote;
  saveData(); render(); toast(`✓ ${st.name} réintégré(e)`);
};
window.deleteItem=function(type,id,parentId){
  const cl=curClass();
  if(type==='class'){
    const cl0=getClass(id);
    if(!cl0){return;}
    if(!confirm(`Supprimer la classe "${cl0.name}" (${cl0.annee||''}) et TOUTES ses données (élèves, séquences, notes) ?\nCette action est irréversible.`)) return;
    D.classes=D.classes.filter(c=>c.id!==id);
    if(nav.classId===id){ nav={screen:'home',classId:null,seqId:null}; }
    saveData();render();toast('✓ Classe supprimée');
    return;
  }
  if(type==='student'){
    if(!confirm('Supprimer cet élève ? Toutes ses données seront perdues.')) return;
    cl.students=cl.students.filter(s=>s.id!==id); saveData();render();toast('✓ Élève supprimé');
  } else if(type==='seq'){
    const sq=getSeq(cl,id);
    if(!confirm(`Supprimer la séquence "${sq?sq.name:''}" et TOUTES ses données ?`)) return;
    cl.sequences=cl.sequences.filter(s=>s.id!==id); saveData();render();toast('✓ Séquence supprimée');
  } else if(type==='act'){
    const sq=curSeq();const act=getAct(sq,id);
    if(!confirm(`Supprimer l'activité "${act?act.name:''}" ?`)) return;
    sq.activities=sq.activities.filter(a=>a.id!==id); saveData();render();toast('✓ Activité supprimée');
  } else if(type==='sess'){
    const sq=curSeq();const act=getAct(sq,parentId);const sess=getSess(act,id);
    if(!confirm(`Supprimer la séance "${sess?sess.name:''}" ?`)) return;
    act.sessions=act.sessions.filter(s=>s.id!==id);
    Object.values(act.studentData||{}).forEach(sd=>{
      if(sd.presence) delete sd.presence[id];
      Object.keys(sd.tae||{}).filter(k=>k.startsWith(id+'_')).forEach(k=>delete sd.tae[k]);
    });
    saveData();render();toast('✓ Séance supprimée');
  } else if(type==='item'){
    const sq=curSeq();const act=getAct(sq,parentId);
    if(!confirm(`Supprimer l'item "${id}" ?`)) return;
    const itemObj=(act.items||[]).find(it=>it.id===id);
    act.items=(act.items||[]).filter(it=>it.id!==id);
    if(itemObj) Object.values(act.studentData||{}).forEach(sd=>{if(sd.checks) delete sd.checks[id];});
    saveData();render();toast('✓ Item supprimé');
  }
};

// ── Navigation ───────────────────────────────────────────────────────────────
window.goHome  =()=>{nav={screen:'home',classId:null,seqId:null};render();};
let _nav_anneeFilter = null;
window.setAnneeFilter=function(y){
  nav.anneeFilter=y; _nav_anneeFilter=y; render();
};
window.goClass =function(id){
  // Élèves : vérifier qu'ils ont le bon code
  if(!D.isProfMode){
    const cl=getClass(id);
    const storedId=sessionStorage.getItem('studentClassId');
    if(cl && (cl.viewCode) && storedId!==id){
      // Pas accès direct — retour home
      nav={screen:'home',classId:null,seqId:null}; render(); return;
    }
  }
  nav={screen:'class',classId:id,seqId:null}; render();
};
window.goSeq   =id=>{nav.screen='seq';nav.seqId=id;render();};
window.logoutProf=()=>{ logoutProfAuth(); };
window.openProjector=openProjector;

// ── Modals ───────────────────────────────────────────────────────────────────
let mState={};
window.openModal=function(type,extra){
  mState={type,extra};
  let html='',confirmLabel='Confirmer',showConfirm=true;

  if(type==='login'){
    const isSignup=!!mState.signup;
    html=`<div class="modal-title">Connexion professeur</div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn btn-sm${!isSignup?' btn-primary':''}" onclick="mState.signup=false;openModal('login')" style="flex:1">Se connecter</button>
        <button class="btn btn-sm${isSignup?' btn-primary':''}" onclick="mState.signup=true;openModal('login')" style="flex:1">Créer un compte</button>
      </div>
      <div class="form-group"><label class="form-label">Email</label>
        <input class="form-input" id="m-email" type="email" placeholder="prof@example.com" autocomplete="email" onkeydown="if(event.key==='Enter')doModal()"></div>
      <div class="form-group"><label class="form-label">Mot de passe</label>
        <input class="form-input" id="m-pw" type="password" placeholder="Mot de passe" autocomplete="${isSignup?'new':'current'}-password" onkeydown="if(event.key==='Enter')doModal()"></div>
      ${isSignup?`<div class="form-group"><label class="form-label">Code d'invitation</label>
        <input class="form-input" id="m-code" type="text" placeholder="Code fourni par l'administrateur"></div>`:''}
      <div class="form-error" id="m-err" style="margin-top:4px"></div>`;
    confirmLabel=isSignup?'Créer le compte':'Connexion';
  } else if(type==='changePass'){
    html=`<div class="modal-title">Changer le mot de passe</div>
      <div class="form-group"><label class="form-label">Nouveau mot de passe</label>
        <input class="form-input" id="m-np" type="password" autofocus>
        <div class="form-hint">Défaut : prof1234</div></div>`;
  } else if(type==='settings'){
    const syncInfo = {
      local:        '⚪ Mode local (Supabase non configuré)',
      syncing:      '🔵 Synchronisation en cours...',
      synced:       '🟢 Synchronisé avec Supabase',
      error:        '🔴 Erreur — vérifiez config.js',
      disconnected: '🔴 Session perdue — touchez "Forcer la synchronisation" pour vous reconnecter',
    }[_syncState||'local'] || '⚪ Mode local';
    html=`<div class="modal-title">Paramètres & Synchronisation</div>
      <div class="form-group">
        <label class="form-label">État Supabase</label>
        <div style="font-size:12px;padding:6px 10px;background:var(--bg3);border-radius:6px;margin-bottom:10px">${syncInfo}</div>
        <button class="btn btn-sm" style="width:100%;text-align:left;margin-bottom:6px" onclick="forceSyncFromSupabase();closeModal()">🔄 Forcer la synchronisation</button>
      </div>
      <div class="form-group">
        <label class="form-label">Backup JSON</label>
        <button class="btn btn-sm" style="width:100%;text-align:left;margin-bottom:6px" onclick="exportBackupJSON();closeModal()">⬇ Exporter toutes les données (.json)</button>
        <button class="btn btn-sm" style="width:100%;text-align:left;margin-bottom:6px" onclick="importBackupJSON();closeModal()">⬆ Importer un backup (.json)</button>
      </div>
      <div class="form-group">
        <label class="form-label">Maintenance</label>
        <button class="btn btn-sm" style="width:100%;text-align:left;margin-bottom:6px" onclick="clearOldKeys()">🧹 Supprimer anciennes clés localStorage (v2–v4)</button>
        <button class="btn btn-sm btn-danger" style="width:100%;text-align:left" onclick="resetAllData()">⚠️ Effacer TOUTES les données (local + cloud)</button>
        <div class="form-hint" style="margin-top:6px">Clé localStorage : ${STORE_KEY}</div>
      </div>`;
    showConfirm=false;
  } else if(type==='addClass'){
    const _cySel=_nav_anneeFilter||currentSchoolYear();
    const _yearOpts=schoolYearOptionsHTML(_cySel);
    html=`<div class="modal-title">Nouvelle classe</div>
      <div class="form-group"><label class="form-label">Nom de la classe</label>
        <input class="form-input" id="m-name" placeholder="Ex: 2MSPC" autofocus></div>
      <div class="form-group"><label class="form-label">Année scolaire</label>
        <select class="form-select" id="m-annee" data-prev="${_cySel}" onchange="handleAnneeSelect(this)">${_yearOpts}</select></div>
      <div class="form-group"><label class="form-label">Niveau</label>
        <select class="form-select" id="m-niv" onchange="toggleSpeWrap(this.value)">
          <option value="3pm">3ᵉ Prépa-Métiers (socle collège)</option>
          <option value="bac_pro" selected>BAC PRO (lycée professionnel)</option>
          <option value="cap">CAP (lycée professionnel)</option>
        </select></div>
      <div class=\"form-group\" id=\"m-spe-wrap\" style=\"display:none\">
        <label class=\"form-label\">Spécialité(s) Bac Pro <span style=\"font-size:10px;color:var(--text3)\">(1 à 3)</span></label>
        <div style=\"position:relative\">
          <input class=\"form-input\" id=\"m-spe-search\" placeholder=\"Rechercher une spécialité…\" autocomplete=\"off\" oninput=\"filterSpecialites(this.value)\" onblur=\"setTimeout(()=>{const d=document.getElementById('m-spe-dropdown-fixed');if(d)d.remove();},200)\">
        </div>
        <div id=\"m-spe-selected\" style=\"display:flex;flex-wrap:wrap;gap:4px;margin-top:6px\"></div>
        <div class=\"form-hint\">Les groupements maths et PC sont déduits automatiquement.</div>
      </div>`;
    setTimeout(()=>{toggleSpeWrap('bac_pro');},50);
  } else if(type==='editClass'){
    const clE=getClass(extra); if(!clE){closeModal();return;}
    const speJson=JSON.stringify(clE.specialites||[]).replace(/"/g,'&quot;');
    const _clAnnee=clE.annee||currentSchoolYear();
    const _yearOpts2=schoolYearOptionsHTML(_clAnnee);
    html=`<div class="modal-title">Modifier la classe</div>
      <div class="form-group"><label class="form-label">Nom de la classe</label>
        <input class="form-input" id="m-name" value="${esc(clE.name)}" autofocus></div>
      <div class="form-group"><label class="form-label">Année scolaire</label>
        <select class="form-select" id="m-annee" data-prev="${_clAnnee}" onchange="handleAnneeSelect(this)">${_yearOpts2}</select></div>
      <div class="form-group"><label class="form-label">Niveau</label>
        <select class="form-select" id="m-niv" onchange="toggleSpeWrap(this.value)">
          <option value="3pm"${normNiveau(clE.niveau)==='3pm'?' selected':''}>3ᵉ Prépa-Métiers (socle collège)</option>
          <option value="bac_pro"${normNiveau(clE.niveau)==='bac_pro'?' selected':''}>BAC PRO (lycée professionnel)</option>
          <option value="cap"${normNiveau(clE.niveau)==='cap'?' selected':''}>CAP (lycée professionnel)</option>
        </select></div>
      <div class=\"form-group\" id=\"m-spe-wrap\" style=\"display:none\">
        <label class=\"form-label\">Spécialité(s) Bac Pro <span style=\"font-size:10px;color:var(--text3)\">(1 à 3)</span></label>
        <div style=\"position:relative\">
          <input class=\"form-input\" id=\"m-spe-search\" placeholder=\"Rechercher une spécialité…\" autocomplete=\"off\" oninput=\"filterSpecialites(this.value)\" onblur=\"setTimeout(()=>{const d=document.getElementById('m-spe-dropdown-fixed');if(d)d.remove();},200)\">
        </div>
        <div id=\"m-spe-selected\" style=\"display:flex;flex-wrap:wrap;gap:4px;margin-top:6px\"></div>
        <div class=\"form-hint\">Les groupements maths et PC sont déduits automatiquement.</div>
      </div>`;
    setTimeout(()=>{
      toggleSpeWrap(normNiveau(clE.niveau));
      (clE.specialites||[]).forEach(s=>addSpecialite(s));
    },50);
  } else if(type==='transferClass'){
    const clT=getClass(extra); if(!clT){closeModal();return;}
    html=`<div class="modal-title">🔁 Transférer la classe</div>
      <div class="info-banner">Générez un code de transfert à donner à votre collègue. Il aura 48h pour l'utiliser. Vous conserverez un accès lecture via le code élèves.</div>
      <div class="form-group"><label class="form-label">Classe</label>
        <div style="font-weight:600;font-size:14px">${esc(clT.name)} — ${clT.annee||''}</div></div>
      <div id="transfer-result" style="margin-top:8px"></div>`;
    confirmLabel='Générer le code';
  } else if(type==='claimTransfer'){
    html=`<div class="modal-title">📥 Reprendre une classe</div>
      <div class="info-banner">Entrez le code de transfert donné par votre collègue. La classe sera copiée dans votre compte avec tout l'historique.</div>
      <div class="form-group"><label class="form-label">Code de transfert</label>
        <input class="form-input" id="m-tcode" placeholder="Ex: ABC123" autofocus style="text-transform:uppercase;font-family:monospace;font-size:16px;letter-spacing:2px">
        <div class="form-error" id="m-terr" style="margin-top:4px"></div></div>`;
    confirmLabel='Reprendre la classe';
  } else if(type==='addSeq'){
    html=`<div class="modal-title">Nouvelle séquence</div>
      <div class="form-group"><label class="form-label">Matière · titre</label>
        <input class="form-input" id="m-name" placeholder="Ex: Maths – Probabilités" autofocus></div>`;
  } else if(type==='addStudent'){
    html=`<div class="modal-title">Ajouter des élèves</div>
      <div class="info-banner">Un élève par ligne. Coller depuis un tableur fonctionne.</div>
      <div class="form-group"><label class="form-label">Noms (un par ligne)</label>
        <textarea class="form-textarea" id="m-names" placeholder="DUPONT Alice&#10;MARTIN Léo&#10;GARCIA Sofia" autofocus></textarea></div>`;
    confirmLabel='Ajouter';
  } else if(type==='addActivity'){
    html=`<div class="modal-title">Nouvelle activité</div>
      <div class="form-group"><label class="form-label">Nom de l'activité</label>
        <input class="form-input" id="m-name" placeholder="Ex: Activité 1 – Probabilités simples" autofocus></div>`;
  } else if(type==='addSession'){
    html=`<div class="modal-title">Nouvelle séance</div>
      <div class="form-group"><label class="form-label">Nom (optionnel)</label>
        <input class="form-input" id="m-sname" placeholder="Ex: S1"></div>
      <div class="form-group"><label class="form-label">Date</label>
        <input class="form-input" id="m-date" type="date" value="${new Date().toISOString().slice(0,10)}" autofocus></div>`;
  } else if(type==='addItems'){
    const cl=curClass();
    const comps=getComps(cl);
    const compOpts=`<option value="">— Aucune —</option>`+comps.map(c=>`<option value="${c.id}">${c.short} – ${esc(c.label)}</option>`).join('');
    html=`<div class="modal-title">Ajouter des items à l'activité</div>
      <div class="info-banner">Les items sont communs à toutes les séances de l'activité.</div>
      <div class="form-group"><label class="form-label">Numéros des items</label>
        <input class="form-input" id="m-items" placeholder="1, 2, 3a, 3b, 4" autofocus>
        <div class="form-hint">Séparés par virgules ou espaces</div></div>
      <div class="form-group"><label class="form-label">Compétence associée (optionnel)</label>
        <select class="form-select" id="m-comp">${compOpts}</select>
        <div class="form-hint">Sera assignée à tous les items créés ici. Modifiable après.</div></div>`;
  } else if(type==='tagProg'){
    const cl2=curClass();
    const niv=cl2?cl2.niveau:'bac_pro';
    const sq2=curSeq();
    const act2=sq2?getAct(sq2,extra):null;
    const existCodes=(act2&&act2.progItems?act2.progItems:[]).map(p=>p.code);
    const sqName=(sq2?sq2.name:'').toLowerCase();
    const autoMat=sqName.includes('phys')||sqName.includes('chim')||sqName.includes('pc')?'PhCh':'M';
    const mat2=(window._progMatOverride&&window._progMatOverride[extra])||autoMat;
    const niveauMap={bac_pro:'bac','cap':'cap','3pm':'3pm'};
    const nNiv=normNiveau(niv);
    const pageHint=niveauMap[nNiv]||'bac';
    const yearHint=nNiv==='bac_pro'?'2PRO':nNiv==='cap'?'CAP':'3PM';
    const params=new URLSearchParams({mode:'picker',actId:extra,page:pageHint,year:yearHint,subj:mat2,codes:existCodes.join(',')});
    const url='grille_items.html?'+params.toString();
    // Open picker popup
    openProgPickerPopup(url, extra);
    html=`<div class="modal-title">🔗 Grille des items</div>
      <div class="info-banner">La grille s'est ouverte dans une nouvelle fenêtre.<br>Cliquez sur les items pour les lier ou les délier de l'activité <strong>${esc(sq2?sq2.name:'')}</strong>.</div>
      <div id="prog-linked-preview" style="margin-top:8px">
        ${buildLinkedPreview(act2)}
      </div>`;
    showConfirm=false;
  } else if(type==='addQCM'){
    html=`<div class="modal-title">Nouvelle note ponctuelle</div>
      <div class="form-group"><label class="form-label">Nom</label>
        <input class="form-input" id="m-qname" placeholder="Ex: QCM Ch.3, Interro…" autofocus></div>
      <div class="form-group"><label class="form-label">Note maximale</label>
        <input class="form-input" id="m-qmax" type="number" min="1" max="100" value="20"></div>
      <div class="form-group"><label class="form-label">Date (optionnel)</label>
        <input class="form-input" id="m-qdate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>`;
  } else if(type==='exportCSV'){
    const cl=curClass();
    const is3eme = usesSocle(cl);
    html=`<div class="modal-title">Exporter</div>`;
    if(cl){
      html+=`<div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:6px">📊 Notes et compétences (CSV)</div>`;
      (cl.sequences||[]).forEach(sq=>{
        html+=`<div style="margin-bottom:5px"><button class="btn btn-sm" style="width:100%;text-align:left" onclick="doExportCSV('${cl.id}','${sq.id}')">📄 ${esc(sq.name)}</button></div>`;
      });
      if(is3eme){
        html+=`<div style="font-size:11px;font-weight:600;color:var(--text2);margin:10px 0 6px">📋 Livret scolaire — Socle commun (CSV)</div>`;
        (cl.sequences||[]).forEach(sq=>{
          html+=`<div style="margin-bottom:5px"><button class="btn btn-sm" style="width:100%;text-align:left" onclick="exportLivret('${cl.id}','${sq.id}')">📋 ${esc(sq.name)} — Domaines D1→D5</button></div>`;
        });
        html+=`<div style="font-size:10px;color:var(--text3);margin-top:6px">Le fichier indique pour chaque élève le niveau NA/PA/A/M<br>sur chacun des 5 domaines du socle commun.</div>`;
      }
    }
    showConfirm=false;
  } else if(type==='manageGroupes'){
    const cl=curClass(); if(!cl) return;
    html=`<div class="modal-title">🎨 Groupes de la classe</div>
      <div class="form-group">
        <label class="form-label">Groupes définis</label>
        <div id="groupes-list"></div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <input class="form-input" id="m-new-groupe" placeholder="Ex: Groupe 1, TRPM, MSPM…" style="flex:1" onkeydown="if(event.key==='Enter')addGroupe()">
          <button class="btn btn-sm" onclick="addGroupe()">+ Ajouter</button>
        </div>
      </div>
      <div class="form-group" style="margin-top:14px">
        <label class="form-label">Affecter les élèves <span style="font-weight:400;color:var(--text3);font-size:10px">(touchez un badge pour ajouter/retirer)</span></label>
        <div id="groupes-assign"></div>
      </div>`;
    showConfirm=false;
  } else if(type==='archiveStudent'){
    const cl=curClass(); if(!cl) return;
    const st=(cl.students||[]).find(s=>s.id===extra); if(!st){closeModal();return;}
    const today=new Date().toISOString().slice(0,10);
    html=`<div class="modal-title">📤 Sortir ${esc(st.name)}</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px">L'élève quitte la liste active mais ses notes et son historique sont conservés. Vous pourrez le réintégrer à tout moment.</div>
      <div class="form-group"><label class="form-label">Motif</label>
        <select class="form-select" id="m-arch-reason">
          ${Object.entries(ARCHIVE_REASONS).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Date</label>
        <input class="form-input" id="m-arch-date" type="date" value="${today}"></div>
      <div class="form-group"><label class="form-label">Précision (optionnel)</label>
        <input class="form-input" id="m-arch-note" placeholder="Ex: nom de la nouvelle section…"></div>`;
    confirmLabel='Sortir l\'élève';
  }

  const ov=document.createElement('div');
  ov.className='modal-overlay'; ov.id='modal-overlay';
  ov.innerHTML=`<div class="modal-box">${html}
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Fermer</button>
      ${showConfirm?`<button class="btn btn-primary" onclick="doModal()">${confirmLabel}</button>`:''}
    </div></div>`;
  ov.addEventListener('click',e=>{if(e.target===ov)closeModal();});
  document.body.appendChild(ov);
  if(type==='manageGroupes') renderGroupesModal();
  setTimeout(()=>{const f=ov.querySelector('input:not([type=hidden]),textarea');if(f)f.focus();},50);
};

window.closeModal=()=>{
  window._currentSpecialites=[];
  const dd=document.getElementById('m-spe-dropdown-fixed');if(dd)dd.remove();
  const m=document.getElementById('modal-overlay');if(m)m.remove();
  // Rafraîchit la page derrière la modale (utile pour les modales "live" comme
  // Groupes, qui modifient les données sans rappeler render() à chaque clic).
  if(typeof render==='function') render();
};

// ── Spécialités autocomplete ─────────────────────────────────────────────────
window._currentSpecialites=[];

window.toggleSpeWrap=function(niveau){
  const wrap=document.getElementById('m-spe-wrap');
  if(wrap) wrap.style.display=(niveau==='bac_pro')?'block':'none';
};

window.filterSpecialites=function(query){
  const input=document.getElementById('m-spe-search');
  let dd=document.getElementById('m-spe-dropdown-fixed');
  const q=(query||'').toLowerCase().trim();

  function closeDd(){if(dd){dd.remove();dd=null;}}

  if(!q){closeDd();return;}
  const already=new Set(window._currentSpecialites||[]);
  const matches=SPECIALITES_BAC_PRO.filter(s=>
    !already.has(s.nom) && s.nom.toLowerCase().includes(q)
  ).slice(0,12);
  if(!matches.length){closeDd();return;}

  // Créer ou réutiliser le dropdown fixé au body (évite le clip de overflow:auto)
  if(!dd){
    dd=document.createElement('div');
    dd.id='m-spe-dropdown-fixed';
    dd.style.cssText='position:fixed;z-index:1000;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.15);max-height:220px;overflow-y:auto;min-width:280px';
    dd.addEventListener('mousedown',e=>e.preventDefault()); // empêche le blur de l'input
    document.body.appendChild(dd);
  }

  // Positionner sous le champ de saisie
  if(input){
    const r=input.getBoundingClientRect();
    dd.style.left=r.left+'px';
    dd.style.top=(r.bottom+2)+'px';
    dd.style.width=r.width+'px';
  }

  dd.innerHTML='';
  matches.forEach(s=>{
    const grpM=s.grpM?`M·${s.grpM}`:'';
    const grpPC=s.grpPC?`PC·${s.grpPC}`:'';
    const badge=[grpM,grpPC].filter(Boolean).join(' ');
    const item=document.createElement('div');
    item.style.cssText='padding:7px 10px;cursor:pointer;font-size:12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)';
    item.innerHTML=`<span>${esc(s.nom)}</span><span style="font-size:10px;color:var(--text3);white-space:nowrap;margin-left:8px">${badge}</span>`;
    item.addEventListener('mouseenter',()=>item.style.background='var(--bg3)');
    item.addEventListener('mouseleave',()=>item.style.background='');
    item.addEventListener('mousedown',e=>e.preventDefault());
    item.addEventListener('click',()=>{
      addSpecialite(s.nom);
      const inp=document.getElementById('m-spe-search');
      if(inp){inp.value='';inp.focus();}
      filterSpecialites('');
    });
    dd.appendChild(item);
  });
  dd.style.display='block';
};

window.addSpecialite=function(nom){
  if(!window._currentSpecialites) window._currentSpecialites=[];
  if(window._currentSpecialites.length>=3){toast('⚠ Maximum 3 spécialités');return;}
  if(window._currentSpecialites.includes(nom)) return;
  window._currentSpecialites.push(nom);
  // Fermer le dropdown fixé
  const dd=document.getElementById('m-spe-dropdown-fixed');if(dd)dd.remove();
  renderSelectedSpecialites();
};

window.removeSpecialite=function(nom){
  window._currentSpecialites=(window._currentSpecialites||[]).filter(s=>s!==nom);
  renderSelectedSpecialites();
};

function renderSelectedSpecialites(){
  const container=document.getElementById('m-spe-selected'); if(!container)return;
  container.innerHTML=(window._currentSpecialites||[]).map(nom=>{
    const spe=SPECIALITES_BAC_PRO.find(s=>s.nom===nom);
    const grpM=spe&&spe.grpM?`M·${spe.grpM}`:'';
    const grpPC=spe&&spe.grpPC?`PC·${spe.grpPC}`:'';
    const badge=[grpM,grpPC].filter(Boolean).join(' ');
    const safeName=nom.replace(/&/g,'&amp;').replace(/'/g,'&#39;');
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;background:var(--bg3);border:1px solid var(--border);font-size:11px">
      <span>${esc(nom)}</span>
      ${badge?`<span style="color:var(--text3)">(${badge})</span>`:''}
      <button onclick="removeSpecialite('${safeName}');event.stopPropagation()" style="background:none;border:none;cursor:pointer;color:var(--text3);padding:0;margin-left:2px;font-size:12px" title="Retirer">×</button>
    </span>`;
  }).join('');
}

// ── Modal Groupes : gestion + affectation, se rafraîchit sur place ───────────
function renderGroupesModal(){
  const cl=curClass(); if(!cl) return;
  const listEl=document.getElementById('groupes-list');
  const assignEl=document.getElementById('groupes-assign');
  if(!listEl||!assignEl) return;
  const groupes=getGroupes(cl);

  listEl.innerHTML = groupes.length ? groupes.map(g=>`
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
      <button onclick="recolorGroupe('${g.id}')" title="Changer la couleur"
        style="width:18px;height:18px;border-radius:50%;border:1px solid var(--border2);background:${g.couleur};cursor:pointer;padding:0;flex:none"></button>
      <span style="flex:1;font-size:13px;cursor:pointer" onclick="renameGroupe('${g.id}')" title="Renommer">${esc(g.nom)}</span>
      <button class="btn btn-xs btn-icon" style="color:var(--red)" onclick="deleteGroupe('${g.id}')" title="Supprimer le groupe">✕</button>
    </div>`).join('')
    : `<div class="no-data" style="padding:8px 0;font-size:12px">Aucun groupe pour l'instant.</div>`;

  const sts=activeStudents(cl);
  assignEl.innerHTML = !groupes.length ? ''
    : !sts.length ? `<div class="no-data" style="padding:8px 0;font-size:12px">Aucun élève dans cette classe.</div>`
    : sts.map(st=>{
        const ids=st.groupeIds||[];
        const chips=groupes.map(g=>{
          const on=ids.includes(g.id);
          return `<span onclick="toggleStudentGroupe('${st.id}','${g.id}')"
            style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:10px;cursor:pointer;
              border:1px solid ${on?g.couleur:'var(--border)'};background:${on?g.couleur:'var(--bg3)'};color:${on?'#fff':'var(--text2)'}">
            ${esc(g.nom)}</span>`;
        }).join(' ');
        return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;flex-wrap:wrap">
          <span style="min-width:100px;font-size:12px">${esc(st.name)}</span>
          <span style="display:flex;gap:4px;flex-wrap:wrap">${chips}</span>
        </div>`;
      }).join('');
}
window.addGroupe=function(){
  const cl=curClass(); if(!cl) return;
  const input=document.getElementById('m-new-groupe');
  const nom=(input.value||'').trim(); if(!nom) return;
  if(!cl.groupes) cl.groupes=[];
  cl.groupes.push({id:uid(),nom,couleur:nextGroupeColor(cl)});
  input.value='';
  saveData(); renderGroupesModal();
};
window.renameGroupe=function(id){
  const cl=curClass(); if(!cl) return;
  const g=getGroupe(cl,id); if(!g) return;
  const nom=prompt('Nom du groupe :',g.nom); if(!nom||!nom.trim()) return;
  g.nom=nom.trim();
  saveData(); renderGroupesModal();
};
window.recolorGroupe=function(id){
  const cl=curClass(); if(!cl) return;
  const g=getGroupe(cl,id); if(!g) return;
  const cur=GROUPE_COLORS.indexOf(g.couleur);
  g.couleur=GROUPE_COLORS[(cur+1+GROUPE_COLORS.length)%GROUPE_COLORS.length];
  saveData(); renderGroupesModal();
};
window.deleteGroupe=function(id){
  const cl=curClass(); if(!cl) return;
  const g=getGroupe(cl,id); if(!g) return;
  if(!confirm(`Supprimer le groupe "${g.nom}" ? Les élèves n'en feront plus partie.`)) return;
  cl.groupes=cl.groupes.filter(x=>x.id!==id);
  (cl.students||[]).forEach(st=>{ if(st.groupeIds) st.groupeIds=st.groupeIds.filter(gid=>gid!==id); });
  saveData(); renderGroupesModal();
};
window.toggleStudentGroupe=function(stId,groupeId){
  const cl=curClass(); if(!cl) return;
  const st=(cl.students||[]).find(s=>s.id===stId); if(!st) return;
  if(!st.groupeIds) st.groupeIds=[];
  const i=st.groupeIds.indexOf(groupeId);
  if(i>=0) st.groupeIds.splice(i,1); else st.groupeIds.push(groupeId);
  saveData(); renderGroupesModal();
};

window.doModal=function(){
  const t=mState.type;
  if(t==='login'){
    const email=(document.getElementById('m-email').value||'').trim();
    const pw=document.getElementById('m-pw').value;
    const errEl=document.getElementById('m-err');
    if(!email||!pw){errEl.textContent='Email et mot de passe requis';return;}
    errEl.textContent='Vérification…';
    if(mState.signup){
      const code=((document.getElementById('m-code')||{}).value||'').trim();
      signupProf(email,pw,code).then(res=>{
        if(!res.ok){errEl.textContent=res.error;return;}
        if(res.needsConfirm){errEl.style.color='var(--green)';errEl.textContent='✓ Vérifiez votre email pour confirmer votre compte.';}
        else{closeModal();render();toast('✓ Compte créé et connecté');}
      });
    } else {
      loginProf(email,pw).then(res=>{
        if(!res.ok){errEl.textContent=res.error;return;}
        closeModal();render();toast('✓ Connecté en mode prof');
      });
    }
    return; // async, ne pas continuer
  } else if(t==='changePass'){
    const np=document.getElementById('m-np').value.trim(); if(!np) return;
    setPassword(np).then(()=>{ closeModal(); toast('✓ Mot de passe modifié'); });
    return;
  } else if(t==='addClass'){
    const name=document.getElementById('m-name').value.trim(); if(!name) return;
    const niveau=document.getElementById('m-niv').value;
    const annee=document.getElementById('m-annee').value||currentSchoolYear();
    const viewCode=Math.random().toString(36).slice(2,8).toUpperCase();
    const specialites=window._currentSpecialites||[];
    nav.anneeFilter=annee;
    D.classes.push({id:uid(),name,niveau,annee,specialites,viewCode,students:[],sequences:[]}); saveData();closeModal();render();
  } else if(t==='editClass'){
    const clE=getClass(mState.extra); if(!clE) return;
    const name=document.getElementById('m-name').value.trim(); if(!name) return;
    const niveau=document.getElementById('m-niv').value;
    const annee=document.getElementById('m-annee').value||currentSchoolYear();
    const specialites=window._currentSpecialites||[];
    clE.name=name; clE.niveau=niveau; clE.annee=annee; clE.specialites=specialites;
    saveData();closeModal();render();toast('✓ Classe modifiée');
  } else if(t==='transferClass'){
    const clT2=getClass(mState.extra); if(!clT2) return;
    const resultDiv=document.getElementById('transfer-result');
    if(resultDiv) resultDiv.innerHTML='<span style="color:var(--text3);font-size:12px">Génération en cours...</span>';
    generateTransferCode(clT2).then(code=>{
      if(!code){ if(resultDiv) resultDiv.innerHTML='<span style="color:var(--red)">Erreur — Supabase requis</span>'; return; }
      if(resultDiv) resultDiv.innerHTML=`
        <div style="text-align:center;padding:12px;background:var(--bg3);border-radius:8px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px">Code de transfert (valable 48h)</div>
          <div style="font-size:28px;font-weight:700;font-family:monospace;letter-spacing:4px;color:var(--blue)">${code}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">Communiquez ce code à votre collègue</div>
        </div>`;
      // Cacher le bouton Confirmer
      const btn=document.querySelector('.modal-footer .btn-primary');
      if(btn) btn.style.display='none';
    });
    return;
  } else if(t==='claimTransfer'){
    const code=(document.getElementById('m-tcode').value||'').trim().toUpperCase();
    const errEl=document.getElementById('m-terr');
    if(!code){errEl.textContent='Entrez un code';return;}
    errEl.textContent='Recherche en cours...'; errEl.style.color='var(--text2)';
    claimTransferCode(code).then(res=>{
      if(res.ok){ closeModal(); render(); toast('✓ Classe reprise avec succès !'); }
      else { errEl.textContent=res.error; errEl.style.color='var(--red)'; }
    });
    return;
  } else if(t==='addSeq'){
    const name=document.getElementById('m-name').value.trim(); if(!name) return;
    const cl=curClass()||D.classes[D.classes.length-1]; if(!cl) return;
    if(!cl.sequences) cl.sequences=[];
    const sq={id:uid(),name,activities:[]};
    cl.sequences.push(sq); saveData();closeModal();
    nav.classId=cl.id; nav.seqId=sq.id; nav.screen='seq'; render();
  } else if(t==='addStudent'){
    const raw=document.getElementById('m-names').value;
    const names=raw.split('\n').map(n=>n.trim()).filter(Boolean); if(!names.length) return;
    const cl=curClass(); if(!cl) return;
    if(!cl.students) cl.students=[];
    names.forEach(n=>cl.students.push({id:uid(),name:n}));
    saveData();closeModal();render();toast(`✓ ${names.length} élève(s) ajouté(s)`);
  } else if(t==='addActivity'){
    const name=document.getElementById('m-name').value.trim(); if(!name) return;
    const sq=curSeq(); if(!sq) return;
    if(!sq.activities) sq.activities=[];
    sq.activities.push({id:uid(),name,locked:false,sessions:[],items:[],studentData:{}});
    saveData();closeModal();render();
  } else if(t==='addSession'){
    const name=document.getElementById('m-sname').value.trim();
    const date=document.getElementById('m-date').value;
    const sq=curSeq(); if(!sq) return;
    const act=getAct(sq,mState.extra); if(!act) return;
    if(!act.sessions) act.sessions=[];
    const n=act.sessions.length+1;
    act.sessions.push({id:uid(),name:name||'S'+n,date:date||null});
    saveData();closeModal();render();
  } else if(t==='addItems'){
    const raw=document.getElementById('m-items').value;
    const compId=document.getElementById('m-comp').value||null;
    const labels=raw.split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean); if(!labels.length) return;
    const sq=curSeq(); const act=getAct(sq,mState.extra); if(!act) return;
    if(!act.items) act.items=[];
    labels.forEach(l=>act.items.push({id:uid(),label:l,compId}));
    saveData();closeModal();render();toast(`✓ ${labels.length} item(s) ajouté(s)`);
  } else if(t==='addQCM'){
    const qname=(document.getElementById('m-qname').value||'').trim(); if(!qname) return;
    const qmax =parseFloat(document.getElementById('m-qmax').value)||20;
    const qdate=document.getElementById('m-qdate').value;
    const sq=curSeq(); const act=getAct(sq,mState.extra); if(!act) return;
    if(!act.qcmNotes) act.qcmNotes=[];
    act.qcmNotes.push({id:uid(),name:qname,max:qmax,date:qdate||null,scores:{}});
    saveData(); closeModal(); render(); toast('✓ Note ajoutée');
  } else if(t==='archiveStudent'){
    const cl=curClass(); if(!cl) return;
    const st=(cl.students||[]).find(s=>s.id===mState.extra); if(!st) return;
    st.archived=true;
    st.archiveReason=document.getElementById('m-arch-reason').value||'autre';
    st.archiveDate=document.getElementById('m-arch-date').value||new Date().toISOString().slice(0,10);
    st.archiveNote=(document.getElementById('m-arch-note').value||'').trim();
    saveData(); closeModal(); render(); toast(`✓ ${st.name} sorti(e) de la liste active`);
  }
};

// ── Transfert de classe ──────────────────────────────────────────────────────
async function generateTransferCode(cl) {
  if (!window._sb || !getCurrentUser()) return null;
  try {
    const code = Math.random().toString(36).slice(2,8).toUpperCase();
    const expires = new Date(Date.now() + 48*3600*1000).toISOString();
    // Snapshot de la classe (sans isProfMode)
    const classData = JSON.parse(JSON.stringify(cl));
    await window._sb.from('class_transfers').insert({
      code,
      owner_id: getCurrentUser().id,
      class_data: classData,
      expires_at: expires,
      used: false
    });
    return code;
  } catch(e) {
    console.warn('[Transfer] generate error:', e.message);
    return null;
  }
}

async function claimTransferCode(code) {
  if (!window._sb || !getCurrentUser()) return { ok:false, error:'Non connecté' };
  try {
    // Chercher le code valide non utilisé
    const { data, error } = await window._sb.from('class_transfers')
      .select('*').eq('code', code).eq('used', false)
      .gt('expires_at', new Date().toISOString()).maybeSingle();
    if (error) throw error;
    if (!data) return { ok:false, error:'Code invalide ou expiré' };
    if (data.owner_id === getCurrentUser().id)
      return { ok:false, error:'Vous êtes déjà propriétaire de cette classe' };

    // Copier la classe dans les données du prof qui réclame
    const cl = data.class_data;
    cl.id = uid(); // Nouvel id pour éviter les conflits
    cl.viewCode = Math.random().toString(36).slice(2,8).toUpperCase();
    cl.transferredFrom = data.owner_id; // traçabilité
    D.classes.push(cl);
    saveData();

    // Marquer le code comme utilisé
    await window._sb.from('class_transfers')
      .update({ used: true, claimed_by: getCurrentUser().id, claimed_at: new Date().toISOString() })
      .eq('code', code);

    return { ok: true };
  } catch(e) {
    console.warn('[Transfer] claim error:', e.message);
    return { ok:false, error:'Erreur : ' + e.message };
  }
}

// ── Programme item tagging helpers ──────────────────────────────────────────
window._progMatOverride = {};
let _pickerWin = null;

function openProgPickerPopup(url, actId) {
  // Close existing picker if open
  if (_pickerWin && !_pickerWin.closed) _pickerWin.close();
  const w = 1100, h = 720;
  const left = Math.max(0, (screen.width - w) / 2);
  const top  = Math.max(0, (screen.height - h) / 2);
  _pickerWin = window.open(url, 'prog_picker',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
}

function buildLinkedPreview(act) {
  const items = act && act.progItems ? act.progItems : [];
  if (!items.length) return '<div style="color:var(--text3);font-size:12px">Aucun item lié pour l\'instant.</div>';
  return '<div style="display:flex;flex-wrap:wrap;gap:5px">'
    + items.map(pi=>`<span class="prog-tag" title="${esc(pi.contenu)}">${esc(pi.code)}<span class="prog-tag-del" onclick="removeProgItem(mState.extra,'${pi.code}');document.getElementById('prog-linked-preview').innerHTML=buildLinkedPreview(getAct(curSeq(),mState.extra))">×</span></span>`).join('')
    + '</div>';
}

// Listen for postMessage from picker popup
window.addEventListener('message', function(evt) {
  if (!evt.data || evt.data.type !== 'prog_toggle') return;
  const {code, contenu, checked, actId} = evt.data;
  const sq = curSeq(); if (!sq) return;
  const act = getAct(sq, actId); if (!act) return;
  if (!act.progItems) act.progItems = [];
  if (checked) {
    if (!act.progItems.find(p => p.code === code))
      act.progItems.push({code, contenu});
  } else {
    act.progItems = act.progItems.filter(p => p.code !== code);
  }
  saveData();
  // Refresh tags bar if visible
  const bar = document.querySelector(`.prog-tags-bar`);
  if (bar) {
    const canEdit = D.isProfMode && !act.locked;
    let bh = '<span class="prog-tags-lbl">📌 Items&nbsp;:</span>';
    (act.progItems||[]).forEach(pi => {
      bh += `<span class="prog-tag" title="${esc(pi.contenu)}">${esc(pi.code)}`;
      if (canEdit) bh += `<span class="prog-tag-del" onclick="removeProgItem('${act.id}','${pi.code}')">×</span>`;
      bh += '</span>';
    });
    bar.innerHTML = bh;
  }
  // Refresh modal preview if open
  const preview = document.getElementById('prog-linked-preview');
  if (preview) preview.innerHTML = buildLinkedPreview(act);
  syncProgItemToWDS(code, act);
});

function buildProgItemsList(allItems, existCodes) {
  if (!allItems || !allItems.length)
    return '<div style="color:var(--text3);font-size:12px;padding:8px">Aucun item pour ce niveau/matière.</div>';
  const byDom = {};
  allItems.forEach(it => { if(!byDom[it[2]])byDom[it[2]]=[]; byDom[it[2]].push(it); });
  let h = '';
  for (const [dom, items] of Object.entries(byDom)) {
    h += `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text2);margin:8px 0 3px;padding-left:2px">${esc(dom)}</div>`;
    items.forEach(it => {
      const [code,contenu,,niveau] = it;
      const checked = existCodes.has(code);
      const lvl = `<span style="font-size:8px;padding:1px 4px;border-radius:8px;background:var(--bg2);color:var(--text3);margin-left:4px">${niveau}</span>`;
      h += `<label class="prog-item-row${checked?' checked':''}" data-search="${code.toLowerCase()} ${contenu.toLowerCase()}">
        <input type="checkbox" ${checked?'checked':''} onchange="toggleProgItem('${code}',this.checked,'${contenu.replace(/'/g,"\'").replace(/"/g,"&quot;")}')">
        <span class="prog-item-code">${esc(code)}</span>${lvl}
        <span class="prog-item-label">${esc(contenu)}</span>
      </label>`;
    });
  }
  return h;
}

window.filterProgItems = function() {
  const q = (document.getElementById('m-progsearch').value||'').toLowerCase().trim();
  document.querySelectorAll('.prog-item-row').forEach(row => {
    row.style.display = (!q || (row.dataset.search||'').includes(q)) ? '' : 'none';
  });
};

window.toggleProgItem = function(code, checked, contenu) {
  const sq = curSeq(); if (!sq) return;
  const act = getAct(sq, mState.extra); if (!act) return;
  if (!act.progItems) act.progItems = [];
  if (checked) { if (!act.progItems.find(p=>p.code===code)) act.progItems.push({code,contenu}); }
  else { act.progItems = act.progItems.filter(p=>p.code!==code); }
  saveData();
  // Refresh tags bar without closing modal
  const bar = document.querySelector('.prog-tags-bar');
  if (bar) {
    const canEdit = D.isProfMode && !act.locked;
    let bh = '<span class="prog-tags-lbl">📌 Items&nbsp;:</span>';
    (act.progItems||[]).forEach(pi => {
      bh += `<span class="prog-tag" title="${esc(pi.contenu)}">${esc(pi.code)}`;
      if (canEdit) bh += `<span class="prog-tag-del" onclick="removeProgItem('${act.id}','${pi.code}')">×</span>`;
      bh += '</span>';
    });
    bar.innerHTML = bh;
  }
  syncProgItemToWDS(code, act);
};

window.removeProgItem = function(actId, code) {
  const sq = curSeq(); if (!sq) return;
  const act = getAct(sq, actId); if (!act) return;
  act.progItems = (act.progItems||[]).filter(p=>p.code!==code);
  saveData(); render();
  syncProgItemToWDS(code, act);
};

window.switchProgMat = function(actId, mat) {
  if (!window._progMatOverride) window._progMatOverride = {};
  window._progMatOverride[actId] = mat;
  closeModal(); openModal('tagProg', actId);
};

async function syncProgItemToWDS(code, act) {
  if (!window._sb) return;
  const cl = curClass(); if (!cl) return;
  try {
    // Rebuild activity_items for this activity
    await window._sb.from('activity_items').delete().eq('activity_id', act.id);
    const rows = (act.progItems||[]).map(p=>({activity_id:act.id, item_code:p.code}));
    if (rows.length) await window._sb.from('activity_items').insert(rows);
    // Recount activity_count for changed code across all activities in class
    const allActs = [];
    (cl.sequences||[]).forEach(sq=>(sq.activities||[]).forEach(a=>allActs.push(a)));
    const allCodes = new Set();
    allActs.forEach(a=>(a.progItems||[]).forEach(p=>allCodes.add(p.code)));
    for (const c of allCodes) {
      const count = allActs.filter(a=>(a.progItems||[]).some(p=>p.code===c)).length;
      await window._sb.from('wds_coverage')
        .upsert({classe_id:cl.id,item_code:c,activity_count:count,updated_at:new Date().toISOString()},
                {onConflict:'classe_id,item_code'});
    }
  } catch(e) { console.warn('[WDS sync]',e.message); }
}

// ── Export CSV
window.doExportCSV=function(clId,sqId){
  const cl=D.classes.find(c=>c.id===clId); if(!cl) return;
  const sq=(cl.sequences||[]).find(s=>s.id===sqId); if(!sq) return;
  const sts=activeStudents(cl), acts=sq.activities||[];
  const comps=getComps(cl);
  const rows=[['Élève',...acts.map(a=>a.name+' (/10)'),...comps.map(c=>c.short+' – '+c.label)]];
  sts.forEach(st=>{
    const row=[st.name];
    acts.forEach(act=>{
      const r=computeScore(act,st.id);
      row.push(r&&!r.allAbsent?r.real.toFixed(2):(r&&r.allAbsent?'A':''));
    });
    const lvls=computeCompAcq(cl,sq,st.id);
    comps.forEach(c=>{const lv=lvls[c.id];row.push(lv?lv.id:'');});
    rows.push(row);
  });
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url;
  a.download=`${cl.name}_${sq.name}.csv`.replace(/[/\\?%*:|"<>]/g,'-');
  a.click(); URL.revokeObjectURL(url);
  closeModal(); toast('✓ Export CSV téléchargé');
};

// ── Export Livret Scolaire (3ème — Socle commun) ────────────────────────────
window.exportLivret=function(clId, sqId){
  const cl=D.classes.find(c=>c.id===clId); if(!cl) return;
  const sq=(cl.sequences||[]).find(s=>s.id===sqId); if(!sq) return;
  const sts=activeStudents(cl);
  // En-tête
  const domNames = SOCLE.map(d=>d.label);
  const acqNames = SOCLE.map(d=>d.id);
  const rows=[['Élève', ...domNames.map(d=>d+' (niveau)'), ...domNames.map(d=>d+' (%)')  ]];
  sts.forEach(st=>{
    const sLvls=computeSocleAcq(cl,sq,st.id);
    const row=[st.name];
    SOCLE.forEach(dom=>{ const lv=sLvls[dom.id]; row.push(lv?lv.label:''); });
    SOCLE.forEach(dom=>{ const lv=sLvls[dom.id]; row.push(lv?lv.pct.toFixed(0)+'%':''); });
    rows.push(row);
  });
  // Légende en bas
  rows.push([]);
  rows.push(['LÉGENDE DES NIVEAUX']);
  rows.push(['NA','Non acquis','0-24%']);
  rows.push(['PA',"En cours d'acquisition",'25-49%']);
  rows.push(['A','Acquis','50-74%']);
  rows.push(['M','Maîtrisé','75-100%']);
  rows.push([]);
  rows.push(['CORRESPONDANCES COMPÉTENCES → DOMAINES (3ème)']);
  SOCLE.forEach(dom=>rows.push([dom.id, dom.label, 'Compétences : '+dom.comps.join(', '), dom.desc]));

  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url;
  a.download=`Livret_${cl.name}_${sq.name}.csv`.replace(/[/\\?%*:|"<>]/g,'-');
  a.click(); URL.revokeObjectURL(url);
  toast('✓ Export Livret téléchargé');
};

// ── Reset ────────────────────────────────────────────────────────────────────
window.resetAllData=async function(){
  if(!confirm('⚠️ ATTENTION : ceci supprime TOUTES les données (local + Supabase). Irréversible.\n\nConfirmer ?')) return;
  if(!confirm('Dernière confirmation ?')) return;
  ['suiviComp_v2','suiviComp_v3','suiviComp_v4','suiviComp_v5'].forEach(k=>localStorage.removeItem(k));
  D=defaultData(); nav={screen:'home',classId:null,seqId:null};
  // Effacer aussi sur Supabase
  if(_sb && _currentUser){
    try{ await _sb.from('app_data').delete().eq('user_id',_currentUser.id); }
    catch(e){ console.warn('Reset Supabase failed:',e); }
  }
  saveData(); closeModal(); render(); toast('✓ Données effacées partout');
};
window.clearOldKeys=function(){
  ['suiviComp_v2','suiviComp_v3','suiviComp_v4'].forEach(k=>localStorage.removeItem(k));
  toast('✓ Anciennes clés supprimées'); closeModal();
};

// ── FAB + Keyboard ───────────────────────────────────────────────────────────
function updateFab(){
  const fab=document.getElementById('export-fab'); if(!fab) return;
  fab.style.display=(D.isProfMode&&(nav.screen==='class'||nav.screen==='seq'))?'block':'none';
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(document.getElementById('projector')){closeProjector();return;}
    closeModal();
    return;
  }
  // Ctrl+Shift+P (ou Cmd+Shift+P sur Mac) = activation mode prof
  if((e.ctrlKey||e.metaKey) && e.shiftKey && e.key==='P'){
    e.preventDefault();
    if(D.isProfMode) logoutProf();
    else openModal('login');
  }
});

// ── Migration : générer viewCode pour les classes qui n'en ont pas ───────────
function migrateAnnees() {
  const cy = currentSchoolYear();
  let changed = false;
  (D.classes||[]).forEach(cl => {
    if (!cl.annee) { cl.annee = cy; changed = true; }
  });
  if (changed) saveData();
}

function migrateViewCodes() {
  let changed = false;
  (D.classes||[]).forEach(cl => {
    if (!cl.viewCode) {
      cl.viewCode = Math.random().toString(36).slice(2,8).toUpperCase();
      changed = true;
    }
  });
  if (changed) saveData();
}

// ── Init ─────────────────────────────────────────────────────────────────────
// 1. Affichage immédiat depuis localStorage
migrateViewCodes();
migrateAnnees();
render();
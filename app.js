/* ==========================================================================
   RH · NDF — application locale (localStorage), sans compte, sans serveur.
   ========================================================================== */

const STORAGE_KEY = 'rhndf_data_v1';

const CASES_DEF = [
  { key: 'TR',       label: 'Ticket restaurant',      tarifKey: null,       manualAmount: false },
  { key: 'IT',       label: 'Indemnité transport',    tarifKey: 'IT',       manualAmount: false },
  { key: 'MIDI',     label: 'Repas midi',             tarifKey: 'MIDI',     manualAmount: false },
  { key: 'SOIR',     label: 'Repas soir',             tarifKey: 'SOIR',     manualAmount: false },
  { key: 'HOTEL_BS', label: 'Hôtel basse saison',     tarifKey: 'HOTEL_BS', manualAmount: false },
  { key: 'HOTEL_HS', label: 'Hôtel haute saison',     tarifKey: 'HOTEL_HS', manualAmount: false },
  { key: 'HOTEL_HF', label: 'Hôtel hors forfait',     tarifKey: null,       manualAmount: true  }
];

const DEFAULT_TARIFS = { IT: 2.65, MIDI: 12, SOIR: 15, HOTEL_BS: 58, HOTEL_HS: 68 };

const DEFAULT_HEURES_JOUR = 7 * 60 + 48;   // 7h48 par jour ouvré
function sanitizeHeuresJour(v) {
  return (typeof v === 'number' && isFinite(v) && v > 0 && v <= 24 * 60) ? Math.round(v) : DEFAULT_HEURES_JOUR;
}

/* ---------------------------------------------------------------------- */
/* State                                                                   */
/* ---------------------------------------------------------------------- */

const DEFAULT_CATEGORIES_HF = [
  'CARBURANT',
  'PEAGE / PARKING / TRAIN / TAXI',
  'CONSOMMATION',
  'ACHAT MATERIEL',
  'LAVAGE VOITURE',
  'HOTEL HORS FORFAIT',
  'LA POSTE',
  'DIVERS'
];

function sanitizeCategories(arr) {
  if (!Array.isArray(arr)) return DEFAULT_CATEGORIES_HF.slice();
  const out = arr.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
  return out.length ? out : DEFAULT_CATEGORIES_HF.slice();
}

const CAT_COLS = {
  C: 'Carburant', D: 'Péage / Parking / Train / Taxi', E: 'Consommation', F: 'Achat matériel',
  G: 'Lavage voiture', H: 'Hôtel hors forfait', I: 'La Poste', J: 'Divers'
};
const DEFAULT_CAT_COLS = {
  'CARBURANT': 'C', 'PEAGE / PARKING / TRAIN / TAXI': 'D', 'CONSOMMATION': 'E', 'ACHAT MATERIEL': 'F',
  'LAVAGE VOITURE': 'G', 'HOTEL HORS FORFAIT': 'H', 'LA POSTE': 'I', 'DIVERS': 'J'
};
function sanitizeCatCols(obj, cats) {
  const out = {};
  cats.forEach(c => {
    const v = obj && typeof obj === 'object' ? obj[c] : null;
    out[c] = (typeof v === 'string' && CAT_COLS[v]) ? v : (DEFAULT_CAT_COLS[c] || 'J');
  });
  return out;
}

function sanitizeJustifs(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(j => j && typeof j.id === 'string').map(j => ({
    id: j.id,
    date: typeof j.date === 'string' ? j.date : '',
    montant: parseFloat(j.montant) || 0,
    categorie: typeof j.categorie === 'string' ? j.categorie : '',
    libelle: typeof j.libelle === 'string' ? j.libelle : '',
    fileName: typeof j.fileName === 'string' ? j.fileName : '',
    fileType: typeof j.fileType === 'string' ? j.fileType : ''
  }));
}

function defaultState() {
  return {
    settings: {
      missions: [],
      equipes: [],
      affectations: [],
      zones: [],
      voitures: [],
      categoriesHF: DEFAULT_CATEGORIES_HF.slice(),   // catégories des justificatifs hors forfait
      categoriesHFCol: sanitizeCatCols(null, DEFAULT_CATEGORIES_HF), // catégorie -> colonne Excel (C..J)
      tarifs: { ...DEFAULT_TARIFS },
      heuresJour: DEFAULT_HEURES_JOUR,      // minutes à effectuer par jour ouvré (lun–ven)
      congesReduisentSolde: false           // true : un jour de congés retire heuresJour du solde (comme une récup)
    },
    days: {},   // 'YYYY-MM-DD' -> day object
    weeks: {},  // 'YYYY-Www'   -> { avance: number }
    justifs: [] // justificatifs hors forfait (métadonnées ; les fichiers sont dans IndexedDB)
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      settings: {
        missions: parsed.settings?.missions || [],
        equipes: parsed.settings?.equipes || [],
        affectations: parsed.settings?.affectations || [],
        zones: parsed.settings?.zones || [],
        voitures: parsed.settings?.voitures || [],
        categoriesHF: sanitizeCategories(parsed.settings?.categoriesHF),
        categoriesHFCol: sanitizeCatCols(parsed.settings?.categoriesHFCol, sanitizeCategories(parsed.settings?.categoriesHF)),
        tarifs: { ...base.settings.tarifs, ...(parsed.settings?.tarifs || {}) },
        heuresJour: sanitizeHeuresJour(parsed.settings?.heuresJour),
        congesReduisentSolde: !!parsed.settings?.congesReduisentSolde
      },
      days: parsed.days || {},
      weeks: parsed.weeks || {},
      justifs: sanitizeJustifs(parsed.justifs)
    };
  } catch (e) {
    console.error('Erreur de lecture des données locales', e);
    return defaultState();
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function emptyDay(dateStr) {
  return {
    date: dateStr,
    mission: '',
    zone: '',
    equipe: '',
    voiture: '',
    affectation: '',
    cases: { TR: false, IT: false, MIDI: false, SOIR: false, HOTEL_BS: false, HOTEL_HS: false, HOTEL_HF: false },
    horaires: { debutAM: '', finAM: '', debutPM: '', finPM: '' },
    commentaire: '',
    hotelHF: 0,
    depensesReelles: { TR: 0, MIDI: 0, SOIR: 0, HOTEL_BS: 0, HOTEL_HS: 0 },
    horsForfait: { montant: 0, note: '' },
    forfaitSpecial: { montant: 0, note: '' }
  };
}

/* ---------------------------------------------------------------------- */
/* Dates / semaine ISO                                                    */
/* ---------------------------------------------------------------------- */

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getISOWeekInfo(dateObj) {
  const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  const year = d.getUTCFullYear();
  return { week, year, key: `${year}-W${String(week).padStart(2, '0')}` };
}

function firstOfMonth(dateObj) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
}

function getMonday(dateObj) {
  const d = new Date(dateObj);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekDates(mondayDate) {
  const arr = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    arr.push(d);
  }
  return arr;
}

const JOURS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];
const MOIS_FR_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function fmtShort(d) {
  return `${JOURS_FR[(d.getDay() + 6) % 7]} ${d.getDate()} ${MOIS_FR[d.getMonth()]}`;
}
function fmtDMY(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function money(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/* ---------------------------------------------------------------------- */
/* Toast                                                                   */
/* ---------------------------------------------------------------------- */

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ---------------------------------------------------------------------- */
/* Tabs                                                                     */
/* ---------------------------------------------------------------------- */

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
  document.body.classList.remove('theme-rh', 'theme-ndf', 'theme-param');
  document.body.classList.add('theme-' + tab);
  if (tab === 'ndf') renderNDF();
  if (tab === 'rh') renderRH();
  if (tab === 'param') renderParam();
}

/* ---------------------------------------------------------------------- */
/* Onglet RH                                                                */
/* ---------------------------------------------------------------------- */

let rhCurrentDate = toDateStr(new Date());
let rhWeekMonday = getMonday(new Date());
let rhMonthDate = firstOfMonth(new Date());   // toujours le 1er : évite qu'un setMonth() depuis le 31 saute un mois

function weekTotalHours(monday) {
  let total = 0;
  weekDates(monday).forEach(d => {
    const day = state.days[toDateStr(d)];
    if (day) total += dayTotalHours(day);
  });
  return total;
}

function monthTotalHours(monthDate) {
  const y = monthDate.getFullYear(), m = monthDate.getMonth();
  let total = 0;
  Object.keys(state.days).forEach(ds => {
    const d = parseDateStr(ds);
    if (d.getFullYear() === y && d.getMonth() === m) total += dayTotalHours(state.days[ds]);
  });
  return total;
}

function renderRHTotals() {
  const info = getISOWeekInfo(rhWeekMonday);
  const dates = weekDates(rhWeekMonday);
  document.getElementById('rhWeekTotalLabel').textContent = `S. ${info.week} (${fmtDMY(dates[0])} - ${fmtDMY(dates[6])})`;
  document.getElementById('rhWeekTotalHours').textContent = fmtHoursHM(weekTotalHours(rhWeekMonday));

  document.getElementById('rhMoisTotalLabel').textContent = `${MOIS_FR_LONG[rhMonthDate.getMonth()]} ${rhMonthDate.getFullYear()}`;
  document.getElementById('rhMoisTotalHours').textContent = fmtHoursHM(monthTotalHours(rhMonthDate));

  renderSolde();
}

function fillSelect(select, items, currentValue) {
  let optionsList = items.slice();
  if (currentValue && !optionsList.includes(currentValue)) optionsList = [currentValue, ...optionsList];
  select.innerHTML = '<option value="">-- Sélectionner --</option>' +
    optionsList.map(it => `<option value="${escapeHtml(it)}">${escapeHtml(it)}</option>`).join('');
  select.value = currentValue || '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function updateWeekBadges(dateStr) {
  const info = getISOWeekInfo(parseDateStr(dateStr));
  const label = `S. ${info.week}`;
  document.getElementById('topWeekStamp').textContent = label;
  const wd = document.getElementById('rhWeekDisplay');
  if (wd) wd.value = `${label} — ${info.year}`;
  return info;
}

function buildCasesGrid(day) {
  const grid = document.getElementById('rhCasesGrid');
  grid.innerHTML = CASES_DEF.map(c => {
    const checked = day.cases[c.key];
    let amtLabel = '';
    if (c.tarifKey) amtLabel = money(state.settings.tarifs[c.tarifKey]);
    else if (c.manualAmount) amtLabel = 'manuel';
    return `
      <label class="chk ${checked ? 'on' : ''}" data-case="${c.key}">
        <input type="checkbox" data-case-input="${c.key}" ${checked ? 'checked' : ''}>
        ${c.label}
        <span class="amt">${amtLabel}</span>
      </label>
      ${c.key === 'HOTEL_HF' ? `
      <div class="field chk-inline-input" id="hotelHFWrap" style="display:${checked ? 'block' : 'none'};">
        <label>Montant Hôtel HF (manuel)</label>
        <input type="number" step="0.01" id="hotelHFAmount" value="${day.hotelHF || 0}">
      </div>` : ''}
    `;
  }).join('');

  grid.querySelectorAll('input[data-case-input]').forEach(inp => {
    inp.addEventListener('change', () => {
      const label = inp.closest('.chk');
      label.classList.toggle('on', inp.checked);
      if (inp.dataset.caseInput === 'HOTEL_HF') {
        document.getElementById('hotelHFWrap').style.display = inp.checked ? 'block' : 'none';
      }
    });
  });
}

function renderRH() {
  const dateInput = document.getElementById('rhDate');
  dateInput.value = rhCurrentDate;
  const info = updateWeekBadges(rhCurrentDate);

  const day = state.days[rhCurrentDate] || emptyDay(rhCurrentDate);

  fillSelect(document.getElementById('rhMission'), state.settings.missions, day.mission);
  fillSelect(document.getElementById('rhEquipe'), state.settings.equipes, day.equipe);
  fillSelect(document.getElementById('rhAffectation'), state.settings.affectations, day.affectation);
  fillSelect(document.getElementById('rhZone'), state.settings.zones, day.zone);
  fillSelect(document.getElementById('rhVoiture'), state.settings.voitures, day.voiture);

  buildCasesGrid(day);

  document.getElementById('hDebutAM').value = day.horaires.debutAM || '';
  document.getElementById('hFinAM').value = day.horaires.finAM || '';
  document.getElementById('hDebutPM').value = day.horaires.debutPM || '';
  document.getElementById('hFinPM').value = day.horaires.finPM || '';
  document.getElementById('rhCommentaire').value = day.commentaire || '';

  renderRHHistory();
  renderRHTotals();
}

function readRHForm() {
  const day = emptyDay(rhCurrentDate);
  day.mission = document.getElementById('rhMission').value;
  day.zone = document.getElementById('rhZone').value;
  day.equipe = document.getElementById('rhEquipe').value;
  day.voiture = document.getElementById('rhVoiture').value;
  day.affectation = document.getElementById('rhAffectation').value;

  CASES_DEF.forEach(c => {
    const inp = document.querySelector(`input[data-case-input="${c.key}"]`);
    day.cases[c.key] = !!(inp && inp.checked);
  });

  const hfAmt = document.getElementById('hotelHFAmount');
  day.hotelHF = hfAmt ? (parseFloat(hfAmt.value) || 0) : 0;

  day.horaires.debutAM = document.getElementById('hDebutAM').value;
  day.horaires.finAM = document.getElementById('hFinAM').value;
  day.horaires.debutPM = document.getElementById('hDebutPM').value;
  day.horaires.finPM = document.getElementById('hFinPM').value;
  day.commentaire = document.getElementById('rhCommentaire').value.trim();

  // conserve les données NDF déjà saisies pour ce jour si elles existent
  const existing = state.days[rhCurrentDate];
  if (existing) {
    day.depensesReelles = existing.depensesReelles;
    day.horsForfait = existing.horsForfait;
    day.forfaitSpecial = existing.forfaitSpecial;
  }
  return day;
}

function timeDiffHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff = 0;
  return diff / 60;
}

function dayTotalHours(day) {
  return timeDiffHours(day.horaires.debutAM, day.horaires.finAM) +
         timeDiffHours(day.horaires.debutPM, day.horaires.finPM);
}

function fmtHoursHM(h) {
  const totalMinutes = Math.round(h * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}h${String(mm).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------------- */
/* Solde d'heures : heures comptées − heures dues (base 7h48 / jour ouvré)  */
/* ---------------------------------------------------------------------- */
/* Règles :
   - Jour ouvré (lun–ven) : dû = heuresJour. Week-end : dû = 0 (les heures faites sont un pur supplément).
   - Travaillé : compté = heures pointées.
   - Férié / maladie (lun–ven) : compté = heures pointées + heuresJour  → écart 0 si rien pointé.
   - Récup : rien de compté, heuresJour dues → retire heuresJour du solde.
   - Congés : ni compté ni dû (sans effet), sauf si l'option « congés réduisent le solde » est cochée.
   - Seuls les jours enregistrés comptent : un jour non saisi est ignoré.
   Le type d'un jour est reconnu au nom de sa mission ou de son affectation
   (contient « récup », « congé », « férié » ou « maladie », accents et casse ignorés). */

const KIND_LABELS = { travail: 'Travail', ferie: 'Férié', maladie: 'Maladie', recup: 'Récup', conges: 'Congés' };

function normTxt(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function dayKind(day) {
  const t = normTxt(day.mission) + ' ' + normTxt(day.affectation);
  if (t.includes('recup')) return 'recup';
  if (t.includes('conge')) return 'conges';
  if (t.includes('ferie')) return 'ferie';
  if (t.includes('malad')) return 'maladie';
  return 'travail';
}

function toMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function spanMinutes(start, end) {
  const s = toMinutes(start), e = toMinutes(end);
  if (s === null || e === null) return 0;
  return Math.max(0, e - s);
}

function dayWorkedMinutes(day) {
  return spanMinutes(day.horaires.debutAM, day.horaires.finAM) +
         spanMinutes(day.horaires.debutPM, day.horaires.finPM);
}

function daySolde(dateStr, day) {
  const dow = parseDateStr(dateStr).getDay();   // 0 = dimanche
  const weekday = dow >= 1 && dow <= 5;
  const full = state.settings.heuresJour;
  const kind = dayKind(day);
  const worked = dayWorkedMinutes(day);
  let due = weekday ? full : 0;
  let counted = worked;
  if ((kind === 'ferie' || kind === 'maladie') && weekday) counted += full;
  if (kind === 'conges' && !state.settings.congesReduisentSolde) due = 0;
  return { kind, weekday, worked, counted, due, diff: counted - due };
}

function sumSolde(dateStrs) {
  const agg = { counted: 0, due: 0, diff: 0, n: 0 };
  dateStrs.forEach(ds => {
    const day = state.days[ds];
    if (!day) return;
    const s = daySolde(ds, day);
    agg.counted += s.counted; agg.due += s.due; agg.diff += s.diff; agg.n++;
  });
  return agg;
}

function fmtMin(min) {
  const a = Math.abs(Math.round(min));
  return `${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`;
}

function fmtSigned(min) {
  const r = Math.round(min);
  if (r === 0) return '0h00';
  return (r > 0 ? '+' : '−') + fmtMin(r);
}

function signClass(min) {
  const r = Math.round(min);
  return r > 0 ? 'pos' : (r < 0 ? 'neg' : 'zero');
}

function kindNote(s) {
  const full = fmtMin(state.settings.heuresJour);
  switch (s.kind) {
    case 'ferie':   return s.weekday ? `Férié : ${full} comptées` : 'Férié un week-end : rien de compté';
    case 'maladie': return s.weekday ? `Maladie : ${full} comptées` : 'Maladie un week-end : rien de compté';
    case 'recup':   return s.weekday ? `Récup : rien de compté, ${full} retirées du solde` : 'Récup un week-end : sans effet';
    case 'conges':  return state.settings.congesReduisentSolde && s.weekday
                      ? `Congés : ${full} retirées du solde (option activée)`
                      : 'Congés : sans effet sur le solde';
    default:        return s.weekday ? 'Jour travaillé' : 'Week-end : heures en supplément';
  }
}

let soldeDay = new Date();
let soldeMonday = getMonday(new Date());
let soldeMonth = firstOfMonth(new Date());
let soldeYear = new Date().getFullYear();

function renderSolde() {
  const root = document.getElementById('soldeBlocks');
  if (!root) return;
  document.getElementById('soldeBase').textContent = `base ${fmtMin(state.settings.heuresJour)} / jour`;

  const pad = n => String(n).padStart(2, '0');
  const jourStr = toDateStr(soldeDay);
  const jourDay = state.days[jourStr];
  const jourS = jourDay ? daySolde(jourStr, jourDay) : null;

  const wDates = weekDates(soldeMonday);
  const wInfo = getISOWeekInfo(soldeMonday);
  const mPrefix = `${soldeMonth.getFullYear()}-${pad(soldeMonth.getMonth() + 1)}-`;
  const yPrefix = `${soldeYear}-`;
  const keys = Object.keys(state.days);
  const nJours = n => `${n} jour${n > 1 ? 's' : ''} saisi${n > 1 ? 's' : ''}`;

  const blocks = [
    { id: 'jour', title: 'Jour',
      label: `${fmtShort(soldeDay)} ${soldeDay.getFullYear()}`,
      agg: sumSolde([jourStr]),
      note: jourS ? kindNote(jourS) : 'Aucune saisie ce jour' },
    { id: 'semaine', title: 'Semaine',
      label: `S. ${wInfo.week} (${fmtDMY(wDates[0])} - ${fmtDMY(wDates[6])})`,
      agg: sumSolde(wDates.map(toDateStr)), note: null },
    { id: 'mois', title: 'Mois',
      label: `${MOIS_FR_LONG[soldeMonth.getMonth()]} ${soldeMonth.getFullYear()}`,
      agg: sumSolde(keys.filter(k => k.startsWith(mPrefix))), note: null },
    { id: 'annee', title: 'Année',
      label: String(soldeYear),
      agg: sumSolde(keys.filter(k => k.startsWith(yPrefix))), note: null }
  ];

  root.innerHTML = blocks.map(b => {
    const empty = b.agg.n === 0;
    const cls = empty ? 'zero' : signClass(b.agg.diff);
    return `
    <div class="solde-block">
      <div class="solde-title">${b.title}</div>
      <div class="week-nav" style="margin-bottom:9px;">
        <button data-solde="${b.id}" data-dir="-1" aria-label="${b.title} précédent">‹</button>
        <div class="week-big"><div class="num mono" style="font-size:16px;">${escapeHtml(b.label)}</div></div>
        <button data-solde="${b.id}" data-dir="1" aria-label="${b.title} suivant">›</button>
      </div>
      <div class="solde-grid">
        <div class="solde-cell"><div class="label">Comptées</div><div class="val mono">${empty ? '—' : fmtMin(b.agg.counted)}</div></div>
        <div class="solde-cell"><div class="label">Dues</div><div class="val mono">${empty ? '—' : fmtMin(b.agg.due)}</div></div>
        <div class="solde-cell ecart ${cls}"><div class="label">Écart</div><div class="val mono">${empty ? '—' : fmtSigned(b.agg.diff)}</div></div>
      </div>
      <div class="hint solde-note">${escapeHtml(b.note !== null ? b.note : (empty ? 'Aucun jour saisi sur la période' : nJours(b.agg.n)))}</div>
    </div>`;
  }).join('');
}

function navSolde(id, dir) {
  if (id === 'jour') { soldeDay = new Date(soldeDay.getFullYear(), soldeDay.getMonth(), soldeDay.getDate() + dir); }
  else if (id === 'semaine') { soldeMonday = new Date(soldeMonday.getFullYear(), soldeMonday.getMonth(), soldeMonday.getDate() + 7 * dir); }
  else if (id === 'mois') { soldeMonth = new Date(soldeMonth.getFullYear(), soldeMonth.getMonth() + dir, 1); }
  else if (id === 'annee') { soldeYear += dir; }
  renderSolde();
}

function exportRHExcel() {
  if (typeof XLSX === 'undefined') {
    alert("La bibliothèque Excel n'a pas pu être chargée (connexion internet requise la première fois). Réessayez avec une connexion active.");
    return;
  }
  const dates = Object.keys(state.days).sort((a, b) => a.localeCompare(b));
  if (dates.length === 0) {
    toast('Aucune journée à exporter');
    return;
  }

  const rows = dates.map(d => {
    const day = state.days[d];
    const info = getISOWeekInfo(parseDateStr(d));
    const total = dayTotalHours(day);
    const row = {
      'Date': fmtDMY(parseDateStr(d)) + '/' + info.year,
      'Semaine': info.week,
      'Mission': day.mission || '',
      'Zone': day.zone || '',
      'Équipe': day.equipe || '',
      'Voiture': day.voiture || '',
      'Affectation': day.affectation || '',
      'Début AM': day.horaires.debutAM || '',
      'Fin AM': day.horaires.finAM || '',
      'Début PM': day.horaires.debutPM || '',
      'Fin PM': day.horaires.finPM || '',
      'Total heures': total > 0 ? Math.round(total * 100) / 100 : ''
    };
    CASES_DEF.forEach(c => { row[c.label] = day.cases[c.key] ? 'X' : ''; });
    row['Montant Hôtel HF'] = day.cases.HOTEL_HF ? (day.hotelHF || 0) : '';
    row['Commentaire'] = day.commentaire || '';
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, k.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relevé heures');
  XLSX.writeFile(wb, `releve_heures_${toDateStr(new Date())}.xlsx`);
}

function renderRHHistory() {
  const wrap = document.getElementById('rhHistory');
  const dates = Object.keys(state.days).sort((a, b) => b.localeCompare(a));
  if (dates.length === 0) {
    wrap.innerHTML = '<div class="empty">Aucune journée enregistrée pour le moment.</div>';
    return;
  }
  wrap.innerHTML = dates.map(d => {
    const day = state.days[d];
    const info = getISOWeekInfo(parseDateStr(d));
    const cases = CASES_DEF.filter(c => day.cases[c.key]).map(c => c.key).join(' · ');
    const h = day.horaires;
    const amStr = (h.debutAM || h.finAM) ? `AM ${h.debutAM || '--:--'} → ${h.finAM || '--:--'}` : '';
    const pmStr = (h.debutPM || h.finPM) ? `PM ${h.debutPM || '--:--'} → ${h.finPM || '--:--'}` : '';
    const horStr = [amStr, pmStr].filter(Boolean).join('  ·  ');
    const total = dayTotalHours(day);
    const sol = daySolde(d, day);
    const soldeChip = `<span class="d-solde ${signClass(sol.diff)}" title="${escapeHtml(kindNote(sol))}">${sol.kind !== 'travail' ? KIND_LABELS[sol.kind] + ' ' : ''}${fmtSigned(sol.diff)}</span>`;
    const commentHtml = day.commentaire ? `<br><span class="d-comment">💬 ${escapeHtml(day.commentaire)}</span>` : '';
    const details = [
      day.zone ? `Zone : ${escapeHtml(day.zone)}` : '',
      day.equipe ? `Équipe : ${escapeHtml(day.equipe)}` : '',
      day.voiture ? `Voiture : ${escapeHtml(day.voiture)}` : ''
    ].filter(Boolean).join(' · ');
    return `
      <div class="day-item">
        <div class="d-date mono">${fmtDMY(parseDateStr(d))}</div>
        <div class="d-info">
          S.${info.week} · ${escapeHtml(day.mission || '—')}${day.affectation ? ' · ' + escapeHtml(day.affectation) : ''}
          ${details ? '<br><span class="d-details">' + details + '</span>' : ''}
          ${cases ? '<br>' + escapeHtml(cases) : ''}
          ${horStr ? `<br><span class="mono d-hours">${horStr}${total > 0 ? '  ·  ' + fmtHoursHM(total) : ''}</span>` : '<br><span class="d-hours">Aucune heure pointée</span>'}${soldeChip}
          ${commentHtml}
        </div>
        <div class="d-actions">
          <button class="icon-btn" data-edit="${d}">✎</button>
          <button class="icon-btn del" data-del="${d}">🗑</button>
        </div>
      </div>`;
  }).join('');

  wrap.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    rhCurrentDate = b.dataset.edit;
    renderRH();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Supprimer cette journée ?')) {
      delete state.days[b.dataset.del];
      saveState();
      renderRHHistory();
      renderRHTotals();
      if (b.dataset.del === rhCurrentDate) renderRH();
    }
  }));
}

function initRHEvents() {
  document.getElementById('rhDate').addEventListener('change', (e) => {
    rhCurrentDate = e.target.value || toDateStr(new Date());
    renderRH();
  });

  document.querySelectorAll('.btn-now').forEach(btn => {
    btn.addEventListener('click', () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const map = { debutAM: 'hDebutAM', finAM: 'hFinAM', debutPM: 'hDebutPM', finPM: 'hFinPM' };
      document.getElementById(map[btn.dataset.h]).value = `${hh}:${mm}`;
    });
  });

  document.getElementById('btnSaveDay').addEventListener('click', () => {
    const day = readRHForm();
    state.days[day.date] = day;
    saveState();
    renderRHHistory();
    renderRHTotals();
    toast('Journée enregistrée ✓');
  });

  document.getElementById('btnExportExcel').addEventListener('click', exportRHExcel);

  document.getElementById('btnDuplicate').addEventListener('click', () => {
    const dates = Object.keys(state.days).filter(d => d !== rhCurrentDate).sort((a, b) => b.localeCompare(a));
    if (dates.length === 0) { toast('Aucune journée précédente à dupliquer'); return; }
    const last = state.days[dates[0]];
    fillSelect(document.getElementById('rhMission'), state.settings.missions, last.mission);
    fillSelect(document.getElementById('rhZone'), state.settings.zones, last.zone);
    fillSelect(document.getElementById('rhEquipe'), state.settings.equipes, last.equipe);
    fillSelect(document.getElementById('rhVoiture'), state.settings.voitures, last.voiture);
    fillSelect(document.getElementById('rhAffectation'), state.settings.affectations, last.affectation);

    const dayForGrid = emptyDay(rhCurrentDate);
    dayForGrid.cases = { ...last.cases };
    dayForGrid.hotelHF = last.hotelHF;
    buildCasesGrid(dayForGrid);

    document.getElementById('hDebutAM').value = last.horaires.debutAM || '';
    document.getElementById('hFinAM').value = last.horaires.finAM || '';
    document.getElementById('hDebutPM').value = last.horaires.debutPM || '';
    document.getElementById('hFinPM').value = last.horaires.finPM || '';

    toast('Dernière journée dupliquée — pensez à enregistrer');
  });

  document.getElementById('soldeBlocks').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-solde]');
    if (b) navSolde(b.dataset.solde, parseInt(b.dataset.dir, 10));
  });

  document.getElementById('rhWeekPrev').addEventListener('click', () => {
    rhWeekMonday.setDate(rhWeekMonday.getDate() - 7);
    rhWeekMonday = new Date(rhWeekMonday);
    renderRHTotals();
  });
  document.getElementById('rhWeekNext').addEventListener('click', () => {
    rhWeekMonday.setDate(rhWeekMonday.getDate() + 7);
    rhWeekMonday = new Date(rhWeekMonday);
    renderRHTotals();
  });
  document.getElementById('rhMoisPrev').addEventListener('click', () => {
    rhMonthDate.setMonth(rhMonthDate.getMonth() - 1);
    rhMonthDate = new Date(rhMonthDate);
    renderRHTotals();
  });
  document.getElementById('rhMoisNext').addEventListener('click', () => {
    rhMonthDate.setMonth(rhMonthDate.getMonth() + 1);
    rhMonthDate = new Date(rhMonthDate);
    renderRHTotals();
  });
}

/* ---------------------------------------------------------------------- */
/* Onglet NDF                                                               */
/* ---------------------------------------------------------------------- */

let ndfMonday = getMonday(new Date());
let ndfMonthDate = firstOfMonth(new Date());
let ndfYearValue = new Date().getFullYear();

function dayForecastDeduction(day) {
  if (!day) return 0;
  const t = state.settings.tarifs;
  let v = 0;
  if (day.cases.IT) v += t.IT;
  if (day.cases.MIDI) v += t.MIDI;
  if (day.cases.SOIR) v += t.SOIR;
  if (day.cases.HOTEL_BS) v += t.HOTEL_BS;
  if (day.cases.HOTEL_HS) v += t.HOTEL_HS;
  if (day.cases.HOTEL_HF) v += (day.hotelHF || 0);
  v += (day.horsForfait.montant || 0);
  v += (day.forfaitSpecial.montant || 0);
  return v;
}

function dayRealExpense(day) {
  if (!day) return 0;
  let v = 0;
  if (day.cases.TR) v += (day.depensesReelles.TR || 0);
  if (day.cases.MIDI) v += (day.depensesReelles.MIDI || 0);
  if (day.cases.SOIR) v += (day.depensesReelles.SOIR || 0);
  if (day.cases.HOTEL_BS) v += (day.depensesReelles.HOTEL_BS || 0);
  if (day.cases.HOTEL_HS) v += (day.depensesReelles.HOTEL_HS || 0);
  if (day.cases.HOTEL_HF) v += (day.hotelHF || 0);
  return v;
}

function dayITGain(day) {
  if (!day) return 0;
  return day.cases.IT ? (state.settings.tarifs.IT || 0) : 0;
}

/* ---- Agrégats mensuels / annuels ---- */

function isoWeekToMonday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday; // date UTC (jour seul)
}

function emptyAgg() {
  return { avance: 0, forecast: 0, real: 0, it: 0, fs: 0, horsForfait: 0 };
}

// Regroupe l'avance (par semaine, rattachée au mois/année du lundi de la semaine)
// et les dépenses (par jour, rattachées au mois/année de la date du jour).
function computePeriodAggregates() {
  const months = {}; // 'YYYY-MM' -> agg
  const years = {};  // 'YYYY'    -> agg
  const getM = k => (months[k] = months[k] || emptyAgg());
  const getY = k => (years[k] = years[k] || emptyAgg());

  Object.keys(state.weeks).forEach(wk => {
    const m = wk.match(/^(\d+)-W(\d+)$/);
    if (!m) return;
    const avance = state.weeks[wk].avance || 0;
    if (!avance) return;
    const monday = isoWeekToMonday(parseInt(m[1], 10), parseInt(m[2], 10));
    const ym = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}`;
    const y = String(monday.getUTCFullYear());
    getM(ym).avance += avance;
    getY(y).avance += avance;
  });

  Object.keys(state.days).forEach(ds => {
    const day = state.days[ds];
    const d = parseDateStr(ds);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const y = String(d.getFullYear());
    const fc = dayForecastDeduction(day);
    const re = dayRealExpense(day);
    const it = dayITGain(day);
    const fs = day.forfaitSpecial.montant || 0;
    const hf = day.horsForfait.montant || 0;
    const mAgg = getM(ym);
    mAgg.forecast += fc; mAgg.real += re; mAgg.it += it; mAgg.fs += fs; mAgg.horsForfait += hf;
    const yAgg = getY(y);
    yAgg.forecast += fc; yAgg.real += re; yAgg.it += it; yAgg.fs += fs; yAgg.horsForfait += hf;
  });

  return { months, years };
}

function renderBilans() {
  const { months, years } = computePeriodAggregates();

  const mKey = `${ndfMonthDate.getFullYear()}-${String(ndfMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const mAgg = months[mKey] || emptyAgg();
  const mRestant = mAgg.avance - mAgg.forecast;
  const mGains = mAgg.avance - mAgg.real + mAgg.it + mAgg.fs;

  document.getElementById('moisLabel').textContent = `${MOIS_FR_LONG[ndfMonthDate.getMonth()]} ${ndfMonthDate.getFullYear()}`;
  document.getElementById('valRestantMois').textContent = money(mRestant);
  document.getElementById('valGainsMois').textContent = money(mGains);
  document.getElementById('tileRestantMois').className = 'stat-tile ' + (mRestant >= 0 ? 'pos' : 'neg');
  document.getElementById('tileGainsMois').className = 'stat-tile ' + (mGains >= 0 ? 'pos' : 'neg');
  document.getElementById('detailMois').textContent =
    `Avance : ${money(mAgg.avance)} · Dépenses réelles : ${money(mAgg.real)} · IT : ${money(mAgg.it)} · FS : ${money(mAgg.fs)} · Hors forfait : ${money(mAgg.horsForfait)}`;

  const yKey = String(ndfYearValue);
  const yAgg = years[yKey] || emptyAgg();
  const yRestant = yAgg.avance - yAgg.forecast;
  const yGains = yAgg.avance - yAgg.real + yAgg.it + yAgg.fs;

  document.getElementById('anLabel').textContent = String(ndfYearValue);
  document.getElementById('valRestantAn').textContent = money(yRestant);
  document.getElementById('valGainsAn').textContent = money(yGains);
  document.getElementById('tileRestantAn').className = 'stat-tile ' + (yRestant >= 0 ? 'pos' : 'neg');
  document.getElementById('tileGainsAn').className = 'stat-tile ' + (yGains >= 0 ? 'pos' : 'neg');
  document.getElementById('detailAn').textContent =
    `Avance : ${money(yAgg.avance)} · Dépenses réelles : ${money(yAgg.real)} · IT : ${money(yAgg.it)} · FS : ${money(yAgg.fs)} · Hors forfait : ${money(yAgg.horsForfait)}`;
}

function renderNDF() {
  const info = getISOWeekInfo(ndfMonday);
  document.getElementById('ndfWeekNum').textContent = `S. ${info.week}`;
  document.getElementById('topWeekStamp').textContent = `S. ${info.week}`;
  const dates = weekDates(ndfMonday);
  document.getElementById('ndfWeekRange').textContent =
    `${fmtDMY(dates[0])} → ${fmtDMY(dates[6])} · ${info.year}`;

  const avance = (state.weeks[info.key] && state.weeks[info.key].avance) || 0;
  document.getElementById('ndfAvance').value = avance || '';

  let totalForecast = 0, totalReal = 0, totalIT = 0, totalFS = 0, totalHF = 0, trCount = 0;
  const daysHtml = dates.map(d => {
    const ds = toDateStr(d);
    const day = state.days[ds];
    if (!day) {
      return `<div class="ndf-day"><div class="hd"><div class="dn">${fmtShort(d)}</div><div class="dd">—</div></div>
        <div class="ndf-empty-day">Aucune saisie RH ce jour.</div></div>`;
    }
    if (day.cases.TR) trCount++;
    totalForecast += dayForecastDeduction(day);
    totalReal += dayRealExpense(day);
    totalIT += dayITGain(day);
    totalFS += (day.forfaitSpecial.montant || 0);
    totalHF += (day.horsForfait.montant || 0);

    const activeCases = CASES_DEF.filter(c => day.cases[c.key]);
    const realInputs = activeCases.filter(c => ['TR', 'MIDI', 'SOIR', 'HOTEL_BS', 'HOTEL_HS'].includes(c.key)).map(c => `
      <div class="ndf-line">
        <label>${c.label}</label>
        <input type="number" step="0.01" placeholder="0.00" data-real="${ds}:${c.key}" value="${day.depensesReelles[c.key] || ''}">
      </div>`).join('');

    const hotelHFLine = day.cases.HOTEL_HF ? `
      <div class="ndf-line">
        <label>Hôtel HF</label>
        <input type="number" step="0.01" placeholder="0.00" data-hotelhf="${ds}" value="${day.hotelHF || ''}">
      </div>` : '';

    return `
      <div class="ndf-day">
        <div class="hd">
          <div class="dn">${fmtShort(d)}</div>
          <div class="dd">${escapeHtml(day.mission || '—')}${day.cases.TR ? ' · TR ✓' : ''}</div>
        </div>
        ${realInputs || '<div class="ndf-empty-day">Aucune rubrique avec dépense réelle à saisir.</div>'}
        ${hotelHFLine}
        <div class="ndf-line">
          <label>Hors forfait</label>
          <input type="number" step="0.01" placeholder="0.00" data-horsforfait="${ds}" value="${day.horsForfait.montant || ''}">
        </div>
        <div class="ndf-line">
          <label>Forfait spécial</label>
          <input type="number" step="0.01" placeholder="0.00" data-fs="${ds}" value="${day.forfaitSpecial.montant || ''}">
        </div>
        <div class="sub">
          <span>Prévu déduit : ${money(dayForecastDeduction(day))}</span>
          <span>Réel déduit : ${money(dayRealExpense(day))}</span>
        </div>
      </div>`;
  }).join('');

  document.getElementById('ndfDays').innerHTML = daysHtml;
  document.getElementById('ndfTRcount').textContent = trCount > 0 ? `TR: ${trCount}` : '';

  // Récapitulatif : nombre de jours de la semaine où chaque rubrique est cochée dans RH
  const counts = {};
  CASES_DEF.forEach(c => { counts[c.key] = 0; });
  dates.forEach(d => {
    const day = state.days[toDateStr(d)];
    if (!day) return;
    CASES_DEF.forEach(c => { if (day.cases[c.key]) counts[c.key]++; });
  });
  document.getElementById('ndfCounts').innerHTML = CASES_DEF.map(c => `
    <div class="count-item ${counts[c.key] > 0 ? 'active' : ''}">
      <span>${c.label}</span>
      <span class="n">${counts[c.key]}</span>
    </div>`).join('');

  const restant = avance - totalForecast;
  const gains = avance - totalReal + totalIT + totalFS;

  const tR = document.getElementById('tileRestant');
  const tG = document.getElementById('tileGains');
  tR.className = 'stat-tile ' + (restant >= 0 ? 'pos' : 'neg');
  tG.className = 'stat-tile ' + (gains >= 0 ? 'pos' : 'neg');
  document.getElementById('valRestant').textContent = money(restant);
  document.getElementById('valGains').textContent = money(gains);
  document.getElementById('valHorsForfaitTotal').textContent = money(totalHF);

  // attach input listeners
  document.querySelectorAll('[data-real]').forEach(inp => {
    inp.addEventListener('change', () => {
      const [ds, key] = inp.dataset.real.split(':');
      const day = state.days[ds];
      day.depensesReelles[key] = parseFloat(inp.value) || 0;
      saveState();
      renderNDF();
    });
  });
  document.querySelectorAll('[data-hotelhf]').forEach(inp => {
    inp.addEventListener('change', () => {
      const ds = inp.dataset.hotelhf;
      state.days[ds].hotelHF = parseFloat(inp.value) || 0;
      saveState();
      renderNDF();
    });
  });
  document.querySelectorAll('[data-horsforfait]').forEach(inp => {
    inp.addEventListener('change', () => {
      const ds = inp.dataset.horsforfait;
      state.days[ds].horsForfait.montant = parseFloat(inp.value) || 0;
      saveState();
      renderNDF();
    });
  });
  document.querySelectorAll('[data-fs]').forEach(inp => {
    inp.addEventListener('change', () => {
      const ds = inp.dataset.fs;
      state.days[ds].forfaitSpecial.montant = parseFloat(inp.value) || 0;
      saveState();
      renderNDF();
    });
  });

  renderBilans();
  renderJustifs();
}

function initNDFEvents() {
  document.getElementById('ndfPrev').addEventListener('click', () => {
    ndfMonday.setDate(ndfMonday.getDate() - 7);
    ndfMonday = new Date(ndfMonday);
    renderNDF();
  });
  document.getElementById('ndfNext').addEventListener('click', () => {
    ndfMonday.setDate(ndfMonday.getDate() + 7);
    ndfMonday = new Date(ndfMonday);
    renderNDF();
  });
  document.getElementById('ndfAvance').addEventListener('change', (e) => {
    const info = getISOWeekInfo(ndfMonday);
    if (!state.weeks[info.key]) state.weeks[info.key] = { avance: 0 };
    state.weeks[info.key].avance = parseFloat(e.target.value) || 0;
    saveState();
    renderNDF();
  });

  document.getElementById('moisPrev').addEventListener('click', () => {
    ndfMonthDate.setMonth(ndfMonthDate.getMonth() - 1);
    ndfMonthDate = new Date(ndfMonthDate);
    renderBilans();
  });
  document.getElementById('moisNext').addEventListener('click', () => {
    ndfMonthDate.setMonth(ndfMonthDate.getMonth() + 1);
    ndfMonthDate = new Date(ndfMonthDate);
    renderBilans();
  });
  document.getElementById('anPrev').addEventListener('click', () => {
    ndfYearValue -= 1;
    renderBilans();
  });
  document.getElementById('anNext').addEventListener('click', () => {
    ndfYearValue += 1;
    renderBilans();
  });
}

/* ---------------------------------------------------------------------- */
/* Onglet Paramètres                                                        */
/* ---------------------------------------------------------------------- */

function renderListEditor(containerId, arrayKey) {
  const wrap = document.getElementById(containerId);
  const items = state.settings[arrayKey];
  if (items.length === 0) {
    wrap.innerHTML = '<div class="empty">Aucun élément. Ajoutez-en un ci-dessous.</div>';
    return;
  }
  wrap.innerHTML = items.map((it, i) => `
    <div class="list-item">
      <span>${escapeHtml(it)}</span>
      ${arrayKey === 'categoriesHF' ? `<select class="cat-col" data-catcol="${i}" title="Colonne dans le fichier Excel">${Object.keys(CAT_COLS).map(c => `<option value="${c}" ${(state.settings.categoriesHFCol[it] || 'J') === c ? 'selected' : ''}>${CAT_COLS[c]}</option>`).join('')}</select>` : ''}
      <div class="d-actions">
        <button class="icon-btn" data-edit-item="${arrayKey}:${i}">✎</button>
        <button class="icon-btn del" data-del-item="${arrayKey}:${i}">🗑</button>
      </div>
    </div>`).join('');

  wrap.querySelectorAll('[data-catcol]').forEach(sel => sel.addEventListener('change', () => {
    const name = state.settings.categoriesHF[parseInt(sel.dataset.catcol, 10)];
    state.settings.categoriesHFCol[name] = sel.value;
    saveState();
    toast('Colonne Excel enregistrée ✓');
  }));
  wrap.querySelectorAll('[data-edit-item]').forEach(b => b.addEventListener('click', () => {
    const [key, idx] = b.dataset.editItem.split(':');
    const current = state.settings[key][idx];
    const val = prompt('Modifier :', current);
    if (val !== null && val.trim()) {
      const old = state.settings[key][idx];
      state.settings[key][idx] = val.trim();
      if (key === 'categoriesHF') {
        state.justifs.forEach(j => { if (j.categorie === old) j.categorie = val.trim(); });
        state.settings.categoriesHFCol[val.trim()] = state.settings.categoriesHFCol[old] || 'J';
        if (val.trim() !== old) delete state.settings.categoriesHFCol[old];
      }
      saveState();
      renderParam();
      if (key === 'categoriesHF') renderJustifs();
    }
  }));
  wrap.querySelectorAll('[data-del-item]').forEach(b => b.addEventListener('click', () => {
    const [key, idx] = b.dataset.delItem.split(':');
    if (confirm('Supprimer cet élément ?')) {
      const removed = state.settings[key].splice(idx, 1)[0];
      if (key === 'categoriesHF') delete state.settings.categoriesHFCol[removed];
      saveState();
      renderParam();
      if (key === 'categoriesHF') renderJustifs();
    }
  }));
}

function renderParam() {
  renderListEditor('listMissions', 'missions');
  renderListEditor('listEquipes', 'equipes');
  renderListEditor('listAffectations', 'affectations');
  renderListEditor('listZones', 'zones');
  renderListEditor('listVoitures', 'voitures');
  renderListEditor('listCategoriesHF', 'categoriesHF');

  const t = state.settings.tarifs;
  document.getElementById('tarifIT').value = t.IT;
  document.getElementById('tarifMIDI').value = t.MIDI;
  document.getElementById('tarifSOIR').value = t.SOIR;
  document.getElementById('tarifHOTEL_BS').value = t.HOTEL_BS;
  document.getElementById('tarifHOTEL_HS').value = t.HOTEL_HS;

  const hj = state.settings.heuresJour;
  document.getElementById('heuresJour').value =
    `${String(Math.floor(hj / 60)).padStart(2, '0')}:${String(hj % 60).padStart(2, '0')}`;
  document.getElementById('congesReduisentSolde').checked = !!state.settings.congesReduisentSolde;
}

function initParamEvents() {
  document.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.add;
      const inputId = { missions: 'newMission', equipes: 'newEquipe', affectations: 'newAffectation', zones: 'newZone', voitures: 'newVoiture', categoriesHF: 'newCategorieHF' }[key];
      const input = document.getElementById(inputId);
      const val = input.value.trim();
      if (!val) return;
      state.settings[key].push(val);
      if (key === 'categoriesHF' && !state.settings.categoriesHFCol[val]) state.settings.categoriesHFCol[val] = DEFAULT_CAT_COLS[val] || 'J';
      input.value = '';
      saveState();
      renderParam();
      renderRH();
      if (key === 'categoriesHF') renderJustifs();
    });
  });

  document.getElementById('btnSaveTarifs').addEventListener('click', () => {
    state.settings.tarifs = {
      IT: parseFloat(document.getElementById('tarifIT').value) || 0,
      MIDI: parseFloat(document.getElementById('tarifMIDI').value) || 0,
      SOIR: parseFloat(document.getElementById('tarifSOIR').value) || 0,
      HOTEL_BS: parseFloat(document.getElementById('tarifHOTEL_BS').value) || 0,
      HOTEL_HS: parseFloat(document.getElementById('tarifHOTEL_HS').value) || 0
    };
    saveState();
    toast('Montants enregistrés ✓');
    renderRH();
  });

  document.getElementById('btnSaveHeures').addEventListener('click', () => {
    const minutes = toMinutes(document.getElementById('heuresJour').value);
    if (!minutes || minutes <= 0) { toast('Indiquez une durée valide (ex. 07:48)'); return; }
    state.settings.heuresJour = sanitizeHeuresJour(minutes);
    state.settings.congesReduisentSolde = document.getElementById('congesReduisentSolde').checked;
    saveState();
    toast('Heures à effectuer enregistrées ✓');
    renderRH();
  });

  document.getElementById('btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `rhndf_export_${toDateStr(d)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btnImport').addEventListener('click', () => {
    document.getElementById('fileImport').click();
  });
  document.getElementById('fileImport').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!imported.settings || !imported.days) throw new Error('Format invalide');
        state = {
          settings: {
            missions: imported.settings.missions || [],
            equipes: imported.settings.equipes || [],
            affectations: imported.settings.affectations || [],
            zones: imported.settings.zones || [],
            voitures: imported.settings.voitures || [],
            categoriesHF: sanitizeCategories(imported.settings.categoriesHF),
            categoriesHFCol: sanitizeCatCols(imported.settings.categoriesHFCol, sanitizeCategories(imported.settings.categoriesHF)),
            tarifs: { ...DEFAULT_TARIFS, ...(imported.settings.tarifs || {}) },
            heuresJour: sanitizeHeuresJour(imported.settings.heuresJour),
            congesReduisentSolde: !!imported.settings.congesReduisentSolde
          },
          days: imported.days || {},
          weeks: imported.weeks || {},
          justifs: sanitizeJustifs(imported.justifs)
        };
        saveState();
        toast('Import réussi ✓');
        renderAll();
      } catch (err) {
        alert("Fichier invalide : impossible d'importer ces données.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    if (confirm('Cette action supprime définitivement toutes les données locales. Continuer ?')) {
      if (confirm('Confirmez-vous vraiment la réinitialisation complète ?')) {
        state = defaultState();
        saveState();
        fileDbClear();
        toast('Données réinitialisées');
        renderAll();
      }
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Lien vers l'appli Budget (Mes Sous)                                     */
/* ---------------------------------------------------------------------- */

// Dépense d'un jour = dépenses réelles (repas/hôtel réels + hôtel HF, TR inclus) + hors forfait.
// Chaque jour avec une dépense > 0 devient sa propre transaction, datée sur ce jour précis :
// ainsi une dépense saisie n'importe quel jour tombe toujours dans le bon mois côté Budget.
// Dépense d'un jour = dépenses réelles (repas/hôtel réels + hôtel HF, TR inclus) + hors forfait
// + forfait spécial : ce sont les trois montants que l'entreprise vous doit au-delà de l'avance.
// Chaque jour avec un montant > 0 devient sa propre transaction, datée sur ce jour précis :
// ainsi une dépense saisie n'importe quel jour tombe toujours dans le bon mois côté Budget.
function computeDaySync(dateStr) {
  const day = state.days[dateStr];
  if (!day) return null;
  const amount = Math.round((dayRealExpense(day) + (day.horsForfait.montant || 0) + (day.forfaitSpecial.montant || 0)) * 100) / 100;
  if (amount <= 0) return null;
  const info = getISOWeekInfo(parseDateStr(dateStr));
  const label = `${fmtDMY(parseDateStr(dateStr))} · S.${info.week} · ${day.mission || 'Frais'}`;
  return {
    id: `ndf-${dateStr}-exp`,
    type: 'expense',
    date: dateStr,
    categoryId: 'directique',
    label,
    amount,
    createdAt: new Date().toISOString(),
    syncKey: `ndf:${dateStr}:expense`
  };
}

// Recette = l'avance reçue pour une semaine donnée (saisie par semaine, pas par jour).
// Datée sur le jeudi de la semaine (jour central ISO), pour tomber dans le mois où se
// trouve la majorité des jours de cette semaine.
function computeWeekIncomeSync(weekKey) {
  const m = weekKey.match(/^(\d+)-W(\d+)$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const avance = Math.round(((state.weeks[weekKey] && state.weeks[weekKey].avance) || 0) * 100) / 100;
  if (avance <= 0) return null;
  const mondayUTC = isoWeekToMonday(year, week);
  const mondayLocal = new Date(mondayUTC.getUTCFullYear(), mondayUTC.getUTCMonth(), mondayUTC.getUTCDate());
  const dates = weekDates(mondayLocal);
  const repDate = dates[3];
  const label = `S. ${week} (${fmtDMY(dates[0])} - ${fmtDMY(dates[6])}) · ${year}`;
  return {
    id: `ndf-${weekKey}-inc`,
    type: 'income',
    date: toDateStr(repDate),
    categoryId: 'avance-dtq',
    label,
    amount: avance,
    createdAt: new Date().toISOString(),
    syncKey: `ndf:${weekKey}:income`
  };
}

function buildBudgetSyncPayload(transactions) {
  return {
    app: "mes-sous",
    version: 2,
    exportedAt: new Date().toISOString(),
    expenseCategories: [{ id: "directique", name: "DIRECTIQUE", emoji: "💼", color: "#FFD1A9", default: false }],
    incomeCategories: [{ id: "avance-dtq", name: "Avance DTQ", emoji: "💼", color: "#C9B6E8", default: false }],
    labels: [],
    recurring: [],
    transactions,
  };
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function initBudgetSyncEvents() {
  document.getElementById("btnSyncWeek").addEventListener("click", () => {
    const info = getISOWeekInfo(ndfMonday);
    const dayTxns = weekDates(ndfMonday).map(d => computeDaySync(toDateStr(d))).filter(Boolean);
    const incomeTxn = computeWeekIncomeSync(info.key);
    const txns = incomeTxn ? [...dayTxns, incomeTxn] : dayTxns;
    if (txns.length === 0) { toast("Rien à envoyer pour cette semaine"); return; }
    downloadJSON(buildBudgetSyncPayload(txns), `budget-sync-S${info.week}-${info.year}.json`);
    toast("Fichier exporté — à importer dans Budget");
  });

  document.getElementById("btnSyncAll").addEventListener("click", () => {
    const dayTxns = Object.keys(state.days).map(computeDaySync).filter(Boolean);
    const incomeTxns = Object.keys(state.weeks).map(computeWeekIncomeSync).filter(Boolean);
    const txns = [...dayTxns, ...incomeTxns];
    if (txns.length === 0) { toast("Aucune donnée à exporter"); return; }
    downloadJSON(buildBudgetSyncPayload(txns), `budget-sync-complet-${toDateStr(new Date())}.json`);
    toast(`${txns.length} opération(s) exportée(s)`);
  });
}


/* ---------------------------------------------------------------------- */
/* Justificatifs hors forfait (fichiers dans IndexedDB)                    */
/* ---------------------------------------------------------------------- */

const FILE_DB_NAME = 'rhndf_files_v1';
let fileDbPromise = null;
let justifFilter = 'semaine';   // 'semaine' | 'tout'
const justifUrls = {};          // id -> objectURL (miniatures)

function fileDb() {
  if (!fileDbPromise) {
    fileDbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB indisponible')); return; }
      const req = indexedDB.open(FILE_DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return fileDbPromise;
}
function fileDbOp(mode, fn) {
  return fileDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode);
    const req = fn(tx.objectStore('files'));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}
const fileDbPut = (id, blob) => fileDbOp('readwrite', s => s.put(blob, id));
const fileDbGet = (id) => fileDbOp('readonly', s => s.get(id));
const fileDbDel = (id) => fileDbOp('readwrite', s => s.delete(id));
function fileDbClear() {
  Object.keys(justifUrls).forEach(k => { URL.revokeObjectURL(justifUrls[k]); delete justifUrls[k]; });
  fileDbOp('readwrite', s => s.clear()).catch(() => {});
}

// Réduit les photos (côté max 1600 px, JPEG) pour économiser la place ; PDF et autres : inchangés.
function shrinkImage(file) {
  return new Promise(resolve => {
    if (!/^image\/(jpeg|png|webp|heic|heif)/i.test(file.type)) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1600;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b || file), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function newJustifId() {
  return 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function importJustifFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const dates = weekDates(ndfMonday).map(toDateStr);
  const today = toDateStr(new Date());
  const defDate = dates.includes(today) ? today : dates[0];
  const defCat = state.settings.categoriesHF[state.settings.categoriesHF.length - 1] || '';
  let ok = 0;
  for (const f of files) {
    try {
      const blob = await shrinkImage(f);
      const id = newJustifId();
      await fileDbPut(id, blob);
      const isShrunk = blob !== f;
      state.justifs.push({
        id, date: defDate, montant: 0, categorie: defCat, libelle: '',
        fileName: isShrunk ? f.name.replace(/\.[^.]+$/, '') + '.jpg' : f.name,
        fileType: blob.type || f.type || ''
      });
      ok++;
    } catch (e) {
      console.error(e);
    }
  }
  saveState();
  renderJustifs();
  toast(ok === files.length ? `${ok} fichier(s) ajouté(s) ✓` : `${ok}/${files.length} fichier(s) ajouté(s)`);
}

async function openJustif(id) {
  const j = state.justifs.find(x => x.id === id);
  if (!j) return;
  try {
    const blob = await fileDbGet(id);
    if (!blob) { toast('Fichier introuvable sur cet appareil'); return; }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { toast('Impossible d\'ouvrir le fichier'); }
}

function renderJustifs() {
  const wrap = document.getElementById('justifList');
  if (!wrap) return;
  const cats = state.settings.categoriesHF;
  const weekSet = new Set(weekDates(ndfMonday).map(toDateStr));
  document.querySelectorAll('[data-justif-filter]').forEach(b =>
    b.classList.toggle('active', b.dataset.justifFilter === justifFilter));

  const list = state.justifs
    .filter(j => justifFilter === 'tout' || weekSet.has(j.date))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Totaux par catégorie
  const tot = {};
  let grand = 0;
  list.forEach(j => { tot[j.categorie || '—'] = (tot[j.categorie || '—'] || 0) + j.montant; grand += j.montant; });
  const totHtml = Object.keys(tot).length
    ? Object.keys(tot).map(c => `<div class="jt-row"><span>${escapeHtml(c)}</span><span class="mono">${fmtEur(tot[c])}</span></div>`).join('') +
      `<div class="jt-row jt-total"><span>Total</span><span class="mono">${fmtEur(grand)}</span></div>`
    : '';
  document.getElementById('justifTotals').innerHTML = totHtml;

  if (!list.length) {
    wrap.innerHTML = '<div class="empty">Aucun justificatif' + (justifFilter === 'semaine' ? ' cette semaine.' : '.') + '</div>';
    return;
  }
  wrap.innerHTML = list.map(j => {
    const opts = (cats.includes(j.categorie) || !j.categorie ? cats : cats.concat([j.categorie]))
      .map(c => `<option value="${escapeHtml(c)}" ${c === j.categorie ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
    const isImg = /^image\//.test(j.fileType);
    return `<div class="justif" data-id="${j.id}">
      <div class="justif-top">
        <button class="justif-thumb" data-open="${j.id}" title="Ouvrir">${isImg ? `<img alt="" data-thumb="${j.id}">` : '<span>📄</span>'}</button>
        <div class="justif-name">${escapeHtml(j.fileName)}</div>
        <button class="icon-btn del" data-del-justif="${j.id}">🗑</button>
      </div>
      <div class="justif-grid">
        <label>Catégorie<select data-jf="categorie">${opts}</select></label>
        <label>Date<input type="date" data-jf="date" value="${escapeHtml(j.date)}"></label>
        <label>Montant (€)<input type="number" step="0.01" inputmode="decimal" data-jf="montant" value="${j.montant || ''}" placeholder="0.00"></label>
        <label>Libellé<input type="text" data-jf="libelle" value="${escapeHtml(j.libelle)}" placeholder="Facultatif"></label>
      </div>
    </div>`;
  }).join('');

  // Miniatures
  wrap.querySelectorAll('img[data-thumb]').forEach(async img => {
    const id = img.dataset.thumb;
    try {
      if (!justifUrls[id]) {
        const blob = await fileDbGet(id);
        if (!blob) return;
        justifUrls[id] = URL.createObjectURL(blob);
      }
      img.src = justifUrls[id];
    } catch (e) {}
  });
}

function fmtEur(n) {
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' €';
}

function initJustifEvents() {
  const input = document.getElementById('justifFiles');
  document.getElementById('btnJustifAdd').addEventListener('click', () => input.click());
  input.addEventListener('change', e => { importJustifFiles(e.target.files); e.target.value = ''; });

  document.querySelectorAll('[data-justif-filter]').forEach(b => b.addEventListener('click', () => {
    justifFilter = b.dataset.justifFilter;
    renderJustifs();
  }));

  const wrap = document.getElementById('justifList');
  wrap.addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    if (o) { openJustif(o.dataset.open); return; }
    const d = e.target.closest('[data-del-justif]');
    if (d && confirm('Supprimer ce justificatif ?')) {
      const id = d.dataset.delJustif;
      state.justifs = state.justifs.filter(j => j.id !== id);
      if (justifUrls[id]) { URL.revokeObjectURL(justifUrls[id]); delete justifUrls[id]; }
      fileDbDel(id).catch(() => {});
      saveState();
      renderJustifs();
    }
  });
  wrap.addEventListener('change', e => {
    const f = e.target.dataset.jf;
    if (!f) return;
    const id = e.target.closest('.justif').dataset.id;
    const j = state.justifs.find(x => x.id === id);
    if (!j) return;
    j[f] = f === 'montant' ? (parseFloat(e.target.value) || 0) : e.target.value;
    saveState();
    renderJustifs();
  });
}

/* ---------------------------------------------------------------------- */
/* Export Excel de la note de frais (modèle « ANNEXE AU RELEVÉ HEBDO »)    */
/* ---------------------------------------------------------------------- */

const NDF_TEMPLATE_B64 = "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";
const NDF_BLOCK_ROWS = [7, 12, 17, 22, 27, 32];   // lundi → samedi (5 lignes fusionnées par jour)

function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function xlSerial(d) {
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}
function r2(n) { return Math.round(n * 100) / 100; }

function xlCellRe(ref) {
  return new RegExp('<c r="' + ref + '"( s="\\d+")?[^>]*?(?:/>|>[\\s\\S]*?</c>)');
}
function xlSet(xml, ref, inner, type) {
  const re = xlCellRe(ref);
  if (!re.test(xml)) throw new Error('Cellule ' + ref + ' introuvable dans le modèle');
  return xml.replace(re, (m, s) => `<c r="${ref}"${s || ''}${type ? ' t="' + type + '"' : ''}>${inner}</c>`);
}
const xlNum = (xml, ref, n) => xlSet(xml, ref, `<v>${n}</v>`);
const xlFormula = (xml, ref, f, cached) => xlSet(xml, ref, `<f>${xmlEsc(f)}</f><v>${cached}</v>`);
const xlStr = (xml, ref, text) => xlSet(xml, ref, `<is><t xml:space="preserve">${xmlEsc(text)}</t></is>`, 'inlineStr');
function xlCached(xml, ref, val) {
  const re = xlCellRe(ref);
  return xml.replace(re, m => /<v>[\s\S]*?<\/v>/.test(m) ? m.replace(/<v>[\s\S]*?<\/v>/, `<v>${val}</v>`) : m.replace('</c>', `<v>${val}</v></c>`));
}

function colForCat(cat) {
  return state.settings.categoriesHFCol[cat] || DEFAULT_CAT_COLS[cat] || 'J';
}

// Construit le XML d'une feuille semaine à partir du modèle
function buildWeekSheet(tplXml, monday, warnings) {
  const info = getISOWeekInfo(monday);
  const dates = weekDates(monday);
  const dateStrs = dates.map(toDateStr);
  const items = state.justifs.filter(j => dateStrs.includes(j.date));
  let xml = tplXml;

  xml = xlNum(xml, 'F3', info.week);
  const monSerial = xlSerial(dates[0]), sunSerial = xlSerial(dates[6]);
  if (info.year === 2026) {
    xml = xlCached(xml, 'G3', monSerial);
    xml = xlCached(xml, 'I3', sunSerial);
  } else {
    xml = xlNum(xml, 'G3', monSerial);
    xml = xlNum(xml, 'I3', sunSerial);
    warnings.push(`Semaine ${info.week}/${info.year} : le modèle ne contient que les dates 2026, les dates de cette feuille sont figées.`);
  }

  const totals = {};
  Object.keys(CAT_COLS).forEach(c => totals[c] = 0);
  let placed = 0;

  for (let i = 0; i < 6; i++) {
    const row = NDF_BLOCK_ROWS[i];
    xml = xlCached(xml, 'A' + row, monSerial + i);
    const ds = dateStrs[i];
    const dayItems = items.filter(j => j.date === ds);
    if (!dayItems.length) continue;
    const mission = state.days[ds] ? (state.days[ds].mission || '') : '';
    if (mission) xml = xlStr(xml, 'B' + row, mission);
    else if (dayItems.some(j => j.montant > 0)) warnings.push(`${fmtDMY(dates[i])} : aucune mission saisie dans l'onglet RH (code opération vide).`);
    const byCol = {};
    dayItems.forEach(j => {
      if (!(j.montant > 0)) { warnings.push(`${fmtDMY(dates[i])} : « ${j.fileName} » sans montant (non reporté).`); return; }
      const col = colForCat(j.categorie);
      (byCol[col] = byCol[col] || []).push(r2(j.montant));
    });
    Object.keys(byCol).forEach(col => {
      const list = byCol[col];
      const sum = r2(list.reduce((a, b) => a + b, 0));
      totals[col] = r2(totals[col] + sum);
      xml = list.length === 1 ? xlNum(xml, col + row, list[0]) : xlFormula(xml, col + row, list.join('+'), sum);
    });
    placed += dayItems.length;
  }
  xml = xlCached(xml, 'A12', monSerial + 1);
  xml = xlCached(xml, 'A50', sunSerial);

  const sunItems = items.filter(j => j.date === dateStrs[6]);
  if (sunItems.length) warnings.push(`${fmtDMY(dates[6])} (dimanche) : ${sunItems.length} justificatif(s) non reporté(s), le modèle s'arrête au samedi.`);

  let grand = 0;
  Object.keys(CAT_COLS).forEach(c => { xml = xlCached(xml, c + '42', totals[c]); grand += totals[c]; });
  xml = xlCached(xml, 'J48', r2(grand));
  xml = xlStr(xml, 'A47', 'Nombre de Justificatifs : ' + String(placed).padStart(2, '0'));

  // cohérence avec les montants hors forfait saisis dans NDF
  const saisi = dateStrs.reduce((a, ds) => {
    const d = state.days[ds];
    return a + (d ? (parseFloat(d.horsForfait && d.horsForfait.montant) || 0) + (parseFloat(d.hotelHF) || 0) : 0);
  }, 0);
  if (Math.abs(saisi - grand) > 0.009 && (saisi > 0 || grand > 0)) {
    warnings.push(`S${info.week} : hors forfait saisi dans NDF = ${fmtEur(saisi)}, justificatifs = ${fmtEur(grand)}.`);
  }
  return { xml, name: `${info.year} S${String(info.week).padStart(2, '0')}`, grand };
}

const CLASSEUR_KEY = '__classeur__';
const CLASSEUR_META_KEY = '__classeur_meta__';
const WEEK_NAME_RE = /^\d{4} S\d{2}$/;

function xmlUnesc(s) {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function xlAttr(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"'));
  return m ? m[1] : null;
}
function resolveXlPath(base, target) {   // base : dossier du fichier source (ex. 'xl/worksheets')
  if (target.startsWith('/')) return target.slice(1);
  const parts = (base + '/' + target).split('/');
  const out = [];
  parts.forEach(p => { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
  return out.join('/');
}

function selectWeeksForScope(scope) {
  const mondays = new Map();
  const addWeek = d => { const m = getMonday(d); mondays.set(toDateStr(m), m); };
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  let fileLabel;
  if (scope === 'semaine') {
    addWeek(ndfMonday);
    const i = getISOWeekInfo(ndfMonday);
    fileLabel = `S${String(i.week).padStart(2, '0')}_${i.year}`;
  } else {
    const y = scope === 'mois' ? ndfMonthDate.getFullYear() : ndfYearValue;
    const mo = scope === 'mois' ? ndfMonthDate.getMonth() : null;
    state.justifs.forEach(j => {
      if (!j.date) return;
      const d = parse(j.date);
      if (d.getFullYear() === y && (mo === null || d.getMonth() === mo)) addWeek(d);
    });
    fileLabel = scope === 'mois' ? `${y}-${String(mo + 1).padStart(2, '0')}` : String(y);
  }
  return { weeks: Array.from(mondays.values()).sort((a, b) => a - b), fileLabel };
}

// Classeur neuf, construit à partir du modèle intégré
async function buildNewWorkbook(weeks, warnings) {
  const tpl = await JSZip.loadAsync(NDF_TEMPLATE_B64, { base64: true });
  const weekTpl = await tpl.file('xl/worksheets/week.xml').async('string');
  const files = {};
  for (const f of ['xl/styles.xml', 'xl/sharedStrings.xml', 'xl/theme/theme1.xml', 'xl/worksheets/sheet1.xml', 'xl/drawings/drawing1.xml', 'xl/drawings/_rels/drawing1.xml.rels']) {
    files[f] = await tpl.file(f).async('string');
  }
  const image = await tpl.file('xl/media/image1.jpeg').async('uint8array');
  const out = new JSZip();
  const sheets = [{ name: 'DATE 2026', path: 'worksheets/sheet1.xml' }];
  let total = 0;
  weeks.forEach((mon, i) => {
    const w = buildWeekSheet(weekTpl, mon, warnings);
    total += w.grand;
    const n = i + 2;
    out.file(`xl/worksheets/sheet${n}.xml`, w.xml);
    out.file(`xl/worksheets/_rels/sheet${n}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${i + 1}.xml"/></Relationships>`);
    out.file(`xl/drawings/drawing${i + 1}.xml`, files['xl/drawings/drawing1.xml']);
    out.file(`xl/drawings/_rels/drawing${i + 1}.xml.rels`, files['xl/drawings/_rels/drawing1.xml.rels']);
    sheets.push({ name: w.name, path: `worksheets/sheet${n}.xml` });
  });
  out.file('xl/worksheets/sheet1.xml', files['xl/worksheets/sheet1.xml']);
  out.file('xl/styles.xml', files['xl/styles.xml']);
  out.file('xl/sharedStrings.xml', files['xl/sharedStrings.xml']);
  out.file('xl/theme/theme1.xml', files['xl/theme/theme1.xml']);
  out.file('xl/media/image1.jpeg', image);

  const N = sheets.length;
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  out.file('xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><bookViews><workbookView activeTab="1"/></bookViews><sheets>` +
    sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    `</sheets><calcPr calcId="191028" fullCalcOnLoad="1"/></workbook>`);
  out.file('xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="${s.path}"/>`).join('') +
    `<Relationship Id="rId${N + 1}" Type="${REL}/theme" Target="theme/theme1.xml"/><Relationship Id="rId${N + 2}" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId${N + 3}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
  out.file('_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  out.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets.map(s => `<Override PartName="/xl/${s.path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    weeks.map((w, i) => `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('') +
    `<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`);
  return { zip: out, total, added: sheets.slice(1).map(s => s.name) };
}

// Prépare une feuille semaine du classeur existant pour servir de modèle (cellules de saisie vidées)
function cleanWeekTemplate(xml) {
  xml = xml.replace(/<c r="([B-P])(\d+)"( s="\d+")?[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g,
    (m, col, row, s) => (+row >= 7 && +row <= 41) ? `<c r="${col}${row}"${s || ''}/>` : m);
  xml = xml.replace(/ tabSelected="1"/, '').replace(/ topLeftCell="[^"]*"/, '');
  xml = xml.replace(/(<pageSetup[^>]*?) r:id="[^"]*"/, '$1');
  xml = xml.replace(/<drawing r:id="[^"]*"\/>/, '<drawing r:id="rId1"/>');
  return xml;
}

// Ajoute (ou remplace) les onglets semaine dans le classeur existant de l'utilisateur
async function mergeIntoWorkbook(baseBlob, weeks, warnings, askReplace) {
  const zip = await JSZip.loadAsync(baseBlob);
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  let wb = await zip.file('xl/workbook.xml').async('string');
  let rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  let ct = await zip.file('[Content_Types].xml').async('string');

  const relMap = {};
  (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(t => { relMap[xlAttr(t, 'Id')] = xlAttr(t, 'Target'); });
  const sheetTags = wb.match(/<sheet\b[^>]*\/>/g) || [];
  const sheets = sheetTags.map(t => ({
    tag: t, name: xmlUnesc(xlAttr(t, 'name')), id: parseInt(xlAttr(t, 'sheetId'), 10),
    rid: xlAttr(t, 'r:id'), path: resolveXlPath('xl', relMap[xlAttr(t, 'r:id')])
  }));

  // feuille modèle = dernière feuille semaine du classeur
  const tplSheet = sheets.filter(s => WEEK_NAME_RE.test(s.name)).pop();
  if (!tplSheet) throw new Error("Le classeur mémorisé ne contient aucun onglet semaine (ex. « 2026 S44 »)");
  const tplRelsPath = tplSheet.path.replace(/([^/]+)$/, '_rels/$1.rels');
  const tplRels = zip.file(tplRelsPath) ? await zip.file(tplRelsPath).async('string') : '';
  const drTag = (tplRels.match(/<Relationship\b[^>]*drawing"[^>]*>/) || [])[0];
  if (!drTag) throw new Error("L'onglet modèle du classeur ne contient pas la signature (dessin)");
  const drPath = resolveXlPath(tplSheet.path.replace(/\/[^/]+$/, ''), xlAttr(drTag, 'Target'));
  const drXml = await zip.file(drPath).async('string');
  const drRelsPath = drPath.replace(/([^/]+)$/, '_rels/$1.rels');
  const drRels = await zip.file(drRelsPath).async('string');
  const weekTpl = cleanWeekTemplate(await zip.file(tplSheet.path).async('string'));

  // onglets déjà présents
  const newNames = weeks.map(m => { const i = getISOWeekInfo(m); return `${i.year} S${String(i.week).padStart(2, '0')}`; });
  const existing = newNames.filter(n => sheets.some(s => s.name === n));
  let replaceSet = new Set();
  if (existing.length && askReplace(existing)) replaceSet = new Set(existing);

  const nums = (re) => Object.keys(zip.files).map(f => (f.match(re) || [])[1]).filter(Boolean).map(Number);
  let nextSheet = Math.max(0, ...nums(/^xl\/worksheets\/sheet(\d+)\.xml$/));
  let nextDrawing = Math.max(0, ...nums(/^xl\/drawings\/drawing(\d+)\.xml$/));
  let nextSheetId = Math.max(0, ...sheets.map(s => s.id));
  let nextRid = Math.max(0, ...Object.keys(relMap).map(r => parseInt(r.replace(/\D/g, ''), 10) || 0));
  const added = [];
  let total = 0;

  for (let k = 0; k < weeks.length; k++) {
    const name = newNames[k];
    const exists = sheets.find(s => s.name === name);
    if (exists && !replaceSet.has(name)) { warnings.push(`Onglet « ${name} » déjà présent : conservé tel quel.`); continue; }
    const w = buildWeekSheet(weekTpl, weeks[k], warnings);
    total += w.grand;
    let shPath, drTarget;
    if (exists) {
      shPath = exists.path;
      const oldRelsPath = shPath.replace(/([^/]+)$/, '_rels/$1.rels');
      const oldRels = zip.file(oldRelsPath) ? await zip.file(oldRelsPath).async('string') : '';
      const od = (oldRels.match(/<Relationship\b[^>]*drawing"[^>]*>/) || [])[0];
      drTarget = od ? xlAttr(od, 'Target') : null;
    } else {
      nextSheet++;
      shPath = `xl/worksheets/sheet${nextSheet}.xml`;
    }
    if (!drTarget) {
      nextDrawing++;
      zip.file(`xl/drawings/drawing${nextDrawing}.xml`, drXml);
      zip.file(`xl/drawings/_rels/drawing${nextDrawing}.xml.rels`, drRels);
      ct = ct.replace('</Types>', `<Override PartName="/xl/drawings/drawing${nextDrawing}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
      drTarget = `../drawings/drawing${nextDrawing}.xml`;
    }
    zip.file(shPath, w.xml);
    zip.file(shPath.replace(/([^/]+)$/, '_rels/$1.rels'),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/drawing" Target="${drTarget}"/></Relationships>`);
    if (!exists) {
      nextRid++; nextSheetId++;
      const rid = 'rId' + nextRid;
      rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${REL}/worksheet" Target="${shPath.replace(/^xl\//, '')}"/></Relationships>`);
      ct = ct.replace('</Types>', `<Override PartName="/${shPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
      const tag = `<sheet name="${xmlEsc(name)}" sheetId="${nextSheetId}" r:id="${rid}"/>`;
      // insertion à sa place chronologique parmi les onglets semaine
      const after = sheets.find(s => WEEK_NAME_RE.test(s.name) && s.name > name);
      if (after) wb = wb.replace(after.tag, tag + after.tag);
      else {
        const lastWeek = sheets.filter(s => WEEK_NAME_RE.test(s.name)).pop();
        wb = wb.replace(lastWeek.tag, lastWeek.tag + tag);
      }
      sheets.push({ tag, name, id: nextSheetId, rid, path: shPath });
    }
    added.push(name);
  }

  // recalcul à l'ouverture, suppression de la chaîne de calcul devenue obsolète
  if (/<calcPr\b[^>]*\/>/.test(wb)) {
    wb = wb.replace(/<calcPr\b([^>]*?)\/>/, (m, a) => /fullCalcOnLoad/.test(a) ? m : `<calcPr${a} fullCalcOnLoad="1"/>`);
  } else {
    wb = wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  }
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    rels = rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, '');
    ct = ct.replace(/<Override\b[^>]*calcChain[^>]*\/>/, '');
  }
  zip.file('xl/workbook.xml', wb);
  zip.file('xl/_rels/workbook.xml.rels', rels);
  zip.file('[Content_Types].xml', ct);
  return { zip, total, added };
}

async function workbookSheetNames(blob) {
  const zip = await JSZip.loadAsync(blob);
  const wb = await zip.file('xl/workbook.xml').async('string');
  return (wb.match(/<sheet\b[^>]*\/>/g) || []).map(t => xmlUnesc(xlAttr(t, 'name')));
}

async function renderClasseurInfo() {
  const el = document.getElementById('ndfClasseurInfo');
  if (!el) return;
  try {
    const meta = await fileDbGet(CLASSEUR_META_KEY);
    if (!meta) { el.textContent = 'Aucun classeur mémorisé : le prochain export créera un nouveau fichier.'; return; }
    const weeks = meta.sheets.filter(n => WEEK_NAME_RE.test(n));
    el.textContent = `Classeur mémorisé : ${meta.name} · ${weeks.length} onglet(s) semaine` + (weeks.length ? ` (dernier : ${weeks[weeks.length - 1]})` : '');
  } catch (e) { el.textContent = ''; }
}

async function importClasseur(file) {
  if (!file) return;
  try {
    const names = await workbookSheetNames(file);
    if (!names.some(n => WEEK_NAME_RE.test(n))) { alert("Ce classeur ne contient aucun onglet semaine (ex. « 2026 S44 »)."); return; }
    await fileDbPut(CLASSEUR_KEY, file);
    await fileDbPut(CLASSEUR_META_KEY, { name: file.name, sheets: names });
    toast('Classeur mémorisé ✓');
    renderClasseurInfo();
  } catch (e) { alert("Fichier Excel illisible : " + e.message); }
}

async function exportNDFExcel(scope) {
  if (typeof JSZip === 'undefined') { alert('Bibliothèque Excel non chargée (connexion requise la première fois).'); return; }
  const { weeks, fileLabel } = selectWeeksForScope(scope);
  if (!weeks.length) { toast('Aucun justificatif sur cette période'); return; }

  const warnings = [];
  const baseBlob = await fileDbGet(CLASSEUR_KEY).catch(() => null);
  const meta = await fileDbGet(CLASSEUR_META_KEY).catch(() => null);
  let res;
  if (baseBlob) {
    res = await mergeIntoWorkbook(baseBlob, weeks, warnings,
      names => confirm(`Ces onglets existent déjà dans votre classeur :\n${names.join(', ')}\n\nOK = les remplacer par les données de l'application\nAnnuler = les conserver tels quels`));
  } else {
    res = await buildNewWorkbook(weeks, warnings);
  }
  const blob = await res.zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = (baseBlob && meta && meta.name) ? meta.name : `NDF_${fileLabel}.xlsx`;

  // le classeur à jour devient la base des prochains exports
  try {
    await fileDbPut(CLASSEUR_KEY, blob);
    await fileDbPut(CLASSEUR_META_KEY, { name: fileName, sheets: await workbookSheetNames(blob) });
  } catch (e) { console.error(e); }
  renderClasseurInfo();

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast(res.added.length ? `Onglet(s) ajouté(s) : ${res.added.join(', ')} ✓` : 'Aucun onglet modifié');
  if (warnings.length) setTimeout(() => alert('À vérifier :\n\n• ' + warnings.join('\n• ')), 400);
}

function initNdfExportEvents() {
  document.getElementById('btnNdfExcel').addEventListener('click', () => {
    exportNDFExcel(document.getElementById('ndfExcelScope').value).catch(e => {
      console.error(e);
      alert("Export impossible : " + e.message);
    });
  });
  const inp = document.getElementById('ndfClasseurFile');
  document.getElementById('btnNdfClasseur').addEventListener('click', () => inp.click());
  inp.addEventListener('change', e => { importClasseur(e.target.files[0]); e.target.value = ''; });
  document.getElementById('btnNdfClasseurDel').addEventListener('click', async () => {
    if (!confirm('Oublier le classeur mémorisé ? Le prochain export créera un nouveau fichier.')) return;
    await fileDbDel(CLASSEUR_KEY).catch(() => {});
    await fileDbDel(CLASSEUR_META_KEY).catch(() => {});
    renderClasseurInfo();
  });
  renderClasseurInfo();
}

/* ---------------------------------------------------------------------- */
/* Init                                                                     */
/* ---------------------------------------------------------------------- */

function renderAll() {
  renderRH();
  renderNDF();
  renderParam();
}

function init() {
  document.body.classList.add('theme-rh');
  initTabs();
  initRHEvents();
  initNDFEvents();
  initParamEvents();
  initJustifEvents();
  initNdfExportEvents();
  initBudgetSyncEvents();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);

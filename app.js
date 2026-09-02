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

/* ---------------------------------------------------------------------- */
/* State                                                                   */
/* ---------------------------------------------------------------------- */

function defaultState() {
  return {
    settings: {
      missions: [],
      equipes: [],
      affectations: [],
      zones: [],
      voitures: [],
      tarifs: { ...DEFAULT_TARIFS }
    },
    days: {},   // 'YYYY-MM-DD' -> day object
    weeks: {}   // 'YYYY-Www'   -> { avance: number }
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
        tarifs: { ...base.settings.tarifs, ...(parsed.settings?.tarifs || {}) }
      },
      days: parsed.days || {},
      weeks: parsed.weeks || {}
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
let rhMonthDate = new Date();

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
    const commentHtml = day.commentaire ? `<br><span class="d-comment">💬 ${escapeHtml(day.commentaire)}</span>` : '';
    return `
      <div class="day-item">
        <div class="d-date mono">${fmtDMY(parseDateStr(d))}</div>
        <div class="d-info">
          S.${info.week} · ${escapeHtml(day.mission || '—')}${day.affectation ? ' · ' + escapeHtml(day.affectation) : ''}
          ${cases ? '<br>' + escapeHtml(cases) : ''}
          ${horStr ? `<br><span class="mono d-hours">${horStr}${total > 0 ? '  ·  ' + fmtHoursHM(total) : ''}</span>` : '<br><span class="d-hours">Aucune heure pointée</span>'}
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
let ndfMonthDate = new Date();
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
      <div class="d-actions">
        <button class="icon-btn" data-edit-item="${arrayKey}:${i}">✎</button>
        <button class="icon-btn del" data-del-item="${arrayKey}:${i}">🗑</button>
      </div>
    </div>`).join('');

  wrap.querySelectorAll('[data-edit-item]').forEach(b => b.addEventListener('click', () => {
    const [key, idx] = b.dataset.editItem.split(':');
    const current = state.settings[key][idx];
    const val = prompt('Modifier :', current);
    if (val !== null && val.trim()) {
      state.settings[key][idx] = val.trim();
      saveState();
      renderParam();
    }
  }));
  wrap.querySelectorAll('[data-del-item]').forEach(b => b.addEventListener('click', () => {
    const [key, idx] = b.dataset.delItem.split(':');
    if (confirm('Supprimer cet élément ?')) {
      state.settings[key].splice(idx, 1);
      saveState();
      renderParam();
    }
  }));
}

function renderParam() {
  renderListEditor('listMissions', 'missions');
  renderListEditor('listEquipes', 'equipes');
  renderListEditor('listAffectations', 'affectations');
  renderListEditor('listZones', 'zones');
  renderListEditor('listVoitures', 'voitures');

  const t = state.settings.tarifs;
  document.getElementById('tarifIT').value = t.IT;
  document.getElementById('tarifMIDI').value = t.MIDI;
  document.getElementById('tarifSOIR').value = t.SOIR;
  document.getElementById('tarifHOTEL_BS').value = t.HOTEL_BS;
  document.getElementById('tarifHOTEL_HS').value = t.HOTEL_HS;
}

function initParamEvents() {
  document.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.add;
      const inputId = { missions: 'newMission', equipes: 'newEquipe', affectations: 'newAffectation', zones: 'newZone', voitures: 'newVoiture' }[key];
      const input = document.getElementById(inputId);
      const val = input.value.trim();
      if (!val) return;
      state.settings[key].push(val);
      input.value = '';
      saveState();
      renderParam();
      renderRH();
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
            tarifs: { ...DEFAULT_TARIFS, ...(imported.settings.tarifs || {}) }
          },
          days: imported.days || {},
          weeks: imported.weeks || {}
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
        toast('Données réinitialisées');
        renderAll();
      }
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Lien vers l'appli Budget (Mes Sous)                                     */
/* ---------------------------------------------------------------------- */

function computeAllWeekKeys() {
  const weekKeys = new Set();
  Object.keys(state.days).forEach(ds => {
    const info = getISOWeekInfo(parseDateStr(ds));
    weekKeys.add(info.key);
  });
  Object.keys(state.weeks).forEach(wk => weekKeys.add(wk));
  return Array.from(weekKeys).sort();
}

/* Dépense = toutes les dépenses réelles (repas/hôtel réels + hôtel HF) + hors forfait,
   cumulées sur les 7 jours de la semaine. Recette = l'avance reçue cette semaine-là. */
function computeWeekSync(weekKey) {
  const m = weekKey.match(/^(\d+)-W(\d+)$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const mondayUTC = isoWeekToMonday(year, week);
  const mondayLocal = new Date(mondayUTC.getUTCFullYear(), mondayUTC.getUTCMonth(), mondayUTC.getUTCDate());
  const dates = weekDates(mondayLocal);

  let depense = 0;
  dates.forEach(d => {
    const day = state.days[toDateStr(d)];
    if (!day) return;
    depense += dayRealExpense(day);
    depense += (day.horsForfait.montant || 0);
  });
  depense = Math.round(depense * 100) / 100;

  const avance = Math.round(((state.weeks[weekKey] && state.weeks[weekKey].avance) || 0) * 100) / 100;
  const label = `S. ${week} (${fmtDMY(dates[0])} - ${fmtDMY(dates[6])}) · ${year}`;

  return { weekKey, year, week, dateStr: toDateStr(mondayLocal), label, depense, avance };
}

function buildBudgetSyncPayload(weekEntries) {
  const transactions = [];
  weekEntries.forEach(w => {
    if (w.depense > 0) {
      transactions.push({
        id: `ndf-${w.weekKey}-exp`,
        type: "expense",
        date: w.dateStr,
        categoryId: "directique",
        label: w.label,
        amount: w.depense,
        createdAt: new Date().toISOString(),
        syncKey: `ndf:${w.weekKey}:expense`,
      });
    }
    if (w.avance > 0) {
      transactions.push({
        id: `ndf-${w.weekKey}-inc`,
        type: "income",
        date: w.dateStr,
        categoryId: "avance-dtq",
        label: w.label,
        amount: w.avance,
        createdAt: new Date().toISOString(),
        syncKey: `ndf:${w.weekKey}:income`,
      });
    }
  });

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
    const w = computeWeekSync(info.key);
    if (!w || (w.depense <= 0 && w.avance <= 0)) { toast("Rien à envoyer pour cette semaine"); return; }
    downloadJSON(buildBudgetSyncPayload([w]), `budget-sync-S${w.week}-${w.year}.json`);
    toast("Fichier exporté — à importer dans Budget");
  });

  document.getElementById("btnSyncAll").addEventListener("click", () => {
    const weeks = computeAllWeekKeys().map(computeWeekSync).filter(w => w && (w.depense > 0 || w.avance > 0));
    if (weeks.length === 0) { toast("Aucune donnée à exporter"); return; }
    downloadJSON(buildBudgetSyncPayload(weeks), `budget-sync-complet-${toDateStr(new Date())}.json`);
    toast(`${weeks.length} semaine(s) exportée(s)`);
  });
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
  initBudgetSyncEvents();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);

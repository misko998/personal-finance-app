// Pregled meseca: stanje, kartice, grafikon po kategorijama, lista troškova i priliva.
import { state, getCategory, getSubcategory, setSetting } from '../store.js';
import { computeLedger, dailyStats, categoryBreakdown, expensesInMonth, incomesInMonth } from '../calc.js';
import {
  esc, fmtAmount, fmtRSD, fmtSigned, fmtPct, fmtDate, fmtDateLong, monthLabel, monthName,
  currentMonthId, plural,
} from '../format.js';
import { donutSVG, catColor } from '../charts.js';
import { ICON } from '../icons.js';
import { openSheet, h, $, toast } from '../ui.js';
import { uiState, goToMonth, rerender, navigate } from '../nav.js';
import { openEntrySheet, openMonthSetup } from '../forms.js';
import { exportJSON } from '../backup.js';

const MAX_SLICES = 7; // više kategorija se spaja u "Ostale kategorije"
const unknownCat = { id: '?', name: 'Nepoznata', icon: '❔', color: -1 };

export function renderDashboard(head, main) {
  const ledger = computeLedger(state);
  const range = [...ledger.keys()];
  if (!ledger.has(uiState.month)) uiState.month = uiState.month < range[0] ? range[0] : range[range.length - 1];
  const m = uiState.month;
  const e = ledger.get(m);
  const ds = dailyStats(e);
  const cur = currentMonthId();
  const idx = range.indexOf(m);
  const pct = e.pctSpent;
  const meterW = pct == null ? (e.spent > 0 ? 100 : 0) : Math.min(100, pct * 100);
  const meterTone = e.end < 0 || (pct != null && pct >= 1) ? 'danger' : pct != null && pct >= 0.85 ? 'warn' : '';
  const heroLabel = ds.status === 'current' ? 'Trenutno stanje' : ds.status === 'past' ? 'Krajnje stanje' : 'Planirano stanje';

  head.className = 'topbar topbar-dash';
  head.innerHTML = `
    <div class="month-switch">
      <button type="button" class="icon-btn on-band" data-act="prev-month" ${idx <= 0 ? 'disabled' : ''} aria-label="Prethodni mesec">${ICON.left}</button>
      <button type="button" class="month-title" data-act="pick-month" aria-label="Izaberi mesec">
        <span>${monthLabel(m)}</span>${ICON.down}
      </button>
      <button type="button" class="icon-btn on-band" data-act="next-month" ${idx >= range.length - 1 ? 'disabled' : ''} aria-label="Sledeći mesec">${ICON.right}</button>
    </div>
    <div class="hero ${e.end < 0 ? 'is-neg' : ''}">
      <div class="hero-label">${heroLabel}${m === cur ? '' : ` · ${monthName(m)}`}</div>
      <div class="hero-amount num">${fmtAmount(e.end)}<span class="hero-cur">RSD</span></div>
      ${e.end < 0 ? `<div class="pill pill-danger">${ICON.warn}U minusu ${fmtAmount(-e.end)} RSD</div>` : ''}
      <div class="meter ${meterTone}" role="progressbar" aria-label="Potrošeno od budžeta" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(meterW)}">
        <span style="width:${meterW.toFixed(1)}%"></span>
      </div>
      <div class="hero-meta">
        <span>Potrošeno <b>${fmtPct(pct)}</b> budžeta</span>
        <span>${fmtAmount(e.spent)} / ${fmtAmount(e.budget)}</span>
      </div>
    </div>`;

  // ---------------------------------------------------------------- banneri
  const banners = [];
  if (!e.configured && m <= cur) {
    banners.push(`<div class="banner">${ICON.info}<div class="banner-text"><b>Početno stanje za ${monthName(m)} nije uneto.</b><span>Unesi platu ili drugi početni iznos.</span></div><button type="button" class="btn btn-sm btn-primary" data-act="setup-month">Unesi</button></div>`);
  }
  if (e.end < 0 && (e.configured || e.carried !== 0)) {
    banners.push(`<div class="banner banner-danger">${ICON.warn}<div class="banner-text"><b>Stanje je u minusu ${fmtRSD(-e.end)}.</b><span>Potrošeno je više nego što je bilo na raspolaganju za ${monthName(m)}.</span></div></div>`);
  }
  const lastBackup = state.settings.lastBackupAt;
  const snooze = state.settings.backupSnoozeUntil;
  const daysSinceBackup = lastBackup ? (Date.now() - Date.parse(lastBackup)) / 864e5 : Infinity;
  if (!state.settings.demo && state.expenses.length >= 10 && daysSinceBackup > 30 && !(snooze && Date.parse(snooze) > Date.now())) {
    banners.push(`<div class="banner banner-warn">${ICON.shield}<div class="banner-text"><b>${lastBackup ? `Poslednji backup: ${fmtDate(lastBackup.slice(0, 10))}` : 'Još nisi napravio backup.'}</b><span>Izvezi podatke da ih ne izgubiš ako promeniš telefon.</span></div>
      <div class="banner-actions"><button type="button" class="btn btn-sm btn-primary" data-act="backup">Izvezi</button><button type="button" class="icon-btn" data-act="snooze-backup" aria-label="Podseti me kasnije">${ICON.close}</button></div></div>`);
  }
  if (state.settings.demo) {
    banners.push(`<div class="banner">${ICON.info}<div class="banner-text"><b>Prikazani su primer podaci.</b><span>Obriši ih u Podešavanjima kad budeš spreman za svoje.</span></div><button type="button" class="btn btn-sm btn-ghost" data-act="go-settings">Podešavanja</button></div>`);
  }

  // ---------------------------------------------------------------- kartice
  const statCards = `
    <section class="stats" aria-label="Pregled meseca">
      <button type="button" class="stat" data-act="setup-month">
        <span class="stat-label">Početno stanje</span>
        <span class="stat-value num">${fmtAmount(e.start)}</span>
        <span class="stat-sub">${e.carried ? `uklj. prenos ${fmtSigned(e.carried)}` : e.configured ? 'bez prenosa' : 'nije uneto · dodirni'}</span>
      </button>
      <button type="button" class="stat" data-act="show-incomes">
        <span class="stat-label">Prilivi</span>
        <span class="stat-value num pos">${e.incomes ? '+' : ''}${fmtAmount(e.incomes)}</span>
        <span class="stat-sub">${e.incomeCount} ${plural(e.incomeCount, 'priliv', 'priliva', 'priliva')}</span>
      </button>
      <button type="button" class="stat" data-act="show-expenses">
        <span class="stat-label">Ukupno potrošeno</span>
        <span class="stat-value num">${fmtAmount(e.spent)}</span>
        <span class="stat-sub">${e.count} ${plural(e.count, 'trošak', 'troška', 'troškova')}</span>
      </button>
      <div class="stat">
        <span class="stat-label">${ds.status === 'past' ? 'Prosečno dnevno' : 'Možeš dnevno'}</span>
        <span class="stat-value num ${ds.status !== 'past' && ds.perDay <= 0 && e.spent > 0 ? 'neg' : ''}">${ds.status === 'past' ? fmtAmount(ds.avg) : fmtAmount(ds.perDay)}</span>
        <span class="stat-sub">${dailySub(ds)}</span>
      </div>
    </section>`;

  // ---------------------------------------------------------------- kategorije
  const bd = categoryBreakdown(state, m);
  let segs = bd.map((c) => {
    const cat = getCategory(c.categoryId) || unknownCat;
    return { id: c.categoryId, name: cat.name, icon: cat.icon, value: c.total, pct: c.pct, color: catColor(cat.color), archived: cat.archived };
  });
  if (segs.length > MAX_SLICES + 1) {
    const rest = segs.slice(MAX_SLICES);
    segs = segs.slice(0, MAX_SLICES).concat([{ id: '__rest', name: `Ostale kategorije (${rest.length})`, icon: '•', value: rest.reduce((a, s) => a + s.value, 0), pct: rest.reduce((a, s) => a + s.pct, 0), color: 'var(--c-other)', rest }]);
  }
  const catSection = `
    <section class="card" id="sec-cats">
      <div class="card-head"><h3>Po kategorijama</h3><span class="card-note">dodirni za detalje</span></div>
      ${bd.length
        ? `<div class="donut-wrap">${donutSVG(segs, { title: 'Potrošeno', value: fmtAmount(e.spent) })}</div>
           <ul class="legend">${segs
             .map((s) => `<li><button type="button" class="legend-row" data-act="${s.rest ? 'noop' : 'open-cat'}" data-id="${esc(s.id)}">
                <span class="swatch" style="background:${s.color}"></span>
                <span class="legend-icon" aria-hidden="true">${esc(s.icon)}</span>
                <span class="legend-name">${esc(s.name)}${s.archived ? ' <i>(arhivirana)</i>' : ''}</span>
                <span class="legend-pct num">${fmtPct(s.pct)}</span>
                <span class="legend-val num">${fmtAmount(s.value)}</span>
                ${s.rest ? '' : ICON.chevron}
              </button></li>`)
             .join('')}</ul>`
        : `<div class="empty"><div class="empty-ic">${ICON.pie}</div><p><b>Još nema troškova za ${monthName(m)}.</b><br>Dodaj prvi trošak dugmetom +.</p></div>`}
    </section>`;

  main.innerHTML = `${banners.join('')}${statCards}${catSection}${txSection(m)}`;

  if (uiState.scrollTo) {
    const el = document.getElementById(uiState.scrollTo);
    uiState.scrollTo = null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function dailySub(ds) {
  if (ds.status === 'current') return `još ${ds.daysLeft} ${plural(ds.daysLeft, 'dan', 'dana', 'dana')} · prosek ${fmtAmount(ds.avg)}/dan`;
  if (ds.status === 'past') return `mesec je završen · ${ds.daysElapsed} dana`;
  return `${ds.daysLeft} dana u mesecu`;
}

// ---------------------------------------------------------------- lista transakcija
function txSection(m) {
  const exps = expensesInMonth(state, m);
  const incs = incomesInMonth(state, m);
  const tab = uiState.listTab;
  const dir = uiState.sortDesc ? -1 : 1;
  const cmp = (a, b) => dir * (a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));

  let content = '';
  if (tab === 'exp') {
    const catsInMonth = [...new Set(exps.map((x) => x.categoryId))].map((id) => getCategory(id) || { ...unknownCat, id });
    if (uiState.filterCat && !catsInMonth.some((c) => c.id === uiState.filterCat)) uiState.filterCat = null;
    const list = exps.filter((x) => !uiState.filterCat || x.categoryId === uiState.filterCat).sort(cmp);
    const filters = catsInMonth.length > 1 ? `
      <div class="chips chips-scroll filter-chips" role="group" aria-label="Filter po kategoriji">
        <button type="button" class="chip chip-sm ${!uiState.filterCat ? 'on' : ''}" data-act="filter" data-id="">Sve</button>
        ${catsInMonth.map((c) => `<button type="button" class="chip chip-sm ${uiState.filterCat === c.id ? 'on' : ''}" data-act="filter" data-id="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}
      </div>` : '';

    const groups = new Map();
    list.forEach((x) => (groups.get(x.date) || groups.set(x.date, []).get(x.date)).push(x));
    const filteredTotal = list.reduce((a, x) => a + x.amount, 0);
    content = `${filters}
      ${uiState.filterCat ? `<p class="filter-total">Ukupno za filter: <b class="num">${fmtRSD(filteredTotal)}</b></p>` : ''}
      ${list.length
        ? [...groups.entries()]
            .map(([date, items]) => `
              <div class="day-group">
                <div class="day-head"><span>${fmtDateLong(date)}</span>${items.length > 1 ? `<span class="num">ukupno −${fmtAmount(items.reduce((a, x) => a + x.amount, 0))}</span>` : ''}</div>
                ${items.map(txRow).join('')}
              </div>`)
            .join('')
        : `<p class="empty-line">Nema troškova${uiState.filterCat ? ' za izabranu kategoriju' : ''}.</p>`}`;
  } else {
    const list = incs.sort(cmp);
    content = list.length
      ? list.map((i) => `
          <button type="button" class="tx" data-act="edit-inc" data-id="${esc(i.id)}">
            <span class="tx-ic tx-ic-inc" aria-hidden="true">+</span>
            <span class="tx-main"><span class="tx-title">${esc(i.description || 'Priliv')}</span><span class="tx-meta">${fmtDate(i.date)}</span></span>
            <span class="tx-amt num pos">+${fmtAmount(i.amount)}</span>
          </button>`).join('')
      : `<p class="empty-line">Nema dodatnih priliva za ${monthName(m)}. Bonus, honorar ili povraćaj novca dodaješ dugmetom + → Priliv.</p>`;
  }

  return `
    <section class="card" id="sec-tx">
      <div class="card-head">
        <div class="seg" role="tablist" aria-label="Lista">
          <button type="button" role="tab" class="${tab === 'exp' ? 'on' : ''}" data-act="tab" data-id="exp" aria-selected="${tab === 'exp'}">Troškovi <span class="count">${exps.length}</span></button>
          <button type="button" role="tab" class="${tab === 'inc' ? 'on' : ''}" data-act="tab" data-id="inc" aria-selected="${tab === 'inc'}">Prilivi <span class="count">${incs.length}</span></button>
        </div>
        <button type="button" class="icon-btn" data-act="sort" aria-label="${uiState.sortDesc ? 'Prikaži najstarije prvo' : 'Prikaži najnovije prvo'}" title="${uiState.sortDesc ? 'Najnovije prvo' : 'Najstarije prvo'}">${uiState.sortDesc ? ICON.sort : ICON.sortUp}</button>
      </div>
      ${content}
    </section>`;
}

function txRow(x) {
  const cat = getCategory(x.categoryId) || unknownCat;
  const sub = x.subcategoryId ? getSubcategory(x.subcategoryId) : null;
  const title = x.label || sub?.name || cat.name;
  const meta = [cat.name, sub && sub.name !== title ? sub.name : null, x.note].filter(Boolean).map(esc).join(' · ');
  return `
    <button type="button" class="tx" data-act="edit-exp" data-id="${esc(x.id)}">
      <span class="tx-ic" style="--cat:${catColor(cat.color)}" aria-hidden="true">${esc(cat.icon)}</span>
      <span class="tx-main"><span class="tx-title">${esc(title)}</span><span class="tx-meta">${meta}</span></span>
      <span class="tx-amt num">−${fmtAmount(x.amount)}</span>
    </button>`;
}

// ---------------------------------------------------------------- akcije
export function handleDashboardClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const id = t.dataset.id;
  const ledger = () => [...computeLedger(state).keys()];
  switch (t.dataset.act) {
    case 'prev-month':
    case 'next-month': {
      const r = ledger();
      const i = r.indexOf(uiState.month) + (t.dataset.act === 'prev-month' ? -1 : 1);
      if (r[i]) goToMonth(r[i]);
      break;
    }
    case 'pick-month':
      openMonthPicker();
      break;
    case 'setup-month':
      openMonthSetup(uiState.month);
      break;
    case 'show-incomes':
      uiState.listTab = 'inc';
      uiState.scrollTo = 'sec-tx';
      rerender();
      break;
    case 'show-expenses':
      uiState.listTab = 'exp';
      uiState.filterCat = null;
      uiState.scrollTo = 'sec-tx';
      rerender();
      break;
    case 'open-cat':
      openCategoryDetail(id, uiState.month);
      break;
    case 'filter':
      uiState.filterCat = id || null;
      rerender();
      break;
    case 'tab':
      uiState.listTab = id;
      rerender();
      break;
    case 'sort':
      uiState.sortDesc = !uiState.sortDesc;
      rerender();
      break;
    case 'edit-exp': {
      const x = state.expenses.find((y) => y.id === id);
      if (x) openEntrySheet({ expense: x });
      break;
    }
    case 'edit-inc': {
      const x = state.incomes.find((y) => y.id === id);
      if (x) openEntrySheet({ income: x });
      break;
    }
    case 'backup':
      exportJSON().catch((err) => toast(err.message, { type: 'warn' }));
      break;
    case 'snooze-backup':
      setSetting('backupSnoozeUntil', new Date(Date.now() + 7 * 864e5).toISOString());
      break;
    case 'go-settings':
      navigate('podesavanja');
      break;
  }
}

// ---------------------------------------------------------------- izbor meseca
function openMonthPicker() {
  const ledger = computeLedger(state);
  const cur = currentMonthId();
  const rows = [...ledger.values()].reverse();
  const body = h(`<div class="month-list">${rows
    .map((r) => `
      <button type="button" class="month-pick ${r.id === uiState.month ? 'on' : ''}" data-id="${r.id}">
        <span><b>${monthLabel(r.id)}</b>${r.id === cur ? ' <span class="pill pill-soft">tekući</span>' : ''}</span>
        <span class="num ${r.end < 0 ? 'neg' : ''}">${fmtRSD(r.end)}</span>
      </button>`)
    .join('')}</div>`);
  const sheet = openSheet({ title: 'Izaberi mesec', body, className: 'sheet-compact' });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    sheet.close();
    goToMonth(b.dataset.id);
  });
}

// ---------------------------------------------------------------- detalji kategorije
export function openCategoryDetail(catId, monthId) {
  const bd = categoryBreakdown(state, monthId).find((c) => c.categoryId === catId);
  const cat = getCategory(catId) || unknownCat;
  if (!bd) return;
  const color = catColor(cat.color);
  const bar = (v) => `<span class="mini-bar"><span style="width:${bd.total ? ((v / bd.total) * 100).toFixed(1) : 0}%;background:${color}"></span></span>`;

  const subsHTML = bd.subs.some((s) => s.subcategoryId)
    ? `<h4 class="sub-h">Po potkategorijama</h4>
       <ul class="breakdown">${bd.subs
         .map((s) => {
           const sub = s.subcategoryId ? getSubcategory(s.subcategoryId) : null;
           return `<li><div class="bd-top"><span>${sub ? esc(sub.name) + (sub.archived ? ' <i>(arhivirana)</i>' : '') : '<i>bez potkategorije</i>'}</span><span class="num">${fmtAmount(s.total)}</span></div>${bar(s.total)}<span class="bd-meta">${s.count} ${plural(s.count, 'trošak', 'troška', 'troškova')} · ${fmtPct(s.total / bd.total)}</span></li>`;
         })
         .join('')}</ul>`
    : '';
  const labelsHTML = `
    <h4 class="sub-h">Po labelama</h4>
    <ul class="breakdown">${bd.labels
      .map((l) => `<li><div class="bd-top"><span>${l.name ? esc(l.name) : '<i>bez labele</i>'}</span><span class="num">${fmtAmount(l.total)}</span></div>${bar(l.total)}<span class="bd-meta">${l.count}× · ${fmtPct(l.total / bd.total)}</span></li>`)
      .join('')}</ul>`;
  const items = [...bd.items].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const listHTML = `<h4 class="sub-h">Troškovi</h4><div class="tx-list">${items.map(txRow).join('')}</div>`;

  const body = h(`<div class="cat-detail">
      <div class="cat-detail-head" style="--cat:${color}">
        <span class="cat-detail-ic" aria-hidden="true">${esc(cat.icon)}</span>
        <div><b class="num">${fmtRSD(bd.total)}</b><span>${fmtPct(bd.pct)} potrošnje za ${monthName(monthId)} · ${bd.count} ${plural(bd.count, 'trošak', 'troška', 'troškova')}</span></div>
      </div>
      ${subsHTML}${labelsHTML}${listHTML}
    </div>`);
  const foot = h(`<div class="btn-row"><button type="button" class="btn btn-ghost btn-grow" data-filter>Prikaži samo ovu kategoriju u listi</button></div>`);
  const sheet = openSheet({ title: `${cat.name} · ${monthLabel(monthId)}`, body, footer: foot, className: 'sheet-tall' });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="edit-exp"]');
    if (!b) return;
    const x = state.expenses.find((y) => y.id === b.dataset.id);
    sheet.close();
    if (x) openEntrySheet({ expense: x });
  });
  $('[data-filter]', foot).addEventListener('click', () => {
    sheet.close();
    uiState.listTab = 'exp';
    uiState.filterCat = catId;
    uiState.scrollTo = 'sec-tx';
    rerender();
  });
}

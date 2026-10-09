// Forme u bottom sheet-u: unos/izmena troška, unos/izmena priliva, početno stanje meseca.
import {
  state, activeCategories, getCategory, subsOf, labelsOf, saveExpense, deleteExpense, restoreExpense,
  saveIncome, deleteIncome, restoreIncome, saveMonth, lastStartingBalance,
} from './store.js';
import { computeLedger, previewEnd } from './calc.js';
import {
  esc, fmtAmount, fmtRSD, fmtSigned, norm, monthIdOf, monthLabel, monthName, monthGen, todayISO,
  currentMonthId, lastDayOf, firstDayOf,
} from './format.js';
import { openSheet, h, $, $$, toast, bindAmountInput, dateFieldHTML, bindDateField } from './ui.js';
import { ICON } from './icons.js';
import { uiState, goToMonth } from './nav.js';
import { catColor } from './charts.js';

const INCOME_PRESETS = ['Bonus', 'Honorar', 'Povraćaj novca', 'Poklon'];
const LABEL_HINTS = { Prodavnice: 'npr. Idea, Lidl, Maxi', Računi: 'npr. Kirija, Račun za telefon', Auto: 'npr. NIS, OMV, Lukoil' };

/** Podrazumevani datum za novi unos u zavisnosti od meseca koji je prikazan. */
export function defaultDateFor(monthId = uiState.month) {
  const cur = currentMonthId();
  if (monthId === cur) return todayISO();
  return monthId < cur ? lastDayOf(monthId) : firstDayOf(monthId);
}

function focusSoon(input) {
  try {
    input.focus({ preventScroll: true });
  } catch {
    input.focus();
  }
}

// =====================================================================================
// Unos (trošak / priliv) — jedan sheet, prekidač između dva tipa
// =====================================================================================
export function openEntrySheet({ mode = 'exp', expense = null, income = null, defaultDate = null } = {}) {
  const sheet = openSheet({ title: 'Novi unos', className: 'sheet-tall' });
  const carry = { amount: 0, date: defaultDate || defaultDateFor() };
  const show = (m) => {
    if (m === 'exp') renderExpenseForm(sheet, { expense, carry, show });
    else renderIncomeForm(sheet, { income, carry, show });
  };
  show(expense ? 'exp' : income ? 'inc' : mode);
  return sheet;
}

const typeSwitch = (mode) => `
  <div class="seg seg-type" role="tablist" aria-label="Tip unosa">
    <button type="button" role="tab" data-mode="exp" class="${mode === 'exp' ? 'on' : ''}" aria-selected="${mode === 'exp'}">Trošak</button>
    <button type="button" role="tab" data-mode="inc" class="${mode === 'inc' ? 'on' : ''}" aria-selected="${mode === 'inc'}">Priliv</button>
  </div>`;

const catTile = (c, selectedId) => `
  <button type="button" class="cat-tile ${c.id === selectedId ? 'on' : ''}" data-cat="${esc(c.id)}" aria-pressed="${c.id === selectedId}" style="--cat:${catColor(c.color)}">
    <span class="cat-emoji" aria-hidden="true">${esc(c.icon)}</span><span class="cat-name">${esc(c.name)}</span>
  </button>`;

// -------------------------------------------------------------------------- trošak
function renderExpenseForm(sheet, { expense, carry, show }) {
  const editing = !!expense;
  const f = {
    amount: expense?.amount ?? carry.amount ?? 0,
    categoryId: expense?.categoryId ?? null,
    subcategoryId: expense?.subcategoryId ?? null,
    label: expense?.label ?? '',
    date: expense?.date ?? carry.date,
    note: expense?.note ?? '',
  };
  sheet.setTitle(editing ? 'Izmeni trošak' : 'Novi unos');

  const cats = activeCategories();
  const curCat = f.categoryId && getCategory(f.categoryId);
  if (curCat && curCat.archived) cats.push(curCat);

  const body = h(`
    <form class="form" id="exp-form" novalidate autocomplete="off">
      ${editing ? '' : typeSwitch('exp')}
      <div class="amount-field">
        <input id="f-amount" type="text" inputmode="numeric" placeholder="0" value="${f.amount ? fmtAmount(f.amount) : ''}" aria-label="Iznos troška u dinarima">
        <span class="amount-cur">RSD</span>
      </div>
      <p class="field-err" data-err="amount" hidden></p>

      <div class="field">
        <span class="field-label">Kategorija</span>
        <div class="cat-grid" id="f-cats">${cats.map((c) => catTile(c, f.categoryId)).join('')}</div>
        <p class="field-err" data-err="cat" hidden></p>
      </div>

      <div class="field" id="f-sub-wrap">
        <span class="field-label">Potkategorija <i>opciono</i></span>
        <div class="chips" id="f-subs"></div>
      </div>

      <div class="field" id="f-label-wrap">
        <label class="field-label" for="f-label">Labela <i>naziv potrošnje</i></label>
        <input id="f-label" type="text" maxlength="60" autocapitalize="sentences" enterkeyhint="done" value="${esc(f.label)}" placeholder="npr. Idea, Lidl, Maxi">
        <div class="chips" id="f-label-chips"></div>
      </div>

      <div class="field">
        <span class="field-label">Datum</span>
        ${dateFieldHTML('f-date', f.date)}
      </div>

      <div class="field">
        <label class="field-label" for="f-note">Napomena <i>opciono</i></label>
        <input id="f-note" type="text" maxlength="200" enterkeyhint="done" value="${esc(f.note)}">
      </div>

      <div class="preview" id="f-preview" aria-live="polite"></div>
    </form>`);

  const foot = h(`
    <div class="btn-row">
      ${editing ? `<button type="button" class="btn btn-danger-ghost" data-del>${ICON.trash}<span>Obriši</span></button>` : ''}
      <button type="submit" form="exp-form" class="btn btn-primary btn-grow">Sačuvaj trošak</button>
    </div>`);
  sheet.setBody(body);
  sheet.setFooter(foot);

  const amountInput = $('#f-amount', body);
  const labelInput = $('#f-label', body);
  const getAmount = bindAmountInput(amountInput, (v) => {
    f.amount = v;
    carry.amount = v;
    showErr('amount', '');
    updatePreview();
  });

  const showErr = (key, msg) => {
    const el = $(`[data-err="${key}"]`, body);
    el.textContent = msg;
    el.hidden = !msg;
  };

  // --- potkategorije
  const renderSubs = () => {
    const wrap = $('#f-sub-wrap', body);
    const subs = f.categoryId ? subsOf(f.categoryId) : [];
    const cur = f.subcategoryId && state.subcategories.find((s) => s.id === f.subcategoryId);
    if (cur && cur.archived && !subs.includes(cur)) subs.push(cur);
    wrap.hidden = !subs.length;
    $('#f-subs', body).innerHTML = subs
      .map((s) => `<button type="button" class="chip ${s.id === f.subcategoryId ? 'on' : ''}" data-sub="${esc(s.id)}" aria-pressed="${s.id === f.subcategoryId}">${esc(s.name)}</button>`)
      .join('');
  };

  // --- labele (brzi izbori + autocomplete)
  const renderLabels = () => {
    const chipsEl = $('#f-label-chips', body);
    if (!f.categoryId) {
      chipsEl.innerHTML = '<span class="hint">Izaberi kategoriju da vidiš sačuvane labele.</span>';
      return;
    }
    const cat = getCategory(f.categoryId);
    labelInput.placeholder = LABEL_HINTS[cat?.name] || 'npr. naziv prodavnice ili usluge';
    const q = norm(labelInput.value);
    const all = labelsOf(f.categoryId);
    const list = (q ? all.filter((l) => norm(l.name).includes(q)) : all).slice(0, 12);
    chipsEl.innerHTML = list.length
      ? list.map((l) => `<button type="button" class="chip ${norm(l.name) === q ? 'on' : ''}" data-label="${esc(l.id)}">${esc(l.name)}</button>`).join('')
      : q
        ? `<span class="hint">Nova labela „${esc(labelInput.value.trim())}” biće sačuvana.</span>`
        : '<span class="hint">Još nema sačuvanih labela za ovu kategoriju.</span>';
  };

  // --- pregled stanja posle unosa
  const updatePreview = () => {
    const el = $('#f-preview', body);
    if (!f.amount || !f.categoryId) {
      el.innerHTML = '';
      el.className = 'preview';
      return;
    }
    const p = previewEnd(state, { id: expense?.id, amount: f.amount, date: f.date, categoryId: f.categoryId });
    const m = monthIdOf(f.date);
    if (isUnfunded(p)) {
      el.className = 'preview preview-info';
      el.innerHTML = `${ICON.info}<div><b>Za ${monthName(m)} nije uneto početno stanje.</b><span>Trošak će biti zabeležen; početno stanje možeš uneti kasnije na Pregledu.</span></div>`;
    } else if (p.end < 0) {
      el.className = 'preview preview-neg';
      el.innerHTML = `${ICON.warn}<div><b>Stanje će otići u minus: ${fmtRSD(p.end)}</b><span>Možeš da sačuvaš, ali ${monthName(m)} je preko budžeta.</span></div>`;
    } else {
      el.className = 'preview';
      el.innerHTML = `<span>Stanje za ${monthName(m)} posle ovog troška</span><b class="num">${fmtRSD(p.end)}</b>`;
    }
  };

  // --- događaji
  body.addEventListener('click', (e) => {
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn && modeBtn.dataset.mode !== 'exp') {
      carry.amount = f.amount;
      carry.date = f.date;
      show(modeBtn.dataset.mode);
      return;
    }
    const tile = e.target.closest('[data-cat]');
    if (tile) {
      if (document.activeElement === amountInput) amountInput.blur(); // skloni tastaturu da se vide izbori
      const id = tile.dataset.cat;
      if (f.categoryId !== id) {
        f.categoryId = id;
        f.subcategoryId = null;
      }
      $$('.cat-tile', body).forEach((t) => {
        t.classList.toggle('on', t.dataset.cat === id);
        t.setAttribute('aria-pressed', t.dataset.cat === id);
      });
      showErr('cat', '');
      renderSubs();
      renderLabels();
      updatePreview();
      return;
    }
    const sub = e.target.closest('[data-sub]');
    if (sub) {
      f.subcategoryId = f.subcategoryId === sub.dataset.sub ? null : sub.dataset.sub;
      renderSubs();
      return;
    }
    const lab = e.target.closest('[data-label]');
    if (lab) {
      const l = state.labels.find((x) => x.id === lab.dataset.label);
      if (!l) return;
      labelInput.value = l.name;
      f.label = l.name;
      if (!f.subcategoryId && l.lastSubcategoryId && subsOf(f.categoryId).some((s) => s.id === l.lastSubcategoryId)) {
        f.subcategoryId = l.lastSubcategoryId;
        renderSubs();
      }
      renderLabels();
    }
  });

  labelInput.addEventListener('input', () => {
    f.label = labelInput.value;
    renderLabels();
  });
  $('#f-note', body).addEventListener('input', (e) => (f.note = e.target.value));
  bindDateField(body, 'f-date', (v) => {
    f.date = v;
    carry.date = v;
    updatePreview();
  });

  // --- čuvanje
  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.amount = getAmount();
    let bad = false;
    if (!(f.amount > 0)) {
      showErr('amount', 'Unesi iznos veći od 0.');
      bad = true;
    }
    if (!f.categoryId) {
      showErr('cat', 'Izaberi kategoriju.');
      bad = true;
    }
    if (bad) return;
    const btn = $('[type=submit]', foot);
    btn.disabled = true;
    try {
      const saved = await saveExpense({ ...f, id: expense?.id });
      sheet.close();
      afterSave(saved.date, editing ? 'Izmene sačuvane' : 'Trošak sačuvan');
    } catch (err) {
      btn.disabled = false;
      toast(err.message || 'Čuvanje nije uspelo.', { type: 'warn' });
    }
  });

  $('[data-del]', foot)?.addEventListener('click', async () => {
    const removed = await deleteExpense(expense.id);
    sheet.close();
    toast('Trošak obrisan', { actionText: 'Poništi', onAction: () => restoreExpense(removed), duration: 6000 });
  });

  renderSubs();
  renderLabels();
  updatePreview();
  if (!editing) focusSoon(amountInput);
}

/** Mesec bez unetog početnog stanja i bez prenosa (npr. pre nego što si počeo da koristiš aplikaciju). */
export const isUnfunded = (entry) => !!entry && !entry.configured && entry.carried === 0;

function afterSave(date, okMsg) {
  const m = monthIdOf(date);
  const entry = computeLedger(state).get(m);
  if (isUnfunded(entry)) {
    toast(`${okMsg} u ${monthLabel(m)} · početno stanje nije uneto`, { actionText: 'Prikaži', onAction: () => goToMonth(m), duration: 5000 });
  } else if (entry && entry.end < 0) {
    toast(`Pažnja: stanje za ${monthName(m)} je u minusu (${fmtRSD(entry.end)})`, { type: 'warn', duration: 6500 });
  } else if (m !== uiState.month) {
    toast(`${okMsg} u ${monthLabel(m)}`, { actionText: 'Prikaži', onAction: () => goToMonth(m) });
  } else {
    toast(okMsg);
  }
}

// -------------------------------------------------------------------------- priliv
function renderIncomeForm(sheet, { income, carry, show }) {
  const editing = !!income;
  const f = { amount: income?.amount ?? carry.amount ?? 0, description: income?.description ?? '', date: income?.date ?? carry.date };
  sheet.setTitle(editing ? 'Izmeni priliv' : 'Novi unos');

  const body = h(`
    <form class="form" id="inc-form" novalidate autocomplete="off">
      ${editing ? '' : typeSwitch('inc')}
      <div class="amount-field amount-field-inc">
        <span class="amount-sign" aria-hidden="true">+</span>
        <input id="i-amount" type="text" inputmode="numeric" placeholder="0" value="${f.amount ? fmtAmount(f.amount) : ''}" aria-label="Iznos priliva u dinarima">
        <span class="amount-cur">RSD</span>
      </div>
      <p class="field-err" data-err="amount" hidden></p>

      <div class="field">
        <label class="field-label" for="i-desc">Opis</label>
        <input id="i-desc" type="text" maxlength="80" autocapitalize="sentences" enterkeyhint="done" value="${esc(f.description)}" placeholder="npr. Bonus, honorar, povraćaj novca">
        <div class="chips" id="i-presets">
          ${INCOME_PRESETS.map((p) => `<button type="button" class="chip ${p === f.description ? 'on' : ''}" data-preset="${esc(p)}">${esc(p)}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <span class="field-label">Datum</span>
        ${dateFieldHTML('i-date', f.date)}
      </div>
      <div class="preview" id="i-preview" aria-live="polite"></div>
    </form>`);
  const foot = h(`
    <div class="btn-row">
      ${editing ? `<button type="button" class="btn btn-danger-ghost" data-del>${ICON.trash}<span>Obriši</span></button>` : ''}
      <button type="submit" form="inc-form" class="btn btn-primary btn-grow">Sačuvaj priliv</button>
    </div>`);
  sheet.setBody(body);
  sheet.setFooter(foot);

  const amountInput = $('#i-amount', body);
  const descInput = $('#i-desc', body);
  const errEl = $('[data-err="amount"]', body);

  const updatePreview = () => {
    const el = $('#i-preview', body);
    if (!f.amount) return (el.innerHTML = '');
    const m = monthIdOf(f.date);
    const entry = computeLedger(state).get(m);
    const base = entry ? entry.end : 0;
    const delta = f.amount - (income && monthIdOf(income.date) === m ? income.amount : 0);
    el.innerHTML = `<span>Stanje za ${monthName(m)} posle priliva</span><b class="num">${fmtRSD(base + delta)}</b>`;
  };
  const getAmount = bindAmountInput(amountInput, (v) => {
    f.amount = v;
    carry.amount = v;
    errEl.hidden = true;
    updatePreview();
  });
  const syncPresets = () => $$('[data-preset]', body).forEach((b) => b.classList.toggle('on', norm(b.dataset.preset) === norm(descInput.value)));

  body.addEventListener('click', (e) => {
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn && modeBtn.dataset.mode !== 'inc') {
      carry.amount = f.amount;
      carry.date = f.date;
      show(modeBtn.dataset.mode);
      return;
    }
    const p = e.target.closest('[data-preset]');
    if (p) {
      descInput.value = p.dataset.preset;
      f.description = p.dataset.preset;
      syncPresets();
    }
  });
  descInput.addEventListener('input', () => {
    f.description = descInput.value;
    syncPresets();
  });
  bindDateField(body, 'i-date', (v) => {
    f.date = v;
    carry.date = v;
    updatePreview();
  });

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.amount = getAmount();
    if (!(f.amount > 0)) {
      errEl.textContent = 'Unesi iznos veći od 0.';
      errEl.hidden = false;
      return;
    }
    const saved = await saveIncome({ ...f, description: f.description || 'Priliv', id: income?.id });
    sheet.close();
    afterSave(saved.date, editing ? 'Izmene sačuvane' : 'Priliv sačuvan');
  });
  $('[data-del]', foot)?.addEventListener('click', async () => {
    const removed = await deleteIncome(income.id);
    sheet.close();
    toast('Priliv obrisan', { actionText: 'Poništi', onAction: () => restoreIncome(removed), duration: 6000 });
  });

  updatePreview();
  if (!editing) focusSoon(amountInput);
}

// =====================================================================================
// Početno stanje meseca (+ prenos ostatka)
// =====================================================================================
export function openMonthSetup(monthId, { isNew = false, isFirst = false, onDone } = {}) {
  const entry = computeLedger(state).get(monthId);
  const rec = state.months.get(monthId);
  const prevId = entry?.prevId ?? null;
  const prevEnd = entry?.prevEnd ?? 0;
  const suggested = rec?.startingBalance ?? lastStartingBalance(monthId);
  let carryOn = rec ? !!rec.carryOver : prevId ? true : false;

  const title = isFirst ? 'Dobrodošao!' : isNew ? `Novi mesec: ${monthLabel(monthId)}` : `Početno stanje · ${monthLabel(monthId)}`;
  const body = h(`
    <form class="form" id="month-form" novalidate autocomplete="off">
      ${isFirst ? `<p class="lead">Podaci se čuvaju samo na ovom telefonu, bez naloga. Za početak unesi koliko novca imaš na raspolaganju ovog meseca, na primer platu.</p>` : ''}
      ${isNew && !isFirst ? `<p class="lead">Počeo je ${monthName(monthId)}. Unesi novu platu ili drugi početni iznos.</p>` : ''}
      <label class="field-label" for="m-amount">Unesi početno stanje za ${monthName(monthId)} ${monthId.slice(0, 4)}.</label>
      <div class="amount-field">
        <input id="m-amount" type="text" inputmode="numeric" placeholder="npr. 155.000" value="${suggested ? fmtAmount(suggested) : ''}" aria-label="Početno stanje u dinarima">
        <span class="amount-cur">RSD</span>
      </div>
      ${!rec && suggested ? `<p class="hint">Predložen je iznos iz prethodnog meseca — promeni ga ako je drugačiji.</p>` : ''}

      ${prevId ? `
        <label class="switch-row" for="m-carry">
          <span class="switch-text">
            <b>Prenesi ostatak iz ${monthGen(prevId)}</b>
            <small class="${prevEnd < 0 ? 'neg' : ''}">${fmtSigned(prevEnd)} RSD${prevEnd < 0 ? ' · mesec je završen u minusu' : ''}</small>
          </span>
          <input type="checkbox" class="switch" id="m-carry" ${carryOn ? 'checked' : ''}>
        </label>
        <p class="hint">Prenos se automatski ažurira ako kasnije izmeniš troškove iz ${monthGen(prevId)}.</p>` : ''}

      <div class="summary-box">
        <span>Početno stanje za ${monthName(monthId)}</span>
        <b class="num" id="m-total"></b>
        <small id="m-break"></small>
      </div>
    </form>`);
  const foot = h(`
    <div class="btn-row">
      ${isNew ? '<button type="button" class="btn btn-ghost" data-close>Kasnije</button>' : ''}
      <button type="submit" form="month-form" class="btn btn-primary btn-grow">Sačuvaj</button>
    </div>`);

  const sheet = openSheet({ title, body, footer: foot, className: 'sheet-compact' });
  const amountInput = $('#m-amount', body);
  const upd = () => {
    const base = getAmount();
    const carried = prevId && carryOn ? prevEnd : 0;
    $('#m-total', body).textContent = fmtRSD(base + carried);
    $('#m-break', body).textContent = carried ? `${fmtAmount(base)} + prenos ${fmtSigned(carried)}` : 'bez prenosa';
  };
  const getAmount = bindAmountInput(amountInput, upd);
  $('#m-carry', body)?.addEventListener('change', (e) => {
    carryOn = e.target.checked;
    upd();
  });
  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveMonth({ id: monthId, startingBalance: getAmount(), carryOver: prevId ? carryOn : false });
    sheet.close();
    toast(`Početno stanje za ${monthName(monthId)} je sačuvano`);
    onDone?.();
  });
  upd();
  if (!suggested) focusSoon(amountInput);
  return sheet;
}

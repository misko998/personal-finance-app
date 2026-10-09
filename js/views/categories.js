// Kategorije: dodavanje, preimenovanje, ikonica, potkategorije, labele, arhiviranje.
import {
  state, getCategory, subsOf, labelsOf, categoryUsage, subcategoryUsage, saveCategory, removeCategory, restoreCategory,
  saveSubcategory, removeSubcategory, renameLabel, deleteLabel, isCategoryNameTaken, commit,
} from '../store.js';
import { esc, norm, plural } from '../format.js';
import { catColor } from '../charts.js';
import { ICON } from '../icons.js';
import { openSheet, h, $, $$, toast, confirmDialog } from '../ui.js';

const EMOJIS = ['🚗', '⛽', '🛒', '🧾', '🛍️', '🏋️', '✈️', '📦', '🏠', '💡', '📱', '💻', '👕', '🍔', '☕', '🍺', '🍕', '💊', '🏥', '🎓', '📚', '🎮', '🎬', '🎵', '🎁', '🐶', '👶', '💇', '🚌', '🚕', '🅿️', '🔧', '⚽', '🧴', '💼', '🏦', '💸', '🎉'];

export function renderCategories(head, main) {
  head.className = 'topbar';
  const active = state.categories.filter((c) => !c.archived);
  const archived = state.categories.filter((c) => c.archived);
  head.innerHTML = `
    <h1 class="view-title">Kategorije</h1>
    <p class="view-sub">${active.length} ${plural(active.length, 'aktivna kategorija', 'aktivne kategorije', 'aktivnih kategorija')}${archived.length ? ` · ${archived.length} u arhivi` : ''}</p>`;

  const row = (c) => {
    const subs = subsOf(c.id).length;
    const labels = labelsOf(c.id).length;
    const used = categoryUsage(c.id);
    return `
      <button type="button" class="cat-row" data-act="edit-cat" data-id="${esc(c.id)}">
        <span class="tx-ic" style="--cat:${catColor(c.color)}" aria-hidden="true">${esc(c.icon)}</span>
        <span class="tx-main">
          <span class="tx-title">${esc(c.name)}</span>
          <span class="tx-meta">${[
            subs && `${subs} ${plural(subs, 'potkategorija', 'potkategorije', 'potkategorija')}`,
            labels && `${labels} ${plural(labels, 'labela', 'labele', 'labela')}`,
            used && `${used} ${plural(used, 'trošak', 'troška', 'troškova')}`,
          ].filter(Boolean).join(' · ') || 'još nema troškova'}</span>
        </span>
        <span class="swatch" style="background:${catColor(c.color)}"></span>
        ${ICON.chevron}
      </button>`;
  };

  main.innerHTML = `
    <section class="card card-flush">${active.map(row).join('')}</section>
    <button type="button" class="btn btn-ghost btn-block" data-act="new-cat">${ICON.plus}<span>Nova kategorija</span></button>
    ${archived.length ? `
      <section class="card">
        <div class="card-head"><h3>Arhivirane</h3><span class="card-note">ne nude se pri unosu</span></div>
        ${archived.map((c) => `
          <div class="cat-row cat-row-archived">
            <span class="tx-ic" aria-hidden="true">${esc(c.icon)}</span>
            <span class="tx-main"><span class="tx-title">${esc(c.name)}</span><span class="tx-meta">${categoryUsage(c.id)} ${plural(categoryUsage(c.id), 'trošak', 'troška', 'troškova')} u istoriji</span></span>
            <button type="button" class="btn btn-sm btn-ghost" data-act="restore-cat" data-id="${esc(c.id)}">Vrati</button>
          </div>`).join('')}
      </section>` : ''}
    <p class="footnote">Kategorija koja već ima troškove ne briše se, nego se arhivira — troškovi ostaju u istoriji i izveštajima.</p>`;
}

export function handleCategoriesClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  if (t.dataset.act === 'edit-cat') openCategoryEditor(t.dataset.id);
  if (t.dataset.act === 'new-cat') openCategoryEditor(null);
  if (t.dataset.act === 'restore-cat') {
    restoreCategory(t.dataset.id).then(() => toast('Kategorija je vraćena'));
  }
}

// =====================================================================================
// Editor kategorije (izmene se primenjuju tek na "Sačuvaj")
// =====================================================================================
export function openCategoryEditor(catId) {
  const cat = catId ? getCategory(catId) : null;
  const draft = {
    name: cat?.name || '',
    icon: cat?.icon || '📁',
    subs: (cat ? subsOf(cat.id, { includeArchived: true }) : []).map((s) => ({ id: s.id, name: s.name, orig: s.name, archived: s.archived, del: false, restore: false })),
    labels: (cat ? labelsOf(cat.id) : []).map((l) => ({ id: l.id, name: l.name, orig: l.name, del: false })),
  };
  const used = cat ? categoryUsage(cat.id) : 0;

  const body = h(`<form class="form" id="cat-form" novalidate autocomplete="off">
      <div class="field">
        <label class="field-label" for="c-name">Naziv</label>
        <div class="name-row">
          <span class="icon-preview" id="c-icon-preview" aria-hidden="true">${esc(draft.icon)}</span>
          <input id="c-name" type="text" maxlength="30" autocapitalize="sentences" value="${esc(draft.name)}" placeholder="npr. Zdravlje">
        </div>
        <p class="field-err" data-err="name" hidden></p>
      </div>
      <div class="field">
        <span class="field-label">Ikonica</span>
        <div class="emoji-grid" id="c-emojis">${EMOJIS.map((em) => `<button type="button" class="emoji-btn ${em === draft.icon ? 'on' : ''}" data-emoji="${em}" aria-label="Ikonica ${em}">${em}</button>`).join('')}</div>
        <label class="inline-input"><span>ili ukucaj svoj emoji</span><input id="c-icon-custom" type="text" maxlength="4" inputmode="text"></label>
      </div>
      <div class="field">
        <span class="field-label">Potkategorije</span>
        <div class="edit-list" id="c-subs"></div>
        <div class="add-row"><input id="c-sub-new" type="text" maxlength="30" placeholder="Nova potkategorija" enterkeyhint="done"><button type="button" class="btn btn-sm btn-ghost" data-add-sub>${ICON.plus}<span>Dodaj</span></button></div>
      </div>
      ${cat ? `<div class="field">
        <span class="field-label">Sačuvane labele</span>
        <div class="edit-list" id="c-labels"></div>
        <p class="hint">Preimenovanje menja labelu i u svim troškovima ove kategorije. Brisanje je samo uklanja iz brzih izbora.</p>
      </div>` : ''}
    </form>`);

  const removeLabelText = used ? 'Arhiviraj' : 'Obriši';
  const foot = h(`<div class="btn-row">
      ${cat && !cat.archived ? `<button type="button" class="btn btn-danger-ghost" data-remove>${used ? ICON.archive : ICON.trash}<span>${removeLabelText}</span></button>` : ''}
      <button type="submit" form="cat-form" class="btn btn-primary btn-grow">Sačuvaj</button>
    </div>`);
  const sheet = openSheet({ title: cat ? `Izmeni: ${cat.name}` : 'Nova kategorija', body, footer: foot, className: 'sheet-tall' });

  const renderSubs = () => {
    const live = draft.subs.filter((s) => !s.del);
    $('#c-subs', body).innerHTML = live.length
      ? draft.subs
          .map((s, i) =>
            s.del
              ? ''
              : `<div class="edit-row ${s.archived && !s.restore ? 'is-archived' : ''}">
                  <input type="text" maxlength="30" value="${esc(s.name)}" data-sub-name="${i}" aria-label="Naziv potkategorije">
                  ${s.archived && !s.restore
                    ? `<button type="button" class="btn btn-sm btn-ghost" data-sub-restore="${i}">Vrati</button>`
                    : `<button type="button" class="icon-btn" data-sub-del="${i}" aria-label="Ukloni potkategoriju">${ICON.trash}</button>`}
                </div>`
          )
          .join('')
      : '<p class="hint">Nema potkategorija.</p>';
  };
  const renderLabels = () => {
    const el = $('#c-labels', body);
    if (!el) return;
    el.innerHTML = draft.labels.some((l) => !l.del)
      ? draft.labels
          .map((l, i) =>
            l.del
              ? ''
              : `<div class="edit-row"><input type="text" maxlength="60" value="${esc(l.name)}" data-label-name="${i}" aria-label="Naziv labele"><button type="button" class="icon-btn" data-label-del="${i}" aria-label="Ukloni labelu">${ICON.trash}</button></div>`
          )
          .join('')
      : '<p class="hint">Labele se pamte same kad ih uneseš uz trošak.</p>';
  };
  renderSubs();
  renderLabels();

  const addSub = () => {
    const inp = $('#c-sub-new', body);
    const name = inp.value.trim();
    if (!name) return;
    if (draft.subs.some((s) => !s.del && norm(s.name) === norm(name))) {
      toast('Ta potkategorija već postoji', { type: 'warn' });
      return;
    }
    draft.subs.push({ id: null, name, orig: null, archived: false, del: false, restore: false });
    inp.value = '';
    renderSubs();
  };

  body.addEventListener('click', async (e) => {
    const em = e.target.closest('[data-emoji]');
    if (em) {
      draft.icon = em.dataset.emoji;
      $('#c-icon-preview', body).textContent = draft.icon;
      $$('[data-emoji]', body).forEach((b) => b.classList.toggle('on', b === em));
      return;
    }
    if (e.target.closest('[data-add-sub]')) return addSub();
    const sd = e.target.closest('[data-sub-del]');
    if (sd) {
      const s = draft.subs[+sd.dataset.subDel];
      const n = s.id ? subcategoryUsage(s.id) : 0;
      if (n > 0) {
        const ok = await confirmDialog({
          title: 'Potkategorija ima troškove',
          message: `„${esc(s.name)}” je korišćena u ${n} ${plural(n, 'trošku', 'troška', 'troškova')}. Biće arhivirana: neće se nuditi pri unosu, ali ostaje u istoriji.`,
          confirmText: 'Arhiviraj',
        });
        if (!ok) return;
      }
      s.del = true;
      renderSubs();
      return;
    }
    const sr = e.target.closest('[data-sub-restore]');
    if (sr) {
      draft.subs[+sr.dataset.subRestore].restore = true;
      renderSubs();
      return;
    }
    const ld = e.target.closest('[data-label-del]');
    if (ld) {
      draft.labels[+ld.dataset.labelDel].del = true;
      renderLabels();
    }
  });
  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.subName != null) draft.subs[+t.dataset.subName].name = t.value;
    if (t.dataset.labelName != null) draft.labels[+t.dataset.labelName].name = t.value;
    if (t.id === 'c-icon-custom' && t.value.trim()) {
      draft.icon = [...t.value.trim()].slice(0, 2).join('');
      $('#c-icon-preview', body).textContent = draft.icon;
      $$('[data-emoji]', body).forEach((b) => b.classList.remove('on'));
    }
    if (t.id === 'c-name') $('[data-err="name"]', body).hidden = true;
  });
  $('#c-sub-new', body).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSub();
    }
  });

  // --- čuvanje
  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#c-name', body).value.trim();
    const err = $('[data-err="name"]', body);
    if (!name) {
      err.textContent = 'Unesi naziv kategorije.';
      err.hidden = false;
      return;
    }
    if (isCategoryNameTaken(name, cat?.id)) {
      err.textContent = 'Kategorija sa tim nazivom već postoji (možda je u arhivi).';
      err.hidden = false;
      return;
    }
    // ako je ostao nedodat tekst u polju za novu potkategoriju, dodaj ga
    if ($('#c-sub-new', body).value.trim()) addSub();

    const saved = await saveCategory({ id: cat?.id, name, icon: draft.icon });
    let archivedSubs = 0;
    for (const s of draft.subs) {
      const nm = s.name.trim();
      if (!s.id) {
        if (!s.del && nm) await saveSubcategory({ categoryId: saved.id, name: nm });
      } else if (s.del) {
        if ((await removeSubcategory(s.id)) === 'archived') archivedSubs++;
      } else if ((nm && nm !== s.orig) || s.restore) {
        await saveSubcategory({ id: s.id, name: nm || s.orig, archived: s.restore ? false : undefined });
      }
    }
    for (const l of draft.labels) {
      if (l.del) await deleteLabel(l.id);
      else if (l.name.trim() && l.name.trim() !== l.orig) await renameLabel(l.id, l.name);
    }
    commit();
    sheet.close();
    toast(cat ? `Kategorija „${name}” je sačuvana${archivedSubs ? ` · ${archivedSubs} potkat. arhivirano` : ''}` : `Dodata kategorija „${name}”`);
  });

  $('[data-remove]', foot)?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: used ? 'Arhiviraj kategoriju?' : 'Obriši kategoriju?',
      message: used
        ? `„${esc(cat.name)}” ima ${used} ${plural(used, 'trošak', 'troška', 'troškova')}, pa se ne briše nego arhivira. Neće se nuditi pri unosu, a troškovi ostaju u istoriji. Možeš je vratiti iz arhive.`
        : `„${esc(cat.name)}” i njene potkategorije i labele biće trajno obrisane.`,
      confirmText: used ? 'Arhiviraj' : 'Obriši',
      danger: !used,
    });
    if (!ok) return;
    const res = await removeCategory(cat.id);
    sheet.close();
    toast(res === 'archived' ? `„${cat.name}” je arhivirana` : `„${cat.name}” je obrisana`);
  });

  if (!cat) setTimeout(() => $('#c-name', body)?.focus({ preventScroll: true }), 50);
}

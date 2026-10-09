// Podešavanja: tema, backup (JSON/CSV), trajno čuvanje, brisanje podataka.
import { state, setSetting, storageKind, wipeAll } from '../store.js';
import { esc, fmtDate, plural } from '../format.js';
import { ICON } from '../icons.js';
import { toast, confirmDialog } from '../ui.js';
import { exportJSON, exportCSV, pickFile, readBackupFile, importData } from '../backup.js';
import { loadDemo } from '../demo.js';
import { rerender } from '../nav.js';

export const APP_VERSION = '1.0.0';
let storageInfo = null; // keš za navigator.storage podatke

async function refreshStorageInfo() {
  const info = { persisted: null, usage: null };
  try {
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted();
    if (navigator.storage?.estimate) info.usage = (await navigator.storage.estimate()).usage;
  } catch {
    /* nije podržano */
  }
  const changed = JSON.stringify(info) !== JSON.stringify(storageInfo);
  storageInfo = info;
  if (changed) rerender();
}

export function renderSettings(head, main) {
  head.className = 'topbar';
  head.innerHTML = `<h1 class="view-title">Podešavanja</h1><p class="view-sub">Podaci se čuvaju samo na ovom uređaju</p>`;
  if (!storageInfo) refreshStorageInfo();

  const theme = state.settings.theme || 'auto';
  const sep = state.settings.csvSep || ';';
  const last = state.settings.lastBackupAt;
  const nExp = state.expenses.length;
  const isEmpty = !nExp && !state.incomes.length && !state.months.size;
  const persisted = storageInfo?.persisted;
  const kb = storageInfo?.usage != null ? Math.max(1, Math.round(storageInfo.usage / 1024)) : null;

  main.innerHTML = `
    <section class="card">
      <div class="card-head"><h3>Izgled</h3></div>
      <div class="setting">
        <span class="setting-label">Tema</span>
        <div class="seg" role="radiogroup" aria-label="Tema">
          ${[['auto', 'Sistem'], ['light', 'Svetla'], ['dark', 'Tamna']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${theme === v}" class="${theme === v ? 'on' : ''}" data-act="theme" data-id="${v}">${l}</button>`).join('')}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Backup podataka</h3></div>
      ${globalThis.__BUDZET_DEMO__ ? '<p class="setting-note"><b>Ovo je pregled na claude.ai:</b> izvoz i uvoz fajlova rade tek u aplikaciji postavljenoj na tvoj sajt (GitHub Pages / Netlify).</p>' : ''}
      <p class="setting-note">${last ? `Poslednji backup: <b>${fmtDate(last.slice(0, 10))}</b>.` : '<b>Backup još nije napravljen.</b>'} Čuvaj JSON fajl u Fajlovima, iCloud-u ili Google Drive-u — sa njim vraćaš sve podatke na novom telefonu.</p>
      <div class="action-list">
        <button type="button" class="action" data-act="export-json">${ICON.download}<span><b>Izvezi backup (JSON)</b><small>svi meseci, troškovi, prilivi, kategorije i labele</small></span></button>
        <button type="button" class="action" data-act="import-json">${ICON.upload}<span><b>Uvezi backup (JSON)</b><small>zamenjuje sve trenutne podatke</small></span></button>
        <button type="button" class="action" data-act="export-csv">${ICON.table}<span><b>Izvezi troškove (CSV za Excel)</b><small>${nExp} ${plural(nExp, 'trošak', 'troška', 'troškova')} · separator „${esc(sep)}”</small></span></button>
      </div>
      <div class="setting">
        <span class="setting-label">CSV separator</span>
        <div class="seg" role="radiogroup" aria-label="CSV separator">
          <button type="button" role="radio" aria-checked="${sep === ';'}" class="${sep === ';' ? 'on' : ''}" data-act="csv-sep" data-id=";">; Excel (srpski)</button>
          <button type="button" role="radio" aria-checked="${sep === ','}" class="${sep === ',' ? 'on' : ''}" data-act="csv-sep" data-id=",">, Excel (engleski)</button>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Skladište</h3></div>
      <dl class="kv">
        <div><dt>Način čuvanja</dt><dd>${esc(storageKind())}</dd></div>
        <div><dt>Trajno čuvanje</dt><dd>${persisted == null ? 'nepoznato' : persisted ? 'uključeno' : 'nije potvrđeno'}</dd></div>
        <div><dt>Zauzeto</dt><dd>${kb == null ? '—' : `${kb} KB`}</dd></div>
        <div><dt>Podaci</dt><dd>${nExp} ${plural(nExp, 'trošak', 'troška', 'troškova')} · ${state.incomes.length} ${plural(state.incomes.length, 'priliv', 'priliva', 'priliva')} · ${state.months.size} ${plural(state.months.size, 'mesec', 'meseca', 'meseci')}</dd></div>
      </dl>
      ${persisted === false ? `<button type="button" class="btn btn-ghost btn-block" data-act="persist">${ICON.shield}<span>Zatraži trajno čuvanje</span></button>` : ''}
      <p class="setting-note">Na iPhone-u koristi aplikaciju sa početnog ekrana — tako iOS ne briše podatke dok je redovno koristiš. Ipak, redovan backup je jedina sigurna zaštita.</p>
    </section>

    <section class="card">
      <div class="card-head"><h3>Primer i brisanje</h3></div>
      <div class="action-list">
        ${isEmpty ? `<button type="button" class="action" data-act="demo">${ICON.bars}<span><b>Učitaj primer podataka</b><small>3 meseca izmišljenih troškova, da isprobaš aplikaciju</small></span></button>` : ''}
        <button type="button" class="action action-danger" data-act="wipe">${ICON.trash}<span><b>Obriši sve podatke</b><small>vraća podrazumevane kategorije · ne može da se poništi</small></span></button>
      </div>
    </section>

    <p class="footnote">Moj Budžet ${APP_VERSION} · radi offline · bez naloga i bez servera</p>`;
}

export async function handleSettingsClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  try {
    if (act === 'theme') await setSetting('theme', t.dataset.id);
    if (act === 'csv-sep') await setSetting('csvSep', t.dataset.id);
    if (act === 'export-json') {
      const r = await exportJSON();
      if (r === 'downloaded') toast('Backup je preuzet');
      if (r === 'shared') toast('Backup je sačuvan');
    }
    if (act === 'export-csv') {
      if (!state.expenses.length) return toast('Nema troškova za izvoz', { type: 'warn' });
      const r = await exportCSV(state.settings.csvSep || ';');
      if (r === 'downloaded') toast('CSV je preuzet');
    }
    if (act === 'import-json') {
      const file = await pickFile();
      if (!file) return;
      const { clean, summary } = await readBackupFile(file);
      const ok = await confirmDialog({
        title: 'Uvezi backup?',
        message: `U fajlu: ${esc(summary)}.<br><br><b>Svi trenutni podaci biće zamenjeni.</b> Ako nisi siguran, prvo izvezi trenutni backup.`,
        confirmText: 'Zameni i uvezi',
        danger: true,
      });
      if (!ok) return;
      await importData(clean);
      toast(`Uvoz završen${clean.skipped ? ` · preskočeno neispravnih: ${clean.skipped}` : ''}`);
    }
    if (act === 'persist') {
      const granted = await navigator.storage?.persist?.();
      toast(granted ? 'Trajno čuvanje je uključeno' : 'Pregledač nije odobrio trajno čuvanje — dodaj aplikaciju na početni ekran', { type: granted ? 'info' : 'warn' });
      refreshStorageInfo();
    }
    if (act === 'demo') {
      await loadDemo();
      toast('Primer podataka je učitan');
      location.hash = 'pregled';
    }
    if (act === 'wipe') {
      const ok = await confirmDialog({
        title: 'Obriši sve podatke?',
        message: `Biće obrisano: ${state.expenses.length} ${plural(state.expenses.length, 'trošak', 'troška', 'troškova')}, ${state.incomes.length} ${plural(state.incomes.length, 'priliv', 'priliva', 'priliva')} i ${state.months.size} ${plural(state.months.size, 'mesec', 'meseca', 'meseci')}. Kategorije se vraćaju na podrazumevane.`,
        confirmText: 'Obriši sve',
        danger: true,
        requireText: 'OBRIŠI',
      });
      if (!ok) return;
      await wipeAll();
      toast('Svi podaci su obrisani');
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Nešto nije uspelo', { type: 'warn', duration: 6000 });
  }
}

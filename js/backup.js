// Backup: izvoz/uvoz svih podataka (JSON) i izvoz troškova za Excel (CSV).
import { state, exportData, validateImport, importData, setSetting, getCategory, getSubcategory } from './store.js';
import { todayISO, fmtDate, monthIdOf, fmtAmount, plural } from './format.js';

/**
 * Na telefonu (iOS/Android) koristi Share sheet → "Sačuvaj u Fajlove" / Drive / mejl.
 * Na računaru klasično preuzimanje fajla.
 */
async function saveFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && typeof File === 'function' && navigator.canShare) {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return 'shared';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancelled';
        // u suprotnom probaj klasično preuzimanje
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

export async function exportJSON() {
  const json = JSON.stringify(exportData(), null, 2);
  const res = await saveFile(`budzet-backup-${todayISO()}.json`, json, 'application/json');
  if (res !== 'cancelled') await setSetting('lastBackupAt', new Date().toISOString());
  return res;
}

/** CSV za Excel: UTF-8 sa BOM (da se vide č, ć, š, ž, đ), iznos kao čist broj. */
export async function exportCSV(sep = ';') {
  const cell = (v) => {
    const s = String(v ?? '');
    return /["\n\r;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['Datum', 'Mesec', 'Kategorija', 'Potkategorija', 'Labela', 'Iznos (RSD)', 'Napomena']];
  [...state.expenses]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''))
    .forEach((e) => {
      rows.push([
        fmtDate(e.date),
        monthIdOf(e.date),
        getCategory(e.categoryId)?.name || '',
        e.subcategoryId ? getSubcategory(e.subcategoryId)?.name || '' : '',
        e.label,
        String(Math.round(e.amount)),
        e.note,
      ]);
    });
  const csv = '﻿' + rows.map((r) => r.map(cell).join(sep)).join('\r\n');
  return saveFile(`budzet-troskovi-${todayISO()}.csv`, csv, 'text/csv');
}

/** Otvara izbor fajla i vraća File (ili null). */
export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] || null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Čita i proverava backup; vraća { clean, summary } ili baca grešku. */
export async function readBackupFile(file) {
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    throw new Error('Fajl nije ispravan JSON.');
  }
  const clean = validateImport(obj);
  const d = clean.data;
  const total = d.expenses.reduce((a, e) => a + e.amount, 0);
  const n = (k, a, b, c) => `${k} ${plural(k, a, b, c)}`;
  const summary = `${n(d.expenses.length, 'trošak', 'troška', 'troškova')} (ukupno ${fmtAmount(total)} RSD), ${n(d.incomes.length, 'priliv', 'priliva', 'priliva')}, ${n(d.months.length, 'mesec', 'meseca', 'meseci')}, ${n(d.categories.length, 'kategorija', 'kategorije', 'kategorija')}${clean.exportedAt ? `; napravljen ${fmtDate(clean.exportedAt.slice(0, 10))}` : ''}`;
  return { clean, summary };
}

export { importData };

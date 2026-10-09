// Stanje aplikacije u memoriji + sve izmene podataka.
// Pri pokretanju se cela baza učita u memoriju (lični budžet = mala količina podataka),
// a svaka izmena se odmah upisuje i u IndexedDB. Posle izmene se obaveštavaju pretplatnici (re-render).
import { openDB, STORES } from './db.js';
import { buildSeed } from './seed.js';
import { uid, norm, isISODate } from './format.js';

export const APP_ID = 'moj-budzet';
export const EXPORT_VERSION = 1;

let db;
export const state = {
  months: new Map(), // id 'YYYY-MM' -> { id, startingBalance, carryOver, createdAt, updatedAt }
  incomes: [], // { id, monthId, amount, date, description, createdAt }
  categories: [], // { id, name, icon, color, order, archived }
  subcategories: [], // { id, categoryId, name, order, archived }
  labels: [], // { id, categoryId, name, useCount, lastUsed, lastSubcategoryId }
  expenses: [], // { id, categoryId, subcategoryId, label, amount, date, note, createdAt, updatedAt }
  settings: {}, // key -> value
};

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn());
}

const nowISO = () => new Date().toISOString();
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'sr');

// ---------------------------------------------------------------- init
export async function initStore() {
  db = await openDB();
  await loadAll();
  if (!state.settings.seeded) {
    const seed = buildSeed();
    await db.putMany('categories', seed.categories);
    await db.putMany('subcategories', seed.subcategories);
    await db.putMany('labels', seed.labels);
    await db.put('settings', { key: 'seeded', value: true });
    await loadAll();
  }
}

async function loadAll() {
  const [months, incomes, categories, subcategories, labels, expenses, settings] = await Promise.all(STORES.map((s) => db.getAll(s)));
  state.months = new Map(months.map((m) => [m.id, m]));
  state.incomes = incomes;
  state.categories = categories.sort(byOrder);
  state.subcategories = subcategories.sort(byOrder);
  state.labels = labels;
  state.expenses = expenses;
  state.settings = Object.fromEntries(settings.map((s) => [s.key, s.value]));
}

export const storageKind = () => db?.kind ?? '—';

// ---------------------------------------------------------------- lookup
export const getCategory = (id) => state.categories.find((c) => c.id === id);
export const getSubcategory = (id) => state.subcategories.find((s) => s.id === id);
export const activeCategories = () => state.categories.filter((c) => !c.archived);
export const subsOf = (catId, { includeArchived = false } = {}) =>
  state.subcategories.filter((s) => s.categoryId === catId && (includeArchived || !s.archived));
export const labelsOf = (catId) =>
  state.labels
    .filter((l) => l.categoryId === catId)
    .sort((a, b) => (b.useCount || 0) - (a.useCount || 0) || (b.lastUsed || '').localeCompare(a.lastUsed || '') || a.name.localeCompare(b.name, 'sr'));
export const categoryUsage = (catId) => state.expenses.filter((e) => e.categoryId === catId).length;
export const subcategoryUsage = (subId) => state.expenses.filter((e) => e.subcategoryId === subId).length;
/** Poslednje uneto početno stanje (predlog za novi mesec). */
export function lastStartingBalance(beforeMonthId) {
  const ids = [...state.months.keys()].filter((id) => !beforeMonthId || id < beforeMonthId).sort();
  const last = ids.length ? state.months.get(ids[ids.length - 1]) : null;
  return last ? last.startingBalance : null;
}

// ---------------------------------------------------------------- settings
export async function setSetting(key, value, { silent = false } = {}) {
  state.settings[key] = value;
  await db.put('settings', { key, value });
  if (!silent) emit();
}

// ---------------------------------------------------------------- months
export async function saveMonth({ id, startingBalance, carryOver }) {
  const prev = state.months.get(id);
  const rec = {
    id,
    startingBalance: Math.round(Number(startingBalance) || 0),
    carryOver: !!carryOver,
    createdAt: prev?.createdAt || nowISO(),
    updatedAt: nowISO(),
  };
  state.months.set(id, rec);
  await db.put('months', rec);
  emit();
  return rec;
}

// ---------------------------------------------------------------- expenses
export async function saveExpense(input) {
  const existing = input.id ? state.expenses.find((e) => e.id === input.id) : null;
  if (!isISODate(input.date)) throw new Error('Neispravan datum.');
  const exp = {
    id: existing?.id || uid(),
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId || null,
    label: (input.label || '').trim(),
    amount: Math.round(Number(input.amount) || 0),
    date: input.date,
    note: (input.note || '').trim(),
    createdAt: existing?.createdAt || nowISO(),
    updatedAt: nowISO(),
  };
  if (existing) state.expenses[state.expenses.indexOf(existing)] = exp;
  else state.expenses.push(exp);
  await db.put('expenses', exp);

  const labelChanged = !existing || norm(existing.label) !== norm(exp.label) || existing.categoryId !== exp.categoryId;
  if (exp.label && labelChanged) await touchLabel(exp.categoryId, exp.label, exp.subcategoryId);
  emit();
  return exp;
}

/** Pamti labelu po kategoriji (za brze izbore) i broji koliko puta je korišćena. */
async function touchLabel(categoryId, name, subcategoryId) {
  const n = norm(name);
  const i = state.labels.findIndex((l) => l.categoryId === categoryId && norm(l.name) === n);
  let label;
  if (i >= 0) {
    const l = state.labels[i];
    label = { ...l, useCount: (l.useCount || 0) + 1, lastUsed: nowISO(), lastSubcategoryId: subcategoryId || l.lastSubcategoryId || null };
    state.labels[i] = label;
  } else {
    label = { id: uid(), categoryId, name: name.trim(), useCount: 1, lastUsed: nowISO(), lastSubcategoryId: subcategoryId || null };
    state.labels.push(label);
  }
  await db.put('labels', label);
}

export async function deleteExpense(id) {
  const exp = state.expenses.find((e) => e.id === id);
  if (!exp) return null;
  state.expenses = state.expenses.filter((e) => e.id !== id);
  await db.del('expenses', id);
  emit();
  return exp;
}
export async function restoreExpense(exp) {
  state.expenses.push(exp);
  await db.put('expenses', exp);
  emit();
}

// ---------------------------------------------------------------- incomes
export async function saveIncome(input) {
  const existing = input.id ? state.incomes.find((x) => x.id === input.id) : null;
  if (!isISODate(input.date)) throw new Error('Neispravan datum.');
  const inc = {
    id: existing?.id || uid(),
    monthId: input.date.slice(0, 7),
    amount: Math.round(Number(input.amount) || 0),
    date: input.date,
    description: (input.description || '').trim(),
    createdAt: existing?.createdAt || nowISO(),
  };
  if (existing) state.incomes[state.incomes.indexOf(existing)] = inc;
  else state.incomes.push(inc);
  await db.put('incomes', inc);
  emit();
  return inc;
}
export async function deleteIncome(id) {
  const inc = state.incomes.find((x) => x.id === id);
  if (!inc) return null;
  state.incomes = state.incomes.filter((x) => x.id !== id);
  await db.del('incomes', id);
  emit();
  return inc;
}
export async function restoreIncome(inc) {
  state.incomes.push(inc);
  await db.put('incomes', inc);
  emit();
}

// ---------------------------------------------------------------- categories
function nextColorSlot() {
  const used = new Set(state.categories.filter((c) => !c.archived).map((c) => c.color));
  for (let i = 0; i < 8; i++) if (!used.has(i)) return i;
  return -1; // više od 8 aktivnih kategorija -> neutralna boja
}

export function isCategoryNameTaken(name, exceptId) {
  const n = norm(name);
  return state.categories.some((c) => c.id !== exceptId && norm(c.name) === n);
}

export async function saveCategory({ id, name, icon }) {
  const existing = id ? getCategory(id) : null;
  const cat = existing
    ? { ...existing, name: name.trim(), icon: icon || existing.icon }
    : {
        id: uid(),
        name: name.trim(),
        icon: icon || '📁',
        color: nextColorSlot(),
        order: Math.max(-1, ...state.categories.map((c) => c.order ?? 0)) + 1,
        archived: false,
        createdAt: nowISO(),
      };
  if (existing) state.categories[state.categories.indexOf(existing)] = cat;
  else state.categories.push(cat);
  state.categories.sort(byOrder);
  await db.put('categories', cat);
  return cat;
}

/** Briše kategoriju; ako ima troškove, samo je arhivira. Vraća 'deleted' | 'archived'. */
export async function removeCategory(id) {
  const cat = getCategory(id);
  if (!cat) return null;
  if (categoryUsage(id) > 0) {
    const upd = { ...cat, archived: true };
    state.categories[state.categories.indexOf(cat)] = upd;
    await db.put('categories', upd);
    emit();
    return 'archived';
  }
  const subIds = state.subcategories.filter((s) => s.categoryId === id).map((s) => s.id);
  const labelIds = state.labels.filter((l) => l.categoryId === id).map((l) => l.id);
  state.categories = state.categories.filter((c) => c.id !== id);
  state.subcategories = state.subcategories.filter((s) => s.categoryId !== id);
  state.labels = state.labels.filter((l) => l.categoryId !== id);
  await db.del('categories', id);
  await db.delMany('subcategories', subIds);
  await db.delMany('labels', labelIds);
  emit();
  return 'deleted';
}

export async function restoreCategory(id) {
  const cat = getCategory(id);
  if (!cat) return;
  const used = new Set(activeCategories().map((c) => c.color));
  const upd = { ...cat, archived: false, color: used.has(cat.color) ? nextColorSlot() : cat.color };
  state.categories[state.categories.indexOf(cat)] = upd;
  await db.put('categories', upd);
  emit();
}

// ---------------------------------------------------------------- subcategories
export async function saveSubcategory({ id, categoryId, name, archived }) {
  const existing = id ? getSubcategory(id) : null;
  const sub = existing
    ? { ...existing, name: name.trim(), archived: archived ?? existing.archived }
    : {
        id: uid(),
        categoryId,
        name: name.trim(),
        order: Math.max(-1, ...subsOf(categoryId, { includeArchived: true }).map((s) => s.order ?? 0)) + 1,
        archived: false,
      };
  if (existing) state.subcategories[state.subcategories.indexOf(existing)] = sub;
  else state.subcategories.push(sub);
  await db.put('subcategories', sub);
  return sub;
}

/** Briše potkategoriju; ako je korišćena u troškovima, arhivira je. */
export async function removeSubcategory(id) {
  const sub = getSubcategory(id);
  if (!sub) return null;
  if (subcategoryUsage(id) > 0) {
    await saveSubcategory({ ...sub, archived: true });
    return 'archived';
  }
  state.subcategories = state.subcategories.filter((s) => s.id !== id);
  state.labels = state.labels.map((l) => (l.lastSubcategoryId === id ? { ...l, lastSubcategoryId: null } : l));
  await db.del('subcategories', id);
  return 'deleted';
}

// ---------------------------------------------------------------- labels
/** Preimenuje labelu i sve troškove te kategorije koji je koriste. Ako novo ime već postoji, labele se spajaju. */
export async function renameLabel(id, newName) {
  const label = state.labels.find((l) => l.id === id);
  const name = newName.trim();
  if (!label || !name) return;
  const oldN = norm(label.name);
  const twin = state.labels.find((l) => l.id !== id && l.categoryId === label.categoryId && norm(l.name) === norm(name));

  const changed = [];
  state.expenses = state.expenses.map((e) => {
    if (e.categoryId === label.categoryId && norm(e.label) === oldN) {
      const upd = { ...e, label: twin ? twin.name : name, updatedAt: nowISO() };
      changed.push(upd);
      return upd;
    }
    return e;
  });
  if (changed.length) await db.putMany('expenses', changed);

  if (twin) {
    const merged = { ...twin, useCount: (twin.useCount || 0) + (label.useCount || 0) };
    state.labels = state.labels.filter((l) => l.id !== id).map((l) => (l.id === twin.id ? merged : l));
    await db.put('labels', merged);
    await db.del('labels', id);
  } else {
    const upd = { ...label, name };
    state.labels = state.labels.map((l) => (l.id === id ? upd : l));
    await db.put('labels', upd);
  }
}

/** Uklanja labelu iz brzih izbora. Postojeći troškovi zadržavaju svoj tekst labele. */
export async function deleteLabel(id) {
  state.labels = state.labels.filter((l) => l.id !== id);
  await db.del('labels', id);
}

/** Posle grupnih izmena kategorija (editor) — jedan re-render. */
export function commit() {
  state.categories.sort(byOrder);
  state.subcategories.sort(byOrder);
  emit();
}

// ---------------------------------------------------------------- backup
export function exportData() {
  return {
    app: APP_ID,
    version: EXPORT_VERSION,
    exportedAt: nowISO(),
    data: {
      months: [...state.months.values()],
      incomes: state.incomes,
      categories: state.categories,
      subcategories: state.subcategories,
      labels: state.labels,
      expenses: state.expenses,
      settings: Object.entries(state.settings)
        .filter(([k]) => !['lastBackupAt', 'backupSnoozeUntil'].includes(k))
        .map(([key, value]) => ({ key, value })),
    },
  };
}

/** Proverava i čisti podatke iz backup fajla. Baca grešku sa porukom za korisnika. */
export function validateImport(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Fajl nije ispravan backup.');
  if (obj.app !== APP_ID || !obj.data) throw new Error('Ovo nije backup ove aplikacije.');
  if (obj.version > EXPORT_VERSION) throw new Error('Backup je napravljen novijom verzijom aplikacije. Prvo ažuriraj aplikaciju.');
  const d = obj.data;
  const arr = (x) => (Array.isArray(x) ? x : []);
  const num = (x) => Math.round(Number(x) || 0);
  const str = (x) => (x == null ? '' : String(x));
  const hasId = (x) => x && typeof x === 'object' && x.id != null;

  const categories = arr(d.categories).filter(hasId).map((c, i) => ({ ...c, id: str(c.id), name: str(c.name) || 'Bez imena', icon: str(c.icon) || '📁', color: Number.isInteger(c.color) ? c.color : -1, order: c.order ?? i, archived: !!c.archived }));
  const catIds = new Set(categories.map((c) => c.id));
  const expenses = arr(d.expenses)
    .filter((e) => hasId(e) && isISODate(e.date) && catIds.has(str(e.categoryId)))
    .map((e) => ({ ...e, id: str(e.id), categoryId: str(e.categoryId), subcategoryId: e.subcategoryId ? str(e.subcategoryId) : null, label: str(e.label), note: str(e.note), amount: num(e.amount) }));
  const skipped = arr(d.expenses).length - expenses.length;

  return {
    data: {
      months: arr(d.months).filter((m) => m && /^\d{4}-\d{2}$/.test(m.id)).map((m) => ({ ...m, startingBalance: num(m.startingBalance), carryOver: !!m.carryOver })),
      incomes: arr(d.incomes).filter((x) => hasId(x) && isISODate(x.date)).map((x) => ({ ...x, id: str(x.id), monthId: x.date.slice(0, 7), amount: num(x.amount), description: str(x.description) })),
      categories,
      subcategories: arr(d.subcategories).filter((s) => hasId(s) && catIds.has(str(s.categoryId))).map((s) => ({ ...s, id: str(s.id), categoryId: str(s.categoryId), name: str(s.name), archived: !!s.archived })),
      labels: arr(d.labels).filter((l) => hasId(l) && catIds.has(str(l.categoryId))).map((l) => ({ ...l, id: str(l.id), categoryId: str(l.categoryId), name: str(l.name) })),
      expenses,
      settings: [...arr(d.settings).filter((s) => s && typeof s.key === 'string' && s.key !== 'seeded'), { key: 'seeded', value: true }],
    },
    exportedAt: obj.exportedAt,
    skipped,
  };
}

export async function importData(clean) {
  await db.replaceAll(clean.data);
  await loadAll();
  emit();
}

/** Briše sve i vraća podrazumevane kategorije. */
export async function wipeAll() {
  const seed = buildSeed();
  await db.replaceAll({ ...seed, settings: [{ key: 'seeded', value: true }, { key: 'theme', value: state.settings.theme || 'auto' }] });
  await loadAll();
  emit();
}

/** Upis unapred pripremljenih podataka (demo). */
export async function bulkInsert({ months = [], incomes = [], expenses = [] }) {
  await db.putMany('months', months);
  await db.putMany('incomes', incomes);
  await db.putMany('expenses', expenses);
  await loadAll();
  emit();
}
export async function touchLabelsFromExpenses(list) {
  for (const e of list) if (e.label) await touchLabel(e.categoryId, e.label, e.subcategoryId);
  emit();
}

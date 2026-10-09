// Čiste funkcije za obračun — ništa se ne čuva ručno, sve se računa iz troškova i priliva.
//
//   početno stanje meseca = uneti iznos (plata) + (prenos ? krajnje stanje prethodnog meseca : 0)
//   krajnje/trenutno stanje = početno stanje + prilivi − troškovi
//
// Prenos je DINAMIČKI: ako izmeniš trošak u septembru, krajnje stanje septembra se menja,
// a time i početno stanje oktobra (i svih narednih meseci sa uključenim prenosom).
// Mesec za koji nije uneto početno stanje (preskočen mesec) ima osnovu 0 i "propušta" ostatak dalje.
import { addMonths, currentMonthId, daysInMonth, monthIdOf, todayISO, norm } from './format.js';

/** Svi meseci od najranijeg sa podacima do max(tekući mesec, najkasniji sa podacima). */
export function monthRange(state) {
  const ids = new Set(state.months.keys());
  for (const e of state.expenses) ids.add(monthIdOf(e.date));
  for (const i of state.incomes) ids.add(monthIdOf(i.date));
  const cur = currentMonthId();
  ids.add(cur);
  const sorted = [...ids].sort();
  const out = [];
  for (let m = sorted[0], guard = 0; m <= sorted[sorted.length - 1] && guard < 1200; m = addMonths(m, 1), guard++) out.push(m);
  return out;
}

/** Map monthId -> obračun meseca. */
export function computeLedger(state) {
  const range = monthRange(state);
  const spentBy = new Map();
  const countBy = new Map();
  const incBy = new Map();
  const incCountBy = new Map();
  for (const e of state.expenses) {
    const m = monthIdOf(e.date);
    spentBy.set(m, (spentBy.get(m) || 0) + e.amount);
    countBy.set(m, (countBy.get(m) || 0) + 1);
  }
  for (const i of state.incomes) {
    const m = monthIdOf(i.date);
    incBy.set(m, (incBy.get(m) || 0) + i.amount);
    incCountBy.set(m, (incCountBy.get(m) || 0) + 1);
  }

  const ledger = new Map();
  let prev = null;
  for (const id of range) {
    const rec = state.months.get(id);
    const base = rec ? Number(rec.startingBalance) || 0 : 0;
    const hasPrev = prev !== null;
    const carryOver = hasPrev && (rec ? !!rec.carryOver : true);
    const carried = carryOver ? prev.end : 0;
    const start = base + carried;
    const incomes = incBy.get(id) || 0;
    const spent = spentBy.get(id) || 0;
    const end = start + incomes - spent;
    const budget = start + incomes;
    const entry = {
      id,
      configured: !!rec,
      base,
      carryOver,
      carried,
      prevId: hasPrev ? prev.id : null,
      prevEnd: hasPrev ? prev.end : null,
      start,
      incomes,
      incomeCount: incCountBy.get(id) || 0,
      spent,
      count: countBy.get(id) || 0,
      end,
      budget,
      pctSpent: budget > 0 ? spent / budget : null,
      hasActivity: !!rec || spent > 0 || incomes > 0,
    };
    ledger.set(id, entry);
    prev = entry;
  }
  return ledger;
}

/** Prosečna dnevna potrošnja i koliko se dnevno sme trošiti do kraja meseca. */
export function dailyStats(entry, today = todayISO()) {
  const cur = monthIdOf(today);
  const dim = daysInMonth(entry.id);
  if (entry.id === cur) {
    const day = Number(today.slice(8, 10));
    const daysLeft = dim - day + 1; // uključujući danas
    return { status: 'current', daysElapsed: day, daysLeft, avg: entry.spent / day, perDay: entry.end > 0 ? entry.end / daysLeft : 0 };
  }
  if (entry.id < cur) return { status: 'past', daysElapsed: dim, daysLeft: 0, avg: entry.spent / dim, perDay: null };
  return { status: 'future', daysElapsed: 0, daysLeft: dim, avg: null, perDay: entry.end > 0 ? entry.end / dim : 0 };
}

export const expensesInMonth = (state, monthId) => state.expenses.filter((e) => monthIdOf(e.date) === monthId);
export const incomesInMonth = (state, monthId) => state.incomes.filter((i) => monthIdOf(i.date) === monthId);

/** Potrošnja po kategorijama za mesec, sa potkategorijama i labelama. Sortirano opadajuće. */
export function categoryBreakdown(state, monthId) {
  const exps = expensesInMonth(state, monthId);
  const total = exps.reduce((a, e) => a + e.amount, 0);
  const byCat = new Map();
  for (const e of exps) {
    if (!byCat.has(e.categoryId)) byCat.set(e.categoryId, { categoryId: e.categoryId, total: 0, count: 0, subs: new Map(), labels: new Map(), items: [] });
    const c = byCat.get(e.categoryId);
    c.total += e.amount;
    c.count++;
    c.items.push(e);
    const sk = e.subcategoryId || '';
    const s = c.subs.get(sk) || { subcategoryId: e.subcategoryId || null, total: 0, count: 0 };
    s.total += e.amount;
    s.count++;
    c.subs.set(sk, s);
    const lk = norm(e.label);
    const l = c.labels.get(lk) || { name: e.label || '', total: 0, count: 0 };
    l.total += e.amount;
    l.count++;
    c.labels.set(lk, l);
  }
  return [...byCat.values()]
    .map((c) => ({
      ...c,
      pct: total > 0 ? c.total / total : 0,
      subs: [...c.subs.values()].sort((a, b) => b.total - a.total),
      labels: [...c.labels.values()].sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

/** Stanje meseca kada bi se dodao/izmenio trošak (za upozorenje pre čuvanja). */
export function previewEnd(state, { id, amount, date, categoryId }) {
  const expenses = state.expenses.filter((e) => e.id !== id).concat([{ id: '__preview', amount, date, categoryId }]);
  const ledger = computeLedger({ ...state, expenses });
  return ledger.get(monthIdOf(date));
}

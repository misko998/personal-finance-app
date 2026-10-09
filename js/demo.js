// Primer podataka (poslednja 3 meseca) — za isprobavanje aplikacije. Briše se u Podešavanjima.
import { state, bulkInsert, touchLabelsFromExpenses, setSetting } from './store.js';
import { addMonths, currentMonthId, daysInMonth, pad2, uid } from './format.js';

// [dan, kategorija, potkategorija, labela, iznos, samo u mesecu (offset) ili null]
const TEMPLATE = [
  [1, 'Računi', 'Kirija', 'Kirija', 35000],
  [2, 'Prodavnice', null, 'Lidl', 4180],
  [3, 'Auto', 'Gorivo', 'NIS', 6500],
  [4, 'Sport', 'Teretana', 'Teretana', 4500],
  [5, 'Prodavnice', null, 'Idea', 1890],
  [7, 'Prodavnice', null, 'Maxi', 3260],
  [8, 'Računi', 'Telefon', 'Račun za telefon', 1800],
  [9, 'Računi', 'Internet', 'SBB', 2990],
  [10, 'Prodavnice', null, 'Lidl', 5420],
  [11, 'Računi', 'Struja', 'EPS', 4830],
  [12, 'Računi', 'Infostan', 'Infostan', 6200],
  [13, 'Auto', 'Pranje', 'Perionica', 800],
  [14, 'Prodavnice', null, 'Idea', 2340],
  [16, 'Auto', 'Gorivo', 'NIS', 6200],
  [17, 'Prodavnice', null, 'Maxi', 4710],
  [18, 'Ostalo', null, 'Poklon', 3000, -2],
  [19, 'Kupovina', 'Odeća', 'Zara', 7990, -2],
  [19, 'Kupovina', 'Tehnika', 'Gigatron', 12990, -1],
  [20, 'Putovanja', 'Smeštaj', 'Booking', 18400, -2],
  [20, 'Putovanja', 'Prevoz', 'Lasta', 4200, -2],
  [21, 'Auto', 'Mali servis', 'Servis Bata', 14500, -1],
  [22, 'Prodavnice', null, 'Lidl', 3870],
  [23, 'Sport', 'Suplementi', 'Proteini', 3200],
  [24, 'Auto', 'Parking', 'Parking servis', 300],
  [25, 'Prodavnice', null, 'Idea', 2150],
  [27, 'Auto', 'Gorivo', 'NIS', 6400],
  [28, 'Prodavnice', null, 'Maxi', 3980],
];

export async function loadDemo() {
  const cur = currentMonthId();
  const today = new Date().getDate();
  const byName = (n) => state.categories.find((c) => c.name === n && !c.archived);
  const subByName = (catId, n) => state.subcategories.find((s) => s.categoryId === catId && s.name === n);
  const now = new Date().toISOString();

  const months = [];
  const incomes = [];
  const expenses = [];
  [-2, -1, 0].forEach((off) => {
    const m = addMonths(cur, off);
    months.push({ id: m, startingBalance: 155000, carryOver: off !== -2, createdAt: now, updatedAt: now });
    const dim = daysInMonth(m);
    TEMPLATE.forEach(([day, catName, subName, label, amount, only], i) => {
      if (only != null && only !== off) return;
      if (off === 0 && day > today) return;
      const cat = byName(catName);
      if (!cat) return;
      const wobble = off === 0 ? 1 : 1 + (((i * 7 + off * 13) % 9) - 4) / 40; // ±10%
      expenses.push({
        id: uid(),
        categoryId: cat.id,
        subcategoryId: subName ? subByName(cat.id, subName)?.id || null : null,
        label,
        amount: Math.round((amount * wobble) / 10) * 10,
        date: `${m}-${pad2(Math.min(day, dim))}`,
        note: '',
        createdAt: now,
        updatedAt: now,
      });
    });
  });
  incomes.push({ id: uid(), monthId: addMonths(cur, -1), amount: 20000, date: `${addMonths(cur, -1)}-15`, description: 'Bonus', createdAt: now });
  if (today >= 6) incomes.push({ id: uid(), monthId: cur, amount: 12000, date: `${cur}-06`, description: 'Honorar', createdAt: now });

  await bulkInsert({ months, incomes, expenses });
  await touchLabelsFromExpenses(expenses);
  await setSetting('demo', true);
}

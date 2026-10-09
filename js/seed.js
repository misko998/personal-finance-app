// Predefinisane kategorije, potkategorije i početne labele.
// Upisuju se samo pri prvom pokretanju (ili posle "Obriši sve podatke").
import { uid } from './format.js';

export const DEFAULT_CATEGORIES = [
  { name: 'Auto', icon: '🚗', subs: ['Gorivo', 'Tehnički pregled', 'Registracija', 'Naplatne rampe', 'Popravke', 'Mali servis', 'Veliki servis', 'Pranje', 'Parking'] },
  { name: 'Prodavnice', icon: '🛒', subs: [], labels: [['Idea'], ['Lidl'], ['Maxi']] },
  { name: 'Računi', icon: '🧾', subs: ['Kirija', 'Struja', 'Voda', 'Telefon', 'Internet', 'Infostan'], labels: [['Kirija', 'Kirija'], ['Račun za telefon', 'Telefon']] },
  { name: 'Kupovina', icon: '🛍️', subs: ['Odeća', 'Tehnika', 'Kuća'] },
  { name: 'Sport', icon: '🏋️', subs: ['Teretana', 'Oprema', 'Suplementi'] },
  { name: 'Putovanja', icon: '✈️', subs: ['Smeštaj', 'Prevoz', 'Hrana', 'Ostalo'] },
  { name: 'Ostalo', icon: '📦', subs: [] },
];

/** Vraća { categories, subcategories, labels } spremne za upis u bazu. */
export function buildSeed() {
  const now = new Date().toISOString();
  const categories = [];
  const subcategories = [];
  const labels = [];

  DEFAULT_CATEGORIES.forEach((c, i) => {
    const cat = { id: uid(), name: c.name, icon: c.icon, color: i, order: i, archived: false, createdAt: now };
    categories.push(cat);
    const subIds = {};
    c.subs.forEach((name, j) => {
      const s = { id: uid(), categoryId: cat.id, name, order: j, archived: false };
      subIds[name] = s.id;
      subcategories.push(s);
    });
    (c.labels || []).forEach(([name, subName]) => {
      labels.push({ id: uid(), categoryId: cat.id, name, useCount: 0, lastUsed: null, lastSubcategoryId: subName ? subIds[subName] : null });
    });
  });
  return { categories, subcategories, labels };
}

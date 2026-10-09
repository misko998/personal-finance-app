// Stanje interfejsa (izabrani mesec, filteri) i navigacija između ekrana.
import { currentMonthId } from './format.js';

export const ROUTES = ['pregled', 'istorija', 'kategorije', 'podesavanja'];

export const uiState = {
  month: currentMonthId(), // mesec prikazan na Pregledu
  filterCat: null, // filter liste troškova po kategoriji
  listTab: 'exp', // 'exp' | 'inc'
  sortDesc: true, // najnovije prvo
  histSel: null, // izabrani bar u istoriji
  scrollTo: null, // id elementa do kog treba skrolovati posle rendera
};

let renderer = () => {};
export const setRenderer = (fn) => (renderer = fn);
export const rerender = () => renderer();

export function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(r) ? r : 'pregled';
}

export function navigate(route) {
  if (currentRoute() === route && location.hash) rerender();
  else location.hash = route;
}

export function goToMonth(id, { scrollTo = null } = {}) {
  if (uiState.month !== id) uiState.filterCat = null;
  uiState.month = id;
  uiState.scrollTo = scrollTo;
  navigate('pregled');
}

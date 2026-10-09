// Ulazna tačka: učitavanje podataka, ruter (#pregled, #istorija, #kategorije, #podesavanja),
// prompt za novi mesec, service worker (offline + obaveštenje o novoj verziji).
import { initStore, state, onChange, setSetting } from './store.js';
import { currentMonthId } from './format.js';
import { initViewportFix, applyTheme, toast, hasOpenSheet } from './ui.js';
import { uiState, setRenderer, currentRoute } from './nav.js';
import { renderDashboard, handleDashboardClick } from './views/dashboard.js';
import { renderHistory, handleHistoryClick } from './views/history.js';
import { renderCategories, handleCategoriesClick } from './views/categories.js';
import { renderSettings, handleSettingsClick } from './views/settings.js';
import { openEntrySheet, openMonthSetup } from './forms.js';
import { loadDemo } from './demo.js';

const VIEWS = {
  pregled: { render: renderDashboard, click: handleDashboardClick },
  istorija: { render: renderHistory, click: handleHistoryClick },
  kategorije: { render: renderCategories, click: handleCategoriesClick },
  podesavanja: { render: renderSettings, click: handleSettingsClick },
};

const head = document.getElementById('topbar');
const main = document.getElementById('view');
let lastRoute = null;
let appliedTheme = null;
let lastMonthSeen = currentMonthId();
let promptedFor = null;

function render() {
  const route = currentRoute();
  const theme = state.settings.theme || 'auto';
  if (theme !== appliedTheme) {
    applyTheme(theme);
    appliedTheme = theme;
  }
  document.querySelectorAll('.tab[data-route]').forEach((t) => {
    const on = t.dataset.route === route;
    t.classList.toggle('on', on);
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  VIEWS[route].render(head, main);
  if (route !== lastRoute) window.scrollTo(0, 0);
  lastRoute = route;
}

/** Na početku novog meseca pita za početno stanje (jednom po sesiji). */
function checkNewMonth() {
  const cur = currentMonthId();
  if (cur !== lastMonthSeen) {
    // aplikacija je bila otvorena preko ponoći na prelazu meseca
    if (uiState.month === lastMonthSeen) uiState.month = cur;
    lastMonthSeen = cur;
    render();
  }
  if (state.months.has(cur) || promptedFor === cur || hasOpenSheet()) return;
  promptedFor = cur;
  const isFirst = state.months.size === 0 && state.expenses.length === 0 && state.incomes.length === 0;
  openMonthSetup(cur, { isNew: true, isFirst });
}

function registerSW() {
  if (!('serviceWorker' in navigator) || globalThis.__BUDZET_DEMO__) return;
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!secure) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const notify = (worker) =>
        toast('Dostupna je nova verzija aplikacije', { actionText: 'Osveži', duration: 30000, onAction: () => worker.postMessage('SKIP_WAITING') });
      if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) notify(w);
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch((err) => console.warn('Service worker nije registrovan:', err));
}

function requestPersistence() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!standalone || !navigator.storage?.persist) return;
  navigator.storage
    .persisted()
    .then((p) => p || navigator.storage.persist())
    .catch(() => {});
}

async function start() {
  initViewportFix();
  try {
    await initStore();
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="fatal"><h2>Podaci ne mogu da se učitaju</h2><p>Pregledač ne dozvoljava lokalno čuvanje (možda je uključen privatni režim). Otvori aplikaciju u običnom režimu.</p><pre>${String(err?.message || err)}</pre></div>`;
    return;
  }

  // Pregled (demo verzija) — učitaj primer podataka pri prvom otvaranju
  if (globalThis.__BUDZET_DEMO__ && !state.settings.demoOffered && !state.expenses.length) {
    await loadDemo();
    await setSetting('demoOffered', true, { silent: true });
  }

  setRenderer(render);
  onChange(render);
  window.addEventListener('hashchange', render);
  head.addEventListener('click', (e) => VIEWS[currentRoute()].click(e));
  main.addEventListener('click', (e) => VIEWS[currentRoute()].click(e));
  document.getElementById('fab').addEventListener('click', () => openEntrySheet());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkNewMonth();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(state.settings.theme || 'auto'));

  render();
  document.body.classList.add('ready');
  checkNewMonth();
  registerSW();
  requestPersistence();
}

start();

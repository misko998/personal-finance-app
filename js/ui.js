// UI pomoćnici: bottom sheet, potvrda, toast, polje za iznos i datum.
import { esc, norm, fmtAmount, parseAmount, fmtDateLong, todayISO, yesterdayISO } from './format.js';
import { ICON } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** HTML string -> prvi element */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------- visual viewport (iOS tastatura)
// Sheet se drži unutar vidljivog dela ekrana, pa je dugme "Sačuvaj" iznad tastature.
export function initViewportFix() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const upd = () => {
    root.style.setProperty('--vvh', `${vv.height}px`);
    root.style.setProperty('--vvtop', `${vv.offsetTop}px`);
  };
  vv.addEventListener('resize', upd);
  vv.addEventListener('scroll', upd);
  upd();
}

// ------------------------------------------------------------- bottom sheet
const stack = [];

export function openSheet({ title, body = '', footer = '', onClose, className = '' }) {
  const root = document.getElementById('sheet-root');
  const wrap = h(`
    <div class="sheet-wrap" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-backdrop" data-close></div>
      <section class="sheet ${className}">
        <header class="sheet-head">
          <span class="sheet-grabber" aria-hidden="true"></span>
          <h2 class="sheet-title">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Zatvori">${ICON.close}</button>
        </header>
        <div class="sheet-body"></div>
        <footer class="sheet-foot"></footer>
      </section>
    </div>`);
  const api = {
    el: wrap,
    body: $('.sheet-body', wrap),
    foot: $('.sheet-foot', wrap),
    setTitle(t) {
      $('.sheet-title', wrap).textContent = t;
    },
    setBody(content) {
      setContent(api.body, content);
    },
    setFooter(content) {
      setContent(api.foot, content);
      api.foot.hidden = !content;
    },
    close(result) {
      if (api.closed) return;
      api.closed = true;
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.classList.remove('has-sheet');
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), reduceMotion() ? 0 : 220);
      onClose?.(result);
    },
  };
  api.setBody(body);
  api.setFooter(footer);
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) api.close();
  });
  root.appendChild(wrap);
  stack.push(api);
  document.body.classList.add('has-sheet');
  // force reflow, pa animacija
  void wrap.offsetHeight;
  wrap.classList.add('open');
  return api;
}

function setContent(el, content) {
  el.replaceChildren();
  if (content == null || content === '') return;
  if (typeof content === 'string') el.innerHTML = content;
  else el.append(content);
}

export function closeAllSheets() {
  [...stack].reverse().forEach((s) => s.close());
}
export const hasOpenSheet = () => stack.length > 0;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close();
});

// ------------------------------------------------------------- potvrda (umesto window.confirm)
export function confirmDialog({ title, message, confirmText = 'Potvrdi', cancelText = 'Otkaži', danger = false, requireText = null }) {
  return new Promise((resolve) => {
    let ok = false;
    const body = h(`<div class="confirm">
        <p>${message}</p>
        ${requireText ? `<label class="field"><span>Upiši <b>${esc(requireText)}</b> za potvrdu</span><input id="confirm-text" type="text" autocomplete="off" autocapitalize="characters"></label>` : ''}
      </div>`);
    const foot = h(`<div class="btn-row">
        <button type="button" class="btn btn-ghost" data-close>${esc(cancelText)}</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok ${requireText ? 'disabled' : ''}>${esc(confirmText)}</button>
      </div>`);
    const sheet = openSheet({ title, body, footer: foot, className: 'sheet-compact', onClose: () => resolve(ok) });
    const okBtn = $('[data-ok]', foot);
    if (requireText) {
      const inp = $('#confirm-text', body);
      inp.addEventListener('input', () => (okBtn.disabled = norm(inp.value) !== norm(requireText)));
    }
    okBtn.addEventListener('click', () => {
      ok = true;
      sheet.close();
    });
  });
}

// ------------------------------------------------------------- toast
let toastTimer;
export function toast(message, { type = 'info', actionText, onAction, duration = 3800 } = {}) {
  const root = document.getElementById('toast-root');
  clearTimeout(toastTimer);
  root.replaceChildren();
  const el = h(`<div class="toast toast-${type}" role="status">
      ${type === 'warn' ? ICON.warn : ''}
      <span class="toast-msg">${esc(message)}</span>
      ${actionText ? `<button type="button" class="toast-action">${esc(actionText)}</button>` : ''}
    </div>`);
  root.append(el);
  void el.offsetHeight;
  el.classList.add('show');
  const hide = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  };
  if (actionText) {
    $('.toast-action', el).addEventListener('click', () => {
      hide();
      onAction?.();
    });
  }
  toastTimer = setTimeout(hide, duration);
}

// ------------------------------------------------------------- polje za iznos (155.000 dok kucaš)
export function bindAmountInput(input, onChange) {
  const fmt = () => {
    const v = parseAmount(input.value);
    input.value = v ? fmtAmount(v) : '';
    onChange?.(v);
  };
  input.addEventListener('input', fmt);
  if (input.value) input.value = fmtAmount(parseAmount(input.value));
  return () => parseAmount(input.value);
}

// ------------------------------------------------------------- polje za datum (prikaz dd.MM.yyyy)
// Prikazuje se naš format, a ispod je providni <input type="date"> koji otvara sistemski birač.
export function dateFieldHTML(id, value) {
  return `
    <div class="date-row">
      <label class="date-field" for="${id}">
        ${ICON.calendar}
        <span class="date-display" data-date-display>${fmtDateLong(value)}</span>
        <input id="${id}" type="date" value="${value}" min="2000-01-01" max="2099-12-31" required>
      </label>
      <div class="date-quick">
        <button type="button" class="chip chip-sm" data-date-set="${todayISO()}">Danas</button>
        <button type="button" class="chip chip-sm" data-date-set="${yesterdayISO()}">Juče</button>
      </div>
    </div>`;
}
export function bindDateField(root, id, onChange) {
  const input = $(`#${id}`, root);
  const display = $('[data-date-display]', root);
  const sync = () => {
    if (!input.value) input.value = todayISO();
    display.textContent = fmtDateLong(input.value);
    $$('[data-date-set]', root).forEach((b) => b.classList.toggle('on', b.dataset.dateSet === input.value));
    onChange?.(input.value);
  };
  input.addEventListener('change', sync);
  input.addEventListener('input', sync);
  input.addEventListener('click', () => {
    try {
      input.showPicker?.();
    } catch {
      /* neki pregledači ne dozvoljavaju */
    }
  });
  $$('[data-date-set]', root).forEach((b) =>
    b.addEventListener('click', () => {
      input.value = b.dataset.dateSet;
      sync();
    })
  );
  sync();
  return () => input.value;
}

// ------------------------------------------------------------- tema
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else if (root.dataset.themeByApp) delete root.dataset.theme;
  if (theme === 'light' || theme === 'dark') root.dataset.themeByApp = '1';
  else delete root.dataset.themeByApp;
  // boja status bara / adrese prati traku na vrhu
  requestAnimationFrame(() => {
    const band = getComputedStyle(root).getPropertyValue('--band').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (theme === 'auto') m.setAttribute('content', m.dataset.default || m.getAttribute('content'));
      else {
        m.dataset.default ??= m.getAttribute('content');
        m.setAttribute('content', band);
      }
    });
  });
}

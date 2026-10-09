// Formatiranje iznosa, datuma i meseci + sitne pomoćne funkcije.
// Sve je lokalno (bez Intl) da bi format bio isti na svakom uređaju:
// iznos 155.000, datum dd.MM.yyyy, mesec "Oktobar 2026".

export const MONTH_NAMES = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
// Genitiv: "ostatak iz septembra"
export const MONTH_GEN = ['januara', 'februara', 'marta', 'aprila', 'maja', 'juna', 'jula', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'];
export const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];
export const DAY_NAMES = ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota'];

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const pad2 = (n) => String(n).padStart(2, '0');

/** 155000 -> "155.000", -2300 -> "−2.300" */
export function fmtAmount(n) {
  const v = Math.round(Number(n) || 0);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '−' : '') + s;
}
export const fmtRSD = (n) => `${fmtAmount(n)} RSD`;
/** +2.300 / −2.300 / 0 */
export const fmtSigned = (n) => (Math.round(n) > 0 ? '+' : '') + fmtAmount(n);

/** "155.000" ili "155000 RSD" -> 155000 (samo celi dinari) */
export function parseAmount(str) {
  const digits = String(str ?? '').replace(/\D/g, '').slice(0, 10);
  return digits ? parseInt(digits, 10) : 0;
}

export function fmtPct(x) {
  if (x == null || !isFinite(x)) return '—';
  const p = x * 100;
  if (p > 0 && p < 1) return '<1%';
  return `${Math.round(p)}%`;
}

// ---------- Datumi (čuvaju se kao 'YYYY-MM-DD', u lokalnom vremenu) ----------
export const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayISO = () => toISODate(new Date());
export function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}
export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseISODate(s));

/** '2026-10-09' -> '09.10.2026' */
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}
/** '2026-10-09' -> 'Petak, 09.10.2026' */
export function fmtDateLong(iso) {
  return `${cap(DAY_NAMES[parseISODate(iso).getDay()])}, ${fmtDate(iso)}`;
}

// ---------- Meseci (id = 'YYYY-MM') ----------
export const monthIdOf = (iso) => iso.slice(0, 7);
export const currentMonthId = () => todayISO().slice(0, 7);

export function addMonths(id, delta) {
  let [y, m] = id.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  y = Math.floor(total / 12);
  m = (total % 12) + 1;
  return `${y}-${pad2(m)}`;
}
const monthIndex = (id) => Number(id.slice(5, 7)) - 1;
const monthYear = (id) => id.slice(0, 4);

/** 'Oktobar 2026' */
export const monthLabel = (id) => `${cap(MONTH_NAMES[monthIndex(id)])} ${monthYear(id)}`;
/** 'oktobar' */
export const monthName = (id) => MONTH_NAMES[monthIndex(id)];
/** 'septembra' */
export const monthGen = (id) => MONTH_GEN[monthIndex(id)];
/** 'okt' */
export const monthShort = (id) => MONTH_SHORT[monthIndex(id)];

export function daysInMonth(id) {
  const [y, m] = id.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export const firstDayOf = (id) => `${id}-01`;
export const lastDayOf = (id) => `${id}-${pad2(daysInMonth(id))}`;

// ---------- Tekst ----------
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/** Normalizacija za poređenje/pretragu: mala slova, bez dijakritika (č→c, đ→dj). */
export function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/** Srpska množina: plural(1,'trošak','troška','troškova') */
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (b === 1 && a !== 11) return one;
  if (b >= 2 && b <= 4 && (a < 12 || a > 14)) return few;
  return many;
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

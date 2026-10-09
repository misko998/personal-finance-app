// SVG grafikoni bez biblioteka: donut (potrošnja po kategorijama) i bar (potrošnja po mesecima).
// Boje dolaze iz CSS promenljivih (--c0..--c7), pa automatski prate svetlu/tamnu temu.
import { esc, fmtAmount, fmtRSD, fmtPct } from './format.js';

export const catColor = (slot) => (slot >= 0 && slot < 8 ? `var(--c${slot})` : 'var(--c-other)');

/**
 * segs: [{ id, name, value, color }]
 * Segmenti su kružnice sa stroke-dasharray; razmak od 2px između segmenata.
 */
export function donutSVG(segs, { size = 200, stroke = 26, gap = 2, title = '', value = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const total = segs.reduce((a, s) => a + s.value, 0);
  let marks = '';
  if (total <= 0) {
    marks = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" style="stroke:var(--surface-2)" stroke-width="${stroke}"/>`;
  } else {
    let offset = 0;
    const g = segs.length > 1 ? gap : 0;
    for (const s of segs) {
      const len = (s.value / total) * c;
      const dash = Math.max(len - g, 0.75);
      marks += `<circle class="donut-seg" data-act="open-cat" data-id="${esc(s.id)}" cx="${cx}" cy="${cx}" r="${r}" fill="none"
        style="stroke:${s.color}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cx})"><title>${esc(s.name)}: ${fmtRSD(s.value)} (${fmtPct(s.value / total)})</title></circle>`;
      offset += len;
    }
  }
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(title)} ${esc(value)}">
    ${marks}
    <text x="${cx}" y="${cx - 8}" text-anchor="middle" class="donut-t1">${esc(title)}</text>
    <text x="${cx}" y="${cx + 18}" text-anchor="middle" class="donut-t2">${esc(value)}</text>
  </svg>`;
}

function niceStep(max, ticks = 3) {
  if (max <= 0) return 1000;
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Putanja bara sa zaobljenim gornjim uglovima (4px), oslonjenog na osnovnu liniju. */
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * items: [{ id, label, sub, value, current }]  — jedna serija (potrošnja), jedna osa.
 * selectedId: bar sa istaknutom vrednošću.
 */
export function barChartSVG(items, { width = 340, height = 200, selectedId = null } = {}) {
  const padL = 46, padR = 6, padT = 24, padB = 36;
  const plotW = Math.max(width - padL - padR, 40);
  const plotH = height - padT - padB;
  const max = Math.max(0, ...items.map((i) => i.value));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const slot = plotW / Math.max(items.length, 1);
  const barW = Math.min(28, slot * 0.62);
  const y = (v) => padT + plotH - (v / top) * plotH;

  let grid = '';
  for (let v = 0; v <= top + 0.5; v += step) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${padL}" x2="${width - padR}" y1="${yy}" y2="${yy}" class="${v === 0 ? 'axis' : 'grid'}"/>`;
    grid += `<text x="${padL - 6}" y="${yy}" dy="0.32em" text-anchor="end" class="tick">${fmtAmount(v)}</text>`;
  }

  let bars = '';
  items.forEach((it, i) => {
    const cx = padL + slot * i + slot / 2;
    const bx = cx - barW / 2;
    const by = y(it.value);
    const bh = padT + plotH - by;
    const sel = it.id === selectedId;
    bars += `<g class="bar-g ${sel ? 'sel' : ''} ${it.current ? 'cur' : ''}" data-act="sel-bar" data-id="${esc(it.id)}">
      <rect x="${(padL + slot * i).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${plotH + padB}" class="hit"/>
      <path d="${barPath(bx, by, barW, bh)}" class="bar"/>
      <text x="${cx.toFixed(1)}" y="${height - padB + 16}" text-anchor="middle" class="xlab">${esc(it.label)}</text>
      ${it.sub ? `<text x="${cx.toFixed(1)}" y="${height - padB + 29}" text-anchor="middle" class="xsub">${esc(it.sub)}</text>` : ''}
      ${sel ? `<text x="${cx.toFixed(1)}" y="${(by - 7).toFixed(1)}" text-anchor="middle" class="vlab">${fmtAmount(it.value)}</text>` : ''}
      <title>${esc(it.title || it.label)}: ${fmtRSD(it.value)}</title>
    </g>`;
  });

  return `<svg class="barchart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Potrošnja po mesecima">${grid}${bars}</svg>`;
}

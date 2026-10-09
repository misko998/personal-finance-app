// Istorija meseci: poređenje potrošnje (bar chart) + lista svih meseci.
import { state } from '../store.js';
import { computeLedger } from '../calc.js';
import { fmtAmount, fmtRSD, fmtSigned, monthLabel, monthShort, currentMonthId, plural } from '../format.js';
import { barChartSVG } from '../charts.js';
import { ICON } from '../icons.js';
import { uiState, goToMonth, rerender } from '../nav.js';

const CHART_MONTHS = 12;

export function renderHistory(head, main) {
  const ledger = computeLedger(state);
  const cur = currentMonthId();
  const all = [...ledger.values()].filter((r) => r.id <= cur || r.hasActivity);
  const chartRows = all.slice(-CHART_MONTHS);
  const withSpend = chartRows.filter((r) => r.spent > 0);
  const total = chartRows.reduce((a, r) => a + r.spent, 0);
  const closed = chartRows.filter((r) => r.id < cur && r.spent > 0);
  const avg = closed.length ? closed.reduce((a, r) => a + r.spent, 0) / closed.length : 0;

  head.className = 'topbar';
  head.innerHTML = `
    <h1 class="view-title">Istorija</h1>
    <div class="band-stats">
      <div><span>Potrošeno · ${chartRows.length} ${plural(chartRows.length, 'mesec', 'meseca', 'meseci')}</span><b class="num">${fmtAmount(total)}</b></div>
      <div><span>Prosek završenih meseci</span><b class="num">${closed.length ? fmtAmount(avg) : '—'}</b></div>
    </div>`;

  if (!uiState.histSel || !chartRows.some((r) => r.id === uiState.histSel)) uiState.histSel = chartRows.length ? chartRows[chartRows.length - 1].id : null;
  const sel = ledger.get(uiState.histSel);
  // širina = view (bez 2×16px paddinga) − card padding (2×16px) − ivice
  const width = Math.round(Math.min(Math.max((main.clientWidth || 390) - 66, 280), 700));
  const items = chartRows.map((r, i) => ({
    id: r.id,
    label: monthShort(r.id),
    sub: i === 0 || r.id.endsWith('-01') ? `’${r.id.slice(2, 4)}` : '',
    value: r.spent,
    current: r.id === cur,
    title: monthLabel(r.id),
  }));

  const chart = `
    <section class="card">
      <div class="card-head"><h3>Potrošnja po mesecima</h3><span class="card-note">dodirni stubac</span></div>
      ${withSpend.length
        ? `<div class="chart-caption">${sel ? `<b>${monthLabel(sel.id)}</b><span class="num">${fmtRSD(sel.spent)}</span>${avg && sel.spent ? `<span class="muted">${fmtSigned(Math.round((sel.spent / avg - 1) * 100))}% u odnosu na prosek</span>` : ''}` : ''}</div>
           <div class="chart-scroll">${barChartSVG(items, { width, height: 210, selectedId: uiState.histSel })}</div>`
        : `<div class="empty"><div class="empty-ic">${ICON.bars}</div><p>Grafikon se pojavljuje kad uneseš prve troškove.</p></div>`}
    </section>`;

  const rows = [...all].reverse();
  const list = `
    <section class="card">
      <div class="card-head"><h3>Svi meseci</h3></div>
      <div class="month-rows">
        ${rows
          .map(
            (r) => `
          <button type="button" class="month-row" data-act="go-month" data-id="${r.id}">
            <div class="mr-top">
              <b>${monthLabel(r.id)}</b>
              ${r.id === cur ? '<span class="pill pill-soft">tekući</span>' : ''}
              ${!r.configured ? '<span class="pill pill-muted">početno stanje nije uneto</span>' : ''}
              ${ICON.chevron}
            </div>
            <div class="mr-grid">
              <div><span>Početno</span><b class="num">${fmtAmount(r.start)}</b></div>
              <div><span>Potrošeno</span><b class="num">${fmtAmount(r.spent)}</b></div>
              <div><span>${r.id === cur ? 'Trenutno' : 'Krajnje'}</span><b class="num ${r.end < 0 ? 'neg' : ''}">${fmtAmount(r.end)}</b></div>
            </div>
            ${r.incomes || r.carried ? `<div class="mr-note">${[r.carried ? `prenos ${fmtSigned(r.carried)}` : '', r.incomes ? `prilivi +${fmtAmount(r.incomes)}` : ''].filter(Boolean).join(' · ')}</div>` : ''}
          </button>`
          )
          .join('')}
      </div>
    </section>`;

  main.innerHTML = chart + list;
}

export function handleHistoryClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  if (t.dataset.act === 'go-month') goToMonth(t.dataset.id);
  if (t.dataset.act === 'sel-bar') {
    uiState.histSel = t.dataset.id;
    rerender();
  }
}

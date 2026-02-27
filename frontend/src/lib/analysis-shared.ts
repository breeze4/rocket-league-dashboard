import { css, html, type TemplateResult } from 'lit';
import type { ScorelineRoleStats } from './api.js';

// --- Types ---

export type SortKey = 'score' | 'games' | 'date' | 'pbb' | 'spd' | 'dist';
export type SortDir = 'asc' | 'desc';

export interface BarRow {
  me: ScorelineRoleStats;
  teammates: ScorelineRoleStats | null;
  opponents: ScorelineRoleStats;
}

export type StatRanges = Record<'pbb' | 'spd' | 'dist', { min: number; max: number }>;

// --- Shared CSS ---

export const analysisStyles = css`
  :host {
    display: block;
    background: #2a2a2e;
    padding: 1rem;
    border-radius: 8px;
  }

  .error { color: #ef4444; margin-bottom: 1rem; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 1.15rem;
    table-layout: fixed;
  }

  thead th {
    color: #a1a1aa;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.98rem;
    letter-spacing: 0.04em;
    padding: 0.4rem 0.5rem;
    text-align: right;
    border-bottom: 2px solid #27272a;
  }

  thead th.left { text-align: left; }

  thead th.sortable {
    cursor: pointer;
    user-select: none;
  }

  thead th.sortable:hover {
    color: #fafafa;
  }

  thead th.sorted {
    color: #3b82f6;
  }

  .sort-arrow {
    font-size: 0.84rem;
    margin-left: 0.15rem;
  }

  tbody td {
    padding: 0.35rem 0.5rem;
    text-align: right;
    color: #a1a1aa;
    border-bottom: 1px solid #27272a;
  }

  tbody td.left { text-align: left; }

  tbody td.score {
    font-weight: 700;
    color: #fafafa;
    text-align: left;
  }

  tbody td.games {
    color: #71717a;
  }

  tr.win { border-left: 3px solid #4ade80; }
  tr.loss { border-left: 3px solid #ef4444; }
  tr.draw { border-left: 3px solid #52525b; }

  tr.win td:first-child { color: #4ade80; }
  tr.loss td:first-child { color: #fca5a5; }

  .empty {
    color: #71717a;
    text-align: center;
    padding: 2rem;
  }

  .mode-bar {
    display: flex;
    gap: 0;
    margin-bottom: 1rem;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    overflow: hidden;
    width: fit-content;
  }

  .mode-btn {
    padding: 0.4rem 1rem;
    background: transparent;
    border: none;
    color: #a1a1aa;
    font-size: 1.12rem;
    font-weight: 600;
    cursor: pointer;
    border-right: 1px solid #3f3f46;
  }

  .mode-btn:last-child { border-right: none; }
  .mode-btn:hover { background: #27272a; }

  .mode-btn.active {
    background: #3b82f6;
    color: #fafafa;
  }

  .filter-bar {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    align-items: center;
  }

  .filter-bar label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: #a1a1aa;
    font-size: 0.95rem;
    cursor: pointer;
    user-select: none;
  }

  .filter-bar input[type="checkbox"] {
    accent-color: #3b82f6;
    width: 15px;
    height: 15px;
    cursor: pointer;
  }

  /* Vertical bar chart cells */
  thead th.bar-header {
    text-align: center;
    border-left: 2px solid #27272a;
  }

  td.bar-cell {
    padding: 0.25rem 0.6rem;
    text-align: center;
    border-left: 2px solid #27272a;
  }

  .bar-group {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 67px;
  }

  .bar {
    flex: 1;
    border-radius: 3px 3px 0 0;
    min-height: 28px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    padding-bottom: 2px;
    box-sizing: border-box;
  }

  .bar-lbl {
    font-size: 0.98rem;
    font-weight: 600;
    color: rgba(255,255,255,0.45);
    line-height: 1;
  }

  .bar-val {
    font-size: 1.19rem;
    font-weight: 700;
    color: rgba(255,255,255,0.85);
    line-height: 1;
  }
`;

// --- Shared functions ---

/** Map 0-1 normalized rank to muted green→amber→red for dark background */
export function rankColor(t: number, alpha: number): string {
  t = Math.max(0, Math.min(1, t));
  const r = t < 0.5 ? Math.round(45 + 120 * (t / 0.5)) : Math.round(165 + 30 * ((t - 0.5) / 0.5));
  const g = t < 0.5 ? Math.round(120 + 20 * (t / 0.5)) : Math.round(140 - 80 * ((t - 0.5) / 0.5));
  const b = t < 0.5 ? Math.round(45 - 10 * (t / 0.5)) : Math.round(35 - 5 * ((t - 0.5) / 0.5));
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Compute global min/max for each stat across all rows and all roles */
export function computeGlobalRanges(rows: BarRow[]): StatRanges {
  const pbb: number[] = [];
  const spd: number[] = [];
  const dist: number[] = [];
  for (const row of rows) {
    const roles = row.teammates
      ? [row.me, row.teammates, row.opponents]
      : [row.me, row.opponents];
    for (const r of roles) {
      if (r.percent_behind_ball > 0) pbb.push(r.percent_behind_ball);
      if (r.avg_speed > 0) spd.push(r.avg_speed);
      if (r.avg_distance_to_ball > 0) dist.push(r.avg_distance_to_ball);
    }
  }
  const range = (vals: number[]) => vals.length
    ? { min: Math.min(...vals), max: Math.max(...vals) }
    : { min: 0, max: 1 };
  return { pbb: range(pbb), spd: range(spd), dist: range(dist) };
}

/** Render a bar-chart cell for a row and stat */
export function renderBarCell(row: BarRow, stat: 'pbb' | 'spd' | 'dist', globalRanges: StatRanges): TemplateResult {
  const hasTm = row.teammates != null;
  let meVal: number, tmVal: number, oppVal: number;
  let fmt: (v: number) => string;
  let invert = false;
  let alpha = 0.45;

  switch (stat) {
    case 'pbb':
      meVal = row.me.percent_behind_ball;
      tmVal = hasTm ? row.teammates!.percent_behind_ball : 0;
      oppVal = row.opponents.percent_behind_ball;
      fmt = (v) => v === 0 ? '-' : Math.round(v) + '%';
      invert = true;
      alpha = 1;
      break;
    case 'spd':
      meVal = row.me.avg_speed;
      tmVal = hasTm ? row.teammates!.avg_speed : 0;
      oppVal = row.opponents.avg_speed;
      fmt = (v) => v === 0 ? '-' : Math.round(v).toString();
      break;
    case 'dist':
      meVal = row.me.avg_distance_to_ball;
      tmVal = hasTm ? row.teammates!.avg_distance_to_ball : 0;
      oppVal = row.opponents.avg_distance_to_ball;
      fmt = (v) => v === 0 ? '-' : Math.round(v).toString();
      break;
  }

  const vals = hasTm ? [meVal, tmVal, oppVal] : [meVal, oppVal];
  const cellMin = Math.min(...vals);
  const cellMax = Math.max(...vals);
  const cellRange = cellMax - cellMin;
  const t = (v: number) => {
    const raw = cellRange > 0 ? (v - cellMin) / cellRange : 0.5;
    return invert ? 1 - raw : raw;
  };

  const gr = globalRanges[stat];
  const globalRange = gr.max - gr.min;
  const maxH = 62;
  const h = (v: number) => {
    if (v === 0) return 28;
    const norm = globalRange > 0 ? (v - gr.min) / globalRange : 0.5;
    return Math.max(28, norm * maxH);
  };

  const bar = (label: string, val: number) => html`
    <div class="bar" style="height:${h(val)}px; background:${rankColor(t(val), alpha)}">
      <span class="bar-val">${fmt(val)}</span>
      <span class="bar-lbl">${label}</span>
    </div>
  `;

  return html`
    <td class="bar-cell">
      <div class="bar-group">
        ${bar('Me', meVal)}
        ${hasTm ? bar('Tm', tmVal) : ''}
        ${bar('Op', oppVal)}
      </div>
    </td>
  `;
}

/** Render a sortable header */
export function sortHeader(
  label: string, key: SortKey, currentKey: SortKey, currentDir: SortDir,
  toggle: (key: SortKey) => void, left = false,
): TemplateResult {
  const active = currentKey === key;
  const arrow = active ? (currentDir === 'desc' ? '\u25BC' : '\u25B2') : '';
  return html`
    <th class="sortable ${left ? 'left' : ''} ${active ? 'sorted' : ''}"
        @click=${() => toggle(key)}
    >${label}<span class="sort-arrow">${arrow}</span></th>
  `;
}

/** Render a sortable bar header */
export function sortBarHeader(
  label: string, key: SortKey, currentKey: SortKey, currentDir: SortDir,
  toggle: (key: SortKey) => void,
): TemplateResult {
  const active = currentKey === key;
  const arrow = active ? (currentDir === 'desc' ? '\u25BC' : '\u25B2') : '';
  return html`
    <th class="sortable bar-header ${active ? 'sorted' : ''}"
        @click=${() => toggle(key)}
    >${label}<span class="sort-arrow">${arrow}</span></th>
  `;
}

/** Render team-size mode bar */
export function renderModeBar(
  teamSize: number,
  setTeamSize: (size: number) => void,
): TemplateResult {
  return html`
    <div class="mode-bar">
      ${([1, 2, 3] as const).map(s => html`
        <button class="mode-btn ${teamSize === s ? 'active' : ''}"
                @click=${() => setTeamSize(s)}>${s}s</button>
      `)}
    </div>
  `;
}

/** Render filter checkboxes for excluding noise */
export function renderFilterBar(
  excludeZeroZero: boolean,
  excludeShort: boolean,
  toggleZeroZero: () => void,
  toggleShort: () => void,
): TemplateResult {
  return html`
    <div class="filter-bar">
      <label>
        <input type="checkbox" .checked=${excludeZeroZero} @change=${toggleZeroZero}>
        Exclude 0-0 games
      </label>
      <label>
        <input type="checkbox" .checked=${excludeShort} @change=${toggleShort}>
        Exclude games &lt; 90s
      </label>
    </div>
  `;
}

/** Row class based on score */
export function rowClass(myGoals: number, oppGoals: number): string {
  if (myGoals > oppGoals) return 'win';
  if (myGoals < oppGoals) return 'loss';
  return 'draw';
}

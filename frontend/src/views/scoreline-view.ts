import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getScorelineStats, type ScorelineRow } from '../lib/api.js';

type SortKey = 'score' | 'games' | 'pbb' | 'spd' | 'dist';
type SortDir = 'asc' | 'desc';

@customElement('scoreline-view')
export class ScorelineView extends LitElement {
  static styles = css`
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

    col.col-score { width: 98px; }
    col.col-games { width: 84px; }
    col.col-stat  { /* takes remaining space equally */ }

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

    /* colors set dynamically via inline style */

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

  @state() private _rows: ScorelineRow[] = [];
  @state() private _error = '';
  @state() private _loading = true;
  @state() private _sortKey: SortKey = 'score';
  @state() private _sortDir: SortDir = 'desc';
  @state() private _teamSize = 2;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      this._rows = await getScorelineStats(this._teamSize);
    } catch (e) {
      this._error = String(e);
    }
    this._loading = false;
  }

  private _setTeamSize(size: number) {
    if (size === this._teamSize) return;
    this._teamSize = size;
    this._load();
  }

  private _toggleSort(key: SortKey) {
    if (this._sortKey === key) {
      this._sortDir = this._sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this._sortKey = key;
      this._sortDir = 'desc';
    }
  }

  private _scoreCompare(a: ScorelineRow, b: ScorelineRow, dir: 'desc' | 'asc'): number {
    const mul = dir === 'desc' ? -1 : 1;
    if (a.my_goals !== b.my_goals) return (a.my_goals - b.my_goals) * mul;
    if (a.opp_goals !== b.opp_goals) return (a.opp_goals - b.opp_goals) * -mul;
    return 0;
  }

  private get _sortedRows(): ScorelineRow[] {
    const key = this._sortKey;
    const dir = this._sortDir;
    const mul = dir === 'desc' ? -1 : 1;
    return [...this._rows].sort((a, b) => {
      if (key === 'score') {
        return this._scoreCompare(a, b, dir);
      }
      let va: number, vb: number;
      switch (key) {
        case 'games': va = a.games; vb = b.games; break;
        case 'pbb':   va = a.me.percent_behind_ball; vb = b.me.percent_behind_ball; break;
        case 'spd':   va = a.me.avg_speed; vb = b.me.avg_speed; break;
        case 'dist':  va = a.me.avg_distance_to_ball; vb = b.me.avg_distance_to_ball; break;
        default:      va = 0; vb = 0;
      }
      if (va !== vb) return (va - vb) * mul;
      return this._scoreCompare(a, b, 'desc');
    });
  }

  private _sortHeader(label: string, key: SortKey, left = false) {
    const active = this._sortKey === key;
    const arrow = active ? (this._sortDir === 'desc' ? '\u25BC' : '\u25B2') : '';
    return html`
      <th class="sortable ${left ? 'left' : ''} ${active ? 'sorted' : ''}"
          @click=${() => this._toggleSort(key)}
      >${label}<span class="sort-arrow">${arrow}</span></th>
    `;
  }

  private _sortBarHeader(label: string, key: SortKey) {
    const active = this._sortKey === key;
    const arrow = active ? (this._sortDir === 'desc' ? '\u25BC' : '\u25B2') : '';
    return html`
      <th class="sortable bar-header ${active ? 'sorted' : ''}"
          @click=${() => this._toggleSort(key)}
      >${label}<span class="sort-arrow">${arrow}</span></th>
    `;
  }

  /** Global min/max for each stat across all rows and all roles */
  private get _globalRanges(): Record<'pbb' | 'spd' | 'dist', { min: number; max: number }> {
    const pbb: number[] = [];
    const spd: number[] = [];
    const dist: number[] = [];
    for (const row of this._rows) {
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

  /** Map 0-1 normalized rank to muted green→amber→red for dark background */
  private _rankColor(t: number, alpha: number): string {
    t = Math.max(0, Math.min(1, t));
    // Darker, muted tones that sit well on charcoal
    const r = t < 0.5 ? Math.round(45 + 120 * (t / 0.5)) : Math.round(165 + 30 * ((t - 0.5) / 0.5));
    const g = t < 0.5 ? Math.round(120 + 20 * (t / 0.5)) : Math.round(140 - 80 * ((t - 0.5) / 0.5));
    const b = t < 0.5 ? Math.round(45 - 10 * (t / 0.5)) : Math.round(35 - 5 * ((t - 0.5) / 0.5));
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private _renderBarCell(row: ScorelineRow, stat: 'pbb' | 'spd' | 'dist') {
    const hasTm = row.teammates != null;
    let meVal: number, tmVal: number, oppVal: number;
    let fmt: (v: number) => string;
    // pbb: high = good (green), so invert. spd/dist: neutral, high = red.
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

    // Color ranking: relative to the 3 values in this cell
    const vals = hasTm ? [meVal, tmVal, oppVal] : [meVal, oppVal];
    const cellMin = Math.min(...vals);
    const cellMax = Math.max(...vals);
    const cellRange = cellMax - cellMin;
    const t = (v: number) => {
      const raw = cellRange > 0 ? (v - cellMin) / cellRange : 0.5;
      return invert ? 1 - raw : raw;
    };

    // Bar height: relative to global min/max across all rows
    const gr = this._globalRanges[stat];
    const globalRange = gr.max - gr.min;
    const maxH = 62;
    const h = (v: number) => {
      if (v === 0) return 28;
      const norm = globalRange > 0 ? (v - gr.min) / globalRange : 0.5;
      return Math.max(28, norm * maxH);
    };

    const bar = (label: string, val: number) => html`
      <div class="bar" style="height:${h(val)}px; background:${this._rankColor(t(val), alpha)}">
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

  private _rowClass(row: ScorelineRow): string {
    if (row.my_goals > row.opp_goals) return 'win';
    if (row.my_goals < row.opp_goals) return 'loss';
    return 'draw';
  }

  render() {
    if (this._loading) return html`<p>Loading scoreline data...</p>`;
    if (this._error) return html`
      <div class="mode-bar">
        ${([1,2,3] as const).map(s => html`
          <button class="mode-btn ${this._teamSize === s ? 'active' : ''}"
                  @click=${() => this._setTeamSize(s)}>${s}s</button>
        `)}
      </div>
      <div class="error">${this._error}</div>
      <button @click=${this._load}>Retry</button>
    `;
    if (this._rows.length === 0 && !this._loading) return html`
      <div class="mode-bar">
        ${([1,2,3] as const).map(s => html`
          <button class="mode-btn ${this._teamSize === s ? 'active' : ''}"
                  @click=${() => this._setTeamSize(s)}>${s}s</button>
        `)}
      </div>
      <div class="empty">No replay data for ${this._teamSize}v${this._teamSize}.</div>
    `;

    return html`
      <div class="mode-bar">
        ${([1,2,3] as const).map(s => html`
          <button class="mode-btn ${this._teamSize === s ? 'active' : ''}"
                  @click=${() => this._setTeamSize(s)}>${s}s</button>
        `)}
      </div>
      <table>
        <colgroup>
          <col class="col-score">
          <col class="col-games">
          <col class="col-stat">
          <col class="col-stat">
          <col class="col-stat">
        </colgroup>
        <thead>
          <tr>
            ${this._sortHeader('Score', 'score', true)}
            ${this._sortHeader('Games', 'games')}
            ${this._sortBarHeader('% Behind Ball', 'pbb')}
            ${this._sortBarHeader('Avg Speed', 'spd')}
            ${this._sortBarHeader('Avg Distance', 'dist')}
          </tr>
        </thead>
        <tbody>
          ${this._sortedRows.map(row => html`
            <tr class="${this._rowClass(row)}">
              <td class="score">${row.my_goals}-${row.opp_goals}</td>
              <td class="games">${row.games}</td>
              ${this._renderBarCell(row, 'pbb')}
              ${this._renderBarCell(row, 'spd')}
              ${this._renderBarCell(row, 'dist')}
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }
}

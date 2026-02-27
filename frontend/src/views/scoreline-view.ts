import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getScorelineStats, type ScorelineRow, type ScorelineRoleStats } from '../lib/api.js';

// stat column keys for color scaling
type StatCol = 'me.pbb' | 'me.spd' | 'me.dist'
  | 'tm.pbb' | 'tm.spd' | 'tm.dist'
  | 'opp.pbb' | 'opp.spd' | 'opp.dist';

const STAT_COLS: StatCol[] = [
  'me.pbb', 'me.spd', 'me.dist',
  'tm.pbb', 'tm.spd', 'tm.dist',
  'opp.pbb', 'opp.spd', 'opp.dist',
];

function getStatValue(row: ScorelineRow, col: StatCol): number {
  const [role, field] = col.split('.') as [string, string];
  const r = role === 'me' ? row.me : role === 'tm' ? row.teammates : row.opponents;
  switch (field) {
    case 'pbb': return r.percent_behind_ball;
    case 'spd': return r.avg_speed;
    case 'dist': return r.avg_distance_to_ball;
    default: return 0;
  }
}

interface ColRange { min: number; max: number }

function computeRanges(rows: ScorelineRow[]): Map<StatCol, ColRange> {
  const ranges = new Map<StatCol, ColRange>();
  for (const col of STAT_COLS) {
    const vals = rows.map(r => getStatValue(r, col)).filter(v => v > 0);
    if (vals.length === 0) {
      ranges.set(col, { min: 0, max: 1 });
    } else {
      ranges.set(col, { min: Math.min(...vals), max: Math.max(...vals) });
    }
  }
  return ranges;
}

// Interpolate: 0 = red, 0.5 = blue (neutral), 1 = green (low alpha for dark theme)
function heatColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  let r: number, g: number, b: number;
  if (t < 0.5) {
    // red (1,0.3,0.3) -> blue (0.3,0.4,0.9)
    const s = t / 0.5;
    r = 1 - 0.7 * s;
    g = 0.3 + 0.1 * s;
    b = 0.3 + 0.6 * s;
  } else {
    // blue (0.3,0.4,0.9) -> green (0.3,0.8,0.3)
    const s = (t - 0.5) / 0.5;
    r = 0.3;
    g = 0.4 + 0.4 * s;
    b = 0.9 - 0.6 * s;
  }
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.18)`;
}

type SortKey = 'score' | 'games'
  | 'me.pbb' | 'me.spd' | 'me.dist'
  | 'tm.pbb' | 'tm.spd' | 'tm.dist'
  | 'opp.pbb' | 'opp.spd' | 'opp.dist';

type SortDir = 'asc' | 'desc';

function getSortValue(row: ScorelineRow, key: SortKey): number {
  switch (key) {
    case 'score': return row.my_goals - row.opp_goals;
    case 'games': return row.games;
    case 'me.pbb': return row.me.percent_behind_ball;
    case 'me.spd': return row.me.avg_speed;
    case 'me.dist': return row.me.avg_distance_to_ball;
    case 'tm.pbb': return row.teammates.percent_behind_ball;
    case 'tm.spd': return row.teammates.avg_speed;
    case 'tm.dist': return row.teammates.avg_distance_to_ball;
    case 'opp.pbb': return row.opponents.percent_behind_ball;
    case 'opp.spd': return row.opponents.avg_speed;
    case 'opp.dist': return row.opponents.avg_distance_to_ball;
  }
}

@customElement('scoreline-view')
export class ScorelineView extends LitElement {
  static styles = css`
    :host { display: block; }

    .error { color: #ef5350; margin-bottom: 1rem; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
    }

    thead th {
      color: #999;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.7rem;
      letter-spacing: 0.04em;
      padding: 0.4rem 0.5rem;
      text-align: right;
      border-bottom: 2px solid #444;
    }

    thead th.left { text-align: left; }

    thead th.group-header {
      text-align: center;
      color: #64b5f6;
      border-bottom: 1px solid #444;
      padding-bottom: 0.2rem;
    }

    thead th.sortable {
      cursor: pointer;
      user-select: none;
    }

    thead th.sortable:hover {
      color: #ddd;
    }

    thead th.sorted {
      color: #64b5f6;
    }

    .sort-arrow {
      font-size: 0.6rem;
      margin-left: 0.15rem;
    }

    tbody td {
      padding: 0.35rem 0.5rem;
      text-align: right;
      color: #ccc;
      border-bottom: 1px solid #333;
    }

    tbody td.left { text-align: left; }

    tbody td.score {
      font-weight: 700;
      color: #fff;
      text-align: left;
    }

    tbody td.games {
      color: #aaa;
    }

    tr.win { border-left: 3px solid #4caf50; }
    tr.loss { border-left: 3px solid #ef5350; }
    tr.draw { border-left: 3px solid #777; }

    tr.win td:first-child { color: #81c784; }
    tr.loss td:first-child { color: #ef9a9a; }

    .empty {
      color: #777;
      text-align: center;
      padding: 2rem;
    }
  `;

  @state() private _rows: ScorelineRow[] = [];
  @state() private _error = '';
  @state() private _loading = true;
  @state() private _sortKey: SortKey = 'score';
  @state() private _sortDir: SortDir = 'desc';

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      this._rows = await getScorelineStats();
    } catch (e) {
      this._error = String(e);
    }
    this._loading = false;
  }

  private _toggleSort(key: SortKey) {
    if (this._sortKey === key) {
      this._sortDir = this._sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this._sortKey = key;
      this._sortDir = 'desc';
    }
  }

  private get _ranges(): Map<StatCol, ColRange> {
    return computeRanges(this._rows);
  }

  private _scoreCompare(a: ScorelineRow, b: ScorelineRow, dir: 'desc' | 'asc'): number {
    const mul = dir === 'desc' ? -1 : 1;
    // Primary: my_goals desc (biggest wins first)
    if (a.my_goals !== b.my_goals) return (a.my_goals - b.my_goals) * mul;
    // Secondary: opp_goals asc (fewest opponent goals first within same my_goals)
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
      const va = getSortValue(a, key);
      const vb = getSortValue(b, key);
      if (va !== vb) return (va - vb) * mul;
      // Tiebreak: score order desc
      return this._scoreCompare(a, b, 'desc');
    });
  }

  private _sortHeader2(label: string, key: SortKey, left = false) {
    const active = this._sortKey === key;
    const arrow = active ? (this._sortDir === 'desc' ? '\u25BC' : '\u25B2') : '';
    return html`
      <th class="sortable ${left ? 'left' : ''} ${active ? 'sorted' : ''}"
          rowspan="2"
          @click=${() => this._toggleSort(key)}
      >${label}<span class="sort-arrow">${arrow}</span></th>
    `;
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

  private _fmt(v: number, suffix = ''): string {
    return v === 0 ? '-' : v.toFixed(1) + suffix;
  }

  private _fmtInt(v: number): string {
    return v === 0 ? '-' : Math.round(v).toString();
  }

  private _cellBg(value: number, col: StatCol): string {
    if (value === 0) return '';
    const range = this._ranges.get(col);
    if (!range || range.max === range.min) return '';
    const t = (value - range.min) / (range.max - range.min);
    return heatColor(t);
  }

  private _renderRoleStats(s: ScorelineRoleStats, prefix: 'me' | 'tm' | 'opp') {
    const pbbCol = `${prefix}.pbb` as StatCol;
    const spdCol = `${prefix}.spd` as StatCol;
    const distCol = `${prefix}.dist` as StatCol;
    return html`
      <td style="background:${this._cellBg(s.percent_behind_ball, pbbCol)}">${this._fmt(s.percent_behind_ball, '%')}</td>
      <td style="background:${this._cellBg(s.avg_speed, spdCol)}">${this._fmtInt(s.avg_speed)}</td>
      <td style="background:${this._cellBg(s.avg_distance_to_ball, distCol)}">${this._fmtInt(s.avg_distance_to_ball)}</td>
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
      <div class="error">${this._error}</div>
      <button @click=${this._load}>Retry</button>
    `;
    if (this._rows.length === 0) return html`<div class="empty">No replay data. Sync some replays and configure your player identity first.</div>`;

    return html`
      <table>
        <thead>
          <tr>
            ${this._sortHeader2('Score', 'score', true)}
            ${this._sortHeader2('Games', 'games')}
            <th class="group-header" colspan="3">Me</th>
            <th class="group-header" colspan="3">Teammates</th>
            <th class="group-header" colspan="3">Opponents</th>
          </tr>
          <tr>
            ${this._sortHeader('%Behind', 'me.pbb')}
            ${this._sortHeader('Speed', 'me.spd')}
            ${this._sortHeader('Dist', 'me.dist')}
            ${this._sortHeader('%Behind', 'tm.pbb')}
            ${this._sortHeader('Speed', 'tm.spd')}
            ${this._sortHeader('Dist', 'tm.dist')}
            ${this._sortHeader('%Behind', 'opp.pbb')}
            ${this._sortHeader('Speed', 'opp.spd')}
            ${this._sortHeader('Dist', 'opp.dist')}
          </tr>
        </thead>
        <tbody>
          ${this._sortedRows.map(row => html`
            <tr class="${this._rowClass(row)}">
              <td class="score">${row.my_goals}-${row.opp_goals}</td>
              <td class="games">${row.games}</td>
              ${this._renderRoleStats(row.me, 'me')}
              ${this._renderRoleStats(row.teammates, 'tm')}
              ${this._renderRoleStats(row.opponents, 'opp')}
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }
}

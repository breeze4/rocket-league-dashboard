import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getScorelineStats, getGameAnalysis, type ScorelineRow, type GameAnalysisRow } from '../lib/api.js';
import {
  analysisStyles, computeGlobalRanges, renderBarCell, sortHeader, sortBarHeader,
  renderModeBar, renderFilterBar, renderPlaylistFilter, playlistsFromState,
  rowClass, formatDate, type SortKey, type SortDir,
  DEFAULT_PLAYLIST_STATE, type PlaylistState, PLAYLIST_OPTIONS,
} from '../lib/analysis-shared.js';

@customElement('scoreline-view')
export class ScorelineView extends LitElement {
  static styles = [analysisStyles, css`
    col.col-score { width: 98px; }
    col.col-games { width: 84px; }
    col.col-stat  { /* takes remaining space equally */ }

    tbody tr.parent-row { cursor: pointer; }
    tbody tr.parent-row:hover { background: rgba(255,255,255,0.03); }

    .games-cell {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.3rem;
    }

    .chevron {
      font-size: 0.7rem;
      color: #71717a;
      transition: transform 0.15s ease;
    }

    .chevron.open { transform: rotate(90deg); }

    tr.sub-row {
      background: rgba(0,0,0,0.15);
    }

    tr.sub-row td {
      padding: 0.25rem 0.5rem;
      border-bottom: 1px solid #1e1e21;
    }

    tr.sub-row td.date {
      text-align: left;
      font-size: 0.95rem;
    }

    tr.sub-row td.date a {
      color: #71717a;
      text-decoration: none;
    }

    tr.sub-row td.date a:hover {
      color: #3b82f6;
      text-decoration: underline;
    }

    tr.sub-row td.score {
      font-weight: 600;
      font-size: 1.05rem;
      color: #a1a1aa;
    }

    tr.sub-row.win { border-left: 3px solid rgba(74,222,128,0.4); }
    tr.sub-row.loss { border-left: 3px solid rgba(239,68,68,0.4); }
    tr.sub-row.draw { border-left: 3px solid rgba(82,82,91,0.4); }

    tr.sub-row .bar-group { height: 52px; }
    tr.sub-row .bar { min-height: 22px; }
    tr.sub-row .bar-val { font-size: 1.05rem; }
    tr.sub-row .bar-lbl { font-size: 0.85rem; }

    tr.parent-row.expanded td { border-bottom: none; }
    tr.sub-row-last td { border-bottom: 2px solid #27272a; }
  `];

  @state() private _rows: ScorelineRow[] = [];
  @state() private _games: GameAnalysisRow[] = [];
  @state() private _error = '';
  @state() private _loading = true;
  @state() private _sortKey: SortKey = 'score';
  @state() private _sortDir: SortDir = 'desc';
  @state() private _teamSize = 2;
  @state() private _excludeZeroZero = true;
  @state() private _excludeShort = true;
  @state() private _playlistState: PlaylistState = { ...DEFAULT_PLAYLIST_STATE };
  @state() private _allModes = false;
  @state() private _expanded = new Set<string>();

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    this._expanded = new Set();
    const params = {
      teamSize: this._teamSize,
      excludeZeroZero: this._excludeZeroZero,
      minDuration: this._excludeShort ? 90 : 0,
      playlists: playlistsFromState(this._playlistState, this._allModes),
    };
    try {
      const [rows, games] = await Promise.all([
        getScorelineStats(params),
        getGameAnalysis(params),
      ]);
      this._rows = rows;
      this._games = games;
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

  private _toggleExpand(my: number, opp: number) {
    const key = `${my}-${opp}`;
    const next = new Set(this._expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this._expanded = next;
  }

  private _isExpanded(my: number, opp: number): boolean {
    return this._expanded.has(`${my}-${opp}`);
  }

  private _gamesForScoreline(my: number, opp: number): GameAnalysisRow[] {
    return this._games
      .filter(g => g.my_goals === my && g.opp_goals === opp)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
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

  private get _globalRanges() {
    return computeGlobalRanges(this._rows);
  }

  private get _gameGlobalRanges() {
    return computeGlobalRanges(this._games);
  }

  render() {
    if (this._loading) return html`<p>Loading scoreline data...</p>`;
    const playlistFilter = renderPlaylistFilter(
      this._playlistState, this._allModes,
      (key) => { this._playlistState = { ...this._playlistState, [key]: !this._playlistState[key] }; this._load(); },
      () => { this._allModes = !this._allModes; this._load(); },
    );
    const filterBar = renderFilterBar(
      this._excludeZeroZero, this._excludeShort,
      () => { this._excludeZeroZero = !this._excludeZeroZero; this._load(); },
      () => { this._excludeShort = !this._excludeShort; this._load(); },
    );

    if (this._error) return html`
      ${renderModeBar(this._teamSize, (s) => this._setTeamSize(s))}
      ${playlistFilter}
      ${filterBar}
      <div class="error">${this._error}</div>
      <button @click=${this._load}>Retry</button>
    `;
    if (this._rows.length === 0 && !this._loading) return html`
      ${renderModeBar(this._teamSize, (s) => this._setTeamSize(s))}
      ${playlistFilter}
      ${filterBar}
      <div class="empty">No replay data for ${this._teamSize}v${this._teamSize}.</div>
    `;

    const toggle = (key: SortKey) => this._toggleSort(key);
    const gr = this._globalRanges;
    const ggr = this._gameGlobalRanges;

    return html`
      ${renderModeBar(this._teamSize, (s) => this._setTeamSize(s))}
      ${playlistFilter}
      ${filterBar}
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
            ${sortHeader('Score', 'score', this._sortKey, this._sortDir, toggle, true)}
            ${sortHeader('Games', 'games', this._sortKey, this._sortDir, toggle)}
            ${sortBarHeader('% Behind Ball', 'pbb', this._sortKey, this._sortDir, toggle)}
            ${sortBarHeader('Avg Speed', 'spd', this._sortKey, this._sortDir, toggle)}
            ${sortBarHeader('Avg Distance', 'dist', this._sortKey, this._sortDir, toggle)}
          </tr>
        </thead>
        <tbody>
          ${this._sortedRows.map(row => {
            const expanded = this._isExpanded(row.my_goals, row.opp_goals);
            const games = expanded ? this._gamesForScoreline(row.my_goals, row.opp_goals) : [];
            return html`
              <tr class="parent-row ${rowClass(row.my_goals, row.opp_goals)} ${expanded ? 'expanded' : ''}"
                  @click=${() => this._toggleExpand(row.my_goals, row.opp_goals)}>
                <td class="score">${row.my_goals}-${row.opp_goals}</td>
                <td class="games">
                  <div class="games-cell">
                    <span>${row.games}</span>
                    <span class="chevron ${expanded ? 'open' : ''}">&#9654;</span>
                  </div>
                </td>
                ${renderBarCell(row, 'pbb', gr)}
                ${renderBarCell(row, 'spd', gr)}
                ${renderBarCell(row, 'dist', gr)}
              </tr>
              ${games.map((g, i) => html`
                <tr class="sub-row ${rowClass(g.my_goals, g.opp_goals)} ${i === games.length - 1 ? 'sub-row-last' : ''}">
                  <td class="date"><a href="https://ballchasing.com/replay/${g.id}" target="_blank" rel="noopener">${formatDate(g.date)}</a></td>
                  <td class="score">${g.my_goals}-${g.opp_goals}</td>
                  ${renderBarCell(g, 'pbb', ggr)}
                  ${renderBarCell(g, 'spd', ggr)}
                  ${renderBarCell(g, 'dist', ggr)}
                </tr>
              `)}
            `;
          })}
        </tbody>
      </table>
    `;
  }
}

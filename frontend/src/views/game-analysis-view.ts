import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getGameAnalysis, type GameAnalysisRow } from '../lib/api.js';
import {
  analysisStyles, computeGlobalRanges, renderBarCell, sortHeader, sortBarHeader,
  renderModeBar, renderFilterBar, renderPlaylistFilter, playlistsFromState,
  rowClass, formatDate, type SortKey, type SortDir,
  DEFAULT_PLAYLIST_STATE, type PlaylistState, PLAYLIST_OPTIONS,
  readFiltersFromURL, writeFiltersToURL, readSortFromURL, writeSortToURL,
} from '../lib/analysis-shared.js';

@customElement('game-analysis-view')
export class GameAnalysisView extends LitElement {
  static styles = [analysisStyles, css`
    col.col-date  { width: 150px; }
    col.col-score { width: 80px; }
    col.col-stat  { /* takes remaining space equally */ }

    tbody td.date {
      text-align: left;
      color: #a1a1aa;
      font-size: 1.05rem;
    }
  `];

  @state() private _rows: GameAnalysisRow[] = [];
  @state() private _error = '';
  @state() private _loading = true;
  @state() private _sortKey: SortKey = 'date';
  @state() private _sortDir: SortDir = 'desc';
  @state() private _teamSize = 2;
  @state() private _excludeTies = true;
  @state() private _excludeShort = true;
  @state() private _playlistState: PlaylistState = { ...DEFAULT_PLAYLIST_STATE };
  @state() private _allModes = false;

  private _onRouteChanged = () => this._readURL();

  connectedCallback() {
    super.connectedCallback();
    this._readURL();
    this._load();
    window.addEventListener('route-changed', this._onRouteChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('route-changed', this._onRouteChanged);
  }

  private _readURL() {
    const f = readFiltersFromURL();
    const s = readSortFromURL('date', 'desc');
    let changed = false;
    if (f.teamSize !== this._teamSize || f.excludeTies !== this._excludeTies ||
        f.excludeShort !== this._excludeShort || f.allModes !== this._allModes) {
      changed = true;
    }
    for (const opt of PLAYLIST_OPTIONS) {
      if (f.playlistState[opt.key] !== this._playlistState[opt.key]) {
        changed = true;
        break;
      }
    }
    this._teamSize = f.teamSize;
    this._excludeTies = f.excludeTies;
    this._excludeShort = f.excludeShort;
    this._playlistState = f.playlistState;
    this._allModes = f.allModes;
    this._sortKey = s.sortKey;
    this._sortDir = s.sortDir;
    if (changed && !this._loading) this._load();
  }

  private _writeURL() {
    writeFiltersToURL({
      teamSize: this._teamSize,
      excludeTies: this._excludeTies,
      excludeShort: this._excludeShort,
      playlistState: this._playlistState,
      allModes: this._allModes,
    });
    writeSortToURL(this._sortKey, this._sortDir, 'date', 'desc');
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      this._rows = await getGameAnalysis({
        teamSize: this._teamSize,
        excludeTies: this._excludeTies,
        minDuration: this._excludeShort ? 90 : 0,
        playlists: playlistsFromState(this._playlistState, this._allModes),
      });
    } catch (e) {
      this._error = String(e);
    }
    this._loading = false;
  }

  private _setTeamSize(size: number) {
    if (size === this._teamSize) return;
    this._teamSize = size;
    this._writeURL();
    this._load();
  }

  private _toggleSort(key: SortKey) {
    if (this._sortKey === key) {
      this._sortDir = this._sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this._sortKey = key;
      this._sortDir = 'desc';
    }
    this._writeURL();
  }

  private _scoreCompare(a: GameAnalysisRow, b: GameAnalysisRow, dir: 'desc' | 'asc'): number {
    const mul = dir === 'desc' ? -1 : 1;
    if (a.my_goals !== b.my_goals) return (a.my_goals - b.my_goals) * mul;
    if (a.opp_goals !== b.opp_goals) return (a.opp_goals - b.opp_goals) * -mul;
    return 0;
  }

  private get _sortedRows(): GameAnalysisRow[] {
    const key = this._sortKey;
    const dir = this._sortDir;
    const mul = dir === 'desc' ? -1 : 1;
    return [...this._rows].sort((a, b) => {
      if (key === 'date') {
        return a.date < b.date ? -mul : a.date > b.date ? mul : 0;
      }
      if (key === 'score') {
        return this._scoreCompare(a, b, dir);
      }
      let va: number, vb: number;
      switch (key) {
        case 'pbb':  va = a.me.percent_behind_ball; vb = b.me.percent_behind_ball; break;
        case 'spd':  va = a.me.avg_speed; vb = b.me.avg_speed; break;
        case 'dist': va = a.me.avg_distance_to_ball; vb = b.me.avg_distance_to_ball; break;
        default:     va = 0; vb = 0;
      }
      if (va !== vb) return (va - vb) * mul;
      // tie-break by date desc
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
  }

  private get _globalRanges() {
    return computeGlobalRanges(this._rows);
  }


  render() {
    if (this._loading) return html`<p>Loading game data...</p>`;
    const playlistFilter = renderPlaylistFilter(
      this._playlistState, this._allModes,
      (key) => { this._playlistState = { ...this._playlistState, [key]: !this._playlistState[key] }; this._writeURL(); this._load(); },
      () => { this._allModes = !this._allModes; this._writeURL(); this._load(); },
    );
    const filterBar = renderFilterBar(
      this._excludeTies, this._excludeShort,
      () => { this._excludeTies = !this._excludeTies; this._writeURL(); this._load(); },
      () => { this._excludeShort = !this._excludeShort; this._writeURL(); this._load(); },
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

    return html`
      ${renderModeBar(this._teamSize, (s) => this._setTeamSize(s))}
      ${playlistFilter}
      ${filterBar}
      <table>
        <colgroup>
          <col class="col-date">
          <col class="col-score">
          <col class="col-stat">
          <col class="col-stat">
          <col class="col-stat">
        </colgroup>
        <thead>
          <tr>
            ${sortHeader('Date', 'date', this._sortKey, this._sortDir, toggle, true)}
            ${sortHeader('Score', 'score', this._sortKey, this._sortDir, toggle, true)}
            ${sortBarHeader('% Behind Ball', 'pbb', this._sortKey, this._sortDir, toggle)}
            ${sortBarHeader('Avg Speed', 'spd', this._sortKey, this._sortDir, toggle)}
            ${sortBarHeader('Avg Distance', 'dist', this._sortKey, this._sortDir, toggle)}
          </tr>
        </thead>
        <tbody>
          ${this._sortedRows.map(row => html`
            <tr class="${rowClass(row.my_goals, row.opp_goals)}">
              <td class="date left">${formatDate(row.date)}</td>
              <td class="score">${row.my_goals}-${row.opp_goals}</td>
              ${renderBarCell(row, 'pbb', gr)}
              ${renderBarCell(row, 'spd', gr)}
              ${renderBarCell(row, 'dist', gr)}
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }
}

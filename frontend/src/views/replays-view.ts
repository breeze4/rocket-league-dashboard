import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getStatsReplays, type ReplayDetail } from '../lib/api.js';
import { navigate } from '../lib/router.js';

@customElement('replays-view')
export class ReplaysView extends LitElement {
  static styles = css`
    :host { display: block; }

    .pagination {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 1rem;
    }

    .pagination span { color: #a1a1aa; font-size: 0.85rem; }

    .replay-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .replay {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 0.375rem;
      padding: 1rem 1.5rem;
    }

    .replay-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .replay-title {
      font-weight: 600;
      color: #fafafa;
    }

    .replay-meta {
      font-size: 0.8rem;
      color: #71717a;
      display: flex;
      gap: 0.75rem;
    }

    .score {
      font-weight: 700;
      font-size: 1rem;
    }

    .score .blue { color: #60a5fa; }
    .score .orange { color: #fb923c; }
    .score .sep { color: #52525b; margin: 0 0.2em; }
    .overtime { color: #fbbf24; font-size: 0.75rem; }

    .win { border-left: 3px solid #4ade80; }
    .loss { border-left: 3px solid #ef4444; }

    .players-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.25rem 1.5rem;
    }

    @media (max-width: 600px) {
      .players-grid { grid-template-columns: 1fr; }
    }

    .team-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding-bottom: 0.25rem;
      border-bottom: 1px solid #27272a;
      margin-bottom: 0.25rem;
    }

    .team-label.blue { color: #60a5fa; }
    .team-label.orange { color: #fb923c; }

    .player-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      padding: 0.1rem 0;
    }

    .player-name { color: #fafafa; }
    .player-role {
      font-size: 0.75rem;
      padding: 0.1em 0.4em;
      border-radius: 0.375rem;
      font-weight: 500;
    }

    .role-me { background: #14532d; color: #86efac; }
    .role-teammate { background: #1e3a5f; color: #93c5fd; }
    .role-opponent { background: #44403c; color: #d6d3d1; }

    .replay-link {
      display: block;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    .replay-link:hover .replay {
      border-color: #3f3f46;
    }

    .back-link {
      display: inline-block;
      color: #3b82f6;
      cursor: pointer;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }

    .back-link:hover { color: #60a5fa; }

    .empty { color: #52525b; font-style: italic; }
    .error { color: #ef4444; }
  `;

  private static PAGE_SIZE = 50;

  @property() replayId: string | null = null;

  @state() private _replays: ReplayDetail[] = [];
  @state() private _offset = 0;
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _hasMore = true;
  @state() private _detailReplay: ReplayDetail | null = null;

  connectedCallback() {
    super.connectedCallback();
    if (!this.replayId) this._load();
  }

  willUpdate(changed: Map<string, unknown>) {
    if (changed.has('replayId')) {
      if (this.replayId) {
        this._loadDetail();
      } else if (this._replays.length === 0) {
        this._load();
      }
    }
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      const data = await getStatsReplays({
        limit: ReplaysView.PAGE_SIZE,
        offset: this._offset,
      });
      this._replays = data;
      this._hasMore = data.length === ReplaysView.PAGE_SIZE;
    } catch (e) {
      this._error = String(e);
    }
    this._loading = false;
  }

  private async _loadDetail() {
    // Try to find in already-loaded list first
    const cached = this._replays.find(r => r.id === this.replayId);
    if (cached) {
      this._detailReplay = cached;
      this._loading = false;
      return;
    }
    // Fetch from stats/replays (role-resolved) — small page, search for it
    this._loading = true;
    this._error = '';
    try {
      const data = await getStatsReplays({ limit: 200 });
      this._detailReplay = data.find(r => r.id === this.replayId) ?? null;
      if (!this._detailReplay) {
        this._error = 'Replay not found';
      }
    } catch (e) {
      this._error = String(e);
    }
    this._loading = false;
  }

  private _prev() {
    this._offset = Math.max(0, this._offset - ReplaysView.PAGE_SIZE);
    this._load();
  }

  private _next() {
    this._offset += ReplaysView.PAGE_SIZE;
    this._load();
  }

  private _roleClass(role: string): string {
    if (role === 'me') return 'role-me';
    if (role.startsWith('teammate')) return 'role-teammate';
    if (role === 'anon_teammate') return 'role-teammate';
    return 'role-opponent';
  }

  private _roleLabel(role: string): string {
    if (role === 'me') return 'me';
    if (role.startsWith('teammate:')) return role.slice(9);
    if (role === 'anon_teammate') return 'teammate';
    if (role === 'anon_opponent') return 'opponent';
    return role;
  }

  private _resultClass(r: ReplayDetail): string {
    if (!r.my_team) return '';
    const myGoals = r.my_team === 'blue' ? r.blue_goals : r.orange_goals;
    const theirGoals = r.my_team === 'blue' ? r.orange_goals : r.blue_goals;
    if (myGoals != null && theirGoals != null) {
      return myGoals > theirGoals ? 'win' : 'loss';
    }
    return '';
  }

  private _formatDuration(sec: number | null): string {
    if (sec == null) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  private _renderReplay(r: ReplayDetail, linked = true) {
    const bluePlayers = r.players.filter(p => p.team === 'blue');
    const orangePlayers = r.players.filter(p => p.team === 'orange');

    const card = html`
      <div class="replay ${this._resultClass(r)}">
        <div class="replay-header">
          <span class="replay-title">${r.title || r.id}</span>
          <div class="replay-meta">
            ${r.map_name ? html`<span>${r.map_name}</span>` : nothing}
            ${r.date ? html`<span>${r.date.slice(0, 10)}</span>` : nothing}
            ${r.duration ? html`<span>${this._formatDuration(r.duration)}</span>` : nothing}
          </div>
          <span>
            <span class="score">
              <span class="blue">${r.blue_goals ?? '?'}</span>
              <span class="sep">-</span>
              <span class="orange">${r.orange_goals ?? '?'}</span>
            </span>
            ${r.overtime ? html`<span class="overtime">OT</span>` : nothing}
          </span>
        </div>
        <div class="players-grid">
          <div>
            <div class="team-label blue">Blue</div>
            ${bluePlayers.map(p => html`
              <div class="player-row">
                <span class="player-name">${p.name}</span>
                <span class="player-role ${this._roleClass(p.role)}">${this._roleLabel(p.role)}</span>
              </div>
            `)}
          </div>
          <div>
            <div class="team-label orange">Orange</div>
            ${orangePlayers.map(p => html`
              <div class="player-row">
                <span class="player-name">${p.name}</span>
                <span class="player-role ${this._roleClass(p.role)}">${this._roleLabel(p.role)}</span>
              </div>
            `)}
          </div>
        </div>
      </div>
    `;

    if (!linked) return card;

    return html`
      <a class="replay-link"
        @click=${(e: Event) => { e.preventDefault(); navigate(`/replays/${r.id}`); }}
      >${card}</a>
    `;
  }

  render() {
    if (this.replayId) return this._renderDetail();

    if (this._loading) return html`<p>Loading replays...</p>`;
    if (this._error) return html`
      <div class="error">${this._error}</div>
      <button @click=${this._load}>Retry</button>
    `;

    return html`
      <div class="pagination">
        <button @click=${this._prev} ?disabled=${this._offset === 0}>Prev</button>
        <span>Showing ${this._offset + 1}–${this._offset + this._replays.length}</span>
        <button @click=${this._next} ?disabled=${!this._hasMore}>Next</button>
      </div>

      ${this._replays.length === 0
        ? html`<p class="empty">No replays found. Sync some replays and configure players first.</p>`
        : html`<div class="replay-list">
            ${this._replays.map(r => this._renderReplay(r))}
          </div>`
      }
    `;
  }

  private _renderDetail() {
    if (this._loading) return html`<p>Loading replay...</p>`;
    if (this._error) return html`
      <span class="back-link" @click=${() => navigate('/replays')}>&larr; Back to replays</span>
      <div class="error">${this._error}</div>
    `;
    if (!this._detailReplay) return html`
      <span class="back-link" @click=${() => navigate('/replays')}>&larr; Back to replays</span>
      <p class="empty">Replay not found.</p>
    `;

    return html`
      <span class="back-link" @click=${() => navigate('/replays')}>&larr; Back to replays</span>
      ${this._renderReplay(this._detailReplay, false)}
    `;
  }
}

import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getMyStats, getTeammateStats, getOpponentStats, type PlayerStats } from '../lib/api.js';

@customElement('stats-view')
export class StatsView extends LitElement {
  static styles = css`
    :host { display: block; }

    .error { color: #ef5350; margin-bottom: 1rem; }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
    }

    .card {
      background: #2a2a4a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 1rem;
    }

    .card h3 {
      font-size: 0.95rem;
      color: #64b5f6;
      margin-bottom: 0.75rem;
      border-bottom: 1px solid #444;
      padding-bottom: 0.4rem;
    }

    .card h3 .role {
      font-weight: 400;
      color: #888;
      font-size: 0.8rem;
    }

    .stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.3rem 1rem;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
    }

    .stat-label { color: #999; font-size: 0.8rem; }
    .stat-value { color: #fff; font-weight: 600; font-size: 0.85rem; }

    .section-label {
      grid-column: 1 / -1;
      color: #777;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 0.5rem;
      border-bottom: 1px solid #333;
      padding-bottom: 0.2rem;
    }

    .win-rate { color: #81c784; }
  `;

  @state() private _me: PlayerStats | null = null;
  @state() private _teammates: PlayerStats[] = [];
  @state() private _opponents: PlayerStats | null = null;
  @state() private _error = '';
  @state() private _loading = true;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      const [me, teammates, opponents] = await Promise.all([
        getMyStats(),
        getTeammateStats(),
        getOpponentStats(),
      ]);
      this._me = me;
      this._teammates = teammates;
      this._opponents = opponents;
    } catch (e) {
      this._error = String(e);
    }
    this._loading = false;
  }

  private _renderCard(ps: PlayerStats) {
    const s = ps.stats;
    const winRate = s.games > 0 ? ((s.wins / s.games) * 100).toFixed(1) : '0.0';
    return html`
      <div class="card">
        <h3>${ps.name} <span class="role">${ps.role}</span></h3>
        <div class="stat-grid">
          <div class="stat-row">
            <span class="stat-label">Games</span>
            <span class="stat-value">${s.games}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Win Rate</span>
            <span class="stat-value win-rate">${winRate}%</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Wins</span>
            <span class="stat-value">${s.wins}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Losses</span>
            <span class="stat-value">${s.losses}</span>
          </div>

          <div class="section-label">Core</div>
          <div class="stat-row">
            <span class="stat-label">Goals</span>
            <span class="stat-value">${s.core.goals}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Assists</span>
            <span class="stat-value">${s.core.assists}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Saves</span>
            <span class="stat-value">${s.core.saves}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Shots</span>
            <span class="stat-value">${s.core.shots}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Shooting %</span>
            <span class="stat-value">${s.core.shooting_percentage.toFixed(1)}%</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Score</span>
            <span class="stat-value">${s.core.score}</span>
          </div>

          <div class="section-label">Boost</div>
          <div class="stat-row">
            <span class="stat-label">BPM</span>
            <span class="stat-value">${s.boost.bpm.toFixed(0)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">BCPM</span>
            <span class="stat-value">${s.boost.bcpm.toFixed(0)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Avg Amount</span>
            <span class="stat-value">${s.boost.avg_amount.toFixed(0)}</span>
          </div>

          <div class="section-label">Demos</div>
          <div class="stat-row">
            <span class="stat-label">Inflicted</span>
            <span class="stat-value">${s.demo.inflicted}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Taken</span>
            <span class="stat-value">${s.demo.taken}</span>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    if (this._loading) return html`<p>Loading stats...</p>`;
    if (this._error) return html`
      <div class="error">${this._error}</div>
      <button @click=${this._load}>Retry</button>
    `;

    return html`
      <div class="cards">
        ${this._me ? this._renderCard(this._me) : ''}
        ${this._teammates.map(t => this._renderCard(t))}
        ${this._opponents ? this._renderCard(this._opponents) : ''}
      </div>
    `;
  }
}

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import {
  getPlayers, getPlayerConfig, savePlayerConfig,
  type PlayerFrequency, type PlayerConfig,
} from '../lib/api.js';

@customElement('players-view')
export class PlayersView extends LitElement {
  static styles = css`
    :host { display: block; }

    .split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }

    @media (max-width: 700px) {
      .split { grid-template-columns: 1fr; }
    }

    section h2 {
      font-size: 1rem;
      color: #aaa;
      margin-bottom: 0.75rem;
    }

    .player-table {
      max-height: 500px;
      overflow-y: auto;
    }

    tr.selected {
      background: #3a3a6a;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .actions button {
      font-size: 0.8rem;
      padding: 0.2em 0.6em;
    }

    .config-section {
      background: #2a2a4a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 1rem;
    }

    .config-group {
      margin-bottom: 1rem;
    }

    .config-group h3 {
      font-size: 0.85rem;
      color: #ccc;
      margin-bottom: 0.4rem;
    }

    .tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }

    .tag {
      background: #3a3a6a;
      border: 1px solid #555;
      border-radius: 3px;
      padding: 0.15em 0.5em;
      font-size: 0.8rem;
      display: flex;
      align-items: center;
      gap: 0.3em;
    }

    .tag .remove {
      cursor: pointer;
      color: #ef5350;
      font-weight: bold;
    }

    .add-teammate {
      display: flex;
      gap: 0.4rem;
      margin-top: 0.75rem;
      align-items: center;
    }

    .add-teammate input {
      width: 140px;
    }

    .msg { margin-top: 0.75rem; font-size: 0.85rem; }
    .msg.ok { color: #81c784; }
    .msg.err { color: #ef5350; }
    .empty { color: #666; font-style: italic; }
  `;

  @state() private _players: PlayerFrequency[] = [];
  @state() private _config: PlayerConfig = { me: [], teammates: {} };
  @state() private _selected: Set<string> = new Set();
  @state() private _newTeammateName = '';
  @state() private _msg = '';
  @state() private _msgOk = false;
  @state() private _loading = true;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    try {
      const [players, config] = await Promise.all([getPlayers(), getPlayerConfig()]);
      this._players = players;
      this._config = config;
    } catch (e) {
      this._msg = String(e);
      this._msgOk = false;
    }
    this._loading = false;
  }

  private _toggleSelect(name: string) {
    const next = new Set(this._selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    this._selected = next;
  }

  private _assignMe() {
    if (this._selected.size === 0) return;
    const next = { ...this._config, me: [...new Set([...this._config.me, ...this._selected])] };
    this._config = next;
    this._selected = new Set();
  }

  private _assignTeammate(teammateName: string) {
    if (this._selected.size === 0) return;
    const existing = this._config.teammates[teammateName] || [];
    const next = {
      ...this._config,
      teammates: {
        ...this._config.teammates,
        [teammateName]: [...new Set([...existing, ...this._selected])],
      },
    };
    this._config = next;
    this._selected = new Set();
  }

  private _addTeammate() {
    const name = this._newTeammateName.trim();
    if (!name || name in this._config.teammates) return;
    this._config = {
      ...this._config,
      teammates: { ...this._config.teammates, [name]: [] },
    };
    this._newTeammateName = '';
  }

  private _removeFromMe(playerName: string) {
    this._config = {
      ...this._config,
      me: this._config.me.filter(n => n !== playerName),
    };
  }

  private _removeFromTeammate(teammateName: string, playerName: string) {
    const updated = (this._config.teammates[teammateName] || []).filter(n => n !== playerName);
    const teammates = { ...this._config.teammates };
    if (updated.length === 0) {
      delete teammates[teammateName];
    } else {
      teammates[teammateName] = updated;
    }
    this._config = { ...this._config, teammates };
  }

  private async _save() {
    this._msg = '';
    try {
      await savePlayerConfig(this._config);
      this._msg = 'Config saved.';
      this._msgOk = true;
    } catch (e) {
      this._msg = String(e);
      this._msgOk = false;
    }
  }

  private _roleOf(name: string): string {
    if (this._config.me.includes(name)) return 'me';
    for (const [tm, aliases] of Object.entries(this._config.teammates)) {
      if (aliases.includes(name)) return tm;
    }
    return '';
  }

  render() {
    if (this._loading) return html`<p>Loading...</p>`;

    return html`
      <div class="split">
        <section>
          <h2>Players (by frequency)</h2>
          <div class="actions">
            <button @click=${this._assignMe} ?disabled=${this._selected.size === 0}>
              Assign to Me
            </button>
            ${Object.keys(this._config.teammates).map(tm => html`
              <button @click=${() => this._assignTeammate(tm)} ?disabled=${this._selected.size === 0}>
                Assign to ${tm}
              </button>
            `)}
          </div>
          <div class="player-table">
            <table>
              <thead><tr><th></th><th>Name</th><th>Count</th><th>Role</th></tr></thead>
              <tbody>
                ${this._players.map(p => {
                  const role = this._roleOf(p.name);
                  return html`
                    <tr class="${this._selected.has(p.name) ? 'selected' : ''}"
                        @click=${() => this._toggleSelect(p.name)}
                        style="cursor:pointer">
                      <td><input type="checkbox" .checked=${this._selected.has(p.name)}
                        @click=${(e: Event) => e.stopPropagation()}
                        @change=${() => this._toggleSelect(p.name)}></td>
                      <td>${p.name}</td>
                      <td>${p.count}</td>
                      <td>${role || nothing}</td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Configuration</h2>
          <div class="config-section">
            <div class="config-group">
              <h3>Me</h3>
              <div class="tag-list">
                ${this._config.me.length === 0
                  ? html`<span class="empty">No names assigned</span>`
                  : this._config.me.map(n => html`
                    <span class="tag">${n}
                      <span class="remove" @click=${() => this._removeFromMe(n)}>x</span>
                    </span>
                  `)}
              </div>
            </div>

            ${Object.entries(this._config.teammates).map(([tm, aliases]) => html`
              <div class="config-group">
                <h3>${tm}</h3>
                <div class="tag-list">
                  ${aliases.length === 0
                    ? html`<span class="empty">No names assigned</span>`
                    : aliases.map(n => html`
                      <span class="tag">${n}
                        <span class="remove" @click=${() => this._removeFromTeammate(tm, n)}>x</span>
                      </span>
                    `)}
                </div>
              </div>
            `)}

            <div class="add-teammate">
              <input placeholder="Teammate name"
                .value=${this._newTeammateName}
                @input=${(e: Event) => this._newTeammateName = (e.target as HTMLInputElement).value}
                @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this._addTeammate()}>
              <button @click=${this._addTeammate}>Add Teammate</button>
            </div>

            <button @click=${this._save} style="margin-top:1rem">Save Config</button>

            ${this._msg ? html`<div class="msg ${this._msgOk ? 'ok' : 'err'}">${this._msg}</div>` : ''}
          </div>
        </section>
      </div>
    `;
  }
}

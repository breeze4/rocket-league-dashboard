import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { startSync, getSyncStatus, getSyncHistory, type SyncStatus, type SyncLogEntry } from '../lib/api.js';

@customElement('sync-view')
export class SyncView extends LitElement {
  static styles = css`
    :host { display: block; }

    .controls {
      display: flex;
      gap: 0.75rem;
      align-items: end;
      flex-wrap: wrap;
      margin-bottom: 1.5rem;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .field label {
      font-size: 0.8rem;
      color: #aaa;
    }

    .status-card {
      background: #2a2a4a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 1rem 1.25rem;
    }

    .status-card h3 {
      margin-bottom: 0.5rem;
      font-size: 0.95rem;
      color: #aaa;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 0.75rem;
    }

    .metric {
      text-align: center;
    }

    .metric .value {
      font-size: 1.6rem;
      font-weight: 700;
      color: #fff;
    }

    .metric .label {
      font-size: 0.75rem;
      color: #888;
    }

    .running { color: #ffd54f; }
    .error { color: #ef5350; margin-top: 0.75rem; }
    .idle { color: #81c784; }

    .history { margin-top: 2rem; }
    .history h3 { color: #aaa; font-size: 0.95rem; margin-bottom: 0.75rem; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }

    th, td {
      padding: 0.5rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid #333;
    }

    th { color: #888; font-weight: 600; }
    td { color: #ccc; }

    .status-completed { color: #81c784; }
    .status-failed { color: #ef5350; }
    .status-running { color: #ffd54f; }
  `;

  @state() private _dateAfter = '';
  @state() private _dateBefore = '';
  @state() private _status: SyncStatus | null = null;
  @state() private _error = '';
  @state() private _polling = false;
  @state() private _history: SyncLogEntry[] = [];

  private _pollTimer?: ReturnType<typeof setInterval>;

  connectedCallback() {
    super.connectedCallback();
    this._fetchStatus();
    this._fetchHistory();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopPolling();
  }

  private async _fetchStatus() {
    try {
      this._status = await getSyncStatus();
      if (this._status.running && !this._polling) {
        this._startPolling();
      } else if (!this._status.running && this._polling) {
        this._stopPolling();
      }
    } catch (e) {
      this._error = String(e);
    }
  }

  private _startPolling() {
    this._polling = true;
    this._pollTimer = setInterval(() => this._fetchStatus(), 1000);
  }

  private _stopPolling() {
    this._polling = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
    this._fetchHistory();
  }

  private async _fetchHistory() {
    try {
      this._history = await getSyncHistory();
    } catch { /* ignore */ }
  }

  private async _triggerSync() {
    this._error = '';
    try {
      await startSync({
        replayDateAfter: this._dateAfter || undefined,
        replayDateBefore: this._dateBefore || undefined,
      });
      this._startPolling();
      this._fetchStatus();
    } catch (e) {
      this._error = String(e);
    }
  }

  render() {
    const s = this._status;
    return html`
      <div class="controls">
        <div class="field">
          <label>Date After</label>
          <input type="date" .value=${this._dateAfter}
            @input=${(e: Event) => this._dateAfter = (e.target as HTMLInputElement).value}>
        </div>
        <div class="field">
          <label>Date Before</label>
          <input type="date" .value=${this._dateBefore}
            @input=${(e: Event) => this._dateBefore = (e.target as HTMLInputElement).value}>
        </div>
        <button @click=${this._triggerSync} ?disabled=${s?.running}>
          ${s?.running ? 'Syncing...' : 'Start Sync'}
        </button>
      </div>

      ${s ? html`
        <div class="status-card">
          <h3>
            Status:
            ${s.running
              ? html`<span class="running">Running</span>`
              : html`<span class="idle">Idle</span>`}
          </h3>
          <div class="metrics">
            <div class="metric">
              <div class="value">${s.replays_found}</div>
              <div class="label">Found</div>
            </div>
            <div class="metric">
              <div class="value">${s.replays_fetched}</div>
              <div class="label">Fetched</div>
            </div>
            <div class="metric">
              <div class="value">${s.replays_skipped}</div>
              <div class="label">Skipped</div>
            </div>
          </div>
          ${s.error ? html`<div class="error">${s.error}</div>` : ''}
        </div>
      ` : ''}

      ${this._error ? html`<div class="error">${this._error}</div>` : ''}

      ${this._history.length ? html`
        <div class="history">
          <h3>Sync History</h3>
          <table>
            <thead>
              <tr>
                <th>Date Range</th>
                <th>Started</th>
                <th>Status</th>
                <th>Found</th>
                <th>Fetched</th>
                <th>Skipped</th>
              </tr>
            </thead>
            <tbody>
              ${this._history.map(entry => html`
                <tr>
                  <td>${entry.date_after ?? '∞'} → ${entry.date_before ?? '∞'}</td>
                  <td>${new Date(entry.started_at).toLocaleString()}</td>
                  <td class="status-${entry.status}">${entry.status}</td>
                  <td>${entry.replays_found}</td>
                  <td>${entry.replays_fetched}</td>
                  <td>${entry.replays_skipped}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  }
}

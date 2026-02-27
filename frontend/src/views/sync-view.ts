import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import {
  startSync, getSyncPreview, getSyncStatus, getSyncHistory, getSyncCoverage,
  type SyncStatus, type SyncLogEntry, type SyncCoverage,
} from '../lib/api.js';

/** Format YYYY-MM-DD from year/month/day numbers. */
function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Check if dateStr falls within any synced range. */
function isCovered(dateStr: string, ranges: SyncCoverage['synced_ranges']): boolean {
  for (const r of ranges) {
    const afterOk = r.date_after === null || dateStr >= r.date_after;
    const beforeOk = r.date_before === null || dateStr <= r.date_before;
    if (afterOk && beforeOk) return true;
  }
  return false;
}

/** Return CSS background color for a day cell. */
function dayCellColor(
  dateStr: string,
  replayCounts: Record<string, number>,
  ranges: SyncCoverage['synced_ranges'],
): string {
  const count = replayCounts[dateStr];
  if (count) {
    // Green, intensity scales with count (min 0.3, max 0.9 opacity feel)
    const intensity = Math.min(count / 15, 1);
    const g = Math.round(100 + intensity * 120); // 100..220
    return `rgb(30, ${g}, 60)`;
  }
  if (isCovered(dateStr, ranges)) {
    return '#172554'; // dim blue tint
  }
  return ''; // default (inherit)
}

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
      color: #a1a1aa;
    }

    .status-card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 0.375rem;
      padding: 1rem 1.5rem;
    }

    .status-card h3 {
      margin-bottom: 0.5rem;
      font-size: 0.95rem;
      color: #a1a1aa;
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
      color: #fafafa;
    }

    .metric .label {
      font-size: 0.75rem;
      color: #71717a;
    }

    .running { color: #fbbf24; }
    .error { color: #ef4444; margin-top: 0.75rem; }
    .idle { color: #4ade80; }

    /* Calendar */
    .calendar { margin-bottom: 1.5rem; }
    .calendar h3 {
      color: #a1a1aa;
      font-size: 0.95rem;
      margin-bottom: 0.75rem;
    }

    .calendar-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
    }

    .month {
      min-width: 200px;
    }

    .month-label {
      font-size: 0.8rem;
      color: #71717a;
      margin-bottom: 0.35rem;
      font-weight: 600;
    }

    .month-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
    }

    .dow {
      font-size: 0.65rem;
      color: #52525b;
      text-align: center;
      padding: 0 0 2px;
    }

    .day {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      color: #a1a1aa;
      background: #18181b;
      border-radius: 0.375rem;
      cursor: pointer;
      position: relative;
      user-select: none;
      min-width: 24px;
    }

    .day:hover {
      outline: 1px solid #3b82f6;
      z-index: 1;
    }

    .day.empty {
      background: transparent;
      cursor: default;
    }
    .day.empty:hover {
      outline: none;
    }

    .day.future {
      color: #3f3f46;
      cursor: default;
    }
    .day.future:hover {
      outline: none;
    }

    .day.selected {
      outline: 2px solid #3b82f6;
      z-index: 2;
    }

    .day.in-range {
      outline: 1px solid rgba(59, 130, 246, 0.4);
      box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.15);
    }

    .day .count {
      position: absolute;
      top: 1px;
      right: 2px;
      font-size: 0.5rem;
      color: rgba(255, 255, 255, 0.7);
    }

    .legend {
      display: flex;
      gap: 1rem;
      margin-top: 0.5rem;
      font-size: 0.7rem;
      color: #71717a;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .legend-swatch {
      width: 12px;
      height: 12px;
      border-radius: 0.375rem;
    }

    .history { margin-top: 2rem; }
    .history h3 { color: #a1a1aa; font-size: 0.95rem; margin-bottom: 0.75rem; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }

    th, td {
      padding: 0.5rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid #27272a;
    }

    th { color: #71717a; font-weight: 600; }
    td { color: #a1a1aa; }

    .status-completed { color: #4ade80; }
    .status-failed { color: #ef4444; }
    .status-running { color: #fbbf24; }
  `;

  @state() private _dateAfter = '';
  @state() private _dateBefore = '';
  @state() private _status: SyncStatus | null = null;
  @state() private _error = '';
  @state() private _polling = false;
  @state() private _history: SyncLogEntry[] = [];
  @state() private _coverage: SyncCoverage | null = null;
  /** Tracks click state: 0=none, 1=start selected (waiting for end), 2=range complete */
  @state() private _selectState: 0 | 1 | 2 = 0;
  @state() private _previewCount: number | null = null;
  @state() private _previewing = false;

  private _pollTimer?: ReturnType<typeof setInterval>;

  connectedCallback() {
    super.connectedCallback();
    this._fetchStatus();
    this._fetchHistory();
    this._fetchCoverage();
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
    this._fetchCoverage();
  }

  private async _fetchHistory() {
    try {
      this._history = await getSyncHistory();
    } catch { /* ignore */ }
  }

  private async _fetchCoverage() {
    try {
      this._coverage = await getSyncCoverage();
    } catch { /* ignore */ }
  }

  private async _triggerSync() {
    this._error = '';
    this._previewing = true;
    try {
      const result = await getSyncPreview({
        replayDateAfter: this._dateAfter || undefined,
        replayDateBefore: this._dateBefore || undefined,
      });
      this._previewCount = result.total;
    } catch (e) {
      this._error = String(e);
    } finally {
      this._previewing = false;
    }
  }

  private async _confirmSync() {
    this._error = '';
    this._previewCount = null;
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

  private _cancelPreview() {
    this._previewCount = null;
  }

  private _onDayClick(dateStr: string) {
    if (this._selectState === 0) {
      // First click: set start
      this._dateAfter = dateStr;
      this._dateBefore = '';
      this._selectState = 1;
    } else if (this._selectState === 1) {
      // Second click: set end, ensure order
      if (dateStr < this._dateAfter) {
        this._dateBefore = this._dateAfter;
        this._dateAfter = dateStr;
      } else {
        this._dateBefore = dateStr;
      }
      this._selectState = 2;
    } else {
      // Third click: reset and start fresh
      this._dateAfter = dateStr;
      this._dateBefore = '';
      this._selectState = 1;
    }
  }

  private _onDateInputAfter(e: Event) {
    this._dateAfter = (e.target as HTMLInputElement).value;
    // Reset select state so calendar highlights match
    this._selectState = this._dateAfter && this._dateBefore ? 2 : this._dateAfter ? 1 : 0;
  }

  private _onDateInputBefore(e: Event) {
    this._dateBefore = (e.target as HTMLInputElement).value;
    this._selectState = this._dateAfter && this._dateBefore ? 2 : this._dateAfter ? 1 : 0;
  }

  private _getCalendarMonths(): { year: number; month: number }[] {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Find earliest date from replay data or synced ranges
    let earliest: Date | null = null;
    if (this._coverage) {
      for (const d of Object.keys(this._coverage.replay_counts)) {
        const dt = new Date(d);
        if (!earliest || dt < earliest) earliest = dt;
      }
      for (const r of this._coverage.synced_ranges) {
        if (r.date_after) {
          const dt = new Date(r.date_after);
          if (!earliest || dt < earliest) earliest = dt;
        }
      }
    }

    // Default: 3 months ago
    const threeMonthsAgo = new Date(currentYear, currentMonth - 3, 1);
    const start = earliest && earliest < threeMonthsAgo ? earliest : threeMonthsAgo;

    const months: { year: number; month: number }[] = [];
    let y = start.getFullYear();
    let m = start.getMonth();
    while (y < currentYear || (y === currentYear && m <= currentMonth)) {
      months.push({ year: y, month: m });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return months;
  }

  private _renderMonth(year: number, month: number) {
    const cov = this._coverage;
    const replayCounts = cov?.replay_counts ?? {};
    const ranges = cov?.synced_ranges ?? [];
    const today = new Date();
    const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = new Date(year, month).toLocaleString('default', { month: 'short', year: 'numeric' });

    const cells = [];
    // Empty cells for days before 1st
    for (let i = 0; i < firstDay; i++) {
      cells.push(html`<div class="day empty"></div>`);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = fmtDate(year, month, d);
      const isFuture = dateStr > todayStr;
      const count = replayCounts[dateStr] ?? 0;
      const bg = isFuture ? '' : dayCellColor(dateStr, replayCounts, ranges);

      // Selection highlighting
      const isStart = dateStr === this._dateAfter;
      const isEnd = dateStr === this._dateBefore;
      const isSelected = isStart || isEnd;
      const inRange = this._dateAfter && this._dateBefore
        && dateStr > this._dateAfter && dateStr < this._dateBefore;

      const classes = [
        'day',
        isFuture ? 'future' : '',
        isSelected ? 'selected' : '',
        inRange ? 'in-range' : '',
      ].filter(Boolean).join(' ');

      cells.push(html`
        <div class=${classes}
             style=${bg ? `background: ${bg}` : ''}
             title=${isFuture ? '' : count ? `${count} replays` : isCovered(dateStr, ranges) ? 'Synced, no replays' : 'Not synced'}
             @click=${isFuture ? nothing : () => this._onDayClick(dateStr)}>
          ${d}${count ? html`<span class="count">${count}</span>` : ''}
        </div>
      `);
    }

    return html`
      <div class="month">
        <div class="month-label">${monthName}</div>
        <div class="month-grid">
          ${['S','M','T','W','T','F','S'].map(d => html`<div class="dow">${d}</div>`)}
          ${cells}
        </div>
      </div>
    `;
  }

  render() {
    const s = this._status;
    const months = this._getCalendarMonths();

    return html`
      <div class="controls">
        <div class="field">
          <label>Date After</label>
          <input type="date" .value=${this._dateAfter}
            @input=${this._onDateInputAfter}>
        </div>
        <div class="field">
          <label>Date Before</label>
          <input type="date" .value=${this._dateBefore}
            @input=${this._onDateInputBefore}>
        </div>
        ${this._previewCount !== null ? html`
          <div class="field" style="flex-direction: row; align-items: center; gap: 0.75rem;">
            <strong>${this._previewCount} replays</strong> found. Sync?
            <button @click=${this._confirmSync}>Confirm</button>
            <button @click=${this._cancelPreview}>Cancel</button>
          </div>
        ` : html`
          <button @click=${this._triggerSync} ?disabled=${s?.running || this._previewing}>
            ${s?.running ? 'Syncing...' : this._previewing ? 'Checking...' : 'Start Sync'}
          </button>
        `}
      </div>

      ${this._coverage ? html`
        <div class="calendar">
          <h3>Coverage</h3>
          <div class="calendar-grid">
            ${months.map(m => this._renderMonth(m.year, m.month))}
          </div>
          <div class="legend">
            <div class="legend-item">
              <div class="legend-swatch" style="background: #18181b; border: 1px solid #27272a;"></div>
              Not synced
            </div>
            <div class="legend-item">
              <div class="legend-swatch" style="background: #172554;"></div>
              Synced, no replays
            </div>
            <div class="legend-item">
              <div class="legend-swatch" style="background: rgb(30, 160, 60);"></div>
              Has replays
            </div>
          </div>
        </div>
      ` : ''}

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

import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import * as d3 from 'd3';
import {
  getCorrelationStats,
  type CorrelationResponse,
} from '../lib/api.js';
import {
  analysisStyles,
  renderModeBar,
  renderFilterBar,
  renderPlaylistFilter,
  playlistsFromState,
  DEFAULT_PLAYLIST_STATE,
  type PlaylistState,
  PLAYLIST_OPTIONS,
} from '../lib/analysis-shared.js';

interface StatOption {
  value: string;
  label: string;
}

interface StatGroup {
  label: string;
  options: StatOption[];
}

const STAT_GROUPS: StatGroup[] = [
  {
    label: 'Positioning',
    options: [
      { value: 'percent_behind_ball', label: '% Behind Ball' },
      { value: 'avg_distance_to_ball', label: 'Avg Distance to Ball' },
      { value: 'time_defensive_third', label: 'Time Defensive Third' },
      { value: 'time_offensive_third', label: 'Time Offensive Third' },
    ],
  },
  {
    label: 'Movement',
    options: [
      { value: 'avg_speed', label: 'Avg Speed' },
      { value: 'time_supersonic', label: 'Time Supersonic' },
      { value: 'time_slow_speed', label: 'Time Slow Speed' },
    ],
  },
  {
    label: 'Boost',
    options: [
      { value: 'bpm', label: 'BPM' },
      { value: 'avg_boost_amount', label: 'Avg Boost Amount' },
      { value: 'amount_stolen', label: 'Boost Stolen' },
      { value: 'percent_zero_boost', label: '% Zero Boost' },
      { value: 'percent_full_boost', label: '% Full Boost' },
    ],
  },
  {
    label: 'Core',
    options: [
      { value: 'score', label: 'Score' },
      { value: 'shots', label: 'Shots' },
      { value: 'saves', label: 'Saves' },
      { value: 'shooting_pct', label: 'Shooting %' },
    ],
  },
  {
    label: 'Demo',
    options: [
      { value: 'demos_inflicted', label: 'Demos Inflicted' },
      { value: 'demos_taken', label: 'Demos Taken' },
    ],
  },
];

const ROLE_OPTIONS = [
  { value: 'me', label: 'Me' },
  { value: 'teammates', label: 'Teammates' },
  { value: 'opponents', label: 'Opponents' },
];

@customElement('correlation-view')
export class CorrelationView extends LitElement {
  static styles = [analysisStyles, css`
    .controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .controls select {
      padding: 0.4rem 0.6rem;
      background: #18181b;
      color: #fafafa;
      border: 1px solid #3f3f46;
      border-radius: 6px;
      font-size: 0.95rem;
      cursor: pointer;
    }

    .controls select:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .controls label {
      color: #a1a1aa;
      font-size: 0.95rem;
    }

    optgroup {
      color: #a1a1aa;
      font-style: normal;
    }

    option {
      color: #fafafa;
    }

    .summary {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 1rem;
      color: #a1a1aa;
      font-size: 1rem;
    }

    .summary .value {
      color: #fafafa;
      font-weight: 600;
    }

    .summary .r2-good { color: #4ade80; }
    .summary .r2-mid { color: #fbbf24; }
    .summary .r2-low { color: #71717a; }

    .charts {
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
    }

    .chart-container {
      flex: 1;
      min-width: 380px;
      background: #18181b;
      border-radius: 8px;
      padding: 1rem;
      position: relative;
    }

    .chart-container h3 {
      margin: 0 0 0.75rem 0;
      color: #a1a1aa;
      font-size: 0.95rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    svg {
      display: block;
    }

    .tooltip {
      position: absolute;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 6px;
      padding: 0.4rem 0.6rem;
      font-size: 0.85rem;
      color: #fafafa;
      pointer-events: none;
      white-space: nowrap;
      z-index: 10;
    }
  `];

  @state() private _data: CorrelationResponse | null = null;
  @state() private _error = '';
  @state() private _loading = true;
  @state() private _stat = 'percent_behind_ball';
  @state() private _role = 'me';
  @state() private _teamSize = 2;
  @state() private _excludeZeroZero = true;
  @state() private _excludeShort = true;
  @state() private _playlistState: PlaylistState = { ...DEFAULT_PLAYLIST_STATE };
  @state() private _allModes = false;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      const playlists = playlistsFromState(this._playlistState, this._allModes);
      this._data = await getCorrelationStats({
        stat: this._stat,
        role: this._role,
        teamSize: this._teamSize,
        excludeZeroZero: this._excludeZeroZero,
        minDuration: this._excludeShort ? 90 : undefined,
        playlists: playlists.length ? playlists : undefined,
      });
    } catch (e) {
      this._error = String(e);
    }
    this._loading = false;
  }

  private _setTeamSize(s: number) {
    this._teamSize = s;
    this._load();
  }

  private _statLabel(): string {
    for (const g of STAT_GROUPS)
      for (const o of g.options)
        if (o.value === this._stat) return o.label;
    return this._stat;
  }

  updated(changed: Map<string, unknown>) {
    super.updated(changed);
    if (this._data && !this._loading && !this._error) {
      this._renderScatter();
      this._renderBuckets();
    }
  }

  private _renderScatter() {
    const container = this.renderRoot.querySelector('.scatter-chart') as HTMLElement;
    if (!container) return;
    container.innerHTML = '';
    // Remove any stale tooltip from the chart-container parent
    container.parentElement?.querySelectorAll('.tooltip').forEach(el => el.remove());

    const data = this._data!;
    if (data.points.length === 0) return;

    const width = container.clientWidth || 480;
    const height = 340;
    const margin = { top: 20, right: 20, bottom: 45, left: 50 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xVals = data.points.map(p => p.stat_value);
    const yVals = data.points.map(p => p.goal_diff);

    const xScale = d3.scaleLinear()
      .domain([d3.min(xVals)! * 0.95, d3.max(xVals)! * 1.05])
      .range([0, w]);

    const yExtent = d3.max(yVals.map(Math.abs))! || 1;
    const yScale = d3.scaleLinear()
      .domain([-yExtent - 0.5, yExtent + 0.5])
      .range([h, 0]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .selectAll('line')
      .data(yScale.ticks(8))
      .enter().append('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', '#27272a').attr('stroke-width', 1);

    // Zero line
    g.append('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', yScale(0)).attr('y2', yScale(0))
      .attr('stroke', '#52525b').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,3');

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale).ticks(8))
      .call(g => g.selectAll('text').attr('fill', '#71717a').attr('font-size', '11px'))
      .call(g => g.selectAll('line').attr('stroke', '#3f3f46'))
      .call(g => g.select('.domain').attr('stroke', '#3f3f46'));

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(8).tickFormat(d3.format('+d')))
      .call(g => g.selectAll('text').attr('fill', '#71717a').attr('font-size', '11px'))
      .call(g => g.selectAll('line').attr('stroke', '#3f3f46'))
      .call(g => g.select('.domain').attr('stroke', '#3f3f46'));

    // Axis labels
    svg.append('text')
      .attr('x', margin.left + w / 2)
      .attr('y', height - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#71717a')
      .attr('font-size', '12px')
      .text(this._statLabel());

    svg.append('text')
      .attr('transform', `rotate(-90)`)
      .attr('x', -(margin.top + h / 2))
      .attr('y', 14)
      .attr('text-anchor', 'middle')
      .attr('fill', '#71717a')
      .attr('font-size', '12px')
      .text('Goal Diff');

    // Trend line
    const reg = data.regression;
    const xMin = d3.min(xVals)!;
    const xMax = d3.max(xVals)!;
    g.append('line')
      .attr('x1', xScale(xMin))
      .attr('y1', yScale(reg.slope * xMin + reg.intercept))
      .attr('x2', xScale(xMax))
      .attr('y2', yScale(reg.slope * xMax + reg.intercept))
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6,3')
      .attr('opacity', 0.8);

    // Tooltip — appended to chart-container (positioned relative)
    const chartContainer = container.parentElement!;
    const tooltip = d3.select(chartContainer)
      .append('div')
      .attr('class', 'tooltip')
      .style('display', 'none');

    // Dots
    g.selectAll('circle')
      .data(data.points)
      .enter().append('circle')
      .attr('cx', d => xScale(d.stat_value))
      .attr('cy', d => yScale(d.goal_diff))
      .attr('r', 4.5)
      .attr('fill', d => d.goal_diff > 0 ? '#4ade80' : d.goal_diff < 0 ? '#ef4444' : '#52525b')
      .attr('opacity', 0.7)
      .attr('stroke', 'none')
      .on('mouseenter', (event: MouseEvent, d) => {
        const rect = chartContainer.getBoundingClientRect();
        tooltip
          .style('display', 'block')
          .html(`${this._statLabel()}: ${Number(d.stat_value.toFixed(1))}<br>Goal diff: ${d.goal_diff > 0 ? '+' : ''}${d.goal_diff}`)
          .style('left', `${event.clientX - rect.left + 12}px`)
          .style('top', `${event.clientY - rect.top - 10}px`);
        d3.select(event.currentTarget as Element).attr('opacity', 1).attr('r', 6);
      })
      .on('mouseleave', (event) => {
        tooltip.style('display', 'none');
        d3.select(event.currentTarget as Element).attr('opacity', 0.7).attr('r', 4.5);
      });
  }

  private _renderBuckets() {
    const container = this.renderRoot.querySelector('.bucket-chart') as HTMLElement;
    if (!container) return;
    container.innerHTML = '';
    container.parentElement?.querySelectorAll('.tooltip').forEach(el => el.remove());

    const data = this._data!;
    if (data.buckets.length === 0) return;

    const width = container.clientWidth || 480;
    const height = 340;
    const margin = { top: 20, right: 20, bottom: 55, left: 50 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleBand()
      .domain(data.buckets.map(b => b.label))
      .range([0, w])
      .padding(0.15);

    const yScale = d3.scaleLinear()
      .domain([0, 100])
      .range([h, 0]);

    // Grid lines
    g.append('g')
      .selectAll('line')
      .data([20, 40, 50, 60, 80, 100])
      .enter().append('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', d => d === 50 ? '#52525b' : '#27272a')
      .attr('stroke-width', d => d === 50 ? 1.5 : 1)
      .attr('stroke-dasharray', d => d === 50 ? '4,3' : 'none');

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale))
      .call(g => g.selectAll('text')
        .attr('fill', '#71717a')
        .attr('font-size', '10px')
        .attr('transform', 'rotate(-35)')
        .attr('text-anchor', 'end'))
      .call(g => g.selectAll('line').attr('stroke', '#3f3f46'))
      .call(g => g.select('.domain').attr('stroke', '#3f3f46'));

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${d}%`))
      .call(g => g.selectAll('text').attr('fill', '#71717a').attr('font-size', '11px'))
      .call(g => g.selectAll('line').attr('stroke', '#3f3f46'))
      .call(g => g.select('.domain').attr('stroke', '#3f3f46'));

    // Axis labels
    svg.append('text')
      .attr('x', margin.left + w / 2)
      .attr('y', height - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#71717a')
      .attr('font-size', '12px')
      .text(this._statLabel());

    svg.append('text')
      .attr('transform', `rotate(-90)`)
      .attr('x', -(margin.top + h / 2))
      .attr('y', 14)
      .attr('text-anchor', 'middle')
      .attr('fill', '#71717a')
      .attr('font-size', '12px')
      .text('Win Rate');

    // Color scale for bars: red (0% win) -> yellow (50%) -> green (100%)
    const barColor = (wr: number) => {
      const t = wr / 100;
      if (t < 0.5) {
        const r = Math.round(239 - 100 * (t / 0.5));
        const g = Math.round(68 + 123 * (t / 0.5));
        const b = Math.round(68 - 30 * (t / 0.5));
        return `rgb(${r},${g},${b})`;
      }
      const r = Math.round(139 - 65 * ((t - 0.5) / 0.5));
      const gr = Math.round(191 + 27 * ((t - 0.5) / 0.5));
      const b = Math.round(38 + 90 * ((t - 0.5) / 0.5));
      return `rgb(${r},${gr},${b})`;
    };

    // Tooltip — appended to chart-container (positioned relative)
    const chartContainer = container.parentElement!;
    const tooltip = d3.select(chartContainer)
      .append('div')
      .attr('class', 'tooltip')
      .style('display', 'none');

    // Bars
    g.selectAll('rect')
      .data(data.buckets)
      .enter().append('rect')
      .attr('x', d => xScale(d.label)!)
      .attr('y', d => yScale(d.win_rate))
      .attr('width', xScale.bandwidth())
      .attr('height', d => h - yScale(d.win_rate))
      .attr('fill', d => barColor(d.win_rate))
      .attr('rx', 2)
      .attr('opacity', 0.85)
      .on('mouseenter', (event: MouseEvent, d) => {
        const rect = chartContainer.getBoundingClientRect();
        tooltip
          .style('display', 'block')
          .html(`${d.label}<br>Win rate: ${d.win_rate}%<br>${d.wins}W / ${d.losses}L / ${d.draws}D (${d.games} games)`)
          .style('left', `${event.clientX - rect.left + 12}px`)
          .style('top', `${event.clientY - rect.top - 10}px`);
        d3.select(event.currentTarget as Element).attr('opacity', 1);
      })
      .on('mouseleave', (event) => {
        tooltip.style('display', 'none');
        d3.select(event.currentTarget as Element).attr('opacity', 0.85);
      });

    // Game count labels on bars
    g.selectAll('.count-label')
      .data(data.buckets)
      .enter().append('text')
      .attr('x', d => xScale(d.label)! + xScale.bandwidth() / 2)
      .attr('y', d => yScale(d.win_rate) - 5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#71717a')
      .attr('font-size', '10px')
      .text(d => d.games);
  }

  render() {
    const playlistFilter = renderPlaylistFilter(
      this._playlistState,
      this._allModes,
      (key) => { this._playlistState = { ...this._playlistState, [key]: !this._playlistState[key] }; this._load(); },
      () => { this._allModes = !this._allModes; this._load(); },
    );
    const filterBar = renderFilterBar(
      this._excludeZeroZero,
      this._excludeShort,
      () => { this._excludeZeroZero = !this._excludeZeroZero; this._load(); },
      () => { this._excludeShort = !this._excludeShort; this._load(); },
    );

    if (this._loading) return html`
      ${renderModeBar(this._teamSize, (s) => this._setTeamSize(s))}
      ${playlistFilter}
      ${filterBar}
      <p style="color:#a1a1aa">Loading...</p>
    `;

    if (this._error) return html`
      ${renderModeBar(this._teamSize, (s) => this._setTeamSize(s))}
      ${playlistFilter}
      ${filterBar}
      <div class="error">${this._error}</div>
      <button @click=${() => this._load()} style="color:#fafafa;background:#3f3f46;border:none;padding:0.4rem 1rem;border-radius:6px;cursor:pointer">Retry</button>
    `;

    const data = this._data;
    const r2 = data?.regression.r_squared ?? 0;
    const r2Class = r2 >= 0.3 ? 'r2-good' : r2 >= 0.1 ? 'r2-mid' : 'r2-low';
    const wins = data?.points.filter(p => p.won).length ?? 0;
    const totalGames = data?.games ?? 0;
    const winRate = totalGames > 0 ? (wins / totalGames * 100).toFixed(1) : '0';

    return html`
      ${renderModeBar(this._teamSize, (s) => this._setTeamSize(s))}
      ${playlistFilter}
      ${filterBar}

      <div class="controls">
        <label>Stat:
          <select @change=${(e: Event) => { this._stat = (e.target as HTMLSelectElement).value; this._load(); }}>
            ${STAT_GROUPS.map(g => html`
              <optgroup label=${g.label}>
                ${g.options.map(o => html`
                  <option value=${o.value} ?selected=${o.value === this._stat}>${o.label}</option>
                `)}
              </optgroup>
            `)}
          </select>
        </label>
        <label>Role:
          <select @change=${(e: Event) => { this._role = (e.target as HTMLSelectElement).value; this._load(); }}>
            ${ROLE_OPTIONS.map(o => html`
              <option value=${o.value} ?selected=${o.value === this._role}>${o.label}</option>
            `)}
          </select>
        </label>
      </div>

      ${totalGames === 0 ? html`
        <div class="empty">No data for ${this._teamSize}v${this._teamSize}.</div>
      ` : html`
        <div class="summary">
          <span><span class="value">${totalGames}</span> games</span>
          <span>r² = <span class="value ${r2Class}">${r2.toFixed(3)}</span></span>
          <span>Win rate: <span class="value">${winRate}%</span></span>
          <span>Slope: <span class="value">${data!.regression.slope > 0 ? '+' : ''}${data!.regression.slope.toFixed(3)}</span></span>
        </div>

        <div class="charts">
          <div class="chart-container">
            <h3>Stat vs Goal Differential</h3>
            <div class="scatter-chart"></div>
          </div>
          <div class="chart-container">
            <h3>Win Rate by Range</h3>
            <div class="bucket-chart"></div>
          </div>
        </div>
      `}
    `;
  }
}

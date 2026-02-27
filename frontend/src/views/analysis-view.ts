import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { navigate } from '../lib/router.js';

import './scoreline-view.js';
import './game-analysis-view.js';
import './correlation-view.js';

type SubView = 'scoreline' | 'games' | 'correlation';

const VALID_SUBS: SubView[] = ['scoreline', 'games', 'correlation'];

@customElement('analysis-view')
export class AnalysisView extends LitElement {
  static styles = css`
    :host { display: block; }

    .sub-nav {
      display: flex;
      gap: 0;
      margin-bottom: 1rem;
      border: 1px solid #3f3f46;
      border-radius: 6px;
      overflow: hidden;
      width: fit-content;
    }

    .sub-nav button {
      padding: 0.45rem 1.2rem;
      background: transparent;
      border: none;
      color: #a1a1aa;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      border-right: 1px solid #3f3f46;
    }

    .sub-nav button:last-child { border-right: none; }
    .sub-nav button:hover { background: #27272a; }

    .sub-nav button.active {
      background: #3f3f46;
      color: #fafafa;
    }
  `;

  @property() sub: string | null = null;

  private get _activeView(): SubView {
    if (this.sub && VALID_SUBS.includes(this.sub as SubView)) {
      return this.sub as SubView;
    }
    return 'scoreline';
  }

  connectedCallback() {
    super.connectedCallback();
    // Redirect /analysis to /analysis/scoreline (replace, not push — avoids extra history entry)
    if (!this.sub || !VALID_SUBS.includes(this.sub as SubView)) {
      const url = '/analysis/scoreline' + location.search;
      history.replaceState(null, '', url);
      window.dispatchEvent(new Event('route-changed'));
    }
  }

  willUpdate(changed: Map<string, unknown>) {
    if (changed.has('sub') && (!this.sub || !VALID_SUBS.includes(this.sub as SubView))) {
      const url = '/analysis/scoreline' + location.search;
      history.replaceState(null, '', url);
      window.dispatchEvent(new Event('route-changed'));
    }
  }

  private _navigate(sub: SubView) {
    navigate('/analysis/' + sub + location.search);
  }

  render() {
    const view = this._activeView;
    return html`
      <div class="sub-nav">
        <button class="${view === 'scoreline' ? 'active' : ''}"
                @click=${() => this._navigate('scoreline')}>Per Scoreline</button>
        <button class="${view === 'games' ? 'active' : ''}"
                @click=${() => this._navigate('games')}>Per Game</button>
        <button class="${view === 'correlation' ? 'active' : ''}"
                @click=${() => this._navigate('correlation')}>Correlations</button>
      </div>
      ${view === 'scoreline'
        ? html`<scoreline-view></scoreline-view>`
        : view === 'games'
        ? html`<game-analysis-view></game-analysis-view>`
        : html`<correlation-view></correlation-view>`}
    `;
  }
}

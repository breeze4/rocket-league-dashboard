import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import './scoreline-view.js';
import './game-analysis-view.js';
import './correlation-view.js';

type SubView = 'scoreline' | 'games' | 'correlation';

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

  @state() private _subView: SubView = 'scoreline';

  render() {
    return html`
      <div class="sub-nav">
        <button class="${this._subView === 'scoreline' ? 'active' : ''}"
                @click=${() => this._subView = 'scoreline'}>Per Scoreline</button>
        <button class="${this._subView === 'games' ? 'active' : ''}"
                @click=${() => this._subView = 'games'}>Per Game</button>
        <button class="${this._subView === 'correlation' ? 'active' : ''}"
                @click=${() => this._subView = 'correlation'}>Correlations</button>
      </div>
      ${this._subView === 'scoreline'
        ? html`<scoreline-view></scoreline-view>`
        : this._subView === 'games'
        ? html`<game-analysis-view></game-analysis-view>`
        : html`<correlation-view></correlation-view>`}
    `;
  }
}

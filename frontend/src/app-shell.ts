import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigate, getRoute } from './lib/router.js';

import './views/sync-view.js';
import './views/players-view.js';
import './views/stats-view.js';
import './views/replays-view.js';
import './views/analysis-view.js';

type Tab = 'sync' | 'players' | 'stats' | 'analysis' | 'replays';

const TABS: { id: Tab; label: string }[] = [
  { id: 'sync', label: 'Sync' },
  { id: 'players', label: 'Players' },
  { id: 'stats', label: 'Stats' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'replays', label: 'Replays' },
];

@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = css`
    :host {
      display: block;
      max-width: 1100px;
      margin: 0 auto;
      padding: 1.5rem 0;
    }

    header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #27272a;
    }

    h1 {
      font-size: 1.3rem;
      font-weight: 700;
      color: #fafafa;
      margin-right: auto;
    }

    nav {
      display: flex;
      gap: 0.25rem;
    }

    nav button {
      padding: 0.5rem 1rem;
      border: none;
      background: transparent;
      color: #a1a1aa;
      border-radius: 0.375rem;
      font-weight: 500;
      font-size: 0.875rem;
    }

    nav button:hover {
      background: #27272a;
      color: #fafafa;
    }

    nav button[aria-selected="true"] {
      background: #27272a;
      color: #fafafa;
    }

    main {
      min-height: 400px;
    }
  `;

  @state() private _tab: Tab = 'sync';
  @state() private _sub: string | null = null;

  private _onRouteChanged = () => {
    const route = getRoute();
    this._tab = route.tab as Tab;
    this._sub = route.sub;
  };

  connectedCallback() {
    super.connectedCallback();
    this._onRouteChanged();
    // Redirect bare / to /sync
    if (location.pathname === '/' || location.pathname === '') {
      navigate('/sync');
    }
    window.addEventListener('route-changed', this._onRouteChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('route-changed', this._onRouteChanged);
  }

  private _renderView() {
    switch (this._tab) {
      case 'sync': return html`<sync-view></sync-view>`;
      case 'players': return html`<players-view></players-view>`;
      case 'stats': return html`<stats-view></stats-view>`;
      case 'analysis': return html`<analysis-view .sub=${this._sub}></analysis-view>`;
      case 'replays': return html`<replays-view .replayId=${this._sub}></replays-view>`;
    }
  }

  render() {
    return html`
      <header>
        <h1>Ballchasing Stats</h1>
        <nav>
          ${TABS.map(t => html`
            <button
              aria-selected="${this._tab === t.id}"
              @click=${() => navigate(`/${t.id}`)}
            >${t.label}</button>
          `)}
        </nav>
      </header>
      <main>${this._renderView()}</main>
    `;
  }
}

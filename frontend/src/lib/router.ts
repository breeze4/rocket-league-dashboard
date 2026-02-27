export interface Route {
  tab: string;
  sub: string | null;
}

const VALID_TABS = ['sync', 'players', 'stats', 'analysis', 'replays'];

export function getRoute(): Route {
  const parts = location.pathname.split('/').filter(Boolean);
  const tab = parts[0] || '';
  if (!VALID_TABS.includes(tab)) {
    return { tab: 'sync', sub: null };
  }
  return { tab, sub: parts[1] || null };
}

export function navigate(path: string) {
  if (location.pathname === path) return;
  history.pushState(null, '', path);
  window.dispatchEvent(new Event('route-changed'));
}

// Back/forward button support
window.addEventListener('popstate', () => {
  window.dispatchEvent(new Event('route-changed'));
});

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

/** Read current URL search params. */
export function getSearchParams(): URLSearchParams {
  return new URLSearchParams(location.search);
}

/**
 * Update URL query params via replaceState (no history entry).
 * Pass null to remove a param. Params with empty string values are also removed.
 */
export function replaceSearchParams(updates: Record<string, string | null>) {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const url = location.pathname + (search ? '?' + search : '');
  history.replaceState(null, '', url);
}

/**
 * Navigate to a new path (pushState). The path may include a query string.
 * Compares full pathname+search to avoid no-op pushes.
 */
export function navigate(path: string) {
  const current = location.pathname + location.search;
  if (current === path) return;
  history.pushState(null, '', path);
  window.dispatchEvent(new Event('route-changed'));
}

// Back/forward button support
window.addEventListener('popstate', () => {
  window.dispatchEvent(new Event('route-changed'));
});

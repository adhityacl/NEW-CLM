import { getCachedAccessToken } from './googleAuthService';

export const getAuthHeaders = () => {
  const token = getCachedAccessToken();
  const sessionToken = typeof window !== 'undefined' ? localStorage.getItem('auth_session_token') : null;
  const activeOrgId = typeof window !== 'undefined' ? localStorage.getItem('activeOrganizationId') : null;
  const googleProfileStr = typeof window !== 'undefined' ? localStorage.getItem('google_user_profile') : null;
  const authUserStr = typeof window !== 'undefined' ? localStorage.getItem('auth_user') : null;
  let userEmail = '';
  let userName = '';
  let userRole = '';
  if (authUserStr) {
    try {
      const u = JSON.parse(authUserStr);
      userEmail = u.email || '';
      userName = u.name || '';
      userRole = u.role || '';
    } catch {}
  }
  if (!userEmail && googleProfileStr) {
    try {
      const p = JSON.parse(googleProfileStr);
      userEmail = p.email || '';
      userName = p.name || '';
    } catch {}
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['x-google-access-token'] = token;
  }
  if (userEmail) {
    headers['x-user-email'] = userEmail;
    headers['x-google-user-email'] = userEmail;
  }
  if (userName) {
    headers['x-user-name'] = userName;
  }
  if (userRole) {
    headers['x-user-role'] = userRole;
    headers['x-role'] = userRole;
  }
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
    headers['x-session-token'] = sessionToken;
  }
  if (activeOrgId) {
    headers['x-tenant-id'] = activeOrgId;
    headers['x-organization-id'] = activeOrgId;
  }
  return headers;
};

/**
 * Adds the session token and active organization to every same-origin
 * `/api/*` and `/uploads/*` request that does not set them explicitly.
 *
 * The server requires an authenticated session for all data and AI
 * endpoints; many views call `fetch('/api/...')` directly, so this keeps
 * them working without threading headers through every call site.
 */
let installed = false;

function isSameOriginApi(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/uploads/'));
  } catch {
    return false;
  }
}

export function installApiFetchInterceptor(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const originalFetch = window.fetch.bind(window);

  const interceptedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!isSameOriginApi(url)) return originalFetch(input, init);

    let token: string | null = null;
    let organizationId: string | null = null;
    try {
      token = localStorage.getItem('auth_session_token');
      organizationId = localStorage.getItem('activeOrganizationId');
    } catch {
      /* storage unavailable (private mode) — send the request unchanged */
    }

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    if (token && !headers.has('x-session-token')) headers.set('x-session-token', token);
    if (organizationId && !headers.has('x-organization-id')) headers.set('x-organization-id', organizationId);

    return originalFetch(input, { ...init, headers, credentials: init?.credentials ?? 'include' });
  };

  try {
    window.fetch = interceptedFetch;
  } catch {
    try {
      Object.defineProperty(window, 'fetch', {
        configurable: true,
        enumerable: true,
        value: interceptedFetch,
        writable: true,
      });
    } catch {
      return;
    }
  }

  installed = true;
}

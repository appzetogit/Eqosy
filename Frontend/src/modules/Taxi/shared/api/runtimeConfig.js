const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const isBrowser = typeof window !== 'undefined';
const isBrowserLocal = isBrowser && LOCAL_HOSTS.has(window.location.hostname);

const sanitizeHost = (urlStr) => {
  if (!urlStr) return '';
  if (isBrowser && !isBrowserLocal) {
    try {
      const parsed = new URL(urlStr, window.location.origin);
      if (LOCAL_HOSTS.has(parsed.hostname)) {
        return window.location.origin;
      }
    } catch (_) {}
  }
  return urlStr;
};

const DEFAULT_BACKEND_ORIGIN = isBrowser && !isBrowserLocal ? window.location.origin : 'http://localhost:5000';

const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

const configuredBase = import.meta.env.VITE_API_BASE_URL
  ? sanitizeHost(import.meta.env.VITE_API_BASE_URL)
  : '/api/v1';

const rawApiBase = trimTrailingSlash(configuredBase || `${DEFAULT_BACKEND_ORIGIN}/api/v1`);
export const API_BASE_URL = rawApiBase.endsWith('/taxi') ? rawApiBase : `${rawApiBase}/taxi`;

export const BACKEND_ORIGIN = trimTrailingSlash(
  sanitizeHost(
    import.meta.env.VITE_BACKEND_ORIGIN ||
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_ASSET_BASE_URL,
  ) || API_BASE_URL.replace(/\/api(?:\/v1)?(?:\/taxi)?$/, '') || DEFAULT_BACKEND_ORIGIN,
);

export const BACKEND_LABEL = BACKEND_ORIGIN || DEFAULT_BACKEND_ORIGIN;

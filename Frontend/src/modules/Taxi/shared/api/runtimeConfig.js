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

const configuredBase = import.meta.env.VITE_API_BASE_URL
  ? sanitizeHost(import.meta.env.VITE_API_BASE_URL)
  : '/api/v1';

const relativeOrigin = isBrowser ? window.location.origin : DEFAULT_BACKEND_ORIGIN;

const rawApiBase = configuredBase && configuredBase.startsWith('http')
  ? trimTrailingSlash(configuredBase)
  : trimTrailingSlash(`${relativeOrigin}${configuredBase ? (configuredBase.startsWith('/') ? configuredBase : '/' + configuredBase) : '/api/v1'}`);

export const API_BASE_URL = rawApiBase.endsWith('/taxi') ? rawApiBase : `${rawApiBase}/taxi`;

const derivedOrigin = API_BASE_URL.startsWith('http')
  ? API_BASE_URL.replace(/\/api(?:\/v1)?(?:\/taxi)?$/, '')
  : relativeOrigin;

export const BACKEND_ORIGIN = trimTrailingSlash(
  sanitizeHost(
    import.meta.env.VITE_BACKEND_ORIGIN ||
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_ASSET_BASE_URL,
  ) || derivedOrigin || DEFAULT_BACKEND_ORIGIN,
);

export const BACKEND_LABEL = BACKEND_ORIGIN || DEFAULT_BACKEND_ORIGIN;

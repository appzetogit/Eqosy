/**
 * One place that turns any failed API call into a message a normal user can understand.
 * Used by both axios clients (Food/Delivery and Taxi) so every screen gets the same wording.
 */

export const UPLOAD_TIMEOUT_MS = 180000;

const isFormData = (data) => typeof FormData !== 'undefined' && data instanceof FormData;

/** File uploads (documents, photos) need far longer than the normal 30s timeout. */
export const applyUploadTimeout = (config) => {
  if (config && isFormData(config.data) && (!config.timeout || config.timeout <= 30000)) {
    config.timeout = UPLOAD_TIMEOUT_MS;
  }
  return config;
};

const STATUS_MESSAGES = {
  400: 'Some details are missing or incorrect. Please check and try again.',
  401: 'Your session has expired. Please log in again.',
  403: 'You do not have permission to do this.',
  404: 'We could not find what you asked for.',
  408: 'The request took too long. Please try again.',
  409: 'This was already done or has changed. Please refresh and try again.',
  413: 'The file is too large. Please choose a smaller photo or file.',
  422: 'Some details are missing or incorrect. Please check and try again.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again in a moment.',
  502: 'Our server is busy right now. Please try again in a moment.',
  503: 'Our server is busy right now. Please try again in a moment.',
  504: 'The server took too long to respond. Please try again.',
};

const isTechnical = (text = '') =>
  /timeout of \d+ms|network error|status code \d+|ECONN|ETIMEDOUT|ERR_|undefined|\[object/i.test(text);

/**
 * @returns {{ kind: 'timeout'|'offline'|'server'|'rate_limit'|'client', message: string, notify: boolean }}
 *  notify = true when the failure is something the page itself usually can't explain (timeouts, offline,
 *  server errors, rate limits), so the client should show a toast.
 */
export const describeApiFailure = (error) => {
  const status = Number(error?.response?.status || error?.status || 0);
  const code = error?.code;
  const serverText = String(
    error?.response?.data?.message || error?.response?.data?.error || error?.message || '',
  ).trim();

  if (!status && (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout/i.test(serverText))) {
    return {
      kind: 'timeout',
      message: 'This is taking longer than expected. Please check your internet connection and try again.',
      notify: true,
    };
  }
  if (!status && (code === 'ERR_NETWORK' || /network error|server down/i.test(serverText) ||
      (typeof navigator !== 'undefined' && navigator.onLine === false))) {
    return { kind: 'offline', message: 'No internet connection. Please check your network and try again.', notify: true };
  }
  if (status === 429) return { kind: 'rate_limit', message: STATUS_MESSAGES[429], notify: true };
  if (status >= 500) {
    const useServerText = serverText && !isTechnical(serverText) && serverText.length < 140;
    return { kind: 'server', message: useServerText ? serverText : (STATUS_MESSAGES[status] || STATUS_MESSAGES[500]), notify: true };
  }

  const message = serverText && !isTechnical(serverText) ? serverText : (STATUS_MESSAGES[status] || 'Something went wrong. Please try again.');
  return { kind: 'client', message, notify: false };
};

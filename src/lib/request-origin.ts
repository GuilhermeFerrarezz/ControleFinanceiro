function normalizeOrigin(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function trustedOrigin(request: Request, configuredOrigin = process.env.APP_ORIGIN) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  // Non-browser clients may omit Origin; browser requests must match our origin.
  if (!origin) return true;
  const source = normalizeOrigin(origin);
  if (!source) return false;
  if (configuredOrigin?.trim()) return source === normalizeOrigin(configuredOrigin.trim());

  const internalUrl = new URL(request.url);
  // Next.js can give Route Handlers an internal localhost URL even when the
  // browser uses a LAN IP. Host carries the address the browser actually used.
  // Do not trust X-Forwarded-Host from clients; deployments behind a reverse
  // proxy can explicitly pin their public origin with APP_ORIGIN.
  const host = request.headers.get('host') || internalUrl.host;
  if (/[\s\\/@?#]/.test(host)) return false;
  return source === normalizeOrigin(`${internalUrl.protocol}//${host}`);
}

const API_BASE = 'https://api.yocinema.dpdns.org/api/v1';

function sendError(res, status, message, code = 'YOCINEMA_ERROR') {
  return res.status(status).json({ error: message, code });
}

module.exports = async function yocinemaHandler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(204).end();
  }
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }
  const apiKey = String(process.env.YOCINEMA_API_KEY || '').trim();
  if (!apiKey) return sendError(res, 503, 'YOCINEMA_API_KEY is not configured', 'YOCINEMA_API_KEY_MISSING');

  const rawPath = String((req.query && req.query.path) || '').replace(/^\/+|\/+$/g, '');
  if (!rawPath || rawPath.includes('..') || !/^[a-zA-Z0-9_/?=&.%:-]+$/.test(rawPath)) {
    return sendError(res, 400, 'A valid YOCINEMA API path is required', 'YOCINEMA_PATH_INVALID');
  }

  const url = new URL(`${API_BASE}/${rawPath}`);
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key !== 'path' && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const headers = { Accept: 'application/json', 'X-API-Key': apiKey };
  const init = { method: req.method, headers };
  if (req.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(req.body && typeof req.body === 'object' ? req.body : {});
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    init.signal = controller.signal;
    const upstream = await fetch(url, init);
    clearTimeout(timeout);
    const text = await upstream.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch {}
    if (parsed && parsed.success === false) {
      const nested = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
      return sendError(res, upstream.status || 502, nested.error || parsed.error || 'YOCINEMA upstream request failed', nested.code || parsed.code || 'YOCINEMA_API_ERROR');
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.status(upstream.status).send(text);
  } catch (error) {
    return sendError(res, 502, error?.name === 'AbortError' ? 'YOCINEMA request timed out' : (error && error.message ? error.message : 'YOCINEMA upstream request failed'), error?.name === 'AbortError' ? 'YOCINEMA_TIMEOUT' : 'YOCINEMA_UPSTREAM_ERROR');
  }
};

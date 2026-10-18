const ALLOWED_PATH = /^tracks$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const pathParts = Array.isArray(req.query.path) ? req.query.path : [req.query.path];
  const path = pathParts.filter(Boolean).join('/');
  if (!ALLOWED_PATH.test(path)) return res.status(400).json({ error: 'INVALID_JAMENDO_PATH' });

  const clientId = process.env.JAMENDO_CLIENT_ID || process.env.JAMENDO_API_KEY;
  if (!clientId) return res.status(500).json({ error: 'JAMENDO_CLIENT_ID_MISSING' });

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null) params.append(key, String(item));
    }
  }
  params.set('client_id', clientId);
  params.set('format', 'json');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetch(`https://api.jamendo.com/v3.0/${path}?${params}`, {
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
    } finally { clearTimeout(timeout); }
    const body = await response.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch {}
    if (parsed && parsed.headers && String(parsed.headers.status).toLowerCase() === 'failed') {
      const message = parsed.headers.error_message || 'JAMENDO_UPSTREAM_REQUEST_FAILED';
      return res.status(502).json({ error: message, code: parsed.headers.code || 'JAMENDO_UPSTREAM_ERROR' });
    }
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(response.status).send(body);
  } catch (error) {
    console.error('Jamendo proxy request failed', error);
    return res.status(502).json({ error: error?.name === 'AbortError' ? 'JAMENDO_UPSTREAM_TIMEOUT' : 'JAMENDO_UPSTREAM_UNAVAILABLE' });
  }
};

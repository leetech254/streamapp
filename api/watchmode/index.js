const WATCHMODE_BASE = 'https://api.watchmode.com/v1';
const REGION_PATTERN = /^[A-Z]{2}$/;

function errorResponse(res, status, error, code = 'WATCHMODE_ERROR') {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error, code });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return errorResponse(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  const apiKey = String(process.env.WATCHMODE_API_KEY || '').trim();
  if (!apiKey) return errorResponse(res, 503, 'Watchmode is not configured', 'WATCHMODE_API_KEY_MISSING');

  const type = String(req.query.type || 'movie').toLowerCase();
  const tmdbId = String(req.query.tmdbId || '').trim();
  if (!['movie', 'tv'].includes(type) || !/^\d+$/.test(tmdbId)) {
    return errorResponse(res, 400, 'A valid TMDB movie or TV id is required', 'WATCHMODE_ID_INVALID');
  }

  const rawRegions = String(req.query.regions || 'US')
    .toUpperCase()
    .split(/[\s,]+/)
    .filter(Boolean);
  const regions = [...new Set(rawRegions)].filter(region => REGION_PATTERN.test(region)).slice(0, 3);
  if (!regions.length) return errorResponse(res, 400, 'At least one valid ISO country code is required', 'WATCHMODE_REGIONS_INVALID');

  const url = new URL(`${WATCHMODE_BASE}/title/${type}-${tmdbId}/sources/`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', regions.join(','));

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'StreamHD/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    const body = await upstream.text();
    let payload;
    try { payload = JSON.parse(body); } catch { payload = null; }
    if (!upstream.ok) {
      const message = payload?.error_message || payload?.message || `Watchmode returned HTTP ${upstream.status}`;
      return errorResponse(res, upstream.status >= 500 ? 502 : upstream.status, message, 'WATCHMODE_UPSTREAM_ERROR');
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json({
      sources: Array.isArray(payload) ? payload : [],
      regions,
      type,
      tmdbId,
      attributionRequired: true
    });
  } catch (error) {
    return errorResponse(res, error?.name === 'TimeoutError' ? 504 : 502, error?.name === 'TimeoutError' ? 'Watchmode request timed out' : 'Watchmode is temporarily unavailable', error?.name === 'TimeoutError' ? 'WATCHMODE_TIMEOUT' : 'WATCHMODE_UNAVAILABLE');
  }
};

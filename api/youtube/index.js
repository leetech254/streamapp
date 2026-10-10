const API_BASE = 'https://www.googleapis.com/youtube/v3';

function errorResponse(res, status, message, code) {
  return res.status(status).json({ error: message, code });
}

module.exports = async function youtubeHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return errorResponse(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }
  const apiKey = String(process.env.YOUTUBE_API_KEY || '').trim();
  if (!apiKey) return errorResponse(res, 503, 'YOUTUBE_API_KEY is not configured', 'YOUTUBE_API_KEY_MISSING');

  const query = String((req.query && req.query.q) || '').trim();
  if (!query) return errorResponse(res, 400, 'A search query is required', 'YOUTUBE_QUERY_MISSING');
  const url = new URL(`${API_BASE}/search`);
  url.search = new URLSearchParams({
    part: 'snippet',
    type: 'channel',
    q: query,
    maxResults: String(Math.min(Math.max(Number(req.query.maxResults) || 25, 1), 50)),
    regionCode: 'KE',
    relevanceLanguage: 'en',
    key: apiKey
  }).toString();

  try {
    const upstream = await fetch(url);
    const text = await upstream.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { error: text }; }
    if (!upstream.ok) return errorResponse(res, upstream.status, body.error?.message || 'YouTube API request failed', 'YOUTUBE_API_ERROR');
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300');
    return res.status(200).json(body);
  } catch (error) {
    return errorResponse(res, 502, error && error.message ? error.message : 'YouTube API unavailable', 'YOUTUBE_UPSTREAM_ERROR');
  }
};

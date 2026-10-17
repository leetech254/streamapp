const API_BASE = 'https://movieapi.xcasper.space/api';

function sendError(res, status, message, code = 'MOVIE_API_ERROR') {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message, code });
}

function integer(value, name, required = true) {
  const text = String(value ?? '').trim();
  if (!text && !required) return '';
  if (!/^\d+$/.test(text)) throw new Error(`${name} must be a positive integer`);
  return text;
}

module.exports = async function movieApiHandler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  const query = req.query || {};
  const action = String(query.action || '').trim().toLowerCase();
  const type = String(query.type || 'movie').trim().toLowerCase();
  if (!['search', 'stream'].includes(action)) return sendError(res, 400, 'action must be search or stream', 'ACTION_INVALID');
  if (!['movie', 'tv'].includes(type)) return sendError(res, 400, 'type must be movie or tv', 'TYPE_INVALID');

  let url;
  try {
    if (action === 'search') {
      const keyword = String(query.keyword || '').trim();
      if (!keyword || keyword.length > 120) return sendError(res, 400, 'keyword is required and must be 120 characters or fewer', 'KEYWORD_INVALID');
      url = new URL(`${API_BASE}/showbox/search`);
      url.searchParams.set('keyword', keyword);
      url.searchParams.set('type', type);
    } else {
      const id = integer(query.id, 'id');
      url = new URL(`${API_BASE}/stream`);
      url.searchParams.set('id', id);
      url.searchParams.set('type', type);
      if (type === 'tv') {
        const season = integer(query.season, 'season');
        const episode = integer(query.episode, 'episode');
        url.searchParams.set('season', season);
        url.searchParams.set('episode', episode);
      }
    }
  } catch (error) {
    return sendError(res, 400, error.message, 'PARAMETER_INVALID');
  }

  try {
    const upstream = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'StreamHD/1.0' } });
    const text = await upstream.text();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.status(upstream.status).send(text);
  } catch (error) {
    return sendError(res, 502, error?.message || 'Movie API upstream request failed', 'UPSTREAM_ERROR');
  }
};

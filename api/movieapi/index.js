const API_BASE = 'https://movieapi.xcasper.space/api';

function sendError(res, status, message, code = 'MOVIE_API_ERROR', extra = {}) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message, code, ...extra });
}

function positiveInteger(value, name, { required = true, max = 99999999 } = {}) {
  const text = String(value ?? '').trim();
  if (!text && !required) return '';
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > max) throw new Error(`${name} must be a positive integer`);
  return text;
}

function subjectId(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,32}$/.test(text) || /^0+$/.test(text)) throw new Error('subjectId must be a positive numeric ID');
  return text;
}

function typeValue(value) {
  const type = String(value || 'movie').trim().toLowerCase();
  if (!['movie', 'tv'].includes(type)) throw new Error('type must be movie or tv');
  return type;
}

async function requestJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'StreamHD/1.0' } });
    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('json')) return { status: 502, text: JSON.stringify({ error: 'Movie API returned a non-JSON response', code: 'UPSTREAM_INVALID_RESPONSE' }), contentType: 'application/json; charset=utf-8' };
    return { status: upstream.status, text, contentType };
  } finally { clearTimeout(timeout); }
}

async function requestMedia(url, range) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = { Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.1', 'User-Agent': 'StreamHD/1.0' };
    if (range) headers.Range = range;
    return await fetch(url, { signal: controller.signal, headers });
  } finally {
    clearTimeout(timeout);
  }
}

async function mediaFailure(upstream) {
  const status = Number(upstream.status) || 502;
  let text = '';
  try { text = (await upstream.text()).slice(0, 1200); } catch {}
  const blocked = status === 401 || status === 403 || /access denied|automated requests|bot|forbidden|blocked/i.test(text);
  return {
    status: blocked ? 502 : (status >= 500 ? 502 : status),
    code: blocked ? 'UPSTREAM_ACCESS_BLOCKED' : 'UPSTREAM_MEDIA_ERROR',
    message: blocked
      ? 'The authorized Movie API provider blocked this server playback request.'
      : `Movie API media request failed with HTTP ${status}`,
    upstreamStatus: status,
    retryable: !blocked && status >= 500,
    officialFallbackAvailable: true
  };
}

function copyMediaHeaders(upstream, res) {
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
}

async function pipeMedia(upstream, res) {
  copyMediaHeaders(upstream, res);
  res.status(upstream.status);
  if (!upstream.body) return res.end();
  if (typeof upstream.body.getReader === 'function') {
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
    } finally { res.end(); }
    return;
  }
  const buffer = Buffer.from(await upstream.arrayBuffer());
  return res.send(buffer);
}

function makeMediaUrl(query) {
  const url = new URL('/api/movieapi', 'https://streamhd.local');
  url.searchParams.set('action', 'media');
  url.searchParams.set('subjectId', query.subjectId);
  if (query.type) url.searchParams.set('type', query.type);
  if (query.season) url.searchParams.set('season', query.season);
  if (query.episode) url.searchParams.set('episode', query.episode);
  if (query.resolution) url.searchParams.set('resolution', query.resolution);
  if (query.lang) url.searchParams.set('lang', query.lang);
  return `${url.pathname}${url.search}`;
}

module.exports = async function movieApiHandler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  const query = req.query || {};
  const action = String(query.action || '').trim().toLowerCase();
  if (!['search', 'catalog-search', 'stream', 'media', 'captions'].includes(action)) return sendError(res, 400, 'action must be search, catalog-search, stream, media, or captions', 'ACTION_INVALID');

  try {
    const type = typeValue(query.type);

    if (action === 'media') {
      const id = subjectId(query.subjectId);
      const url = new URL(`${API_BASE}/bff/stream`);
      url.searchParams.set('subjectId', id);
      const season = positiveInteger(query.season, 'season', { required: false, max: 999 });
      const episode = positiveInteger(query.episode, 'episode', { required: false, max: 9999 });
      const resolution = String(query.resolution || '').trim();
      const lang = String(query.lang || '').trim();
      if (type === 'tv' || season) url.searchParams.set('se', season || '1');
      if (type === 'tv' || episode) url.searchParams.set('ep', episode || '1');
      if (/^(360|480|720|1080)$/.test(resolution)) url.searchParams.set('resolution', resolution);
      if (lang && lang.length <= 30) url.searchParams.set('lang', lang);
      const upstream = await requestMedia(url, req.headers.range || '');
      if (!upstream.ok && upstream.status !== 206) {
        const failure = await mediaFailure(upstream);
        return sendError(res, failure.status, failure.message, failure.code, {
          upstreamStatus: failure.upstreamStatus,
          retryable: failure.retryable,
          officialFallbackAvailable: failure.officialFallbackAvailable
        });
      }
      return pipeMedia(upstream, res);
    }

    if (action === 'captions') {
      const id = subjectId(query.subjectId);
      const stream = subjectId(query.streamId);
      const url = new URL(`${API_BASE}/captions`);
      url.searchParams.set('subjectId', id);
      url.searchParams.set('streamId', stream);
      if (/^(MP4|HLS)$/i.test(String(query.format || ''))) url.searchParams.set('format', String(query.format).toUpperCase());
      const result = await requestJson(url);
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', result.contentType); return res.status(result.status).send(result.text);
    }

    if (action === 'catalog-search') {
      const keyword = String(query.keyword || '').trim();
      if (!keyword || keyword.length > 120) return sendError(res, 400, 'keyword is required and must be 120 characters or fewer', 'KEYWORD_INVALID');
      const modern = new URL(`${API_BASE}/search`);
      modern.searchParams.set('keyword', keyword); modern.searchParams.set('page', '1'); modern.searchParams.set('perPage', '24'); modern.searchParams.set('subjectType', type === 'tv' ? '2' : '1');
      let result = await requestJson(modern);
      let parsed = {};
      try { parsed = JSON.parse(result.text); } catch {}
      if (result.status >= 400 || !Array.isArray(parsed?.data?.items)) {
        const fallback = new URL(`${API_BASE}/showbox/search`); fallback.searchParams.set('keyword', keyword); fallback.searchParams.set('type', type); result = await requestJson(fallback);
      }
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', result.contentType); return res.status(result.status).send(result.text);
    }

    if (action === 'search') {
      const keyword = String(query.keyword || '').trim();
      if (!keyword || keyword.length > 120) return sendError(res, 400, 'keyword is required and must be 120 characters or fewer', 'KEYWORD_INVALID');
      const url = new URL(`${API_BASE}/showbox/search`); url.searchParams.set('keyword', keyword); url.searchParams.set('type', type);
      const result = await requestJson(url);
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', result.contentType); return res.status(result.status).send(result.text);
    }

    if (query.subjectId) {
      const modernId = subjectId(query.subjectId);
      const mediaUrl = makeMediaUrl({ subjectId: modernId, type, season: query.season, episode: query.episode, resolution: query.resolution, lang: query.lang });
      return res.status(200).json({ success: true, source: 'bff', data: { url: mediaUrl, proxyUrl: mediaUrl, subjectId: modernId, type } });
    }
    const id = positiveInteger(query.id, 'id');
    const url = new URL(`${API_BASE}/showbox/streams`);
    url.searchParams.set('id', id); url.searchParams.set('type', type);
    if (type === 'tv') { url.searchParams.set('season', positiveInteger(query.season, 'season', { max: 999 })); url.searchParams.set('episode', positiveInteger(query.episode, 'episode', { max: 9999 })); }
    let result = await requestJson(url);
    if (result.status >= 500) {
      const fallback = new URL(`${API_BASE}/stream`); for (const [key, value] of url.searchParams) fallback.searchParams.set(key, value); result = await requestJson(fallback);
    }
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', result.contentType); return res.status(result.status).send(result.text);
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : (error.message.includes('must be') || error.message.includes('subjectId') || error.message.includes('type') ? 'PARAMETER_INVALID' : 'UPSTREAM_ERROR');
    return sendError(res, error?.name === 'AbortError' ? 504 : 400, error?.name === 'AbortError' ? 'Movie API request timed out' : error.message, code);
  }
};

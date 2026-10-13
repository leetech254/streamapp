const LEETEC_BASE = String(process.env.LEETEC_API_BASE_URL || 'https://leetec.online').replace(/\/$/, '');

function errorResponse(res, status, message, code) {
  return res.status(status).json({ error: message, code });
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(String(req.body || '{}')); } catch { return {}; }
}

function normalizeKenyanPhone(value) {
  const raw = String(value || '').replace(/[\s()-]/g, '');
  if (/^07\d{8}$/.test(raw)) return `254${raw.slice(1)}`;
  if (/^01\d{8}$/.test(raw)) return `254${raw.slice(1)}`;
  if (/^\+254[17]\d{8}$/.test(raw)) return raw.slice(1);
  if (/^254[17]\d{8}$/.test(raw)) return raw;
  return '';
}

module.exports = async function leetecTopupHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return errorResponse(res, 405, 'Only POST is allowed for STK Push requests', 'METHOD_NOT_ALLOWED');
  }

  const apiKey = String(process.env.LEETEC_API_KEY || '').trim();
  if (!apiKey) return errorResponse(res, 503, 'Leetec top-up is not configured on the server yet', 'LEETEC_API_KEY_MISSING');

  const body = parseBody(req);
  const phoneNumber = normalizeKenyanPhone(body.phoneNumber);
  const amount = Number(body.amount);
  const accountReference = String(body.accountReference || '').trim().slice(0, 40);

  if (!phoneNumber) return errorResponse(res, 400, 'Enter a valid Kenyan Safaricom number, for example 0712345678', 'PHONE_INVALID');
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 10 || amount > 100000) {
    return errorResponse(res, 400, 'Enter a whole KES amount between 10 and 100,000', 'AMOUNT_INVALID');
  }
  if (!accountReference) return errorResponse(res, 400, 'A top-up reference is required', 'REFERENCE_MISSING');

  try {
    const upstream = await fetch(`${LEETEC_BASE}/api/v1/stkpush`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ phoneNumber, amount, accountReference })
    });
    const text = await upstream.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { message: text }; }
    if (!upstream.ok) {
      const message = payload && (payload.message || payload.error) || 'Leetec rejected the top-up request';
      return errorResponse(res, upstream.status, String(message), 'LEETEC_TOPUP_REJECTED');
    }
    return res.status(200).json({ ok: true, provider: 'leetec', phoneNumber, amount, accountReference, ...payload });
  } catch (error) {
    return errorResponse(res, 502, error && error.message ? error.message : 'Leetec API is unavailable', 'LEETEC_UPSTREAM_ERROR');
  }
};

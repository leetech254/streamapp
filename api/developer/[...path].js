const crypto = require('crypto');
const { MongoClient } = require('mongodb');

let clientPromise;
function dbConfig() {
  const uri = String(process.env.MONGODB_URI || '').trim();
  const name = String(process.env.MONGODB_DB || 'stream_developer').trim();
  if (!uri) throw Object.assign(new Error('MONGODB_URI is not configured'), { code: 'MONGODB_URI_MISSING' });
  if (!clientPromise) clientPromise = new MongoClient(uri, { maxPoolSize: 5 }).connect();
  return clientPromise.then(client => client.db(name));
}
function json(res, status, body) { return res.status(status).json(body); }
function randomString(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function passwordHash(password, salt = randomString(16)) { return new Promise((resolve, reject) => crypto.scrypt(String(password), salt, 64, (e, key) => e ? reject(e) : resolve(`${salt}.${key.toString('hex')}`))); }
function passwordMatches(password, stored) { const [salt, digest] = String(stored || '').split('.'); if (!salt || !digest) return Promise.resolve(false); return new Promise((resolve, reject) => crypto.scrypt(String(password), salt, 64, (e, key) => { if (e) return reject(e); const a = Buffer.from(digest, 'hex'); const b = key; resolve(a.length === b.length && crypto.timingSafeEqual(a, b)); })); }
function sessionToken(userId) { const secret = String(process.env.DEVELOPER_SESSION_SECRET || '').trim(); if (!secret) throw Object.assign(new Error('DEVELOPER_SESSION_SECRET is not configured'), { code: 'SESSION_SECRET_MISSING' }); const payload = Buffer.from(JSON.stringify({ sub: String(userId), exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString('base64url'); const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url'); return `${payload}.${sig}`; }
function readSession(req) { const raw = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('stream_dev_session=')); if (!raw) return null; const token = raw.slice('stream_dev_session='.length); const [payload, sig] = token.split('.'); const secret = String(process.env.DEVELOPER_SESSION_SECRET || '').trim(); if (!secret || !payload || !sig) return null; const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url'); if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null; try { const data = JSON.parse(Buffer.from(payload, 'base64url').toString()); return data.exp > Date.now() ? data : null; } catch { return null; } }
function setSession(res, token) { res.setHeader('Set-Cookie', `stream_dev_session=${token}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`); }
function clearSession(res) { res.setHeader('Set-Cookie', 'stream_dev_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'); }
function publicUser(user) { return user ? { id: String(user._id), email: user.email, name: user.name, createdAt: user.createdAt } : null; }
function cleanEmail(value) { return String(value || '').trim().toLowerCase(); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160; }
function normalizeKenyanPhone(value) { const raw = String(value || '').replace(/[\s()-]/g, ''); if (/^0[17]\d{8}$/.test(raw)) return `254${raw.slice(1)}`; if (/^\+254[17]\d{8}$/.test(raw)) return raw.slice(1); if (/^254[17]\d{8}$/.test(raw)) return raw; return ''; }

module.exports = async function developerApi(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', 'https://developer.leetec.online'); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); return res.status(204).end(); }
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  try {
    const db = await dbConfig();
    const users = db.collection('developer_users');
    const keys = db.collection('developer_api_keys');
    await Promise.allSettled([users.createIndex({ email: 1 }, { unique: true }), keys.createIndex({ keyHash: 1 }, { unique: true }), keys.createIndex({ userId: 1 })]);
    const parts = String(req.query?.path || '').split('/').filter(Boolean);
    const action = parts[0] || 'me';
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (action === 'auth') {
      const mode = String(body.action || req.query?.action || 'me');
      if (mode === 'signup' || mode === 'login') {
        const email = cleanEmail(body.email); const password = String(body.password || '');
        if (!validEmail(email) || password.length < 8 || password.length > 200) return json(res, 400, { error: 'Use a valid email and a password of at least 8 characters.' });
        let user = await users.findOne({ email });
        if (mode === 'signup') { if (user) return json(res, 409, { error: 'An account with this email already exists.' }); user = { email, name: String(body.name || email.split('@')[0]).trim().slice(0, 80), passwordHash: await passwordHash(password), createdAt: new Date() }; const result = await users.insertOne(user); user._id = result.insertedId; }
        else if (!user || !(await passwordMatches(password, user.passwordHash))) return json(res, 401, { error: 'Invalid email or password.' });
        setSession(res, sessionToken(user._id)); return json(res, 200, { user: publicUser(user) });
      }
      if (mode === 'logout') { clearSession(res); return json(res, 200, { ok: true }); }
      const session = readSession(req); const user = session ? await users.findOne({ _id: new (require('mongodb').ObjectId)(session.sub) }) : null; return json(res, 200, { user: publicUser(user) });
    }
    const session = readSession(req); if (!session) return json(res, 401, { error: 'Sign in is required.' });
    const user = await users.findOne({ _id: new (require('mongodb').ObjectId)(session.sub) }); if (!user) return json(res, 401, { error: 'Developer account not found.' });
    if (action === 'wallet' && parts[1] === 'topup' && req.method === 'POST') {
      const apiKey = String(process.env.LEETEC_API_KEY || '').trim();
      if (!apiKey) return json(res, 503, { error: 'Leetec top-up is not configured on the server yet', code: 'LEETEC_API_KEY_MISSING' });
      const phoneNumber = normalizeKenyanPhone(body.phoneNumber); const amount = Number(body.amount); const accountReference = String(body.accountReference || '').trim().slice(0, 40);
      if (!phoneNumber) return json(res, 400, { error: 'Enter a valid Kenyan Safaricom number, for example 0712345678', code: 'PHONE_INVALID' });
      if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 10 || amount > 100000) return json(res, 400, { error: 'Enter a whole KES amount between 10 and 100,000', code: 'AMOUNT_INVALID' });
      if (!accountReference) return json(res, 400, { error: 'A top-up reference is required', code: 'REFERENCE_MISSING' });
      const base = String(process.env.LEETEC_API_BASE_URL || 'https://leetec.online').replace(/\/$/, '');
      const upstream = await fetch(`${base}/api/v1/stkpush`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ phoneNumber, amount, accountReference }) });
      const text = await upstream.text(); let payload; try { payload = JSON.parse(text); } catch { payload = { message: text }; }
      if (!upstream.ok) return json(res, upstream.status, { error: String(payload.message || payload.error || 'Leetec rejected the top-up request'), code: 'LEETEC_TOPUP_REJECTED' });
      return json(res, 200, { ok: true, provider: 'leetec', phoneNumber, amount, accountReference, ...payload });
    }
    if (action === 'keys' && req.method === 'GET') { const list = await keys.find({ userId: user._id }, { projection: { keyHash: 0 } }).sort({ createdAt: -1 }).toArray(); return json(res, 200, { user: publicUser(user), keys: list.map(k => ({ id: String(k._id), label: k.label, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt || null, revokedAt: k.revokedAt || null })) }); }
    if (action === 'keys' && req.method === 'POST') { const raw = `sk_stream_${randomString(32)}`; const doc = { userId: user._id, label: String(body.label || 'Stream API key').trim().slice(0, 80) || 'Stream API key', prefix: raw.slice(0, 18), keyHash: hash(raw), createdAt: new Date(), lastUsedAt: null, revokedAt: null }; const result = await keys.insertOne(doc); return json(res, 201, { key: raw, id: String(result.insertedId), warning: 'Copy this key now. The full key will not be shown again.' }); }
    if (action === 'keys' && req.method === 'DELETE') { const id = String(parts[1] || ''); if (!/^[a-f0-9]{24}$/.test(id)) return json(res, 400, { error: 'Invalid key ID.' }); const result = await keys.updateOne({ _id: new (require('mongodb').ObjectId)(id), userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } }); return json(res, 200, { ok: result.modifiedCount === 1 }); }
    return json(res, 404, { error: 'Developer API route not found.' });
  } catch (error) { const code = error.code || 'DEVELOPER_API_ERROR'; const status = code === 'MONGODB_URI_MISSING' || code === 'SESSION_SECRET_MISSING' ? 503 : 500; return json(res, status, { error: error.message || 'Developer API unavailable', code }); }
};

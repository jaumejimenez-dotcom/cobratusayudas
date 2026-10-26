// Utilidades compartidas (el prefijo _ evita que Vercel lo exponga como endpoint)
const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eyggurjcxfzhmotqusfn.supabase.co';
const ALLOWED = ['https://cobratusayudas.es', 'https://www.cobratusayudas.es', 'https://cobratusayudas.vercel.app'];
const COOKIE = 'cta_pass';
const PASS_DAYS = 30;

function secret() { return crypto.createHash('sha256').update('cta-pass:' + (process.env.STRIPE_SECRET_KEY || 'dev')).digest(); }
function b64u(buf) { return Buffer.from(buf).toString('base64url'); }

function signPass(purchaseId, expMs) {
  const payload = purchaseId + '.' + expMs;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function readPass(req) {
  const raw = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  if (!raw) return null;
  const parts = decodeURIComponent(raw.slice(COOKIE.length + 1)).split('.');
  if (parts.length !== 3) return null;
  const [pid, exp, sig] = parts;
  const good = crypto.createHmac('sha256', secret()).update(pid + '.' + exp).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return { purchaseId: pid };
}
function setPassCookie(res, purchaseId) {
  const exp = Date.now() + PASS_DAYS * 86400000;
  const v = encodeURIComponent(signPass(purchaseId, exp));
  res.setHeader('Set-Cookie', `${COOKIE}=${v}; Path=/; Max-Age=${PASS_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`);
}

async function sb(path, opts = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({
      apikey: process.env.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation'
    }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) { const err = new Error('supabase ' + r.status + ' ' + String(text).slice(0, 200)); err.status = r.status; throw err; }
  return data;
}

function cors(req, res, methods) {
  const origin = req.headers.origin || '';
  if (ALLOWED.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); }
  res.setHeader('Access-Control-Allow-Methods', methods + ', OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (origin && !ALLOWED.includes(origin)) { res.status(403).json({ error: 'forbidden' }); return false; }
  return true;
}

// Catálogo: se lee del propio index.html (única fuente de verdad) y se cachea 10 min
let catCache = { at: 0, list: null };
async function getCatalog(req) {
  if (catCache.list && Date.now() - catCache.at < 600000) return catCache.list;
  const host = req.headers.host || 'www.cobratusayudas.es';
  const html = await (await fetch('https://' + host + '/index.html')).text();
  const start = html.indexOf('const AYUDAS = [');
  if (start < 0) throw new Error('catalog not found');
  const from = html.indexOf('[', start);
  const end = html.indexOf('\n];', from);
  const list = JSON.parse(html.slice(from, end + 2));
  catCache = { at: Date.now(), list };
  return list;
}

// Oculta DNI/NIE/IBAN antes de guardar o enviar al modelo
function scrub(t) {
  return String(t || '')
    .replace(/\b[XYZxyz]\d{7}[A-Za-z]\b/g, '[dato ocultado]')
    .replace(/\b\d{8}[A-Za-z]\b/g, '[dato ocultado]')
    .replace(/\b[A-Za-z]{2}\d{2}(?:[ ]?\d{4}){5}\b/g, '[dato ocultado]');
}

// ───── Email: formato y dominios sospechosos ─────
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const TYPO_DOMAINS = { 'gmial.com':'gmail.com','gmai.com':'gmail.com','gmaill.com':'gmail.com','gamil.com':'gmail.com','gmail.co':'gmail.com','gmail.con':'gmail.com','gmail.cm':'gmail.com','gmail.es':'gmail.com','hotmial.com':'hotmail.com','hotmai.com':'hotmail.com','hotmail.con':'hotmail.com','hotmail.co':'hotmail.com','hotnail.com':'hotmail.com','outlok.com':'outlook.com','outlook.con':'outlook.com','outlook.co':'outlook.com','yahoo.con':'yahoo.com','yahoo.co':'yahoo.com','yaho.com':'yahoo.com','icloud.con':'icloud.com' };
function emailCheck(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, email, reason: 'formato' };
  const domain = email.split('@')[1];
  if (TYPO_DOMAINS[domain]) return { ok: true, suspicious: true, email, suggestion: email.split('@')[0] + '@' + TYPO_DOMAINS[domain], reason: 'dominio' };
  if (/\.(co\.com|com\.com|con|cmo|vom|comm|cim)$/.test(domain) || /\.com\.[a-z]{2,3}$/.test(domain) && !/\.com\.(es|mx|ar|co|br|pe|ve|ec|uy|py|bo|cl|gt|do|pa|cr|hn|ni|sv|pr|au|tr|ua)$/.test(domain)) return { ok: true, suspicious: true, email, reason: 'dominio' };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { ok: false, email, reason: 'formato' };
  return { ok: true, email };
}

function clientIp(req) { return String((req.headers['x-forwarded-for'] || '')).split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || ''; }
function clipStr(v, n) { return v == null ? null : String(v).slice(0, n); }
function clipObj(o, n) { try { const s = JSON.stringify(o || null); return s && s.length <= n ? JSON.parse(s) : null; } catch (e) { return null; } }

// Oculta además emails y teléfonos (para guardar el chat de ventas sin datos personales)
function scrubPII(t) {
  return scrub(t)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/(?:\+?\d[\s.-]?){9,}/g, '[teléfono]');
}

async function readRaw(req) { const chunks = []; for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c); return Buffer.concat(chunks); }

module.exports = { ALLOWED, SUPABASE_URL, signPass, readPass, setPassCookie, sb, cors, getCatalog, scrub, scrubPII, emailCheck, EMAIL_RE, clientIp, clipStr, clipObj, readRaw };

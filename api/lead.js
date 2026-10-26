// POST /api/lead  — guarda el email (con consentimiento) y envía el email de resultados
// GET  /api/lead?t=TOKEN — devuelve las respuestas del test para reabrir los resultados desde el email
const { sb, cors, getCatalog } = require('./_lib');
const { build, send } = require('./_email');

const hits = new Map();
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const TOKEN_RE = /^[a-f0-9]{32}$/;

function clip(o, max) { try { const s = JSON.stringify(o || {}); return s.length > max ? null : JSON.parse(s); } catch (e) { return null; } }

module.exports = async (req, res) => {
  if (!cors(req, res, 'GET, POST')) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const t = String(req.query.t || '');
      if (!TOKEN_RE.test(t)) return res.status(400).json({ ok: false });
      const rows = await sb('leads?unsub_token=eq.' + t + '&select=answers,aids');
      const row = rows && rows[0];
      if (!row) return res.status(404).json({ ok: false });
      return res.status(200).json({ ok: true, respuestas: row.answers || null, count: (row.aids || []).length });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false });

    const ip = String((req.headers['x-forwarded-for'] || '')).split(',')[0].trim() || 'x';
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter(x => now - x < 3600000);
    if (arr.length >= 8) return res.status(429).json({ ok: false, error: 'limit' });
    arr.push(now); hits.set(ip, arr); if (hits.size > 5000) hits.clear();

    const b = req.body || {};
    if (b.website) return res.status(200).json({ ok: true }); // honeypot
    const email = String(b.email || '').trim().toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'email' });
    if (b.consent !== true) return res.status(400).json({ ok: false, error: 'consent' });
    const aids = Array.isArray(b.aids) ? b.aids.filter(x => typeof x === 'string' && x.length <= 80).slice(0, 150) : [];
    if (!aids.length) return res.status(400).json({ ok: false, error: 'aids' });
    const answers = clip(b.answers, 3000);
    const utm = clip(b.utm, 1000);
    const origin = clip(b.origin, 2000);

    const base = { email, consent: true, consent_at: new Date().toISOString(),
      consent_text: String(b.consent_text || '').slice(0, 400), aids, answers, utm, origin, source: String(b.source || 'results').slice(0, 40) };
    const prev = await sb('leads?email=eq.' + encodeURIComponent(email) + '&select=id,seq_step,last_sent_at,unsubscribed_at,purchased');
    let lead;
    if (prev && prev[0]) {
      const p = prev[0];
      const patch = Object.assign({}, base);
      if (p.unsubscribed_at) { patch.unsubscribed_at = null; patch.seq_step = 0; }
      const rows = await sb('leads?id=eq.' + p.id, { method: 'PATCH', body: patch });
      lead = rows[0];
      if (p.last_sent_at && now - new Date(p.last_sent_at).getTime() < 60000) return res.status(200).json({ ok: true, token: lead.unsub_token });
    } else {
      const rows = await sb('leads', { method: 'POST', body: base });
      lead = rows[0];
    }
    const catalog = await getCatalog(req);
    await send(lead, build(0, lead, catalog));
    const keep = lead.seq_step || 0;
    await sb('leads?id=eq.' + lead.id, { method: 'PATCH', body: { seq_step: Math.max(keep, 1), last_sent_at: new Date().toISOString() } });
    return res.status(200).json({ ok: true, token: lead.unsub_token });
  } catch (e) {
    console.error('lead error', e.message);
    return res.status(500).json({ ok: false, error: 'server' });
  }
};

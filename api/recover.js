// POST /api/recover {email} — si hay una compra con ese email, reenvía el enlace de acceso. Respuesta siempre genérica.
const { sb, cors, emailCheck, clientIp } = require('./_lib');
const { sendRecovery } = require('./_email');

const hits = new Map();
const OK = { ok: true, message: 'Si hay una compra con ese email, te hemos enviado el enlace. Revisa también la carpeta de spam.' };

module.exports = async (req, res) => {
  if (!cors(req, res, 'POST')) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ip = clientIp(req) || 'x', now = Date.now();
    const arr = (hits.get(ip) || []).filter(x => now - x < 3600000);
    if (arr.length >= 6) return res.status(429).json({ ok: false, message: 'Demasiados intentos. Inténtalo más tarde o escribe a hola@cobratusayudas.es.' });
    arr.push(now); hits.set(ip, arr); if (hits.size > 5000) hits.clear();

    const b = req.body || {};
    if (b.website) return res.status(200).json(OK); // honeypot
    const chk = emailCheck(b.email);
    if (!chk.ok) return res.status(400).json({ ok: false, message: 'Escribe un email válido.' });
    const rows = await sb('purchases?email=eq.' + encodeURIComponent(chk.email) + '&select=id,access_token,recover_sent_at,created_at&order=created_at.desc&limit=1');
    const p = rows && rows[0];
    if (p) {
      const last = p.recover_sent_at ? new Date(p.recover_sent_at).getTime() : 0;
      if (now - last > 120000) {
        await sb('purchases?id=eq.' + p.id, { method: 'PATCH', body: { recover_sent_at: new Date().toISOString() }, prefer: 'return=minimal' });
        try { await sendRecovery({ to: chk.email, token: p.access_token, ref: String(p.id).slice(0, 8) }); }
        catch (e) { console.error('recover send', e.message); }
      }
    }
    return res.status(200).json(OK);
  } catch (e) {
    console.error('recover error', e.message);
    return res.status(500).json({ ok: false, message: 'Ahora mismo no podemos procesarlo. Escribe a hola@cobratusayudas.es.' });
  }
};

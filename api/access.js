// GET /api/access?t=TOKEN — enlace mágico del email: deja el pase en este dispositivo y devuelve las respuestas del test
const { sb, cors, setPassCookie } = require('./_lib');

module.exports = async (req, res) => {
  if (!cors(req, res, 'GET')) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Cache-Control', 'no-store');
  try {
    const t = String(req.query.t || '');
    if (!/^[a-f0-9]{32}$/.test(t)) return res.status(400).json({ ok: false });
    const rows = await sb('purchases?access_token=eq.' + t + '&select=id,email,respuestas,aid_ids');
    const p = rows && rows[0];
    if (!p) return res.status(404).json({ ok: false });
    let respuestas = p.respuestas || null;
    // compras antiguas: se intenta recuperar las respuestas del test desde el lead con el mismo email
    if (!respuestas && p.email) {
      try { const l = await sb('leads?email=eq.' + encodeURIComponent(p.email) + '&select=answers'); respuestas = l && l[0] && l[0].answers || null; } catch (e) {}
    }
    setPassCookie(res, p.id);
    return res.status(200).json({ ok: true, respuestas });
  } catch (e) {
    console.error('access error', e.message);
    return res.status(500).json({ ok: false });
  }
};

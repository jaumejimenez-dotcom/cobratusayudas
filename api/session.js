// GET /api/session — ¿tiene este navegador un pase válido? Devuelve mensajes restantes.
const { sb, cors, readPass } = require('./_lib');
const MAX = () => parseInt(process.env.CHAT_MAX_MESSAGES || '150', 10);

module.exports = async (req, res) => {
  if (!cors(req, res, 'GET')) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Cache-Control', 'no-store');
  try {
    const pass = readPass(req);
    if (!pass) return res.status(200).json({ paid: false });
    const rows = await sb('purchases?id=eq.' + encodeURIComponent(pass.purchaseId) + '&select=id,messages_used,access_until');
    const p = rows && rows[0];
    if (!p || new Date(p.access_until) < new Date()) return res.status(200).json({ paid: false });
    return res.status(200).json({ paid: true, ref: String(p.id).slice(0, 8), remaining: Math.max(0, MAX() - p.messages_used), until: p.access_until });
  } catch (e) {
    console.error('session error', e.message);
    return res.status(200).json({ paid: false });
  }
};

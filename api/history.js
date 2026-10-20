// GET /api/history?aid_id=x → mensajes de esa conversación · DELETE → borra la conversación
const { sb, cors, readPass } = require('./_lib');

module.exports = async (req, res) => {
  if (!cors(req, res, 'GET, DELETE')) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Cache-Control', 'no-store');
  const pass = readPass(req);
  if (!pass) return res.status(401).json({ error: 'no pass' });
  const aid = String(req.query.aid_id || '').slice(0, 80);
  if (!aid) return res.status(400).json({ error: 'aid_id' });
  const q = 'conversations?purchase_id=eq.' + encodeURIComponent(pass.purchaseId) + '&aid_id=eq.' + encodeURIComponent(aid);
  try {
    if (req.method === 'DELETE') { await sb(q, { method: 'DELETE', prefer: 'return=minimal' }); return res.status(200).json({ ok: true }); }
    if (req.method !== 'GET') return res.status(405).end();
    const rows = await sb(q + '&select=messages');
    return res.status(200).json({ messages: (rows && rows[0] && rows[0].messages) || [] });
  } catch (e) {
    console.error('history error', e.message);
    return res.status(500).json({ error: 'server' });
  }
};

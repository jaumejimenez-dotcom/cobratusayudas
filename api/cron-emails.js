// GET /api/cron-emails — lo lanza Vercel Cron cada día; envía los emails de seguimiento que toquen
const { sb, getCatalog } = require('./_lib');
const { build, send } = require('./_email');

const DAY = 86400000;
const WAIT = { 1: 2 * DAY, 2: 3 * DAY }; // tras el email 1 → +2 días; tras el 2 → +3 días

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const out = { sent: 0, skipped: 0, errors: 0 };
  try {
    const rows = await sb('leads?consent=eq.true&unsubscribed_at=is.null&purchased=eq.false&seq_step=in.(1,2)&select=*&limit=60');
    if (!rows || !rows.length) return res.status(200).json(out);
    const catalog = await getCatalog(req);
    const now = Date.now();
    for (const lead of rows) {
      const last = lead.last_sent_at ? new Date(lead.last_sent_at).getTime() : 0;
      if (now - last < WAIT[lead.seq_step]) { out.skipped++; continue; }
      // reservamos el turno antes de enviar (evita duplicados si el cron se solapa)
      const claimed = await sb('leads?id=eq.' + lead.id + '&seq_step=eq.' + lead.seq_step, { method: 'PATCH', body: { seq_step: lead.seq_step + 1, last_sent_at: new Date().toISOString() } });
      if (!claimed || !claimed.length) { out.skipped++; continue; }
      try {
        await send(lead, build(lead.seq_step, lead, catalog));
        out.sent++;
      } catch (e) {
        out.errors++;
        console.error('cron send error', e.message);
        await sb('leads?id=eq.' + lead.id, { method: 'PATCH', body: { seq_step: lead.seq_step, last_sent_at: lead.last_sent_at } }).catch(() => {});
      }
    }
    return res.status(200).json(out);
  } catch (e) {
    console.error('cron error', e.message);
    return res.status(500).json({ error: 'server' });
  }
};

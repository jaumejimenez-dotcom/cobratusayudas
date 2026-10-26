// POST /api/event — eventos anónimos del embudo (visitas, test, resultados, pago) con origen, para medir por canal
const { sb, cors, clipStr, clipObj } = require('./_lib');

const ALLOWED_EVENTS = new Set(['visit', 'quiz_started', 'quiz_completed', 'quiz_results_shown', 'open_pay_modal', 'begin_checkout', 'generate_lead', 'checkout_view', 'guide_opened']);
const hits = new Map();

module.exports = async (req, res) => {
  if (!cors(req, res, 'POST')) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const ip = String((req.headers['x-forwarded-for'] || '')).split(',')[0].trim() || 'x';
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
    if (arr.length >= 40) return res.status(204).end();
    arr.push(now); hits.set(ip, arr); if (hits.size > 5000) hits.clear();

    const b = req.body || {};
    const ev = String(b.event || '');
    const vid = String(b.vid || '');
    if (!ALLOWED_EVENTS.has(ev) || !/^[a-zA-Z0-9-]{8,64}$/.test(vid)) return res.status(204).end();
    const o = (b.origin && typeof b.origin === 'object') ? b.origin : {};
    await sb('events', { method: 'POST', prefer: 'return=minimal', body: {
      visitor_id: vid, event: ev, channel: clipStr(o.channel, 60) || 'directo',
      utm_source: clipStr(o.utm_source, 80), utm_medium: clipStr(o.utm_medium, 80), utm_campaign: clipStr(o.utm_campaign, 120), utm_content: clipStr(o.utm_content, 120),
      props: clipObj(b.props, 500)
    } });
    return res.status(204).end();
  } catch (e) {
    console.error('event error', e.message);
    return res.status(204).end();
  }
};

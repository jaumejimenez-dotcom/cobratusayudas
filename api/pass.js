// GET /api/pass?payment_intent=pi_xxx — verifica el pago con Stripe en el servidor y entrega el "pase" (cookie firmada)
const Stripe = require('stripe');
const { sb, cors, setPassCookie } = require('./_lib');

module.exports = async (req, res) => {
  if (!cors(req, res, 'GET')) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ paid: false });
  try {
    const pi = String(req.query.payment_intent || '');
    if (!pi.startsWith('pi_')) return res.status(400).json({ paid: false });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge'] });
    // email real del pago: el del recibo o, si pagó con Link/Apple Pay, el de facturación del cargo
    const buyerEmail = intent.receipt_email || (intent.latest_charge && intent.latest_charge.billing_details && intent.latest_charge.billing_details.email) || null;
    const ok = intent.status === 'succeeded' && intent.amount === 600 && intent.currency === 'eur';
    if (!ok) return res.status(200).json({ paid: false });
    const rows = await sb('purchases?on_conflict=payment_intent_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: { payment_intent_id: pi, amount_cents: intent.amount, email: buyerEmail }
    });
    const p = rows && rows[0];
    if (!p) throw new Error('no purchase row');
    // marca el lead como comprado (para no enviarle más emails)
    try {
      const lt = String(req.query.lt || '');
      if (/^[a-f0-9]{32}$/.test(lt)) await sb('leads?unsub_token=eq.' + lt, { method: 'PATCH', body: { purchased: true } });
      if (buyerEmail) await sb('leads?email=eq.' + encodeURIComponent(String(buyerEmail).toLowerCase()), { method: 'PATCH', body: { purchased: true } });
    } catch (e) { console.error('lead purchased mark', e.message); }
    setPassCookie(res, p.id);
    return res.status(200).json({ paid: true });
  } catch (e) {
    console.error('pass error', e.message);
    return res.status(500).json({ paid: false });
  }
};

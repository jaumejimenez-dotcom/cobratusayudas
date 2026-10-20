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
    const intent = await stripe.paymentIntents.retrieve(pi);
    const ok = intent.status === 'succeeded' && intent.amount === 600 && intent.currency === 'eur';
    if (!ok) return res.status(200).json({ paid: false });
    const rows = await sb('purchases?on_conflict=payment_intent_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: { payment_intent_id: pi, amount_cents: intent.amount, email: intent.receipt_email || null }
    });
    const p = rows && rows[0];
    if (!p) throw new Error('no purchase row');
    setPassCookie(res, p.id);
    return res.status(200).json({ paid: true });
  } catch (e) {
    console.error('pass error', e.message);
    return res.status(500).json({ paid: false });
  }
};

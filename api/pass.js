// GET /api/pass?payment_intent=pi_xxx — verifica el pago con Stripe en el servidor y entrega el "pase" (cookie firmada).
// Es también el respaldo del webhook: registra la compra, entrega el email y envía Purchase a GA4/Meta (todo idempotente).
// Devuelve { paid:true, event_id } solo cuando el servidor ha confirmado el pago: el navegador dispara Purchase después.
const Stripe = require('stripe');
const { cors, setPassCookie } = require('./_lib');
const { processPayment } = require('./_pay');

module.exports = async (req, res) => {
  if (!cors(req, res, 'GET')) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ paid: false });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const pi = String(req.query.payment_intent || '');
    if (!pi.startsWith('pi_')) return res.status(400).json({ paid: false });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge'] });
    const out = await processPayment(intent, 'pass');
    if (!out.paid) return res.status(200).json({ paid: false });
    setPassCookie(res, out.purchaseId);
    return res.status(200).json({ paid: true, event_id: intent.id });
  } catch (e) {
    console.error('pass error', e.message);
    return res.status(500).json({ paid: false });
  }
};

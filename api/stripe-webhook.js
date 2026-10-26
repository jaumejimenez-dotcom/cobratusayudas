// POST /api/stripe-webhook — eventos de Stripe (payment_intent.succeeded) con verificación de firma.
// Registra la compra, entrega la guía por email y envía Purchase a GA4 y Meta, aunque el usuario cierre la página.
const Stripe = require('stripe');
const { readRaw } = require('./_lib');
const { processPayment } = require('./_pay');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) { console.error('stripe-webhook: falta STRIPE_WEBHOOK_SECRET'); return res.status(500).json({ error: 'not_configured' }); }
  let event;
  try {
    const raw = await readRaw(req);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], secret);
  } catch (e) {
    console.error('stripe-webhook firma inválida:', e.message);
    return res.status(400).json({ error: 'bad_signature' });
  }
  try {
    if (event.type === 'payment_intent.succeeded') {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      // se vuelve a pedir a Stripe (no nos fiamos solo del cuerpo recibido) con el cargo expandido
      const intent = await stripe.paymentIntents.retrieve(event.data.object.id, { expand: ['latest_charge'] });
      const out = await processPayment(intent, 'webhook');
      console.log('stripe-webhook', event.id, intent.id, JSON.stringify(out));
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    // 500 → Stripe reintenta (todo es idempotente)
    console.error('stripe-webhook error:', e.message);
    return res.status(500).json({ error: 'server' });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };

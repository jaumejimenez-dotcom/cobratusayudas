const Stripe = require('stripe');
const { sb } = require('./_lib');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const TOKEN_RE = /^[a-f0-9]{32}$/;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // email para el recibo de Stripe: el del lead (por token) o el que haya escrito el usuario
    let email = null;
    const b = req.body || {};
    try {
      if (typeof b.lt === 'string' && TOKEN_RE.test(b.lt)) {
        const rows = await sb('leads?unsub_token=eq.' + b.lt + '&select=email');
        if (rows && rows[0] && rows[0].email) email = rows[0].email;
      }
    } catch (e) { console.error('pi lead lookup', e.message); }
    if (!email && typeof b.email === 'string') {
      const e = b.email.trim().toLowerCase();
      if (e.length <= 254 && EMAIL_RE.test(e)) email = e;
    }

    const params = {
      amount: 600, // 6.00 EUR in cents
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: { product: 'informe_ayudas' },
    };
    if (email) params.receipt_email = email;
    const paymentIntent = await stripe.paymentIntents.create(params);

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('PaymentIntent error:', error);
    res.status(500).json({ error: error.message });
  }
};

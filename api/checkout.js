// v1
const Stripe = require('stripe');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripe = new Stripe('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');
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_creation: 'always',
      line_items: [{ price: 'price_1TPlVHHnR7v3xoRAIzrXfTsO', quantity: 1 }],
      mode: 'payment',
      success_url: `${req.headers.origin || 'https://cobratusayudas.es'}/?pago=ok`,
      cancel_url: `${req.headers.origin || 'https://cobratusayudas.es'}/?pago=cancelado`,
      locale: 'es',
    });
    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
};

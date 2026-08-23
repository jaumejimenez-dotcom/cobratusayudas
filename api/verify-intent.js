const Stripe = require('stripe');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ paid: false });

  try {
    const { payment_intent } = req.query;
    if (!payment_intent || !payment_intent.startsWith('pi_')) {
      return res.status(400).json({ paid: false, error: 'Invalid payment_intent' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.retrieve(payment_intent);

    const paid = intent.status === 'succeeded' && intent.amount === 600 && intent.currency === 'eur';
    res.status(200).json({ paid });
  } catch (error) {
    console.error('Verify intent error:', error);
    res.status(500).json({ paid: false, error: error.message });
  }
};

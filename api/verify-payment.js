const Stripe = require('stripe');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ paid: false, error: 'Method not allowed' });

  try {
    const sessionId = req.query.session_id;
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
      return res.status(400).json({ paid: false, error: 'Missing or invalid session_id' });
    }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

  const expectedPrice = 'price_1TPlVHHnR7v3xoRAIzrXfTsO';
    const expectedPriceTest = 'price_1U524QHnR7v3xoRAerRmQsxh';
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);

  function checkPrice(li) { return li.price && (li.price.id === expectedPrice || li.price.id === expectedPriceTest); }
    const priceMatches = lineItems.data.some(checkPrice);

  const paid = session.payment_status === 'paid' && priceMatches;

  res.status(200).json({ paid });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ paid: false, error: error.message });
  }
};

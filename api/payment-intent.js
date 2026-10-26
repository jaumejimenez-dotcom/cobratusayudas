// POST /api/payment-intent
//  · sin "action": crea el PaymentIntent de 6 € (como antes) y guarda el contexto de atribución.
//  · action "email": justo antes de confirmar el pago, valida el email OBLIGATORIO y lo guarda en el PaymentIntent (receipt_email) y en el contexto.
const Stripe = require('stripe');
const { sb, emailCheck, clientIp, clipStr, clipObj } = require('./_lib');

const TOKEN_RE = /^[a-f0-9]{32}$/;
const ORIGIN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'channel', 'referrer', 'landing', 'first_seen'];

function cleanOrigin(o) {
  if (!o || typeof o !== 'object') return null;
  const out = {};
  ORIGIN_KEYS.forEach(k => { if (o[k] != null && o[k] !== '') out[k] = String(o[k]).slice(0, k === 'landing' || k === 'referrer' ? 300 : 120); });
  return Object.keys(out).length ? out : null;
}
function ctxFields(b, req) {
  const f = {
    fbp: clipStr(b.fbp, 120), fbc: clipStr(b.fbc, 200),
    ga_client_id: clipStr(b.ga_client_id, 60), ga_session_id: clipStr(b.ga_session_id, 30),
    ip: clipStr(clientIp(req), 60), user_agent: clipStr(req.headers['user-agent'], 400),
    page_url: clipStr(b.page_url, 300)
  };
  Object.keys(f).forEach(k => { if (f[k] == null || f[k] === '') delete f[k]; });
  return f;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const b = req.body || {};

    // ───────── Email obligatorio, justo antes de pagar ─────────
    if (b.action === 'email') {
      const secret = String(b.client_secret || '');
      const piId = secret.split('_secret_')[0];
      if (!/^pi_[A-Za-z0-9]+$/.test(piId) || !secret.includes('_secret_')) return res.status(400).json({ ok: false, error: 'pi' });
      const chk = emailCheck(b.email);
      if (!chk.ok) return res.status(400).json({ ok: false, error: 'email', message: 'Escribe un email válido para enviarte tu guía.' });
      if (chk.suspicious && !b.confirm_email) {
        return res.status(200).json({ ok: false, warn: true, suggestion: chk.suggestion || null, message: chk.suggestion ? '¿Querías decir ' + chk.suggestion + '? Revísalo para recibir tu guía.' : 'Ese email parece tener un error en el dominio (' + chk.email.split('@')[1] + '). Revísalo para recibir tu guía.' });
      }
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.client_secret !== secret) return res.status(403).json({ ok: false, error: 'secret' });
      if (pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation' || pi.status === 'requires_action') {
        await stripe.paymentIntents.update(piId, { receipt_email: chk.email });
      }
      const row = Object.assign({ payment_intent_id: piId, email: chk.email, updated_at: new Date().toISOString() }, ctxFields(b, req));
      const o = cleanOrigin(b.origin), ol = cleanOrigin(b.origin_last);
      if (o) row.origin = o;
      if (ol) row.origin_last = ol;
      await sb('checkout_context?on_conflict=payment_intent_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: row });
      return res.status(200).json({ ok: true, email: chk.email });
    }

    // ───────── Crear PaymentIntent ─────────
    let email = null, leadToken = null;
    try {
      if (typeof b.lt === 'string' && TOKEN_RE.test(b.lt)) {
        leadToken = b.lt;
        const rows = await sb('leads?unsub_token=eq.' + b.lt + '&select=email');
        if (rows && rows[0] && rows[0].email) email = rows[0].email;
      }
    } catch (e) { console.error('pi lead lookup', e.message); }
    if (!email && typeof b.email === 'string') { const c = emailCheck(b.email); if (c.ok) email = c.email; }

    const origin = cleanOrigin(b.origin), originLast = cleanOrigin(b.origin_last);
    const metadata = { product: 'informe_ayudas' };
    if (origin) ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'channel'].forEach(k => { if (origin[k]) metadata[k] = origin[k]; });
    if (origin && origin.fbclid) metadata.fbclid = origin.fbclid;
    if (originLast && originLast.utm_campaign) metadata.last_campaign = originLast.utm_campaign;
    if (originLast && originLast.channel) metadata.last_channel = originLast.channel;

    const params = { amount: 600, currency: 'eur', automatic_payment_methods: { enabled: true }, metadata };
    if (email) params.receipt_email = email;
    const paymentIntent = await stripe.paymentIntents.create(params);

    try {
      const row = Object.assign({ payment_intent_id: paymentIntent.id }, ctxFields(b, req));
      if (email) row.email = email;
      if (origin) row.origin = origin;
      if (originLast) row.origin_last = originLast;
      if (leadToken) row.lead_token = leadToken;
      const resp = clipObj(b.respuestas, 3000); if (resp) row.respuestas = resp;
      if (Array.isArray(b.aid_ids)) row.aid_ids = b.aid_ids.filter(x => typeof x === 'string' && x.length <= 80).slice(0, 150);
      await sb('checkout_context?on_conflict=payment_intent_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: row });
    } catch (e) { console.error('checkout_context', e.message); }

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('PaymentIntent error:', error);
    res.status(500).json({ error: error.message });
  }
};

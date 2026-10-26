// Lógica común de un pago confirmado: registrar compra, entregar la guía por email y enviar Purchase a GA4 y Meta.
// La usan el webhook de Stripe (fuente principal) y /api/pass (respaldo). Todo es idempotente.
const crypto = require('crypto');
const { sb, emailCheck } = require('./_lib');
const { sendDelivery } = require('./_email');

const PIXEL_ID = '1372837888300592';
const GA4_ID = 'G-Q2DV7KRER0';
const PRICE_CENTS = 600;

const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const nowIso = () => new Date().toISOString();

function isPaid(intent) { return intent && intent.status === 'succeeded' && intent.amount === PRICE_CENTS && intent.currency === 'eur'; }

function buyerFrom(intent, ctx) {
  const ch = intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
  const bd = (ch && ch.billing_details) || {};
  const email = intent.receipt_email || bd.email || (ctx && ctx.email) || null;
  return { email: email ? String(email).trim().toLowerCase() : null, phone: bd.phone || null };
}

// Registra (o actualiza) la compra sin machacar con nulos lo que ya hubiera.
async function recordPurchase(intent, source) {
  const rows0 = await sb('checkout_context?payment_intent_id=eq.' + encodeURIComponent(intent.id) + '&select=*').catch(() => []);
  const ctx = rows0 && rows0[0];
  const buyer = buyerFrom(intent, ctx);
  const md = intent.metadata || {};
  const origin = (ctx && ctx.origin) || (md.utm_source || md.channel ? { utm_source: md.utm_source, utm_medium: md.utm_medium, utm_campaign: md.utm_campaign, utm_content: md.utm_content, utm_term: md.utm_term, channel: md.channel } : null);
  const originLast = ctx && ctx.origin_last || null;
  const body = { payment_intent_id: intent.id, amount_cents: intent.amount };
  if (buyer.email) body.email = buyer.email;
  if (origin) { body.origin = origin; body.channel = origin.channel || md.channel || null; }
  if (originLast) { body.origin_last = originLast; body.channel_last = originLast.channel || null; }
  if (ctx && ctx.respuestas) body.respuestas = ctx.respuestas;
  if (ctx && ctx.aid_ids) body.aid_ids = ctx.aid_ids;
  const existing = await sb('purchases?payment_intent_id=eq.' + encodeURIComponent(intent.id) + '&select=id,source').catch(() => []);
  if (!(existing && existing[0])) body.source = source;
  const rows = await sb('purchases?on_conflict=payment_intent_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', body });
  const purchase = rows && rows[0];
  if (!purchase) throw new Error('no purchase row');
  // marca el lead como comprado (para no enviarle más emails de venta)
  try {
    if (ctx && /^[a-f0-9]{32}$/.test(ctx.lead_token || '')) await sb('leads?unsub_token=eq.' + ctx.lead_token, { method: 'PATCH', body: { purchased: true }, prefer: 'return=minimal' });
    if (buyer.email) await sb('leads?email=eq.' + encodeURIComponent(buyer.email), { method: 'PATCH', body: { purchased: true }, prefer: 'return=minimal' });
  } catch (e) { console.error('lead purchased mark', e.message); }
  return { purchase, ctx, buyer, origin };
}

// Envío del email de entrega: un solo ganador (reserva atómica) y registro de éxito o error.
async function deliver(purchase, buyer) {
  const email = purchase.email || buyer.email;
  if (purchase.delivered_at) return { status: 'already' };
  if (!email) {
    await sb('purchases?id=eq.' + purchase.id, { method: 'PATCH', body: { email_error: 'sin email: pidió pagar sin dejarlo' }, prefer: 'return=minimal' });
    return { status: 'no_email' };
  }
  const chk = emailCheck(email);
  if (!chk.ok) {
    await sb('purchases?id=eq.' + purchase.id, { method: 'PATCH', body: { email_error: 'email con formato no válido' }, prefer: 'return=minimal' });
    return { status: 'bad_email' };
  }
  const stale = new Date(Date.now() - 5 * 60000).toISOString();
  const claimed = await sb('purchases?id=eq.' + purchase.id + '&delivered_at=is.null&or=(delivery_claim_at.is.null,delivery_claim_at.lt.' + stale + ')', { method: 'PATCH', body: { delivery_claim_at: nowIso() } });
  if (!claimed || !claimed.length) return { status: 'claimed_by_other' };
  const row = claimed[0];
  try {
    await sendDelivery({ to: email, token: row.access_token, ref: String(row.id).slice(0, 8) });
    await sb('purchases?id=eq.' + row.id, { method: 'PATCH', body: { delivered_at: nowIso(), email_error: chk.suspicious ? 'entregado, pero el dominio del email parece erróneo' : null, email_attempts: (row.email_attempts || 0) + 1, delivery_claim_at: null }, prefer: 'return=minimal' });
    return { status: 'sent' };
  } catch (e) {
    await sb('purchases?id=eq.' + row.id, { method: 'PATCH', body: { email_error: String(e.message).slice(0, 300), email_attempts: (row.email_attempts || 0) + 1, delivery_claim_at: null }, prefer: 'return=minimal' }).catch(() => {});
    return { status: 'error', error: e.message };
  }
}

async function trackGa4(purchase, ctx, intent) {
  if (!process.env.GA4_API_SECRET) return 'no_secret';
  const claimed = await sb('purchases?id=eq.' + purchase.id + '&ga4_sent_at=is.null', { method: 'PATCH', body: { ga4_sent_at: nowIso() } });
  if (!claimed || !claimed.length) return 'already';
  try {
    const clientId = (ctx && ctx.ga_client_id) || ('srv.' + purchase.id);
    const params = { transaction_id: intent.id, value: 6, currency: 'EUR', items: [{ item_id: 'guia_solicitud', item_name: 'Guia de solicitud', price: 6, quantity: 1 }], engagement_time_msec: 100 };
    if (ctx && ctx.ga_session_id) params.session_id = ctx.ga_session_id;
    const url = 'https://www.google-analytics.com/mp/collect?measurement_id=' + GA4_ID + '&api_secret=' + encodeURIComponent(process.env.GA4_API_SECRET);
    const r = await fetch(url, { method: 'POST', body: JSON.stringify({ client_id: clientId, events: [{ name: 'purchase', params }] }) });
    if (!r.ok) throw new Error('ga4 ' + r.status);
    return 'sent';
  } catch (e) {
    await sb('purchases?id=eq.' + purchase.id, { method: 'PATCH', body: { ga4_sent_at: null, tracking_error: ('ga4: ' + e.message).slice(0, 300) }, prefer: 'return=minimal' }).catch(() => {});
    return 'error';
  }
}

async function trackMeta(purchase, ctx, buyer, intent) {
  if (!process.env.META_CAPI_TOKEN) return 'no_token';
  const claimed = await sb('purchases?id=eq.' + purchase.id + '&capi_sent_at=is.null', { method: 'PATCH', body: { capi_sent_at: nowIso() } });
  if (!claimed || !claimed.length) return 'already';
  try {
    const user = {};
    const em = buyer.email || purchase.email;
    if (em) user.em = [sha(em)];
    const ph = buyer.phone && String(buyer.phone).replace(/\D/g, '');
    if (ph && ph.length >= 9) user.ph = [sha(ph)];
    if (ctx) { if (ctx.ip) user.client_ip_address = ctx.ip; if (ctx.user_agent) user.client_user_agent = ctx.user_agent; if (ctx.fbp) user.fbp = ctx.fbp; if (ctx.fbc) user.fbc = ctx.fbc; }
    user.external_id = [sha(intent.id)];
    const payload = {
      data: [{ event_name: 'Purchase', event_time: intent.created || Math.floor(Date.now() / 1000), event_id: intent.id, action_source: 'website',
        event_source_url: (ctx && ctx.page_url) || 'https://www.cobratusayudas.es/', user_data: user,
        custom_data: { value: 6, currency: 'EUR', content_name: 'guia_solicitud', content_type: 'product' } }],
      access_token: process.env.META_CAPI_TOKEN
    };
    if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;
    const r = await fetch('https://graph.facebook.com/v21.0/' + PIXEL_ID + '/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('meta ' + r.status + ' ' + (await r.text()).slice(0, 150));
    return 'sent';
  } catch (e) {
    await sb('purchases?id=eq.' + purchase.id, { method: 'PATCH', body: { capi_sent_at: null, tracking_error: ('meta: ' + e.message).slice(0, 300) }, prefer: 'return=minimal' }).catch(() => {});
    return 'error';
  }
}

// Punto de entrada: dado un PaymentIntent ya recuperado de Stripe (con latest_charge expandido)
async function processPayment(intent, source) {
  if (!isPaid(intent)) return { paid: false };
  const { purchase, ctx, buyer } = await recordPurchase(intent, source);
  const delivery = await deliver(purchase, buyer);
  const ga4 = await trackGa4(purchase, ctx, intent);
  const meta = await trackMeta(purchase, ctx, buyer, intent);
  return { paid: true, purchaseId: purchase.id, delivery: delivery.status, ga4, meta };
}

module.exports = { processPayment, isPaid, deliver, recordPurchase };

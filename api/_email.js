// Plantillas y envío de emails (Resend). El prefijo _ evita que Vercel lo exponga como endpoint.
const SITE = 'https://www.cobratusayudas.es';
const FROM = 'Lucía de CobraTusAyudas <hola@cobratusayudas.es>';
const REPLY_TO = 'hola@cobratusayudas.es';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function ctaUrl(token, campaign) {
  return SITE + '/?lr=' + token + '&utm_source=email&utm_medium=lifecycle&utm_campaign=' + campaign;
}
function unsubUrl(token) { return SITE + '/api/unsubscribe?t=' + token; }

function pickAids(catalog, ids) {
  const byId = {}; catalog.forEach(a => { byId[a.id] = a; });
  const list = (ids || []).map(id => byId[id]).filter(Boolean);
  list.sort((a, b) => (b.importeMax || 0) - (a.importeMax || 0));
  return list;
}

function shell(preheader, inner, token) {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CobraTusAyudas</title></head>' +
    '<body style="margin:0;padding:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#0a0f1e;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f5f9;">' + esc(preheader) + '</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f9;"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">' +
    '<tr><td style="background:#0a0f1e;padding:18px 28px;"><span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">Cobra<span style="color:#00b894;">Tus</span>Ayudas</span></td></tr>' +
    '<tr><td style="padding:28px;">' + inner + '</td></tr>' +
    '<tr><td style="padding:18px 28px;background:#f8f9fc;font-size:12px;line-height:1.6;color:#6b7280;">' +
    'Recibes este email porque lo pediste en cobratusayudas.es al ver tus ayudas. ' +
    '<a href="' + unsubUrl(token) + '" style="color:#6b7280;text-decoration:underline;">Darme de baja</a> &middot; ' +
    '<a href="' + SITE + '" style="color:#6b7280;text-decoration:underline;">cobratusayudas.es</a><br>' +
    'Esta web es una guía informativa independiente, no es un organismo oficial. Los importes son orientativos y dependen de tu situación concreta.' +
    '</td></tr></table></td></tr></table></body></html>';
}

function button(url, label, micro) {
  return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 6px;"><tr><td align="center" style="background:#00b894;border-radius:12px;">' +
    '<a href="' + url + '" style="display:block;padding:20px 18px;font-size:18px;font-weight:800;color:#0a0f1e;text-decoration:none;text-align:center;">' + label + '</a></td></tr></table>' +
    (micro ? '<div style="text-align:center;font-size:12px;color:#6b7280;margin:0 0 14px;">' + micro + '</div>' : '');
}
const MICRO = '6&nbsp;&euro; &middot; pago &uacute;nico &middot; si te deniegan una ayuda, te devolvemos el dinero';

const OFFER_BOX = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0f1e;border-radius:12px;margin:8px 0 4px;"><tr><td style="padding:20px 22px;color:#ffffff;font-size:14px;line-height:1.6;">' +
  '<div style="font-size:16px;font-weight:800;margin-bottom:8px;">Guía de solicitud + asistencia por chat &middot; 6&nbsp;&euro;</div>' +
  '&#10003; Guía paso a paso de cada ayuda<br>&#10003; Documentos que necesitas en cada una<br>&#10003; Enlaces oficiales para solicitarlas<br>' +
  '&#10003; Asistencia personalizada por chat con <strong>Luc&iacute;a, nuestra asistente de inteligencia artificial</strong><br>' +
  '<span style="color:#9fb3c8;font-size:12px;">Pago &uacute;nico, sin suscripci&oacute;n &middot; Garant&iacute;a de devoluci&oacute;n de 90 d&iacute;as</span>' +
  '</td></tr></table>';

function listRows(aids, max) {
  return aids.slice(0, max).map(a =>
    '<tr><td style="padding:10px 0;border-bottom:1px solid #eef0f5;font-size:14px;line-height:1.4;"><strong>' + esc(a.nombre) + '</strong>' +
    (a.organismo ? '<br><span style="color:#6b7280;font-size:12px;">' + esc(a.organismo) + '</span>' : '') + '</td>' +
    '<td align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid #eef0f5;font-size:13px;font-weight:700;color:#00725a;max-width:200px;">' + esc(a.importe || '') + '</td></tr>'
  ).join('');
}

function build(step, lead, catalog) {
  const aids = pickAids(catalog, lead.aids);
  const n = aids.length;
  const top = aids[0];
  const tk = lead.unsub_token;
  if (step === 0) {
    const more = n > 5 ? '<p style="font-size:13px;color:#6b7280;margin:10px 0 0;">y ' + (n - 5) + ' ayudas m&aacute;s en tu lista completa.</p>' : '';
    const inner = '<h1 style="font-size:24px;line-height:1.25;margin:0 0 8px;">Tienes ' + n + ' ayudas por pedir</h1>' +
      '<p style="font-size:15px;line-height:1.6;margin:0;">' + (top ? 'La mayor: <strong>' + esc(top.nombre) + '</strong>' + (top.importe ? ' &mdash; <strong style="color:#00725a;">' + esc(top.importe) + '</strong>' : '') + '. ' : '') + 'Tener derecho no es cobrarla: hay que pedirla bien y a tiempo.</p>' +
      button(ctaUrl(tk, 'results_0'), 'Quiero que me ayuden a solicitarlas &rarr;', MICRO) +
      '<p style="font-size:14px;font-weight:700;margin:22px 0 4px;">Tu lista, de mayor a menor importe:</p>' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0">' + listRows(aids, 5) + '</table>' + more +
      button(ctaUrl(tk, 'results_0b'), 'Pedir mis ayudas ahora &rarr;', MICRO) + OFFER_BOX;
    return { subject: 'Tienes ' + n + ' ayudas por pedir: aquí está tu lista', html: shell('Tu lista completa y cómo pedirlas.', inner, tk),
      text: 'Tienes ' + n + ' ayudas por pedir.\n\nQuiero que me ayuden a solicitarlas: ' + ctaUrl(tk, 'results_0') + '\n\n' + aids.slice(0, 5).map(a => '- ' + a.nombre + (a.importe ? ' (' + a.importe + ')' : '')).join('\n') + '\n\nGuía + asistencia por chat con Lucía, nuestra asistente de IA: 6 €, pago único, garantía de devolución de 90 días si te deniegan una ayuda.\n\nDarme de baja: ' + unsubUrl(tk) };
  }
  if (step === 1) {
    const inner = '<h1 style="font-size:24px;line-height:1.25;margin:0 0 8px;">&iquest;Ya has pedido ' + (top ? esc(top.nombre) : 'tus ayudas') + '?</h1>' +
      (top ? '<p style="font-size:15px;line-height:1.6;margin:0;">Es la de mayor importe de tu lista: <strong style="color:#00725a;">' + esc(top.importe || '') + '</strong>.</p>' : '') +
      button(ctaUrl(tk, 'results_1'), 'Ver c&oacute;mo pedirla &rarr;', MICRO) +
      '<p style="font-size:15px;line-height:1.6;margin:18px 0 14px;">Lo que m&aacute;s frena no es tener derecho, sino no saber por d&oacute;nde empezar: qu&eacute; documentos llevar, en qu&eacute; web pedirla y qu&eacute; paso va primero. La gu&iacute;a te lo da ayuda por ayuda.</p>' +
      '<p style="font-size:15px;line-height:1.6;margin:0 0 14px;">Y si te surge una duda, se la preguntas en el chat a Luc&iacute;a, nuestra asistente de IA.</p>' + OFFER_BOX;
    return { subject: top ? ('¿Ya has pedido «' + top.nombre + '»?') : '¿Ya has pedido tus ayudas?', html: shell('Es la ayuda de mayor importe de tu lista.', inner, tk),
      text: '¿Ya has pedido ' + (top ? top.nombre : 'tus ayudas') + '?\n\nVer cómo pedirla: ' + ctaUrl(tk, 'results_1') + '\n\nGuía + chat con Lucía (asistente de IA): 6 €, garantía de devolución de 90 días si te deniegan una ayuda.\n\nDarme de baja: ' + unsubUrl(tk) };
  }
  const inner = '<h1 style="font-size:24px;line-height:1.25;margin:0 0 8px;">&Uacute;ltimo aviso: tu lista sigue guardada</h1>' +
    '<p style="font-size:15px;line-height:1.6;margin:0;">Tus ' + n + ' ayudas siguen esper&aacute;ndote. Y si solicitas una con la gu&iacute;a y te la deniegan, <strong>te devolvemos el dinero (90 d&iacute;as)</strong>.</p>' +
    button(ctaUrl(tk, 'results_2'), 'Recuperar mi lista y pedirlas &rarr;', MICRO) + OFFER_BOX +
    '<p style="font-size:13px;color:#6b7280;margin:14px 0 0;">Este es el &uacute;ltimo recordatorio que te enviamos.</p>';
  return { subject: 'Último aviso: tu lista de ayudas', html: shell('Tu lista sigue guardada.', inner, tk),
    text: 'Último aviso: tu lista de ' + n + ' ayudas sigue guardada.\n\nRecuperar mi lista: ' + ctaUrl(tk, 'results_2') + '\n\nSi te deniegan una ayuda solicitada con la guía, te devolvemos el dinero (90 días). La asistencia por chat es con Lucía, una IA.\n\nDarme de baja: ' + unsubUrl(tk) };
}

async function send(lead, mail) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [lead.email], reply_to: REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text,
      headers: { 'List-Unsubscribe': '<' + unsubUrl(lead.unsub_token) + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    })
  });
  const t = await r.text();
  if (!r.ok) throw new Error('resend ' + r.status + ' ' + t.slice(0, 200));
  return t;
}

module.exports = { build, send, unsubUrl };

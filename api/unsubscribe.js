// GET/POST /api/unsubscribe?t=TOKEN — baja de emails (también para el "one-click" de Gmail/Outlook)
const { sb } = require('./_lib');
const TOKEN_RE = /^[a-f0-9]{32}$/;

module.exports = async (req, res) => {
  const t = String((req.query && req.query.t) || '');
  let ok = false;
  try {
    if (TOKEN_RE.test(t)) {
      await sb('leads?unsub_token=eq.' + t, { method: 'PATCH', body: { unsubscribed_at: new Date().toISOString() } });
      ok = true;
    }
  } catch (e) { console.error('unsub error', e.message); }
  if (req.method === 'POST') return res.status(ok ? 200 : 400).end();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const msg = ok ? 'Listo, te hemos dado de baja. No recibirás más emails nuestros.' : 'El enlace de baja no es válido. Escríbenos a hola@cobratusayudas.es y lo hacemos nosotros.';
  return res.status(ok ? 200 : 400).send('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Baja de emails</title></head><body style="font-family:Arial,sans-serif;background:#f3f5f9;margin:0;padding:48px 16px;color:#0a0f1e;"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;text-align:center;"><h1 style="font-size:20px;margin:0 0 12px;">' + (ok ? 'Baja confirmada' : 'Enlace no válido') + '</h1><p style="font-size:15px;line-height:1.6;margin:0 0 20px;">' + msg + '</p><a href="https://www.cobratusayudas.es" style="color:#00725a;">Volver a cobratusayudas.es</a></div></body></html>');
};

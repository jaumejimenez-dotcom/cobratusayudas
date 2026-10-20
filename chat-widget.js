/* Lucía — asistente de CobraTusAyudas. Modo ventas (gratis) y modo pago (por ayuda). Sin dependencias. */
(function () {
  if (window.__luciaLoaded) return; window.__luciaLoaded = true;
  var MAX_SALES = 12;
  var mode = 'sales', curAid = null, curName = '', busy = false, opened = false;
  var salesHist = [], salesSent = 0, session = { paid: false }, convLoaded = {};
  function ev(n, p) { try { if (typeof gtag === 'function') gtag('event', n, p || {}); } catch (e) {} }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

  // Captura el payment_intent al volver de Stripe y pide el pase al servidor
  try { var pi = new URLSearchParams(location.search).get('payment_intent'); if (pi && pi.indexOf('pi_') === 0) ls('cta_pi', pi); } catch (e) {}
  function refreshSession() {
    return fetch('/api/session', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (s) {
      if (s.paid) { session = s; return s; }
      var saved = ls('cta_pi');
      if (!saved) { session = { paid: false }; return session; }
      return fetch('/api/pass?payment_intent=' + encodeURIComponent(saved), { credentials: 'same-origin' }).then(function (r) { return r.json(); })
        .then(function (d) { if (!d.paid) { session = { paid: false }; return session; } return fetch('/api/session', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (s2) { session = s2.paid ? s2 : { paid: false }; return session; }); });
    }).catch(function () { session = { paid: false }; return session; });
  }

  var SVGAV = '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><rect width="64" height="64" fill="#cfeee9"/><path d="M10 64c2-15 13-19 22-19s20 4 22 19z" fill="#0f766e"/><rect x="28" y="38" width="8" height="10" rx="3" fill="#e3a982"/><path d="M15 31c0-15 8-21 17-21s17 6 17 21c0 11 2 17-2 21H17c-4-4-2-10-2-21z" fill="#4a2c1d"/><ellipse cx="32" cy="31" rx="11" ry="13" fill="#f1c4a1"/><path d="M20 29c2-10 9-13 15-11 5 1 9 5 9 11-4-5-10-7-15-6-4 1-7 3-9 6z" fill="#4a2c1d"/><circle cx="27.5" cy="32" r="1.4" fill="#2b1b14"/><circle cx="36.5" cy="32" r="1.4" fill="#2b1b14"/><circle cx="24.5" cy="36" r="2.2" fill="#f0a08a" opacity=".45"/><circle cx="39.5" cy="36" r="2.2" fill="#f0a08a" opacity=".45"/><path d="M28 38.5q4 3.6 8 0" stroke="#b5533c" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var AV = '<img src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=112&h=112&fit=crop&crop=faces&q=80&fm=jpg" alt="" width="100%" height="100%" style="object-fit:cover;display:block">';
  var css = '#lu-btn{position:fixed;right:16px;bottom:16px;z-index:9998;background:#0f766e;color:#fff;border:0;border-radius:999px;padding:12px 18px 12px 12px;font:600 15px/1 system-ui,sans-serif;display:flex;align-items:center;gap:10px;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer}'
    + '#lu-btn .lu-av{width:32px;height:32px}'
    + '.lu-av{border-radius:50%;background:#fff;color:#0f766e;display:flex;align-items:center;justify-content:center;font-weight:700;flex:none;overflow:hidden}'
    + '#lu-panel{position:fixed;z-index:9999;right:0;bottom:0;width:100%;height:100dvh;max-height:100dvh;background:#fff;display:none;flex-direction:column;font:15px/1.4 system-ui,sans-serif;color:#1f2937}'
    + '#lu-panel.open{display:flex}'
    + '@media(min-width:640px){#lu-panel{right:16px;bottom:16px;width:380px;height:560px;max-height:calc(100dvh - 32px);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.3)}}'
    + '#lu-head{background:#0f766e;color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px}'
    + '#lu-head .lu-av{width:38px;height:38px;background:#fff}'
    + '#lu-head b{display:block;font-size:16px}#lu-head small{display:block;opacity:.9;font-size:11.5px}'
    + '#lu-x{margin-left:auto;background:none;border:0;color:#fff;font-size:26px;line-height:1;cursor:pointer;padding:4px 8px}'
    + '#lu-msgs{flex:1;overflow-y:auto;padding:14px;background:#f3f4f6;display:flex;flex-direction:column;gap:8px}'
    + '.lu-m{max-width:85%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}'
    + '.lu-b{background:#fff;align-self:flex-start;border-bottom-left-radius:4px}'
    + '.lu-u{background:#0f766e;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}'
    + '#lu-chips{display:flex;flex-wrap:wrap;gap:6px}'
    + '.lu-chip{background:#fff;border:1px solid #0f766e;color:#0f766e;border-radius:999px;padding:6px 12px;font-size:13.5px;cursor:pointer}'
    + '#lu-cta{background:#f59e0b;color:#111;border:0;margin:0 12px 8px;border-radius:10px;padding:11px;font:700 15px system-ui,sans-serif;cursor:pointer}'
    + '#lu-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e5e7eb;background:#fff}'
    + '#lu-in{flex:1;border:1px solid #d1d5db;border-radius:10px;padding:10px;font-size:16px;font-family:inherit}'
    + '#lu-send{background:#0f766e;color:#fff;border:0;border-radius:10px;padding:0 16px;font-weight:600;cursor:pointer}'
    + '#lu-send:disabled{opacity:.5}#lu-note{font-size:11px;color:#6b7280;text-align:center;padding:0 12px 8px}'
    + '#lu-tools{display:none;justify-content:space-between;gap:8px;padding:0 12px 6px;font-size:12px}'
    + '#lu-tools a,#lu-tools button{color:#0f766e;background:none;border:0;padding:2px 0;cursor:pointer;text-decoration:underline;font:inherit}'
    + '.lu-ask{display:inline-flex;align-items:center;gap:8px;margin-top:12px;background:#0f766e;color:#fff;border:0;border-radius:10px;padding:10px 14px;font:700 13.5px system-ui,sans-serif;cursor:pointer}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement('button'); btn.id = 'lu-btn'; btn.setAttribute('aria-label', 'Pregúntale a Lucía');
  btn.innerHTML = '<span class="lu-av">' + AV + '</span><span>Pregúntale a Lucía</span>';
  var p = document.createElement('div'); p.id = 'lu-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Chat con Lucía');
  p.innerHTML = '<div id="lu-head"><span class="lu-av">' + AV + '</span><div><b>Lucía</b><small id="lu-sub">Asistente con IA · revisa siempre la fuente oficial</small></div><button id="lu-x" aria-label="Cerrar">×</button></div>'
    + '<div id="lu-msgs"></div><button id="lu-cta">Hacer el test gratis (2 min)</button>'
    + '<div id="lu-tools"><a id="lu-human" href="#" target="_blank" rel="noopener">Hablar con una persona</a><button id="lu-del" type="button">Borrar mi conversación</button></div>'
    + '<form id="lu-form"><input id="lu-in" maxlength="500" placeholder="Escribe tu duda…" autocomplete="off"><button id="lu-send" type="submit">Enviar</button></form>'
    + '<div id="lu-note">No compartas DNI, IBAN ni datos de salud.</div>';
  document.body.appendChild(btn); document.body.appendChild(p);
  Array.prototype.forEach.call(document.querySelectorAll('.lu-av img'), function (im) { im.onerror = function () { this.parentNode.innerHTML = SVGAV; }; });
  var msgs = p.querySelector('#lu-msgs'), input = p.querySelector('#lu-in'), sendBtn = p.querySelector('#lu-send');
  var cta = p.querySelector('#lu-cta'), tools = p.querySelector('#lu-tools'), sub = p.querySelector('#lu-sub'), note = p.querySelector('#lu-note');

  function add(role, text) {
    var d = document.createElement('div'); d.className = 'lu-m ' + (role === 'user' ? 'lu-u' : 'lu-b'); d.textContent = text;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
  }
  function chips(list, onPick) {
    var c = document.createElement('div'); c.id = 'lu-chips';
    list.forEach(function (t) { var b = document.createElement('button'); b.type = 'button'; b.className = 'lu-chip'; b.textContent = t; b.onclick = function () { c.remove(); onPick(t); }; c.appendChild(b); });
    msgs.appendChild(c); msgs.scrollTop = msgs.scrollHeight;
  }
  function show() { p.classList.add('open'); btn.style.display = 'none'; setTimeout(function () { input.focus(); }, 50); }
  function close() { p.classList.remove('open'); if (!unlockedVisible()) btn.style.display = 'flex'; }
  function unlockedVisible() { var u = document.getElementById('page-unlocked'); return !!(u && u.offsetParent !== null && session.paid); }
  function lift() {
    var h = 0;
    ['sticky-cta', 'sticky-buy-bar'].forEach(function (id) { var e = document.getElementById(id); if (e && getComputedStyle(e).display !== 'none') h = Math.max(h, e.getBoundingClientRect().height); });
    btn.style.bottom = (h ? h + 12 : 16) + 'px';
  }
  setInterval(function () { lift(); if (!p.classList.contains('open')) btn.style.display = unlockedVisible() ? 'none' : 'flex'; }, 500);
  window.addEventListener('scroll', lift, { passive: true }); window.addEventListener('resize', lift);

  // ───────── Modo ventas ─────────
  function openSales() {
    mode = 'sales'; curAid = null; msgs.innerHTML = '';
    cta.style.display = ''; tools.style.display = 'none'; sub.textContent = 'Asistente con IA · revisa siempre la fuente oficial'; input.placeholder = 'Escribe tu duda…';
    add('bot', '¡Hola! Soy Lucía, la asistente con IA de CobraTusAyudas 😊 ¿Quieres saber a qué ayudas puedes tener derecho? El test dura 2 minutos y el listado es gratis.');
    salesHist.forEach(function (m) { add(m.role === 'user' ? 'user' : 'bot', m.content); });
    if (!salesHist.length) chips(['¿Cómo funciona?', '¿Cuánto cuesta?', '¿Qué ayudas hay?'], function (t) { sendSales(t); });
    if (!opened) { opened = true; ev('chat_opened', { mode: 'sales' }); }
    show();
  }
  btn.onclick = openSales;
  cta.onclick = function () { ev('chat_cta_click', { mode: 'sales' }); close(); try { if (typeof startQuiz === 'function') startQuiz(); } catch (e) {} };

  async function sendSales(text) {
    text = (text || '').trim(); if (!text || busy) return;
    if (salesSent >= MAX_SALES) { add('bot', 'Hemos hablado bastante por ahora. Haz el test gratis y verás qué ayudas te encajan 😊'); ev('chat_limit_reached', { mode: 'sales' }); return; }
    busy = true; sendBtn.disabled = true; salesSent++;
    add('user', text); salesHist.push({ role: 'user', content: text }); input.value = '';
    ev('chat_message_sent', { mode: 'sales', n: salesSent });
    var typing = add('bot', 'Lucía está escribiendo…');
    try {
      var r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: salesHist }) });
      var d = await r.json().catch(function () { return {}; });
      var reply = d.reply || 'Ahora mismo no puedo responder, inténtalo en un minuto 😊';
      typing.textContent = reply;
      if (r.ok) salesHist.push({ role: 'assistant', content: reply }); else { salesHist.pop(); salesSent--; }
    } catch (e) { typing.textContent = 'Ahora mismo no puedo responder, inténtalo en un minuto 😊'; salesHist.pop(); salesSent--; }
    busy = false; sendBtn.disabled = false; msgs.scrollTop = msgs.scrollHeight;
  }

  // ───────── Modo pago (una conversación por ayuda) ─────────
  function quiz() { try { return JSON.parse(ls('cta_respuestas') || '{}'); } catch (e) { return {}; } }
  function remainingNote(n) { if (typeof n === 'number') { session.remaining = n; note.textContent = n < 10 ? 'Te quedan ' + n + ' mensajes en tu acceso. No compartas DNI, IBAN ni datos de salud.' : 'No compartas DNI, IBAN ni datos de salud.'; } }
  async function openAid(id, name) {
    if (!session.paid) await refreshSession();
    if (!session.paid) { openSales(); add('bot', 'No encuentro tu acceso en este dispositivo. Si ya pagaste, escríbenos a hola@cobratusayudas.es 😊'); return; }
    mode = 'paid'; curAid = id; curName = name || 'esta ayuda'; msgs.innerHTML = '';
    cta.style.display = 'none'; tools.style.display = 'flex'; input.placeholder = 'Pregúntale a Lucía…';
    sub.textContent = 'Asistente con IA · ' + curName;
    var subj = encodeURIComponent('Ayuda con: ' + curName), bod = encodeURIComponent('Ref. compra: ' + (session.ref || '') + '\nAyuda: ' + curName + ' (' + id + ')\n\nMi duda:');
    p.querySelector('#lu-human').href = 'mailto:hola@cobratusayudas.es?subject=' + subj + '&body=' + bod;
    remainingNote(session.remaining);
    ev('chat_opened', { mode: 'paid', aid_id: id });
    show();
    var hist = [];
    try { var r = await fetch('/api/history?aid_id=' + encodeURIComponent(id), { credentials: 'same-origin' }); var d = await r.json(); hist = d.messages || []; } catch (e) {}
    if (curAid !== id) return;
    if (hist.length) { add('bot', '¡Hola otra vez! Soy Lucía, asistente con IA. Seguimos con ' + curName + ' 😊'); hist.forEach(function (m) { add(m.role === 'user' ? 'user' : 'bot', m.content); }); }
    else {
      add('bot', '¡Hola! Soy Lucía, el asistente con IA de CobraTusAyudas 😊 Te ayudo a solicitar: ' + curName + '. ¿Empezamos por los papeles que necesitas o tienes alguna duda concreta?');
      chips(['¿Qué papeles necesito?', 'Paso a paso', 'No tengo Cl@ve', '¿Hasta cuándo puedo pedirla?'], function (t) { sendPaid(t); });
    }
  }
  async function sendPaid(text) {
    text = (text || '').trim(); if (!text || busy) return;
    if (session.remaining === 0) { add('bot', 'Has llegado al máximo de mensajes de tu acceso. Escríbenos a hola@cobratusayudas.es 😊'); ev('chat_limit_reached', { mode: 'paid', aid_id: curAid }); return; }
    busy = true; sendBtn.disabled = true;
    add('user', text); input.value = '';
    ev('chat_message_sent', { mode: 'paid', aid_id: curAid });
    var typing = add('bot', 'Lucía está escribiendo…');
    try {
      var r = await fetch('/api/chat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aid_id: curAid, message: text, respuestas: quiz() }) });
      var d = await r.json().catch(function () { return {}; });
      typing.textContent = d.reply || 'Ahora mismo no puedo responder, inténtalo en un minuto 😊';
      if (r.ok) remainingNote(d.remaining);
      if (d.error === 'cap') { session.remaining = 0; ev('chat_limit_reached', { mode: 'paid', aid_id: curAid }); }
      if (d.error === 'no_pass') session = { paid: false };
    } catch (e) { typing.textContent = 'Ahora mismo no puedo responder, inténtalo en un minuto 😊'; }
    busy = false; sendBtn.disabled = false; msgs.scrollTop = msgs.scrollHeight;
  }
  p.querySelector('#lu-del').onclick = async function () {
    if (mode !== 'paid' || !curAid) return;
    if (!window.confirm('¿Borrar tu conversación sobre esta ayuda? No se puede deshacer.')) return;
    try { await fetch('/api/history?aid_id=' + encodeURIComponent(curAid), { method: 'DELETE', credentials: 'same-origin' }); } catch (e) {}
    openAid(curAid, curName);
  };

  p.querySelector('#lu-x').onclick = close;
  p.querySelector('#lu-form').onsubmit = function (e) { e.preventDefault(); if (mode === 'paid') sendPaid(input.value); else sendSales(input.value); };

  window.Lucia = {
    openAid: openAid,
    ask: function (el) { openAid(el.getAttribute('data-aid'), el.getAttribute('data-n')); }
  };
  refreshSession();
})();

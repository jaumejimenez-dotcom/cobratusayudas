/* Lucía — chat de ventas (modo gratuito). Sin dependencias. */
(function () {
  if (window.__luciaLoaded) return; window.__luciaLoaded = true;
  var MAX_USER_MSGS = 12, history = [], sent = 0, busy = false, opened = false;
  function ev(n, p) { try { if (typeof gtag === 'function') gtag('event', n, p || {}); } catch (e) {} }

  var css = '#lu-btn{position:fixed;right:16px;bottom:16px;z-index:9998;background:#0f766e;color:#fff;border:0;border-radius:999px;padding:12px 18px 12px 12px;font:600 15px/1 system-ui,sans-serif;display:flex;align-items:center;gap:10px;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer}'
    + '#lu-btn .lu-av{width:32px;height:32px}'
    + '.lu-av{border-radius:50%;background:#fff;color:#0f766e;display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}'
    + '#lu-panel{position:fixed;z-index:9999;right:0;bottom:0;width:100%;height:100dvh;max-height:100dvh;background:#fff;display:none;flex-direction:column;font:15px/1.4 system-ui,sans-serif;color:#1f2937}'
    + '#lu-panel.open{display:flex}'
    + '@media(min-width:640px){#lu-panel{right:16px;bottom:16px;width:380px;height:560px;max-height:calc(100dvh - 32px);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.3)}}'
    + '#lu-head{background:#0f766e;color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px}'
    + '#lu-head .lu-av{width:38px;height:38px;background:#fff}'
    + '#lu-head b{display:block;font-size:16px}#lu-head small{opacity:.9;font-size:11.5px}'
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
    + '#lu-send:disabled{opacity:.5}#lu-note{font-size:11px;color:#6b7280;text-align:center;padding:0 12px 8px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement('button'); btn.id = 'lu-btn'; btn.setAttribute('aria-label', 'Pregúntale a Lucía');
  btn.innerHTML = '<span class="lu-av">L</span><span>Pregúntale a Lucía</span>';
  var p = document.createElement('div'); p.id = 'lu-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Chat con Lucía');
  p.innerHTML = '<div id="lu-head"><span class="lu-av">L</span><div><b>Lucía</b><small>Asistente con IA · revisa siempre la fuente oficial</small></div><button id="lu-x" aria-label="Cerrar">×</button></div>'
    + '<div id="lu-msgs"></div><button id="lu-cta">Hacer el test gratis (2 min)</button>'
    + '<form id="lu-form"><input id="lu-in" maxlength="500" placeholder="Escribe tu duda…" autocomplete="off"><button id="lu-send" type="submit">Enviar</button></form>'
    + '<div id="lu-note">No compartas DNI, IBAN ni datos de salud.</div>';
  document.body.appendChild(btn); document.body.appendChild(p);
  var msgs = p.querySelector('#lu-msgs'), input = p.querySelector('#lu-in'), sendBtn = p.querySelector('#lu-send');

  function add(role, text) {
    var d = document.createElement('div'); d.className = 'lu-m ' + (role === 'user' ? 'lu-u' : 'lu-b'); d.textContent = text;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
  }
  function open() {
    p.classList.add('open'); btn.style.display = 'none';
    if (!opened) {
      opened = true; ev('chat_opened', { mode: 'sales' });
      add('bot', '¡Hola! Soy Lucía, la asistente con IA de CobraTusAyudas 😊 ¿Quieres saber a qué ayudas puedes tener derecho? El test dura 2 minutos y el listado es gratis.');
      var c = document.createElement('div'); c.id = 'lu-chips';
      ['¿Cómo funciona?', '¿Cuánto cuesta?', '¿Qué ayudas hay?'].forEach(function (t) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'lu-chip'; b.textContent = t;
        b.onclick = function () { c.remove(); send(t); }; c.appendChild(b);
      });
      msgs.appendChild(c);
    }
    setTimeout(function () { input.focus(); }, 50);
  }
  function close() { p.classList.remove('open'); btn.style.display = 'flex'; }
  btn.onclick = open; p.querySelector('#lu-x').onclick = close;
  p.querySelector('#lu-cta').onclick = function () {
    ev('chat_cta_click', { mode: 'sales' }); close();
    try { if (typeof startQuiz === 'function') startQuiz(); } catch (e) {}
  };

  async function send(text) {
    text = (text || '').trim(); if (!text || busy) return;
    if (sent >= MAX_USER_MSGS) { add('bot', 'Hemos hablado bastante por ahora. Haz el test gratis y verás qué ayudas te encajan 😊'); ev('chat_limit_reached', { mode: 'sales' }); return; }
    busy = true; sendBtn.disabled = true; sent++;
    add('user', text); history.push({ role: 'user', content: text }); input.value = '';
    ev('chat_message_sent', { mode: 'sales', n: sent });
    var typing = add('bot', 'Lucía está escribiendo…');
    try {
      var r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      var d = await r.json().catch(function () { return {}; });
      var reply = d.reply || 'Ahora mismo no puedo responder, inténtalo en un minuto 😊';
      typing.textContent = reply;
      if (r.ok) history.push({ role: 'assistant', content: reply }); else { history.pop(); sent--; }
    } catch (e) { typing.textContent = 'Ahora mismo no puedo responder, inténtalo en un minuto 😊'; history.pop(); sent--; }
    busy = false; sendBtn.disabled = false; msgs.scrollTop = msgs.scrollHeight;
  }
  p.querySelector('#lu-form').onsubmit = function (e) { e.preventDefault(); send(input.value); };
})();

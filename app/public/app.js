const $ = (s) => document.querySelector(s);
const main = $('#main'), msgs = $('#msgs'), input = $('#input'), box = $('#box'), list = $('#list'), chat = $('#chat');
let cur = null, busy = false;

const md = (t) => DOMPurify.sanitize(marked.parse(t || ''));
const scroll = () => (chat.scrollTop = chat.scrollHeight);

function setHas(v) { main.classList.toggle('has', v); }

async function loadList() {
  const rows = await (await fetch('/api/conversations')).json();
  list.innerHTML = '';
  for (const c of rows) {
    const d = document.createElement('div');
    d.className = 'conv' + (c.id === cur ? ' active' : '');
    d.innerHTML = '<span></span><b title="Delete">✕</b>';
    d.firstChild.textContent = c.title;
    d.onclick = () => open(c.id);
    d.querySelector('b').onclick = async (e) => {
      e.stopPropagation();
      await fetch('/api/conversations/' + c.id, { method: 'DELETE' });
      if (cur === c.id) newChat();
      loadList();
    };
    list.appendChild(d);
  }
  const v = document.createElement('div');
  v.className = 'viewall'; v.textContent = 'View all';
  list.appendChild(v);
}

function addMsg(role, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  if (role === 'user') d.textContent = text; else d.innerHTML = md(text);
  msgs.appendChild(d);
  return d;
}

async function open(id) {
  cur = id; msgs.innerHTML = '';
  const rows = await (await fetch(`/api/conversations/${id}/messages`)).json();
  rows.forEach((m) => addMsg(m.role, m.content));
  setHas(true); scroll(); loadList();
}

function newChat() { cur = null; msgs.innerHTML = ''; setHas(false); input.focus(); loadList(); }

async function send() {
  const text = input.value.trim();
  if (!text || busy) return;
  busy = true;
  if (!cur) cur = (await (await fetch('/api/conversations', { method: 'POST' })).json()).id;
  input.value = ''; input.style.height = ''; box.classList.remove('typing');
  setHas(true);
  addMsg('user', text);
  const a = addMsg('assistant', '');
  a.innerHTML = '<span class="dot"></span>';
  let acc = '', first = true, toolHost = null;
  scroll();
  try {
    const r = await fetch(`/api/conversations/${cur}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop();
      for (const p of parts) {
        if (!p.startsWith('data:')) continue;
        const e = JSON.parse(p.slice(5));
        if (e.title) loadList();
        if (e.delta) { if (first) { a.innerHTML = ''; first = false; } acc += e.delta; a.innerHTML = md(acc); }
        if (e.tool) {
          if (first) { a.innerHTML = ''; first = false; }
          const t = document.createElement('div'); t.className = 'tool';
          t.textContent = `🔧 ${e.tool}(${Object.values(e.args || {}).join(', ')}) → ${e.result}`;
          a.parentNode.insertBefore(t, a);
        }
        if (e.error) { a.innerHTML = `<span class="err"></span>`; a.firstChild.textContent = 'Error: ' + e.error; }
        scroll();
      }
    }
  } catch (e) { a.textContent = 'Error: ' + e.message; }
  busy = false; loadList(); input.focus();
}

input.addEventListener('input', () => {
  input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 220) + 'px';
  box.classList.toggle('typing', !!input.value.trim());
});
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
$('#send').onclick = send;
$('#new').onclick = newChat;

// title bar: menu + sidebar toggle
const menu = $('#menu');
$('#mbtn').onclick = (e) => { e.stopPropagation(); menu.classList.toggle('show'); };
document.addEventListener('click', () => menu.classList.remove('show'));
menu.onclick = (e) => {
  const a = e.target.closest('button')?.dataset.a;
  if (a === 'file') newChat();
  if (a === 'view') location.reload();
  if (a === 'go') history.back();
  if (a === 'help') alert('Claude Clone — local test build (Groq + PostgreSQL).');
};
$('#tog').onclick = () => {
  const s = $('#side'); s.classList.toggle('hide');
  document.body.style.setProperty('--tabx', s.classList.contains('hide') ? '170px' : '230px');
};
$('#back').onclick = () => history.back();

const hrs = new Date().getHours();
loadList();

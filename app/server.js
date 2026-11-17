const express = require('express');
const path = require('path');
const { Client } = require('pg');

const PG_PORT = 54329;
const HTTP_PORT = 3737;
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

const SYSTEM_PROMPT =
  'You are a helpful, concise assistant inside a desktop chat app. ' +
  'You have tools: get_current_time and calculate. Use them when useful. Format answers in Markdown.';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current local date and time of the user computer.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Evaluate a basic arithmetic expression, e.g. "(12+3)*4/5".',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string' } },
        required: ['expression'],
      },
    },
  },
];

function runTool(name, args) {
  if (name === 'get_current_time') return new Date().toString();
  if (name === 'calculate') {
    const expr = String(args.expression || '');
    if (!/^[0-9+\-*/().%\s^]+$/.test(expr)) return 'Error: unsupported characters';
    try {
      return String(Function(`"use strict"; return (${expr.replace(/\^/g, '**')})`)());
    } catch (e) {
      return 'Error: ' + e.message;
    }
  }
  return 'Unknown tool';
}

async function startServer() {
  const db = new Client({
    host: '127.0.0.1', port: PG_PORT, user: 'postgres', password: 'postgres', database: 'claudeclone',
  });
  await db.connect();
  await db.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL DEFAULT 'New chat',
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INT REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());`);

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/conversations', async (_req, res) => {
    res.json((await db.query('SELECT id,title,updated_at FROM conversations ORDER BY updated_at DESC')).rows);
  });
  app.post('/api/conversations', async (_req, res) => {
    res.json((await db.query('INSERT INTO conversations DEFAULT VALUES RETURNING id,title')).rows[0]);
  });
  app.delete('/api/conversations/:id', async (req, res) => {
    await db.query('DELETE FROM conversations WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  });
  app.get('/api/conversations/:id/messages', async (req, res) => {
    res.json((await db.query('SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY id', [req.params.id])).rows);
  });

  // Streaming chat with a simple tool-calling agent loop.
  app.post('/api/conversations/:id/chat', async (req, res) => {
    const id = Number(req.params.id);
    const text = String(req.body.message || '').trim();
    if (!text) return res.status(400).json({ error: 'empty' });
    const key = process.env.GROQ_API_KEY;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    try {
      if (!key) throw new Error('GROQ_API_KEY is not set');
      await db.query('INSERT INTO messages(conversation_id,role,content) VALUES($1,$2,$3)', [id, 'user', text]);
      const hist = (await db.query('SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY id', [id])).rows;
      if (hist.length === 1) {
        const title = text.length > 40 ? text.slice(0, 40) + '…' : text;
        await db.query('UPDATE conversations SET title=$1 WHERE id=$2', [title, id]);
        send({ title });
      }
      const msgs = [{ role: 'system', content: SYSTEM_PROMPT }, ...hist];
      let final = '';
      for (let round = 0; round < 5; round++) {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: MODEL, messages: msgs, tools: TOOLS, stream: true }),
        });
        if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const calls = {};
        let content = '';
        let buf = '';
        const dec = new TextDecoder();
        for await (const chunk of r.body) {
          buf += dec.decode(chunk, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const d = line.slice(5).trim();
            if (!d || d === '[DONE]') continue;
            const delta = JSON.parse(d).choices?.[0]?.delta || {};
            if (delta.content) { content += delta.content; send({ delta: delta.content }); }
            for (const tc of delta.tool_calls || []) {
              const c = (calls[tc.index] ||= { id: '', name: '', args: '' });
              if (tc.id) c.id = tc.id;
              if (tc.function?.name) c.name += tc.function.name;
              if (tc.function?.arguments) c.args += tc.function.arguments;
            }
          }
        }
        const list = Object.values(calls);
        if (!list.length) { final = content; break; }
        msgs.push({
          role: 'assistant', content: content || null,
          tool_calls: list.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })),
        });
        for (const c of list) {
          let args = {};
          try { args = JSON.parse(c.args || '{}'); } catch {}
          const result = runTool(c.name, args);
          send({ tool: c.name, args, result });
          msgs.push({ role: 'tool', tool_call_id: c.id, content: result });
        }
      }
      await db.query('INSERT INTO messages(conversation_id,role,content) VALUES($1,$2,$3)', [id, 'assistant', final]);
      await db.query('UPDATE conversations SET updated_at=now() WHERE id=$1', [id]);
      send({ done: true });
    } catch (e) {
      send({ error: e.message });
    }
    res.end();
  });

  // Bound to loopback only: reachable from this computer only.
  await new Promise((ok) => app.listen(HTTP_PORT, '127.0.0.1', ok));
  return `http://127.0.0.1:${HTTP_PORT}`;
}

module.exports = { startServer, PG_PORT };

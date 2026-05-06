// Vercel Serverless Function: CRUD for Command Centre chat history.
//
// All reads and writes go through this function using the Supabase service role
// key, so the key never reaches the browser and no anon RLS policies are needed.
//
// Environment variables (set in Vercel project settings):
//   SUPABASE_URL         - e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY - service role secret key
//
// Routes (method + query params / body):
//   GET  /api/chats              → all chats (id, agent_id, title, created_at, updated_at)
//   GET  /api/chats?id=<id>      → single chat including full messages []
//   POST /api/chats              → upsert { id, agent_id, title, messages[] }
//   DELETE /api/chats            → body { id }

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    return res.status(204).end();
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_KEY not configured' });
  }

  const base    = `${url}/rest/v1/cc_chats`;
  const headers = {
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { id } = req.query;

    // Single chat with messages
    if (id) {
      const r = await sbFetch(`${base}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { headers });
      if (!r.ok) return res.status(r.status).json(await r.json());
      const rows = await r.json();
      return res.status(200).json(rows[0] || null);
    }

    // All chats — metadata only (no messages column to keep payload small)
    const r = await sbFetch(`${base}?select=id,agent_id,title,created_at,updated_at&order=updated_at.desc`, { headers });
    if (!r.ok) return res.status(r.status).json(await r.json());
    return res.status(200).json(await r.json());
  }

  // ── POST (upsert) ────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
    const { id, agent_id, title, messages } = body || {};
    if (!id || !agent_id) return res.status(400).json({ error: 'id and agent_id required' });

    const r = await sbFetch(base, {
      method:  'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body:    JSON.stringify({ id, agent_id, title: title || null, messages: messages || [] }),
    });
    if (!r.ok) return res.status(r.status).json(await r.json().catch(() => ({})));
    return res.status(204).end();
  }

  // ── DELETE ───────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
    const { id } = body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    const r = await sbFetch(`${base}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers });
    if (!r.ok) return res.status(r.status).json(await r.json().catch(() => ({})));
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

async function sbFetch(url, opts) {
  try { return await fetch(url, opts); }
  catch (err) { return { ok: false, status: 502, json: async () => ({ error: err.message }) }; }
}

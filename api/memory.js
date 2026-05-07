// Vercel Serverless Function: CRUD for atlas_memory table.
//
// Agents and the Memory Manager UI read/write through this endpoint.
// The service role key stays server-side; the browser never sees it.
//
// Environment variables:
//   SUPABASE_URL              - e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY - service role secret (also accepts SUPABASE_SERVICE_KEY)
//
// Routes:
//   GET  /api/memory                          → list (params: category, priority, search, limit)
//   POST /api/memory                          → upsert { category, key, content, tags[], priority, source }
//   DELETE /api/memory                        → body { id }

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    return res.status(204).end();
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured' });
  }

  const base    = `${url}/rest/v1/atlas_memory`;
  const headers = {
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { category, priority, search, limit = '200' } = req.query;
    const params = new URLSearchParams({
      select: '*',
      order:  'priority.desc,updated_at.desc',
      limit,
    });
    if (category) params.set('category', `eq.${category}`);
    if (priority) params.set('priority', `gte.${priority}`);
    if (search)   params.set('content',  `ilike.*${search}*`);

    const r = await sbFetch(`${base}?${params}`, { headers });
    if (!r.ok) return res.status(r.status).json(await r.json());
    return res.status(200).json(await r.json());
  }

  // ── POST (upsert) ────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
    const { category, key: memKey, content, tags, priority, source, session_id, expires_at } = body || {};
    if (!category || !memKey || !content) {
      return res.status(400).json({ error: 'category, key, and content are required' });
    }

    const r = await sbFetch(base, {
      method:  'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body:    JSON.stringify({
        category,
        key:        memKey,
        content,
        tags:       tags       || [],
        priority:   priority   ?? 0,
        source:     source     || 'terminal',
        session_id: session_id || null,
        expires_at: expires_at || null,
      }),
    });
    if (!r.ok) return res.status(r.status).json(await r.json().catch(() => ({})));
    const data = await r.json();
    return res.status(200).json(Array.isArray(data) ? data[0] : data);
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

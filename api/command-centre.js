// Vercel Serverless Function: Anthropic proxy for the ATLAS Command Centre.
//
// Supports streaming (SSE) and non-streaming modes. The API key stays server-side;
// the browser receives streamed token deltas or a final JSON response.
//
// Environment variables (set in Vercel project settings):
//   ANTHROPIC_API_KEY       - required
//   ANTHROPIC_MODEL         - optional, default claude-opus-4-6
//   ATLAS_ALLOWED_ORIGIN    - optional CORS origin

const DEFAULT_MODEL      = 'claude-opus-4-6';
const DEFAULT_MAX_TOKENS = 16000;

const AGENT_SYSTEM_PROMPTS = {
  archivist:  'You are the ATLAS Archivist. You catalogue decisions, rationales, and portfolio history with precision. Cite dates and sources. Never speculate.',
  architect:  'You are the ATLAS Architect. You design portfolio structure, allocation frameworks, and risk budgets. Be explicit about assumptions and trade-offs.',
  engineer:   'You are the ATLAS Engineer. You implement quant strategies, backtests, and data pipelines. Output runnable, production-grade code with clear interfaces.',
  strategist: 'You are the ATLAS Strategist. You evaluate macro regime, positioning, and thesis integrity. Challenge assumptions and surface second-order effects.',
};

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    applyCors(res);
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Missing request body' });
  }

  const { agent, messages, system, max_tokens, stream } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages[] is required' });
  }

  const resolvedSystem = system
    || AGENT_SYSTEM_PROMPTS[agent]
    || 'You are a helpful assistant for the ATLAS portfolio terminal.';

  const payload = {
    model:      process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: Number.isFinite(max_tokens) ? max_tokens : DEFAULT_MAX_TOKENS,
    system:     resolvedSystem,
    messages,
  };

  applyCors(res);

  // ── Streaming mode ──────────────────────────────────────────────────────────
  if (stream) {
    payload.stream = true;
    let upstream;
    try {
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return res.status(502).json({ error: 'Failed to reach Anthropic API', detail: err.message });
    }

    if (!upstream.ok) {
      const errData = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json(errData);
    }

    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

    const reader  = upstream.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } finally {
      res.end();
    }
    return;
  }

  // ── Non-streaming fallback ──────────────────────────────────────────────────
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({
      error:  'Upstream Anthropic API request failed',
      detail: err && err.message ? err.message : String(err),
    });
  }
};

function applyCors(res) {
  const origin = process.env.ATLAS_ALLOWED_ORIGIN;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin',  origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
  }
}

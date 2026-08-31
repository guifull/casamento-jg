function allowedOrigins() {
  return String(process.env.RSVP_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, DELETE, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
}

function json(res, status, body) {
  return res.status(status).json(body);
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length <= 20_000) return JSON.parse(req.body);
  return {};
}

module.exports = { clientIp, json, readJson, setCors };


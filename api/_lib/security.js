const crypto = require('node:crypto');

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 13) digits = digits.slice(2);
  if (!/^\d{11}$/.test(digits)) return null;
  return digits;
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashValue(value, secret) {
  if (!secret) throw new Error('Segredo de hash não configurado');
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function encodePart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signSession(payload, secret, ttlSeconds = 15 * 60) {
  if (!secret) throw new Error('Segredo de sessão não configurado');
  const body = encodePart({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifySession(token, secret) {
  if (!secret || typeof token !== 'string') return null;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  let supplied;
  try {
    supplied = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { hashValue, normalizeName, normalizePhone, signSession, verifySession };


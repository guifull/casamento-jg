const { clientIp, json, readJson, setCors } = require('../_lib/http');
const { setAdminCookie } = require('../_lib/admin');
const { hashValue, safeEqual, signSession } = require('../_lib/security');
const { rpc } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Método não permitido.' });

  try {
    const rateKey = hashValue(`admin-login:${clientIp(req)}`, process.env.ADMIN_SESSION_SECRET);
    const allowed = await rpc('consume_rsvp_rate_limit', {
      p_key_hash: rateKey,
      p_limit: 5,
      p_window_seconds: 900,
    });
    if (allowed !== true) return json(res, 429, { ok: false, message: 'Aguarde alguns minutos e tente novamente.' });

    const body = await readJson(req);
    if (!process.env.ADMIN_PASSWORD || !safeEqual(body.password, process.env.ADMIN_PASSWORD)) {
      return json(res, 401, { ok: false, message: 'Senha inválida.' });
    }

    const token = signSession({ role: 'admin' }, process.env.ADMIN_SESSION_SECRET, 8 * 60 * 60);
    setAdminCookie(res, token);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('Admin login failed', { message: error.message, status: error.status });
    return json(res, 500, { ok: false, message: 'Não foi possível acessar o painel.' });
  }
};

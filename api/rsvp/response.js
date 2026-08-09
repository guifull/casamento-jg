const crypto = require('node:crypto');
const { json, readJson, setCors } = require('../_lib/http');
const { verifySession } = require('../_lib/security');
const { rpc } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PUT') return json(res, 405, { ok: false, message: 'Método não permitido.' });

  try {
    const auth = String(req.headers.authorization || '');
    const session = verifySession(auth.startsWith('Bearer ') ? auth.slice(7) : '', process.env.RSVP_SESSION_SECRET);
    if (!session?.invitationId) return json(res, 401, { ok: false, message: 'Sessão inválida ou expirada.' });

    const body = await readJson(req);
    if (!Array.isArray(body.responses) || body.responses.length < 1 || body.responses.length > 20) {
      return json(res, 400, { ok: false, message: 'Confirmação inválida.' });
    }
    const responses = body.responses.map((item) => ({
      guest_id: String(item.guestId || ''),
      attending: item.attending === true ? true : item.attending === false ? false : null,
    }));
    if (responses.some((item) => !/^[0-9a-f-]{36}$/i.test(item.guest_id) || item.attending === null)) {
      return json(res, 400, { ok: false, message: 'Confirmação inválida.' });
    }

    const requestId = String(req.headers['idempotency-key'] || crypto.randomUUID());
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      return json(res, 400, { ok: false, message: 'Identificador da confirmação inválido.' });
    }
    await rpc('submit_rsvp_response', {
      p_invitation_id: session.invitationId,
      p_items: responses,
      p_request_id: requestId,
    });
    return json(res, 200, { ok: true, message: 'Confirmação registrada com sucesso.' });
  } catch (error) {
    console.error('RSVP response failed', { message: error.message, status: error.status });
    return json(res, 500, { ok: false, message: 'Não foi possível registrar a confirmação.' });
  }
};


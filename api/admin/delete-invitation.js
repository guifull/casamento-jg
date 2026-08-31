const { adminSession } = require('../_lib/admin');
const { json, readJson, setCors } = require('../_lib/http');
const { supabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method !== 'DELETE') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  if (!adminSession(req)) return json(res, 401, { ok: false, message: 'Acesso não autorizado.' });

  try {
    const body = await readJson(req);
    const invitationId = String(body.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(invitationId)) {
      return json(res, 400, { ok: false, message: 'Convite inválido.' });
    }
    await supabase(`invitations?id=eq.${encodeURIComponent(invitationId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('Admin invitation delete failed', { message: error.message, status: error.status, details: error.details });
    return json(res, 500, { ok: false, message: 'Não foi possível excluir o convite.' });
  }
};

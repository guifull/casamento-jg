const { clearAdminCookie } = require('../_lib/admin');
const { json, setCors } = require('../_lib/http');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  clearAdminCookie(res);
  return json(res, 200, { ok: true });
};

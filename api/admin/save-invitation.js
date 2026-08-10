const { adminSession } = require('../_lib/admin');
const { json, readJson, setCors } = require('../_lib/http');
const { encryptPhone } = require('../_lib/phone-crypto');
const { hashValue, normalizePhone } = require('../_lib/security');
const { rpc } = require('../_lib/supabase');

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method !== 'POST' && req.method !== 'PUT') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  if (!adminSession(req)) return json(res, 401, { ok: false, message: 'Acesso não autorizado.' });
  try {
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    const displayName = cleanName(body.displayName);
    const guests = Array.isArray(body.guests) ? body.guests.map((guest, index) => ({
      id: guest.id ? String(guest.id) : '',
      name: cleanName(guest.name),
      type: index === 0 ? 'primary' : 'guest',
      displayOrder: index,
    })) : [];
    if (!phone || displayName.length < 2 || guests.length < 1 || guests.some((guest) => guest.name.length < 2)) {
      return json(res, 400, { ok: false, message: 'Preencha corretamente o convite, telefone e pessoas.' });
    }
    const invitationId = body.id ? String(body.id) : null;
    const savedId = await rpc('admin_save_invitation', {
      p_invitation_id: invitationId,
      p_display_name: displayName,
      p_phone_hash: hashValue(phone, process.env.PHONE_HASH_SECRET),
      p_phone_encrypted: encryptPhone(phone),
      p_guests: guests,
    });
    return json(res, 200, { ok: true, id: savedId });
  } catch (error) {
    console.error('Admin invitation save failed', { message: error.message, status: error.status, details: error.details });
    const duplicate = error.details?.code === '23505';
    return json(res, duplicate ? 409 : 500, { ok: false, message: duplicate ? 'Este telefone já pertence a outro convite.' : 'Não foi possível salvar o convite.' });
  }
};

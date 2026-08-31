const { adminSession } = require('../_lib/admin');
const { json, readJson, setCors } = require('../_lib/http');
const { supabase } = require('../_lib/supabase');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method !== 'DELETE') return json(res, 405, { ok: false, message: 'Metodo nao permitido.' });
  if (!adminSession(req)) return json(res, 401, { ok: false, message: 'Acesso nao autorizado.' });

  try {
    const body = await readJson(req);
    const invitationId = String(body.invitationId || '');
    const guestId = String(body.guestId || '');
    if (!UUID.test(invitationId) || !UUID.test(guestId)) {
      return json(res, 400, { ok: false, message: 'Pessoa ou convite invalido.' });
    }

    const select = encodeURIComponent('id,full_name,guest_type,display_order,active');
    const guests = await supabase(`guests?invitation_id=eq.${invitationId}&active=eq.true&select=${select}&order=display_order.asc`);
    const target = guests.find((guest) => guest.id === guestId);
    if (!target) return json(res, 404, { ok: false, message: 'Pessoa nao encontrada neste convite.' });

    const remaining = guests.filter((guest) => guest.id !== guestId);
    if (remaining.length === 0) {
      await supabase(`invitations?id=eq.${invitationId}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      return json(res, 200, { ok: true, invitationDeleted: true });
    }

    await supabase(`guests?id=eq.${guestId}&invitation_id=eq.${invitationId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
    });

    if (target.guest_type === 'primary') {
      const newPrimary = remaining[0];
      await supabase(`guests?id=eq.${newPrimary.id}&invitation_id=eq.${invitationId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ guest_type: 'primary', display_order: 0, updated_at: new Date().toISOString() }),
      });
      await supabase(`invitations?id=eq.${invitationId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ display_name: newPrimary.full_name, updated_at: new Date().toISOString() }),
      });
    }

    return json(res, 200, { ok: true, invitationDeleted: false });
  } catch (error) {
    console.error('Admin guest delete failed', { message: error.message, status: error.status, details: error.details });
    return json(res, 500, { ok: false, message: 'Nao foi possivel excluir a pessoa.' });
  }
};

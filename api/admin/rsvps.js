const { adminSession } = require('../_lib/admin');
const { json, setCors } = require('../_lib/http');
const { supabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method !== 'GET') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  if (!adminSession(req)) return json(res, 401, { ok: false, message: 'Acesso não autorizado.' });

  try {
    const select = encodeURIComponent('id,display_name,status,guests(id,full_name,guest_type,display_order,active,rsvp_responses(attending,responded_at,updated_at,revision_number))');
    const invitations = await supabase(`invitations?select=${select}&order=display_name.asc`);
    const rows = (invitations || []).map((invitation) => ({
      id: invitation.id,
      name: invitation.display_name,
      status: invitation.status,
      guests: (invitation.guests || [])
        .filter((guest) => guest.active)
        .sort((a, b) => a.display_order - b.display_order)
        .map((guest) => {
          const response = guest.rsvp_responses?.[0] || null;
          return {
            id: guest.id,
            name: guest.full_name,
            type: guest.guest_type,
            attending: response ? response.attending : null,
            updatedAt: response?.updated_at || null,
            revision: response?.revision_number || 0,
          };
        }),
    }));
    const guests = rows.flatMap((invitation) => invitation.guests);
    return json(res, 200, {
      ok: true,
      summary: {
        invitations: rows.length,
        guests: guests.length,
        attending: guests.filter((guest) => guest.attending === true).length,
        declined: guests.filter((guest) => guest.attending === false).length,
        pending: guests.filter((guest) => guest.attending === null).length,
      },
      invitations: rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin RSVP list failed', { message: error.message, status: error.status });
    return json(res, 500, { ok: false, message: 'Não foi possível carregar as confirmações.' });
  }
};

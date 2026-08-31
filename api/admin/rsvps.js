const { adminSession } = require('../_lib/admin');
const { json, setCors } = require('../_lib/http');
const { supabase } = require('../_lib/supabase');
const { decryptPhone } = require('../_lib/phone-crypto');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method !== 'GET') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  if (!adminSession(req)) return json(res, 401, { ok: false, message: 'Acesso não autorizado.' });

  try {
    // Fetch each table independently. Deep PostgREST embeds can omit a related
    // response when relationship metadata changes or becomes ambiguous.
    const invitationSelect = encodeURIComponent('id,display_name,status,invitation_contacts(id,phone_encrypted,is_primary)');
    const guestSelect = encodeURIComponent('id,invitation_id,full_name,guest_type,display_order,active');
    const responseSelect = encodeURIComponent('guest_id,attending,responded_at,updated_at,revision_number');
    const [invitations, activeGuests, responses] = await Promise.all([
      supabase(`invitations?select=${invitationSelect}&order=display_name.asc`),
      supabase(`guests?select=${guestSelect}&active=eq.true&order=display_order.asc`),
      supabase(`rsvp_responses?select=${responseSelect}`),
    ]);

    const guestsByInvitation = new Map();
    for (const guest of activeGuests || []) {
      const invitationGuests = guestsByInvitation.get(guest.invitation_id) || [];
      invitationGuests.push(guest);
      guestsByInvitation.set(guest.invitation_id, invitationGuests);
    }

    const responseByGuest = new Map(
      (responses || []).map((response) => [response.guest_id, response]),
    );
    const rows = (invitations || []).map((invitation) => ({
      id: invitation.id,
      name: invitation.display_name,
      status: invitation.status,
      phone: decryptPhone((invitation.invitation_contacts || []).find((contact) => contact.is_primary)?.phone_encrypted),
      guests: (guestsByInvitation.get(invitation.id) || [])
        .sort((a, b) => a.display_order - b.display_order)
        .map((guest) => {
          const response = responseByGuest.get(guest.id) || null;
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

const { clientIp, json, readJson, setCors } = require('../_lib/http');
const { hashValue, normalizeName, normalizePhone, signSession } = require('../_lib/security');
const { rpc, supabase } = require('../_lib/supabase');
const { verifyTurnstile } = require('../_lib/turnstile');

const GENERIC_ERROR = 'Não foi possível validar os dados informados.';

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Método não permitido.' });

  try {
    const body = await readJson(req);
    const name = normalizeName(body.name);
    const phone = normalizePhone(body.phone);
    const ip = clientIp(req);
    if (name.length < 3 || !phone) return json(res, 400, { ok: false, message: GENERIC_ERROR });
    if (!(await verifyTurnstile(body.turnstileToken, ip))) {
      return json(res, 400, { ok: false, message: GENERIC_ERROR });
    }

    const ipHash = hashValue(ip, process.env.PHONE_HASH_SECRET);
    const phoneHash = hashValue(phone, process.env.PHONE_HASH_SECRET);
    const rate = await rpc('consume_rsvp_rate_limit', { p_key_hash: ipHash, p_limit: 8, p_window_seconds: 900 });
    if (rate !== true) return json(res, 429, { ok: false, message: 'Aguarde alguns minutos e tente novamente.' });

    const select = encodeURIComponent('invitation_id,invitation:invitations(id,display_name,status,guests(id,full_name,guest_type,display_order,active,rsvp_responses(attending,responded_at,updated_at)))');
    const rows = await supabase(`invitation_contacts?phone_hash=eq.${phoneHash}&select=${select}&limit=1`);
    const invitation = rows?.[0]?.invitation;
    const guests = (invitation?.guests || []).filter((guest) => guest.active);
    const nameMatches = guests.some((guest) => {
      const registered = normalizeName(guest.full_name);
      return registered === name || registered.includes(name) || name.includes(registered);
    });
    if (!invitation || invitation.status !== 'active' || !nameMatches) {
      return json(res, 404, { ok: false, message: GENERIC_ERROR });
    }

    const sessionToken = signSession({ invitationId: invitation.id }, process.env.RSVP_SESSION_SECRET);
    return json(res, 200, {
      ok: true,
      invitation: {
        displayName: invitation.display_name,
        guests: guests
          .sort((a, b) => a.display_order - b.display_order)
          .map((guest) => ({
            id: guest.id,
            name: guest.full_name,
            type: guest.guest_type,
            response: guest.rsvp_responses?.[0] || null,
          })),
      },
      sessionToken,
    });
  } catch (error) {
    console.error('RSVP lookup failed', { message: error.message, status: error.status });
    return json(res, 500, { ok: false, message: 'Serviço temporariamente indisponível.' });
  }
};


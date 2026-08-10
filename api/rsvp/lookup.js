const { clientIp, json, readJson, setCors } = require('../_lib/http');
const { hashValue, normalizePhone, signSession } = require('../_lib/security');
const { rpc, supabase } = require('../_lib/supabase');
const { verifyTurnstile } = require('../_lib/turnstile');

const GENERIC_ERROR = 'Não foi possível validar os dados informados.';

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Método não permitido.' });

  try {
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    const ip = clientIp(req);
    if (!phone) return json(res, 400, { ok: false, message: GENERIC_ERROR });
    if (!(await verifyTurnstile(body.turnstileToken, ip))) {
      return json(res, 400, { ok: false, message: GENERIC_ERROR });
    }

    const ipHash = hashValue(`rate:ip:${ip}`, process.env.PHONE_HASH_SECRET);
    const phoneHash = hashValue(phone, process.env.PHONE_HASH_SECRET);
    const phoneRateHash = hashValue(`rate:phone:${phone}`, process.env.PHONE_HASH_SECRET);
    const [ipAllowed, phoneAllowed] = await Promise.all([
      rpc('consume_rsvp_rate_limit', { p_key_hash: ipHash, p_limit: 8, p_window_seconds: 900 }),
      rpc('consume_rsvp_rate_limit', { p_key_hash: phoneRateHash, p_limit: 5, p_window_seconds: 900 }),
    ]);
    if (ipAllowed !== true || phoneAllowed !== true) {
      return json(res, 429, { ok: false, message: 'Aguarde alguns minutos e tente novamente.' });
    }

    const select = encodeURIComponent('invitation_id,invitation:invitations(id,display_name,status,guests(id,full_name,guest_type,display_order,active,rsvp_responses(attending,responded_at,updated_at)))');
    const rows = await supabase(`invitation_contacts?phone_hash=eq.${phoneHash}&select=${select}&limit=1`);
    const invitation = rows?.[0]?.invitation;
    const guests = (invitation?.guests || []).filter((guest) => guest.active);
    if (!invitation || invitation.status !== 'active') {
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

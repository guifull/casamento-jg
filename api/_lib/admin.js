const { verifySession } = require('./security');

const COOKIE_NAME = 'jg_admin';

function cookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((item) => item.trim().split('='))
    .reduce((result, [key, ...value]) => {
      if (key) result[key] = decodeURIComponent(value.join('='));
      return result;
    }, {});
}

function adminSession(req) {
  const token = cookies(req)[COOKIE_NAME];
  const session = verifySession(token, process.env.ADMIN_SESSION_SECRET);
  return session?.role === 'admin' ? session : null;
}

function setAdminCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
}

function clearAdminCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

module.exports = { adminSession, clearAdminCookie, setAdminCookie };

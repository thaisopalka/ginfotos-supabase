import crypto from 'node:crypto';

const COOKIE_NAME = 'ginfotos_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  return String(process.env.APP_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  const key = secret();
  if (!key) throw new Error('APP_SESSION_SECRET ausente no servidor.');
  return crypto.createHmac('sha256', key).update(value).digest('base64url');
}

function parseCookies(req) {
  const raw = String(req.headers?.cookie || '');
  const result = {};
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function createSessionToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    email: String(user?.email || '').toLowerCase(),
    name: String(user?.name || ''),
    role: String(user?.role || 'consulta'),
    status: String(user?.status || 'ATIVO'),
    iat: now,
    exp: now + MAX_AGE_SECONDS
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token) {
  try {
    const [encoded, signature] = String(token || '').split('.');
    if (!encoded || !signature) return null;
    const expected = sign(encoded);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.email || payload.status !== 'ATIVO' || Number(payload.exp || 0) <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, user) {
  const token = createSessionToken(user);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`);
  return token;
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function getSessionUser(req) {
  const auth = String(req.headers?.authorization || '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const cookieToken = parseCookies(req)[COOKIE_NAME] || '';
  return verifySessionToken(bearer || cookieToken);
}

export function requireSession(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sessão expirada ou inválida. Entre novamente no GINFOTOS.' });
    return null;
  }
  return user;
}

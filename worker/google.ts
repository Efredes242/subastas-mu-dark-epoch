import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env, FilaUsuario } from './types';
import type { Variables } from './auth';

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

const COOKIE_ESTADO = 'sk_oauth';
const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';

export const googleConfigurado = (env: Env): boolean =>
  !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;

const redireccion = (c: Ctx) => new URL('/api/auth/google/callback', c.req.url).toString();

/** Paso 1: mandamos al usuario a Google con un `state` que después tiene que volver igual. */
export function empezarLoginGoogle(c: Ctx): Response {
  const estado = crypto.randomUUID();

  setCookie(c, COOKIE_ESTADO, estado, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
    secure: new URL(c.req.url).protocol === 'https:',
  });

  const url = new URL(AUTORIZAR);
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set('redirect_uri', redireccion(c));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', estado);
  // Que elija cuenta: en una PC compartida del gremio esto evita entrar con la del anterior.
  url.searchParams.set('prompt', 'select_account');

  return c.redirect(url.toString(), 302);
}

interface PerfilGoogle {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nombre: string;
  avatar: string | null;
}

/** El id_token viene por TLS directo del endpoint de token de Google, así que alcanza con leerlo. */
function leerIdToken(idToken: string): PerfilGoogle | null {
  const partes = idToken.split('.');
  if (partes.length !== 3) return null;
  try {
    const relleno = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(relleno.padEnd(Math.ceil(relleno.length / 4) * 4, '=')), (ch) => ch.charCodeAt(0)),
      ),
    );
    if (typeof json.sub !== 'string' || typeof json.email !== 'string') return null;
    return {
      sub: json.sub,
      email: String(json.email).toLowerCase(),
      emailVerificado: json.email_verified === true || json.email_verified === 'true',
      nombre: typeof json.name === 'string' ? json.name : '',
      avatar: typeof json.picture === 'string' ? json.picture : null,
    };
  } catch {
    return null;
  }
}

export type ResultadoGoogle =
  | { ok: true; usuario: FilaUsuario }
  | { ok: false; motivo: 'state' | 'codigo' | 'token' | 'sin-verificar' | 'sin-cuenta'; email?: string };

/**
 * Paso 2: canjeamos el código por el perfil y buscamos a esa persona en el gremio.
 * No damos de alta a nadie automáticamente: la cuenta la tiene que crear el admin.
 */
export async function terminarLoginGoogle(c: Ctx): Promise<ResultadoGoogle> {
  const esperado = getCookie(c, COOKIE_ESTADO);
  deleteCookie(c, COOKIE_ESTADO, { path: '/' });

  const recibido = c.req.query('state');
  if (!esperado || !recibido || esperado !== recibido) return { ok: false, motivo: 'state' };

  const codigo = c.req.query('code');
  if (!codigo) return { ok: false, motivo: 'codigo' };

  const respuesta = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: codigo,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redireccion(c),
      grant_type: 'authorization_code',
    }),
  });

  if (!respuesta.ok) return { ok: false, motivo: 'token' };

  const datos = (await respuesta.json().catch(() => null)) as { id_token?: string } | null;
  const perfil = datos?.id_token ? leerIdToken(datos.id_token) : null;
  if (!perfil) return { ok: false, motivo: 'token' };
  if (!perfil.emailVerificado) return { ok: false, motivo: 'sin-verificar', email: perfil.email };

  // Primero por google_sub (ya entró antes), después por email (el admin lo dio de alta).
  let usuario = await c.env.DB.prepare('SELECT * FROM usuarios WHERE google_sub = ? AND activo = 1')
    .bind(perfil.sub)
    .first<FilaUsuario>();

  if (!usuario) {
    usuario = await c.env.DB.prepare('SELECT * FROM usuarios WHERE lower(email) = ? AND activo = 1')
      .bind(perfil.email)
      .first<FilaUsuario>();
    if (!usuario) return { ok: false, motivo: 'sin-cuenta', email: perfil.email };

    await c.env.DB.prepare('UPDATE usuarios SET google_sub = ? WHERE id = ?').bind(perfil.sub, usuario.id).run();
  }

  // La foto puede cambiar; la refrescamos en cada entrada.
  if (perfil.avatar && perfil.avatar !== usuario.avatar) {
    await c.env.DB.prepare('UPDATE usuarios SET avatar = ? WHERE id = ?').bind(perfil.avatar, usuario.id).run();
    usuario.avatar = perfil.avatar;
  }

  return { ok: true, usuario };
}

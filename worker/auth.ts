import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { puedeCargar, type Env, type FilaUsuario } from './types';

export type Variables = { usuario: FilaUsuario | null };
/** El contexto de Hono ya tipado, para no repetirlo en cada firma. */
type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

const ITERACIONES = 100_000;
const COOKIE = 'sk_sesion';
const DURACION_DIAS = 30;

const b64 = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
};

const desdeB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derivar(password: string, salt: Uint8Array): Promise<string> {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERACIONES, hash: 'SHA-256' },
    clave,
    256,
  );
  return b64(bits);
}

/** Formato: pbkdf2$<iteraciones>$<salt b64>$<hash b64> — el mismo que usa scripts/seed-admin.mjs. */
export async function hashearPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERACIONES}$${b64(salt)}$${await derivar(password, salt)}`;
}

export async function verificarPassword(password: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') return false;
  const salt = desdeB64(partes[2]);
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: Number(partes[1]), hash: 'SHA-256' },
    clave,
    256,
  );
  return comparacionConstante(b64(bits), partes[3]);
}

/** Comparar sin filtrar por tiempo cuantos caracteres coinciden. */
function comparacionConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function firmar(datos: string, secreto: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(datos)));
}

export async function crearSesion(c: Ctx, usuarioId: number): Promise<void> {
  const vence = Date.now() + DURACION_DIAS * 24 * 60 * 60 * 1000;
  const cuerpo = b64(new TextEncoder().encode(JSON.stringify({ uid: usuarioId, exp: vence })));
  const token = `${cuerpo}.${await firmar(cuerpo, c.env.SESSION_SECRET)}`;
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: DURACION_DIAS * 24 * 60 * 60,
    secure: new URL(c.req.url).protocol === 'https:',
  });
}

export function cerrarSesion(c: Ctx): void {
  deleteCookie(c, COOKIE, { path: '/' });
}

async function usuarioDeLaCookie(c: Ctx): Promise<FilaUsuario | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const corte = token.lastIndexOf('.');
  if (corte < 1) return null;

  const cuerpo = token.slice(0, corte);
  const firma = token.slice(corte + 1);
  if (!comparacionConstante(await firmar(cuerpo, c.env.SESSION_SECRET), firma)) return null;

  let datos: { uid?: unknown; exp?: unknown };
  try {
    datos = JSON.parse(new TextDecoder().decode(desdeB64(cuerpo)));
  } catch {
    return null;
  }
  if (typeof datos.uid !== 'number' || typeof datos.exp !== 'number' || datos.exp < Date.now()) return null;

  return c.env.DB.prepare('SELECT * FROM usuarios WHERE id = ? AND activo = 1')
    .bind(datos.uid)
    .first<FilaUsuario>();
}



/** Deja el usuario (o null) en el contexto. No bloquea: las rutas publicas tambien lo usan. */
export const cargarUsuario: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  c.set('usuario', await usuarioDeLaCookie(c));
  await next();
};

export const requiereSesion: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  if (!c.get('usuario')) return c.json({ error: 'Necesitás iniciar sesión.' }, 401);
  await next();
};

/** El admin y el segundo al mando: los dos pueden cargar items y repartir. */
export const requiereGrandMaster: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const usuario = c.get('usuario');
  if (!usuario) return c.json({ error: 'Necesitás iniciar sesión.' }, 401);
  if (!puedeCargar(usuario.rol)) return c.json({ error: 'Esto lo hacen el admin o el Grand Master.' }, 403);
  await next();
};

export const requiereAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const usuario = c.get('usuario');
  if (!usuario) return c.json({ error: 'Necesitás iniciar sesión.' }, 401);
  if (usuario.rol !== 'admin') return c.json({ error: 'Esto lo hace solo el admin.' }, 403);
  await next();
};

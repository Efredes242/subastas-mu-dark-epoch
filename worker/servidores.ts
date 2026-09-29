import type { Env } from './types';

/**
 * Los servidores del juego, cada uno con su gremio y su grupo.
 *
 * Solo los avisos están separados por servidor. El reparto de drops sigue siendo de uno solo: lo
 * que hoy se duplica es lo que se anuncia, no cómo se reparte, y partir la app entera por eso
 * sería pagar mucho por poco.
 */

export interface Servidor {
  id: number;
  nombre: string;
  /** El grupo de Telegram a donde manda. */
  chat: string;
  /** Cómo se llama ese grupo, para no mostrar un número pelado. */
  chatNombre: string;
  /** Si sus avisos salen de verdad. */
  activo: boolean;
  /** Con qué bot manda: el nombre del secreto del Worker, no el token. */
  token: string;
  /** Su huso horario, en horas contra UTC. */
  offset: number;
}

export interface FilaServidor {
  id: number;
  nombre: string;
  orden: number;
  telegram_chat: string;
  telegram_nombre: string;
  telegram_activo: number;
  token: string;
  offset_horas: number;
}

/**
 * Los secretos del Worker que pueden llevar un token de bot.
 *
 * Es una lista cerrada y no un nombre libre a propósito: la columna la escribe el panel, y sin la
 * lista alguien con acceso al panel podría hacer que el Worker leyera cualquier variable de
 * entorno suya y la usara como token — o averiguar cuáles existen probando.
 */
export const TOKENS = ['TELEGRAM_TOKEN', 'TELEGRAM_TOKEN_2', 'TELEGRAM_TOKEN_3'] as const;
export type NombreDeToken = (typeof TOKENS)[number];

const esToken = (x: unknown): x is NombreDeToken => TOKENS.includes(x as NombreDeToken);

export const comoServidor = (f: FilaServidor): Servidor => ({
  id: f.id,
  nombre: f.nombre,
  chat: f.telegram_chat ?? '',
  chatNombre: f.telegram_nombre ?? '',
  activo: (f.telegram_activo ?? 0) === 1,
  token: esToken(f.token) ? f.token : 'TELEGRAM_TOKEN',
  offset: f.offset_horas ?? -3,
});

/** El token del bot de este servidor, si está cargado. */
export const tokenDe = (env: Env, s: Servidor): string | undefined =>
  (env as unknown as Record<string, string | undefined>)[s.token];

/** Qué tokens tiene cargados el Worker. Sirve para que el panel ofrezca solo los que andan. */
export const tokensCargados = (env: Env): NombreDeToken[] =>
  TOKENS.filter((t) => !!(env as unknown as Record<string, string | undefined>)[t]);

export async function leerServidores(db: D1Database): Promise<Servidor[]> {
  const { results } = await db
    .prepare('SELECT * FROM servidores ORDER BY orden, id')
    .all<FilaServidor>();
  return results.map(comoServidor);
}

/** Lo que llega del panel, limpio. */
export function leerServidor(crudo: unknown) {
  const x = (crudo ?? {}) as Record<string, unknown>;
  const nombre = typeof x.nombre === 'string' ? x.nombre.trim().slice(0, 40) : '';
  if (nombre.length < 1) return null;

  const offset = Number(x.offset);

  return {
    nombre,
    token: esToken(x.token) ? x.token : 'TELEGRAM_TOKEN',
    // De UTC-12 a UTC+14, que es todo lo que existe.
    offset: Number.isInteger(offset) && offset >= -12 && offset <= 14 ? offset : -3,
  };
}
